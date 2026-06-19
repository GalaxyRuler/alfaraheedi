use write_core::{Category, Document, Engine, Language, Rule, RuleInfo, Severity, Suggestion};

const TATWEEL: char = '\u{0640}';

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
        suggestions
    }
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
            ',' if has_arabic_before(document.text(), byte_index)
                && has_arabic_after(document.text(), end) =>
            {
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
        if !matches!(character, '،' | '؛' | '؟') {
            continue;
        }

        let punctuation_end = punctuation_start + character.len_utf8();
        if document.range_is_protected(punctuation_start..punctuation_end) {
            continue;
        }
        if !has_arabic_before(text, punctuation_start) {
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
                "Add a space after Arabic punctuation.",
                false,
            ));
        }
    }

    suggestions
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
