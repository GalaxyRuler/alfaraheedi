use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use write_core::Engine;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvalCase {
    pub id: String,
    pub text: String,
    pub expected_sources: Vec<String>,
    pub max_false_positives: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<EvalCaseMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvalCaseMetadata {
    pub source: EvalCaseSource,
    pub rule_source: String,
    pub expected_behavior: ExpectedBehavior,
    pub raw_text_user_provided: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvalCaseSource {
    pub kind: EvalCaseSourceKind,
    pub reference: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvalCaseSourceKind {
    MaintainerReducedReport,
    UserReport,
    QaRegression,
    Seed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExpectedBehavior {
    NoSuggestion,
    ExpectedSuggestion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvalFailure {
    pub case_id: String,
    pub source: String,
    pub original: String,
    pub kind: EvalFailureKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvalFailureKind {
    FalsePositive,
    MissingExpected,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuleEvalReport {
    pub true_positives: usize,
    pub false_positives: usize,
    pub false_negatives: usize,
    pub precision: f32,
    pub recall: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvalReport {
    pub case_count: usize,
    pub true_positives: usize,
    pub false_positives: usize,
    pub false_negatives: usize,
    pub failures: Vec<EvalFailure>,
    pub precision: f32,
    pub recall: f32,
    pub rules: BTreeMap<String, RuleEvalReport>,
}

pub fn seed_cases() -> anyhow::Result<Vec<EvalCase>> {
    let mut cases = Vec::new();
    cases.extend(read_cases(include_str!(
        "../../../datasets/eval/seed.json"
    ))?);
    cases.extend(read_cases(include_str!(
        "../../../datasets/eval/known-correct.json"
    ))?);
    cases.extend(read_cases(include_str!(
        "../../../datasets/eval/rules/tatweel.json"
    ))?);
    cases.extend(read_cases(include_str!(
        "../../../datasets/eval/rules/repeated-space.json"
    ))?);
    cases.extend(read_cases(include_str!(
        "../../../datasets/eval/rules/punctuation.json"
    ))?);
    cases.extend(read_cases(include_str!(
        "../../../datasets/eval/protected-spans.json"
    ))?);
    cases.extend(read_cases(include_str!(
        "../../../datasets/eval/reported/v0.4-public-safe.json"
    ))?);
    cases.extend(read_cases(include_str!(
        "../../../datasets/eval/reported/v0.5-public-safe.json"
    ))?);
    Ok(cases)
}

fn read_cases(raw: &str) -> anyhow::Result<Vec<EvalCase>> {
    let cases: Vec<EvalCase> = serde_json::from_str(raw)?;
    validate_cases(&cases)?;
    Ok(cases)
}

pub fn validate_cases(cases: &[EvalCase]) -> anyhow::Result<()> {
    for case in cases {
        validate_case(case)?;
    }
    Ok(())
}

fn validate_case(case: &EvalCase) -> anyhow::Result<()> {
    anyhow::ensure!(
        case.max_false_positives == 0,
        "eval case {} allows false positives; release eval is strict",
        case.id
    );

    let Some(metadata) = &case.metadata else {
        return Ok(());
    };

    anyhow::ensure!(
        !metadata.source.reference.trim().is_empty(),
        "eval case {} has metadata.source.reference empty",
        case.id
    );
    anyhow::ensure!(
        !metadata.rule_source.trim().is_empty(),
        "eval case {} has metadata.rule_source empty",
        case.id
    );

    match metadata.expected_behavior {
        ExpectedBehavior::NoSuggestion => {
            anyhow::ensure!(
                case.expected_sources.is_empty(),
                "eval case {} is marked no_suggestion but has expected sources",
                case.id
            );
        }
        ExpectedBehavior::ExpectedSuggestion => {
            anyhow::ensure!(
                case.expected_sources.contains(&metadata.rule_source),
                "eval case {} metadata rule_source is not expected",
                case.id
            );
        }
    }

    Ok(())
}

pub fn evaluate(engine: &Engine, cases: &[EvalCase]) -> EvalReport {
    let mut true_positives = 0usize;
    let mut false_positives = 0usize;
    let mut false_negatives = 0usize;
    let mut failures = Vec::new();
    let mut by_rule = BTreeMap::<String, (usize, usize, usize)>::new();

    for case in cases {
        let analysis = engine.analyze(case.text.clone());
        let mut expected = expected_counts(&case.expected_sources);

        for suggestion in analysis.suggestions {
            let entry = by_rule
                .entry(suggestion.source.clone())
                .or_insert((0, 0, 0));
            let remaining = expected.entry(suggestion.source.clone()).or_insert(0);
            if *remaining > 0 {
                *remaining -= 1;
                true_positives += 1;
                entry.0 += 1;
            } else {
                false_positives += 1;
                entry.1 += 1;
                failures.push(EvalFailure {
                    case_id: case.id.clone(),
                    source: suggestion.source.clone(),
                    original: suggestion.original.clone(),
                    kind: EvalFailureKind::FalsePositive,
                });
            }
        }

        for (source, missing) in expected {
            if missing == 0 {
                continue;
            }

            let entry = by_rule.entry(source.clone()).or_insert((0, 0, 0));
            entry.2 += missing;
            false_negatives += missing;
            for _ in 0..missing {
                failures.push(EvalFailure {
                    case_id: case.id.clone(),
                    source: source.clone(),
                    original: String::new(),
                    kind: EvalFailureKind::MissingExpected,
                });
            }
        }
    }

    let precision = ratio_or_one(true_positives, true_positives + false_positives);
    let recall = ratio_or_one(true_positives, true_positives + false_negatives);

    let rules = by_rule
        .into_iter()
        .map(|(source, (tp, fp, fn_))| {
            (
                source,
                RuleEvalReport {
                    true_positives: tp,
                    false_positives: fp,
                    false_negatives: fn_,
                    precision: ratio_or_one(tp, tp + fp),
                    recall: ratio_or_one(tp, tp + fn_),
                },
            )
        })
        .collect();

    EvalReport {
        case_count: cases.len(),
        true_positives,
        false_positives,
        false_negatives,
        failures,
        precision,
        recall,
        rules,
    }
}

fn expected_counts(expected_sources: &[String]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for source in expected_sources {
        *counts.entry(source.clone()).or_insert(0) += 1;
    }
    counts
}

fn ratio_or_one(numerator: usize, denominator: usize) -> f32 {
    if denominator == 0 {
        1.0
    } else {
        numerator as f32 / denominator as f32
    }
}
