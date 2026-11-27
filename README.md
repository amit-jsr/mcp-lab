# Notely (FastAPI + vanilla JS)

A minimal full-stack site: UI, REST API, JWT auth, SQLite.

## Run

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export JWT_SECRET=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
uvicorn app.main:app --reload --port 8000
```

- UI: http://localhost:8000
- Swagger docs: http://localhost:8000/docs

## Layout

```
app/
  main.py      FastAPI routes, schemas, serves the UI
  security.py  PBKDF2 password hashing, JWT create/verify, current_user dependency
  core.py      business logic (users, notes CRUD), no HTTP code
  db.py        SQLite connection + schema
static/
  index.html, style.css, app.js   single-page UI
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /api/health | no | liveness |
| POST | /api/auth/register | no | `{email, password}` → `{access_token}` |
| POST | /api/auth/login | no | `{email, password}` → `{access_token}` |
| GET | /api/me | yes | current user |
| GET | /api/notes?q= | yes | list / search own notes |
| POST | /api/notes | yes | create `{title, body}` |
| GET | /api/notes/{id} | yes | get one |
| PATCH | /api/notes/{id} | yes | partial update |
| DELETE | /api/notes/{id} | yes | delete |

Auth header: `Authorization: Bearer <access_token>`

```bash
TOKEN=$(curl -s -X POST localhost:8000/api/auth/register -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"password123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s localhost:8000/api/notes -H "Authorization: Bearer $TOKEN"
```

## Adding MCP later

`app/core.py` takes `user_id` explicitly and has no HTTP code, so an MCP server
can import it directly. To serve MCP over HTTP, mount it in `main.py` and validate the same
JWT with `security.decode_token`.

## Before production

- Set a strong `JWT_SECRET` (the default is dev-only)
- Serve over HTTPS; consider httpOnly cookies instead of localStorage if XSS is a concern
- Add rate limiting on `/api/auth/*`
- Swap SQLite for Postgres in `db.py` if you need concurrency
