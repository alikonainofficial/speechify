// Read-only live transcript: final text normally, the current partial in grey italics.
// aria-live="polite" lets screen readers announce new words without interrupting.
export default function LiveTranscript({ committed, partial, className = "" }) {
  return (
    <div aria-live="polite" data-testid="live-transcript" className={className}>
      {committed}
      {partial && (
        <>
          {committed ? " " : ""}
          <span className="text-slate-500 italic dark:text-slate-400" data-testid="partial-text">
            {partial}
          </span>
        </>
      )}
    </div>
  );
}
