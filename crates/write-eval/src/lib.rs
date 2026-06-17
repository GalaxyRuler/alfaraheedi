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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuleEvalReport {
    pub true_positives: usize,
    pub false_positives: usize,
    pub precision: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvalReport {
    pub case_count: usize,
    pub true_positives: usize,
    pub false_positives: usize,
    pub precision: f32,
    pub rules: BTreeMap<String, RuleEvalReport>,
}

pub fn seed_cases() -> anyhow::Result<Vec<EvalCase>> {
    let mut cases = Vec::new();
    cases.extend(read_cases(include_str!("../../../datasets/eval/seed.json"))?);
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
    let mut by_rule = BTreeMap::<String, (usize, usize)>::new();

    for case in cases {
        let analysis = engine.analyze(case.text.clone());
        for suggestion in analysis.suggestions {
            let entry = by_rule.entry(suggestion.source.clone()).or_insert((0, 0));
            if case.expected_sources.contains(&suggestion.source) {
                true_positives += 1;
                entry.0 += 1;
            } else {
                false_positives += 1;
                entry.1 += 1;
            }
        }
    }

    let denominator = true_positives + false_positives;
    let precision = if denominator == 0 {
        1.0
    } else {
        true_positives as f32 / denominator as f32
    };

    let rules = by_rule
        .into_iter()
        .map(|(source, (tp, fp))| {
            let denominator = tp + fp;
            let precision = if denominator == 0 {
                1.0
            } else {
                tp as f32 / denominator as f32
            };
            (
                source,
                RuleEvalReport {
                    true_positives: tp,
                    false_positives: fp,
                    precision,
                },
            )
        })
        .collect();

    EvalReport {
        case_count: cases.len(),
        true_positives,
        false_positives,
        precision,
        rules,
    }
}
