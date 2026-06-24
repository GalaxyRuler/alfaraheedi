import { vi } from "vitest";
import type {
  Analysis,
  ApplyOutcome,
  LlmStatus,
  LlmSuggestion,
  RuleInfo,
} from "../api/types";

type Handler = () => Response | Promise<Response>;
type Handlers = Record<string, Handler>;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// Route a stubbed `fetch` by "METHOD /path". Missing routes resolve to 404 so a
// test that forgets a handler fails loudly rather than hanging.
export function installFetch(handlers: Handlers) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${new URL(url).pathname}`;
    const handler = handlers[key];
    if (!handler) return new Response("no handler", { status: 404 });
    return handler();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export const okHealth: Handler = () => json({ status: "ok", service: "write-api" });

export function jsonRoute(body: unknown): Handler {
  return () => json(body);
}

export function rejectRoute(): Handler {
  return () => Promise.reject(new TypeError("Failed to fetch"));
}

// ---- Sample payloads matching the real engine output shape ----

export const SAMPLE_ANALYSIS: Analysis = {
  text_len_bytes: 40,
  text_len_utf16: 22,
  text_len_graphemes: 22,
  suggestions: [
    {
      id: "arabic:tatweel:0-6:orthography",
      span: {
        start_byte: 5,
        end_byte: 9,
        start_utf16: 3,
        end_utf16: 5,
        start_grapheme: 3,
        end_grapheme: 5,
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
    },
    {
      id: "arabic:latin-comma:20-21:punctuation",
      span: {
        start_byte: 20,
        end_byte: 21,
        start_utf16: 12,
        end_utf16: 13,
        start_grapheme: 12,
        end_grapheme: 13,
      },
      language: "Arabic",
      category: "Punctuation",
      severity: "Warning",
      confidence: 0.97,
      source: "arabic:latin-comma",
      original: ",",
      replacements: ["،"],
      explanation: "Use Arabic punctuation in Arabic text.",
      safe_auto_apply: false,
    },
  ],
};

export const SAMPLE_APPLY: ApplyOutcome = {
  text: "مرحبا بالعالم",
  applied_count: 1,
  skipped_count: 1,
  remaining_suggestions: [SAMPLE_ANALYSIS.suggestions[1]],
};

export const SAMPLE_RULES: RuleInfo[] = [
  {
    source: "arabic:tatweel",
    language: "Arabic",
    category: "Orthography",
    safe_auto_apply: true,
    description: "Remove tatweel elongation marks.",
  },
  {
    source: "arabic:latin-comma",
    language: "Arabic",
    category: "Punctuation",
    safe_auto_apply: false,
    description: "Use Arabic punctuation in Arabic text.",
  },
];

export const SAMPLE_LLM: LlmStatus = {
  available: false,
  reason: "local LLM runtime is not configured; set ALFARAHEEDI_LLM_BASE_URL",
  runtime: null,
  catalog: {
    policy: {
      default_model_id: "qwen3-1.7b-q4_k_m",
      inference_runtime: "local_openai_compatible_server",
      decision_role: "suggestion_only",
      bundled_weights: false,
      network_downloads_by_default: false,
      hosted_fallback_by_default: false,
      raw_text_logging: false,
      llm_safe_auto_apply: false,
    },
    models: [
      {
        id: "qwen3-1.7b-q4_k_m",
        display_name: "Qwen3 1.7B Q4_K_M",
        source: "hugging_face",
        repo: "ggml-org/Qwen3-1.7B-GGUF",
        filename: "Qwen3-1.7B-Q4_K_M.gguf",
        quantization: "Q4_K_M",
        parameters_billion: 1.7,
        license: "Apache-2.0",
        commercial_ok: true,
        cpu_only: true,
        estimated_min_ram_mb: 4096,
        role: "suggestion_only",
        notes: "Default CPU-local candidate for Arabic explanation and rewrite suggestions.",
      },
    ],
  },
};

export const SAMPLE_LLM_SUGGESTION: LlmSuggestion = {
  source: "llm:local",
  model_id: "qwen3-1.7b-q4_k_m",
  replacement: "مرحبا بالعالم، كيف حالك؟ أنا بخير، شكرًا؛",
  explanation: "اقتراح لغوي كامل للنص.",
  category: "grammar",
  confidence: 0.74,
  safe_auto_apply: false,
};
