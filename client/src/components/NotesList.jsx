import { formatDate } from "../format";

/**
 * Search box and the list of notes (already newest first).
 * Props: notes, query, onQueryChange, selectedId, onSelect.
 */
export default function NotesList({ notes, query, onQueryChange, selectedId, onSelect }) {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? notes.filter((note) => `${note.title}\n${note.text}`.toLowerCase().includes(needle))
    : notes;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search notes"
        aria-label="Search notes"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 placeholder:text-muted"
      />

      {notes.length === 0 ? (
        <p className="px-1 text-sm text-muted">Your notes will appear here after your first recording.</p>
      ) : visible.length === 0 ? (
        <p className="px-1 text-sm text-muted">No notes match “{query.trim()}”.</p>
      ) : (
        <ul className="-mx-1 flex flex-col gap-0.5 overflow-y-auto" aria-label="Notes">
          {visible.map((note) => {
            const selected = note.id === selectedId;
            return (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onSelect(note.id)}
                  aria-current={selected ? "true" : undefined}
                  className={`w-full rounded-lg border-l-4 px-3 py-2 text-left ${
                    selected ? "border-accent bg-accent/10" : "border-transparent hover:bg-line/40"
                  }`}
                >
                  <span className="block truncate font-medium">{note.title}</span>
                  <span className="block truncate text-sm text-muted">{note.text}</span>
                  <span className="block text-xs text-muted">{formatDate(note.createdAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
