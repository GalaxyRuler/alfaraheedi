use serde::{Deserialize, Serialize};
use write_core::{Language, OffsetMap, TextSpan};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScriptSpan {
    pub language: Language,
    pub direction: Direction,
    pub span: TextSpan,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    Ltr,
    Rtl,
    Neutral,
}

pub fn segment_scripts(text: &str) -> Vec<ScriptSpan> {
    let offsets = OffsetMap::new(text);
    let mut spans = Vec::new();
    let mut active = None::<ActiveSpan>;

    for (byte_index, character) in text.char_indices() {
        let Some(language) = language_for_character(character) else {
            continue;
        };

        match &mut active {
            Some(span) if span.language == language => {
                span.end = byte_index + character.len_utf8();
            }
            Some(span) => {
                push_script_span(text, &offsets, span, &mut spans);
                active = Some(ActiveSpan {
                    language,
                    start: byte_index,
                    end: byte_index + character.len_utf8(),
                });
            }
            None => {
                active = Some(ActiveSpan {
                    language,
                    start: byte_index,
                    end: byte_index + character.len_utf8(),
                });
            }
        }
    }

    if let Some(span) = active {
        push_script_span(text, &offsets, &span, &mut spans);
    }

    spans
}

pub fn dominant_direction(text: &str) -> Direction {
    text.chars()
        .find_map(language_for_character)
        .map_or(Direction::Neutral, |language| {
            direction_for_language(&language)
        })
}

#[derive(Debug, Clone)]
struct ActiveSpan {
    language: Language,
    start: usize,
    end: usize,
}

fn push_script_span(
    text: &str,
    offsets: &OffsetMap,
    active: &ActiveSpan,
    spans: &mut Vec<ScriptSpan>,
) {
    if let (Ok(span), Some(slice)) = (
        offsets.span_for_byte_range(active.start..active.end),
        text.get(active.start..active.end),
    ) {
        spans.push(ScriptSpan {
            language: active.language.clone(),
            direction: direction_for_language(&active.language),
            span,
            text: slice.to_owned(),
        });
    }
}

fn language_for_character(character: char) -> Option<Language> {
    if is_arabic_script(character) {
        Some(Language::Arabic)
    } else if character.is_ascii_alphabetic() {
        Some(Language::English)
    } else {
        None
    }
}

fn direction_for_language(language: &Language) -> Direction {
    match language {
        Language::Arabic => Direction::Rtl,
        Language::English => Direction::Ltr,
        Language::Mixed | Language::Unknown => Direction::Neutral,
    }
}

fn is_arabic_script(character: char) -> bool {
    matches!(
        character as u32,
        0x0600..=0x06FF
            | 0x0750..=0x077F
            | 0x08A0..=0x08FF
            | 0xFB50..=0xFDFF
            | 0xFE70..=0xFEFF
    )
}

#[cfg(test)]
mod tests {
    use write_core::Language;

    use super::{Direction, dominant_direction, segment_scripts};

    #[test]
    fn v1_mixed_fixture_segmentation_preserves_urls_code_emails_and_numbers_as_boundaries() {
        let spans = segment_scripts("راجع https://example.com ثم `helo` and 3.5%");

        assert_eq!(spans[0].language, Language::Arabic);
        assert_eq!(spans[0].direction, Direction::Rtl);
        assert_eq!(spans[1].language, Language::English);
        assert_eq!(spans[1].text, "https://example.com");
        assert!(spans.iter().any(|span| span.text.contains("helo")));
        assert!(spans.iter().any(|span| span.text.contains("and")));
    }

    #[test]
    fn v1_mixed_direction_uses_first_strong_script() {
        assert_eq!(dominant_direction("123 مرحبا and hello"), Direction::Rtl);
        assert_eq!(dominant_direction("123 hello مرحبا"), Direction::Ltr);
    }
}
