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
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
  },
});
