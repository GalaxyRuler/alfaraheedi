use write_core::{Category, Document, Language, Patch, Severity, Suggestion, safe_patches};

#[test]
fn protected_spans_detect_urls_emails_and_inline_code() {
    let document = Document::new("افتح https://x.com/a?b=1 ثم `code?` و test@example.com");

    let protected = document.protected_spans();

    assert_eq!(protected.len(), 3);
    assert!(
        protected
            .iter()
            .any(|span| span.text == "https://x.com/a?b=1")
    );
    assert!(protected.iter().any(|span| span.text == "`code?`"));
    assert!(protected.iter().any(|span| span.text == "test@example.com"));
}

#[test]
fn document_applies_safe_patches_from_right_to_left() {
    let document = Document::new("مرحبــا  بالعالم");
    let tatweel_span = document.span_for_byte_range(8..12).expect("tatweel span");
    let spacing_span = document.span_for_byte_range(14..16).expect("spacing span");

    let suggestions = vec![
        Suggestion::replacement(
            "arabic:tatweel",
            tatweel_span,
            Language::Arabic,
            Category::Orthography,
            Severity::Warning,
            0.99,
            "ــ",
            vec![String::new()],
            "Remove tatweel elongation marks.",
            true,
        ),
        Suggestion::replacement(
            "arabic:repeated-space",
            spacing_span,
            Language::Arabic,
            Category::Spacing,
            Severity::Warning,
            0.98,
            "  ",
            vec![" ".to_owned()],
            "Collapse repeated spaces.",
            true,
        ),
    ];

    let applied = document
        .apply(&safe_patches(&suggestions))
        .expect("patch application");

    assert_eq!(applied.text(), "مرحبا بالعالم");
    assert_eq!(
        applied.offsets().len_utf16(),
        "مرحبا بالعالم".encode_utf16().count()
    );
}

#[test]
fn safe_patches_drop_overlapping_lower_precedence_edits() {
    let document = Document::new("abc");
    let broad = document.span_for_byte_range(0..2).expect("broad span");
    let narrow = document.span_for_byte_range(1..2).expect("narrow span");

    let patches = safe_patches(&[
        Suggestion::replacement(
            "low",
            broad,
            Language::English,
            Category::Style,
            Severity::Info,
            0.9,
            "ab",
            vec!["AB".to_owned()],
            "Low priority.",
            true,
        ),
        Suggestion::replacement(
            "high",
            narrow,
            Language::English,
            Category::Spelling,
            Severity::Error,
            0.7,
            "b",
            vec!["B".to_owned()],
            "High priority.",
            true,
        ),
    ]);

    assert_eq!(
        patches,
        vec![Patch {
            span: narrow,
            replacement: "B".to_owned(),
            source: "high".to_owned(),
            severity: Severity::Error,
            confidence: 0.7,
        }]
    );
}
