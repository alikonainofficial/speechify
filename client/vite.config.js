/// <reference types="vitest" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo-name>/; the deploy workflow sets VITE_BASE.
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.js",
  },
});
