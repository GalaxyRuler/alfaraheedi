use write_core::{Category, Engine, safe_patches};
use write_english::EnglishRuleSet;

#[test]
fn english_rules_flag_common_typos_and_basic_question_grammar() {
    let analysis = Engine::new()
        .with_rule(EnglishRuleSet)
        .analyze("helo wat you are do?");

    let suggestions = analysis
        .suggestions
        .iter()
        .map(|suggestion| {
            (
                suggestion.source.as_str(),
                suggestion.original.as_str(),
                suggestion.replacements.first().map(String::as_str),
                &suggestion.category,
                suggestion.safe_auto_apply,
            )
        })
        .collect::<Vec<_>>();

    assert_eq!(
        suggestions,
        vec![
            (
                "english:common-typo",
                "helo",
                Some("hello"),
                &Category::Spelling,
                true,
            ),
            (
                "english:common-typo",
                "wat",
                Some("what"),
                &Category::Spelling,
                true,
            ),
            (
                "english:you-are-do",
                "you are do",
                Some("are you doing"),
                &Category::Grammar,
                true,
            ),
        ]
    );
}

#[test]
fn safe_english_patches_fix_user_sample() {
    let engine = Engine::new().with_rule(EnglishRuleSet);
    let text = "helo wat you are do?";
    let analysis = engine.analyze(text);
    let document = write_core::Document::new(text);
    let applied = document
        .apply(&safe_patches(&analysis.suggestions))
        .expect("safe English patches apply");

    assert_eq!(applied.text(), "hello what are you doing?");
}

#[test]
fn english_rules_skip_protected_text() {
    let analysis = Engine::new()
        .with_rule(EnglishRuleSet)
        .analyze("Visit https://example.test/helo and `helo wat you are do`");

    assert!(analysis.suggestions.is_empty());
}
