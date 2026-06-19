import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Local-first dev server. No proxy: the frontend talks directly to the
// configurable API base URL (default http://127.0.0.1:3000), and the API
// allows loopback origins via its local-dev CORS layer.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
});
