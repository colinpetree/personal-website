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

**App factory** (`backend/app.py`) — Creates Flask app, registers 14 blueprints, configures SQLAlchemy, LoginManager, CORS, and creates all tables on startup.

**Extensions** (`backend/extensions.py`) — Shared `db` (SQLAlchemy) and `login_manager` instances, imported everywhere.

**Encryption** (`backend/crypto.py`) — Fernet symmetric encryption for sensitive DB fields (SMTP password, Stripe keys, Google OAuth secrets). Requires `ENCRYPTION_KEY` env var.

**Route modules** (`backend/routes/`):
- Public: `profile.py`, `site_config.py`, `blog.py`, `contact.py`, `uploads.py`, `auth.py`, `user.py`
- Admin (require session + role): `admin_auth.py`, `admin_config.py`, `admin_accounts.py`, `admin_blog.py`, `admin_projects.py`, `admin_users.py`, `admin_history.py`

Admin endpoints use `@admin_required` or `@role_required()` decorators. Role hierarchy: `contributor < editor < administrator < owner`.

### Database Models

- **Profile** — One row: site name, title, bio
- **SiteConfig** — One row: all site settings (page enable/disable, nav names, slugs, SMTP, Google OAuth, Stripe, timezone, domain, favicon). Sensitive fields stored encrypted.
- **AdminAccount** — Staff accounts with role, password hash, avatar
- **BlogPost** — Title, slug, `content_html`, excerpt, status, publish_date, thumbnail, author FK
- **Comment** — Threaded (parent_id), supports admin/user/guest authoring
- **User** — Google OAuth users (google_id, email, avatar, `can_comment` flag)
- **Project** — Portfolio items with title, description, URL, image, order, visibility
- **SiteEventLog** — Admin activity log (area, action_type, subject, timestamp)

### Frontend

**Entry** — `main.jsx` wraps `<App>` in `AdminAuthContext` and `UserAuthContext`, then mounts. `App.jsx` renders `<Navbar>` + `<Outlet>`.

**Routing** (`src/router.jsx`) — React Router v7 with dynamic slugs loaded from `SiteConfig`. Public routes under `/`; admin routes under `/admin/*` use `<AdminLayout>` (sidebar). Route slugs (e.g. `/blog`, `/projects`) are configurable per-site.

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
