use std::{env, time::Duration};

use serde::{Deserialize, Serialize};

pub const DEFAULT_MODEL_ID: &str = "qwen3-1.7b-q4_k_m";
pub const ENV_LLM_BASE_URL: &str = "ALFARAHEEDI_LLM_BASE_URL";
pub const ENV_LLM_MODEL: &str = "ALFARAHEEDI_LLM_MODEL";
pub const ENV_LLM_TIMEOUT_MS: &str = "ALFARAHEEDI_LLM_TIMEOUT_MS";
pub const DEFAULT_TIMEOUT_MS: u64 = 30_000;
pub const MAX_LLM_INPUT_CHARS: usize = 6_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LlmCatalog {
    pub policy: LlmPolicy,
    pub models: Vec<LocalModel>,
}

impl LlmCatalog {
    pub fn default_model(&self) -> Option<&LocalModel> {
        self.model(&self.policy.default_model_id)
    }

    pub fn model(&self, id: &str) -> Option<&LocalModel> {
        self.models.iter().find(|model| model.id == id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LlmPolicy {
    pub default_model_id: String,
    pub inference_runtime: InferenceRuntime,
    pub decision_role: DecisionRole,
    pub bundled_weights: bool,
    pub network_downloads_by_default: bool,
    pub hosted_fallback_by_default: bool,
    pub raw_text_logging: bool,
    pub llm_safe_auto_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InferenceRuntime {
    #[serde(rename = "local_openai_compatible_server")]
    LocalOpenAiCompatibleServer,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionRole {
    SuggestionOnly,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LocalModel {
    pub id: String,
    pub display_name: String,
    pub source: ModelSource,
    pub repo: String,
    pub filename: String,
    pub quantization: String,
    pub parameters_billion: f32,
    pub license: String,
    pub commercial_ok: bool,
    pub cpu_only: bool,
    pub estimated_min_ram_mb: u32,
    pub role: DecisionRole,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelSource {
    HuggingFace,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LlmRuntimeConfig {
    pub base_url: String,
    pub model_id: String,
    pub timeout_ms: u64,
}

impl LlmRuntimeConfig {
    pub fn new(base_url: impl Into<String>, model_id: impl Into<String>, timeout_ms: u64) -> Self {
        Self {
            base_url: normalize_base_url(base_url.into()),
            model_id: model_id.into(),
            timeout_ms,
        }
    }

    pub fn from_env() -> Option<Self> {
        let base_url = env::var(ENV_LLM_BASE_URL).ok()?;
        let base_url = normalize_base_url(base_url);
        if base_url.is_empty() {
            return None;
        }

        let model_id = env::var(ENV_LLM_MODEL)
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| DEFAULT_MODEL_ID.to_owned());

        let timeout_ms = env::var(ENV_LLM_TIMEOUT_MS)
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| (1_000..=120_000).contains(value))
            .unwrap_or(DEFAULT_TIMEOUT_MS);

        Some(Self {
            base_url,
            model_id,
            timeout_ms,
        })
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

fn normalize_base_url(value: String) -> String {
    value.trim().trim_end_matches('/').to_owned()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LlmStatus {
    pub available: bool,
    pub reason: String,
    pub runtime: Option<LlmRuntimeConfig>,
    pub catalog: LlmCatalog,
}

pub fn default_status() -> LlmStatus {
    LlmStatus {
        available: false,
        reason: format!("local LLM runtime is not configured; set {ENV_LLM_BASE_URL}"),
        runtime: None,
        catalog: builtin_catalog(),
    }
}

pub async fn runtime_status(config: &LlmRuntimeConfig) -> LlmStatus {
    let client = match client(config) {
        Ok(client) => client,
        Err(error) => {
            return configured_status(
                config,
                false,
                format!("local LLM HTTP client could not be created: {error}"),
            );
        }
    };

    match client.get(config.endpoint("/v1/models")).send().await {
        Ok(response) if response.status().is_success() => configured_status(
            config,
            true,
            "local LLM runtime is configured and reachable".to_owned(),
        ),
        Ok(response) => configured_status(
            config,
            false,
            format!(
                "local LLM runtime responded with HTTP {}",
                response.status()
            ),
        ),
        Err(error) => configured_status(
            config,
            false,
            format!("local LLM runtime is configured but unreachable: {error}"),
        ),
    }
}

fn configured_status(config: &LlmRuntimeConfig, available: bool, reason: String) -> LlmStatus {
    LlmStatus {
        available,
        reason,
        runtime: Some(config.clone()),
        catalog: builtin_catalog(),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LlmSuggestion {
    pub source: String,
    pub model_id: String,
    pub replacement: String,
    pub explanation: String,
    pub confidence: f32,
    pub safe_auto_apply: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("local LLM runtime is not configured; set {ENV_LLM_BASE_URL}")]
    NotConfigured,
    #[error("input is too long for local LLM suggestions (max {max_chars} characters)")]
    InputTooLong { max_chars: usize },
    #[error("local LLM HTTP client could not be created: {0}")]
    Client(reqwest::Error),
    #[error("local LLM request failed: {0}")]
    Request(reqwest::Error),
    #[error("local LLM returned HTTP {status}")]
    Http { status: reqwest::StatusCode },
    #[error("local LLM response did not include a message")]
    EmptyResponse,
    #[error("local LLM response was not valid suggestion JSON")]
    InvalidResponse,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u16,
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Debug, Deserialize)]
struct ChatChoiceMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct SuggestionPayload {
    replacement: String,
    explanation: Option<String>,
    confidence: Option<f32>,
}

pub async fn suggest(config: &LlmRuntimeConfig, text: &str) -> Result<LlmSuggestion, LlmError> {
    ensure_input_bounds(text)?;

    let client = client(config).map_err(LlmError::Client)?;
    let request = ChatCompletionRequest {
        model: config.model_id.clone(),
        temperature: 0.2,
        max_tokens: 768,
        messages: vec![
            ChatMessage {
                role: "system",
                content: system_prompt().to_owned(),
            },
            ChatMessage {
                role: "user",
                content: format!("Text:\n{text}"),
            },
        ],
    };

    let response = client
        .post(config.endpoint("/v1/chat/completions"))
        .json(&request)
        .send()
        .await
        .map_err(LlmError::Request)?;

    if !response.status().is_success() {
        return Err(LlmError::Http {
            status: response.status(),
        });
    }

    let completion = response
        .json::<ChatCompletionResponse>()
        .await
        .map_err(LlmError::Request)?;
    let content = completion
        .choices
        .first()
        .map(|choice| choice.message.content.trim())
        .filter(|content| !content.is_empty())
        .ok_or(LlmError::EmptyResponse)?;

    parse_suggestion_content(content, &config.model_id)
}

fn client(config: &LlmRuntimeConfig) -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(config.timeout_ms))
        .build()
}

fn ensure_input_bounds(text: &str) -> Result<(), LlmError> {
    if text.chars().count() > MAX_LLM_INPUT_CHARS {
        return Err(LlmError::InputTooLong {
            max_chars: MAX_LLM_INPUT_CHARS,
        });
    }
    Ok(())
}

fn system_prompt() -> &'static str {
    "You are Alfaraheedi's local Arabic writing assistant. Return JSON only. \
Use this exact shape: {\"replacement\":\"...\",\"explanation\":\"...\",\"confidence\":0.0}. \
The replacement is a full revised version of the user's text. \
Do not invent facts. Do not explain outside JSON. \
Your output is suggestion-only and must never be described as safe auto-apply."
}

fn parse_suggestion_content(content: &str, model_id: &str) -> Result<LlmSuggestion, LlmError> {
    let payload = serde_json::from_str::<SuggestionPayload>(content)
        .or_else(|_| extract_json_object(content).and_then(serde_json::from_str))
        .map_err(|_| LlmError::InvalidResponse)?;

    let replacement = payload.replacement.trim().to_owned();
    if replacement.is_empty() {
        return Err(LlmError::InvalidResponse);
    }

    Ok(LlmSuggestion {
        source: "llm:local".to_owned(),
        model_id: model_id.to_owned(),
        replacement,
        explanation: payload
            .explanation
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Local LLM suggestion.".to_owned()),
        confidence: payload.confidence.unwrap_or(0.5).clamp(0.0, 1.0),
        safe_auto_apply: false,
    })
}

fn extract_json_object(content: &str) -> Result<&str, serde_json::Error> {
    let start = content.find('{').unwrap_or(0);
    let end = content
        .rfind('}')
        .map(|index| index + 1)
        .unwrap_or(content.len());
    serde_json::from_str::<serde_json::Value>(&content[start..end])?;
    Ok(&content[start..end])
}

pub fn builtin_catalog() -> LlmCatalog {
    LlmCatalog {
        policy: LlmPolicy {
            default_model_id: DEFAULT_MODEL_ID.to_owned(),
            inference_runtime: InferenceRuntime::LocalOpenAiCompatibleServer,
            decision_role: DecisionRole::SuggestionOnly,
            bundled_weights: false,
            network_downloads_by_default: false,
            hosted_fallback_by_default: false,
            raw_text_logging: false,
            llm_safe_auto_apply: false,
        },
        models: vec![
            LocalModel {
                id: DEFAULT_MODEL_ID.to_owned(),
                display_name: "Qwen3 1.7B Q4_K_M".to_owned(),
                source: ModelSource::HuggingFace,
                repo: "ggml-org/Qwen3-1.7B-GGUF".to_owned(),
                filename: "Qwen3-1.7B-Q4_K_M.gguf".to_owned(),
                quantization: "Q4_K_M".to_owned(),
                parameters_billion: 1.7,
                license: "Apache-2.0".to_owned(),
                commercial_ok: true,
                cpu_only: true,
                estimated_min_ram_mb: 4096,
                role: DecisionRole::SuggestionOnly,
                notes:
                    "Default CPU-local candidate for Arabic explanation and rewrite suggestions."
                        .to_owned(),
            },
            LocalModel {
                id: "qwen3-0.6b-q4_0".to_owned(),
                display_name: "Qwen3 0.6B Q4_0".to_owned(),
                source: ModelSource::HuggingFace,
                repo: "ggml-org/Qwen3-0.6B-GGUF".to_owned(),
                filename: "Qwen3-0.6B-Q4_0.gguf".to_owned(),
                quantization: "Q4_0".to_owned(),
                parameters_billion: 0.6,
                license: "Apache-2.0".to_owned(),
                commercial_ok: true,
                cpu_only: true,
                estimated_min_ram_mb: 2048,
                role: DecisionRole::SuggestionOnly,
                notes: "Fallback for low-memory machines; must pass eval before becoming default."
                    .to_owned(),
            },
            LocalModel {
                id: "qwen3-4b-q4_k_m".to_owned(),
                display_name: "Qwen3 4B Q4_K_M".to_owned(),
                source: ModelSource::HuggingFace,
                repo: "ggml-org/Qwen3-4B-GGUF".to_owned(),
                filename: "Qwen3-4B-Q4_K_M.gguf".to_owned(),
                quantization: "Q4_K_M".to_owned(),
                parameters_billion: 4.0,
                license: "Apache-2.0".to_owned(),
                commercial_ok: true,
                cpu_only: true,
                estimated_min_ram_mb: 8192,
                role: DecisionRole::SuggestionOnly,
                notes:
                    "Quality-tier candidate for stronger machines; not the default CPU baseline."
                        .to_owned(),
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_catalog_keeps_local_first_policy() {
        let catalog = builtin_catalog();

        assert!(!catalog.policy.bundled_weights);
        assert!(!catalog.policy.network_downloads_by_default);
        assert!(!catalog.policy.hosted_fallback_by_default);
        assert!(!catalog.policy.raw_text_logging);
        assert!(!catalog.policy.llm_safe_auto_apply);
        assert_eq!(catalog.policy.decision_role, DecisionRole::SuggestionOnly);
        assert_eq!(
            catalog.policy.inference_runtime,
            InferenceRuntime::LocalOpenAiCompatibleServer
        );
    }

    #[test]
    fn default_model_is_cpu_local_and_commercial_ok() {
        let catalog = builtin_catalog();
        let default = catalog.default_model().expect("default model");

        assert_eq!(default.id, DEFAULT_MODEL_ID);
        assert_eq!(default.repo, "ggml-org/Qwen3-1.7B-GGUF");
        assert_eq!(default.filename, "Qwen3-1.7B-Q4_K_M.gguf");
        assert!(default.cpu_only);
        assert!(default.commercial_ok);
        assert_eq!(default.role, DecisionRole::SuggestionOnly);
    }

    #[test]
    fn parses_clean_json_suggestion() {
        let suggestion = parse_suggestion_content(
            r#"{"replacement":"مرحبا بالعالم","explanation":"أزيل التطويل.","confidence":0.82}"#,
            DEFAULT_MODEL_ID,
        )
        .expect("suggestion");

        assert_eq!(suggestion.replacement, "مرحبا بالعالم");
        assert_eq!(suggestion.explanation, "أزيل التطويل.");
        assert_eq!(suggestion.confidence, 0.82);
        assert!(!suggestion.safe_auto_apply);
    }

    #[test]
    fn extracts_json_from_chatty_model_output_without_retaining_raw_text() {
        let suggestion = parse_suggestion_content(
            "Here is the JSON:\n{\"replacement\":\"نص مصحح\",\"confidence\":1.7}",
            "local-model",
        )
        .expect("suggestion");

        assert_eq!(suggestion.model_id, "local-model");
        assert_eq!(suggestion.replacement, "نص مصحح");
        assert_eq!(suggestion.confidence, 1.0);
        assert_eq!(suggestion.explanation, "Local LLM suggestion.");
    }

    #[test]
    fn rejects_empty_replacement() {
        let error = parse_suggestion_content(r#"{"replacement":"   "}"#, DEFAULT_MODEL_ID)
            .expect_err("empty replacement");

        assert!(matches!(error, LlmError::InvalidResponse));
    }
}
