import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// ─── Path helpers ─────────────────────────────────────────────────────────────

let notesDirCache = null;

async function getNotesDir() {
  if (notesDirCache) return notesDirCache;
  notesDirCache = await invoke("get_notes_dir");
  return notesDirCache;
}

function joinPath(base, ...segments) {
  const sep = base.includes("\\") ? "\\" : "/";
  let p = base.replace(/[/\\]$/, "");
  for (const seg of segments) p += sep + seg;
  return p;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextToHtml(text) {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : ""))
    .join("");
}

// ─── Note serialisation (frontmatter + HTML body) ────────────────────────────

function serializeNote(note) {
  const lines = [
    "---",
    `id: ${JSON.stringify(note.id)}`,
    `title: ${JSON.stringify(note.title || "")}`,
    `pinned: ${!!note.pinned}`,
    `created: ${JSON.stringify(note.createdAt)}`,
    `updated: ${JSON.stringify(note.updatedAt)}`,
  ];
  if (note.emoji) lines.push(`emoji: ${JSON.stringify(note.emoji)}`);
  if (note.color) lines.push(`color: ${JSON.stringify(note.color)}`);
  if (note.burn) lines.push(`burn: true`);
  lines.push("---", note.content || "");
  return lines.join("\n");
}

function parseNote(fileContent) {
  if (!fileContent.startsWith("---\n")) return null;
  const closingDelim = "\n---\n";
  const closingIdx = fileContent.indexOf(closingDelim, 4);
  if (closingIdx === -1) return null;

  const frontmatter = fileContent.slice(4, closingIdx);
  const content = fileContent.slice(closingIdx + closingDelim.length);

  const meta = {};
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(": ");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx);
    const raw = line.slice(colonIdx + 2);
    meta[key] = raw.startsWith('"')
      ? JSON.parse(raw)
      : raw === "true"
      ? true
      : raw === "false"
      ? false
      : raw;
  }

  if (!meta.id) return null;
  return { ...meta, content };
}

// ─── Persistence helpers (localStorage) ──────────────────────────────────────

function loadAddedFonts() {
  try { return JSON.parse(localStorage.getItem("sp-fonts") || "[]"); } catch { return []; }
}
function saveAddedFonts(fonts) { localStorage.setItem("sp-fonts", JSON.stringify(fonts)); }

function loadSaveFormat() {
  const v = localStorage.getItem("sp-save-format");
  return v === "txt" || v === "ask" ? v : "md";
}
function persistSaveFormat(fmt) { localStorage.setItem("sp-save-format", fmt); }

function loadNoteOrder() {
  try { return JSON.parse(localStorage.getItem("sp-order") || "[]"); } catch { return []; }
}
function saveNoteOrder(order) { localStorage.setItem("sp-order", JSON.stringify(order)); }

function loadStarredAutoSnaps() {
  try { return new Set(JSON.parse(localStorage.getItem("sp-starred-autosnaps") || "[]")); } catch { return new Set(); }
}
function saveStarredAutoSnaps(s) { localStorage.setItem("sp-starred-autosnaps", JSON.stringify([...s])); }

function loadTheme() {
  const v = localStorage.getItem("sp-theme");
  return v === "light" || v === "red" ? v : "dark";
}
function persistTheme(t) {
  localStorage.setItem("sp-theme", t);
  document.documentElement.setAttribute("data-theme", t === "dark" ? "" : t);
}

function loadAppPasscode() {
  return localStorage.getItem("sp-app-passcode") || null;
}

function loadNoteScenes() {
  try { return JSON.parse(localStorage.getItem("sp-note-scenes") || "{}"); } catch { return {}; }
}
function saveNoteScenes(s) { localStorage.setItem("sp-note-scenes", JSON.stringify(s)); }

function loadNotePasscodes() {
  try { return JSON.parse(localStorage.getItem("sp-note-passcodes") || "{}"); } catch { return {}; }
}
function saveNotePasscodes(p) { localStorage.setItem("sp-note-passcodes", JSON.stringify(p)); }

function loadCloudBackupPath() {
  return localStorage.getItem("sp-cloud-backup-path") || "";
}

function loadSpellcheck() {
  return localStorage.getItem("sp-spellcheck") !== "false";
}

const TOOLBAR_VISIBLE_DEFAULTS = ["emoji", "color", "mdpreview", "pin", "history"];
function loadToolbarVisible() {
  try {
    const saved = JSON.parse(localStorage.getItem("sp-toolbar-visible") || "null");
    return new Set(saved ?? TOOLBAR_VISIBLE_DEFAULTS);
  } catch { return new Set(TOOLBAR_VISIBLE_DEFAULTS); }
}
function saveToolbarVisible(s) { localStorage.setItem("sp-toolbar-visible", JSON.stringify([...s])); }

// ─── Store ────────────────────────────────────────────────────────────────────

// Apply theme on initial load
(function () {
  const t = loadTheme();
  document.documentElement.setAttribute("data-theme", t === "dark" ? "" : t);
})();

export const useSignalPadStore = create((set, get) => ({
  notes: [],
  addedFonts: loadAddedFonts(),
  saveFormat: loadSaveFormat(),
  noteOrder: loadNoteOrder(),
  starredAutoSnaps: loadStarredAutoSnaps(),
  toolbarVisible: loadToolbarVisible(),
  theme: loadTheme(),
  appPasscode: loadAppPasscode(),
  noteScenes: loadNoteScenes(),
  notePasscodes: loadNotePasscodes(),
  cloudBackupPath: loadCloudBackupPath(),
  spellcheck: loadSpellcheck(),
  loading: true,

  init: async () => {
    try {
      const dir = await getNotesDir();
      const files = await invoke("list_note_files", { dir });

      const settled = await Promise.allSettled(
        files.map((path) =>
          invoke("read_file", { path }).then((content) => {
            const note = parseNote(content);
            if (!note) return null;
            const fileExt = path.toLowerCase().endsWith(".txt") ? "txt" : "md";
            return { ...note, fileExt };
          })
        )
      );

      const notes = settled
        .filter((r) => r.status === "fulfilled" && r.value)
        .map((r) => r.value)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      set({ notes, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  canAdd: () => true,

  addNote: async () => {
    const { saveFormat } = get();
    const fileExt = saveFormat === "ask" ? "md" : saveFormat;
    const id = makeId();
    const now = new Date().toISOString();
    const note = { id, title: "", content: "", pinned: false, createdAt: now, updatedAt: now, fileExt };
    const dir = await getNotesDir();
    await invoke("write_file", { path: joinPath(dir, `${id}.${fileExt}`), content: serializeNote(note) });
    set((s) => {
      const noteOrder = [id, ...s.noteOrder];
      saveNoteOrder(noteOrder);
      return { notes: [note, ...s.notes], noteOrder };
    });
    return id;
  },

  updateNote: async (id, changes) => {
    let updated;
    let oldFileExt;
    set((s) => {
      const notes = s.notes.map((n) => {
        if (n.id !== id) return n;
        oldFileExt = n.fileExt || "md";
        updated = {
          ...n,
          ...changes,
          updatedAt: new Date().toISOString(),
          fileExt: changes.fileExt || n.fileExt || "md",
        };
        return updated;
      });
      return { notes };
    });
    if (updated) {
      const dir = await getNotesDir();
      const newExt = updated.fileExt;
      await invoke("write_file", { path: joinPath(dir, `${id}.${newExt}`), content: serializeNote(updated) });
      if (oldFileExt && oldFileExt !== newExt) {
        await invoke("delete_file", { path: joinPath(dir, `${id}.${oldFileExt}`) }).catch(() => {});
      }
    }
  },

  deleteNote: async (id) => {
    const note = get().notes.find((n) => n.id === id);
    set((s) => {
      const noteOrder = s.noteOrder.filter((oid) => oid !== id);
      saveNoteOrder(noteOrder);
      return { notes: s.notes.filter((n) => n.id !== id), noteOrder };
    });
    const dir = await getNotesDir();
    await invoke("delete_file", { path: joinPath(dir, `${id}.${note?.fileExt || "md"}`) }).catch(() => {});
  },

  clearNotes: async () => {
    const { notes } = get();
    saveNoteOrder([]);
    set({ notes: [], noteOrder: [] });
    const dir = await getNotesDir();
    await Promise.allSettled(
      notes.map((n) => invoke("delete_file", { path: joinPath(dir, `${n.id}.${n.fileExt || "md"}`) }))
    );
  },

  togglePin: async (id) => {
    let updated;
    set((s) => {
      const notes = s.notes.map((n) => {
        if (n.id !== id) return n;
        updated = { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() };
        return updated;
      });
      return { notes };
    });
    if (updated) {
      const dir = await getNotesDir();
      await invoke("write_file", {
        path: joinPath(dir, `${id}.${updated.fileExt || "md"}`),
        content: serializeNote(updated),
      });
    }
  },

  // ── Per-note metadata ──────────────────────────────────────────────────────

  setNoteEmoji: async (id, emoji) => {
    const { updateNote } = get();
    await updateNote(id, { emoji });
  },

  setNoteColor: async (id, color) => {
    const { updateNote } = get();
    await updateNote(id, { color });
  },

  toggleBurn: async (id) => {
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    const { updateNote } = get();
    await updateNote(id, { burn: !note.burn });
  },

  // ── Note ordering ──────────────────────────────────────────────────────────

  reorderNotes: (orderedIds) => {
    saveNoteOrder(orderedIds);
    set({ noteOrder: orderedIds });
  },

  // ── Snapshots ─────────────────────────────────────────────────────────────

  saveSnapshot: async (id, content, title) => {
    const dir = await getNotesDir();
    const ts = Date.now();
    const path = joinPath(dir, `${id}.snap.${ts}.md`);
    const snap = `---\nnoteId: ${JSON.stringify(id)}\ntitle: ${JSON.stringify(title || "")}\nts: ${ts}\n---\n${content}`;
    await invoke("write_file", { path, content: snap });
    return { path, ts };
  },

  listSnapshots: async (id) => {
    const dir = await getNotesDir();
    try {
      const files = await invoke("list_snapshot_files", { dir, noteId: id });
      return files
        .map((path) => {
          const m = path.replace(/\\/g, "/").match(/\.snap\.(\d+)\.md$/);
          return m ? { path, ts: parseInt(m[1]) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.ts - a.ts);
    } catch {
      return [];
    }
  },

  readSnapshot: async (path) => {
    const raw = await invoke("read_file", { path });
    const bodyStart = raw.indexOf("\n---\n");
    return bodyStart >= 0 ? raw.slice(bodyStart + 5) : raw;
  },

  deleteSnapshot: async (path) => {
    await invoke("delete_file", { path }).catch(() => {});
  },

  saveAutoSnapshot: async (id, content, title) => {
    const dir = await getNotesDir();
    const ts = Date.now();
    const path = joinPath(dir, `${id}.snap.${ts}.auto.md`);
    const snap = `---\nnoteId: ${JSON.stringify(id)}\ntitle: ${JSON.stringify(title || "")}\nts: ${ts}\nauto: true\n---\n${content}`;
    await invoke("write_file", { path, content: snap });
    return { path, ts };
  },

  listAutoSnapshots: async (id) => {
    const dir = await getNotesDir();
    try {
      const files = await invoke("list_snapshot_files", { dir, noteId: id });
      return files
        .map((path) => {
          const m = path.replace(/\\/g, "/").match(/\.snap\.(\d+)\.auto\.md$/);
          return m ? { path, ts: parseInt(m[1]) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.ts - a.ts);
    } catch {
      return [];
    }
  },

  starAutoSnapshot: (path) =>
    set((s) => {
      const starredAutoSnaps = new Set(s.starredAutoSnaps);
      starredAutoSnaps.add(path);
      saveStarredAutoSnaps(starredAutoSnaps);
      return { starredAutoSnaps };
    }),

  unstarAutoSnapshot: (path) =>
    set((s) => {
      const starredAutoSnaps = new Set(s.starredAutoSnaps);
      starredAutoSnaps.delete(path);
      saveStarredAutoSnaps(starredAutoSnaps);
      return { starredAutoSnaps };
    }),

  deleteUnstarredAutoSnapshots: async (id) => {
    const { starredAutoSnaps } = get();
    const dir = await getNotesDir();
    try {
      const files = await invoke("list_snapshot_files", { dir, noteId: id });
      await Promise.allSettled(
        files
          .filter((p) => /\.snap\.\d+\.auto\.md$/.test(p.replace(/\\/g, "/")))
          .filter((p) => !starredAutoSnaps.has(p))
          .map((p) => invoke("delete_file", { path: p }))
      );
    } catch {}
  },

  setToolbarVisible: (ids) => {
    const toolbarVisible = new Set(ids);
    saveToolbarVisible(toolbarVisible);
    set({ toolbarVisible });
  },

  // ── Format / font ──────────────────────────────────────────────────────────

  setSaveFormat: (fmt) => {
    persistSaveFormat(fmt);
    set({ saveFormat: fmt });
  },

  addFont: (name) =>
    set((s) => {
      if (s.addedFonts.includes(name)) return s;
      const addedFonts = [...s.addedFonts, name];
      saveAddedFonts(addedFonts);
      return { addedFonts };
    }),

  removeFont: (name) =>
    set((s) => {
      const addedFonts = s.addedFonts.filter((f) => f !== name);
      saveAddedFonts(addedFonts);
      return { addedFonts };
    }),

  // ── Import / export ────────────────────────────────────────────────────────

  importNote: async (filePath) => {
    const fileExt = filePath.toLowerCase().endsWith(".txt") ? "txt" : "md";
    const rawContent = await invoke("read_file", { path: filePath });
    const parsed = parseNote(rawContent);

    const id = makeId();
    const now = new Date().toISOString();
    let note;

    if (parsed) {
      note = { ...parsed, id, createdAt: now, updatedAt: now, fileExt };
    } else {
      const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? "Imported Note";
      const title = fileName.replace(/\.(md|txt)$/i, "");
      note = { id, title, content: plainTextToHtml(rawContent), pinned: false, createdAt: now, updatedAt: now, fileExt };
    }

    const dir = await getNotesDir();
    await invoke("write_file", { path: joinPath(dir, `${id}.${fileExt}`), content: serializeNote(note) });
    set((s) => {
      const noteOrder = [id, ...s.noteOrder];
      saveNoteOrder(noteOrder);
      return { notes: [note, ...s.notes], noteOrder };
    });
    return id;
  },

  saveNoteTo: async (id, path, changes) => {
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    const merged = { ...note, ...changes, updatedAt: new Date().toISOString() };
    await invoke("write_file", { path, content: serializeNote(merged) });
  },

  // ── Theme ──────────────────────────────────────────────────────────────────
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },

  // ── App passcode ──────────────────────────────────────────────────────────
  setAppPasscode: (code) => {
    if (code) localStorage.setItem("sp-app-passcode", code);
    else localStorage.removeItem("sp-app-passcode");
    set({ appPasscode: code || null });
  },

  // ── Note scene (pixel art) ────────────────────────────────────────────────
  setNoteScene: (noteId, sceneId) => {
    set((s) => {
      const noteScenes = { ...s.noteScenes, [noteId]: sceneId };
      saveNoteScenes(noteScenes);
      return { noteScenes };
    });
  },

  // ── Note passcode ─────────────────────────────────────────────────────────
  setNotePasscode: (noteId, code) => {
    set((s) => {
      const notePasscodes = { ...s.notePasscodes };
      if (code) notePasscodes[noteId] = code;
      else delete notePasscodes[noteId];
      saveNotePasscodes(notePasscodes);
      return { notePasscodes };
    });
  },

  // ── Cloud backup path ─────────────────────────────────────────────────────
  setCloudBackupPath: (path) => {
    localStorage.setItem("sp-cloud-backup-path", path);
    set({ cloudBackupPath: path });
  },

  // ── Spellcheck ────────────────────────────────────────────────────────────
  setSpellcheck: (enabled) => {
    localStorage.setItem("sp-spellcheck", enabled ? "true" : "false");
    set({ spellcheck: enabled });
  },

  // ── Cloud backup (copy all notes to backup folder) ────────────────────────
  runCloudBackup: async () => {
    const { notes, cloudBackupPath } = get();
    if (!cloudBackupPath) return;
    const dir = await getNotesDir();
    await Promise.allSettled(
      notes.map(async (n) => {
        const src = joinPath(dir, `${n.id}.${n.fileExt || "md"}`);
        const dst = joinPath(cloudBackupPath, `${n.id}.${n.fileExt || "md"}`);
        try {
          const content = await invoke("read_file", { path: src });
          await invoke("write_file", { path: dst, content });
        } catch {}
      })
    );
  },
}));
