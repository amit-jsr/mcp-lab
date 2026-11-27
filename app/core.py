"""Business logic. No HTTP or auth code in here.

Every function takes user_id explicitly, so any caller (REST routes today,
an MCP server later) can reuse it after resolving the user its own way.
"""

from app.db import get_conn


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


# ---------- users ----------
def create_user(email: str, password_hash: str) -> dict:
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise Conflict("Email already registered")
        cur = conn.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (email, password_hash))
        return {"id": cur.lastrowid, "email": email}


def get_user_by_email(email: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None


# ---------- notes ----------
def list_notes(user_id: int, query: str | None = None) -> list[dict]:
    sql = "SELECT id, title, body, created_at, updated_at FROM notes WHERE user_id = ?"
    args: list = [user_id]
    if query:
        sql += " AND (title LIKE ? OR body LIKE ?)"
        args += [f"%{query}%", f"%{query}%"]
    sql += " ORDER BY updated_at DESC, id DESC"
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(sql, args).fetchall()]


def get_note(user_id: int, note_id: int) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?",
            (note_id, user_id),
        ).fetchone()
    if not row:
        raise NotFound(f"Note {note_id} not found")
    return dict(row)


def create_note(user_id: int, title: str, body: str) -> dict:
    with get_conn() as conn:
        cur = conn.execute("INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)", (user_id, title, body))
        note_id = cur.lastrowid
    return get_note(user_id, note_id)


def update_note(user_id: int, note_id: int, title: str | None, body: str | None) -> dict:
    current = get_note(user_id, note_id)  # raises NotFound
    with get_conn() as conn:
        conn.execute(
            "UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
            (title if title is not None else current["title"], body if body is not None else current["body"], note_id, user_id),
        )
    return get_note(user_id, note_id)


def delete_note(user_id: int, note_id: int) -> None:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user_id))
    if cur.rowcount == 0:
        raise NotFound(f"Note {note_id} not found")
