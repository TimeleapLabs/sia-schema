/*!
 * Sia schema linter: semantic checks beyond parse errors.
 *
 * All 8 lint rules operate on the parsed IR ([`SchemaDefinition`] list) and
 * produce [`LintDiagnostic`] values with severity, message, and source span.
 */

use std::collections::{HashMap, HashSet};

use crate::error::{Severity, Span};
use crate::ir::*;

/// A diagnostic produced by the linter.
#[derive(Debug, Clone)]
pub struct LintDiagnostic {
    pub severity: Severity,
    pub message: String,
    /**
     * Span pointing to the relevant source location.
     * Uses byte offset + length, same as parser diagnostics.
     */
    pub span: Span,
    /// Machine-readable rule identifier.
    pub rule: LintRule,
}

/// Lint rule identifiers for filtering and suppression.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LintRule {
    DuplicateSchemaName,
    DuplicateFieldName,
    UndefinedTypeRef,
    UnusedSchema,
    InvalidOptionForType,
    InvalidDefaultValue,
    NamingConvention,
    EmptyDefinition,
}

impl std::fmt::Display for LintRule {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LintRule::DuplicateSchemaName => write!(f, "duplicate-schema"),
            LintRule::DuplicateFieldName => write!(f, "duplicate-field"),
            LintRule::UndefinedTypeRef => write!(f, "undefined-type"),
            LintRule::UnusedSchema => write!(f, "unused-schema"),
            LintRule::InvalidOptionForType => write!(f, "invalid-option"),
            LintRule::InvalidDefaultValue => write!(f, "invalid-default"),
            LintRule::NamingConvention => write!(f, "naming-convention"),
            LintRule::EmptyDefinition => write!(f, "empty-definition"),
        }
    }
}

/**
 * Run all 8 lint rules on the given definitions.
 *
 * `source` is the original source text, used to locate spans for symbols
 * that don't carry spans in the IR. The IR currently doesn't store spans,
 * so identifiers are located by searching the source text.
 */
pub fn lint(definitions: &[SchemaDefinition], source: &str) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();

    check_duplicate_schemas(definitions, source, &mut diagnostics);
    check_duplicate_fields(definitions, source, &mut diagnostics);
    check_undefined_types(definitions, source, &mut diagnostics);
    check_unused_schemas(definitions, source, &mut diagnostics);
    check_invalid_options(definitions, source, &mut diagnostics);
    check_invalid_defaults(definitions, source, &mut diagnostics);
    check_naming_conventions(definitions, source, &mut diagnostics);
    check_empty_definitions(definitions, source, &mut diagnostics);

    diagnostics
}

// ---------------------------------------------------------------------------
// Rule: Duplicate schema names
// ---------------------------------------------------------------------------

fn check_duplicate_schemas(
    definitions: &[SchemaDefinition],
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    let mut seen: HashMap<&str, Span> = HashMap::new();
    let mut search_from = 0usize;

    for s in definitions {
        let span = find_keyword_then_name(source, "schema", &s.name, search_from)
            .unwrap_or(Span::new(0, s.name.len()));

        if seen.contains_key(s.name.as_str()) {
            diags.push(LintDiagnostic {
                severity: Severity::Error,
                message: format!("Duplicate schema name: '{}'", s.name),
                span,
                rule: LintRule::DuplicateSchemaName,
            });
        } else {
            seen.insert(&s.name, span);
        }

        search_from = span.end();
    }
}

// ---------------------------------------------------------------------------
// Rule: Duplicate field names within a schema
// ---------------------------------------------------------------------------

fn check_duplicate_fields(
    definitions: &[SchemaDefinition],
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    for s in definitions {
        let block_start = find_identifier(source, &s.name, 0)
            .map(|sp| sp.end())
            .unwrap_or(0);
        check_field_list_duplicates(&s.fields, &s.name, source, block_start, diags);
    }
}

fn check_field_list_duplicates(
    fields: &[FieldDefinition],
    context: &str,
    source: &str,
    start: usize,
    diags: &mut Vec<LintDiagnostic>,
) {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut search_from = start;

    for field in fields {
        let span = find_identifier(source, &field.name, search_from)
            .unwrap_or(Span::new(search_from, field.name.len()));

        if !seen.insert(&field.name) {
            diags.push(LintDiagnostic {
                severity: Severity::Error,
                message: format!("Duplicate field name '{}' in {}", field.name, context),
                span,
                rule: LintRule::DuplicateFieldName,
            });
        }

        search_from = span.end();
    }
}

// ---------------------------------------------------------------------------
// Rule: Undefined type references
// ---------------------------------------------------------------------------

fn check_undefined_types(
    definitions: &[SchemaDefinition],
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    // Collect all defined schema names
    let schema_names: HashSet<&str> = definitions.iter().map(|s| s.name.as_str()).collect();

    // Check all field types
    for s in definitions {
        for field in &s.fields {
            if is_custom_type(&field.field_type)
                && !schema_names.contains(field.field_type.as_str())
            {
                let span = find_identifier(source, &field.field_type, 0)
                    .unwrap_or(Span::new(0, field.field_type.len()));
                diags.push(LintDiagnostic {
                    severity: Severity::Warning,
                    message: format!(
                        "Undefined type '{}'. No schema with this name is defined.",
                        field.field_type
                    ),
                    span,
                    rule: LintRule::UndefinedTypeRef,
                });
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Rule: Unused schemas
// ---------------------------------------------------------------------------

fn check_unused_schemas(
    definitions: &[SchemaDefinition],
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    // Collect all type references
    let mut referenced: HashSet<&str> = HashSet::new();

    for s in definitions {
        for field in &s.fields {
            if is_custom_type(&field.field_type) {
                referenced.insert(&field.field_type);
            }
        }
    }

    // Check each schema — if it's never referenced, warn
    for s in definitions {
        if !referenced.contains(s.name.as_str()) {
            let span = find_keyword_then_name(source, "schema", &s.name, 0)
                .unwrap_or(Span::new(0, s.name.len()));
            diags.push(LintDiagnostic {
                severity: Severity::Info,
                message: format!(
                    "Schema '{}' is defined but never referenced by any other definition.",
                    s.name
                ),
                span,
                rule: LintRule::UnusedSchema,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Rule: Invalid options for type
// ---------------------------------------------------------------------------

/// Valid options per type category.
const STRING_OPTIONS: &[&str] = &["encoding", "length", "fromEnd"];
const BYTE_OPTIONS: &[&str] = &["length", "fromEnd"];
const NO_OPTIONS: &[&str] = &[];

fn valid_options_for_type(field_type: &str) -> &'static [&'static str] {
    if is_string_type(field_type) {
        STRING_OPTIONS
    } else if is_byte_type(field_type) {
        BYTE_OPTIONS
    } else {
        NO_OPTIONS
    }
}

fn check_invalid_options(
    definitions: &[SchemaDefinition],
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    let all_fields = collect_all_fields(definitions);

    for field in &all_fields {
        if field.options.is_empty() {
            continue;
        }

        let valid = valid_options_for_type(&field.field_type);

        for key in field.options.keys() {
            if !valid.contains(&key.as_str()) {
                let span = find_identifier(source, key, 0).unwrap_or(Span::new(0, key.len()));

                if valid.is_empty() {
                    diags.push(LintDiagnostic {
                        severity: Severity::Warning,
                        message: format!(
                            "Option '{}' is not valid for type '{}'. This type does not accept any options.",
                            key, field.field_type
                        ),
                        span,
                        rule: LintRule::InvalidOptionForType,
                    });
                } else {
                    diags.push(LintDiagnostic {
                        severity: Severity::Warning,
                        message: format!(
                            "Option '{}' is not valid for type '{}'. Valid options: {}.",
                            key,
                            field.field_type,
                            valid.join(", ")
                        ),
                        span,
                        rule: LintRule::InvalidOptionForType,
                    });
                }
            }
        }

        // Check encoding values
        if let Some(enc) = field.options.get("encoding") {
            if let Some(enc_str) = enc.as_str() {
                if enc_str != "ascii" && enc_str != "utf8" {
                    let span = find_identifier(source, "encoding", 0).unwrap_or(Span::new(0, 8));
                    diags.push(LintDiagnostic {
                        severity: Severity::Warning,
                        message: format!(
                            "Unknown encoding '{}'. Expected 'ascii' or 'utf8'.",
                            enc_str
                        ),
                        span,
                        rule: LintRule::InvalidOptionForType,
                    });
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Rule: Invalid default values
// ---------------------------------------------------------------------------

fn check_invalid_defaults(
    definitions: &[SchemaDefinition],
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    let all_fields = collect_all_fields(definitions);

    for field in &all_fields {
        let default = match &field.default_value {
            Some(v) => v,
            None => continue,
        };

        let type_mismatch = match default {
            Value::String(_) => !is_string_type(&field.field_type),
            Value::Number(_) => !is_number_type(&field.field_type),
            Value::Bool(_) => !is_boolean_type(&field.field_type),
        };

        if type_mismatch {
            let expected = if is_string_type(&field.field_type) {
                "a string"
            } else if is_number_type(&field.field_type) {
                "a number"
            } else if is_boolean_type(&field.field_type) {
                "a boolean"
            } else {
                "a compatible value"
            };

            let span =
                find_identifier(source, &field.name, 0).unwrap_or(Span::new(0, field.name.len()));

            diags.push(LintDiagnostic {
                severity: Severity::Warning,
                message: format!(
                    "Default value for '{}' does not match type '{}'. Expected {}.",
                    field.name, field.field_type, expected
                ),
                span,
                rule: LintRule::InvalidDefaultValue,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Rule: Naming conventions
// ---------------------------------------------------------------------------

fn check_naming_conventions(
    definitions: &[SchemaDefinition],
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    for s in definitions {
        // Schema names should be PascalCase
        if !is_pascal_case(&s.name) {
            let span = find_keyword_then_name(source, "schema", &s.name, 0)
                .unwrap_or(Span::new(0, s.name.len()));
            diags.push(LintDiagnostic {
                severity: Severity::Info,
                message: format!(
                    "Schema name '{}' should be PascalCase (e.g., '{}').",
                    s.name,
                    to_pascal_case(&s.name)
                ),
                span,
                rule: LintRule::NamingConvention,
            });
        }

        // Field names should be camelCase
        for field in &s.fields {
            check_field_naming(field, source, diags);
        }
    }
}

fn check_field_naming(field: &FieldDefinition, source: &str, diags: &mut Vec<LintDiagnostic>) {
    if !is_camel_case(&field.name) {
        let span =
            find_identifier(source, &field.name, 0).unwrap_or(Span::new(0, field.name.len()));
        diags.push(LintDiagnostic {
            severity: Severity::Info,
            message: format!(
                "Field name '{}' should be camelCase (e.g., '{}').",
                field.name,
                to_camel_case(&field.name)
            ),
            span,
            rule: LintRule::NamingConvention,
        });
    }
}

/// PascalCase: starts with uppercase, no underscores, no all-caps
fn is_pascal_case(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let first = s.chars().next().unwrap();
    if !first.is_ascii_uppercase() {
        return false;
    }
    // Allow single-char names
    if s.len() == 1 {
        return true;
    }
    // No underscores
    if s.contains('_') {
        return false;
    }
    // Not ALL_CAPS
    if s.chars()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return false;
    }
    true
}

/// camelCase: starts with lowercase, no underscores
fn is_camel_case(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let first = s.chars().next().unwrap();
    if !first.is_ascii_lowercase() {
        return false;
    }
    !s.contains('_')
}

fn to_pascal_case(s: &str) -> String {
    s.split('_')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(c) => {
                    let upper: String = c.to_uppercase().collect();
                    upper + &chars.as_str().to_lowercase()
                }
                None => String::new(),
            }
        })
        .collect()
}

fn to_camel_case(s: &str) -> String {
    let pascal = to_pascal_case(s);
    let mut chars = pascal.chars();
    match chars.next() {
        Some(c) => {
            let lower: String = c.to_lowercase().collect();
            lower + chars.as_str()
        }
        None => String::new(),
    }
}

// ---------------------------------------------------------------------------
// Rule: Empty definitions
// ---------------------------------------------------------------------------

fn check_empty_definitions(
    definitions: &[SchemaDefinition],
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    for s in definitions {
        if s.fields.is_empty() {
            let span = find_keyword_then_name(source, "schema", &s.name, 0)
                .unwrap_or(Span::new(0, s.name.len()));
            diags.push(LintDiagnostic {
                severity: Severity::Warning,
                message: format!("Schema '{}' has no fields.", s.name),
                span,
                rule: LintRule::EmptyDefinition,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Collect all fields from all schemas.
fn collect_all_fields(definitions: &[SchemaDefinition]) -> Vec<&FieldDefinition> {
    let mut fields = Vec::new();
    for s in definitions {
        fields.extend(s.fields.iter());
    }
    fields
}

/// Find an identifier as a whole word in source text, starting from `start`.
fn find_identifier(source: &str, name: &str, start: usize) -> Option<Span> {
    if start >= source.len() || name.is_empty() {
        return None;
    }
    let search = &source[start..];
    let mut pos = 0;
    while let Some(idx) = search[pos..].find(name) {
        let abs = start + pos + idx;
        let before_ok = abs == 0 || {
            let b = source.as_bytes()[abs - 1];
            !b.is_ascii_alphanumeric() && b != b'_'
        };
        let after = abs + name.len();
        let after_ok = after >= source.len() || {
            let b = source.as_bytes()[after];
            !b.is_ascii_alphanumeric() && b != b'_'
        };
        if before_ok && after_ok {
            return Some(Span::new(abs, name.len()));
        }
        pos += idx + 1;
    }
    None
}

/// Find a name that appears after a keyword, e.g., `schema Person`.
/// Returns the span of the name, not the keyword.
fn find_keyword_then_name(source: &str, keyword: &str, name: &str, start: usize) -> Option<Span> {
    let kw_span = find_identifier(source, keyword, start)?;
    find_identifier(source, name, kw_span.end())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse;

    fn lint_source(source: &str) -> Vec<LintDiagnostic> {
        let (defs, _) = parse(source);
        lint(&defs, source)
    }

    fn has_rule(diags: &[LintDiagnostic], rule: LintRule) -> bool {
        diags.iter().any(|d| d.rule == rule)
    }

    fn count_rule(diags: &[LintDiagnostic], rule: LintRule) -> usize {
        diags.iter().filter(|d| d.rule == rule).count()
    }

    #[test]
    fn test_clean_source_minimal_warnings() {
        let diags = lint_source(
            "schema Person {\n  name string8\n  address Address\n}\n\nschema Address {\n  city string8\n}\n",
        );
        // No errors, only possible info-level
        assert!(
            !diags.iter().any(|d| d.severity == Severity::Error),
            "Clean source should have no errors: {:?}",
            diags
        );
    }

    #[test]
    fn test_duplicate_schema() {
        let diags = lint_source("schema Foo {\n  x uint8\n}\nschema Foo {\n  y uint8\n}\n");
        assert!(has_rule(&diags, LintRule::DuplicateSchemaName));
    }

    #[test]
    fn test_duplicate_field() {
        let diags = lint_source("schema Foo {\n  name string8\n  name uint8\n}\n");
        assert!(has_rule(&diags, LintRule::DuplicateFieldName));
    }

    #[test]
    fn test_undefined_type() {
        let diags = lint_source("schema Foo {\n  bar Baz\n}\n");
        assert!(has_rule(&diags, LintRule::UndefinedTypeRef));
    }

    #[test]
    fn test_unused_schema() {
        let diags = lint_source("schema Foo {\n  name string8\n}\nschema Bar {\n  age uint8\n}\n");
        // Both are unused (neither references the other)
        assert_eq!(count_rule(&diags, LintRule::UnusedSchema), 2);
    }

    #[test]
    fn test_used_schema_not_flagged() {
        let diags = lint_source(
            "schema Person {\n  addr Address\n}\nschema Address {\n  city string8\n}\n",
        );
        // Address is used by Person, so only Person is "unused" (it's the root)
        let unused: Vec<_> = diags
            .iter()
            .filter(|d| d.rule == LintRule::UnusedSchema)
            .collect();
        assert_eq!(unused.len(), 1);
        assert!(unused[0].message.contains("Person"));
    }

    #[test]
    fn test_invalid_option_on_number() {
        let diags = lint_source("schema Foo {\n  age uint8(encoding = \"ascii\")\n}\n");
        assert!(has_rule(&diags, LintRule::InvalidOptionForType));
    }

    #[test]
    fn test_valid_option_on_string() {
        let diags = lint_source("schema Foo {\n  name string8(encoding = \"ascii\")\n}\n");
        assert!(
            !has_rule(&diags, LintRule::InvalidOptionForType),
            "encoding on string8 should be valid"
        );
    }

    #[test]
    fn test_invalid_default_value() {
        let diags = lint_source("schema Foo {\n  age uint8 = \"hello\"\n}\n");
        assert!(has_rule(&diags, LintRule::InvalidDefaultValue));
    }

    #[test]
    fn test_valid_default_value() {
        let diags = lint_source("schema Foo {\n  name string8 = \"hello\"\n}\n");
        assert!(!has_rule(&diags, LintRule::InvalidDefaultValue));
    }

    #[test]
    fn test_naming_schema_not_pascal() {
        let diags = lint_source("schema foo_bar {\n  x uint8\n}\n");
        assert!(has_rule(&diags, LintRule::NamingConvention));
        let msg = &diags
            .iter()
            .find(|d| d.rule == LintRule::NamingConvention)
            .unwrap()
            .message;
        assert!(msg.contains("FooBar"), "Should suggest PascalCase: {}", msg);
    }

    #[test]
    fn test_naming_field_not_camel() {
        let diags = lint_source("schema Foo {\n  MyField uint8\n}\n");
        assert!(has_rule(&diags, LintRule::NamingConvention));
    }

    #[test]
    fn test_empty_schema() {
        let diags = lint_source("schema Foo {\n}\n");
        assert!(has_rule(&diags, LintRule::EmptyDefinition));
    }

    #[test]
    fn test_pascal_case_helper() {
        assert!(is_pascal_case("Person"));
        assert!(is_pascal_case("MyStruct"));
        assert!(!is_pascal_case("person"));
        assert!(!is_pascal_case("my_struct"));
        assert!(!is_pascal_case("ALLCAPS"));
    }

    #[test]
    fn test_camel_case_helper() {
        assert!(is_camel_case("name"));
        assert!(is_camel_case("firstName"));
        assert!(is_camel_case("isWizard"));
        assert!(!is_camel_case("Name"));
        assert!(!is_camel_case("first_name"));
    }
}
