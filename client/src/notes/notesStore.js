// Notes saved in the browser (localStorage). No server, no accounts.
//
// A note: { id, createdAt, updatedAt, title, text, durationSec,
//           ai?: { title, summary, tags[], cleanedText, model, createdAt } }
//
// Storage can fail (private browsing, full quota, corrupted data), so every call is guarded:
// - unreadable or corrupted data → start empty and keep the bad value under `${KEY}:corrupt`;
// - a failed write → throws NotesStorageError and leaves the in-memory notes unchanged.

export const STORAGE_KEY = "voice-notes:v1";
export const CORRUPT_KEY = `${STORAGE_KEY}:corrupt`;

export class NotesStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NotesStorageError";
    this.code = code; // "quota" | "unavailable"
  }
}

function isQuotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

function isValidNote(note) {
  return (
    note !== null &&
    typeof note === "object" &&
    typeof note.id === "string" &&
    typeof note.text === "string" &&
    typeof note.createdAt === "string"
  );
}

const newestFirst = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

// A short title from the first words of the text, e.g. "Buy milk and call the plumber about…".
export function defaultTitle(text, maxWords = 7) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Untitled note";
  const title = words.slice(0, maxWords).join(" ").replace(/[.,;:!?]+$/, "");
  return words.length > maxWords ? `${title}…` : title;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function createNotesStore({
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
  newId = () => globalThis.crypto.randomUUID(),
} = {}) {
  let notes = [];
  let loadError = null;
  const listeners = new Set();

  function load() {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      loadError = new NotesStorageError("unavailable", "Your browser is blocking storage, so notes can't be saved.");
      return;
    }
    if (raw === null) return;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every(isValidNote)) throw new Error("bad shape");
      notes = [...parsed].sort(newestFirst);
    } catch {
      // Keep the unreadable data instead of overwriting it, so it can be recovered by hand.
      try {
        if (storage.getItem(CORRUPT_KEY) === null) storage.setItem(CORRUPT_KEY, raw);
        else storage.setItem(`${CORRUPT_KEY}:${Date.now()}`, raw);
      } catch {
        // Nothing more we can do; the original value is still under STORAGE_KEY until the next save.
      }
      notes = [];
    }
  }

  // Saves `next` and only then makes it the current list.
  function commit(next) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      if (isQuotaError(error)) {
        throw new NotesStorageError("quota", "Browser storage is full. Delete or export some notes, then try again.");
      }
      throw new NotesStorageError("unavailable", "Notes couldn't be saved: browser storage isn't available.");
    }
    notes = next;
    listeners.forEach((listener) => listener());
  }

  load();

  return {
    list: () => notes,
    get: (id) => notes.find((note) => note.id === id) ?? null,
    loadError: () => loadError,

    create({ text = "", title, durationSec = 0 } = {}) {
      const timestamp = now();
      const note = {
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        title: title?.trim() || defaultTitle(text),
        text,
        durationSec,
      };
      commit([note, ...notes]);
      return note;
    },

    update(id, changes) {
      const existing = notes.find((note) => note.id === id);
      if (!existing) return null;
      // id and createdAt can't be changed.
      const updated = { ...existing, ...changes, id: existing.id, createdAt: existing.createdAt, updatedAt: now() };
      commit(notes.map((note) => (note.id === id ? updated : note)));
      return updated;
    },

    remove(id) {
      if (!notes.some((note) => note.id === id)) return false;
      commit(notes.filter((note) => note.id !== id));
      return true;
    },

    exportMarkdown(note) {
      const lines = [`# ${note.title}`, "", `_Recorded ${note.createdAt} · ${formatDuration(note.durationSec)}_`, "", note.text];
      if (note.ai) {
        lines.push("", "## AI summary", "", note.ai.summary);
        if (note.ai.tags?.length) lines.push("", `Tags: ${note.ai.tags.join(", ")}`);
      }
      return `${lines.join("\n")}\n`;
    },

    exportAll() {
      return JSON.stringify({ version: 1, exportedAt: now(), notes }, null, 2);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// The app's store, created on first use.
let defaultStore = null;
export function getNotesStore() {
  if (!defaultStore) defaultStore = createNotesStore();
  return defaultStore;
}
