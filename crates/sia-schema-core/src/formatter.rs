//! Sia schema formatter — deterministic, opinionated formatting for `.sia` files.
//!
//! Design: two-pass line-based formatter that preserves comments.
//! Pass 1: classify each line and group fields into alignment blocks.
//! Pass 2: emit formatted output with proper indentation, alignment, and spacing.

/// Formatting options.
#[derive(Debug, Clone)]
pub struct FormatOptions {
    /// Number of spaces per indent level (default: 2).
    pub indent_width: usize,
}

impl Default for FormatOptions {
    fn default() -> Self {
        Self { indent_width: 2 }
    }
}

/// Format a `.sia` source string with default options.
pub fn format(source: &str) -> String {
    format_with_options(source, &FormatOptions::default())
}

/// Format a `.sia` source string with custom options.
pub fn format_with_options(source: &str, opts: &FormatOptions) -> String {
    let lines: Vec<&str> = source.lines().collect();
    let classified = classify_lines(&lines);
    emit(&classified, opts)
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
enum Line<'a> {
    /// Blank line (whitespace only)
    Blank,
    /// Line comment (// ...)
    Comment { text: &'a str },
    /// Definition header: `schema Foo {` or `plugin ... as Bar {`
    DefOpen { text: String },
    /// `} returns {` continuation in method blocks
    ReturnsOpen,
    /// Closing brace `}`
    Close,
    /// `method name(options) {`
    MethodOpen { text: String },
    /// A field line inside a schema or method block
    Field(FieldLine<'a>),
    /// Anything else — preserved as-is (trimmed + re-indented)
    Other { text: &'a str },
}

/// A parsed field line: `name? type(options)[] = default`
#[derive(Debug, Clone)]
struct FieldLine<'a> {
    /// Field name including optional `?` marker
    name: &'a str,
    /// Everything after the name: type, options, array marker, default
    rest: &'a str,
}

fn classify_lines<'a>(lines: &[&'a str]) -> Vec<Line<'a>> {
    let mut result = Vec::with_capacity(lines.len());

    for line in lines {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            result.push(Line::Blank);
            continue;
        }

        // Comment line
        if trimmed.starts_with("//") {
            result.push(Line::Comment { text: trimmed });
            continue;
        }

        // Closing brace (possibly with trailing comment)
        if trimmed == "}" {
            result.push(Line::Close);
            continue;
        }

        // `} returns {`
        if trimmed == "} returns {" {
            result.push(Line::ReturnsOpen);
            continue;
        }

        // Definition headers: `schema Name {` or `plugin ... as Name {`
        if (trimmed.starts_with("schema ") || trimmed.starts_with("plugin "))
            && trimmed.ends_with('{')
        {
            result.push(Line::DefOpen {
                text: normalize_def_header(trimmed),
            });
            continue;
        }

        // Method header: `method name(options) {`
        if trimmed.starts_with("method ") && trimmed.ends_with('{') {
            result.push(Line::MethodOpen {
                text: normalize_method_header(trimmed),
            });
            continue;
        }

        // Field line: inside a block, has at least a name and a type
        // Heuristic: starts with an identifier (letter or _), not a keyword that opens a block
        if is_field_line(trimmed) {
            if let Some(field) = parse_field_line(trimmed) {
                result.push(Line::Field(field));
                continue;
            }
        }

        // Fallback
        result.push(Line::Other { text: trimmed });
    }

    result
}

/// Normalize a definition header to canonical form.
/// E.g., `schema   Foo   {` → `schema Foo {`
fn normalize_def_header(s: &str) -> String {
    // Remove trailing `{`, normalize spaces, re-add `{`
    let without_brace = s.strip_suffix('{').unwrap_or(s).trim();
    let parts: Vec<&str> = without_brace.split_whitespace().collect();
    format!("{} {{", parts.join(" "))
}

/// Normalize a method header to canonical form.
/// Preserves options in parens but normalizes surrounding whitespace.
fn normalize_method_header(s: &str) -> String {
    let without_brace = s.strip_suffix('{').unwrap_or(s).trim();

    // Find the paren group if present
    if let Some(paren_start) = without_brace.find('(') {
        let before_paren = without_brace[..paren_start].trim();
        let paren_part = &without_brace[paren_start..];
        // Normalize spaces before paren
        let parts: Vec<&str> = before_paren.split_whitespace().collect();
        // Normalize option spacing inside parens
        let normalized_opts = normalize_options(paren_part);
        format!("{}{} {{", parts.join(" "), normalized_opts)
    } else {
        let parts: Vec<&str> = without_brace.split_whitespace().collect();
        format!("{} {{", parts.join(" "))
    }
}

/// Normalize option parentheses: `( encoding = "ascii" , length = 32 )` → `(encoding = "ascii", length = 32)`
fn normalize_options(s: &str) -> String {
    let inner = s
        .trim()
        .strip_prefix('(')
        .and_then(|s| s.strip_suffix(')'))
        .unwrap_or(s);

    let opts: Vec<String> = inner
        .split(',')
        .map(|opt| {
            let opt = opt.trim();
            if let Some(eq_pos) = opt.find('=') {
                let key = opt[..eq_pos].trim();
                let val = opt[eq_pos + 1..].trim();
                format!("{} = {}", key, val)
            } else {
                opt.to_string()
            }
        })
        .filter(|o| !o.is_empty())
        .collect();

    if opts.is_empty() {
        "()".to_string()
    } else {
        format!("({})", opts.join(", "))
    }
}

/// Check if a trimmed line looks like a field declaration.
fn is_field_line(trimmed: &str) -> bool {
    if trimmed.is_empty() {
        return false;
    }
    let first_char = trimmed.chars().next().unwrap();
    if !first_char.is_ascii_alphabetic() && first_char != '_' {
        return false;
    }
    // Must not be a keyword that opens a block
    let first_word = trimmed.split_whitespace().next().unwrap_or("");
    !matches!(
        first_word,
        "schema" | "plugin" | "method" | "returns" | "as"
    )
}

/// Parse a field line into name and rest components.
/// Input (trimmed): `name?  string8(encoding = "ascii")[] = "default"`
/// → name = `name?`, rest = `string8(encoding = "ascii")[] = "default"`
fn parse_field_line<'a>(trimmed: &'a str) -> Option<FieldLine<'a>> {
    // Find the boundary between name and type.
    // Name is: identifier chars + optional `?`
    let mut name_end = 0;
    let bytes = trimmed.as_bytes();

    // Consume identifier: [a-zA-Z_][a-zA-Z0-9_]*
    while name_end < bytes.len()
        && (bytes[name_end].is_ascii_alphanumeric() || bytes[name_end] == b'_')
    {
        name_end += 1;
    }

    if name_end == 0 {
        return None;
    }

    // Optional `?`
    if name_end < bytes.len() && bytes[name_end] == b'?' {
        name_end += 1;
    }

    let name = &trimmed[..name_end];

    // Skip whitespace between name and type
    let rest_start = trimmed[name_end..]
        .find(|c: char| !c.is_whitespace())
        .map(|i| name_end + i)?;

    let rest = trimmed[rest_start..].trim_end();

    if rest.is_empty() {
        return None;
    }

    Some(FieldLine { name, rest })
}

// ---------------------------------------------------------------------------
// Emitting formatted output
// ---------------------------------------------------------------------------

fn emit(lines: &[Line], opts: &FormatOptions) -> String {
    let indent_str = " ".repeat(opts.indent_width);
    let mut out = String::new();
    let mut depth: usize = 0;
    let mut i = 0;
    let mut prev_was_blank = false;
    let mut prev_was_def_or_close = false;

    while i < lines.len() {
        match &lines[i] {
            Line::Blank => {
                // Collapse consecutive blanks; no blank at start or end
                if !out.is_empty() && !prev_was_blank {
                    out.push('\n');
                    prev_was_blank = true;
                }
                prev_was_def_or_close = false;
                i += 1;
            }

            Line::Comment { text, .. } => {
                // Re-indent comment to current depth
                for _ in 0..depth {
                    out.push_str(&indent_str);
                }
                out.push_str(text);
                out.push('\n');
                prev_was_blank = false;
                prev_was_def_or_close = false;
                i += 1;
            }

            Line::DefOpen { text } => {
                // Blank line before definitions (except at start)
                if !out.is_empty() && !prev_was_blank && prev_was_def_or_close {
                    out.push('\n');
                }
                for _ in 0..depth {
                    out.push_str(&indent_str);
                }
                out.push_str(text);
                out.push('\n');
                depth += 1;
                prev_was_blank = false;
                prev_was_def_or_close = false;
                i += 1;
            }

            Line::MethodOpen { text } => {
                for _ in 0..depth {
                    out.push_str(&indent_str);
                }
                out.push_str(text);
                out.push('\n');
                depth += 1;
                prev_was_blank = false;
                prev_was_def_or_close = false;
                i += 1;
            }

            Line::ReturnsOpen => {
                depth = depth.saturating_sub(1);
                for _ in 0..depth {
                    out.push_str(&indent_str);
                }
                out.push_str("} returns {\n");
                depth += 1;
                prev_was_blank = false;
                prev_was_def_or_close = false;
                i += 1;
            }

            Line::Close => {
                depth = depth.saturating_sub(1);
                for _ in 0..depth {
                    out.push_str(&indent_str);
                }
                out.push_str("}\n");
                prev_was_blank = false;
                prev_was_def_or_close = true;
                i += 1;
            }

            Line::Field(_) => {
                // Collect consecutive field lines (and inline comments) for alignment
                let block_start = i;
                let mut fields: Vec<&FieldLine> = Vec::new();
                let mut block_lines: Vec<(usize, BlockEntry)> = Vec::new();

                while i < lines.len() {
                    match &lines[i] {
                        Line::Field(f) => {
                            block_lines.push((i, BlockEntry::Field(fields.len())));
                            fields.push(f);
                            i += 1;
                        }
                        Line::Comment { text, .. } => {
                            block_lines.push((i, BlockEntry::Comment(text)));
                            i += 1;
                        }
                        Line::Blank => {
                            // A blank line inside a field block — keep going but
                            // only if the next non-blank line is still a field
                            let next_non_blank = lines[i..]
                                .iter()
                                .skip(1)
                                .find(|l| !matches!(l, Line::Blank));
                            if matches!(next_non_blank, Some(Line::Field(_))) {
                                block_lines.push((i, BlockEntry::Blank));
                                i += 1;
                            } else {
                                break;
                            }
                        }
                        _ => break,
                    }
                }

                // Calculate alignment width for the name column
                let max_name_len = fields.iter().map(|f| f.name.len()).max().unwrap_or(0);

                // Also normalize options in field rest parts
                let normalized_rests: Vec<String> = fields
                    .iter()
                    .map(|f| normalize_field_rest(f.rest))
                    .collect();

                // Emit aligned block
                let _ = block_start;
                for (_line_idx, entry) in &block_lines {
                    match entry {
                        BlockEntry::Field(fi) => {
                            let field = fields[*fi];
                            let padding = max_name_len - field.name.len() + 2; // min 2 spaces
                            for _ in 0..depth {
                                out.push_str(&indent_str);
                            }
                            out.push_str(field.name);
                            for _ in 0..padding {
                                out.push(' ');
                            }
                            out.push_str(&normalized_rests[*fi]);
                            out.push('\n');
                        }
                        BlockEntry::Comment(text) => {
                            for _ in 0..depth {
                                out.push_str(&indent_str);
                            }
                            out.push_str(text);
                            out.push('\n');
                        }
                        BlockEntry::Blank => {
                            out.push('\n');
                        }
                    }
                }

                prev_was_blank = false;
                prev_was_def_or_close = false;
            }

            Line::Other { text } => {
                for _ in 0..depth {
                    out.push_str(&indent_str);
                }
                out.push_str(text);
                out.push('\n');
                prev_was_blank = false;
                prev_was_def_or_close = false;
                i += 1;
            }
        }
    }

    // Remove trailing blank lines, ensure single trailing newline
    let trimmed = out.trim_end();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut result = trimmed.to_string();
    result.push('\n');
    result
}

#[derive(Debug)]
enum BlockEntry<'a> {
    Field(usize), // index into the fields vec
    Comment(&'a str),
    Blank,
}

/// Normalize the "rest" part of a field line (type + options + array + default).
/// Ensures consistent spacing around `=` in options and defaults.
fn normalize_field_rest(rest: &str) -> String {
    let mut result = String::new();
    let mut chars = rest.chars().peekable();

    // State tracking
    let mut in_parens = false;
    let mut paren_content = String::new();

    while let Some(ch) = chars.next() {
        if ch == '(' && !in_parens {
            in_parens = true;
            paren_content.clear();
            continue;
        }

        if ch == ')' && in_parens {
            in_parens = false;
            let normalized = normalize_options(&format!("({})", paren_content));
            result.push_str(&normalized);
            continue;
        }

        if in_parens {
            paren_content.push(ch);
            continue;
        }

        // Handle default value: ` = "something"`
        // Normalize spacing around `=` at the top level (outside parens)
        if ch == '=' {
            // Trim trailing whitespace from result
            let trimmed_end = result.trim_end().len();
            result.truncate(trimmed_end);
            result.push_str(" = ");
            // Skip whitespace after `=`
            while chars.peek() == Some(&' ') || chars.peek() == Some(&'\t') {
                chars.next();
            }
            continue;
        }

        result.push(ch);
    }

    result.trim_end().to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_indentation() {
        let input = "schema Foo {\nname string8\nage uint8\n}\n";
        let expected = "schema Foo {\n  name  string8\n  age   uint8\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_trailing_whitespace_removed() {
        let input = "schema Foo {   \n  name   string8   \n}   \n";
        let expected = "schema Foo {\n  name  string8\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_blank_line_normalization() {
        let input = "schema Foo {\n  name string8\n}\n\n\n\nschema Bar {\n  age uint8\n}\n";
        let expected = "schema Foo {\n  name  string8\n}\n\nschema Bar {\n  age  uint8\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_field_alignment() {
        let input = "schema Foo {\n  name string8\n  age? int32\n  email? string8\n}\n";
        let expected = "schema Foo {\n  name    string8\n  age?    int32\n  email?  string8\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_option_normalization() {
        let input = "schema Foo {\n  name string8( encoding = \"ascii\" , length = 32 )\n}\n";
        let expected = "schema Foo {\n  name  string8(encoding = \"ascii\", length = 32)\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_default_value_spacing() {
        let input = "schema Foo {\n  name string8  =  \"hello\"\n}\n";
        let expected = "schema Foo {\n  name  string8 = \"hello\"\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_comment_preservation() {
        let input = "// Top comment\nschema Foo {\n  // field comment\n  name string8\n}\n";
        let expected = "// Top comment\nschema Foo {\n  // field comment\n  name  string8\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_method_formatting() {
        let input = "plugin a.b as Foo {\n  method bar( timeout = 5000 ) {\n    name string8\n  } returns {\n    ok bool\n  }\n}\n";
        let expected = "plugin a.b as Foo {\n  method bar(timeout = 5000) {\n    name  string8\n  } returns {\n    ok  bool\n  }\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_brace_style_enforcement() {
        // Extra spaces around brace
        let input = "schema   Foo   {\n  name string8\n}\n";
        let expected = "schema Foo {\n  name  string8\n}\n";
        assert_eq!(format(input), expected);
    }

    #[test]
    fn test_idempotency() {
        let input = "schema Person {\n  name    string8\n  age?    int32\n  email?  string8(encoding = \"ascii\")[]\n  tags    string8[]\n  address Address\n}\n\nschema Address {\n  street?  string(encoding = \"ascii\") = \"Default Street\"\n  city     string8\n  zip      int32\n}\n\nplugin swiss.timeleap.isWizard.v1 as Sorcery {\n  method isWizard(timeout = 5000) {\n    age       uint8\n    name      string8\n  } returns {\n    isWizard  bool\n    message   string8\n  }\n}\n";
        let once = format(input);
        let twice = format(&once);
        assert_eq!(once, twice, "Formatter is not idempotent");
    }

    #[test]
    fn test_empty_input() {
        assert_eq!(format(""), "");
        assert_eq!(format("   \n  \n  "), "");
    }

    #[test]
    fn test_no_trailing_blank_lines() {
        let input = "schema Foo {\n  name string8\n}\n\n\n\n";
        let result = format(input);
        assert!(
            result.ends_with("}\n"),
            "Should end with }}\\n, got: {:?}",
            result
        );
        assert!(
            !result.ends_with("\n\n"),
            "Should not end with double newline"
        );
    }
}
