import { describe, expect, it } from "vitest";
import {
  LEGACY_DEFAULT_API_BASE_URL,
  mergeSettingsWithDefaults,
  resolveDefaultApiBaseUrl,
} from "../state/settings";
import type { Settings } from "../state/settings";

describe("settings defaults", () => {
  it("uses the current app origin for packaged production builds", () => {
    expect(
      resolveDefaultApiBaseUrl({
        dev: false,
        origin: "http://127.0.0.1:3402",
      }),
    ).toBe("http://127.0.0.1:3402");
  });

  it("keeps the documented API port for Vite development", () => {
    expect(
      resolveDefaultApiBaseUrl({
        dev: true,
        origin: "http://127.0.0.1:5173",
      }),
    ).toBe(LEGACY_DEFAULT_API_BASE_URL);
  });

  it("honors explicit environment configuration", () => {
    expect(
      resolveDefaultApiBaseUrl({
        configured: "http://127.0.0.1:3999",
        dev: false,
        origin: "http://127.0.0.1:3402",
      }),
    ).toBe("http://127.0.0.1:3999");
  });

  it("migrates the old saved v0.4.0 default to the packaged app origin", () => {
    const defaults: Settings = {
      language: "ar",
      apiBaseUrl: "http://127.0.0.1:3402",
      direction: "rtl",
      rememberDraft: false,
    };

    expect(
      mergeSettingsWithDefaults({
        defaults,
        migrateLegacyDefault: true,
        stored: { apiBaseUrl: LEGACY_DEFAULT_API_BASE_URL },
      }).apiBaseUrl,
    ).toBe("http://127.0.0.1:3402");
  });
});
