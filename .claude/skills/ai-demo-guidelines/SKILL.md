---
name: ai-demo-guidelines
description: Implementation reference for the "AI Implementations" demo page (public /demo route showcasing Claude API capabilities). Invoke whenever "AI demo", "AI Implementations", the /demo page, ai_demo.py, or frontend/src/pages/ai-demos/ is mentioned, and BEFORE building or modifying any demo card — it contains required conventions, the client-tool-vs-server-tool routing decision, and reusable frontend/backend patterns for this project.
---

# AI Demo Card Implementation Guide

Use this guide when adding a new card to the `/demo` page or modifying an existing one.

---

## Where everything lives

| Piece | Path | Notes |
|---|---|---|
| All demo routes | `backend/routes/ai_demo.py` | One Flask blueprint (`ai_demo_bp`), one route function per demo action |
| MCP-specific runtime | `backend/mcp_runtime.py` | Only relevant to the `mcp` card — background-thread async/sync bridge to GitHub's remote MCP server |
| Demo pages | `frontend/src/pages/ai-demos/*.jsx` | One file per demo |
| Card grid | `frontend/src/pages/AIDemoPage.jsx` | `DEMOS` array: `{key, title, description, available}` |
| Route wiring | `frontend/src/router.jsx` | `AI_DEMOS_ENABLED`-guarded route array |
| Global on/off toggle | `frontend/src/pages/admin/AdminAIDemoPage.jsx` | Enables/disables the whole feature — **not** per-card |
| Status & product decisions | `PLAN.md` §6 | Source of truth for which cards are shipped and confirmed UX decisions — check this first, it changes as cards ship, don't rely on memory |

---

## Access & config conventions (apply to every route, no exceptions)

- Every route is decorated `@user_required` (from `routes/auth.py`) — all demos require Google sign-in. There is no anonymous or IP-rate-limited path.
- `_client()` reads `ANTHROPIC_API_KEY` from the environment only — **no encrypted admin DB field** (confirmed product decision). Returns `None` if unset; the route returns `503` immediately, before doing anything else expensive.
- Any new external API key (e.g. `VOYAGE_API_KEY` for a future RAG card) follows the same shape: env-var only, checked synchronously up front, `503` (never a crash) when missing. Mirrors `mcp_runtime.is_configured()`, which gates `mcp_chat` before a connection is even attempted.
- The whole feature has a deployment-time kill switch, separate from the runtime "coming soon" tiles: `ENABLE_AI_DEMOS` (backend, gates blueprint registration in `app.py`) / `VITE_ENABLE_AI_DEMOS` (frontend, dead-code-eliminates the routes at build time). New demos ride along automatically — no per-demo flag needed.
- The `messages` validation block — `role` must be `user`/`assistant`, `content` a string, capped by `MAX_MESSAGES`/`MAX_MESSAGE_CHARS` — is copy-pasted verbatim at the top of every chat route in `ai_demo.py`. Reuse it exactly; don't rewrite it per-route.

---

## The most important decision per demo: where does the tool run?

This determines the entire route shape. Get this wrong and either the loop never terminates correctly or the UI shows events out of order.

### No tools — plain streaming
`conversation`: `mimetype='text/plain'`, `client.messages.stream(...)`, yield `stream.text_stream` chunks directly to the response.

### Client-executed tools — loop + NDJSON
`tool-use`, `mcp`: `mimetype='application/x-ndjson'`, events `text_delta` / `tool_call` / `tool_result` / `done` / `error`, one JSON object per line.

Loop up to `MAX_TOOL_ITERATIONS` (currently 6):
1. `client.messages.stream(...)`, yield `text_delta` for each `stream.text_stream` chunk.
2. `final_message = stream.get_final_message()`.
3. Append the assistant turn via `_assistant_content_for_replay(final_message)` — **required**: `message.model_dump()` includes response-only fields (e.g. a null `parsed_output`) that the API's input schema rejects with "Extra inputs are not permitted" if replayed verbatim as the next request's history.
4. If `stop_reason != 'tool_use'`, yield `done` and return.
5. Otherwise, for each `tool_use` block: yield `tool_call`, execute the tool locally (`_run_tool` for hardcoded tools, `_run_mcp_tool` for MCP), yield `tool_result`, append a `tool_result` user-role block, loop again.

`mcp` uses the **identical** loop shape — only the tool source differs (`tools=mcp_runtime.get_anthropic_tools()` instead of a hardcoded `TOOL_SCHEMAS` list, and `_run_mcp_tool` calls `mcp_runtime.call_tool()` instead of a local Python function).

### Server-executed tools — single call, no loop, but order requires care
`web-search` (and any future Anthropic built-in server tool — code execution, computer use, etc.): also NDJSON, but Anthropic resolves the tool call and continuation entirely within **one** `stream()` call. No `MAX_TOOL_ITERATIONS` loop needed.

**The pitfall** (found the hard way building `web-search`): draining `stream.text_stream` fully and then reading tool blocks from `get_final_message()` afterward — the client-tool pattern — silently reorders the UI. All text ends up displayed before any tool card, even when a search happened in the middle of the answer, because `text_stream` flattens every text segment together regardless of what happened between them.

**The fix**: iterate the raw stream directly instead of `text_stream`:

```python
with client.messages.stream(model=MODEL, max_tokens=..., system=system, messages=messages, tools=[TOOL]) as stream:
    tool_names = {}  # tool_use id -> name, since result blocks don't carry their own name
    for event in stream:
        if event.type == 'content_block_delta' and event.delta.type == 'text_delta':
            yield ndjson({'type': 'text_delta', 'text': event.delta.text})
        elif event.type == 'content_block_stop':
            block = stream.current_message_snapshot.content[event.index]
            if block.type == 'server_tool_use':
                tool_names[block.id] = block.name
                yield ndjson({'type': 'tool_call', 'id': block.id, 'name': block.name, 'input': block.input})
            elif block.type == 'web_search_tool_result':
                name = tool_names.get(block.tool_use_id, TOOL['name'])
                # block.content is list[WebSearchResultBlock] on success, WebSearchToolResultError on failure
                ...
```

Why this works: `stream.current_message_snapshot` at the moment of a block's `content_block_stop` event already has that block's `input`/`content` fully accumulated (confirmed against `anthropic/lib/streaming/_messages.py` — `accumulate_event()` merges the block *before* `build_events()` yields anything for that event), so reading it there preserves true chronological order without waiting for the whole response to finish.

Full reference implementation: `web_search_chat` in `backend/routes/ai_demo.py`.

---

## Model & token choices are per-demo, not global

`MODEL = 'claude-sonnet-5'` is the default, but:
- `mcp` deliberately uses a cheaper `MCP_MODEL` (`claude-haiku-4-5-...`) because it's a tool-heavy demo that can make several repeated calls per turn.
- `web-search` uses its own `WEB_SEARCH_MAX_TOKENS` (4096) instead of the shared `MAX_TOKENS` (1024) because cited search answers run longer than the other demos' short tool responses.

When a new demo's cost or length profile differs from the default, add a demo-specific constant — don't bump the shared constant for every other demo.

---

## Frontend page pattern

Every `frontend/src/pages/ai-demos/*.jsx` file is a near-full copy of the same ~500-line structure. **This is the established convention** — no shared-component extraction has happened yet. Worth flagging as a future refactor candidate if it comes up, but don't extract components unprompted; copy the existing pattern instead so the codebase stays consistent.

Pieces to copy verbatim, not reinvent:

- **`renderInline` / `parseMarkdownBlocks` / `MarkdownText`** — a hand-rolled minimal markdown renderer (headings, bold/italic/inline code, lists, paragraphs). No markdown dependency is used on purpose.
- **The reveal-timer.** Accumulate the full response text in a plain JS variable as chunks arrive, then tick it onto screen at a fixed 15ms interval with an adaptive step size (`backlog > 60 ? ceil(backlog/30) : 1`), independent of how the network actually chunked it. This is what makes even a single large NDJSON `text_delta` (e.g. from a backend that isn't truly token-streaming that segment) *look* like natural streaming. Reset `fullText`/`revealedLength`/`currentTextBlock` to a fresh block whenever a non-text event (tool_call, tool_result) interrupts the text.
- **Scroll-follow refs** — `autoFollowRef`, `programmaticScrollRef`, `scrollEndTimerRef`, plus `handleScroll`/`scrollToBottom`. Copy as-is.
- **`toApiMessage(m)`** — collapses a display message down to the plain `{role, content}` shape the backend expects. `tool_call`/`tool_result` blocks are always a display-only concern, replayed fresh by the backend on its own — never sent back to it by the client.
- **`SignInRequiredModal`** + an invisible overlay `<button>` covering the input bar (and any demo-specific controls) when signed out, so an unauthenticated visitor sees the UI but can't interact with it without triggering the sign-in prompt.
- **`ToolCard`** needs a demo-specific rendering branch whenever a tool's output isn't generically JSON-dumpable — e.g. web-search's `{title, url, page_age}` rows render as linked list items, not a JSON blob. Always keep the generic `JSON.stringify` fallback for the error case (`is_error: true`, where `output` is a plain string).

---

## Wiring checklist for a new or changed demo

- [ ] Backend route(s) in `backend/routes/ai_demo.py`, following the client-tool-loop or server-tool pattern above (pick based on how the capability's tool actually executes)
- [ ] New `.env.example` var only if a new API key is needed — env-var only, no admin UI field
- [ ] New dependency in `requirements.txt` only if needed (e.g. `voyageai` for RAG)
- [ ] New page in `frontend/src/pages/ai-demos/<Name>Page.jsx`
- [ ] Import + route entry in `frontend/src/router.jsx`'s `AI_DEMOS_ENABLED`-guarded array
- [ ] Flip `available: true` (and tighten the description) for that `key` in `AIDemoPage.jsx`'s `DEMOS` array
- [ ] Update `PLAN.md` §6's status line

## Testing

- [ ] Sign in via Google OAuth (see the `testing-credentials` skill) and confirm the demo's happy path end-to-end
- [ ] Confirm the route returns `503` immediately (no hang, no thread/connection spun up) when the relevant API key is unset
- [ ] Sign out and confirm the overlay gates the input bar, matching the other demo pages
- [ ] For any tool-using demo, confirm tool cards render in true chronological order — not all text followed by all tool cards
