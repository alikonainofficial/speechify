import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CORRUPT_KEY, STORAGE_KEY, createNotesStore, defaultTitle } from "../../src/notes/notesStore.js";
import { useNotes } from "../../src/notes/useNotes.js";

// An in-memory localStorage that can be told to fail.
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    failWith: null, // an Error to throw from setItem
    failReads: false,
    getItem(key) {
      if (this.failReads) throw new Error("SecurityError");
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (this.failWith) throw this.failWith;
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function quotaError() {
  return Object.assign(new Error("quota"), { name: "QuotaExceededError" });
}

// Deterministic ids and timestamps.
function makeStore(storage = fakeStorage()) {
  let tick = 0;
  let id = 0;
  return createNotesStore({
    storage,
    now: () => new Date(Date.UTC(2026, 10, 26, 10, 0, tick++)).toISOString(),
    newId: () => `note-${++id}`,
  });
}

describe("notesStore", () => {
  it("creates, reads, updates and removes notes, and persists them", () => {
    const storage = fakeStorage();
    const store = makeStore(storage);

    const note = store.create({ text: "Buy milk and eggs", durationSec: 12 });
    expect(note).toMatchObject({ id: "note-1", title: "Buy milk and eggs", text: "Buy milk and eggs", durationSec: 12 });
    expect(store.get("note-1")).toEqual(note);

    const updated = store.update("note-1", { title: "Shopping", id: "hacked", createdAt: "x" });
    expect(updated.title).toBe("Shopping");
    expect(updated.id).toBe("note-1");
    expect(updated.createdAt).toBe(note.createdAt);
    expect(updated.updatedAt > note.updatedAt).toBe(true);

    expect(JSON.parse(storage.data.get(STORAGE_KEY))).toEqual([updated]);

    expect(store.remove("note-1")).toBe(true);
    expect(store.list()).toEqual([]);
    expect(store.remove("missing")).toBe(false);
    expect(store.update("missing", { title: "x" })).toBeNull();
  });

  it("lists newest first, and reloads in that order", () => {
    const storage = fakeStorage();
    const store = makeStore(storage);
    store.create({ text: "first" });
    store.create({ text: "second" });
    store.create({ text: "third" });

    expect(store.list().map((n) => n.text)).toEqual(["third", "second", "first"]);
    expect(makeStore(storage).list().map((n) => n.text)).toEqual(["third", "second", "first"]);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["a non-array", JSON.stringify({ notes: [] })],
    ["notes missing fields", JSON.stringify([{ id: 1 }])],
  ])("recovers from %s: starts empty and keeps the bad value", (_label, bad) => {
    const storage = fakeStorage({ [STORAGE_KEY]: bad });
    const store = makeStore(storage);

    expect(store.list()).toEqual([]);
    expect(storage.data.get(CORRUPT_KEY)).toBe(bad);
    expect(storage.data.get(STORAGE_KEY)).toBe(bad); // untouched until the next save
  });

  it("doesn't overwrite an earlier corrupt backup", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: "bad-2", [CORRUPT_KEY]: "bad-1" });
    makeStore(storage);

    expect(storage.data.get(CORRUPT_KEY)).toBe("bad-1");
    expect([...storage.data.values()]).toContain("bad-2");
  });

  it("surfaces a quota error and keeps the previous notes", () => {
    const storage = fakeStorage();
    const store = makeStore(storage);
    store.create({ text: "kept" });

    storage.failWith = quotaError();
    expect(() => store.create({ text: "too big" })).toThrow(/storage is full/i);
    expect(store.list().map((n) => n.text)).toEqual(["kept"]);
    expect(() => store.create({ text: "x" })).toThrow(expect.objectContaining({ code: "quota" }));
  });

  it("starts empty with a load error when storage can't be read", () => {
    const storage = fakeStorage();
    storage.failReads = true;
    const store = makeStore(storage);

    expect(store.list()).toEqual([]);
    expect(store.loadError().code).toBe("unavailable");
  });

  it("exports a note as Markdown and everything as JSON", () => {
    const store = makeStore();
    const note = store.create({ text: "Hello world.", title: "Greeting", durationSec: 75 });
    const withAi = store.update(note.id, { ai: { summary: "A greeting.", tags: ["hello", "test"] } });

    expect(store.exportMarkdown(withAi)).toBe(
      `# Greeting\n\n_Recorded ${note.createdAt} · 1:15_\n\nHello world.\n\n## AI summary\n\nA greeting.\n\nTags: hello, test\n`,
    );
    const exported = JSON.parse(store.exportAll());
    expect(exported.version).toBe(1);
    expect(exported.notes).toEqual([withAi]);
  });
});

describe("defaultTitle", () => {
  it.each([
    ["", "Untitled note"],
    ["Call mum.", "Call mum"],
    ["one two three four five six seven eight nine", "one two three four five six seven…"],
  ])("defaultTitle(%j) = %j", (text, expected) => {
    expect(defaultTitle(text)).toBe(expected);
  });
});

describe("useNotes", () => {
  it("shares the list across components and re-renders on change", () => {
    const store = makeStore();
    const a = renderHook(() => useNotes(store));
    const b = renderHook(() => useNotes(store));

    act(() => {
      a.result.current.create({ text: "shared" });
    });

    expect(b.result.current.notes.map((n) => n.text)).toEqual(["shared"]);
  });

  it("turns storage failures into an error message instead of throwing", () => {
    const storage = fakeStorage();
    const store = makeStore(storage);
    const { result } = renderHook(() => useNotes(store));
    storage.failWith = quotaError();

    let created;
    act(() => {
      created = result.current.create({ text: "x" });
    });

    expect(created).toBeNull();
    expect(result.current.error).toMatch(/storage is full/i);

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
