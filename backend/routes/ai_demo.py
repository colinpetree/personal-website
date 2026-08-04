import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil.relativedelta import relativedelta
from anthropic import Anthropic
from flask import Blueprint, Response, jsonify, request, stream_with_context

from routes.auth import user_required
import mcp_runtime

ai_demo_bp = Blueprint('ai_demo', __name__)

MODEL = 'claude-sonnet-5'
MAX_TOKENS = 1024
MAX_MESSAGES = 40
MAX_MESSAGE_CHARS = 4000
MAX_SYSTEM_CHARS = 2000
MAX_TOOL_ITERATIONS = 6

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


@ai_demo_bp.route('/api/ai-demo/conversation-basics/chat', methods=['POST'])
@user_required
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

    return Response(stream_with_context(generate()), mimetype='text/plain')


@ai_demo_bp.route('/api/ai-demo/tool-use/chat', methods=['POST'])
@user_required
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

                loop_messages.append({'role': 'assistant', 'content': final_message.model_dump()['content']})

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

    return Response(stream_with_context(generate()), mimetype='application/x-ndjson')


MCP_UNAVAILABLE_MESSAGE = 'The GitHub MCP demo is not configured on this server.'


def _run_mcp_tool(name, tool_input):
    result = mcp_runtime.call_tool(name, tool_input)
    if result.isError:
        text = next((c.text for c in result.content if c.type == 'text'), 'Tool error.')
        raise RuntimeError(text)
    return '\n'.join(c.text for c in result.content if c.type == 'text')


@ai_demo_bp.route('/api/ai-demo/mcp/tools', methods=['GET'])
@user_required
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
@user_required
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
                    model=MODEL,
                    max_tokens=MAX_TOKENS,
                    system=system,
                    messages=loop_messages,
                    tools=tools,
                ) as stream:
                    for text in stream.text_stream:
                        yield ndjson({'type': 'text_delta', 'text': text})
                    final_message = stream.get_final_message()

                loop_messages.append({'role': 'assistant', 'content': final_message.model_dump()['content']})

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

    return Response(stream_with_context(generate()), mimetype='application/x-ndjson')
