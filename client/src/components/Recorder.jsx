import { formatClock } from "../format";
import LiveTranscript from "../transcript/LiveTranscript";

const PHASE_LABEL = {
  idle: "Ready",
  connecting: "Connecting…",
  listening: "Listening",
  finishing: "Finishing…",
};

const RING_RADIUS = 54;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The record button: a disc whose ring fills as the session limit runs out.
 * Props: session (from useRecordingSession), showTranscript.
 */
export default function Recorder({ session, showTranscript, serverReady = true }) {
  const { phase, elapsed, maxSeconds, level, connection, toggle, transcript } = session;
  const active = phase === "connecting" || phase === "listening";
  const finishing = phase === "finishing";
  const canStart = phase === "idle" && connection === "connected" && serverReady;
  const progress = Math.min(1, elapsed / maxSeconds);

  return (
    <section aria-label="Recorder" className="flex flex-col gap-6">
      <div className="flex items-center gap-6">
        <button
          type="button"
          data-testid="record-toggle"
          aria-pressed={active || finishing}
          aria-label={active ? "Stop recording" : "Start recording"}
          disabled={finishing || (!active && !canStart)}
          onClick={toggle}
          className="group relative grid h-32 w-32 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={RING_RADIUS} fill="none" strokeWidth="6" className="stroke-line" />
            <circle
              cx="60"
              cy="60"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - progress)}
              opacity={progress > 0 ? 1 : 0}
              className="stroke-rec transition-[stroke-dashoffset] duration-300 ease-linear"
            />
          </svg>
          <span
            className={`grid h-24 w-24 place-items-center rounded-full transition-colors ${
              active || finishing ? "bg-rec text-rec-ink" : "bg-accent text-accent-ink group-hover:brightness-110"
            }`}
          >
            {active || finishing ? (
              <span className="h-7 w-7 rounded-md bg-current" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" strokeLinecap="round" />
              </svg>
            )}
          </span>
        </button>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-lg font-semibold" data-testid="recorder-state" aria-live="polite">
            {phase !== "idle" ? PHASE_LABEL[phase] : canStart ? PHASE_LABEL.idle : "Connecting to the server…"}
          </p>
          <p className="tabular-nums text-muted">
            <span className="text-3xl font-light text-ink" data-testid="timer">
              {formatClock(elapsed)}
            </span>{" "}
            of {formatClock(maxSeconds)}
          </p>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-75"
              style={{ width: `${active ? Math.min(100, Math.round(level * 300)) : 0}%` }}
            />
          </div>
          {phase === "idle" && (
            <p className="hidden text-sm text-muted md:block">
              Press the button or the <kbd className="rounded border border-line px-1 font-sans">Space</kbd> bar to record.
            </p>
          )}
        </div>
      </div>

      {showTranscript && (
        <LiveTranscript
          committed={transcript.committed}
          partial={transcript.partial}
          className="min-h-[6rem] max-w-prose whitespace-pre-wrap font-serif text-xl leading-relaxed"
        />
      )}
    </section>
  );
}
