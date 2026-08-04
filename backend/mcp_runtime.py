"""Owns a single, persistent MCP client connection to GitHub's remote MCP
server (https://api.githubcopilot.com/mcp/) for the life of this Flask
worker process. Read-only: connects with X-MCP-Readonly and a toolset
restriction so no write-capable tool is ever exposed, on top of the GitHub
token itself being scoped read-only to a single repo.

The `mcp` SDK's ClientSession/streamablehttp_client are async context
managers, but Flask routes in this app are synchronous. This module bridges
the two with a background thread that runs its own asyncio event loop and
keeps the MCP session alive via `run_forever()`; routes call the sync
wrapper functions below, which hop onto that loop with
`run_coroutine_threadsafe`.

Started lazily on first use (not at import time) so importing this module
never opens a connection - keeps app boot cheap and matches the existing
`_client()` "fail soft, 503 on demand" shape used for the Anthropic client.
`is_configured()` lets routes fail fast (no thread spun up at all) when the
GitHub token/repo env vars aren't set.

Unlike a local subprocess, a remote HTTP session can be dropped or expire
server-side between requests with no local signal until the next call fails
- `_call()` retries once through a fresh connection before giving up.
"""
import asyncio
import os
import threading

from contextlib import AsyncExitStack

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

MCP_URL = 'https://api.githubcopilot.com/mcp/'

_thread = None
_loop = None
_session = None
_ready_event = threading.Event()
_start_lock = threading.Lock()
_start_error = None


class McpUnavailableError(Exception):
    pass


def is_configured():
    return bool(os.getenv('GITHUB_MCP_TOKEN')) and bool(os.getenv('GITHUB_MCP_REPO'))


def get_repo():
    return os.environ['GITHUB_MCP_REPO']


async def _connect():
    global _session
    token = os.environ['GITHUB_MCP_TOKEN']
    stack = AsyncExitStack()
    headers = {
        'Authorization': f'Bearer {token}',
        # Restricts the exposed toolset to read-only tools at the server level -
        # no create/update/delete/merge/push tool is ever visible to the model,
        # on top of the token itself only having read-scoped permissions.
        'X-MCP-Readonly': 'true',
        'X-MCP-Toolsets': 'repos,pull_requests',
    }
    read, write, _ = await stack.enter_async_context(streamablehttp_client(MCP_URL, headers=headers))
    session = await stack.enter_async_context(ClientSession(read, write))
    await session.initialize()
    _session = session
    globals()['_exit_stack'] = stack


def _run_loop():
    global _loop, _start_error
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    try:
        _loop.run_until_complete(_connect())
        _ready_event.set()
        _loop.run_forever()
    except Exception as e:
        _start_error = str(e)
        _ready_event.set()


def _ensure_started():
    if not is_configured():
        raise McpUnavailableError('The GitHub MCP demo is not configured on this server.')
    if _ready_event.is_set() and _start_error is None:
        return
    with _start_lock:
        if _ready_event.is_set():
            if _start_error is not None:
                raise McpUnavailableError(_start_error)
            return
        global _thread
        _thread = threading.Thread(target=_run_loop, daemon=True)
        _thread.start()
        if not _ready_event.wait(timeout=15):
            raise McpUnavailableError('The GitHub MCP server took too long to connect.')
        if _start_error is not None:
            raise McpUnavailableError(_start_error)


def _reset():
    global _thread, _loop, _session, _start_error
    with _start_lock:
        old_loop = _loop
        old_thread = _thread
        if old_loop is not None:
            old_loop.call_soon_threadsafe(old_loop.stop)
        if old_thread is not None:
            old_thread.join(timeout=5)
        _thread = None
        _loop = None
        _session = None
        _start_error = None
        _ready_event.clear()


def _call(coro_factory, timeout, _retry=True):
    _ensure_started()
    future = asyncio.run_coroutine_threadsafe(coro_factory(), _loop)
    try:
        return future.result(timeout=timeout)
    except Exception as e:
        if _retry:
            _reset()
            return _call(coro_factory, timeout, _retry=False)
        raise McpUnavailableError(str(e))


def list_tools(timeout=10):
    result = _call(lambda: _session.list_tools(), timeout)
    return result.tools


def call_tool(name, arguments, timeout=20):
    return _call(lambda: _session.call_tool(name, arguments), timeout)


def get_anthropic_tools():
    tools = list_tools()
    return [{
        'name': t.name,
        'description': t.description or '',
        'input_schema': t.inputSchema,
    } for t in tools]
