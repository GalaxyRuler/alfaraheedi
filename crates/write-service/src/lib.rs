use serde::{Deserialize, Serialize};
use write_core::{Analysis, ApplyOutcome, RuleInfo};
use write_llm::{LlmRuntimeConfig, LlmStatus, LlmSuggestion};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WritingMode {
    #[default]
    Auto,
    Arabic,
    English,
    Mixed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalyzeInput {
    pub text: String,
    #[serde(default)]
    pub writing_mode: WritingMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplySafeInput {
    pub text: String,
    #[serde(default)]
    pub writing_mode: WritingMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompanionSession {
    pub captured_text: String,
    #[serde(default)]
    pub writing_mode: WritingMode,
    pub source_app: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextSelection {
    pub start_utf16: usize,
    pub end_utf16: usize,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LlmSuggestInput {
    pub text: String,
    #[serde(default)]
    pub writing_mode: WritingMode,
    pub selection: Option<TextSelection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RulesResponse {
    pub rules: Vec<RuleInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppStatus {
    pub status: &'static str,
    pub service: &'static str,
}

pub fn analyze_text(input: AnalyzeInput) -> Analysis {
    let engine = write_arabic::default_rule_set();
    engine.analyze(input.text)
}

pub fn apply_safe_text(input: ApplySafeInput) -> Result<ApplyOutcome, write_core::PatchError> {
    let engine = write_arabic::default_rule_set();
    engine.apply_safe(input.text)
}

pub fn list_rules() -> RulesResponse {
    RulesResponse {
        rules: write_arabic::rule_catalog(),
    }
}

pub fn app_status() -> AppStatus {
    AppStatus {
        status: "ok",
        service: "write-service",
    }
}

pub async fn llm_status(config: Option<&LlmRuntimeConfig>) -> LlmStatus {
    if let Some(config) = config {
        write_llm::runtime_status(config).await
    } else {
        write_llm::default_status()
    }
}

pub async fn llm_suggest(
    config: &LlmRuntimeConfig,
    input: LlmSuggestInput,
) -> Result<LlmSuggestion, write_llm::LlmError> {
    let text = input
        .selection
        .as_ref()
        .map_or(input.text.as_str(), |selection| selection.text.as_str());
    write_llm::suggest(config, text).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_analysis_matches_engine_analysis() {
        let text = "مرحبــا  بالعالم".to_owned();
        let service = analyze_text(AnalyzeInput {
            text: text.clone(),
            writing_mode: WritingMode::Auto,
        });
        let direct = write_arabic::default_rule_set().analyze(text);

        assert_eq!(service, direct);
    }

    #[test]
    fn service_safe_apply_matches_engine_apply() {
        let text = "مرحبــا  بالعالم".to_owned();
        let service = apply_safe_text(ApplySafeInput {
            text: text.clone(),
            writing_mode: WritingMode::Arabic,
        })
        .expect("service apply");
        let direct = write_arabic::default_rule_set()
            .apply_safe(text)
            .expect("direct apply");

        assert_eq!(service, direct);
    }

    #[test]
    fn service_lists_current_rule_catalog() {
        let rules = list_rules().rules;

        assert!(rules.iter().any(|rule| rule.source == "arabic:tatweel"));
        assert!(
            rules
                .iter()
                .any(|rule| rule.source == "arabic:repeated-space")
        );
    }
}
