use serde::{Deserialize, Serialize};

pub const DEFAULT_MODEL_ID: &str = "qwen3-1.7b-q4_k_m";

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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LlmStatus {
    pub available: bool,
    pub reason: String,
    pub catalog: LlmCatalog,
}

pub fn default_status() -> LlmStatus {
    LlmStatus {
        available: false,
        reason: "local LLM runtime is not configured; no model weights are bundled".to_owned(),
        catalog: builtin_catalog(),
    }
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
}
