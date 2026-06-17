use write_core::OffsetMap;

#[test]
fn offset_mapping_tracks_utf16_and_graphemes_for_mixed_text() {
    let map = OffsetMap::new("a🙂ب");

    let emoji_span = map.span_for_byte_range(1..5).expect("emoji span");
    assert_eq!(emoji_span.start_byte, 1);
    assert_eq!(emoji_span.end_byte, 5);
    assert_eq!(emoji_span.start_utf16, 1);
    assert_eq!(emoji_span.end_utf16, 3);
    assert_eq!(emoji_span.start_grapheme, 1);
    assert_eq!(emoji_span.end_grapheme, 2);

    let arabic_span = map.span_for_byte_range(5..7).expect("arabic span");
    assert_eq!(arabic_span.start_utf16, 3);
    assert_eq!(arabic_span.end_utf16, 4);
    assert_eq!(arabic_span.start_grapheme, 2);
    assert_eq!(arabic_span.end_grapheme, 3);
}

#[test]
fn utf16_and_grapheme_ranges_round_trip_to_byte_spans() {
    let map = OffsetMap::new("a🙂ب");

    assert_eq!(map.byte_for_utf16(3).expect("utf16 boundary"), 5);
    assert!(map.byte_for_utf16(2).is_err());

    let utf16_span = map
        .span_for_utf16_range(1..3)
        .expect("emoji from utf16 range");
    assert_eq!(utf16_span.byte_range(), 1..5);

    let grapheme_span = map
        .span_for_grapheme_range(2..3)
        .expect("arabic from grapheme range");
    assert_eq!(grapheme_span.byte_range(), 5..7);
}
