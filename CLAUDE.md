# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Backend:** Python / Flask, SQLAlchemy ORM, Flask-Login, Flask-CORS, Authlib (Google OAuth), Fernet encryption
- **Frontend:** React 18, React Router v7, Vite, Tailwind CSS v3, Lexical (rich text editor)
- **Database:** PostgreSQL (managed via pgAdmin)

## Running Locally

### Backend

```bash
cd backend
.venv\Scripts\activate       # Windows
python app.py                # Starts Flask on http://localhost:5000
```

First-time setup: `python -m venv .venv && pip install -r requirements.txt && python seed.py`

### Frontend

```bash
cd frontend
npm run dev                  # Starts Vite on http://localhost:5173
```

`/api/*` requests are proxied to `http://localhost:5000` by Vite. No testing or linting is configured.

### Build

```bash
cd frontend
npm run build                # Outputs to frontend/dist/
```

## Architecture

### Backend

**App factory** (`backend/app.py`) — Creates Flask app, registers 25 blueprints (23 unconditional + 2 gated behind `ENABLE_AI_DEMOS`), configures SQLAlchemy, LoginManager, CORS, and creates all tables on startup.

**Extensions** (`backend/extensions.py`) — Shared `db` (SQLAlchemy) and `login_manager` instances, imported everywhere.

**Encryption** (`backend/crypto.py`) — Fernet symmetric encryption for sensitive DB fields (Mailgun API key, Stripe secret/webhook keys, Google OAuth client secret). Requires `ENCRYPTION_KEY` env var.

**Route modules** (`backend/routes/`):
- Public: `profile.py`, `site_config.py`, `projects.py`, `blog.py`, `pages.py`, `public_resolve.py` (unified slug resolution across blog posts and freeform Pages), `contact.py`, `uploads.py`, `auth.py`, `user.py`, `payment.py`, `search.py`, `analytics_tracking.py`, `ai_demo.py` (gated)
- Admin (require session + role): `admin_auth.py`, `admin_config.py`, `admin_accounts.py`, `admin_projects.py`, `admin_blog.py`, `admin_blog_categories.py`, `admin_pages.py`, `admin_users.py`, `admin_history.py`, `admin_analytics.py`, `admin_ai_demo_links.py` (gated)

Admin endpoints use `@admin_required` or `@role_required()` decorators. Role hierarchy: `contributor < editor < administrator < owner`.

### Database Models

Content: **Profile** (one row: site name, title, bio) · **SiteConfig** (one row: page enable/disable, nav names, slugs, Mailgun, Google OAuth, Stripe, timezone, domain, favicon, freeform `primary_navigation` link list — sensitive fields stored encrypted) · **BlogPost** (title, slug, `content_html`, excerpt, status, publish_date, feature image, category FK, author FK) · **BlogCategory** · **Page** — freeform CMS pages (title, slug, `content_html`, meta description, draft/publish lifecycle same as `BlogPost`; the old fixed "About" page is now just a `Page` row) · **Project** (title, description, URL, image, order, visibility) · **Comment** (threaded via `parent_id`, admin/user authoring).

People/access: **AdminAccount** (staff, role, password hash, avatar) · **User** (Google OAuth or magic-link, `can_comment` flag, avatar) · **AiDemoAccessLink** (per-user grants for the AI demo access-approval system).

Payments: **Payment** — ledger row per checkout/renewal (user or guest, Stripe IDs, amount, mode, optional public comment).

Analytics/operational (lighter-weight, mostly write-only): **PageView**, **ShareEvent**, **ProjectClick**, **ContactSubmission**, **SiteEventLog** (admin activity log), **LoginAttempt** / **ContactAttempt** / **AnalyticsAttempt** / **PortalLinkRequest** (per-IP rate-limit tracking).

### Frontend

**Entry** — `main.jsx` wraps `<App>` in `AdminAuthContext` and `UserAuthContext`, then mounts. `App.jsx` renders `<Navbar>` + `<Outlet>`.

**Routing** (`src/routes.ts`) — React Router v7 file-based route config (not `createBrowserRouter`), with SSR/prerendering support. Dynamic slugs loaded from `SiteConfig` at build/dev time. Public routes under `/`; admin routes under `/admin/*` use `<AdminLayout>` (sidebar). Only Home, Blog, Projects, Contact, AI Demo, and Payment have dedicated fixed routes with configurable slugs (e.g. `/blog`, `/projects`) — everything else (freeform CMS **Pages**, including the retired "About" page, and blog posts) resolves through a catch-all `:slug` route (`SlugResolverPage.jsx`) shared across both content types. Site navigation itself is a freeform link list (`primary_navigation` on `SiteConfig`, edited at `/admin/navigation`), not a fixed set of nav slots.

**Auth Contexts:**
- `AdminAuthContext` — Admin email/password session via Flask-Login. Exposes `admin`, `login()`, `logout()`, `refreshAdmin()`.
- `UserAuthContext` — Google OAuth for public users. Exposes `user`, `loginWithGoogle()`, `logout()`, `updateProfile()`.

**Config Hooks:**
- `useSiteConfig()` — Reads public site config (no secrets). Used by all public pages.
- `useAdminConfig()` — Reads + saves full `SiteConfig`. Admin-only.

**Role Guard** (`components/admin/RoleGuard.jsx`) — Wraps admin routes; redirects or shows fallback based on role.

**Lexical Editor** (`components/admin/editor/`) — Rich text editor for blog posts. Custom nodes (`nodes.jsx`) for images, video, audio, file attachments, galleries. Plugins in `plugins.jsx`. Outputs `content_html` stored in DB and rendered with `@tailwindcss/typography` prose styles on the frontend.

**File Uploads** — `POST /api/uploads` stores files in `backend/uploads/` with UUID filenames. `GET /api/uploads/:filename` serves them. The editor's `upload.js` integrates directly with this endpoint.

## Database

- Host: `localhost:5432`, Database: `personal_website`, User: `postgres`
- Managed via pgAdmin — credentials in `backend/.env`
- Tables created automatically on Flask startup; `seed.py` inserts initial `Profile` and `SiteConfig` rows
