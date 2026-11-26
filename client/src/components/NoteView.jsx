import { useEffect, useRef, useState } from "react";
import { defaultTitle } from "../notes/notesStore";
import { formatClock, formatDate } from "../format";

function fileName(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "note"}.md`;
}

// Shows a short status ("Saved", "Copied") and clears it after `ms`.
function useFlash(ms = 2000) {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), ms);
  };
  return [message, flash];
}

/**
 * One note: editable title and text (saved on blur), Copy, Download .md, Delete.
 * Props: note, onUpdate(id, changes), onDelete(id), exportMarkdown(note), aiPanel (filled in 5.2).
 * Remount with key={note.id} so the drafts reset when another note is opened.
 */
export default function NoteView({ note, onUpdate, onDelete, exportMarkdown, aiPanel = null }) {
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [saved, flashSaved] = useFlash();

  // The AI panel can change the title or text; show those changes in the inputs.
  useEffect(() => setTitle(note.title), [note.title]);
  useEffect(() => setText(note.text), [note.text]);
  const [copied, flashCopied] = useFlash();

  const save = () => {
    const nextTitle = title.trim() || defaultTitle(text);
    if (nextTitle === note.title && text === note.text) return;
    if (onUpdate(note.id, { title: nextTitle, text })) {
      setTitle(nextTitle);
      flashSaved("Saved");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied("Copied");
    } catch {
      flashCopied("Couldn't copy");
    }
  };

  const download = () => {
    const blob = new Blob([exportMarkdown({ ...note, title, text })], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(title);
    link.click();
    URL.revokeObjectURL(url);
  };

  const remove = () => {
    if (window.confirm(`Delete “${note.title}”? This can't be undone.`)) onDelete(note.id);
  };

  const buttonClass = "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-line/40";

  return (
    <article className="flex max-w-prose flex-col gap-4" aria-label="Note">
      <div className="flex flex-col gap-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          aria-label="Note title"
          data-testid="note-title"
          className="-mx-2 rounded-md bg-transparent px-2 py-1 text-2xl font-semibold"
        />
        <p className="flex flex-wrap gap-x-4 text-sm text-muted">
          <span>{formatDate(note.createdAt)}</span>
          <span>{formatClock(note.durationSec)} recorded</span>
          <span aria-live="polite" className="text-accent">
            {saved}
          </span>
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        aria-label="Note text"
        data-testid="note-text"
        rows={Math.min(18, Math.max(3, Math.ceil(text.length / 70) + 1))}
        className="-mx-2 resize-y rounded-md border border-transparent bg-transparent px-2 py-1 font-serif text-xl leading-relaxed hover:border-line focus:border-line"
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={buttonClass} aria-live="polite">
          {copied ?? "Copy text"}
        </button>
        <button type="button" onClick={download} className={buttonClass}>
          Download .md
        </button>
        <button type="button" onClick={remove} className={`${buttonClass} text-danger`}>
          Delete
        </button>
      </div>

      {aiPanel}
    </article>
  );
}
