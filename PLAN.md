# Personal Website — Overview Plan (Status: 2026-08-08)

## Context

This replaces the original "make an overview plan" request. The original spec (reproduced in full at the bottom) was written before implementation began. Significant progress has happened since — the Lexical blog editor was built out far beyond spec, several features were deliberately redesigned along the way (feature image instead of auto-thumbnail, top-level post URLs instead of `/blog/slug`, a full 4-tier role system instead of flat admin privilege, Donate/Contribute renamed to "Payment" with guest checkout instead of requiring sign-in), and some spec items were never started (deploy infra). This document is the new source of truth: as future tasks come in, check here first to see how they fit into what already exists and what's still owed.

Checkbox key: `[x]` done, `[~]` partial/needs follow-up, `[ ]` not started.

---

## 1. Router
- [x] React Router (`createBrowserRouter`) with dynamic route generation from `SiteConfig` slugs — `frontend/src/router.jsx`.

## 2. Navbar
- [x] Config-driven nav (`config.nav` array from `backend/routes/site_config.py`), filtered by `enabled` — `frontend/src/components/Navbar.jsx`.
- [x] All 7 pages wired: Home, Blog, Projects, About, Contact, AI Implementations, Payment (renamed from "Donate/Contribute" — see §5).
- [x] Contact only shows when Mailgun is configured (redesigned from SMTP — see §3d/Contact below); Payment only shows when a Stripe publishable key is set. Signing in is **not** required to see or use the Payment nav item — guests can pay and manage subscriptions by email (see §5).

## 3. Website Admin

### 3a–3g. Per-page admin config
| Page | Enable/disable | Name/slug | Content/extra fields | Status |
|---|---|---|---|---|
| Home | ✅ | ✅ (fixed `/`) | ✅ site title, page text (Lexical), meta description | **DONE** |
| Blog | ✅ | ✅ | ✅ page text (Lexical) above the post list, meta description, comments toggle | **DONE** |
| Projects | ✅ | ✅ | ✅ page text (Lexical), meta description, + full project CRUD (image, reorder, visibility — beyond spec) | **DONE** |
| About | ✅ | ✅ | ✅ page text (Lexical), meta description (headshot upload removed — see below, photo is now just part of the page text) | **DONE** |
| Contact | ✅ | ✅ | ✅ page text (Lexical), meta description, Mailgun API key/domain fields (redesigned from SMTP — see below), Test Email dialog | **DONE** |
| AI Implementations | ✅ | ✅ | ✅ page text (Lexical), meta description (API keys are env-var only, no admin UI field) | **DONE** — config shell **and** all 8 v1 demo cards, see §6 |
| Payment | ✅ | ✅ | ✅ page text (Lexical), meta description, Stripe publishable/secret/webhook key fields (encrypted), comments toggle | **DONE** — full Stripe Embedded Checkout with guest support (see §5) |

- [x] Domain field → writes `backend/certbot_domain.txt` on save (`backend/routes/admin_config.py:182-186`).
- [x] Favicon upload (PNG/JPG/JPEG/GIF, plus WebP) → applied via JS-injected `<link rel="icon">` in `Navbar.jsx:29-39`.
- [x] Admin login (email/password) — `AdminLoginPage.jsx` + `backend/routes/admin_auth.py`.
- [x] Admin password reset flow — forgot-password link, reset-token endpoints in `backend/routes/admin_auth.py`, reset email via Mailgun (see redesign below). Shipped alongside a "sign in as admin" flow (`/api/admin/enter-public-site` — lets a logged-in admin browse the public site as themselves, evicting any regular-user session in the same browser) and a shared `backend/email_utils.py` helper.
- [x] Admin login rate limiting and lockout — per-IP throttling (`LoginAttempt` table, 50 attempts / 15 min window) plus a per-account lockout after `MAX_FAILED_ATTEMPTS` (`AdminAccount.failed_login_attempts`/`lockout_until`, 15-minute lockout) — `backend/routes/admin_auth.py`.
- [x] Email delivery — **redesigned from spec**: SMTP was replaced with the Mailgun HTTP API (`backend/email_utils.py`, `mailgun_api_key`/`mailgun_domain`/`smtp_from_email`/`forward_email` fields on `SiteConfig`). Used for the Contact form, admin password reset, and user magic-link sign-in (see §4).

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
- [x] "Disables comments when off" — **resolved 2026-08-08.** Guest commenting was removed entirely (`Add blog comments toggle and remove guest commenting`): `blog.py`'s `_comments_enabled()` now requires both `users_enabled` **and** the new `blog_comments_enabled` toggle, `BlogPostPage.jsx`'s guest name/email comment form is gone, and unauthenticated visitors are routed to `SignInRequiredModal` (Google or email sign-in) instead. Comments (blog and payment) now always carry a real `User`/`AdminAccount` identity — no more `guest_name`/`guest_email` path for new comments.
- [x] "Disables payments when off" — **superseded.** Payments no longer require sign-in at all (see §5's guest-checkout redesign), so `users_enabled` has no bearing on the Payment page anymore; this spec line no longer applies as originally worded.
- [x] Google OAuth client ID/secret configurable in admin.
- [x] Admin editing a user's profile (name/title/email) — `PUT /api/admin/users/<id>` now accepts `name`/`email`/`title` (`backend/routes/admin_users.py`), surfaced via `UserProfileModal.jsx` + shared `ui/Select.jsx` component.
- [x] Prevent a user from commenting (`can_comment` toggle).
- [x] Export users to CSV.

### 3h. Admin Accounts
- [x] Add-account dialog with Name/Title/Email/Password (+ role).
- [x] First admin seeded with default email `admin` / default password `admin`, role `owner` (`backend/seed.py`).
- [x] Role hierarchy (`contributor < editor < administrator < owner`) replaces the original spec's flat equal-privilege accounts — deliberate upgrade, confirmed working well. Owner-role deletion protection (rather than "first account ever created") is the accepted design; no change needed here.

## 4. Users (public-side)
- [x] Google OAuth login (`backend/routes/auth.py`).
- [x] **Beyond spec — magic-link email sign-in** (`Add magic-link email sign-in and user avatar uploads`, `Add email sign-in option to the sign-in modal`): a second sign-in path alongside Google, for visitors who don't want to use Google. `POST /api/auth/magic-link/request` emails a 15-minute single-use token via Mailgun (`_send_magic_link_if_valid`, run on a background thread so response timing can't be used to enumerate registered emails); `POST /api/auth/magic-link/verify` (surfaced at `/auth/magic` via `MagicLinkVerifyPage.jsx`) redeems it into a session. Auto-creates a `User` row on first request if the email isn't registered yet. If a Google-linked account already exists for that email, sign-in links onto the same row rather than erroring on the unique-email constraint. `SignInRequiredModal.jsx` now offers both options wherever sign-in is required.
- [x] **Beyond spec — user avatar uploads with cropping**: `User.avatar_filename` (and the matching `AdminAccount.avatar_filename` for staff) with an in-browser crop step (`AvatarCropperModal.jsx`, `utils/cropImage.js`) before upload, editable from `UserProfilePage.jsx` / `StaffProfileModal.jsx`. `User.display_avatar_url` prefers the uploaded file over the Google-provided `avatar_url`, falling back to it if no upload exists. Shown next to blog comments and payment comments (see §5).
- [x] Users edit their own name/title shown in comments.
- [x] Threaded commenting (replies to posts and to other comments) — guest commenting removed, all commenters are now signed in (see §3g).
- [x] Users accessing a payment form — now built (Stripe Embedded Checkout, see §5). **Redesigned from the original "requires Google sign-in" decision**: sign-in is no longer required at all for payments — guests can pay and manage subscriptions by email. Signed-in users still get a streamlined flow (name/email prefilled, "Manage your subscription" without re-entering an email).

## 5. Payment page (renamed from "Donate/Contribute")

Everything below shipped 2026-07-31 through 2026-08-08. The section title, routes, files, and DB table were all renamed **donate → payment** on 2026-08-06 (`Rename donate/donation to payment throughout the app`): `backend/routes/donate.py` → `backend/routes/payment.py`, `DonatePage.jsx`/`AdminDonatePage.jsx` → `PaymentPage.jsx`/`AdminPaymentPage.jsx`, the `donation` table → `payment` table, `/api/donate/*` → `/api/payment/*`, `donate_slug`/`donate_page_name` → `payment_slug`/`payment_page_name`. This doc uses the new names throughout; if older memory or notes reference "donate", they mean this section.

- [x] Stripe API key fields in admin config (publishable + secret + webhook signing secret, all encrypted) — `backend/models.py`, `backend/routes/admin_config.py`, `frontend/src/pages/admin/AdminPaymentPage.jsx`.
- [x] **Redesigned twice since the original build**: first from Stripe-hosted Checkout to **Stripe Embedded Checkout** (`ui_mode: 'embedded_page'`), then to drop the sign-in requirement entirely (`Switch payment checkout to Stripe Embedded Checkout with guest support`, `Allow guest checkout without requiring Google login`). This resolves the open question from the 2026-07-31 status: guests can now pay and manage subscriptions without ever signing in.
- [x] Public payment form — `frontend/src/pages/PaymentPage.jsx`: preset ($5/$10/$25/$50) + custom amount, one-time/monthly toggle, optional message + display name (guests only — signed-in users are identified via their `User.name`), embedded Stripe Checkout iframe, `?status=return&session_id=...` completion handling.
- [x] One-time vs. subscription options via Stripe Checkout `mode: payment | subscription` with inline `price_data` (no pre-created Stripe Price objects needed).
- [x] `Payment` ledger table (`backend/models.py`, renamed from `Donation`) — `user_id` FK (nullable — guests have none), `email`, `display_name`, `message`, `comment_visible`, `stripe_customer_id`/`stripe_subscription_id`, `stripe_object_id` (unique, idempotency against webhook retries), `amount`, `mode`, `created_at`.
- [x] Stripe checkout/webhook backend routes — `backend/routes/payment.py`:
  - `POST /api/payment/create-checkout-session` — no longer `@user_required`. Signed-in users get `customer_email`/`client_reference_id` set automatically; guests supply `display_name` directly and get `customer_creation: 'if_required'` in one-time mode (subscriptions always create a Stripe Customer on their own).
  - `POST /api/payment/checkout-session-status` — polls a session's status/payment_status for the return page.
  - `POST /api/payment/webhook` — verifies the Stripe signature; `checkout.session.completed` records the first charge (one-time or a subscription's first invoice) via `_record_payment`, `invoice.paid` records subscription **renewals** only (skips `billing_reason=subscription_create` to avoid double-counting), carrying forward the payer's identity but not their original message. Both idempotent via `stripe_object_id`.
  - `POST /api/payment/manage-subscription` (`@user_required`) — for signed-in users: finds their latest subscription `Payment`, opens a Stripe Billing Portal session.
  - `POST /api/payment/guest-portal-link` — **new, guest equivalent of manage-subscription**: takes an email, looks up the matching subscription by `Payment.email`, and emails a Billing Portal link via Mailgun. Always returns the same generic message regardless of whether the email matched (enumeration-resistant, mirrors the magic-link/reset-password pattern), and is IP-throttled via the new `PortalLinkRequest` table (5 requests / hour / IP). Any internal failure (bad Stripe key, mail failure) is logged but never changes the response shape.
  - `GET /api/payment/comments` — public, paginated list of payments that opted in to a visible comment (`comment_visible` + non-empty `message`), each with `display_name`, `amount`, `mode`, `message`, and the payer's avatar if they were signed in. Gated on the new `payment_comments_enabled` toggle. Rendered by `PaymentComments.jsx` on the public page.
  - `GET /api/admin/payment/summary` (`role_at_least('administrator')`) — total received, this-month total, recent-transactions list (now also shows `comment_visible` per row), on `AdminPaymentPage.jsx`.
- `stripe` in `requirements.txt`, blueprint registered in `backend/app.py`.

**Manual steps required** (this project has no migration tooling, per `CLAUDE.md`): see `backend/migrations/2026_donate_overhaul.sql` and `2026_donate_to_payment_rename.sql` for the exact `ALTER TABLE`/rename statements to run in pgAdmin, in addition to the original webhook-secret column addition and Stripe Dashboard webhook/Customer Portal setup already noted for the initial build.

**Verified locally** (2026-07-31, pre-rename) via `stripe listen` in test mode: checkout → payment → webhook → ledger row recorded end to end, including the `StripeObject`-has-no-`.get()` fix (`getattr(obj, 'field', default)` throughout the webhook handler). The guest-checkout and embedded-checkout redesign (2026-08-06) has not been individually re-verified against a live Stripe test session since.

**Open question from 2026-07-31 — now resolved**: the guest-checkout redesign above was the "likely direction" flagged back then, now shipped. No open question remains here.

## 6. AI Implementations page

- [x] **8 of 8 v1 cards shipped: Conversation basics, Tool use, MCP, Web search, RAG, Prompt evaluation, Prompt engineering, Vision.** All built 2026-08-03 through 2026-08-05, in the order they appear on the grid, then reordered/copy-tweaked (`Reorder demo cards and tweak copy on the AI Implementations page`). Manually smoke-tested — the previous "not yet verified in-browser" note is stale.
- [x] **Access control loosened from the original decision (2026-08-03, `Preview AI demos without sign-in and add gated sign-in modal`)**: visitors can now open any demo card and see its UI without signing in first; the sign-in gate (`SignInRequiredModal`, Google or email) only fires when they actually try to run a demo (submit a message, run a query, etc.) rather than blocking the whole page up front. `useRequireSignIn` (`frontend/src/hooks/useRequireSignIn.js`) is the shared hook every demo page now calls to wrap its "run" action. `AIDemoPage.jsx` itself (`AI-demo-guidelines` skill covers required conventions for any further changes here). `AIDemoPage.jsx` is now a preview-first grid of all 8 cards. Backend: `backend/routes/ai_demo.py` (`ai_demo_bp`, registered in `app.py` gated on `ENABLE_AI_DEMOS`) exposes one route per demo under `/api/ai-demo/<demo>/<action>`, always `@user_required`, always a `_client()` → 503 guard when `ANTHROPIC_API_KEY` is missing (env-var only, confirmed decision — no encrypted admin fields). Conversation basics streams plain text; Tool use and MCP run a client-side agentic tool loop (NDJSON `text_delta`/`tool_call`/`tool_result`/`done`/`error` events); Web search uses Anthropic's built-in server-side `web_search_20250305` tool (`server_tool_use`/`web_search_tool_result` content blocks), single-call (no client loop needed), events assembled by iterating `stream.current_message_snapshot` at each `content_block_stop` to preserve real chronological order. RAG is a single query → results UI (not chat): `backend/rag_index.py` ports a from-scratch `VectorIndex`/`BM25Index`/`Retriever` (reciprocal rank fusion) classes over a fixed canned sample document, lazily building the index once per process (module-level cache + lock) on first request; `POST /api/ai-demo/rag/search` gates on both `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` (`voyageai`, now in use), yields one `retrieval` NDJSON event (vector/bm25/hybrid ranked chunks) followed by `text_delta`s for an answer generated only from the hybrid results. Prompt evaluation is a run-and-results UI (not chat): `POST /api/ai-demo/prompt-evaluation/run` runs a fixed 3-case dataset (JSON/Python/regex code-gen tasks) through a `ThreadPoolExecutor` two-stage pipeline — all 3 outputs generated concurrently, then all 3 graded concurrently (a local deterministic syntax check plus an LLM-judge rubric score) — yielding `output`/`graded` NDJSON events via `as_completed` as each test case finishes each stage, so `PromptEvaluationPage.jsx` renders 3 side-by-side columns that resolve together rather than one at a time. Prompt engineering is a single-input, side-by-side output UI (not chat): `POST /api/ai-demo/prompt-engineering/run` takes a visitor-editable passage (defaults to a canned sample), runs it through a fixed naive prompt and a fixed refined prompt concurrently via the same `ThreadPoolExecutor` two-stage pattern (generate both, then grade both against one shared `solution_criteria` with the same LLM-judge rubric approach as Prompt evaluation, minus the syntax-check stage since there's no deterministic format to validate here), yielding `prompts`/`output`/`graded`/`summary` NDJSON events so `PromptEngineeringPage.jsx` shows both prompts' text plus their scored outputs side by side with a score-delta summary. Vision is an upload → analysis UI (not chat), and the simplest route shape of all eight — no tools, just `conversation-basics`'s plain-text `text/plain` stream: `POST /api/ai-demo/vision/analyze` takes a visitor-uploaded image (base64 + media_type, validated against a 5MB size cap and an allowed JPEG/PNG/GIF/WebP type set before any API call), sends it as an `image` content block alongside a single fixed general-purpose analysis prompt, and streams the response back — nothing is persisted to `backend/uploads/` or anywhere else, the image only ever exists in that one request. `VisionPage.jsx` is a drag-and-drop/click upload zone with an image preview, "Analyze image" trigger, and the same markdown-render + reveal-timer treatment as every other demo's output.

### Product design
- Public `/demo` page shows a **grid of cards**, one per AI capability, each with a title + short description.
- Clicking a card navigates to a **dedicated full-page demo** for that capability.
- Demos are **independent** — no requirement to chain/combine capabilities (e.g. the tool-use demo doesn't need to also show RAG). Each page's job is just to showcase that one capability clearly.

### Decisions (confirmed with user, 2026-07-31)

**v1 card list** (8 cards, each its own full-page demo, independent of the others — no requirement to chain capabilities together). **Only cards where a back-and-forth conversation is actually the point of the capability use a chat UI; the rest use whatever interface best shows that specific capability** — a demo isn't a general-purpose AI chat app, it's a focused showcase of one feature:

1. **Conversation basics** — **chat UI.** Streaming chat, system prompt, temperature control — this is the one card where "chatting" itself is the capability being shown.
2. **Tool use** — **chat UI** (conversation is how a tool call naturally gets triggered and its result gets used). Claude calls a defined tool mid-conversation and uses the result.
3. **RAG / hybrid search** — **single query → results UI**, not an open chat. Visitor enters a search query, sees retrieved chunks (vector/BM25/hybrid) and the final answer grounded in them.
4. **MCP** — **chat UI** (conversation is how tool discovery/invocation across an MCP server plays out).
5. **Prompt evaluation** — **run-and-results UI**, not a chat. Trigger a run against the test-case dataset, watch per-row scoring populate, see an aggregate score. Framed as a general "systematically evaluate a pipeline's outputs" capability, not just a prompt-tuning tool.
6. **Prompt engineering** — **single-input, side-by-side output UI**, not a chat. One input field, two outputs (naive vs. refined prompt) shown at once.
7. **Web search tool** — **single query → answer UI** (optionally chat-like since search can be iterative, but doesn't need full conversation history — a fresh query each time is fine).
8. **Vision / image input** — **upload → analysis UI**, not a chat. Visitor uploads an image, sees Claude's analysis of it via one fixed general-purpose analysis prompt, no bundled sample gallery — upload only.

**Conversation state (for the chat-UI cards only)**: session-only, in-memory for the duration of the page view — no persisted chat history, no DB storage, no resuming a conversation after refresh/navigation. These are demos of a capability, not a chat product; each visit starts fresh.

**Not in v1** (noted for future work, not currently planned): extended thinking, text editor tool, citations, prompt caching, code execution.

**RAG data source**: a fixed sample dataset (small canned document set) — not the site's live blog content, and not visitor-uploaded documents. Keeps the demo self-contained and independent of how much blog content exists at any given time.

**Access control**: sign-in (Google or email magic-link) is required to actually *run* a demo, ties every live Anthropic/Voyage API call to an identifiable account for abuse tracing, and keeps the existing users system as the single gate for anything that costs money to run. **Loosened 2026-08-03** from the original "gate the whole page" decision above — see the status line at the top of this section.

### Implementation-planning questions — now resolved
- Backend architecture: one Flask blueprint per demo action under `ai_demo_bp`, not a separate service module.
- `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` stayed env-var-only, as originally leaning.
- Frontend: `AIDemoPage.jsx` is the card grid; each demo has its own route under `frontend/src/pages/ai-demos/` (e.g. `/demo/tool-use`).

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
- [x] `backend/requirements.txt` — pinned, includes `stripe`, `anthropic`, `voyageai` for §5/§6.
- [x] `frontend/package.json` — complete for what's built.

## 9. Deploy dependencies: Let's Encrypt / Certbot, Varnish
- [~] **Certbot — domain-capture half only.** Saving `domain` in admin config writes `backend/certbot_domain.txt` (gitignored). No actual certbot invocation, renewal automation, or reverse-proxy config exists anywhere in the repo — something external is expected to consume that file, but that external piece isn't part of this codebase yet.
- [ ] **Varnish — zero references anywhere.** Not started at all.

---

## What's actually left to reach the current target

Every spec item is now done except deployment infrastructure — the one substantial gap remaining:

1. **Only open item.** Deployment infrastructure: combined build pipeline, Flask/nginx static-serving or reverse-proxy setup, actual certbot automation consuming `certbot_domain.txt`, Varnish cache layer, and general "how does this get deployed to a Linux box" documentation/scripting — none of this exists yet (§7/§9).

Everything else closed out since the 2026-07-31 status, beyond what's already detailed in the sections above:
- ~~Admin password reset~~, ~~meta descriptions as real `<meta>` tags~~, ~~admin editing a user's profile~~, ~~AI Implementations page (all 8 cards)~~, ~~Donate/Contribute Stripe integration~~ — all done, see §3a/§6/§3g/§6/§5.
- ~~Wire `users_enabled=false` to actually disable commenting~~ — **done 2026-08-08**, see §3g: guest commenting was removed outright rather than tightening the guest-fallback, so this is moot now.
- Beyond-spec additions not on the original punch list at all: magic-link email sign-in, user/staff avatar uploads with cropping, admin login rate limiting/lockout, Mailgun replacing SMTP, page-content editing extended to Blog/Contact/AI Demo/Payment (previously only Home/Projects/About), payment comments with avatars, guest checkout + guest subscription management by email. See §3a/§4/§5.

## Deliberate deviations from the original spec (not gaps — just documenting the decision trail)
- Blog thumbnails: manual "Feature Image" field, not auto-derived from the post's first image.
- Blog post URLs: top-level (`/my-post`), not nested under `/blog/`.
- Admin accounts: full 4-tier role hierarchy (`contributor < editor < administrator < owner`) instead of flat equal-privilege accounts, with owner-role deletion protection instead of first-account protection — confirmed working better than the original design, keep as-is.
- Donate/Contribute renamed to "Payment" throughout the codebase (routes, files, DB table, config fields) — see §5.
- Payments and comments no longer require Google sign-in at all — original spec implied a payment form behind login, then an intermediate 2026-07-31 decision required Google login for *all* payments; both were superseded by full guest support (guest checkout, guest subscription management by email, and a second email-magic-link sign-in option alongside Google for anyone who does want an account). See §4/§5.
- Email delivery: Mailgun HTTP API instead of raw SMTP (`Replace SMTP email sending with Mailgun API`) — used for Contact, admin password reset, and magic-link sign-in.
- About page headshot: removed as a dedicated upload field — the photo is now just whatever the admin puts in the page's Lexical text content, same as every other page.

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
