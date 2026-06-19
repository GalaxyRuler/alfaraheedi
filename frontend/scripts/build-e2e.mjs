import { spawnSync } from "node:child_process";

const port = process.env.PLAYWRIGHT_PORT ?? "3219";
const apiBaseUrl =
  process.env.VITE_ALFARAHEEDI_API_BASE_URL ?? `http://127.0.0.1:${port}`;

const result = spawnSync("npm run build", {
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_ALFARAHEEDI_API_BASE_URL: apiBaseUrl,
  },
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
