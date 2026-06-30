use std::ops::Range;

use write_core::{Category, Document, Engine, Language, Rule, RuleInfo, Severity, Suggestion};

const TATWEEL: char = '\u{0640}';
const NBSP: char = '\u{00A0}';

#[derive(Debug, Clone, Default)]
pub struct ArabicRuleSet;

pub fn default_rule_set() -> Engine {
    Engine::new().with_rule(ArabicRuleSet)
}

pub fn rule_catalog() -> Vec<RuleInfo> {
    vec![
        RuleInfo {
            source: "arabic:tatweel".to_owned(),
            language: Language::Arabic,
            category: Category::Orthography,
            safe_auto_apply: true,
            description: "Remove tatweel elongation marks.".to_owned(),
        },
        RuleInfo {
            source: "arabic:repeated-space".to_owned(),
            language: Language::Arabic,
            category: Category::Spacing,
            safe_auto_apply: true,
            description: "Collapse repeated spaces in Arabic text.".to_owned(),
        },
        RuleInfo {
            source: "arabic:browser-nbsp".to_owned(),
            language: Language::Arabic,
            category: Category::Spacing,
            safe_auto_apply: true,
            description: "Replace browser non-breaking spaces between Arabic words.".to_owned(),
        },
        RuleInfo {
            source: "arabic:space-before-punctuation".to_owned(),
            language: Language::Arabic,
            category: Category::Spacing,
            safe_auto_apply: false,
            description: "Suggest removing spaces before Arabic punctuation.".to_owned(),
        },
        RuleInfo {
            source: "arabic:latin-comma".to_owned(),
            language: Language::Arabic,
            category: Category::Punctuation,
            safe_auto_apply: false,
            description: "Use Arabic punctuation in Arabic text.".to_owned(),
        },
        RuleInfo {
            source: "arabic:latin-question-mark".to_owned(),
            language: Language::Arabic,
            category: Category::Punctuation,
            safe_auto_apply: false,
            description: "Use Arabic punctuation in Arabic text.".to_owned(),
        },
        RuleInfo {
            source: "arabic:latin-semicolon".to_owned(),
            language: Language::Arabic,
            category: Category::Punctuation,
            safe_auto_apply: false,
            description: "Use Arabic punctuation in Arabic text.".to_owned(),
        },
        RuleInfo {
            source: "arabic:space-after-punctuation".to_owned(),
            language: Language::Arabic,
            category: Category::Spacing,
            safe_auto_apply: false,
            description: "Suggest adding spaces after Arabic punctuation.".to_owned(),
        },
        RuleInfo {
            source: "arabic:conversational-greeting".to_owned(),
            language: Language::Arabic,
            category: Category::Grammar,
            safe_auto_apply: false,
            description: "Suggest a complete form for a common Arabic greeting.".to_owned(),
        },
        RuleInfo {
            source: "arabic:common-phrase-orthography".to_owned(),
            language: Language::Arabic,
            category: Category::Orthography,
            safe_auto_apply: false,
            description: "Suggest high-precision orthography for exact common Arabic phrases."
                .to_owned(),
        },
    ]
}

impl Rule for ArabicRuleSet {
    fn id(&self) -> &'static str {
        "arabic-rules"
    }

    fn check(&self, document: &Document) -> Vec<Suggestion> {
        let mut suggestions = Vec::new();
        suggestions.extend(tatweel_suggestions(document));
        suggestions.extend(punctuation_suggestions(document));
        suggestions.extend(space_before_punctuation_suggestions(document));
        suggestions.extend(space_after_punctuation_suggestions(document));
        suggestions.extend(spacing_suggestions(document));
        suggestions.extend(browser_nbsp_suggestions(document));
        suggestions.extend(conversational_greeting_suggestions(document));
        suggestions.extend(common_phrase_orthography_suggestions(document));
        suggestions
    }
}

#[derive(Debug, Clone)]
struct ArabicWordToken {
    range: Range<usize>,
    text: String,
}

pub fn is_arabic_script(character: char) -> bool {
    matches!(
        character as u32,
        0x0600..=0x06FF
            | 0x0750..=0x077F
            | 0x08A0..=0x08FF
            | 0xFB50..=0xFDFF
            | 0xFE70..=0xFEFF
    )
}

fn tatweel_suggestions(document: &Document) -> Vec<Suggestion> {
    let mut suggestions = Vec::new();
    let mut run_start = None;

    for (byte_index, character) in document.text().char_indices() {
        if character == TATWEEL {
            run_start.get_or_insert(byte_index);
            continue;
        }

        if let Some(start) = run_start.take() {
            push_tatweel_suggestion(document, start, byte_index, &mut suggestions);
        }
    }

    if let Some(start) = run_start {
        push_tatweel_suggestion(document, start, document.text().len(), &mut suggestions);
    }

    suggestions
}

fn punctuation_suggestions(document: &Document) -> Vec<Suggestion> {
    let mut suggestions = Vec::new();

    for (byte_index, character) in document.text().char_indices() {
        let end = byte_index + character.len_utf8();
        if document.range_is_protected(byte_index..end) {
            continue;
        }

        let replacement = match character {
            ',' if should_replace_latin_comma(document.text(), byte_index, end) => {
                Some(("arabic:latin-comma", "،"))
            }
            '?' if has_arabic_before(document.text(), byte_index) => {
                Some(("arabic:latin-question-mark", "؟"))
            }
            ';' if has_arabic_before(document.text(), byte_index)
                && has_arabic_after(document.text(), end) =>
            {
                Some(("arabic:latin-semicolon", "؛"))
            }
            _ => None,
        };

        if let Some((source, replacement)) = replacement {
            push_single_character_punctuation_suggestion(
                document,
                byte_index,
                character,
                source,
                replacement,
                &mut suggestions,
            );
        }
    }

    suggestions
}

fn should_replace_latin_comma(text: &str, start: usize, end: usize) -> bool {
    has_arabic_before(text, start) && has_arabic_after(text, end)
        || punctuation_follows_latin_acronym_before_arabic_text(text, start, end)
}

fn punctuation_follows_latin_acronym_before_arabic_text(
    text: &str,
    punctuation_start: usize,
    punctuation_end: usize,
) -> bool {
    if next_script_context(text, punctuation_end) != Some(ScriptContext::Arabic) {
        return false;
    }

    let Some((token_start, token)) = previous_ascii_token(text, punctuation_start) else {
        return false;
    };

    is_uppercase_latin_acronym(token) && has_arabic_before(text, token_start)
}

fn spacing_suggestions(document: &Document) -> Vec<Suggestion> {
    let mut suggestions = Vec::new();
    let mut run_start = None;
    let mut run_len = 0usize;

    for (byte_index, character) in document.text().char_indices() {
        if character == ' ' {
            run_start.get_or_insert(byte_index);
            run_len += 1;
            continue;
        }

        if let Some(start) = run_start.take() {
            if run_len > 1 && has_arabic_before(document.text(), start) {
                push_spacing_suggestion(document, start, byte_index, &mut suggestions);
            }
            run_len = 0;
        }
    }

    if let Some(start) = run_start
        && run_len > 1
        && has_arabic_before(document.text(), start)
    {
        push_spacing_suggestion(document, start, document.text().len(), &mut suggestions);
    }

    suggestions
}

fn browser_nbsp_suggestions(document: &Document) -> Vec<Suggestion> {
    let mut suggestions = Vec::new();
    let mut run_start = None;
    let text = document.text();

    for (byte_index, character) in text.char_indices() {
        if character == NBSP {
            run_start.get_or_insert(byte_index);
            continue;
        }

        if let Some(start) = run_start.take() {
            push_browser_nbsp_suggestion(document, start, byte_index, &mut suggestions);
        }
    }

    if let Some(start) = run_start {
        push_browser_nbsp_suggestion(document, start, text.len(), &mut suggestions);
    }

    suggestions
}

fn space_before_punctuation_suggestions(document: &Document) -> Vec<Suggestion> {
    let mut suggestions = Vec::new();
    let text = document.text();

    for (punctuation_start, character) in text.char_indices() {
        if !matches!(character, '،' | '؛' | '؟') {
            continue;
        }

        let Some(prefix) = text.get(..punctuation_start) else {
            continue;
        };
        let Some((space_start, space)) = prefix.char_indices().last() else {
            continue;
        };
        if space != ' ' || document.range_is_protected(space_start..punctuation_start) {
            continue;
        }
        if !has_arabic_before(text, space_start) {
            continue;
        }

        if let (Ok(span), Some(original)) = (
            document.span_for_byte_range(space_start..punctuation_start),
            text.get(space_start..punctuation_start),
        ) {
            suggestions.push(Suggestion::replacement(
                "arabic:space-before-punctuation",
                span,
                Language::Arabic,
                Category::Spacing,
                Severity::Warning,
                0.95,
                original,
                vec![String::new()],
                "Remove the space before Arabic punctuation.",
                false,
            ));
        }
    }

    suggestions
}

fn space_after_punctuation_suggestions(document: &Document) -> Vec<Suggestion> {
    let mut suggestions = Vec::new();
    let text = document.text();

    for (punctuation_start, character) in text.char_indices() {
        if !matches!(character, '،' | '؛' | '؟' | ',' | ';' | '?') {
            continue;
        }

        let punctuation_end = punctuation_start + character.len_utf8();
        if document.range_is_protected(punctuation_start..punctuation_end) {
            continue;
        }
        let has_arabic_context_before = has_arabic_before(text, punctuation_start)
            || matches!(character, ',' | '،')
                && punctuation_follows_latin_acronym_before_arabic_text(
                    text,
                    punctuation_start,
                    punctuation_end,
                );
        if !has_arabic_context_before {
            continue;
        }

        let Some(next_character) = text
            .get(punctuation_end..)
            .and_then(|suffix| suffix.chars().next())
        else {
            continue;
        };
        if next_character.is_whitespace() || !is_arabic_script(next_character) {
            continue;
        }

        if let Ok(span) = document.span_for_byte_range(punctuation_end..punctuation_end) {
            suggestions.push(Suggestion::replacement(
                "arabic:space-after-punctuation",
                span,
                Language::Arabic,
                Category::Spacing,
                Severity::Warning,
                0.93,
                "",
                vec![" ".to_string()],
                "Add a space after punctuation in Arabic text.",
                false,
            ));
        }
    }

    suggestions
}

fn conversational_greeting_suggestions(document: &Document) -> Vec<Suggestion> {
    let tokens = arabic_word_tokens(document);
    if tokens.len() != 4 {
        return Vec::new();
    }

    if tokens[0].text != "كيف"
        || tokens[1].text != "حال"
        || tokens[2].text != "ما"
        || tokens[3].text != "اخبار"
    {
        return Vec::new();
    }

    let range = tokens[0].range.start..tokens[3].range.end;
    if document.range_is_protected(range.clone()) {
        return Vec::new();
    }

    let mut suggestions = Vec::new();
    if let (Ok(span), Some(original)) = (
        document.span_for_byte_range(range.clone()),
        document.text().get(range),
    ) {
        suggestions.push(Suggestion::replacement(
            "arabic:conversational-greeting",
            span,
            Language::Arabic,
            Category::Grammar,
            Severity::Warning,
            0.9,
            original,
            vec!["كيف حالك؟ ما أخبارك؟".to_owned()],
            "Use a complete conversational greeting with the right pronoun and hamza.",
            false,
        ));
    }

    suggestions
}

#[derive(Debug, Clone, Copy)]
struct ExactPhraseCorrection {
    original: &'static str,
    replacement: &'static str,
}

const EXACT_PHRASE_CORRECTIONS: &[ExactPhraseCorrection] = &[ExactPhraseCorrection {
    original: "ان شاء الله",
    replacement: "إن شاء الله",
}];

fn common_phrase_orthography_suggestions(document: &Document) -> Vec<Suggestion> {
    let text = document.text();
    let mut suggestions = Vec::new();

    for correction in EXACT_PHRASE_CORRECTIONS {
        for (start, original) in text.match_indices(correction.original) {
            let end = start + original.len();
            let range = start..end;
            if !has_arabic_boundary_before(text, start)
                || !has_arabic_boundary_after(text, end)
                || document.range_is_protected(range.clone())
            {
                continue;
            }

            if let Ok(span) = document.span_for_byte_range(range) {
                suggestions.push(Suggestion::replacement(
                    "arabic:common-phrase-orthography",
                    span,
                    Language::Arabic,
                    Category::Orthography,
                    Severity::Warning,
                    0.92,
                    original,
                    vec![correction.replacement.to_owned()],
                    "Use the conventional orthography for this exact Arabic phrase.",
                    false,
                ));
            }
        }
    }

    suggestions
}

fn arabic_word_tokens(document: &Document) -> Vec<ArabicWordToken> {
    let text = document.text();
    let mut tokens = Vec::new();
    let mut start = None;

    for (byte_index, character) in text.char_indices() {
        if is_arabic_script(character) {
            start.get_or_insert(byte_index);
            continue;
        }

        if let Some(open) = start.take() {
            push_arabic_word_token(text, open..byte_index, &mut tokens);
        }
    }

    if let Some(open) = start {
        push_arabic_word_token(text, open..text.len(), &mut tokens);
    }

    tokens
}

fn push_arabic_word_token(text: &str, range: Range<usize>, tokens: &mut Vec<ArabicWordToken>) {
    let Some(slice) = text.get(range.clone()) else {
        return;
    };
    tokens.push(ArabicWordToken {
        range,
        text: slice.to_owned(),
    });
}

fn push_browser_nbsp_suggestion(
    document: &Document,
    start: usize,
    end: usize,
    suggestions: &mut Vec<Suggestion>,
) {
    let text = document.text();
    if document.range_is_protected(start..end)
        || previous_character(text, start).is_none_or(|character| !is_arabic_script(character))
        || next_character(text, end).is_none_or(|character| !is_arabic_script(character))
    {
        return;
    }

    if let (Ok(span), Some(original)) = (
        document.span_for_byte_range(start..end),
        document.text().get(start..end),
    ) {
        suggestions.push(Suggestion::replacement(
            "arabic:browser-nbsp",
            span,
            Language::Arabic,
            Category::Spacing,
            Severity::Warning,
            0.98,
            original,
            vec![" ".to_string()],
            "Replace browser non-breaking space between Arabic words.",
            true,
        ));
    }
}

fn push_spacing_suggestion(
    document: &Document,
    start: usize,
    end: usize,
    suggestions: &mut Vec<Suggestion>,
) {
    if document.range_is_protected(start..end) {
        return;
    }

    if !has_arabic_after(document.text(), end) {
        return;
    }

    if let (Ok(span), Some(original)) = (
        document.span_for_byte_range(start..end),
        document.text().get(start..end),
    ) {
        suggestions.push(Suggestion::replacement(
            "arabic:repeated-space",
            span,
            Language::Arabic,
            Category::Spacing,
            Severity::Warning,
            0.98,
            original,
            vec![" ".to_string()],
            "Collapse repeated spaces in Arabic text.",
            true,
        ));
    }
}

fn has_arabic_before(text: &str, byte_index: usize) -> bool {
    text.get(..byte_index)
        .and_then(|prefix| prefix.chars().rev().find_map(script_context))
        .is_some_and(|script| script == ScriptContext::Arabic)
}

fn has_arabic_after(text: &str, byte_index: usize) -> bool {
    text.get(byte_index..)
        .and_then(|suffix| suffix.chars().find_map(script_context))
        .is_some_and(|script| script == ScriptContext::Arabic)
}

fn next_script_context(text: &str, byte_index: usize) -> Option<ScriptContext> {
    text.get(byte_index..)?.chars().find_map(script_context)
}

fn previous_ascii_token(text: &str, byte_index: usize) -> Option<(usize, &str)> {
    let prefix = text.get(..byte_index)?;
    let token_end = prefix.trim_end_matches(' ').len();
    if token_end == 0 {
        return None;
    }

    let mut token_start = token_end;
    for (candidate_start, character) in prefix[..token_end].char_indices().rev() {
        if !character.is_ascii_alphanumeric() {
            break;
        }
        token_start = candidate_start;
    }

    if token_start == token_end {
        return None;
    }

    let token = text.get(token_start..token_end)?;
    Some((token_start, token))
}

fn is_uppercase_latin_acronym(token: &str) -> bool {
    let mut letters = 0usize;

    for character in token.chars() {
        if character.is_ascii_uppercase() {
            letters += 1;
        } else if !character.is_ascii_digit() {
            return false;
        }
    }

    letters >= 2 && token.len() <= 12
}

fn has_arabic_boundary_before(text: &str, byte_index: usize) -> bool {
    previous_character(text, byte_index).is_none_or(|character| !is_arabic_script(character))
}

fn has_arabic_boundary_after(text: &str, byte_index: usize) -> bool {
    next_character(text, byte_index).is_none_or(|character| !is_arabic_script(character))
}

fn previous_character(text: &str, byte_index: usize) -> Option<char> {
    text.get(..byte_index)?.chars().next_back()
}

fn next_character(text: &str, byte_index: usize) -> Option<char> {
    text.get(byte_index..)?.chars().next()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScriptContext {
    Arabic,
    Latin,
}

fn script_context(character: char) -> Option<ScriptContext> {
    if is_arabic_script(character) {
        Some(ScriptContext::Arabic)
    } else if character.is_ascii_alphabetic() {
        Some(ScriptContext::Latin)
    } else {
        None
    }
}

fn push_single_character_punctuation_suggestion(
    document: &Document,
    start: usize,
    character: char,
    source: &'static str,
    replacement: &'static str,
    suggestions: &mut Vec<Suggestion>,
) {
    let end = start + character.len_utf8();

    if document.range_is_protected(start..end) {
        return;
    }

    if let (Ok(span), Some(original)) = (
        document.span_for_byte_range(start..end),
        document.text().get(start..end),
    ) {
        suggestions.push(Suggestion::replacement(
            source,
            span,
            Language::Arabic,
            Category::Punctuation,
            Severity::Warning,
            0.97,
            original,
            vec![replacement.to_string()],
            "Use Arabic punctuation in Arabic text.",
            false,
        ));
    }
}

fn push_tatweel_suggestion(
    document: &Document,
    start: usize,
    end: usize,
    suggestions: &mut Vec<Suggestion>,
) {
    if document.range_is_protected(start..end) {
        return;
    }

    if let (Ok(span), Some(original)) = (
        document.span_for_byte_range(start..end),
        document.text().get(start..end),
    ) {
        suggestions.push(Suggestion::replacement(
            "arabic:tatweel",
            span,
            Language::Arabic,
            Category::Orthography,
            Severity::Warning,
            0.99,
            original,
            vec![String::new()],
            "Remove tatweel elongation marks.",
            true,
        ));
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
    fn v1_arabic_positive_fixtures_remain_narrow() {
        let sources = sources_for("كيف حال  ما اخبار");

        assert!(sources.contains(&"arabic:repeated-space".to_owned()));
        assert!(sources.contains(&"arabic:conversational-greeting".to_owned()));
    }

    #[test]
    fn v1_arabic_negative_fixtures_avoid_broad_morphology() {
        for text in [
            "شلونك اليوم؟",
            "قابلت نورة في الدوحة.",
            "إنما الأعمال بالنيات.",
        ] {
            assert_eq!(sources_for(text), Vec::<String>::new(), "{text}");
        }
    }
}
