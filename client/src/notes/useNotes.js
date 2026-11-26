import { useCallback, useState, useSyncExternalStore } from "react";
import { getNotesStore } from "./notesStore.js";

/**
 * React access to the notes store. Every component using it sees the same list.
 *
 * Returns { notes, error, clearError, create, update, remove, exportMarkdown, exportAll }.
 * Write actions return the result, or null (and set `error`) if storage failed.
 */
export function useNotes(store = getNotesStore()) {
  const notes = useSyncExternalStore(store.subscribe, store.list);
  const [error, setError] = useState(() => store.loadError()?.message ?? null);

  const guard = useCallback(
    (action) =>
      (...args) => {
        try {
          const result = action(...args);
          setError(null);
          return result;
        } catch (err) {
          setError(err.message);
          return null;
        }
      },
    [],
  );

  return {
    notes,
    error,
    clearError: useCallback(() => setError(null), []),
    create: useCallback((...args) => guard(store.create)(...args), [guard, store]),
    update: useCallback((...args) => guard(store.update)(...args), [guard, store]),
    remove: useCallback((...args) => guard(store.remove)(...args), [guard, store]),
    exportMarkdown: store.exportMarkdown,
    exportAll: store.exportAll,
  };
}
