import { useEffect, useState } from "react";
import { fetchServerConfig } from "./api";

const DEFAULTS = { aiEnabled: false, maxSessionSeconds: 60 };

// Loads the server's public settings once the server is up (`ready`).
// Until then (or if it fails), AI stays hidden.
export function useServerConfig({ ready = true } = {}) {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    fetchServerConfig()
      .then((loaded) => {
        if (!cancelled) setConfig({ ...DEFAULTS, ...loaded });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return config;
}
