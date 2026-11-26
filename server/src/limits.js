// Limits that keep a free public demo from burning through the Deepgram credit.
// Everything is in memory: it resets when the server restarts, so treat it as best-effort.

// The browser's IP. Behind a trusted proxy (Render) the real IP is the first X-Forwarded-For entry.
export function getClientIp(socket, config) {
  const { address, headers } = socket.handshake;
  if (config.trustProxy) {
    const forwarded = headers["x-forwarded-for"];
    const first = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
    if (first) return first;
  }
  return address;
}

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10); // "2026-11-26"
}

/**
 * Tracks streams across the whole server:
 * - at most `maxConcurrentStreams` at once;
 * - at most `dailySecondsPerIp` seconds of streaming per IP per UTC day.
 */
export function createStreamLimits({ maxConcurrentStreams, dailySecondsPerIp, now }) {
  let activeStreams = 0;
  let day = utcDay(now());
  let secondsUsedByIp = new Map();

  function rollOverDay() {
    const today = utcDay(now());
    if (today !== day) {
      day = today;
      secondsUsedByIp = new Map();
    }
  }

  function remainingSeconds(ip) {
    rollOverDay();
    return Math.max(0, dailySecondsPerIp - (secondsUsedByIp.get(ip) ?? 0));
  }

  /**
   * Reserves a stream slot for `ip`.
   * Returns { ok: true, lease } or { ok: false, code: "BUSY" | "DAILY_LIMIT" }.
   * lease.secondsAllowed is how long this IP may stream today; lease.release() ends it (safe to call twice).
   */
  function acquire(ip) {
    const secondsAllowed = remainingSeconds(ip);
    if (secondsAllowed <= 0) return { ok: false, code: "DAILY_LIMIT" };
    if (activeStreams >= maxConcurrentStreams) return { ok: false, code: "BUSY" };

    activeStreams += 1;
    const startedAt = now();
    let released = false;

    const lease = {
      secondsAllowed,
      release() {
        if (released) return;
        released = true;
        activeStreams -= 1;
        rollOverDay();
        const used = (now() - startedAt) / 1000;
        secondsUsedByIp.set(ip, (secondsUsedByIp.get(ip) ?? 0) + used);
      },
    };
    return { ok: true, lease };
  }

  return { acquire };
}

export const LIMIT_MESSAGES = {
  BUSY: "The demo is busy right now. Please try again in a minute.",
  DAILY_LIMIT: "You've used today's free transcription time. Please come back tomorrow.",
};
