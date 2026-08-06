# Personal Website — Overview Plan (Status: 2026-07-31)

## Context

This replaces the original "make an overview plan" request. The original spec (reproduced in full at the bottom) was written before implementation began. Significant progress has happened since — the Lexical blog editor was built out far beyond spec, several features were deliberately redesigned along the way (feature image instead of auto-thumbnail, top-level post URLs instead of `/blog/slug`, a full 4-tier role system instead of flat admin privilege), and some spec items were never started (AI chat, payments, deploy infra). This document is the new source of truth: as future tasks come in, check here first to see how they fit into what already exists and what's still owed.

Checkbox key: `[x]` done, `[~]` partial/needs follow-up, `[ ]` not started.

---

## 1. Router
- [x] React Router (`createBrowserRouter`) with dynamic route generation from `SiteConfig` slugs — `frontend/src/router.jsx`.

## 2. Navbar
- [x] Config-driven nav (`config.nav` array from `backend/routes/site_config.py:15-58`), filtered by `enabled` — `frontend/src/components/Navbar.jsx`.
- [x] All 7 pages wired: Home, Blog, Projects, About, Contact, AI Implementations, Donate.
- [x] Contact only shows when SMTP is configured; Donate only shows when a Stripe publishable key is set **and** public users (Google login) are enabled — since donating now requires signing in (see §5).

## 3. Website Admin

### 3a–3g. Per-page admin config
| Page | Enable/disable | Name/slug | Content/extra fields | Status |
|---|---|---|---|---|
| Home | ✅ | ✅ (fixed `/`) | ✅ site title, page text (Lexical), meta description | **DONE** |
| Blog | ✅ | ✅ | — | **DONE** |
| Projects | ✅ | ✅ | ✅ page text (Lexical), meta description, + full project CRUD (image, reorder, visibility — beyond spec) | **DONE** |
| About | ✅ | ✅ | ✅ page text (Lexical), meta description, headshot upload | **DONE** |
| Contact | ✅ | ✅ | ✅ full SMTP fields, Test Email dialog | **DONE** (see gap below) |
| AI Implementations | ✅ | ✅ | — (API keys are env-var only, no admin UI field) | **DONE** as a config shell; page itself is unbuilt (see §6) |
| Donate/Contribute | ✅ | ✅ | ✅ Stripe publishable/secret/webhook key fields (encrypted) | **DONE** — full Stripe Checkout integration (see §5) |

- [x] Domain field → writes `backend/certbot_domain.txt` on save (`backend/routes/admin_config.py:182-186`).
- [x] Favicon upload (PNG/JPG/JPEG/GIF, plus WebP) → applied via JS-injected `<link rel="icon">` in `Navbar.jsx:29-39`.
- [x] Admin login (email/password) — `AdminLoginPage.jsx` + `backend/routes/admin_auth.py`.
- [x] Admin password reset flow — forgot-password link, reset-token endpoints in `backend/routes/admin_auth.py`, reset email via existing SMTP settings. Shipped alongside "sign in as admin" flow and a shared email helper.

### 3d. Blog Posts (Lexical editor)
- [x] WYSIWYG Lexical editor → `content_html`.
- [x] Image upload with caption below image.
- [x] Video upload **and** YouTube/Vimeo embed nodes (plus a bonus Spotify embed node, not in spec).
- [x] Draft/scheduled/published status; unpublished and future-scheduled posts excluded from public API; auto-promotion of scheduled → published once the publish date passes.
- [x] Publish date is freely editable (schedule ahead or backdate).
- [x] SEO meta description field on posts, rendered as a real `<meta name="description">` tag on the public post page (falls back to the post excerpt if no meta description is set) — `frontend/src/utils/meta.js`, used in `BlogPostPage.jsx`.
- [x] Thumbnail — **redesigned from spec**: instead of auto-extracting the first in-body image, there's now a dedicated manual "Feature Image" field with its own caption, shown above the title on the post page and next to the excerpt on the list page. Intentional product decision, not a gap.
- [x] Blog title → `<title>` tag.
- [x] Editable slug, auto-derived from title (spaces → hyphens), both client- and server-side.
- [x] Article URLs — **redesigned from spec**: top-level (`/my-post`) instead of `/blog/my-post`, per a later decision. Reserved-slug and duplicate-slug conflict prevention implemented server-side against admin/static page paths and other posts.
- [x] Admin comment management (list + soft-delete) — `AdminBlogCommentsPage.jsx` + `backend/routes/admin_blog.py`.

### 3e/3f already covered above (Domain, Favicon).

### 3g. Users (admin-side)
- [x] Enable/disable users toggle.
- [~] "Disables comments when off" — in practice it doesn't block commenting, it falls back to a guest-comment form instead. Behavior differs from spec's "disables" wording; worth a decision on whether that's acceptable or needs tightening.
- [x] "Disables payments when off" — resolved as a side effect of requiring Google login to donate (see §5): the donate nav item now also checks `users_enabled`, and the donate page itself is gated behind sign-in.
- [x] Google OAuth client ID/secret configurable in admin.
- [x] Admin editing a user's profile (name/title/email) — `PUT /api/admin/users/<id>` now accepts `name`/`email`/`title` (`backend/routes/admin_users.py`), surfaced via a profile editing modal + shared `Select` component on the frontend.
- [x] Prevent a user from commenting (`can_comment` toggle).
- [x] Export users to CSV.

### 3h. Admin Accounts
- [x] Add-account dialog with Name/Title/Email/Password (+ role).
- [x] First admin seeded with default email `admin` / default password `admin`, role `owner` (`backend/seed.py`).
- [x] Role hierarchy (`contributor < editor < administrator < owner`) replaces the original spec's flat equal-privilege accounts — deliberate upgrade, confirmed working well. Owner-role deletion protection (rather than "first account ever created") is the accepted design; no change needed here.

## 4. Users (public-side, Google OAuth)
- [x] Google OAuth login (`backend/routes/auth.py`).
- [x] Users edit their own name/title shown in comments.
- [x] Threaded commenting (replies to posts and to other comments).
- [x] Users accessing a payment form on the donate page — now built (Stripe Checkout). Donating **requires** Google sign-in (a deliberate deviation from the original spec's "access to payment form" wording, decided so subscription self-management could reuse the existing user-identity system — see §5).

## 5. Donate/Contribute page

### Shipped (2026-07-31)
- [x] Stripe API key fields in admin config (publishable + secret + webhook signing secret, all encrypted) — `backend/models.py`, `backend/routes/admin_config.py`, `frontend/src/pages/admin/AdminDonatePage.jsx`.
- [x] Public payment form — `frontend/src/pages/DonatePage.jsx`: preset ($5/$10/$25/$50) + custom amount, one-time/monthly toggle, redirects to Stripe-hosted Checkout (no card data touches our backend). Handles `?status=success` / `?status=cancelled` return states.
- [x] One-time vs. subscription options via Stripe Checkout `mode: payment | subscription` with inline `price_data` (no pre-created Stripe Price objects needed).
- [x] **Donations require Google sign-in** — the donate form is gated behind the same "Sign in with Google" pattern used for blog comments (`UserCommentForm` in `BlogPostPage.jsx`, reused in `DonatePage.jsx`). Decided so subscription self-management could identify the donor without a separate email-verification system.
- [x] `Donation` ledger table (`backend/models.py`) — `user_id` FK, `stripe_customer_id`/`stripe_subscription_id`, `stripe_object_id` (unique, idempotency against webhook retries), `amount`, `mode`, `created_at`. A brand-new table, so `db.create_all()` picked it up automatically on restart — no manual `ALTER TABLE` needed (unlike the `stripe_webhook_secret` column on the existing `site_config` table).
- [x] Stripe checkout/webhook backend routes — `backend/routes/donate.py`:
  - `POST /api/donate/create-checkout-session` (`@user_required`) — passes `customer_email`/`client_reference_id` so the webhook can tie payments back to the logged-in `User`.
  - `POST /api/donate/webhook` — verifies the Stripe signature; `checkout.session.completed` records the first charge (one-time or a subscription's first invoice), `invoice.paid` records subscription **renewals** only (skips `billing_reason=subscription_create` to avoid double-counting the same invoice); both are idempotent via `stripe_object_id`.
  - `POST /api/donate/manage-subscription` (`@user_required`) — finds the caller's latest subscription `Donation`, opens a Stripe Billing Portal session, returns the redirect URL. Surfaced as a "Manage your subscription" link on `DonatePage.jsx`.
  - `GET /api/admin/donate/summary` (`role_at_least('administrator')`) — total received, this-month total, and a recent-transactions list (joined to `User` for donor name), rendered as a "Donations" dashboard card on `AdminDonatePage.jsx` (admin-only, same gate as the Stripe keys card).
- [x] Nav visibility (`backend/routes/site_config.py`) — donate nav item now also requires `users_enabled`, since donating requires being logged in; closes the previously-tracked "disables payments when off" gap as a side effect.
- `stripe` added to `requirements.txt`, blueprint registered in `backend/app.py`.

**Manual steps required** (this project has no migration tooling, per `CLAUDE.md`):
1. Run `ALTER TABLE site_config ADD COLUMN stripe_webhook_secret TEXT;` in pgAdmin (existing-table column addition needs this; the new `donation` table does not).
2. Run `pip install -r requirements.txt` in the backend venv for the new `stripe` dependency.
3. In the Stripe Dashboard, create a webhook destination at `https://<domain>/api/donate/webhook` listening for `checkout.session.completed` and `invoice.paid`, and paste its signing secret into the admin donate page.
4. In the Stripe Dashboard, save a default Customer Portal configuration (Settings → Billing → Customer portal) — required before `manage-subscription` will work.

**Verified locally** (2026-07-31) via `stripe listen` in test mode: checkout → payment → `checkout.session.completed` webhook → `Donation` row recorded end to end. One bug fixed during testing — the installed `stripe` SDK returns `StripeObject`s that don't support dict-style `.get()`; switched to `getattr(obj, 'field', default)` throughout the webhook handler. Renewal (`invoice.paid`), the admin dashboard numbers, and the manage-subscription portal redirect are implemented but not yet individually re-verified after that fix.

**Open question — revisit later**: is requiring Google login for *all* donations (including small one-time gifts) the right call? Flagged by the user as likely to change — it adds real friction before payment for casual donors and doesn't add actual payment security (Stripe already owns fraud/chargeback risk independent of site login). It was chosen because it made subscription self-management trivial to build safely with no separate identity-verification system. If revisited, the likely direction is: allow anonymous one-time checkout, and only require identity (login or a magic-link-style email flow) for the manage-subscription path specifically — which would need `create_checkout_session` to support an anonymous path and `Donation.user_id` to become nullable. Not scheduled.

## 6. AI Implementations page

- [~] **8 of 8 v1 cards shipped: Conversation basics, Tool use, MCP, Web search, RAG, Prompt evaluation, Prompt engineering, Vision.** `AIDemoPage.jsx` is a Google-login-gated grid of all 8 cards, all clickable. Backend: `backend/routes/ai_demo.py` (`ai_demo_bp`, registered in `app.py` gated on `ENABLE_AI_DEMOS`) exposes one route per demo under `/api/ai-demo/<demo>/<action>`, always `@user_required`, always a `_client()` → 503 guard when `ANTHROPIC_API_KEY` is missing (env-var only, confirmed decision — no encrypted admin fields). Conversation basics streams plain text; Tool use and MCP run a client-side agentic tool loop (NDJSON `text_delta`/`tool_call`/`tool_result`/`done`/`error` events); Web search uses Anthropic's built-in server-side `web_search_20250305` tool (`server_tool_use`/`web_search_tool_result` content blocks), single-call (no client loop needed), events assembled by iterating `stream.current_message_snapshot` at each `content_block_stop` to preserve real chronological order. RAG is a single query → results UI (not chat): `backend/rag_index.py` ports the reference notebooks' from-scratch `VectorIndex`/`BM25Index`/`Retriever` (reciprocal rank fusion) classes over a fixed canned sample document, lazily building the index once per process (module-level cache + lock) on first request; `POST /api/ai-demo/rag/search` gates on both `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` (`voyageai`, now in use), yields one `retrieval` NDJSON event (vector/bm25/hybrid ranked chunks) followed by `text_delta`s for an answer generated only from the hybrid results. Prompt evaluation is a run-and-results UI (not chat): `POST /api/ai-demo/prompt-evaluation/run` runs a fixed 3-case dataset (JSON/Python/regex code-gen tasks) through a `ThreadPoolExecutor` two-stage pipeline — all 3 outputs generated concurrently, then all 3 graded concurrently (a local deterministic syntax check plus an LLM-judge rubric score) — yielding `output`/`graded` NDJSON events via `as_completed` as each test case finishes each stage, so `PromptEvaluationPage.jsx` renders 3 side-by-side columns that resolve together rather than one at a time. Prompt engineering is a single-input, side-by-side output UI (not chat): `POST /api/ai-demo/prompt-engineering/run` takes a visitor-editable passage (defaults to a canned sample), runs it through a fixed naive prompt and a fixed refined prompt concurrently via the same `ThreadPoolExecutor` two-stage pattern (generate both, then grade both against one shared `solution_criteria` with the same LLM-judge rubric approach as Prompt evaluation, minus the syntax-check stage since there's no deterministic format to validate here), yielding `prompts`/`output`/`graded`/`summary` NDJSON events so `PromptEngineeringPage.jsx` shows both prompts' text plus their scored outputs side by side with a score-delta summary. Vision is an upload → analysis UI (not chat), and the simplest route shape of all eight — no tools, just `conversation-basics`'s plain-text `text/plain` stream: `POST /api/ai-demo/vision/analyze` takes a visitor-uploaded image (base64 + media_type, validated against a 5MB size cap and an allowed JPEG/PNG/GIF/WebP type set before any API call), sends it as an `image` content block alongside a single fixed general-purpose analysis prompt, and streams the response back — nothing is persisted to `backend/uploads/` or anywhere else, the image only ever exists in that one request. `VisionPage.jsx` is a drag-and-drop/click upload zone with an image preview, "Analyze image" trigger, and the same markdown-render + reveal-timer treatment as every other demo's output.
- Not yet manually verified in-browser (needs a real Google OAuth login to reach the gated page) — should be smoke-tested before considering this slice fully done.

### Reference material
Source: `C:\Users\Colin\src\claude-learning-repo\02-claude-api` — a personal Claude API certification course repo. Read in full to extract the intended demo scope. Each module below is a working, runnable reference implementation (notebooks unless noted) for one capability:

| Module | What it demonstrates | Reusable pattern |
|---|---|---|
| `01-accessing-the-api` | Basic `messages.create`, system prompts, temperature, streaming (text and tool-call deltas), structured/controlled output parsing | Core `Claude` client wrapper (see `07-model-context-protocol/.../core/claude.py`) — thin wrapper exposing `chat()`, `add_user_message`, `add_assistant_message`, `text_from_message` |
| `02-prompt-evaluation` | A `PromptEvaluator` harness: runs a prompt against a dataset of test cases concurrently, validates output structure, scores results | Eval-harness pattern — good fit for a "watch a prompt get graded against test cases live" demo |
| `03-prompt-engineering` | Same eval harness applied to a "Report Builder" exercise — before/after prompt refinement | Could be folded into the same card as prompt evaluation, or shown as a distinct "prompt engineering" comparison view |
| `04-tool-use` | Progression: single tool call → multi-turn tool use → streaming tool use → **text editor tool** (Claude edits a virtual file) → **web search** (Anthropic's built-in server-side tool) | Tool-use loop pattern (`ToolManager.execute_tool_requests` in `core/tools.py`) |
| `05-rag-and-agentic-search` | Full RAG built from scratch: chunking (char/sentence/section) → Voyage embeddings → `VectorIndex` → `BM25Index` (keyword) → hybrid `Retriever` combining both | Richest module — a genuine "how RAG works" demo, not a vector-DB wrapper |
| `06-claude-features` | Extended thinking (incl. redacted-thinking handling), vision/image input (fire-risk-from-photo example), citations, prompt caching (cache breakpoints w/ token-cost takeaways), server-side code execution | Each is close to a standalone single-request demo |
| `07-model-context-protocol` | Full working MCP client/server CLI chat app: `Claude` wrapper, `Chat`/`CliChat` agentic loop (tool_use → execute → continue), `ToolManager` (multi-client tool discovery), a document MCP server exposing tools/resources/prompts, `@mention` resource injection, `/slash-command` prompt invocation | Clearest template for an MCP demo — adapt the CLI loop to a web chat UI |
| `08-anthropic-apps/app_starter` | FastMCP tool-package starter (math tools, PDF/DOCX-to-markdown via MarkItDown) with strict docstring/Field conventions for tool descriptions | Reference for how a tool's description should read to an AI client — useful if a demo shows the tool definition alongside its use |

### Product design
- Public `/demo` page shows a **grid of cards**, one per AI capability, each with a title + short description.
- Clicking a card navigates to a **dedicated full-page demo** for that capability.
- Demos are **independent** — no requirement to chain/combine capabilities (e.g. the tool-use demo doesn't need to also show RAG). Each page's job is just to showcase that one capability clearly.

### Decisions (confirmed with user, 2026-07-31)

**v1 card list** (8 cards, each its own full-page demo, independent of the others — no requirement to chain capabilities together). **Only cards where a back-and-forth conversation is actually the point of the capability use a chat UI; the rest use whatever interface best shows that specific capability** — a demo isn't a general-purpose AI chat app, it's a focused showcase of one feature:

1. **Conversation basics** — **chat UI.** Streaming chat, system prompt, temperature control — this is the one card where "chatting" itself is the capability being shown. Source: `01-accessing-the-api`.
2. **Tool use** — **chat UI** (conversation is how a tool call naturally gets triggered and its result gets used). Claude calls a defined tool mid-conversation and uses the result. Source: `04-tool-use/009-011`.
3. **RAG / hybrid search** — **single query → results UI**, not an open chat. Visitor enters a search query, sees retrieved chunks (vector/BM25/hybrid) and the final answer grounded in them. Source: `05-rag-and-agentic-search`.
4. **MCP** — **chat UI** (conversation is how tool discovery/invocation across an MCP server plays out). Source: `07-model-context-protocol/cli_project_COMPLETE`.
5. **Prompt evaluation** — **run-and-results UI**, not a chat. Trigger a run against the test-case dataset, watch per-row scoring populate, see an aggregate score. Framed as a general "systematically evaluate a pipeline's outputs" capability, not just a prompt-tuning tool. Source: `02-prompt-evaluation`.
6. **Prompt engineering** — **single-input, side-by-side output UI**, not a chat. One input field, two outputs (naive vs. refined prompt) shown at once. Source: `03-prompt-engineering`.
7. **Web search tool** — **single query → answer UI** (optionally chat-like since search can be iterative, but doesn't need full conversation history — a fresh query each time is fine). Source: `04-tool-use/013_Web_Search`.
8. **Vision / image input** — **upload → analysis UI**, not a chat. Visitor uploads an image, sees Claude's analysis of it via one fixed general-purpose analysis prompt (not the reference notebook's narrow fire-risk-assessment example, and no bundled sample gallery — upload only). Source: `06-claude-features/002_images`.

**Conversation state (for the chat-UI cards only)**: session-only, in-memory for the duration of the page view — no persisted chat history, no DB storage, no resuming a conversation after refresh/navigation. These are demos of a capability, not a chat product; each visit starts fresh.

**Not in v1** (noted for future work, not currently planned): extended thinking, text editor tool, citations, prompt caching, code execution. These map to existing reference-repo modules (`06-claude-features/001_thinking`, `04-tool-use/012_Text_Editor_Tool`, `06-claude-features/003_citations`, `06-claude-features/004_caching`, `06-claude-features/005_code_execution`) if picked up later.

**RAG data source**: a fixed sample dataset (small canned document set, similar in spirit to the reference repo's deposition/report/financials example) — not the site's live blog content, and not visitor-uploaded documents. Keeps the demo self-contained and independent of how much blog content exists at any given time.

**Access control**: demos require Google login (reuse the existing `UserAuthContext`/Google OAuth system already built for blog comments) rather than being open to anonymous visitors or rate-limited by IP. This ties every live Anthropic/Voyage API call to an identifiable account for abuse tracing and keeps the existing users system as the single gate for anything that costs money to run.

### Still open for the implementation-planning pass (not yet decided)
- Exact backend architecture: one Flask blueprint per demo vs. a shared `AIDemoService`-style module.
- Whether `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` stay env-var-only or get admin-configurable fields (current `AdminAIDemoPage.jsx` only documents them as env vars).
- Frontend: new `frontend/src/pages/AIDemoPage.jsx` becomes the card grid; each demo likely gets its own route (e.g. `/demo/tool-use`) and page component under a new `frontend/src/pages/ai-demos/` directory.

### Build flag: making the whole AI demo feature optional for other users of this project (shipped 2026-07-31)

Since this repo is meant to be reusable by other people standing up their own site from it, the AI demo section (tied to the site owner's own Anthropic/Voyage API keys and spend) needed to be excludable — not just hidden via the existing `ai_demo_enabled` DB toggle, which only hides the nav link while routes/admin settings stay reachable regardless.

Added a **deployment-time** env flag on both sides (separate from the runtime `ai_demo_enabled` toggle):
- Backend: `ENABLE_AI_DEMOS` (default `true`), read in `backend/app.py` into `app.config['ENABLE_AI_DEMOS']`. The `/api/site-config` nav entry's `enabled` now also requires this flag (`backend/routes/site_config.py`), and `backend/routes/admin_config.py` omits `ai_demo_enabled`/`ai_demo_page_name`/`ai_demo_slug` from the admin GET response and rejects them on PUT when the flag is off. A comment in `app.py` marks where the future `ai_demo_bp` registration should be gated on this flag once the feature is built.
- Frontend: `VITE_ENABLE_AI_DEMOS` (default `true`), read via `import.meta.env.VITE_ENABLE_AI_DEMOS !== 'false'` in `frontend/src/router.jsx` (wraps both the public `/demo` route and the admin `/admin/demo` route) and `frontend/src/components/admin/AdminLayout.jsx` (wraps the "AI Demo" sidebar link). Vite inlines `import.meta.env.*` as literals at build time, so these branches dead-code-eliminate when the flag is `false`.
- Documented in `backend/.env.example` and the new `frontend/.env.example`. Not a full code-deletion split — the AI demo files still exist in the repo either way; a forker wanting zero trace can additionally delete `backend/routes/ai_demo.py` (once built) and `frontend/src/pages/ai-demos/`, called out in the `.env.example` comments.

## 7. Build script
- [x] Frontend build (`vite build` via `frontend/package.json`).
- [ ] **No combined frontend+backend build/deploy script.** No Dockerfile, docker-compose, Makefile, or CI/CD config anywhere in the repo.
- [ ] **Flask does not serve the built frontend.** No static/catch-all route in `backend/app.py`. Frontend and backend are architected as two separately-deployed services (implying a reverse proxy is expected in front of them), but that reverse-proxy layer doesn't exist in-repo either.

## 8. Dependency lists
- [x] `backend/requirements.txt` — pinned, reasonably complete for what's built (no `stripe`, no `anthropic`/`voyageai` — consistent with §5/§6 being unbuilt).
- [x] `frontend/package.json` — complete for what's built.

## 9. Deploy dependencies: Let's Encrypt / Certbot, Varnish
- [~] **Certbot — domain-capture half only.** Saving `domain` in admin config writes `backend/certbot_domain.txt` (gitignored). No actual certbot invocation, renewal automation, or reverse-proxy config exists anywhere in the repo — something external is expected to consume that file, but that external piece isn't part of this codebase yet.
- [ ] **Varnish — zero references anywhere.** Not started at all.

---

## What's actually left to reach the current target (priority-ordered, roughly cheapest → biggest)

1. ~~Admin password reset~~ — **done**, see §3a above.
2. ~~Render `meta_description` as a real `<meta name="description">` tag~~ — **done**. `frontend/src/utils/meta.js` adds a shared `setMetaDescription()` helper that upserts `<meta name="description">`; wired into `BlogPostPage.jsx` (post's `meta_description`, falls back to `excerpt`), `HomePage.jsx`, `AboutPage.jsx`, `ProjectsPage.jsx` (their `*_meta_description` config fields). `backend/routes/site_config.py` now also exposes `home_meta_description`/`projects_meta_description`/`about_meta_description` on the public `/api/site-config` endpoint (previously admin-only).
3. **Next up.** Wire `users_enabled=false` to actually disable commenting (not just fall back to guest mode) — the donate-page half of this is now done, see §5.
4. ~~Admin ability to edit a user's own profile fields (name/title/email)~~ — **done**, see §3g above.
5. ~~AI Implementations page~~ — **done**: all 8 v1 cards shipped (conversation basics, tool use, RAG, MCP, prompt evaluation, prompt engineering, web search, vision), see §6 above. Not yet manually smoke-tested in-browser.
6. ~~Donate/Contribute — Stripe Checkout integration~~ — **done**, see §5 above.
7. Deployment infrastructure: combined build pipeline, Flask/nginx static-serving or reverse-proxy setup, actual certbot automation consuming `certbot_domain.txt`, Varnish cache layer, and general "how does this get deployed to a Linux box" documentation/scripting — none of this exists yet.

## Deliberate deviations from the original spec (not gaps — just documenting the decision trail)
- Blog thumbnails: manual "Feature Image" field, not auto-derived from the post's first image.
- Blog post URLs: top-level (`/my-post`), not nested under `/blog/`.
- Admin accounts: full 4-tier role hierarchy (`contributor < editor < administrator < owner`) instead of flat equal-privilege accounts, with owner-role deletion protection instead of first-account protection — confirmed working better than the original design, keep as-is.

---

## Original spec (for reference)

<details>
<summary>Original plan message, verbatim</summary>

Make a plan file for this project to include everything it will ultimately have when complete. As we take on tasks, we will read this plan file to determine the correct course of action to see how this task will interact with the other parts of the project to fit in as a whole. The areas that this project needs to include in the final delivery is as follows:

1. A router for loading different pages with different resources
2. A navbar that routes to the following pages (but more can be added later):
   - "Home" - Landing Page
   - "Blog" - List of Blog Posts that link to blog article pages
   - "Projects" - List of github or other code projects or other personal accomplishments worth mentioning
   - "About" - The personal about page that will focus on the author and have a headshot image
   - "Contact" - a form to fill out that will send an email to an address with the form information
   - "AI Implementations" - a chat interface that demos various AI functionalities (conversations, prompt evaluation, prompt engineering, RAG, tool use, MCP)
   - "Donate/Contribute" - a page where you can enter payment information to pay the author of the website one-time or subscription payments.
3. Website Admin — login page, login accounts (single privilege level originally), interface to admin all navbar pages (enable/disable, name, text, slug, extra settings per page as spelled out per-page above), blog post editor (Lexical-style WYSIWYG, image/video/embed upload, publish workflow, SEO, thumbnails, slugs, comment moderation), domain field driving Certbot/Let's Encrypt, favicon upload, Users admin (enable/disable, Google OAuth config, profile editing, CSV export), Admin Accounts management (add dialog, seeded first admin, first-admin deletion protection).
4. Users — Google OAuth signup, editable name/title for comments, threaded commenting, access to payment form.
5. Build script — builds frontend and backend for production.
6. Dependency list — for easy installation on a different machine; live site deployed on a Linux server.
7. Dependencies to add — Let's Encrypt Certbot, Varnish Cache.

</details>
