use sia_schema_core::formatter;

/// Test that formatting sample.sia produces the expected canonical output
/// and that the result is idempotent.
#[test]
fn test_format_sample_sia() {
    let input = include_str!("fixtures/sample.sia");
    let formatted = formatter::format(input);

    // The sample.sia is already well-formatted, so the output should match
    // (or be very close — alignment may adjust slightly)
    let expected = "\
schema Person {
  name     string8
  age?     int32
  email?   string8(encoding = \"ascii\")[]
  tags     string8[]
  address  Address
}

schema Address {
  street?  string(encoding = \"ascii\") = \"Default Street\"
  city     string8
  zip      int32
}
";

    assert_eq!(formatted, expected);
}

/// Formatting must be idempotent: format(format(x)) == format(x)
#[test]
fn test_format_idempotent() {
    let input = include_str!("fixtures/sample.sia");
    let once = formatter::format(input);
    let twice = formatter::format(&once);
    assert_eq!(once, twice, "Formatter is not idempotent");
}

/// Formatting must not change parse results.
#[test]
fn test_format_preserves_semantics() {
    let input = include_str!("fixtures/sample.sia");
    let formatted = formatter::format(input);

    let (defs_before, _) = sia_schema_core::parse(input);
    let (defs_after, _) = sia_schema_core::parse(&formatted);

    let json_before = serde_json::to_string_pretty(&defs_before).unwrap();
    let json_after = serde_json::to_string_pretty(&defs_after).unwrap();

    assert_eq!(
        json_before, json_after,
        "Formatting changed parse semantics"
    );
}

/// Test formatting messy input.
#[test]
fn test_format_messy_input() {
    let messy = "\
schema   Person   {
name string8
age?  int32
  email?    string8( encoding = \"ascii\" )[]
     tags      string8[]
address    Address
}


schema   Address    {
  street?   string( encoding = \"ascii\" )   =   \"Default Street\"
city string8
  zip int32
}
";

    let formatted = formatter::format(messy);

    let expected = "\
schema Person {
  name     string8
  age?     int32
  email?   string8(encoding = \"ascii\")[]
  tags     string8[]
  address  Address
}

schema Address {
  street?  string(encoding = \"ascii\") = \"Default Street\"
  city     string8
  zip      int32
}
";

    assert_eq!(formatted, expected);
}
