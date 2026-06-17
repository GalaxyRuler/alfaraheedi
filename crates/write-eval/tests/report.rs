use write_arabic::default_rule_set;
use write_eval::{EvalCase, evaluate};

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
    assert_eq!(report.rules["arabic:tatweel"].true_positives, 1);
    assert_eq!(report.rules["arabic:tatweel"].precision, 1.0);
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
}
