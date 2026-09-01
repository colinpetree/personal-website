import ast
import base64
import binascii
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from functools import wraps

from dateutil.relativedelta import relativedelta
from anthropic import Anthropic
import voyageai
from flask import Blueprint, Response, abort, current_app, jsonify, request, send_from_directory, stream_with_context
from flask_login import current_user

from extensions import db
from models import AiDemoAccessLink, SiteConfig
from crypto import decrypt
from email_utils import send_email, mail_configured
from routes.auth import user_required, get_current_user
import mcp_runtime
import rag_index

ai_demo_bp = Blueprint('ai_demo', __name__)

DEMO_TITLES = {
    'conversation-basics': 'Conversation basics',
    'tool-use': 'Tool use',
    'web-search': 'Web search',
    'mcp': 'MCP',
    'prompt-evaluation': 'Prompt evaluation',
    'prompt-engineering': 'Prompt engineering',
    'rag': 'RAG / hybrid search',
    'vision': 'Vision',
}


def _stream_response(generator, mimetype):
    # X-Accel-Buffering: no tells nginx not to buffer this response before
    # forwarding it to the client. Without it, nginx's proxy_buffering (on by
    # default) collects the whole upstream response into buffers and only
    # flushes in bursts, which on a slow/complex demo answer shows up as a
    # long pause followed by a sudden jump of text — confirmed by nginx
    # holding text/plain and application/json (both in gzip_types) through
    # its gzip filter too, which flushes on its own buffer-fill schedule.
    return Response(stream_with_context(generator), mimetype=mimetype, headers={'X-Accel-Buffering': 'no'})


def _has_demo_access():
    if current_user.is_authenticated:  # admin/staff always allowed
        return True
    user = get_current_user()
    return bool(user and user.ai_demo_access)


def ai_demo_access_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _has_demo_access():
            return jsonify({'error': 'access_required'}), 403
        return f(*args, **kwargs)
    return decorated


def _ai_demo_page_enabled():
    config = SiteConfig.query.first()
    return bool(config and config.ai_demo_enabled and current_app.config['ENABLE_AI_DEMOS'])


def ai_demo_page_enabled_required(f):
    # A disabled AI demo page must be indistinguishable from one that never
    # existed — every route here 404s the same way once the admin has
    # turned the page off, rather than staying reachable by direct API call
    # (the frontend route already 404s too, see AIDemoPage.jsx and each
    # ai-demos/*.jsx page's own nav-enabled check).
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _ai_demo_page_enabled():
            abort(404)
        return f(*args, **kwargs)
    return decorated


@ai_demo_bp.route('/api/ai-demo/access-links')
@ai_demo_page_enabled_required
def list_access_links():
    return jsonify({l.demo_key: {'url': l.url, 'text': l.text} for l in AiDemoAccessLink.query.all()})


@ai_demo_bp.route('/api/ai-demo/request-access', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
def request_demo_access():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    # Each account can only trigger one notification email, ever - a repeat click (e.g.
    # after closing and reopening the modal before the admin has acted) is a no-op that
    # still reports success, so the frontend doesn't need a separate "already requested"
    # state to handle.
    if user.ai_demo_access_requested_at:
        return jsonify({'message': 'Request already sent.'})

    config = SiteConfig.query.first()
    if not (config and mail_configured(config) and config.forward_email):
        return jsonify({'error': 'Access requests are not available.'}), 503

    data = request.get_json(silent=True) or {}
    demo_key = data.get('demo_key')
    demo_title = DEMO_TITLES.get(demo_key, demo_key or 'an AI demo')

    body = f"{user.name} <{user.email}> is requesting access to the \"{demo_title}\" AI demo."

    try:
        send_email(config, config.forward_email, 'AI Demo Access Request', body, 'AI Demo', decrypt(config.mailgun_api_key))
    except Exception:
        return jsonify({'error': 'Failed to send request. Please try again later.'}), 500

    user.ai_demo_access_requested_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'message': 'Request sent.'})

MODEL = 'claude-sonnet-5'
MCP_MODEL = 'claude-haiku-4-5-20251001'
MAX_TOKENS = 1024
MAX_MESSAGES = 40
MAX_MESSAGE_CHARS = 4000
MAX_SYSTEM_CHARS = 2000
MAX_TOOL_ITERATIONS = 6
MAX_RAG_QUERY_CHARS = 500
RAG_RESULT_K = 3
RAG_EMBED_MODEL = 'voyage-3-large'
RAG_EMBEDDING_PREVIEW_DIMS = 8

TOOL_USE_SYSTEM_PROMPT = (
    'You are a helpful assistant with access to date/time and reminder tools. '
    'Use them whenever a question depends on the current time, a time calculation, '
    'or setting a reminder.'
)

TOOL_SCHEMAS = [
    {
        'name': 'get_current_datetime',
        'description': 'Get the current date and time in a given IANA timezone (e.g. "America/Chicago").',
        'input_schema': {
            'type': 'object',
            'properties': {
                'timezone': {'type': 'string', 'description': 'IANA timezone name, e.g. "America/Chicago" or "UTC".'},
            },
            'required': ['timezone'],
        },
    },
    {
        'name': 'add_duration_to_datetime',
        'description': (
            'Add (or subtract, with negative values) a duration to an ISO 8601 datetime and return the '
            'resulting ISO 8601 datetime. Pass as many of the component fields as needed to express a '
            'compound duration (e.g. "1 year, 2 months, and 3 days") in a single call, rather than calling '
            'this tool once per unit.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'iso_datetime': {'type': 'string', 'description': 'An ISO 8601 datetime string to start from.'},
                'years': {'type': 'number', 'description': 'Years to add (negative to subtract). Default 0.'},
                'months': {'type': 'number', 'description': 'Months to add (negative to subtract). Default 0.'},
                'days': {'type': 'number', 'description': 'Days to add (negative to subtract). Default 0.'},
                'hours': {'type': 'number', 'description': 'Hours to add (negative to subtract). Default 0.'},
                'minutes': {'type': 'number', 'description': 'Minutes to add (negative to subtract). Default 0.'},
                'seconds': {'type': 'number', 'description': 'Seconds to add (negative to subtract). Default 0.'},
            },
            'required': ['iso_datetime'],
        },
    },
    {
        'name': 'set_reminder',
        'description': 'Set a reminder for this demo session. This is a fake reminder for demonstration purposes only - nothing is actually scheduled.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'iso_datetime': {'type': 'string', 'description': 'ISO 8601 datetime the reminder should fire at.'},
                'message': {'type': 'string', 'description': 'What the reminder is about.'},
            },
            'required': ['iso_datetime', 'message'],
        },
    },
]


def _resolve_timezone(tz_name):
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return ZoneInfo('UTC')


def _get_current_datetime(timezone='UTC', **_):
    tz = _resolve_timezone(timezone)
    return {'iso': datetime.now(tz).isoformat()}


def _add_duration_to_datetime(iso_datetime, years=0, months=0, days=0, hours=0, minutes=0, seconds=0, **_):
    start = datetime.fromisoformat(iso_datetime)
    # years/months use relativedelta (calendar-aware, e.g. Jan 31 + 1 month), the rest
    # use a plain timedelta - combining both lets one call express a compound duration
    # like "1 year, 2 months, 3 days" instead of requiring one tool call per unit.
    result = start + relativedelta(years=int(years), months=int(months)) \
        + timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)
    return {'iso': result.isoformat()}


def _set_reminder(iso_datetime, message, **_):
    return {'confirmed': True, 'iso': iso_datetime, 'message': message}


TOOL_FUNCTIONS = {
    'get_current_datetime': _get_current_datetime,
    'add_duration_to_datetime': _add_duration_to_datetime,
    'set_reminder': _set_reminder,
}


def _run_tool(name, tool_input):
    fn = TOOL_FUNCTIONS.get(name)
    if not fn:
        raise ValueError(f'Unknown tool: {name}')
    return fn(**tool_input)


def _client():
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        return None
    return Anthropic(api_key=api_key)


def _assistant_content_for_replay(message):
    # message.model_dump() includes response-only fields (e.g. a null "parsed_output")
    # that the API's input schema rejects with "Extra inputs are not permitted" when
    # this same content is replayed back as the next request's message history - so
    # only the fields tool-use conversations actually need are carried forward here.
    blocks = []
    for block in message.content:
        if block.type == 'text':
            blocks.append({'type': 'text', 'text': block.text})
        elif block.type == 'tool_use':
            blocks.append({'type': 'tool_use', 'id': block.id, 'name': block.name, 'input': block.input})
    return blocks


@ai_demo_bp.route('/api/ai-demo/conversation-basics/chat', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def conversation_basics_chat():
    client = _client()
    if not client:
        return jsonify({'error': 'AI demos are not configured on this server.'}), 503

    data = request.get_json(silent=True) or {}
    messages = data.get('messages')
    system = (data.get('system') or '').strip()[:MAX_SYSTEM_CHARS]
    try:
        temperature = max(0.0, min(1.0, float(data.get('temperature', 1.0))))
    except (TypeError, ValueError):
        temperature = 1.0

    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        return jsonify({'error': 'Invalid conversation.'}), 400
    for m in messages:
        if not isinstance(m, dict) or m.get('role') not in ('user', 'assistant') \
                or not isinstance(m.get('content'), str) or len(m['content']) > MAX_MESSAGE_CHARS:
            return jsonify({'error': 'Invalid message.'}), 400

    def generate():
        try:
            kwargs = {
                'model': MODEL,
                'max_tokens': MAX_TOKENS,
                'temperature': temperature,
                'messages': messages,
            }
            if system:
                kwargs['system'] = [{'type': 'text', 'text': system}]
            with client.messages.stream(**kwargs) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as e:
            yield f'\n\n[Error: {e}]'

    return _stream_response(generate(), 'text/plain')


@ai_demo_bp.route('/api/ai-demo/tool-use/chat', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def tool_use_chat():
    client = _client()
    if not client:
        return jsonify({'error': 'AI demos are not configured on this server.'}), 503

    data = request.get_json(silent=True) or {}
    messages = data.get('messages')
    timezone = data.get('timezone')
    if not isinstance(timezone, str) or not timezone.strip():
        timezone = 'UTC'

    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        return jsonify({'error': 'Invalid conversation.'}), 400
    for m in messages:
        if not isinstance(m, dict) or m.get('role') not in ('user', 'assistant') \
                or not isinstance(m.get('content'), str) or len(m['content']) > MAX_MESSAGE_CHARS:
            return jsonify({'error': 'Invalid message.'}), 400

    def ndjson(obj):
        return json.dumps(obj) + '\n'

    def generate():
        try:
            loop_messages = list(messages)
            system = [{
                'type': 'text',
                'text': f'{TOOL_USE_SYSTEM_PROMPT} The user\'s local timezone is "{timezone}" - use it for get_current_datetime unless the user asks about a different timezone.',
            }]
            for _ in range(MAX_TOOL_ITERATIONS):
                with client.messages.stream(
                    model=MODEL,
                    max_tokens=MAX_TOKENS,
                    system=system,
                    messages=loop_messages,
                    tools=TOOL_SCHEMAS,
                ) as stream:
                    for text in stream.text_stream:
                        yield ndjson({'type': 'text_delta', 'text': text})
                    final_message = stream.get_final_message()

                loop_messages.append({'role': 'assistant', 'content': _assistant_content_for_replay(final_message)})

                if final_message.stop_reason != 'tool_use':
                    yield ndjson({'type': 'done'})
                    return

                tool_result_blocks = []
                for block in final_message.content:
                    if block.type != 'tool_use':
                        continue
                    yield ndjson({'type': 'tool_call', 'id': block.id, 'name': block.name, 'input': block.input})
                    try:
                        output = _run_tool(block.name, block.input)
                        tool_result_blocks.append({
                            'type': 'tool_result',
                            'tool_use_id': block.id,
                            'content': json.dumps(output),
                            'is_error': False,
                        })
                        yield ndjson({'type': 'tool_result', 'id': block.id, 'name': block.name, 'output': output, 'is_error': False})
                    except Exception as e:
                        tool_result_blocks.append({
                            'type': 'tool_result',
                            'tool_use_id': block.id,
                            'content': f'Error: {e}',
                            'is_error': True,
                        })
                        yield ndjson({'type': 'tool_result', 'id': block.id, 'name': block.name, 'output': str(e), 'is_error': True})

                loop_messages.append({'role': 'user', 'content': tool_result_blocks})

            yield ndjson({'type': 'error', 'message': 'The tool loop did not finish in time.'})
        except Exception as e:
            yield ndjson({'type': 'error', 'message': str(e)})

    return _stream_response(generate(), 'application/x-ndjson')


WEB_SEARCH_SYSTEM_PROMPT = (
    'You are a helpful assistant with access to a live web search tool. Search the web '
    'whenever a question depends on current or fact-checkable information you are not '
    'confident about from memory, and cite what you found in your answer.'
)

WEB_SEARCH_TOOL = {
    'type': 'web_search_20250305',
    'name': 'web_search',
    'max_uses': 5,
}
WEB_SEARCH_MAX_TOKENS = 4096


@ai_demo_bp.route('/api/ai-demo/web-search/chat', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def web_search_chat():
    client = _client()
    if not client:
        return jsonify({'error': 'AI demos are not configured on this server.'}), 503

    data = request.get_json(silent=True) or {}
    messages = data.get('messages')

    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        return jsonify({'error': 'Invalid conversation.'}), 400
    for m in messages:
        if not isinstance(m, dict) or m.get('role') not in ('user', 'assistant') \
                or not isinstance(m.get('content'), str) or len(m['content']) > MAX_MESSAGE_CHARS:
            return jsonify({'error': 'Invalid message.'}), 400

    def ndjson(obj):
        return json.dumps(obj) + '\n'

    def generate():
        try:
            system = [{'type': 'text', 'text': WEB_SEARCH_SYSTEM_PROMPT}]
            with client.messages.stream(
                model=MODEL,
                max_tokens=WEB_SEARCH_MAX_TOKENS,
                system=system,
                messages=messages,
                tools=[WEB_SEARCH_TOOL],
            ) as stream:
                tool_names = {}  # tool_use id -> name, so the matching tool_result can reuse it
                for event in stream:
                    if event.type == 'content_block_delta' and event.delta.type == 'text_delta':
                        yield ndjson({'type': 'text_delta', 'text': event.delta.text})
                    elif event.type == 'content_block_stop':
                        block = stream.current_message_snapshot.content[event.index]
                        if block.type == 'server_tool_use':
                            tool_names[block.id] = block.name
                            yield ndjson({'type': 'tool_call', 'id': block.id, 'name': block.name, 'input': block.input})
                        elif block.type == 'web_search_tool_result':
                            name = tool_names.get(block.tool_use_id, WEB_SEARCH_TOOL['name'])
                            if isinstance(block.content, list):
                                results = [
                                    {'title': r.title, 'url': r.url, 'page_age': r.page_age}
                                    for r in block.content
                                ]
                                yield ndjson({'type': 'tool_result', 'id': block.tool_use_id, 'name': name, 'output': results, 'is_error': False})
                            else:
                                yield ndjson({'type': 'tool_result', 'id': block.tool_use_id, 'name': name, 'output': str(block.content), 'is_error': True})
            yield ndjson({'type': 'done'})
        except Exception as e:
            yield ndjson({'type': 'error', 'message': str(e)})

    return _stream_response(generate(), 'application/x-ndjson')


MCP_UNAVAILABLE_MESSAGE = 'The GitHub MCP demo is not configured on this server.'


def _run_mcp_tool(name, tool_input):
    result = mcp_runtime.call_tool(name, tool_input)
    if result.isError:
        text = next((c.text for c in result.content if c.type == 'text'), 'Tool error.')
        raise RuntimeError(text)
    return '\n'.join(c.text for c in result.content if c.type == 'text')


@ai_demo_bp.route('/api/ai-demo/mcp/tools', methods=['GET'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def mcp_tools():
    if not mcp_runtime.is_configured():
        return jsonify({'error': MCP_UNAVAILABLE_MESSAGE}), 503
    try:
        tools = mcp_runtime.get_anthropic_tools()
    except mcp_runtime.McpUnavailableError as e:
        return jsonify({'error': str(e)}), 503
    return jsonify({
        'tools': [{'name': t['name'], 'description': t['description']} for t in tools],
        'repo': mcp_runtime.get_repo(),
    })


@ai_demo_bp.route('/api/ai-demo/mcp/chat', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def mcp_chat():
    data = request.get_json(silent=True) or {}
    messages = data.get('messages')

    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        return jsonify({'error': 'Invalid conversation.'}), 400
    for m in messages:
        if not isinstance(m, dict) or m.get('role') not in ('user', 'assistant') \
                or not isinstance(m.get('content'), str) or len(m['content']) > MAX_MESSAGE_CHARS:
            return jsonify({'error': 'Invalid message.'}), 400

    client = _client()
    if not client:
        return jsonify({'error': 'AI demos are not configured on this server.'}), 503
    if not mcp_runtime.is_configured():
        return jsonify({'error': MCP_UNAVAILABLE_MESSAGE}), 503

    def ndjson(obj):
        return json.dumps(obj) + '\n'

    def generate():
        try:
            tools = mcp_runtime.get_anthropic_tools()
            repo = mcp_runtime.get_repo()
        except mcp_runtime.McpUnavailableError as e:
            yield ndjson({'type': 'error', 'message': str(e)})
            return

        try:
            loop_messages = list(messages)
            system = [{
                'type': 'text',
                'text': (
                    f'You are a helpful assistant with read-only access to the GitHub repository "{repo}" '
                    'through GitHub\'s official remote MCP server. Use the available tools to answer '
                    'questions about this project\'s commits, branches, and pull requests - don\'t guess '
                    'at repo history from memory. You cannot make any changes to the repository; only '
                    'read from it. Tool results come back as raw GitHub API JSON with many fields you '
                    'don\'t need to repeat - when presenting commits, pull requests, branches, etc. to '
                    'the user, extract only the relevant details (e.g. short SHA, one-line summary of the '
                    'commit message, author, date) into a concise Markdown list or table, not a dump of '
                    'the raw JSON.'
                ),
            }]
            for _ in range(MAX_TOOL_ITERATIONS):
                with client.messages.stream(
                    model=MCP_MODEL,
                    max_tokens=MAX_TOKENS,
                    system=system,
                    messages=loop_messages,
                    tools=tools,
                ) as stream:
                    for text in stream.text_stream:
                        yield ndjson({'type': 'text_delta', 'text': text})
                    final_message = stream.get_final_message()

                loop_messages.append({'role': 'assistant', 'content': _assistant_content_for_replay(final_message)})

                if final_message.stop_reason != 'tool_use':
                    yield ndjson({'type': 'done'})
                    return

                tool_result_blocks = []
                for block in final_message.content:
                    if block.type != 'tool_use':
                        continue
                    yield ndjson({'type': 'tool_call', 'id': block.id, 'name': block.name, 'input': block.input})
                    try:
                        output = _run_mcp_tool(block.name, block.input)
                        tool_result_blocks.append({
                            'type': 'tool_result',
                            'tool_use_id': block.id,
                            'content': output,
                            'is_error': False,
                        })
                        yield ndjson({'type': 'tool_result', 'id': block.id, 'name': block.name, 'output': output, 'is_error': False})
                    except Exception as e:
                        tool_result_blocks.append({
                            'type': 'tool_result',
                            'tool_use_id': block.id,
                            'content': f'Error: {e}',
                            'is_error': True,
                        })
                        yield ndjson({'type': 'tool_result', 'id': block.id, 'name': block.name, 'output': str(e), 'is_error': True})

                loop_messages.append({'role': 'user', 'content': tool_result_blocks})

            yield ndjson({'type': 'error', 'message': 'The tool loop did not finish in time.'})
        except Exception as e:
            yield ndjson({'type': 'error', 'message': str(e)})

    return _stream_response(generate(), 'application/x-ndjson')


RAG_SYSTEM_PROMPT = (
    'You are a helpful assistant answering questions using only the retrieved context '
    'chunks provided below - a fixed sample research report, not general knowledge. '
    'Ground your answer strictly in these chunks and mention which section(s) it came '
    'from. If the chunks do not contain the answer, say so plainly instead of guessing.'
)


def _voyage_client():
    api_key = os.getenv('VOYAGE_API_KEY')
    if not api_key:
        return None
    return voyageai.Client(api_key=api_key)


RAG_SOURCE_PDF_FILENAME = 'deseq2-love-huber-anders-2014.pdf'


@ai_demo_bp.route('/api/ai-demo/rag/source.pdf')
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def rag_source_pdf():
    data_dir = os.path.join(current_app.root_path, 'data')
    return send_from_directory(
        data_dir,
        RAG_SOURCE_PDF_FILENAME,
        as_attachment=True,
        download_name='love-huber-anders-2014-deseq2.pdf',
    )


@ai_demo_bp.route('/api/ai-demo/rag/search', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def rag_search():
    client = _client()
    voyage_client = _voyage_client()
    if not client or not voyage_client:
        return jsonify({'error': 'The RAG demo is not configured on this server.'}), 503

    data = request.get_json(silent=True) or {}
    query = (data.get('query') or '').strip()
    if not query or len(query) > MAX_RAG_QUERY_CHARS:
        return jsonify({'error': 'Invalid query.'}), 400

    def embed_fn(texts, input_type):
        result = voyage_client.embed(texts, model=RAG_EMBED_MODEL, input_type=input_type)
        return result.embeddings

    def ndjson(obj):
        return json.dumps(obj) + '\n'

    def generate():
        try:
            vector_index, bm25_index, retriever = rag_index.get_retriever(embed_fn, cache_key=RAG_EMBED_MODEL)

            query_vector = embed_fn([query], 'query')[0]

            # The document chunks were embedded once when the index was first built (see
            # rag_index.get_retriever) and are cached from then on - this reads back one
            # of those real, already-computed vectors rather than re-embedding anything,
            # so the "document -> Voyage -> vector" sample shown to the user is genuine.
            # The query vector above, by contrast, was just freshly computed by Voyage.
            sample_chunk_index = 0
            yield ndjson({
                'type': 'embedding',
                'model': RAG_EMBED_MODEL,
                'dimensions': vector_index.dim,
                'chunk_count': len(vector_index),
                'document_sample': {
                    'chunk_index': sample_chunk_index,
                    'preview': vector_index.documents[sample_chunk_index]['content'][:160],
                    'vector_preview': vector_index.vectors[sample_chunk_index][:RAG_EMBEDDING_PREVIEW_DIMS],
                },
                'query_sample': {
                    'text': query,
                    'vector_preview': query_vector[:RAG_EMBEDDING_PREVIEW_DIMS],
                },
            })

            vector_results = vector_index.search(query_vector, k=RAG_RESULT_K)
            bm25_results = bm25_index.search(query, k=RAG_RESULT_K)
            hybrid_results = retriever.search(query, k=RAG_RESULT_K, query_vector=query_vector)

            def to_payload(results):
                return [{'content': doc['content'], 'rank': i + 1} for i, (doc, _score) in enumerate(results)]

            yield ndjson({
                'type': 'retrieval',
                'vector': to_payload(vector_results),
                'bm25': to_payload(bm25_results),
                'hybrid': to_payload(hybrid_results),
            })

            context = '\n\n---\n\n'.join(doc['content'] for doc, _ in hybrid_results)
            system = [{'type': 'text', 'text': f'{RAG_SYSTEM_PROMPT}\n\nRetrieved context:\n\n{context}'}]
            with client.messages.stream(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=system,
                messages=[{'role': 'user', 'content': query}],
            ) as stream:
                for text in stream.text_stream:
                    yield ndjson({'type': 'text_delta', 'text': text})

            yield ndjson({'type': 'done'})
        except Exception as e:
            yield ndjson({'type': 'error', 'message': str(e)})

    return _stream_response(generate(), 'application/x-ndjson')


PROMPT_EVAL_MODEL = 'claude-haiku-4-5-20251001'  # matches the reference notebook: fast + reliable JSON formatting for the judge
PROMPT_EVAL_MAX_TOKENS = 512
PROMPT_EVAL_GRADER_MAX_TOKENS = 512

PROMPT_EVAL_DATASET = [
    {
        'id': 'json-summary',
        'format': 'json',
        'task': (
            'Given the exam scores [72, 85, 90, 61, 76, 88, 95, 45, 90], write a JSON object with keys '
            '"mean", "median", "min", "max", and "mode". If more than one value is tied for the highest '
            'frequency, "mode" should be a JSON array listing all of them; otherwise it should be a single number.'
        ),
        'solution_criteria': (
            'Valid JSON with numeric mean, median, min, max keys, all computed correctly from the given list. '
            'The mode key should be the number 90 (the only value that repeats), not an array, since there is '
            'exactly one mode.'
        ),
    },
    {
        'id': 'python-palindrome',
        'format': 'python',
        'task': (
            'Write a Python function `is_palindrome(s)` that returns True if `s` is a palindrome, ignoring case, '
            'spaces, and punctuation (e.g. "A man, a plan, a canal: Panama" should return True).'
        ),
        'solution_criteria': (
            'Valid Python defining is_palindrome(s) that strips punctuation as well as case and spaces before '
            'checking - a solution that only lowercases and strips spaces (missing punctuation removal) should '
            'be marked down since it would incorrectly return False for the example in the task.'
        ),
    },
    {
        'id': 'regex-ipv4',
        'format': 'regex',
        'task': (
            'Write a regular expression that matches a valid IPv4 address (four dot-separated octets, each '
            '0-255, with no leading zeros - e.g. "010" is invalid, but "0" alone is valid).'
        ),
        'solution_criteria': (
            'A regex that matches valid dotted-quad IPv4 addresses, rejects octets over 255 or malformed input, '
            'and specifically rejects octets with leading zeros like "010" or "005" (while still allowing a '
            'lone "0"). A regex using a simple [0-9]{1,3} pattern per octet without excluding leading zeros '
            'should be marked down for missing this requirement.'
        ),
    },
]

PROMPT_EVAL_FENCE = {'json': 'json', 'python': 'python', 'regex': 'text'}

# Hand-crafted outputs of known quality per test case, used by the non-'live' variants below so
# the grading pipeline (syntax check + LLM judge) can be demonstrated against outputs that are
# deliberately not perfect - the live model is good enough at these tasks that a live run alone
# rarely shows the grader actually docking a score.
PROMPT_EVAL_SAMPLE_OUTPUTS = {
    'json-summary': {
        # Correct on every count, including "mode" as a bare number since there's only one mode.
        'good': '{"mean": 78.0, "median": 85, "min": 45, "max": 95, "mode": 90}',
        # Valid JSON (syntax_score 10), but "mode" is wrongly wrapped in an array despite there
        # being exactly one mode - a spec violation the judge should dock.
        'medium': '{"mean": 78.0, "median": 85, "min": 45, "max": 95, "mode": [90]}',
        # Unquoted keys - invalid JSON, so json.loads fails outright (syntax_score 0).
        'bad': '{mean: 78, median: 85, min: 45, max: 95, mode: 90}',
    },
    'python-palindrome': {
        'good': (
            "def is_palindrome(s):\n"
            "    cleaned = ''.join(c.lower() for c in s if c.isalnum())\n"
            "    return cleaned == cleaned[::-1]"
        ),
        # Valid Python (syntax_score 10) but only strips case/spaces, not punctuation - fails the
        # task's own example ("A man, a plan, a canal: Panama"), so the judge should dock it.
        'medium': (
            "def is_palindrome(s):\n"
            "    cleaned = s.lower().replace(' ', '')\n"
            "    return cleaned == cleaned[::-1]"
        ),
        # Missing colon after the def line - ast.parse raises SyntaxError (syntax_score 0).
        'bad': (
            "def is_palindrome(s)\n"
            "    cleaned = s.lower().replace(' ', '')\n"
            "    return cleaned == cleaned[::-1]"
        ),
    },
    'regex-ipv4': {
        'good': r'^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$',
        # Compiles fine (syntax_score 10) but [0-9]{1,2} admits leading zeros like "01" - the
        # task explicitly requires rejecting those, so the judge should dock it.
        'medium': r'^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})){3}$',
        # The working "good" pattern plus one stray trailing ')' - guaranteed unbalanced
        # parenthesis, so re.compile always raises re.error (syntax_score 0).
        'bad': r'^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$)',
    },
}

PROMPT_EVAL_VARIANTS = ('live', 'good', 'medium', 'bad')

GRADING_PROMPT_TEMPLATE = (
    'You are grading a submitted answer to a task.\n\nTask: {task}\n\nSubmitted answer:\n{output}\n\n'
    'Grading criteria: {solution_criteria}\n\n'
    'Respond with only a JSON object with keys "strengths" (string array), "weaknesses" (string array), '
    '"reasoning" (string), and "score" (integer 1-10). List strengths, weaknesses, and reasoning before '
    'deciding the score.'
)


def _run_prompt_eval_task(client, test_case):
    fence = PROMPT_EVAL_FENCE[test_case['format']]
    message = client.messages.create(
        model=PROMPT_EVAL_MODEL,
        max_tokens=PROMPT_EVAL_MAX_TOKENS,
        messages=[
            {
                'role': 'user',
                'content': f"{test_case['task']}\n\nRespond with only the {test_case['format']} - no explanation, no markdown fences.",
            },
            {'role': 'assistant', 'content': f'```{fence}'},
        ],
        stop_sequences=['```'],
    )
    # Guards the same empty-completion edge case _grade_by_model already defends against below -
    # if the model's first token happens to be the stop sequence, content can come back empty.
    if not message.content:
        return ''
    return message.content[0].text.strip()


def _grade_syntax(output, output_format):
    try:
        if output_format == 'json':
            json.loads(output)
        elif output_format == 'python':
            ast.parse(output)
        elif output_format == 'regex':
            re.compile(output)
        else:
            return 0
        return 10
    except (ValueError, SyntaxError, re.error):
        return 0


def _coerce_grading(grading):
    # The judge's JSON shape is only as reliable as the model's instruction-following - coerce
    # every field to the type the route/frontend actually assumes before it's used in arithmetic
    # (a non-numeric score would crash the combined-score calculation below) or rendered as a
    # list (a non-list strengths/weaknesses would crash the frontend's .map()).
    if not isinstance(grading, dict):
        grading = {}
    try:
        # round() raises OverflowError (not ValueError) for +-inf - Python's json.loads accepts
        # the non-standard "Infinity"/"-Infinity"/"NaN" literals by default, so a judge response
        # containing one of those must not be allowed to reach round() uncaught.
        score = round(float(grading.get('score', 0)))
    except (TypeError, ValueError, OverflowError):
        score = 0
    score = max(0, min(10, score))
    strengths = grading.get('strengths')
    strengths = [str(s) for s in strengths] if isinstance(strengths, list) else []
    weaknesses = grading.get('weaknesses')
    weaknesses = [str(s) for s in weaknesses] if isinstance(weaknesses, list) else []
    reasoning = grading.get('reasoning')
    reasoning = reasoning if isinstance(reasoning, str) else ''
    return {'strengths': strengths, 'weaknesses': weaknesses, 'reasoning': reasoning, 'score': score}


def _grade_by_model(client, test_case, output):
    prompt = GRADING_PROMPT_TEMPLATE.format(
        task=test_case['task'], output=output, solution_criteria=test_case['solution_criteria'],
    )
    message = client.messages.create(
        model=PROMPT_EVAL_MODEL,
        max_tokens=PROMPT_EVAL_GRADER_MAX_TOKENS,
        messages=[
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': '```json'},
        ],
        stop_sequences=['```'],
    )
    if not message.content:
        return _coerce_grading(None)
    try:
        parsed = json.loads(message.content[0].text.strip())
    except ValueError:
        parsed = {'reasoning': 'Could not parse grading response.'}
    return _coerce_grading(parsed)


@ai_demo_bp.route('/api/ai-demo/prompt-evaluation/run', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def prompt_evaluation_run():
    client = _client()
    if not client:
        return jsonify({'error': 'AI demos are not configured on this server.'}), 503

    data = request.get_json(silent=True) or {}
    variant = data.get('variant', 'live')
    if variant not in PROMPT_EVAL_VARIANTS:
        return jsonify({'error': 'Invalid variant.'}), 400

    def ndjson(obj):
        return json.dumps(obj) + '\n'

    def generate():
        try:
            yield ndjson({
                'type': 'dataset',
                'test_cases': [
                    {'id': tc['id'], 'index': i, 'task': tc['task'], 'format': tc['format']}
                    for i, tc in enumerate(PROMPT_EVAL_DATASET)
                ],
            })

            with ThreadPoolExecutor(max_workers=len(PROMPT_EVAL_DATASET)) as pool:
                # Stage 1: 'live' generates all outputs concurrently via Claude, yielding each
                # as it lands so the frontend's columns populate together rather than one at a
                # time. Any other variant skips generation entirely and grades a fixed sample
                # output of known quality instead - there's nothing to wait on, so those are
                # yielded immediately without the thread pool.
                outputs = {}
                if variant == 'live':
                    futures = {pool.submit(_run_prompt_eval_task, client, tc): i for i, tc in enumerate(PROMPT_EVAL_DATASET)}
                    for future in as_completed(futures):
                        i = futures[future]
                        outputs[i] = future.result()
                        yield ndjson({'type': 'output', 'index': i, 'text': outputs[i]})
                else:
                    for i, tc in enumerate(PROMPT_EVAL_DATASET):
                        outputs[i] = PROMPT_EVAL_SAMPLE_OUTPUTS[tc['id']][variant]
                        yield ndjson({'type': 'output', 'index': i, 'text': outputs[i]})

                # Stage 2: grade all outputs concurrently (syntax check is instant/local;
                # the model-judge call is what actually runs in the thread pool).
                scores = {}

                def grade(i):
                    test_case = PROMPT_EVAL_DATASET[i]
                    syntax_score = _grade_syntax(outputs[i], test_case['format'])
                    grading = _grade_by_model(client, test_case, outputs[i])
                    model_score = grading.get('score', 0)
                    return i, syntax_score, model_score, grading

                futures = {pool.submit(grade, i): i for i in range(len(PROMPT_EVAL_DATASET))}
                for future in as_completed(futures):
                    i, syntax_score, model_score, grading = future.result()
                    combined = round((syntax_score + model_score) / 2, 1)
                    scores[i] = combined
                    yield ndjson({
                        'type': 'graded', 'index': i,
                        'syntax_score': syntax_score, 'model_score': model_score, 'score': combined,
                        'strengths': grading.get('strengths', []), 'weaknesses': grading.get('weaknesses', []),
                        'reasoning': grading.get('reasoning', ''),
                    })

            yield ndjson({'type': 'summary', 'average_score': round(sum(scores.values()) / len(scores), 1)})
            yield ndjson({'type': 'done'})
        except Exception as e:
            yield ndjson({'type': 'error', 'message': str(e)})

    return _stream_response(generate(), 'application/x-ndjson')


PROMPT_ENGINEERING_MODEL = 'claude-haiku-4-5-20251001'  # matches the reference notebook
PROMPT_ENGINEERING_MAX_TOKENS = 512
PROMPT_ENGINEERING_GRADER_MAX_TOKENS = 512

PROMPT_ENGINEERING_TASK = 'Extract topics mentioned from a passage of text into a JSON array of strings.'

PROMPT_ENGINEERING_PASSAGES = {
    'coral-reefs': {
        'label': 'Coral reef bleaching',
        'text': (
            'Rising sea surface temperatures have accelerated the bleaching of coral reefs across the '
            'Pacific, as thermal stress causes corals to expel the symbiotic algae responsible for both '
            'their color and much of their energy supply. Without these zooxanthellae, coral tissue turns '
            "pale and the reef's ability to produce calcium carbonate skeleton slows sharply, leaving "
            'structures more vulnerable to erosion from storms and grazing fish. Compounding this stress, '
            'absorption of atmospheric carbon dioxide by seawater has lowered ocean pH, a process known as '
            'ocean acidification, which further reduces the availability of carbonate ions corals need to '
            'build their skeletons. Reef ecosystems that collapse under these combined pressures also lose '
            'their role as nursery habitat for reef fish, undermining coastal fisheries that millions of '
            'people depend on for protein and income.'
        ),
    },
    'congestion-pricing': {
        'label': 'Urban congestion pricing',
        'text': (
            'Several major cities have introduced congestion pricing zones that charge drivers a fee to '
            'enter downtown cores during peak hours, aiming to reduce gridlock and redirect commuters '
            'toward public transit. Early results from these programs show meaningful drops in average '
            'vehicle miles traveled within the priced zone, alongside improved bus travel times because '
            'buses no longer sit in the same traffic as private cars. Revenue collected from the tolls is '
            'often earmarked for transit agency budgets, funding subway signal upgrades and new electric '
            'bus fleets. Critics argue the fees disproportionately burden lower-income commuters who cannot '
            'easily shift to transit or afford to live closer to job centers, and some worry that traffic '
            'simply migrates to untolled streets just outside the pricing boundary, a phenomenon known as '
            'traffic diversion.'
        ),
    },
    'sleep-memory': {
        'label': 'Sleep and memory consolidation',
        'text': (
            'During slow-wave sleep, the brain replays patterns of neural activity that were first recorded '
            'while an animal navigated a maze earlier in the day, a process researchers call hippocampal '
            'replay. This replay appears to strengthen connections between the hippocampus and neocortex, '
            'gradually transferring detailed episodic memories into more stable, generalized long-term '
            'storage - a theory known as systems consolidation. Sleep spindles, brief bursts of oscillatory '
            'activity generated in the thalamus, tend to cluster around these replay events and are '
            'associated with better performance on memory tests the following day. Sleep deprivation '
            'studies show that blocking slow-wave sleep specifically, rather than just reducing total sleep '
            'time, impairs this consolidation process even when subjects are allowed to make up lost sleep '
            'later, suggesting the timing and structure of sleep stages matters as much as total sleep '
            'duration.'
        ),
    },
}

PROMPT_ENGINEERING_DEFAULT_PASSAGE_ID = 'coral-reefs'

# Kept generic (no hardcoded topic names) since the passage is visitor-editable - these are the
# structural/behavioral rules the reference dataset.json entries all share, not content specific
# to the default passage above.
PROMPT_ENGINEERING_SOLUTION_CRITERIA = (
    'Extracts all explicitly stated topics from the passage, without inferring broader implicit '
    'concepts that are not directly named. Each topic appears only once (no duplicates). If a '
    'parent topic and a more specific child topic are both mentioned, only the more specific topic '
    'should be included, not both. The response is a valid JSON array of strings and nothing else - '
    'no surrounding commentary, no markdown fences.'
)

PROMPT_ENGINEERING_MAX_PROMPT_CHARS = 1000

PROMPT_ENGINEERING_DEFAULT_NAIVE_PROMPT = 'Generate a JSON array of strings of the topics names from the paragraph'

PROMPT_ENGINEERING_DEFAULT_REFINED_PROMPT = (
    'Extract key topics mentioned from a passage of text from a scholarly journal into a JSON array '
    'of strings.\n\n'
    '<text>\n{passage}\n</text>\n\n'
    'Follow these steps:\n'
    '1. Closely examine the provided text\n'
    '2. Identify each topic mentioned\n'
    '3. Add each topic to a JSON array\n'
    '4. Respond with the JSON array. Do not provide any other text or commentary'
)

PROMPT_ENGINEERING_VARIANTS = ('naive', 'refined')


def _build_prompt_engineering_message(prompt_text, passage):
    # A plain str.replace (not .format()) so a visitor-edited prompt containing unrelated curly
    # braces (e.g. a JSON example) can't raise a KeyError/IndexError on the .format() call.
    if '{passage}' in prompt_text:
        return prompt_text.replace('{passage}', passage)
    return f'{prompt_text}\n\n<paragraph>\n{passage}\n</paragraph>'


def _run_prompt_engineering_task(client, prompt_text, passage):
    prompt = _build_prompt_engineering_message(prompt_text, passage)
    message = client.messages.create(
        model=PROMPT_ENGINEERING_MODEL,
        max_tokens=PROMPT_ENGINEERING_MAX_TOKENS,
        messages=[
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': '```json'},
        ],
        stop_sequences=['```'],
    )
    if not message.content:
        return ''
    return message.content[0].text.strip()


# GRADING_PROMPT_TEMPLATE has no slot for source material, which prompt evaluation's tasks don't
# need (the task text is self-contained, e.g. "Given the exam scores [...]"). Topic extraction is
# graded against how faithfully the output reflects a passage, so the judge needs the passage itself
# to check for missed/invented/over-inferred topics - without it, it can only judge output shape.
PROMPT_ENGINEERING_GRADING_TEMPLATE = (
    'You are grading a submitted answer to a task.\n\nTask: {task}\n\nOriginal passage:\n{passage}\n\n'
    'Submitted answer:\n{output}\n\nGrading criteria: {solution_criteria}\n\n'
    'Respond with only a JSON object with keys "strengths" (string array), "weaknesses" (string array), '
    '"reasoning" (string), and "score" (integer 1-10). List strengths, weaknesses, and reasoning before '
    'deciding the score.'
)


def _grade_prompt_engineering_output(client, passage, output):
    prompt = PROMPT_ENGINEERING_GRADING_TEMPLATE.format(
        task=PROMPT_ENGINEERING_TASK, passage=passage, output=output,
        solution_criteria=PROMPT_ENGINEERING_SOLUTION_CRITERIA,
    )
    message = client.messages.create(
        model=PROMPT_ENGINEERING_MODEL,
        max_tokens=PROMPT_ENGINEERING_GRADER_MAX_TOKENS,
        messages=[
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': '```json'},
        ],
        stop_sequences=['```'],
    )
    if not message.content:
        return _coerce_grading(None)
    try:
        parsed = json.loads(message.content[0].text.strip())
    except ValueError:
        parsed = {'reasoning': 'Could not parse grading response.'}
    return _coerce_grading(parsed)


@ai_demo_bp.route('/api/ai-demo/prompt-engineering/run', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def prompt_engineering_run():
    client = _client()
    if not client:
        return jsonify({'error': 'AI demos are not configured on this server.'}), 503

    data = request.get_json(silent=True) or {}

    passage_id = data.get('passage_id')
    if passage_id is not None and not isinstance(passage_id, str):
        return jsonify({'error': 'Invalid passage.'}), 400
    passage_id = passage_id or PROMPT_ENGINEERING_DEFAULT_PASSAGE_ID
    if passage_id not in PROMPT_ENGINEERING_PASSAGES:
        return jsonify({'error': 'Invalid passage.'}), 400
    passage = PROMPT_ENGINEERING_PASSAGES[passage_id]['text']

    naive_prompt_raw = data.get('naive_prompt')
    refined_prompt_raw = data.get('refined_prompt')
    if (naive_prompt_raw is not None and not isinstance(naive_prompt_raw, str)) \
            or (refined_prompt_raw is not None and not isinstance(refined_prompt_raw, str)):
        return jsonify({'error': 'Prompts must be text.'}), 400
    naive_prompt = (naive_prompt_raw or '').strip() or PROMPT_ENGINEERING_DEFAULT_NAIVE_PROMPT
    refined_prompt = (refined_prompt_raw or '').strip() or PROMPT_ENGINEERING_DEFAULT_REFINED_PROMPT
    if len(naive_prompt) > PROMPT_ENGINEERING_MAX_PROMPT_CHARS or len(refined_prompt) > PROMPT_ENGINEERING_MAX_PROMPT_CHARS:
        return jsonify({'error': f'Prompts must be {PROMPT_ENGINEERING_MAX_PROMPT_CHARS} characters or fewer.'}), 400

    prompt_texts = {'naive': naive_prompt, 'refined': refined_prompt}

    def ndjson(obj):
        return json.dumps(obj) + '\n'

    def generate():
        try:
            with ThreadPoolExecutor(max_workers=len(PROMPT_ENGINEERING_VARIANTS)) as pool:
                # Stage 1: run both prompts concurrently against the same passage.
                outputs = {}
                futures = {
                    pool.submit(_run_prompt_engineering_task, client, prompt_texts[variant], passage): variant
                    for variant in PROMPT_ENGINEERING_VARIANTS
                }
                for future in as_completed(futures):
                    variant = futures[future]
                    outputs[variant] = future.result()
                    yield ndjson({'type': 'output', 'variant': variant, 'text': outputs[variant]})

                # Stage 2: grade both outputs concurrently against the same criteria.
                scores = {}

                def grade(variant):
                    grading = _grade_prompt_engineering_output(client, passage, outputs[variant])
                    return variant, grading

                futures = {pool.submit(grade, variant): variant for variant in PROMPT_ENGINEERING_VARIANTS}
                for future in as_completed(futures):
                    variant, grading = future.result()
                    scores[variant] = grading.get('score', 0)
                    yield ndjson({
                        'type': 'graded', 'variant': variant, 'score': grading.get('score', 0),
                        'strengths': grading.get('strengths', []), 'weaknesses': grading.get('weaknesses', []),
                        'reasoning': grading.get('reasoning', ''),
                    })

            yield ndjson({
                'type': 'summary', 'naive_score': scores.get('naive', 0), 'refined_score': scores.get('refined', 0),
            })
            yield ndjson({'type': 'done'})
        except Exception as e:
            yield ndjson({'type': 'error', 'message': str(e)})

    return _stream_response(generate(), 'application/x-ndjson')


VISION_MAX_TOKENS = 1536
VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # Anthropic's per-image limit
VISION_ALLOWED_MEDIA_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}

VISION_SYSTEM_PROMPT = (
    'You are an expert visual analyst. Examine the attached image closely and describe it '
    'thoroughly: the main subject, notable objects, any visible text (transcribe it), colors '
    'and composition, and any details a careful human observer would point out. Write in clear '
    'prose, organized with short paragraphs or a few headings if that fits the image.'
)


@ai_demo_bp.route('/api/ai-demo/vision/analyze', methods=['POST'])
@ai_demo_page_enabled_required
@user_required
@ai_demo_access_required
def vision_analyze():
    client = _client()
    if not client:
        return jsonify({'error': 'AI demos are not configured on this server.'}), 503

    data = request.get_json(silent=True) or {}
    media_type = data.get('media_type')
    image_b64 = data.get('image')

    if media_type not in VISION_ALLOWED_MEDIA_TYPES:
        return jsonify({'error': 'Unsupported image type.'}), 400
    if not isinstance(image_b64, str) or not image_b64:
        return jsonify({'error': 'No image provided.'}), 400
    # Cheap pre-check on the base64 string length before paying for a decode.
    if len(image_b64) > VISION_MAX_IMAGE_BYTES * 4 / 3:
        return jsonify({'error': 'Image is too large.'}), 400
    try:
        decoded = base64.b64decode(image_b64, validate=True)
    except (binascii.Error, ValueError):
        return jsonify({'error': 'Invalid image data.'}), 400
    if len(decoded) > VISION_MAX_IMAGE_BYTES:
        return jsonify({'error': 'Image is too large.'}), 400

    def generate():
        try:
            with client.messages.stream(
                model=MODEL,
                max_tokens=VISION_MAX_TOKENS,
                system=[{'type': 'text', 'text': VISION_SYSTEM_PROMPT}],
                messages=[{
                    'role': 'user',
                    'content': [
                        {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': image_b64}},
                        {'type': 'text', 'text': 'Analyze this image.'},
                    ],
                }],
            ) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as e:
            yield f'\n\n[Error: {e}]'

    return _stream_response(generate(), 'text/plain')
