import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@auto-apply/shared": path.resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    // Dev mirrors production: the browser calls relative `/api/...` URLs on its
    // own origin and this proxy forwards them to the API, as nginx does on the
    // server. http-proxy pipes the response through unbuffered and Vite does
    // not compress proxied responses, so the SSE stream arrives event by event.
    // The Host header stays `localhost:5173`, so the API sees one origin.
    proxy: {
      "/api": { target: "http://localhost:3001" },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
  },
});
