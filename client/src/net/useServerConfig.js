import { useEffect, useState } from "react";
import { fetchServerConfig } from "./api";

const DEFAULTS = { aiEnabled: false, maxSessionSeconds: 60 };

// Loads the server's public settings once. Until then (or if it fails), AI stays hidden.
export function useServerConfig() {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    fetchServerConfig()
      .then((loaded) => {
        if (!cancelled) setConfig({ ...DEFAULTS, ...loaded });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
