import { describe, expect, it } from "vitest";
import { buildFeedbackReport, safeApiOrigin } from "../lib/feedbackReport";
import { SAMPLE_ANALYSIS } from "../test/mockApi";
import type { FeedbackReportEnvironment } from "../lib/feedbackReport";

const environment: FeedbackReportEnvironment = {
  ui_language: "en",
  editor_direction: "rtl",
  api_origin: "http://127.0.0.1:3000",
  browser_language: "en-US",
  viewport_width: 1280,
  viewport_height: 720,
  online: true,
};

const target = {
  kind: "suggestion" as const,
  text: "مرحبــا بالعالم,",
  suggestions: SAMPLE_ANALYSIS.suggestions,
  suggestion: SAMPLE_ANALYSIS.suggestions[1],
  selectedText: {
    start_utf16: 12,
    end_utf16: 13,
    text: ",",
  },
};

describe("feedback report builder", () => {
  it("omits raw text unless the user explicitly opts in", () => {
    const report = buildFeedbackReport({
      target,
      rawTextMode: "none",
      environment,
      appVersion: "0.3.0",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    expect(report.payload.raw_text).toEqual({ mode: "none", included: false });
    expect(report.markdown).toContain("Raw text was not included.");
    expect(report.markdown).not.toContain("مرحبــا بالعالم");
    expect(report.payload.suggestion?.source).toBe("arabic:latin-comma");
    expect(report.payload.suggestion?.status).toBe("suggestion_only");
    expect(report.payload.suggestion).not.toHaveProperty("original");
    expect(report.payload.suggestion).not.toHaveProperty("replacements");
    expect(report.issueUrl).toContain("github.com/GalaxyRuler/alfaraheedi");
  });

  it("includes only selected text when selected mode is chosen", () => {
    const report = buildFeedbackReport({
      target,
      rawTextMode: "selected",
      environment,
      appVersion: "0.3.0",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    expect(report.payload.raw_text).toMatchObject({
      mode: "selected",
      included: true,
      content: ",",
      start_utf16: 12,
      end_utf16: 13,
    });
    expect(report.markdown).toContain("```text\n,\n```");
    expect(report.markdown).not.toContain("مرحبــا بالعالم");
    expect(report.payload.suggestion?.original).toBe(",");
    expect(report.payload.suggestion?.replacements).toEqual(["،"]);
  });

  it("includes full text only when full mode is chosen", () => {
    const report = buildFeedbackReport({
      target,
      rawTextMode: "full",
      environment,
      appVersion: "0.3.0",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    expect(report.payload.raw_text).toMatchObject({
      mode: "full",
      included: true,
      content: target.text,
      start_utf16: 0,
      end_utf16: target.text.length,
    });
    expect(report.markdown).toContain(target.text);
  });

  it("keeps API environment metadata to origin only", () => {
    expect(safeApiOrigin("http://127.0.0.1:3000/v1/health?x=1")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(safeApiOrigin("not a url")).toBe("invalid-api-url");
  });
});
