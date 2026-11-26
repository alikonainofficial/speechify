import { useEffect, useState } from "react";
import { SERVER_URL } from "./serverUrl";

/**
 * Checks GET /health until the server answers. The free Render server sleeps after
 * 15 minutes and takes up to a minute to wake, so this retries every `retryMs`.
 *
 * Returns { healthy, waking }: `waking` is true once the server has been slow to answer
 * (a failed check, or no answer after `slowMs`), so the UI can explain the wait.
 */
export function useServerHealth({ retryMs = 5000, timeoutMs = 4000, slowMs = 1500 } = {}) {
  const [healthy, setHealthy] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    const slowTimer = setTimeout(() => setSlow(true), slowMs);

    const check = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(timeoutMs) });
        if (response.ok) {
          if (!cancelled) setHealthy(true);
          return;
        }
      } catch {
        // asleep, waking up or unreachable: try again below
      }
      if (cancelled) return;
      setSlow(true);
      retryTimer = setTimeout(check, retryMs);
    };
    check();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearTimeout(slowTimer);
    };
  }, [retryMs, timeoutMs, slowMs]);

  return { healthy, waking: !healthy && slow };
}
