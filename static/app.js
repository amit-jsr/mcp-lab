// Vanilla JS client for the Notes API. Token kept in localStorage.
const $ = (s) => document.querySelector(s);
const state = { token: localStorage.getItem("token"), notes: [], currentId: null, editing: false, dirty: false, mode: "login", loaded: false };

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Network error. Check your connection.");
  }
  if (res.status === 401 && !path.startsWith("/auth/")) { logout("Session expired. Please log in again."); throw new Error("Session expired"); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    throw new Error(Array.isArray(d) ? d.map((e) => e.msg).join(", ") : d || `Error ${res.status}`);
  }
  return data;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- helpers ----------
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

// Server stores UTC as "YYYY-MM-DD HH:MM:SS"; convert to a local Date.
function parseUtc(s) {
  if (!s) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

function ago(s) {
  const d = parseUtc(s);
  if (!d) return "";
  const sec = Math.max(0, (Date.now() - d) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function confirmDiscard() {
  return !state.dirty || confirm("You have unsaved changes. Discard them?");
}

// ---------- auth ----------
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    state.mode = t.dataset.mode;
    document.querySelectorAll(".tab").forEach((x) => {
      x.classList.toggle("active", x === t);
      x.setAttribute("aria-selected", x === t);
    });
    $("#auth-submit").textContent = state.mode === "login" ? "Login" : "Create account";
    $("#password").autocomplete = state.mode === "login" ? "current-password" : "new-password";
    $("#auth-error").textContent = "";
  })
);

$("#toggle-pw").addEventListener("click", () => {
  const input = $("#password");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("#toggle-pw").textContent = show ? "Hide" : "Show";
  $("#toggle-pw").setAttribute("aria-label", show ? "Hide password" : "Show password");
});

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = $("#auth-submit");
  const label = btn.textContent;
  $("#auth-error").textContent = "";
  btn.disabled = true;
  btn.textContent = state.mode === "login" ? "Signing in…" : "Creating account…";
  try {
    const { access_token } = await api(`/auth/${state.mode}`, {
      method: "POST",
      body: { email: f.get("email"), password: f.get("password") },
    });
    state.token = access_token;
    localStorage.setItem("token", access_token);
    e.target.reset();
    await boot();
  } catch (err) {
    $("#auth-error").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

function logout(message = "") {
  state.token = null;
  localStorage.removeItem("token");
  state.notes = [];
  state.loaded = false;
  closeEditor(true);
  $("#search").value = "";
  show("auth");
  $("#auth-error").textContent = message;
}
$("#logout").addEventListener("click", () => { if (confirmDiscard()) logout(); });

function show(view) {
  $("#auth-view").classList.toggle("hidden", view !== "auth");
  $("#app-view").classList.toggle("hidden", view !== "app");
}

// ---------- notes ----------
async function loadNotes() {
  const q = $("#search").value.trim();
  try {
    state.notes = await api(`/notes${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    state.loaded = true;
  } catch (err) {
    if (err.message !== "Session expired") toast(err.message);
  }
  renderList();
}

function renderList() {
  const q = $("#search").value.trim();
  const draft = state.editing && state.currentId === null
    ? `<li class="active draft"><div class="row"><div class="t">${esc($("#title").value.trim() || "Untitled")}</div></div><div class="s">New note (unsaved)</div></li>`
    : "";
  const items = state.notes
    .map(
      (n) => `<li data-id="${n.id}" class="${n.id === state.currentId ? "active" : ""}">
          <div class="row"><div class="t">${esc(n.title)}</div><div class="d">${esc(ago(n.updated_at))}</div></div>
          <div class="s">${esc(n.body.slice(0, 80)) || "&nbsp;"}</div></li>`
    )
    .join("");
  let empty = "";
  if (!state.loaded) empty = `<li class="info">Loading…</li>`;
  else if (!items && !draft) empty = `<li class="info">${q ? "No notes match your search." : "No notes yet. Click “+ New” to start."}</li>`;
  $("#note-list").innerHTML = draft + items + empty;
}

$("#note-list").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (li && Number(li.dataset.id) !== state.currentId && confirmDiscard()) openNote(Number(li.dataset.id));
  else if (li) $("#layout").classList.add("editing");
});

function updateCount() {
  const words = $("#body").value.trim().split(/\s+/).filter(Boolean).length;
  $("#count").textContent = `${words} word${words === 1 ? "" : "s"}`;
}

function setDirty(v) {
  state.dirty = v;
  if (v) $("#status").textContent = "Unsaved changes";
}

function openNote(id, { focus = true } = {}) {
  const n = state.notes.find((x) => x.id === id);
  state.currentId = n ? id : null;
  state.editing = true;
  state.dirty = false;
  $("#title").value = n ? n.title : "";
  $("#body").value = n ? n.body : "";
  $("#status").textContent = n ? `Updated ${ago(n.updated_at)}` : "New note";
  $("#delete").classList.toggle("hidden", !n);
  $("#empty").classList.add("hidden");
  $("#editor-form").classList.remove("hidden");
  $("#layout").classList.add("editing");
  updateCount();
  renderList();
  if (focus) $("#title").focus();
}

function closeEditor(force = false) {
  if (!force && !confirmDiscard()) return;
  state.currentId = null;
  state.editing = false;
  state.dirty = false;
  $("#editor-form").classList.add("hidden");
  $("#empty").classList.remove("hidden");
  $("#layout").classList.remove("editing");
  renderList();
}

function newNote() {
  if (confirmDiscard()) openNote(null);
}
$("#new-note").addEventListener("click", newNote);
$("#empty-new").addEventListener("click", newNote);
$("#back").addEventListener("click", () => closeEditor());

$("#title").addEventListener("input", () => { setDirty(true); if (state.currentId === null) renderList(); });
$("#body").addEventListener("input", () => { setDirty(true); updateCount(); });

$("#editor-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#save");
  const payload = { title: $("#title").value.trim(), body: $("#body").value };
  btn.disabled = true;
  $("#status").textContent = "Saving…";
  try {
    const saved = state.currentId
      ? await api(`/notes/${state.currentId}`, { method: "PATCH", body: payload })
      : await api("/notes", { method: "POST", body: payload });
    state.currentId = saved.id;
    state.dirty = false;
    $("#delete").classList.remove("hidden");
    await loadNotes();
    $("#status").textContent = "Saved just now";
  } catch (err) {
    $("#status").textContent = "Not saved";
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("#delete").addEventListener("click", async () => {
  if (!state.currentId) return;
  if (!confirm("Delete this note? This cannot be undone.")) return;
  try {
    await api(`/notes/${state.currentId}`, { method: "DELETE" });
    closeEditor(true);
    await loadNotes();
    toast("Note deleted");
  } catch (err) {
    toast(err.message);
  }
});

// Ctrl/Cmd+S saves
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && state.editing) {
    e.preventDefault();
    $("#editor-form").requestSubmit();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
});

let t;
$("#search").addEventListener("input", () => { clearTimeout(t); t = setTimeout(loadNotes, 250); });

// ---------- boot ----------
async function boot() {
  if (!state.token) return show("auth");
  try {
    const me = await api("/me");
    $("#user-email").textContent = me.email;
    show("app");
    renderList();
    await loadNotes();
  } catch (err) {
    if (err.message !== "Session expired") logout();
  }
}
boot();
