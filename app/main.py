"""FastAPI app: REST API + serves the UI.

Run:   uvicorn app.main:app --reload --port 8000
UI:    http://localhost:8000
Docs:  http://localhost:8000/docs
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

from app import core
from app.db import init_db
from app.security import create_access_token, current_user, hash_password, verify_password

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Notely", version="0.1.0", lifespan=lifespan)

# Only needed if the UI is served from a different origin (e.g. a Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Map domain errors to HTTP once, instead of try/except in every route
@app.exception_handler(core.NotFound)
async def _not_found(_: Request, exc: core.NotFound):
    return JSONResponse({"detail": str(exc)}, status_code=404)


@app.exception_handler(core.Conflict)
async def _conflict(_: Request, exc: core.Conflict):
    return JSONResponse({"detail": str(exc)}, status_code=409)


# ---------- schemas ----------
class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=20_000)


class NotePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20_000)


# ---------- public ----------
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=TokenOut, status_code=201)
def register(creds: Credentials):
    user = core.create_user(creds.email.lower(), hash_password(creds.password))
    return TokenOut(access_token=create_access_token(user["id"], user["email"]))


@app.post("/api/auth/login", response_model=TokenOut)
def login(creds: Credentials):
    user = core.get_user_by_email(creds.email.lower())
    if not user or not verify_password(creds.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return TokenOut(access_token=create_access_token(user["id"], user["email"]))


# ---------- protected ----------
@app.get("/api/me")
def me(user: dict = Depends(current_user)):
    return user


@app.get("/api/notes")
def list_notes(q: str | None = None, user: dict = Depends(current_user)):
    return core.list_notes(user["id"], q)


@app.post("/api/notes", status_code=201)
def create_note(note: NoteIn, user: dict = Depends(current_user)):
    return core.create_note(user["id"], note.title, note.body)


@app.get("/api/notes/{note_id}")
def get_note(note_id: int, user: dict = Depends(current_user)):
    return core.get_note(user["id"], note_id)


@app.patch("/api/notes/{note_id}")
def update_note(note_id: int, patch: NotePatch, user: dict = Depends(current_user)):
    return core.update_note(user["id"], note_id, patch.title, patch.body)


@app.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: int, user: dict = Depends(current_user)):
    core.delete_note(user["id"], note_id)


# ---------- UI ----------
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")
