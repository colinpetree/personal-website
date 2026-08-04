Your goal is to review the code written or modified in this session for robustness, logic errors, and missing or broken pipelines.

Do the following:
1. Scope the review to this session's changes, not the whole repo. Identify every file created or edited during the conversation from context, then confirm against `git status` and `git diff --stat` (use `git diff` for the exact line-level changes). Explicitly exclude pre-existing code the session didn't touch.
2. Trace each change end-to-end. For a new or modified function or route, follow the data from input to output: what calls it, what it calls, what shape data arrives in and leaves in. For any new backend endpoint, confirm it's actually wired up — blueprint registered, route imported and called from the frontend, no dangling piece that nothing invokes. This is a full pipeline check, not just reading the function in isolation.
3. Check these robustness categories on every changed file:
   - Input validation and boundary/empty-input cases (empty lists, null/None, zero-length strings, missing optional fields)
   - Error handling — are exceptions caught where they can realistically occur, and does the failure path leave the system in a sane state (no partial writes, no unhandled promise rejection, no silently swallowed error)?
   - State management (frontend) — are refs/state reset when they need to be between renders or requests; can a stale closure or race condition occur (e.g. two in-flight requests, an abort mid-stream)?
   - Resource cleanup — timers, event listeners, open connections/streams closed on every exit path, not just the happy path
   - Off-by-one and ordering bugs, especially in loops, streaming/event-ordering code, and pagination
4. Cross-reference against any reference or original implementation the new code was adapted from (e.g. a sibling page or route it was copied and modified from). Diff the behavior mentally against that source to catch places where the adaptation silently dropped or altered logic that still mattered.
5. Verify library/API usage against the actual installed version, not assumed API shape — check the installed package source (e.g. `site-packages`, `node_modules`) or run a quick syntax/import check rather than trusting memory of an API.
6. Flag anything that can't be verified in this environment (no network, no live API keys, no running dev server) as an explicit open item rather than silently assuming it works. Name exactly what a human should manually check before calling it done.
7. Report findings ranked by severity. If nothing survives scrutiny, say so plainly rather than padding the report with nitpicks.

<example>
**Stale reveal-timer state on abort** — `frontend/src/pages/ai-demos/WebSearchPage.jsx:310`
Scenario: user sends a message, then navigates away mid-stream. `abortControllerRef.current?.abort()` fires on unmount, but `revealTimerRef` is only cleared in the `catch` block's `stopRevealing()` — if the abort races the `catch`, the interval can keep ticking against an unmounted component's `setMessages`.
</example>

For simple, isolated changes, a short "reviewed X, no issues found" is enough — skip the full checklist writeup if the change is small and self-evidently correct. Always name the concrete failure scenario for a finding, not just "this could be a problem."
