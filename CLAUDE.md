# Personal Website

A personal website for Colin Petree. Flask backend, React + Tailwind v3 frontend, PostgreSQL database.

## Tech Stack

- **Backend:** Python / Flask, SQLAlchemy ORM, Flask-CORS
- **Frontend:** React 18, Vite, Tailwind CSS v3
- **Database:** PostgreSQL (managed manually via pgAdmin)

## Project Structure

```
personal-website/
├── backend/
│   ├── app.py           # Flask app factory and entry point
│   ├── models.py        # SQLAlchemy database models
│   ├── seed.py          # Seeds the database with initial profile data
│   ├── routes/
│   │   └── profile.py   # GET /api/profile endpoint
│   ├── .env             # Real credentials — gitignored, never commit
│   ├── .env.example     # Safe template to commit
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── vite.config.js   # Proxies /api to Flask on port 5000
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css    # Tailwind directives
│       └── components/
│           └── Hero.jsx # Landing page hero section
└── .gitignore
```

## Database

- Host: `localhost:5432`
- Database: `personal_website`
- User: `postgres`
- Managed via pgAdmin — connect with the same credentials in `.env`

### Models

- **Profile** — `id`, `name`, `title`, `bio` — one row, edited directly in pgAdmin

## Running Locally

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
python seed.py               # Creates tables and inserts initial profile row
python app.py                # Starts Flask on http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                  # Starts Vite on http://localhost:5173
```

Visit `http://localhost:5173` — Vite proxies `/api` requests to Flask automatically.

## Environment Variables

Copy `.env.example` to `.env` and fill in your PostgreSQL password. Never commit `.env`.

## Current Pages

- `/` — Landing page (Hero section: name, title, bio pulled from database)

## Planned Sections

- About
- Projects
- Skills
- Contact
