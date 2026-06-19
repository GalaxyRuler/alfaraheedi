use write_arabic::default_rule_set;
use write_eval::{EvalCase, EvalFailureKind, evaluate};

#[test]
fn eval_report_includes_per_rule_precision() {
    let cases = vec![
        EvalCase {
            id: "tatweel-positive".to_owned(),
            text: "مرحبــا".to_owned(),
            expected_sources: vec!["arabic:tatweel".to_owned()],
            max_false_positives: 0,
        },
        EvalCase {
            id: "known-correct".to_owned(),
            text: "مرحبا بالعالم".to_owned(),
            expected_sources: vec![],
            max_false_positives: 0,
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
        max_false_positives: 0,
    }];

    let report = evaluate(&default_rule_set(), &cases);

    assert_eq!(report.false_positives, 1);
    assert_eq!(report.failures.len(), 1);
    assert_eq!(report.failures[0].case_id, "unexpected-rule");
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
    }];

    let report = evaluate(&default_rule_set(), &cases);

    assert_eq!(report.true_positives, 0);
    assert_eq!(report.false_positives, 0);
    assert_eq!(report.false_negatives, 1);
    assert_eq!(report.recall, 0.0);
    assert_eq!(report.failures.len(), 1);
    assert_eq!(report.failures[0].case_id, "missing-rule");
    assert_eq!(report.failures[0].source, "arabic:tatweel");
    assert_eq!(report.failures[0].kind, EvalFailureKind::MissingExpected);
    assert_eq!(report.rules["arabic:tatweel"].false_negatives, 1);
    assert_eq!(report.rules["arabic:tatweel"].recall, 0.0);
}
