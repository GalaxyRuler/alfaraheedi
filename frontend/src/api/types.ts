// These types mirror the serde output of the Rust engine (crate `write-core`
// and `write-api`). Enums are serialized in PascalCase because the Rust enums
// carry no `rename_all`, so the string unions below must match exactly.

export type Language = "Arabic" | "English" | "Mixed" | "Unknown";

export type Category =
  | "Orthography"
  | "Punctuation"
  | "Spacing"
  | "Spelling"
  | "Grammar"
  | "Style"
  | "ProtectedSpan";

export type Severity = "Info" | "Warning" | "Error";

export interface TextSpan {
  start_byte: number;
  end_byte: number;
  start_utf16: number;
  end_utf16: number;
  start_grapheme: number;
  end_grapheme: number;
}

export interface Suggestion {
  id: string;
  span: TextSpan;
  language: Language;
  category: Category;
  severity: Severity;
  confidence: number;
  source: string;
  original: string;
  replacements: string[];
  explanation: string;
  safe_auto_apply: boolean;
}

export interface Analysis {
  text_len_bytes: number;
  text_len_utf16: number;
  text_len_graphemes: number;
  suggestions: Suggestion[];
}

export interface RuleInfo {
  source: string;
  language: Language;
  category: Category;
  safe_auto_apply: boolean;
  description: string;
}

export interface ApplyOutcome {
  text: string;
  applied_count: number;
  skipped_count: number;
  remaining_suggestions: Suggestion[];
}

export interface LlmPolicy {
  default_model_id: string;
  inference_runtime: string;
  decision_role: string;
  bundled_weights: boolean;
  network_downloads_by_default: boolean;
  hosted_fallback_by_default: boolean;
  raw_text_logging: boolean;
  llm_safe_auto_apply: boolean;
}

export interface LocalModel {
  id: string;
  display_name: string;
  source: string;
  repo: string;
  filename: string;
  quantization: string;
  parameters_billion: number;
  license: string;
  commercial_ok: boolean;
  cpu_only: boolean;
  estimated_min_ram_mb: number;
  role: string;
  notes: string;
}

export interface LlmCatalog {
  policy: LlmPolicy;
  models: LocalModel[];
}

export interface LlmRuntimeConfig {
  base_url: string;
  model_id: string;
  timeout_ms: number;
}

export interface LlmStatus {
  available: boolean;
  reason: string;
  runtime: LlmRuntimeConfig | null;
  catalog: LlmCatalog;
}

export type LlmDoctorOutcome = "pass" | "warn" | "fail" | "skip";

export interface LlmDoctorCheck {
  name: string;
  outcome: LlmDoctorOutcome;
  message: string;
}

export interface LlmDoctorReport {
  ok: boolean;
  available: boolean;
  summary: string;
  runtime: LlmRuntimeConfig | null;
  catalog: LlmCatalog;
  checks: LlmDoctorCheck[];
}

export interface LlmSuggestion {
  source: string;
  model_id: string;
  replacement: string;
  explanation: string;
  confidence: number;
  safe_auto_apply: boolean;
}

export interface HealthResponse {
  status: string;
  service: string;
}
