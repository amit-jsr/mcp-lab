## Roadmap

The app is feature-complete for local use. The items below prepare it for real users and for an MCP layer.

### Next up
- [ ] **Rate-limit auth endpoints**: add `slowapi` limits on `/api/auth/login` and `/api/auth/register` to block brute-force attempts.
- [ ] **Load secrets from `.env`**: read `JWT_SECRET` with `python-dotenv` and refuse to start if it's missing, instead of falling back to the dev default.
- [ ] **Personal API keys**: add an `api_keys` table and a "Generate API key" option in the UI. MCP clients can't complete a browser login, so each key resolves to a `user_id` for MCP-over-HTTP.
- [ ] **Test suite**: `pytest` + FastAPI `TestClient` covering auth, notes CRUD and per-user data isolation.

### Security hardening
- [ ] **Refresh tokens**: short-lived access tokens plus a long-lived refresh token, so sessions survive past 60 minutes.
- [ ] **httpOnly cookies**: move tokens out of `localStorage` so an XSS bug can't read them.
- [ ] **Audit log**: record who did what and when, via the UI, API or an agent.

### Deployment & operations
- [ ] **Docker**: `Dockerfile` + `docker-compose` with Postgres, deployable to ECS or App Runner.
- [ ] **Migrations**: Alembic for versioned schema changes after the Postgres move.
- [ ] **Observability**: structured JSON logs with a request ID on every request.

### Features
- [ ] Pagination on `GET /api/notes`
- [ ] Note tags and Markdown preview
- [ ] Password change and reset