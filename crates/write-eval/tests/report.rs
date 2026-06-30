use write_arabic::default_rule_set;
use write_eval::{
    EvalCase, EvalCaseMetadata, EvalCaseSource, EvalCaseSourceKind, EvalFailureKind,
    ExpectedBehavior, evaluate, seed_cases, validate_cases,
};

#[test]
fn eval_report_includes_per_rule_precision() {
    let cases = vec![
        EvalCase {
            id: "tatweel-positive".to_owned(),
            text: "مرحبــا".to_owned(),
            expected_sources: vec!["arabic:tatweel".to_owned()],
            max_false_positives: 0,
            metadata: None,
            ..EvalCase::default()
        },
        EvalCase {
            id: "known-correct".to_owned(),
            text: "مرحبا بالعالم".to_owned(),
            expected_sources: vec![],
            max_false_positives: 0,
            metadata: None,
            ..EvalCase::default()
        },
    ];

    let report = evaluate(&default_rule_set(), &cases);

    assert_eq!(report.case_count, 2);
    assert_eq!(report.false_positives, 0);
    assert_eq!(report.false_negatives, 0);
    assert_eq!(report.recall, 1.0);
    assert_eq!(report.rules["arabic:tatweel"].true_positives, 1);
    assert_eq!(report.rules["arabic:tatweel"].precision, 1.0);
    assert_eq!(report.rules["arabic:tatweel"].recall, 1.0);
}

#[test]
fn eval_report_records_case_failures() {
    let cases = vec![EvalCase {
        id: "unexpected-rule".to_owned(),
        text: "مرحبــا".to_owned(),
        expected_sources: vec![],
        fixture_file: Some("datasets/eval/v1.0-arabic.jsonl".to_owned()),
        max_false_positives: 0,
        metadata: None,
        ..EvalCase::default()
    }];

    let report = evaluate(&default_rule_set(), &cases);

    assert_eq!(report.false_positives, 1);
    assert!(report.release_blocked);
    assert_eq!(
        report.false_positives_by_rule["arabic:tatweel"],
        vec!["unexpected-rule".to_owned()]
    );
    assert_eq!(report.failures.len(), 1);
    assert_eq!(report.failures[0].case_id, "unexpected-rule");
    assert_eq!(
        report.failures[0].fixture_file.as_deref(),
        Some("datasets/eval/v1.0-arabic.jsonl")
    );
    assert_eq!(report.failures[0].source, "arabic:tatweel");
    assert_eq!(report.failures[0].kind, EvalFailureKind::FalsePositive);
}

#[test]
fn eval_report_records_missing_expected_sources() {
    let cases = vec![EvalCase {
        id: "missing-rule".to_owned(),
        text: "مرحبا بالعالم".to_owned(),
        expected_sources: vec!["arabic:tatweel".to_owned()],
        max_false_positives: 0,
        metadata: None,
        ..EvalCase::default()
    }];

    let report = evaluate(&default_rule_set(), &cases);

    assert_eq!(report.true_positives, 0);
    assert_eq!(report.false_positives, 0);
    assert_eq!(report.false_negatives, 1);
    assert!(report.release_blocked);
    assert_eq!(
        report.false_negatives_by_rule["arabic:tatweel"],
        vec!["missing-rule".to_owned()]
    );
    assert_eq!(report.recall, 0.0);
    assert_eq!(report.failures.len(), 1);
    assert_eq!(report.failures[0].case_id, "missing-rule");
    assert_eq!(report.failures[0].source, "arabic:tatweel");
    assert_eq!(report.failures[0].kind, EvalFailureKind::MissingExpected);
    assert_eq!(report.rules["arabic:tatweel"].false_negatives, 1);
    assert_eq!(report.rules["arabic:tatweel"].recall, 0.0);
}

#[test]
fn metadata_can_represent_reported_false_positive_fixture() {
    let cases = vec![EvalCase {
        id: "reported-false-positive".to_owned(),
        text: "راجع API, CLI قبل النشر.".to_owned(),
        expected_sources: vec![],
        max_false_positives: 0,
        metadata: Some(EvalCaseMetadata {
            source: EvalCaseSource {
                kind: EvalCaseSourceKind::MaintainerReducedReport,
                reference: "issue-4-public-safe-seed".to_owned(),
            },
            rule_source: "arabic:latin-comma".to_owned(),
            expected_behavior: ExpectedBehavior::NoSuggestion,
            raw_text_user_provided: false,
            notes: Some("Reduced public-safe false-positive guard.".to_owned()),
        }),
        ..EvalCase::default()
    }];

    validate_cases(&cases).expect("metadata should validate");
    let report = evaluate(&default_rule_set(), &cases);

    assert_eq!(report.false_positives, 0);
    assert_eq!(report.false_negatives, 0);
    assert!(report.failures.is_empty());
}

#[test]
fn metadata_can_represent_reported_false_negative_fixture() {
    let cases = vec![EvalCase {
        id: "reported-false-negative".to_owned(),
        text: "هل وصلت? نعم".to_owned(),
        expected_sources: vec!["arabic:latin-question-mark".to_owned()],
        max_false_positives: 0,
        metadata: Some(EvalCaseMetadata {
            source: EvalCaseSource {
                kind: EvalCaseSourceKind::MaintainerReducedReport,
                reference: "issue-4-public-safe-seed".to_owned(),
            },
            rule_source: "arabic:latin-question-mark".to_owned(),
            expected_behavior: ExpectedBehavior::ExpectedSuggestion,
            raw_text_user_provided: false,
            notes: Some("Reduced public-safe false-negative guard.".to_owned()),
        }),
        ..EvalCase::default()
    }];

    validate_cases(&cases).expect("metadata should validate");
    let report = evaluate(&default_rule_set(), &cases);

    assert_eq!(report.true_positives, 1);
    assert_eq!(report.false_negatives, 0);
    assert_eq!(report.rules["arabic:latin-question-mark"].recall, 1.0);
}

#[test]
fn metadata_validation_rejects_mismatched_expected_behavior() {
    let cases = vec![EvalCase {
        id: "invalid-reported-case".to_owned(),
        text: "مرحبــا".to_owned(),
        expected_sources: vec!["arabic:tatweel".to_owned()],
        max_false_positives: 0,
        metadata: Some(EvalCaseMetadata {
            source: EvalCaseSource {
                kind: EvalCaseSourceKind::UserReport,
                reference: "issue-4".to_owned(),
            },
            rule_source: "arabic:tatweel".to_owned(),
            expected_behavior: ExpectedBehavior::NoSuggestion,
            raw_text_user_provided: true,
            notes: None,
        }),
        ..EvalCase::default()
    }];

    let error = validate_cases(&cases).expect_err("metadata should fail");

    assert!(
        error
            .to_string()
            .contains("marked no_suggestion but has expected sources")
    );
}

#[test]
fn validation_rejects_false_positive_allowance() {
    let cases = vec![EvalCase {
        id: "allows-false-positive".to_owned(),
        text: "مرحبا بالعالم".to_owned(),
        expected_sources: vec![],
        max_false_positives: 1,
        metadata: None,
        ..EvalCase::default()
    }];

    let error = validate_cases(&cases).expect_err("strict gate should fail");

    assert!(
        error
            .to_string()
            .contains("allows false positives; release eval is strict")
    );
}

#[test]
fn validation_requires_metadata_for_v2_fixtures() {
    let cases = vec![EvalCase {
        id: "v2-missing-metadata".to_owned(),
        mode: Some("arabic".to_owned()),
        text: "مرحبا بالعالم".to_owned(),
        expected_sources: vec![],
        fixture_file: Some("datasets/eval/v2-arabic.jsonl".to_owned()),
        max_false_positives: 0,
        metadata: None,
        ..EvalCase::default()
    }];

    let error = validate_cases(&cases).expect_err("v2 fixtures should require metadata");

    assert!(error.to_string().contains("v2 fixture is missing metadata"));
}

#[test]
fn seed_cases_include_public_safe_v2_fixtures() {
    let cases = seed_cases().expect("seed cases load");
    let v2_cases = cases
        .iter()
        .filter(|case| {
            case.fixture_file
                .as_deref()
                .is_some_and(|fixture| fixture.starts_with("datasets/eval/v2-"))
        })
        .collect::<Vec<_>>();

    assert!(
        v2_cases.len() >= 10,
        "expected v2 fixtures to be loaded into release eval"
    );
    assert!(
        v2_cases.iter().all(|case| case.metadata.is_some()),
        "all v2 fixtures should carry reviewed metadata"
    );
    assert!(
        v2_cases.iter().all(|case| case
            .metadata
            .as_ref()
            .is_some_and(|metadata| !metadata.raw_text_user_provided)),
        "v2 fixtures must stay public-safe"
    );
    assert!(
        v2_cases.iter().all(|case| {
            matches!(
                case.fixture_file.as_deref(),
                Some("datasets/eval/v2-arabic.jsonl") | Some("datasets/eval/v2-mixed.jsonl")
            )
        }),
        "loaded v2 fixture paths should come from the loader, not row input"
    );
}

#[test]
fn release_blocker_cases_can_block_without_suggestions() {
    let cases = vec![EvalCase {
        id: "manual-release-blocker".to_owned(),
        text: "مرحبا بالعالم".to_owned(),
        expected_sources: vec![],
        blocked_sources: vec!["manual:qa-required".to_owned()],
        max_false_positives: 0,
        notes: Some("Manual QA evidence is required before release.".to_owned()),
        ..EvalCase::default()
    }];

    validate_cases(&cases).expect("blocked source metadata should validate");
    let report = evaluate(&default_rule_set(), &cases);

    assert!(report.release_blocked);
    assert_eq!(
        report.release_blockers,
        vec!["manual-release-blocker: manual:qa-required".to_owned()]
    );
}
