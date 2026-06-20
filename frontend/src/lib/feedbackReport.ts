import type { Suggestion, TextSpan } from "../api/types";
import type { Direction } from "../state/settings";
import type { Lang } from "../i18n/strings";

export type FeedbackReportKind = "analysis" | "suggestion";
export type RawTextMode = "none" | "selected" | "full";

export interface EditorSelection {
  start_utf16: number;
  end_utf16: number;
  text: string;
}

export interface FeedbackReportEnvironment {
  ui_language: Lang;
  editor_direction: Direction;
  api_origin: string;
  browser_language: string;
  viewport_width: number;
  viewport_height: number;
  online: boolean;
}

export interface FeedbackReportTarget {
  kind: FeedbackReportKind;
  text: string;
  suggestions: Suggestion[];
  selectedText: EditorSelection | null;
  suggestion?: Suggestion;
}

interface RawTextPayload {
  mode: RawTextMode;
  included: boolean;
  content?: string;
  start_utf16?: number;
  end_utf16?: number;
  length_utf16?: number;
}

export interface FeedbackReportPayload {
  schema_version: 1;
  app: {
    name: "alfaraheedi-web";
    version: string;
  };
  report_kind: FeedbackReportKind;
  created_at: string;
  environment: FeedbackReportEnvironment;
  analysis: {
    text_length_utf16: number;
    text_length_bytes: number;
    suggestion_count: number;
    safe_auto_apply_count: number;
    suggestion_sources: string[];
  };
  suggestion?: {
    id: string;
    source: string;
    category: string;
    severity: string;
    confidence: number;
    safe_auto_apply: boolean;
    status: "safe_auto_apply" | "suggestion_only";
    span: TextSpan;
    original_length_utf16: number;
    replacement_count: number;
    original?: string;
    replacements?: string[];
    explanation: string;
  };
  raw_text: RawTextPayload;
}

export interface FeedbackReport {
  payload: FeedbackReportPayload;
  markdown: string;
  issueUrl: string;
}

export interface BuildFeedbackReportOptions {
  target: FeedbackReportTarget;
  rawTextMode: RawTextMode;
  environment: FeedbackReportEnvironment;
  appVersion: string;
  createdAt?: string;
}

export function safeApiOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "invalid-api-url";
  }
}

function textByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function selectedRawPayload(selection: EditorSelection | null): RawTextPayload {
  if (!selection || selection.text.length === 0) {
    return { mode: "selected", included: false };
  }
  return {
    mode: "selected",
    included: true,
    content: selection.text,
    start_utf16: selection.start_utf16,
    end_utf16: selection.end_utf16,
    length_utf16: selection.text.length,
  };
}

function rawTextPayload(
  mode: RawTextMode,
  text: string,
  selection: EditorSelection | null,
): RawTextPayload {
  if (mode === "full") {
    return {
      mode,
      included: true,
      content: text,
      start_utf16: 0,
      end_utf16: text.length,
      length_utf16: text.length,
    };
  }
  if (mode === "selected") return selectedRawPayload(selection);
  return { mode: "none", included: false };
}

function suggestionPayload(suggestion: Suggestion, includeRawSuggestionText: boolean) {
  return {
    id: suggestion.id,
    source: suggestion.source,
    category: suggestion.category,
    severity: suggestion.severity,
    confidence: suggestion.confidence,
    safe_auto_apply: suggestion.safe_auto_apply,
    status: suggestion.safe_auto_apply ? "safe_auto_apply" : "suggestion_only",
    span: suggestion.span,
    original_length_utf16: suggestion.original.length,
    replacement_count: suggestion.replacements.length,
    ...(includeRawSuggestionText
      ? {
          original: suggestion.original,
          replacements: suggestion.replacements,
        }
      : {}),
    explanation: suggestion.explanation,
  } as const;
}

function issueTitle(payload: FeedbackReportPayload): string {
  if (payload.suggestion) {
    return `[feedback]: ${payload.suggestion.source}`;
  }
  return "[feedback]: analysis report";
}

function githubIssueUrl(title: string, body: string): string {
  const url = new URL("https://github.com/GalaxyRuler/alfaraheedi/issues/new");
  url.searchParams.set("title", title);
  url.searchParams.set("labels", "area: feedback,privacy");
  url.searchParams.set("body", body);
  return url.toString();
}

function rawTextSection(rawText: RawTextPayload): string {
  if (!rawText.included) {
    return `Raw text mode: \`${rawText.mode}\`\n\nRaw text was not included.`;
  }

  return [
    `Raw text mode: \`${rawText.mode}\``,
    "",
    "```text",
    rawText.content ?? "",
    "```",
  ].join("\n");
}

export function renderFeedbackMarkdown(payload: FeedbackReportPayload): string {
  const lines = [
    "# Alfaraheedi Feedback Report",
    "",
    "This report was generated locally in the browser. Nothing is sent automatically.",
    "",
    "## Summary",
    "",
    `- Schema version: ${payload.schema_version}`,
    `- App version: ${payload.app.version}`,
    `- Report kind: ${payload.report_kind}`,
    `- Created at: ${payload.created_at}`,
    `- Suggestion count: ${payload.analysis.suggestion_count}`,
    `- Safe auto-apply count: ${payload.analysis.safe_auto_apply_count}`,
  ];

  if (payload.suggestion) {
    lines.push(
      "",
      "## Suggestion",
      "",
      `- Source: \`${payload.suggestion.source}\``,
      `- Status: \`${payload.suggestion.status}\``,
      `- Safe auto-apply: ${payload.suggestion.safe_auto_apply ? "yes" : "no"}`,
      `- Category: \`${payload.suggestion.category}\``,
      `- Severity: \`${payload.suggestion.severity}\``,
      `- Confidence: ${payload.suggestion.confidence}`,
      `- UTF-16 span: ${payload.suggestion.span.start_utf16}-${payload.suggestion.span.end_utf16}`,
      `- Original length: ${payload.suggestion.original_length_utf16}`,
      `- Replacement count: ${payload.suggestion.replacement_count}`,
    );
  }

  lines.push(
    "",
    "## Raw Text",
    "",
    rawTextSection(payload.raw_text),
    "",
    "## Environment",
    "",
    `- UI language: \`${payload.environment.ui_language}\``,
    `- Editor direction: \`${payload.environment.editor_direction}\``,
    `- API origin: \`${payload.environment.api_origin}\``,
    `- Browser language: \`${payload.environment.browser_language}\``,
    `- Viewport: ${payload.environment.viewport_width}x${payload.environment.viewport_height}`,
    "",
    "## Machine-Readable Payload",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  );

  return `${lines.join("\n")}\n`;
}

export function buildFeedbackReport({
  target,
  rawTextMode,
  environment,
  appVersion,
  createdAt = new Date().toISOString(),
}: BuildFeedbackReportOptions): FeedbackReport {
  const raw_text = rawTextPayload(rawTextMode, target.text, target.selectedText);
  const payload: FeedbackReportPayload = {
    schema_version: 1,
    app: {
      name: "alfaraheedi-web",
      version: appVersion,
    },
    report_kind: target.kind,
    created_at: createdAt,
    environment,
    analysis: {
      text_length_utf16: target.text.length,
      text_length_bytes: textByteLength(target.text),
      suggestion_count: target.suggestions.length,
      safe_auto_apply_count: target.suggestions.filter((s) => s.safe_auto_apply)
        .length,
      suggestion_sources: target.suggestions.map((s) => s.source),
    },
    ...(target.suggestion
      ? { suggestion: suggestionPayload(target.suggestion, raw_text.included) }
      : {}),
    raw_text,
  };

  const markdown = renderFeedbackMarkdown(payload);
  return {
    payload,
    markdown,
    issueUrl: githubIssueUrl(issueTitle(payload), markdown),
  };
}
