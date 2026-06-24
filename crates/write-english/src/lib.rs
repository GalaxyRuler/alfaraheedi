use std::ops::Range;

use write_core::{Category, Document, Engine, Language, Rule, RuleInfo, Severity, Suggestion};

#[derive(Debug, Clone, Default)]
pub struct EnglishRuleSet;

#[derive(Debug, Clone)]
struct WordToken {
    range: Range<usize>,
    text: String,
    lower: String,
}

struct EnglishSuggestion {
    source: &'static str,
    category: Category,
    severity: Severity,
    confidence: f32,
    replacements: Vec<String>,
    explanation: &'static str,
    safe_auto_apply: bool,
}

pub fn default_rule_set() -> Engine {
    Engine::new().with_rule(EnglishRuleSet)
}

pub fn rule_catalog() -> Vec<RuleInfo> {
    vec![
        RuleInfo {
            source: "english:common-typo".to_owned(),
            language: Language::English,
            category: Category::Spelling,
            safe_auto_apply: true,
            description: "Correct a small built-in set of common English typos.".to_owned(),
        },
        RuleInfo {
            source: "english:you-are-do".to_owned(),
            language: Language::English,
            category: Category::Grammar,
            safe_auto_apply: true,
            description: "Correct the phrase 'you are do' to 'are you doing'.".to_owned(),
        },
    ]
}

impl Rule for EnglishRuleSet {
    fn id(&self) -> &'static str {
        "english-rules"
    }

    fn check(&self, document: &Document) -> Vec<Suggestion> {
        let tokens = word_tokens(document);
        let mut suggestions = common_typo_suggestions(document, &tokens);
        suggestions.extend(you_are_do_suggestions(document, &tokens));
        suggestions
    }
}

fn common_typo_suggestions(document: &Document, tokens: &[WordToken]) -> Vec<Suggestion> {
    let mut suggestions = Vec::new();

    for token in tokens {
        if token.text != token.lower {
            continue;
        }

        let Some(replacement) = common_typo_replacement(&token.lower) else {
            continue;
        };
        if document.range_is_protected(token.range.clone()) {
            continue;
        }

        let replacement = match_case(&token.text, replacement);
        if replacement == token.text {
            continue;
        }

        push_suggestion(
            document,
            token.range.clone(),
            EnglishSuggestion {
                source: "english:common-typo",
                category: Category::Spelling,
                severity: Severity::Warning,
                confidence: 0.93,
                replacements: vec![replacement],
                explanation: "Correct a common English typo.",
                safe_auto_apply: true,
            },
            &mut suggestions,
        );
    }

    suggestions
}

fn common_typo_replacement(word: &str) -> Option<&'static str> {
    match word {
        "helo" => Some("hello"),
        "helllo" => Some("hello"),
        "wat" => Some("what"),
        "whta" => Some("what"),
        "teh" => Some("the"),
        "adn" => Some("and"),
        "recieve" => Some("receive"),
        "definately" => Some("definitely"),
        _ => None,
    }
}

fn you_are_do_suggestions(document: &Document, tokens: &[WordToken]) -> Vec<Suggestion> {
    let mut suggestions = Vec::new();

    for window in tokens.windows(3) {
        let [first, second, third] = window else {
            continue;
        };
        if first.lower != "you" || second.lower != "are" || third.lower != "do" {
            continue;
        }

        let range = first.range.start..third.range.end;
        if document.range_is_protected(range.clone()) {
            continue;
        }

        push_suggestion(
            document,
            range,
            EnglishSuggestion {
                source: "english:you-are-do",
                category: Category::Grammar,
                severity: Severity::Error,
                confidence: 0.95,
                replacements: vec![match_case(&first.text, "are you doing")],
                explanation: "Use question word order and the -ing verb form.",
                safe_auto_apply: true,
            },
            &mut suggestions,
        );
    }

    suggestions
}

fn push_suggestion(
    document: &Document,
    range: Range<usize>,
    suggestion: EnglishSuggestion,
    suggestions: &mut Vec<Suggestion>,
) {
    if let (Ok(span), Some(original)) = (
        document.span_for_byte_range(range.clone()),
        document.text().get(range),
    ) {
        suggestions.push(Suggestion::replacement(
            suggestion.source,
            span,
            Language::English,
            suggestion.category,
            suggestion.severity,
            suggestion.confidence,
            original,
            suggestion.replacements,
            suggestion.explanation,
            suggestion.safe_auto_apply,
        ));
    }
}

fn word_tokens(document: &Document) -> Vec<WordToken> {
    let text = document.text();
    let mut tokens = Vec::new();
    let mut start = None;

    for (byte_index, character) in text.char_indices() {
        if character.is_ascii_alphabetic() {
            start.get_or_insert(byte_index);
            continue;
        }

        if let Some(open) = start.take() {
            push_word_token(text, open..byte_index, &mut tokens);
        }
    }

    if let Some(open) = start {
        push_word_token(text, open..text.len(), &mut tokens);
    }

    tokens
}

fn push_word_token(text: &str, range: Range<usize>, tokens: &mut Vec<WordToken>) {
    let Some(slice) = text.get(range.clone()) else {
        return;
    };
    tokens.push(WordToken {
        range,
        text: slice.to_owned(),
        lower: slice.to_ascii_lowercase(),
    });
}

fn match_case(original: &str, replacement: &str) -> String {
    if original
        .chars()
        .all(|character| character.is_ascii_uppercase())
    {
        replacement.to_ascii_uppercase()
    } else if original
        .chars()
        .next()
        .is_some_and(|character| character.is_ascii_uppercase())
    {
        let mut characters = replacement.chars();
        let Some(first) = characters.next() else {
            return String::new();
        };
        format!("{}{}", first.to_ascii_uppercase(), characters.as_str())
    } else {
        replacement.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::default_rule_set;

    fn sources_for(text: &str) -> Vec<String> {
        default_rule_set()
            .analyze(text)
            .suggestions
            .into_iter()
            .map(|suggestion| suggestion.source)
            .collect()
    }

    #[test]
    fn v1_english_positive_fixtures_cover_only_obvious_patterns() {
        assert_eq!(sources_for("helo world"), vec!["english:common-typo"]);
        assert_eq!(sources_for("you are do today"), vec!["english:you-are-do"]);
    }

    #[test]
    fn v1_english_negative_fixtures_avoid_names_and_code() {
        assert_eq!(
            sources_for("Helo is a product codename."),
            Vec::<String>::new()
        );
        assert_eq!(
            sources_for("Run `teh --help` before release."),
            Vec::<String>::new()
        );
    }
}
