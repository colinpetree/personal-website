import os

from anthropic import Anthropic
from flask import Blueprint, Response, jsonify, request, stream_with_context

from routes.auth import user_required

ai_demo_bp = Blueprint('ai_demo', __name__)

MODEL = 'claude-sonnet-5'
MAX_TOKENS = 1024
MAX_MESSAGES = 40
MAX_MESSAGE_CHARS = 4000
MAX_SYSTEM_CHARS = 2000


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
