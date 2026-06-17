use std::collections::BTreeMap;
use std::ops::Range;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use unicode_segmentation::UnicodeSegmentation;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextSpan {
    pub start_byte: usize,
    pub end_byte: usize,
    pub start_utf16: usize,
    pub end_utf16: usize,
    pub start_grapheme: usize,
    pub end_grapheme: usize,
}

impl TextSpan {
    pub fn byte_range(&self) -> Range<usize> {
        self.start_byte..self.end_byte
    }

    pub fn overlaps(&self, other: &Self) -> bool {
        self.start_byte < other.end_byte && other.start_byte < self.end_byte
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Language {
    Arabic,
    English,
    Mixed,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Category {
    Orthography,
    Punctuation,
    Spacing,
    Spelling,
    Grammar,
    Style,
    ProtectedSpan,
}

impl Category {
    fn code(&self) -> &'static str {
        match self {
            Self::Orthography => "orthography",
            Self::Punctuation => "punctuation",
            Self::Spacing => "spacing",
            Self::Spelling => "spelling",
            Self::Grammar => "grammar",
            Self::Style => "style",
            Self::ProtectedSpan => "protected-span",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Info,
    Warning,
    Error,
}

impl Severity {
    fn precedence(&self) -> u8 {
        match self {
            Self::Error => 3,
            Self::Warning => 2,
            Self::Info => 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Suggestion {
    pub id: String,
    pub span: TextSpan,
    pub language: Language,
    pub category: Category,
    pub severity: Severity,
    pub confidence: f32,
    pub source: String,
    pub original: String,
    pub replacements: Vec<String>,
    pub explanation: String,
    pub safe_auto_apply: bool,
}

impl Suggestion {
    #[allow(clippy::too_many_arguments)]
    pub fn replacement(
        source: impl Into<String>,
        span: TextSpan,
        language: Language,
        category: Category,
        severity: Severity,
        confidence: f32,
        original: impl Into<String>,
        replacements: Vec<String>,
        explanation: impl Into<String>,
        safe_auto_apply: bool,
    ) -> Self {
        let source = source.into();
        let id = format!(
            "{}:{}-{}:{}",
            source,
            span.start_byte,
            span.end_byte,
            category.code()
        );

        Self {
            id,
            span,
            language,
            category,
            severity,
            confidence,
            source,
            original: original.into(),
            replacements,
            explanation: explanation.into(),
            safe_auto_apply,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProtectedSpanKind {
    Url,
    Email,
    InlineCode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProtectedSpan {
    pub kind: ProtectedSpanKind,
    pub span: TextSpan,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Patch {
    pub span: TextSpan,
    pub replacement: String,
    pub source: String,
    pub severity: Severity,
    pub confidence: f32,
}

impl Patch {
    pub fn from_suggestion(suggestion: &Suggestion) -> Option<Self> {
        if !suggestion.safe_auto_apply || suggestion.replacements.len() != 1 {
            return None;
        }

        Some(Self {
            span: suggestion.span,
            replacement: suggestion.replacements.first()?.clone(),
            source: suggestion.source.clone(),
            severity: suggestion.severity.clone(),
            confidence: suggestion.confidence,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppliedDocument {
    text: String,
    offsets: OffsetMap,
}

impl AppliedDocument {
    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn offsets(&self) -> &OffsetMap {
        &self.offsets
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Analysis {
    pub text_len_bytes: usize,
    pub text_len_utf16: usize,
    pub text_len_graphemes: usize,
    pub suggestions: Vec<Suggestion>,
}

#[derive(Debug, Clone)]
pub struct Document {
    text: String,
    offsets: OffsetMap,
    protected_spans: Vec<ProtectedSpan>,
}

impl Document {
    pub fn new(text: impl Into<String>) -> Self {
        let text = text.into();
        let offsets = OffsetMap::new(&text);
        let protected_spans = detect_protected_spans(&text, &offsets);
        Self {
            text,
            offsets,
            protected_spans,
        }
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn offsets(&self) -> &OffsetMap {
        &self.offsets
    }

    pub fn protected_spans(&self) -> &[ProtectedSpan] {
        &self.protected_spans
    }

    pub fn range_is_protected(&self, range: Range<usize>) -> bool {
        self.protected_spans
            .iter()
            .any(|protected| ranges_overlap(range.clone(), protected.span.byte_range()))
    }

    pub fn span_for_byte_range(&self, range: Range<usize>) -> Result<TextSpan, OffsetError> {
        self.offsets.span_for_byte_range(range)
    }

    pub fn apply(&self, patches: &[Patch]) -> Result<AppliedDocument, PatchError> {
        let selected = resolve_overlapping_patches(patches);
        let mut text = self.text.clone();
        let mut previous_start = text.len();

        for patch in selected.iter().rev() {
            if patch.span.end_byte > previous_start {
                return Err(PatchError::OverlappingPatch {
                    first_start: patch.span.start_byte,
                    second_start: previous_start,
                });
            }

            if text.get(patch.span.byte_range()).is_none() {
                return Err(PatchError::InvalidSpan {
                    start: patch.span.start_byte,
                    end: patch.span.end_byte,
                });
            }

            text.replace_range(patch.span.byte_range(), &patch.replacement);
            previous_start = patch.span.start_byte;
        }

        let offsets = OffsetMap::new(&text);
        Ok(AppliedDocument { text, offsets })
    }

    pub fn apply_safe_suggestions(
        &self,
        suggestions: &[Suggestion],
    ) -> Result<AppliedDocument, PatchError> {
        let patches = safe_patches(suggestions);
        self.apply(&patches)
    }
}

pub fn safe_patches(suggestions: &[Suggestion]) -> Vec<Patch> {
    let patches = suggestions
        .iter()
        .filter_map(Patch::from_suggestion)
        .collect::<Vec<_>>();
    resolve_overlapping_patches(&patches)
}

pub fn resolve_overlapping_patches(patches: &[Patch]) -> Vec<Patch> {
    let mut sorted = patches.to_vec();
    sorted.sort_by_key(|patch| {
        (
            patch.span.start_byte,
            patch.span.end_byte,
            patch.source.clone(),
        )
    });

    let mut selected = Vec::<Patch>::new();

    for patch in sorted {
        let mut candidate = patch;
        while selected
            .last()
            .is_some_and(|existing| existing.span.overlaps(&candidate.span))
        {
            let Some(existing) = selected.pop() else {
                break;
            };
            candidate = preferred_patch(existing, candidate);
        }
        selected.push(candidate);
    }

    selected.sort_by_key(|patch| {
        (
            patch.span.start_byte,
            patch.span.end_byte,
            patch.source.clone(),
        )
    });
    selected
}

fn preferred_patch(left: Patch, right: Patch) -> Patch {
    let ordering = left
        .severity
        .precedence()
        .cmp(&right.severity.precedence())
        .then_with(|| left.confidence.total_cmp(&right.confidence))
        .then_with(|| right.source.cmp(&left.source));

    if ordering.is_gt() { left } else { right }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum PatchError {
    #[error("patch span {start}..{end} is not a valid UTF-8 range for this document")]
    InvalidSpan { start: usize, end: usize },
    #[error("patch starting at {first_start} overlaps patch boundary {second_start}")]
    OverlappingPatch {
        first_start: usize,
        second_start: usize,
    },
}

fn detect_protected_spans(text: &str, offsets: &OffsetMap) -> Vec<ProtectedSpan> {
    let mut spans = Vec::new();
    detect_inline_code_spans(text, offsets, &mut spans);

    for range in non_whitespace_ranges(text) {
        if spans.iter().any(|protected: &ProtectedSpan| {
            ranges_overlap(range.clone(), protected.span.byte_range())
        }) {
            continue;
        }

        let Some(token) = text.get(range.clone()) else {
            continue;
        };

        if is_url_token(token) {
            push_protected_span(text, offsets, ProtectedSpanKind::Url, range, &mut spans);
        } else if is_email_token(token) {
            push_protected_span(text, offsets, ProtectedSpanKind::Email, range, &mut spans);
        }
    }

    spans.sort_by_key(|span| span.span.start_byte);
    spans
}

fn detect_inline_code_spans(text: &str, offsets: &OffsetMap, spans: &mut Vec<ProtectedSpan>) {
    let mut start = None;

    for (byte_index, character) in text.char_indices() {
        if character != '`' {
            continue;
        }

        if let Some(open) = start.take() {
            let end = byte_index + character.len_utf8();
            push_protected_span(
                text,
                offsets,
                ProtectedSpanKind::InlineCode,
                open..end,
                spans,
            );
        } else {
            start = Some(byte_index);
        }
    }
}

fn push_protected_span(
    text: &str,
    offsets: &OffsetMap,
    kind: ProtectedSpanKind,
    range: Range<usize>,
    spans: &mut Vec<ProtectedSpan>,
) {
    if let (Ok(span), Some(slice)) = (offsets.span_for_byte_range(range.clone()), text.get(range)) {
        spans.push(ProtectedSpan {
            kind,
            span,
            text: slice.to_owned(),
        });
    }
}

fn non_whitespace_ranges(text: &str) -> Vec<Range<usize>> {
    let mut ranges = Vec::new();
    let mut start = None;

    for (byte_index, character) in text.char_indices() {
        if character.is_whitespace() {
            if let Some(open) = start.take() {
                ranges.push(open..byte_index);
            }
        } else {
            start.get_or_insert(byte_index);
        }
    }

    if let Some(open) = start {
        ranges.push(open..text.len());
    }

    ranges
}

fn is_url_token(token: &str) -> bool {
    token.starts_with("http://") || token.starts_with("https://") || token.starts_with("www.")
}

fn is_email_token(token: &str) -> bool {
    let Some((local, domain)) = token.split_once('@') else {
        return false;
    };

    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

fn ranges_overlap(left: Range<usize>, right: Range<usize>) -> bool {
    left.start < right.end && right.start < left.end
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Boundary {
    utf16: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OffsetMap {
    text_len_bytes: usize,
    text_len_utf16: usize,
    text_len_graphemes: usize,
    char_boundaries: BTreeMap<usize, Boundary>,
    utf16_boundaries: BTreeMap<usize, usize>,
    grapheme_boundaries: BTreeMap<usize, usize>,
    grapheme_to_byte: BTreeMap<usize, usize>,
}

impl OffsetMap {
    pub fn new(text: &str) -> Self {
        let mut char_boundaries = BTreeMap::new();
        let mut utf16_boundaries = BTreeMap::new();
        let mut utf16 = 0;
        char_boundaries.insert(0, Boundary { utf16 });
        utf16_boundaries.insert(0, 0);

        for (byte_index, character) in text.char_indices() {
            utf16 += character.len_utf16();
            let boundary = byte_index + character.len_utf8();
            char_boundaries.insert(boundary, Boundary { utf16 });
            utf16_boundaries.insert(utf16, boundary);
        }

        let mut grapheme_boundaries = BTreeMap::new();
        let mut grapheme_to_byte = BTreeMap::new();
        grapheme_boundaries.insert(0, 0);
        grapheme_to_byte.insert(0, 0);

        for (grapheme_index, (start, grapheme)) in
            UnicodeSegmentation::grapheme_indices(text, true).enumerate()
        {
            grapheme_boundaries.entry(start).or_insert(grapheme_index);
            grapheme_to_byte.entry(grapheme_index).or_insert(start);
            let end = start + grapheme.len();
            grapheme_boundaries.insert(end, grapheme_index + 1);
            grapheme_to_byte.insert(grapheme_index + 1, end);
        }

        let text_len_graphemes = text.graphemes(true).count();

        Self {
            text_len_bytes: text.len(),
            text_len_utf16: utf16,
            text_len_graphemes,
            char_boundaries,
            utf16_boundaries,
            grapheme_boundaries,
            grapheme_to_byte,
        }
    }

    pub fn len_bytes(&self) -> usize {
        self.text_len_bytes
    }

    pub fn len_utf16(&self) -> usize {
        self.text_len_utf16
    }

    pub fn len_graphemes(&self) -> usize {
        self.text_len_graphemes
    }

    pub fn byte_for_utf16(&self, utf16: usize) -> Result<usize, OffsetError> {
        self.utf16_boundaries
            .get(&utf16)
            .copied()
            .ok_or(OffsetError::NotUtf16Boundary { utf16 })
    }

    pub fn byte_for_grapheme(&self, grapheme: usize) -> Result<usize, OffsetError> {
        self.grapheme_to_byte
            .get(&grapheme)
            .copied()
            .ok_or(OffsetError::NotGraphemeIndex { grapheme })
    }

    pub fn span_for_utf16_range(&self, range: Range<usize>) -> Result<TextSpan, OffsetError> {
        if range.start > range.end || range.end > self.text_len_utf16 {
            return Err(OffsetError::Utf16OutOfBounds {
                start: range.start,
                end: range.end,
                text_len: self.text_len_utf16,
            });
        }

        let start = self.byte_for_utf16(range.start)?;
        let end = self.byte_for_utf16(range.end)?;
        self.span_for_byte_range(start..end)
    }

    pub fn span_for_grapheme_range(&self, range: Range<usize>) -> Result<TextSpan, OffsetError> {
        if range.start > range.end || range.end > self.text_len_graphemes {
            return Err(OffsetError::GraphemeOutOfBounds {
                start: range.start,
                end: range.end,
                text_len: self.text_len_graphemes,
            });
        }

        let start = self.byte_for_grapheme(range.start)?;
        let end = self.byte_for_grapheme(range.end)?;
        self.span_for_byte_range(start..end)
    }

    pub fn span_for_byte_range(&self, range: Range<usize>) -> Result<TextSpan, OffsetError> {
        if range.start > range.end || range.end > self.text_len_bytes {
            return Err(OffsetError::OutOfBounds {
                start: range.start,
                end: range.end,
                text_len: self.text_len_bytes,
            });
        }

        let start = self
            .char_boundaries
            .get(&range.start)
            .ok_or(OffsetError::NotUtf8Boundary { byte: range.start })?;
        let end = self
            .char_boundaries
            .get(&range.end)
            .ok_or(OffsetError::NotUtf8Boundary { byte: range.end })?;
        let start_grapheme = self
            .grapheme_boundaries
            .get(&range.start)
            .ok_or(OffsetError::NotGraphemeBoundary { byte: range.start })?;
        let end_grapheme = self
            .grapheme_boundaries
            .get(&range.end)
            .ok_or(OffsetError::NotGraphemeBoundary { byte: range.end })?;

        Ok(TextSpan {
            start_byte: range.start,
            end_byte: range.end,
            start_utf16: start.utf16,
            end_utf16: end.utf16,
            start_grapheme: *start_grapheme,
            end_grapheme: *end_grapheme,
        })
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum OffsetError {
    #[error("byte range {start}..{end} is outside text length {text_len}")]
    OutOfBounds {
        start: usize,
        end: usize,
        text_len: usize,
    },
    #[error("byte index {byte} is not a UTF-8 boundary")]
    NotUtf8Boundary { byte: usize },
    #[error("byte index {byte} is not a grapheme boundary")]
    NotGraphemeBoundary { byte: usize },
    #[error("UTF-16 index {utf16} is not a scalar boundary")]
    NotUtf16Boundary { utf16: usize },
    #[error("grapheme index {grapheme} is not a known boundary")]
    NotGraphemeIndex { grapheme: usize },
    #[error("UTF-16 range {start}..{end} is outside text length {text_len}")]
    Utf16OutOfBounds {
        start: usize,
        end: usize,
        text_len: usize,
    },
    #[error("grapheme range {start}..{end} is outside text length {text_len}")]
    GraphemeOutOfBounds {
        start: usize,
        end: usize,
        text_len: usize,
    },
}

pub trait Rule: Send + Sync {
    fn id(&self) -> &'static str;
    fn check(&self, document: &Document) -> Vec<Suggestion>;
}

#[derive(Default)]
pub struct Engine {
    rules: Vec<Box<dyn Rule>>,
}

impl Engine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_rule(mut self, rule: impl Rule + 'static) -> Self {
        self.rules.push(Box::new(rule));
        self
    }

    pub fn analyze(&self, text: impl Into<String>) -> Analysis {
        let document = Document::new(text);
        let mut suggestions = Vec::new();

        for rule in &self.rules {
            suggestions.extend(rule.check(&document));
        }

        suggestions.sort_by_key(|suggestion| {
            (
                suggestion.span.start_byte,
                suggestion.span.end_byte,
                suggestion.source.clone(),
            )
        });

        Analysis {
            text_len_bytes: document.offsets().len_bytes(),
            text_len_utf16: document.offsets().len_utf16(),
            text_len_graphemes: document.offsets().len_graphemes(),
            suggestions,
        }
    }
}
