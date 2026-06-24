import { invoke } from "@tauri-apps/api/core";
import type {
  Analysis,
  ApplyOutcome,
  LlmDoctorReport,
  LlmStatus,
  LlmSuggestion,
  Suggestion,
} from "./types";

export type WritingMode = "auto" | "arabic" | "english" | "mixed";
export type CapturePreference = "auto" | "uia_first" | "clipboard_first";
export type LlmRuntimePreset =
  | "llama_cpp_server"
  | "llama_cpp_python_server"
  | "onnx_runtime_genai_future";

export interface CompanionSettings {
  ui_language: "ar" | "en";
  writing_mode: WritingMode;
  hotkey: string;
  restore_clipboard: boolean;
  first_run_privacy_seen: boolean;
  capture_preference: CapturePreference;
  llm_runtime_preset: LlmRuntimePreset;
  llm_base_url: string;
  llm_model_id: string;
  llm_timeout_ms: number;
}

export interface CompanionStatus {
  engine_online: boolean;
  hotkey: string;
  mode: "hotkey_companion";
  uia_pilot: UiaPilotStatus;
}

export type CaptureMethod = "windows_uia_text_pattern" | "clipboard_shortcut";
export type ErrorCategory =
  | "no_selected_text"
  | "clipboard_unavailable"
  | "app_blocked_copy"
  | "large_selection"
  | "operation_failed";

export interface CaptureDiagnostic {
  method: CaptureMethod;
  source_app: string | null;
  error_category: ErrorCategory | null;
  no_selected_text: boolean;
  clipboard_unavailable: boolean;
  app_blocked_copy: boolean;
}

export interface UiaPilotStatus {
  available: boolean;
  capture_supported: boolean;
  replacement_supported: boolean;
  platform: string;
  method: "windows_uia_text_pattern";
  reason: string;
}

export interface CaptureResult {
  captured_text: string;
  current_text: string;
  source_app: string | null;
  capture_method?: CaptureMethod;
  writing_mode: WritingMode;
  analysis: Analysis;
  safe_count: number;
  restore_warning: string | null;
  diagnostic: CaptureDiagnostic;
}

export interface SessionAnalysis {
  captured_text: string;
  current_text: string;
  source_app: string | null;
  capture_method?: CaptureMethod;
  writing_mode: WritingMode;
  analysis: Analysis;
  safe_count: number;
  diagnostic: CaptureDiagnostic;
}

export interface ReplacementResult {
  applied_text: string;
  restore_warning: string | null;
}

export interface CommandError {
  message: string;
  category?: ErrorCategory;
  diagnostic?: CaptureDiagnostic | null;
}

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  ui_language: "ar",
  writing_mode: "auto",
  hotkey: "Ctrl+Alt+A",
  restore_clipboard: true,
  first_run_privacy_seen: false,
  capture_preference: "auto",
  llm_runtime_preset: "llama_cpp_server",
  llm_base_url: "",
  llm_model_id: "qwen3-1.7b-q4_k_m",
  llm_timeout_ms: 30_000,
};

export interface CompanionClient {
  captureSelectedText(): Promise<CaptureResult>;
  analyzeCapturedText(text?: string): Promise<SessionAnalysis>;
  applySafeToSession(): Promise<ApplyOutcome>;
  applyReplacementToSelection(replacement: string): Promise<ReplacementResult>;
  copyCorrectedText(text: string): Promise<void>;
  getSettings(): Promise<CompanionSettings>;
  saveSettings(settings: CompanionSettings): Promise<CompanionSettings>;
  getStatus(): Promise<CompanionStatus>;
  getUiaPilotStatus(): Promise<UiaPilotStatus>;
  getLlmStatus(): Promise<LlmStatus>;
  runLlmDoctor(): Promise<LlmDoctorReport>;
  suggestWithLocalLlmForSession(): Promise<LlmSuggestion>;
  cancelLocalLlmSuggestion(): Promise<boolean>;
}

export const companionClient: CompanionClient = {
  captureSelectedText: () => invoke<CaptureResult>("capture_selected_text"),
  analyzeCapturedText: (text) =>
    invoke<SessionAnalysis>(
      "analyze_captured_text",
      text === undefined ? {} : { text },
    ),
  applySafeToSession: () => invoke<ApplyOutcome>("apply_safe_to_session"),
  applyReplacementToSelection: (replacement) =>
    invoke<ReplacementResult>("apply_replacement_to_selection", { replacement }),
  copyCorrectedText: (text) => invoke<void>("copy_corrected_text", { text }),
  getSettings: () => invoke<CompanionSettings>("get_companion_settings"),
  saveSettings: (settings) =>
    invoke<CompanionSettings>("save_companion_settings", { settings }),
  getStatus: () => invoke<CompanionStatus>("get_companion_status"),
  getUiaPilotStatus: () => invoke<UiaPilotStatus>("get_uia_pilot_status"),
  getLlmStatus: () => invoke<LlmStatus>("get_companion_llm_status"),
  runLlmDoctor: () => invoke<LlmDoctorReport>("run_companion_llm_doctor"),
  suggestWithLocalLlmForSession: () =>
    invoke<LlmSuggestion>("suggest_with_local_llm_for_session"),
  cancelLocalLlmSuggestion: () =>
    invoke<boolean>("cancel_companion_llm_suggestion"),
};

export function applySuggestionReplacement(
  text: string,
  suggestion: Suggestion,
  replacement: string,
): string {
  const { start_utf16, end_utf16 } = suggestion.span;
  const current = text.slice(start_utf16, end_utf16);
  if (current !== suggestion.original) {
    throw new Error("Suggestion changed; refresh analysis before applying it.");
  }
  return text.slice(0, start_utf16) + replacement + text.slice(end_utf16);
}

export function buildPrivacySafeSuggestionReport({
  appVersion,
  suggestion,
  sourceApp,
}: {
  appVersion: string;
  suggestion: Suggestion;
  sourceApp: string | null;
}): string {
  return [
    "# Nahou Companion Feedback",
    "",
    `App version: ${appVersion}`,
    `Surface: ${sourceApp ?? "unknown"}`,
    `Suggestion source: ${suggestion.source}`,
    `Category: ${suggestion.category}`,
    `Severity: ${suggestion.severity}`,
    `Safe auto apply: ${suggestion.safe_auto_apply ? "yes" : "no"}`,
    `Original length: ${[...suggestion.original].length} chars`,
    "",
    "Raw text was not included.",
  ].join("\n");
}
