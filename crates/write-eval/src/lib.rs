use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use write_core::Engine;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvalCase {
    pub id: String,
    pub text: String,
    pub expected_sources: Vec<String>,
    pub max_false_positives: usize,
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
    Ok(cases)
}

fn read_cases(raw: &str) -> anyhow::Result<Vec<EvalCase>> {
    serde_json::from_str(raw).map_err(Into::into)
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
