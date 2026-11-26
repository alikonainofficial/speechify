import { useEffect, useState } from "react";
import NotesList from "./components/NotesList";
import NoteView from "./components/NoteView";
import AiPanel from "./components/AiPanel";
import Recorder from "./components/Recorder";
import { useServerConfig } from "./net/useServerConfig";
import { useServerHealth } from "./net/useServerHealth";
import { useNotes } from "./notes/useNotes";
import { useRecordingSession } from "./recording/useRecordingSession";

// Space toggles recording, except while typing or when a control already handles the key.
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName);
}

function App() {
  const notes = useNotes();
  const health = useServerHealth();
  const serverConfig = useServerConfig({ ready: health.healthy });
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const session = useRecordingSession({
    maxSeconds: serverConfig.maxSessionSeconds,
    onComplete: ({ text, durationSec }) => {
      const note = notes.create({ text, durationSec });
      if (note) setSelectedId(note.id);
    },
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== "Space" || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      if (session.phase === "idle" && !health.healthy) return; // can't start until the server is up
      session.toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session, health.healthy]);

  const selectNote = (id) => {
    setSelectedId(id);
    setDrawerOpen(false);
  };

  const selected = notes.notes.find((note) => note.id === selectedId) ?? null;
  const recording = session.phase !== "idle";
  const problems = [session.error, notes.error].filter(Boolean);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[18rem_1fr]">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-6 w-6" />
            Voice Notes
          </h1>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium md:hidden"
            aria-expanded={drawerOpen}
            aria-controls="notes-panel"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            {drawerOpen ? "Close" : `Notes (${notes.notes.length})`}
          </button>
        </div>
        <div
          id="notes-panel"
          className={`${drawerOpen ? "flex" : "hidden"} max-h-[70vh] flex-col px-4 pb-4 md:flex md:max-h-[calc(100vh-4.5rem)]`}
        >
          <NotesList
            notes={notes.notes}
            query={query}
            onQueryChange={setQuery}
            selectedId={selectedId}
            onSelect={selectNote}
          />
        </div>
      </aside>

      <main className="flex flex-col gap-8 px-5 py-8 md:px-12 md:py-12">
        {health.waking && (
          <p role="status" className="max-w-prose rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
            Waking up the free server (up to a minute)… Recording starts working as soon as it answers.
          </p>
        )}
        <Recorder session={session} showTranscript={recording} serverReady={health.healthy} />

        {problems.map((message) => (
          <p key={message} role="alert" className="max-w-prose rounded-lg border border-danger/40 px-4 py-3 text-danger">
            {message}
          </p>
        ))}
        {session.notice && !recording && (
          <p role="status" className="max-w-prose text-muted">
            {session.notice}
          </p>
        )}

        {!recording && selected && (
          <NoteView
            key={selected.id}
            note={selected}
            onUpdate={notes.update}
            onDelete={(id) => {
              notes.remove(id);
              setSelectedId(null);
            }}
            exportMarkdown={notes.exportMarkdown}
            aiPanel={serverConfig.aiEnabled ? <AiPanel note={selected} onUpdate={notes.update} /> : null}
          />
        )}
        {!recording && !selected && notes.notes.length > 0 && (
          <p className="max-w-prose text-muted">Pick a note from the list, or record a new one.</p>
        )}

        <footer className="mt-auto max-w-prose border-t border-line pt-4 text-sm text-muted">
          Free demo: recordings are limited to {serverConfig.maxSessionSeconds} s and a few minutes per day. Notes stay in your browser.
        </footer>
      </main>
    </div>
  );
}

export default App;
