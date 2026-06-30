use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use write_core::Engine;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvalCase {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    pub text: String,
    #[serde(default)]
    pub expected_sources: Vec<String>,
    #[serde(default)]
    pub blocked_sources: Vec<String>,
    #[serde(default)]
    pub max_false_positives: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fixture_file: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fixture_file: Option<String>,
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
    pub release_blocked: bool,
    pub release_blockers: Vec<String>,
    pub false_positives_by_rule: BTreeMap<String, Vec<String>>,
    pub false_negatives_by_rule: BTreeMap<String, Vec<String>>,
    pub failures: Vec<EvalFailure>,
    pub precision: f32,
    pub recall: f32,
    pub rules: BTreeMap<String, RuleEvalReport>,
}

pub fn seed_cases() -> anyhow::Result<Vec<EvalCase>> {
    let mut cases = Vec::new();
    cases.extend(read_json_cases(
        include_str!("../../../datasets/eval/seed.json"),
        "datasets/eval/seed.json",
    )?);
    cases.extend(read_json_cases(
        include_str!("../../../datasets/eval/known-correct.json"),
        "datasets/eval/known-correct.json",
    )?);
    cases.extend(read_json_cases(
        include_str!("../../../datasets/eval/rules/tatweel.json"),
        "datasets/eval/rules/tatweel.json",
    )?);
    cases.extend(read_json_cases(
        include_str!("../../../datasets/eval/rules/repeated-space.json"),
        "datasets/eval/rules/repeated-space.json",
    )?);
    cases.extend(read_json_cases(
        include_str!("../../../datasets/eval/rules/punctuation.json"),
        "datasets/eval/rules/punctuation.json",
    )?);
    cases.extend(read_json_cases(
        include_str!("../../../datasets/eval/protected-spans.json"),
        "datasets/eval/protected-spans.json",
    )?);
    cases.extend(read_json_cases(
        include_str!("../../../datasets/eval/reported/v0.4-public-safe.json"),
        "datasets/eval/reported/v0.4-public-safe.json",
    )?);
    cases.extend(read_json_cases(
        include_str!("../../../datasets/eval/reported/v0.5-public-safe.json"),
        "datasets/eval/reported/v0.5-public-safe.json",
    )?);
    cases.extend(read_jsonl_cases(
        include_str!("../../../datasets/eval/v1.0-arabic.jsonl"),
        "datasets/eval/v1.0-arabic.jsonl",
    )?);
    cases.extend(read_jsonl_cases(
        include_str!("../../../datasets/eval/v1.1-arabic.jsonl"),
        "datasets/eval/v1.1-arabic.jsonl",
    )?);
    cases.extend(read_jsonl_cases(
        include_str!("../../../datasets/eval/v1.0-english.jsonl"),
        "datasets/eval/v1.0-english.jsonl",
    )?);
    cases.extend(read_jsonl_cases(
        include_str!("../../../datasets/eval/v1.0-mixed.jsonl"),
        "datasets/eval/v1.0-mixed.jsonl",
    )?);
    cases.extend(read_jsonl_cases(
        include_str!("../../../datasets/eval/v2-arabic.jsonl"),
        "datasets/eval/v2-arabic.jsonl",
    )?);
    cases.extend(read_jsonl_cases(
        include_str!("../../../datasets/eval/v2-mixed.jsonl"),
        "datasets/eval/v2-mixed.jsonl",
    )?);
    Ok(cases)
}

fn read_json_cases(raw: &str, fixture_file: &str) -> anyhow::Result<Vec<EvalCase>> {
    let mut cases: Vec<EvalCase> = serde_json::from_str(raw)?;
    annotate_fixture_file(&mut cases, fixture_file);
    validate_cases(&cases)?;
    Ok(cases)
}

fn read_jsonl_cases(raw: &str, fixture_file: &str) -> anyhow::Result<Vec<EvalCase>> {
    let mut cases = Vec::new();
    for (line_index, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let case = serde_json::from_str::<EvalCase>(trimmed).map_err(|error| {
            anyhow::anyhow!(
                "failed to parse {} line {}: {}",
                fixture_file,
                line_index + 1,
                error
            )
        })?;
        cases.push(case);
    }
    annotate_fixture_file(&mut cases, fixture_file);
    validate_cases(&cases)?;
    Ok(cases)
}

fn annotate_fixture_file(cases: &mut [EvalCase], fixture_file: &str) {
    for case in cases {
        case.fixture_file = Some(fixture_file.to_owned());
    }
}

pub fn validate_cases(cases: &[EvalCase]) -> anyhow::Result<()> {
    for case in cases {
        validate_case(case)?;
    }
    Ok(())
}

fn validate_case(case: &EvalCase) -> anyhow::Result<()> {
    let is_v2_fixture = case
        .fixture_file
        .as_deref()
        .is_some_and(|fixture| fixture.starts_with("datasets/eval/v2-"));

    anyhow::ensure!(
        case.max_false_positives == 0,
        "eval case {} allows false positives; release eval is strict",
        case.id
    );
    for blocked_source in &case.blocked_sources {
        anyhow::ensure!(
            !blocked_source.trim().is_empty(),
            "eval case {} has an empty blocked source",
            case.id
        );
    }

    let Some(metadata) = &case.metadata else {
        anyhow::ensure!(
            !is_v2_fixture,
            "eval case {} v2 fixture is missing metadata",
            case.id
        );
        return Ok(());
    };

    if is_v2_fixture {
        anyhow::ensure!(
            !metadata.raw_text_user_provided,
            "eval case {} v2 fixture includes raw user-provided text",
            case.id
        );
        anyhow::ensure!(
            metadata
                .notes
                .as_deref()
                .is_some_and(|notes| !notes.trim().is_empty()),
            "eval case {} v2 fixture metadata.notes is empty",
            case.id
        );
    }

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
    let mut release_blockers = Vec::new();
    let mut false_positives_by_rule = BTreeMap::<String, Vec<String>>::new();
    let mut false_negatives_by_rule = BTreeMap::<String, Vec<String>>::new();

    for case in cases {
        for blocked_source in &case.blocked_sources {
            release_blockers.push(format!("{}: {}", case.id, blocked_source));
        }

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
                false_positives_by_rule
                    .entry(suggestion.source.clone())
                    .or_default()
                    .push(case.id.clone());
                failures.push(EvalFailure {
                    case_id: case.id.clone(),
                    fixture_file: case.fixture_file.clone(),
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
            let missing_cases = false_negatives_by_rule.entry(source.clone()).or_default();
            for _ in 0..missing {
                missing_cases.push(case.id.clone());
                failures.push(EvalFailure {
                    case_id: case.id.clone(),
                    fixture_file: case.fixture_file.clone(),
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
        release_blocked: !failures.is_empty() || !release_blockers.is_empty(),
        release_blockers,
        false_positives_by_rule,
        false_negatives_by_rule,
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

#[cfg(test)]
mod tests {
    use super::read_jsonl_cases;

    #[test]
    fn read_jsonl_cases_enforces_actual_v2_fixture_path() {
        let raw = r#"{"id":"spoofed-v2","fixture_file":"datasets/eval/v1.0-arabic.jsonl","mode":"arabic","text":"مرحبا بالعالم","expected_sources":[],"blocked_sources":[],"max_false_positives":0}"#;

        let error = read_jsonl_cases(raw, "datasets/eval/v2-arabic.jsonl")
            .expect_err("actual v2 fixture path should require metadata");

        assert!(error.to_string().contains("v2 fixture is missing metadata"));
    }
}
