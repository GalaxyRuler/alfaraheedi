use write_arabic::ArabicRuleSet;
use write_core::{Category, Document, Engine, Language, safe_patches};

#[test]
fn arabic_rules_suggest_removing_tatweel() {
    let analysis = Engine::new()
        .with_rule(ArabicRuleSet::default())
        .analyze("مرحبــا");

    assert_eq!(analysis.suggestions.len(), 1);
    let suggestion = &analysis.suggestions[0];
    assert_eq!(suggestion.language, Language::Arabic);
    assert_eq!(suggestion.category, Category::Orthography);
    assert_eq!(suggestion.original, "ــ");
    assert_eq!(suggestion.replacements, vec![""]);
    assert!(suggestion.safe_auto_apply);
}

#[test]
fn arabic_rules_replace_latin_punctuation_in_arabic_context() {
    let analysis = Engine::new()
        .with_rule(ArabicRuleSet::default())
        .analyze("مرحبا, كيف حالك? نعم; هذا صحيح");

    let replacements = analysis
        .suggestions
        .iter()
        .map(|suggestion| {
            (
                suggestion.original.as_str(),
                suggestion.replacements.first().map(String::as_str),
                &suggestion.category,
            )
        })
        .collect::<Vec<_>>();

    assert_eq!(
        replacements,
        vec![
            (",", Some("،"), &Category::Punctuation),
            ("?", Some("؟"), &Category::Punctuation),
            (";", Some("؛"), &Category::Punctuation),
        ]
    );
    assert!(
        analysis
            .suggestions
            .iter()
            .all(|suggestion| !suggestion.safe_auto_apply)
    );
}

#[test]
fn arabic_rules_suggest_removing_space_before_arabic_punctuation() {
    let analysis = Engine::new()
        .with_rule(ArabicRuleSet)
        .analyze("مرحبا ، كيف الحال ؟");

    let sources = analysis
        .suggestions
        .iter()
        .map(|suggestion| suggestion.source.as_str())
        .collect::<Vec<_>>();

    assert!(sources.contains(&"arabic:space-before-punctuation"));
    assert!(
        analysis
            .suggestions
            .iter()
            .filter(|suggestion| suggestion.source == "arabic:space-before-punctuation")
            .all(|suggestion| !suggestion.safe_auto_apply)
    );
}

#[test]
fn arabic_rules_suggest_adding_space_after_arabic_punctuation() {
    let analysis = Engine::new()
        .with_rule(ArabicRuleSet)
        .analyze("مرحبا،كيف الحال؟أنا بخير");

    let suggestions = analysis
        .suggestions
        .iter()
        .filter(|suggestion| suggestion.source == "arabic:space-after-punctuation")
        .collect::<Vec<_>>();

    assert_eq!(suggestions.len(), 2);
    assert!(
        suggestions
            .iter()
            .all(|suggestion| suggestion.replacements == vec![" "] && !suggestion.safe_auto_apply)
    );
}

#[test]
fn arabic_rules_collapse_repeated_spaces_in_arabic_context() {
    let analysis = Engine::new()
        .with_rule(ArabicRuleSet::default())
        .analyze("مرحبا  بالعالم");

    assert_eq!(analysis.suggestions.len(), 1);
    let suggestion = &analysis.suggestions[0];
    assert_eq!(suggestion.category, Category::Spacing);
    assert_eq!(suggestion.original, "  ");
    assert_eq!(suggestion.replacements, vec![" "]);
    assert!(suggestion.safe_auto_apply);
}

#[test]
fn arabic_rules_suggest_common_conversational_greeting_rewrite() {
    let analysis = Engine::new()
        .with_rule(ArabicRuleSet)
        .analyze("كيف حال  ما اخبار");

    let suggestion = analysis
        .suggestions
        .iter()
        .find(|suggestion| suggestion.source == "arabic:conversational-greeting")
        .expect("conversational greeting suggestion");

    assert_eq!(suggestion.category, Category::Grammar);
    assert_eq!(suggestion.original, "كيف حال  ما اخبار");
    assert_eq!(suggestion.replacements, vec!["كيف حالك؟ ما أخبارك؟"]);
    assert!(!suggestion.safe_auto_apply);
}

#[test]
fn arabic_rules_skip_protected_url_and_code_spans() {
    let analysis = Engine::new()
        .with_rule(ArabicRuleSet::default())
        .analyze("افتح https://x.com/a?b=1 و `مرحبــا`");

    assert!(analysis.suggestions.is_empty());
}

#[test]
fn safe_arabic_patches_apply_then_reanalyze_clean() {
    let engine = Engine::new().with_rule(ArabicRuleSet::default());
    let text = "مرحبــا  بالعالم";
    let analysis = engine.analyze(text);
    let document = Document::new(text);
    let applied = document
        .apply(&safe_patches(&analysis.suggestions))
        .expect("safe patches apply");

    assert_eq!(applied.text(), "مرحبا بالعالم");

    let next = engine.analyze(applied.text());
    assert!(
        next.suggestions
            .iter()
            .all(|suggestion| !suggestion.safe_auto_apply)
    );
}
