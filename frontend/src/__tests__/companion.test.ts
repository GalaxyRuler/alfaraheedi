import { afterEach, describe, expect, it } from "vitest";
import type { Suggestion } from "../api/types";
import {
  applySuggestionReplacement,
  buildPrivacySafeSuggestionReport,
  DEFAULT_COMPANION_SETTINGS,
  isTauriRuntime,
} from "../api/companion";

const suggestion: Suggestion = {
  id: "arabic:tatweel:5-9:orthography",
  span: {
    start_byte: 8,
    end_byte: 12,
    start_utf16: 4,
    end_utf16: 6,
    start_grapheme: 4,
    end_grapheme: 6,
  },
  language: "Arabic",
  category: "Orthography",
  severity: "Warning",
  confidence: 0.99,
  source: "arabic:tatweel",
  original: "ــ",
  replacements: [""],
  explanation: "Remove tatweel elongation marks.",
  safe_auto_apply: true,
};

describe("companion utilities", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("detects the Tauri runtime marker", () => {
    expect(isTauriRuntime()).toBe(false);

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });

    expect(isTauriRuntime()).toBe(true);
  });

  it("keeps local LLM disabled by default in companion settings", () => {
    expect(DEFAULT_COMPANION_SETTINGS.llm_base_url).toBe("");
    expect(DEFAULT_COMPANION_SETTINGS.llm_model_id).toBe("qwen3-1.7b-q4_k_m");
    expect(DEFAULT_COMPANION_SETTINGS.llm_timeout_ms).toBe(30_000);
  });

  it("applies a suggestion only when the current span still matches", () => {
    expect(applySuggestionReplacement("مرحبــا", suggestion, "")).toBe("مرحبا");

    expect(() =>
      applySuggestionReplacement("مرحبا", suggestion, ""),
    ).toThrow(/Suggestion changed/);
  });

  it("builds suggestion reports without raw text", () => {
    const report = buildPrivacySafeSuggestionReport({
      appVersion: "0.5.0",
      suggestion,
      sourceApp: "Notepad",
    });

    expect(report).toContain("arabic:tatweel");
    expect(report).toContain("Raw text was not included.");
    expect(report).not.toContain("ــ");
  });
});
