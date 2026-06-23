use serde::{Deserialize, Serialize};
use write_core::{Analysis, ApplyOutcome, Engine, RuleInfo};
use write_llm::{LlmDoctorReport, LlmRuntimeConfig, LlmStatus, LlmSuggestion};

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
    let engine = engine_for_mode(input.writing_mode);
    engine.analyze(input.text)
}

pub fn apply_safe_text(input: ApplySafeInput) -> Result<ApplyOutcome, write_core::PatchError> {
    let engine = engine_for_mode(input.writing_mode);
    engine.apply_safe(input.text)
}

pub fn list_rules() -> RulesResponse {
    let mut rules = write_arabic::rule_catalog();
    rules.extend(write_english::rule_catalog());
    RulesResponse { rules }
}

pub fn default_rule_set() -> Engine {
    Engine::new()
        .with_rule(write_arabic::ArabicRuleSet)
        .with_rule(write_english::EnglishRuleSet)
}

fn engine_for_mode(mode: WritingMode) -> Engine {
    match mode {
        WritingMode::Arabic => write_arabic::default_rule_set(),
        WritingMode::English => write_english::default_rule_set(),
        WritingMode::Auto | WritingMode::Mixed => default_rule_set(),
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

pub async fn llm_doctor(config: Option<&LlmRuntimeConfig>) -> LlmDoctorReport {
    write_llm::doctor_from_config(config, write_llm::DOCTOR_SAMPLE_TEXT).await
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
        let direct = default_rule_set().analyze(text);

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
        assert!(
            rules
                .iter()
                .any(|rule| rule.source == "english:common-typo")
        );
    }

    #[test]
    fn service_auto_mode_flags_basic_english_spelling_and_grammar() {
        let text = "helo wat you are do?".to_owned();
        let analysis = analyze_text(AnalyzeInput {
            text: text.clone(),
            writing_mode: WritingMode::Auto,
        });
        let sources = analysis
            .suggestions
            .iter()
            .map(|suggestion| suggestion.source.as_str())
            .collect::<Vec<_>>();

        assert!(sources.contains(&"english:common-typo"));
        assert!(sources.contains(&"english:you-are-do"));

        let outcome = apply_safe_text(ApplySafeInput {
            text,
            writing_mode: WritingMode::Auto,
        })
        .expect("safe English fixes apply");

        assert_eq!(outcome.text, "hello what are you doing?");
    }

    #[test]
    fn service_llm_doctor_skips_when_runtime_unconfigured() {
        let report = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(llm_doctor(None));

        assert!(report.ok);
        assert!(!report.available);
        assert!(report.summary.contains("skipped live runtime checks"));
    }
}
