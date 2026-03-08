use std::collections::HashMap;

use tower_lsp::lsp_types::*;

use sia_schema_core::error::{LineIndex, Severity as SiaSeverity};
use sia_schema_core::ir::SchemaDefinition;

use crate::symbols::{self, SymbolTable};

/// Convert Sia diagnostics to LSP diagnostics.
pub fn to_lsp_diagnostics(
    diagnostics: &[sia_schema_core::error::Diagnostic],
    line_index: &LineIndex,
) -> Vec<Diagnostic> {
    diagnostics
        .iter()
        .map(|d| {
            let (start_line, start_col) = line_index.line_col(d.span.offset);
            let (end_line, end_col) = line_index.line_col(d.span.end());

            Diagnostic {
                range: Range {
                    start: Position::new(start_line as u32, start_col as u32),
                    end: Position::new(end_line as u32, end_col as u32),
                },
                severity: Some(match d.severity {
                    SiaSeverity::Error => DiagnosticSeverity::ERROR,
                    SiaSeverity::Warning => DiagnosticSeverity::WARNING,
                    SiaSeverity::Info => DiagnosticSeverity::INFORMATION,
                }),
                source: Some("sia-schema".into()),
                message: d.message.clone(),
                ..Default::default()
            }
        })
        .collect()
}

/// Generate semantic diagnostics using the core linter.
pub fn semantic_diagnostics(
    definitions: &[SchemaDefinition],
    source: &str,
    line_index: &LineIndex,
) -> Vec<Diagnostic> {
    let lint_diags = sia_schema_core::linter::lint(definitions, source);

    lint_diags
        .into_iter()
        .map(|d| {
            let (start_line, start_col) = line_index.line_col(d.span.offset);
            let (end_line, end_col) = line_index.line_col(d.span.end());

            Diagnostic {
                range: Range {
                    start: Position::new(start_line as u32, start_col as u32),
                    end: Position::new(end_line as u32, end_col as u32),
                },
                severity: Some(match d.severity {
                    SiaSeverity::Error => DiagnosticSeverity::ERROR,
                    SiaSeverity::Warning => DiagnosticSeverity::WARNING,
                    SiaSeverity::Info => DiagnosticSeverity::INFORMATION,
                }),
                source: Some("sia-schema".into()),
                message: d.message,
                code: Some(NumberOrString::String(d.rule.to_string())),
                ..Default::default()
            }
        })
        .collect()
}

/// Get completion items at a given position.
pub fn completions(
    source: &str,
    position: Position,
    symbol_table: &SymbolTable,
) -> Vec<CompletionItem> {
    let line_index = LineIndex::new(source);
    let offset = line_index.line_start(position.line as usize) + position.character as usize;

    // Determine context: are we at a type position or a top-level position?
    let context = determine_context(source, offset);

    let mut items = Vec::new();

    match context {
        CompletionContext::TopLevel => {
            items.push(CompletionItem {
                label: "schema".into(),
                kind: Some(CompletionItemKind::KEYWORD),
                detail: Some("Define a new schema".into()),
                insert_text: Some("schema ${1:Name} {\n  $0\n}".into()),
                insert_text_format: Some(InsertTextFormat::SNIPPET),
                ..Default::default()
            });
        }
        CompletionContext::FieldType | CompletionContext::Unknown => {
            // Built-in types
            for type_name in symbols::builtin_type_names() {
                items.push(CompletionItem {
                    label: type_name.into(),
                    kind: Some(CompletionItemKind::TYPE_PARAMETER),
                    detail: symbols::type_hover_info(type_name),
                    ..Default::default()
                });
            }
            // User-defined schema names
            for schema_name in symbol_table.schemas.keys() {
                items.push(CompletionItem {
                    label: schema_name.clone(),
                    kind: Some(CompletionItemKind::STRUCT),
                    detail: Some(format!("Schema: {}", schema_name)),
                    ..Default::default()
                });
            }
        }
        CompletionContext::FieldOptionKey => {
            for (key, detail) in [
                (
                    "encoding",
                    "String encoding: \"ascii\" or \"utf8\" (default)",
                ),
                ("length", "Fixed byte length for the field"),
                ("fromEnd", "Offset from the end of the buffer"),
            ] {
                items.push(CompletionItem {
                    label: key.into(),
                    kind: Some(CompletionItemKind::PROPERTY),
                    detail: Some(detail.into()),
                    insert_text: Some(format!("{} = $0", key)),
                    insert_text_format: Some(InsertTextFormat::SNIPPET),
                    ..Default::default()
                });
            }
        }
        CompletionContext::FieldOptionValue { ref key } => match key.as_str() {
            "encoding" => {
                for val in ["\"ascii\"", "\"utf8\""] {
                    items.push(CompletionItem {
                        label: val.into(),
                        kind: Some(CompletionItemKind::VALUE),
                        detail: Some("String encoding".into()),
                        ..Default::default()
                    });
                }
            }
            "fromEnd" | "length" => {
                items.push(CompletionItem {
                    label: "0".into(),
                    kind: Some(CompletionItemKind::VALUE),
                    detail: Some(format!("Numeric value for {}", key)),
                    insert_text: Some("${0:0}".into()),
                    insert_text_format: Some(InsertTextFormat::SNIPPET),
                    ..Default::default()
                });
            }
            _ => {}
        },
    }

    items
}

/// Get hover info for a position.
pub fn hover(source: &str, position: Position, symbol_table: &SymbolTable) -> Option<Hover> {
    let line_index = LineIndex::new(source);
    let offset = line_index.line_start(position.line as usize) + position.character as usize;

    let word = get_word_at_offset(source, offset)?;

    // Check builtin types
    if let Some(info) = symbols::type_hover_info(word) {
        return Some(Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value: format!("```\n{}\n```", info),
            }),
            range: None,
        });
    }

    // Check schema names
    if let Some(schema) = symbol_table.schemas.get(word) {
        let fields: Vec<String> = schema
            .fields
            .iter()
            .map(|f| format!("  {} {}", f.name, f.field_type))
            .collect();
        return Some(Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value: format!("```sia\nschema {} {{\n{}\n}}\n```", word, fields.join("\n")),
            }),
            range: None,
        });
    }

    None
}

/// Get go-to-definition location.
pub fn goto_definition(
    source: &str,
    position: Position,
    symbol_table: &SymbolTable,
    uri: &Url,
) -> Option<GotoDefinitionResponse> {
    let line_index = LineIndex::new(source);
    let offset = line_index.line_start(position.line as usize) + position.character as usize;

    let word = get_word_at_offset(source, offset)?;

    if let Some(schema) = symbol_table.schemas.get(word) {
        let (line, col) = line_index.line_col(schema.name_span.offset);
        return Some(GotoDefinitionResponse::Scalar(Location {
            uri: uri.clone(),
            range: Range {
                start: Position::new(line as u32, col as u32),
                end: Position::new(line as u32, (col + schema.name_span.length) as u32),
            },
        }));
    }

    None
}

/// Get document symbols.
pub fn document_symbols(
    definitions: &[SchemaDefinition],
    line_index: &LineIndex,
    symbol_table: &SymbolTable,
) -> Vec<DocumentSymbol> {
    let mut symbols = Vec::new();

    for s in definitions {
        let schema_sym = symbol_table.schemas.get(&s.name);
        let name_span = schema_sym
            .map(|sy| sy.name_span)
            .unwrap_or(sia_schema_core::error::Span::new(0, 0));
        let (line, col) = line_index.line_col(name_span.offset);

        let range = Range {
            start: Position::new(line as u32, col as u32),
            end: Position::new(line as u32, (col + name_span.length) as u32),
        };

        let children: Vec<DocumentSymbol> = s
            .fields
            .iter()
            .enumerate()
            .map(|(i, f)| {
                let field_span = schema_sym
                    .and_then(|sy| sy.fields.get(i))
                    .map(|fs| fs.span)
                    .unwrap_or(sia_schema_core::error::Span::new(0, 0));
                let (fl, fc) = line_index.line_col(field_span.offset);
                let fr = Range {
                    start: Position::new(fl as u32, fc as u32),
                    end: Position::new(fl as u32, (fc + field_span.length) as u32),
                };

                #[allow(deprecated)]
                DocumentSymbol {
                    name: f.name.clone(),
                    detail: Some(f.field_type.clone()),
                    kind: SymbolKind::FIELD,
                    range: fr,
                    selection_range: fr,
                    children: None,
                    tags: None,
                    deprecated: None,
                }
            })
            .collect();

        #[allow(deprecated)]
        symbols.push(DocumentSymbol {
            name: s.name.clone(),
            detail: Some("schema".into()),
            kind: SymbolKind::STRUCT,
            range,
            selection_range: range,
            children: Some(children),
            tags: None,
            deprecated: None,
        });
    }

    symbols
}

/// Prepare rename: find the word under cursor and check if it's renameable.
pub fn prepare_rename(
    source: &str,
    position: Position,
    symbol_table: &SymbolTable,
) -> Option<PrepareRenameResponse> {
    let line_index = LineIndex::new(source);
    let offset = line_index.line_start(position.line as usize) + position.character as usize;
    let word = get_word_at_offset(source, offset)?;

    // Only allow renaming schema names
    if symbol_table.schemas.contains_key(word) {
        let span = symbol_table.schemas[word].name_span;
        let (line, col) = line_index.line_col(span.offset);
        return Some(PrepareRenameResponse::Range(Range {
            start: Position::new(line as u32, col as u32),
            end: Position::new(line as u32, (col + span.length) as u32),
        }));
    }

    None
}

/// Perform rename: rename a schema and update all references.
pub fn rename(
    source: &str,
    position: Position,
    new_name: &str,
    symbol_table: &SymbolTable,
    uri: &Url,
) -> Option<WorkspaceEdit> {
    let line_index = LineIndex::new(source);
    let offset = line_index.line_start(position.line as usize) + position.character as usize;
    let word = get_word_at_offset(source, offset)?;

    if !symbol_table.schemas.contains_key(word) {
        return None;
    }

    let mut edits: Vec<TextEdit> = Vec::new();

    // Rename the schema definition
    if let Some(schema) = symbol_table.schemas.get(word) {
        let (line, col) = line_index.line_col(schema.name_span.offset);
        edits.push(TextEdit {
            range: Range {
                start: Position::new(line as u32, col as u32),
                end: Position::new(line as u32, (col + schema.name_span.length) as u32),
            },
            new_text: new_name.into(),
        });
    }

    // Rename all type references
    for type_ref in &symbol_table.type_references {
        if type_ref.type_name == word {
            let (line, col) = line_index.line_col(type_ref.span.offset);
            edits.push(TextEdit {
                range: Range {
                    start: Position::new(line as u32, col as u32),
                    end: Position::new(line as u32, (col + type_ref.span.length) as u32),
                },
                new_text: new_name.into(),
            });
        }
    }

    let mut changes = HashMap::new();
    changes.insert(uri.clone(), edits);

    Some(WorkspaceEdit {
        changes: Some(changes),
        ..Default::default()
    })
}

/// Format a .sia document using the core formatter.
pub fn format_document(source: &str) -> Vec<TextEdit> {
    let formatted = sia_schema_core::formatter::format(source);

    // Return a single edit replacing the entire document
    let line_index = LineIndex::new(source);
    let last_line = line_index.line_count().saturating_sub(1);
    let last_col = source.lines().last().map(|l| l.len()).unwrap_or(0);

    vec![TextEdit {
        range: Range {
            start: Position::new(0, 0),
            end: Position::new(last_line as u32, last_col as u32),
        },
        new_text: formatted,
    }]
}

// -- Helpers --

#[derive(Debug)]
enum CompletionContext {
    TopLevel,
    FieldType,
    /// Inside parentheses after a field type, e.g. `string8(|)`
    FieldOptionKey,
    /// After `=` inside field type options, e.g. `string8(encoding = |)`
    FieldOptionValue {
        key: String,
    },
    Unknown,
}

fn determine_context(source: &str, offset: usize) -> CompletionContext {
    let before = &source[..offset.min(source.len())];

    // Count brace and paren depth
    let mut brace_depth = 0i32;
    let mut paren_depth = 0i32;
    // Track the position where the current paren group opened
    let mut paren_open_pos = 0usize;

    for (i, ch) in before.char_indices() {
        match ch {
            '{' => {
                brace_depth += 1;
            }
            '}' => {
                brace_depth -= 1;
            }
            '(' => {
                paren_depth += 1;
                paren_open_pos = i;
            }
            ')' => {
                paren_depth -= 1;
            }
            _ => {}
        }
    }

    // If we're inside parentheses, determine if it's field options
    if paren_depth > 0 {
        let inside_parens = &before[paren_open_pos + 1..];
        return determine_paren_context(inside_parens);
    }

    if brace_depth == 0 {
        CompletionContext::TopLevel
    } else if brace_depth >= 1 {
        CompletionContext::FieldType
    } else {
        CompletionContext::Unknown
    }
}

/// Determine completion context when cursor is inside parentheses.
/// `inside` is the text between the opening `(` and the cursor.
fn determine_paren_context(inside: &str) -> CompletionContext {
    let trimmed = inside.trim();

    // Check if we're after an `=` sign (suggesting a value)
    // Find the last `=` that isn't inside quotes
    let mut last_eq_pos = None;
    let mut in_string = false;
    for (i, ch) in trimmed.char_indices() {
        if ch == '"' {
            in_string = !in_string;
        } else if ch == '=' && !in_string {
            last_eq_pos = Some(i);
        } else if ch == ',' && !in_string {
            // Reset after comma — we're on a new option
            last_eq_pos = None;
        }
    }

    if let Some(eq_pos) = last_eq_pos {
        // We're after an `=`, extract the key name
        let before_eq = trimmed[..eq_pos].trim();
        // The key is the last word before `=` (after the last comma or start)
        let key = before_eq
            .rsplit(',')
            .next()
            .unwrap_or(before_eq)
            .trim()
            .to_string();

        CompletionContext::FieldOptionValue { key }
    } else {
        CompletionContext::FieldOptionKey
    }
}

fn get_word_at_offset(source: &str, offset: usize) -> Option<&str> {
    if offset >= source.len() {
        return None;
    }

    let bytes = source.as_bytes();

    // Find word start
    let mut start = offset;
    while start > 0 && (bytes[start - 1].is_ascii_alphanumeric() || bytes[start - 1] == b'_') {
        start -= 1;
    }

    // Find word end
    let mut end = offset;
    while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_') {
        end += 1;
    }

    if start == end {
        return None;
    }

    Some(&source[start..end])
}
