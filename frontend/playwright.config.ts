import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3219);
const baseURL = `http://127.0.0.1:${port}`;
const systemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";
const chromeChannel = systemChrome ? { channel: "chrome" as const } : {};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
  },
  webServer: {
    command: `cargo run -p write-cli -- serve --addr 127.0.0.1:${port} --frontend-dir frontend/dist`,
    cwd: "..",
    env: {
      ALFARAHEEDI_LLM_BASE_URL: "",
      ALFARAHEEDI_LLM_MODEL: "",
      RUST_LOG: "warn",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `${baseURL}/healthz`,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], ...chromeChannel },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"], ...chromeChannel },
    },
  ],
});
