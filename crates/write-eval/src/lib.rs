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
pub struct EvalReport {
    pub case_count: usize,
    pub true_positives: usize,
    pub false_positives: usize,
    pub precision: f32,
}

pub fn seed_cases() -> anyhow::Result<Vec<EvalCase>> {
    let raw = include_str!("../../../datasets/eval/seed.json");
    serde_json::from_str(raw).map_err(Into::into)
}

pub fn evaluate(engine: &Engine, cases: &[EvalCase]) -> EvalReport {
    let mut true_positives = 0usize;
    let mut false_positives = 0usize;

    for case in cases {
        let analysis = engine.analyze(case.text.clone());
        for suggestion in analysis.suggestions {
            if case.expected_sources.contains(&suggestion.source) {
                true_positives += 1;
            } else {
                false_positives += 1;
            }
        }
    }

    let denominator = true_positives + false_positives;
    let precision = if denominator == 0 {
        1.0
    } else {
        true_positives as f32 / denominator as f32
    };

    EvalReport {
        case_count: cases.len(),
        true_positives,
        false_positives,
        precision,
    }
}
