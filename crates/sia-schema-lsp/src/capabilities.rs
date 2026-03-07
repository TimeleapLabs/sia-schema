use std::collections::HashMap;

use tower_lsp::lsp_types::*;

use sia_schema_core::error::{LineIndex, Severity as SiaSeverity};
use sia_schema_core::ir::{is_custom_type, Definition};

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

/// Generate semantic diagnostics (undefined types, duplicate schemas).
pub fn semantic_diagnostics(
    definitions: &[Definition],
    line_index: &LineIndex,
    symbol_table: &SymbolTable,
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    // Check for duplicate schema names
    let mut seen_schemas: HashMap<&str, usize> = HashMap::new();
    for def in definitions {
        if let Definition::Schema(s) = def {
            if let Some(_prev) = seen_schemas.get(s.name.as_str()) {
                if let Some(sym) = symbol_table.schemas.get(&s.name) {
                    let (line, col) = line_index.line_col(sym.name_span.offset);
                    diagnostics.push(Diagnostic {
                        range: Range {
                            start: Position::new(line as u32, col as u32),
                            end: Position::new(line as u32, (col + sym.name_span.length) as u32),
                        },
                        severity: Some(DiagnosticSeverity::ERROR),
                        source: Some("sia-schema".into()),
                        message: format!("Duplicate schema name: '{}'", s.name),
                        ..Default::default()
                    });
                }
            } else {
                seen_schemas.insert(&s.name, 0);
            }
        }
    }

    // Check for undefined type references
    for type_ref in &symbol_table.type_references {
        if is_custom_type(&type_ref.type_name)
            && !symbol_table.schemas.contains_key(&type_ref.type_name)
        {
            let (line, col) = line_index.line_col(type_ref.span.offset);
            diagnostics.push(Diagnostic {
                range: Range {
                    start: Position::new(line as u32, col as u32),
                    end: Position::new(line as u32, (col + type_ref.span.length) as u32),
                },
                severity: Some(DiagnosticSeverity::WARNING),
                source: Some("sia-schema".into()),
                message: format!(
                    "Undefined type: '{}'. No schema with this name found.",
                    type_ref.type_name
                ),
                ..Default::default()
            });
        }
    }

    diagnostics
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
            items.push(CompletionItem {
                label: "plugin".into(),
                kind: Some(CompletionItemKind::KEYWORD),
                detail: Some("Define a new plugin".into()),
                insert_text: Some("plugin ${1:name} as ${2:Alias} {\n  $0\n}".into()),
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
        CompletionContext::InsidePlugin => {
            items.push(CompletionItem {
                label: "method".into(),
                kind: Some(CompletionItemKind::KEYWORD),
                detail: Some("Define a new method".into()),
                insert_text: Some(
                    "method ${1:name}(${2:timeout = 5000}) {\n  $0\n} returns {\n  \n}".into(),
                ),
                insert_text_format: Some(InsertTextFormat::SNIPPET),
                ..Default::default()
            });
        }
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
    definitions: &[Definition],
    line_index: &LineIndex,
    symbol_table: &SymbolTable,
) -> Vec<DocumentSymbol> {
    let mut symbols = Vec::new();

    for def in definitions {
        match def {
            Definition::Schema(s) => {
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
            Definition::Plugin(p) => {
                let plugin_sym = symbol_table.plugins.get(&p.alias);
                let name_span = plugin_sym
                    .map(|ps| ps.name_span)
                    .unwrap_or(sia_schema_core::error::Span::new(0, 0));
                let (line, col) = line_index.line_col(name_span.offset);

                let range = Range {
                    start: Position::new(line as u32, col as u32),
                    end: Position::new(line as u32, (col + name_span.length) as u32),
                };

                let children: Vec<DocumentSymbol> = p
                    .methods
                    .iter()
                    .enumerate()
                    .map(|(i, m)| {
                        let method_span = plugin_sym
                            .and_then(|ps| ps.methods.get(i))
                            .map(|ms| ms.span)
                            .unwrap_or(sia_schema_core::error::Span::new(0, 0));
                        let (ml, mc) = line_index.line_col(method_span.offset);
                        let mr = Range {
                            start: Position::new(ml as u32, mc as u32),
                            end: Position::new(ml as u32, (mc + method_span.length) as u32),
                        };

                        #[allow(deprecated)]
                        DocumentSymbol {
                            name: m.name.clone(),
                            detail: Some("method".into()),
                            kind: SymbolKind::METHOD,
                            range: mr,
                            selection_range: mr,
                            children: None,
                            tags: None,
                            deprecated: None,
                        }
                    })
                    .collect();

                #[allow(deprecated)]
                symbols.push(DocumentSymbol {
                    name: p.alias.clone(),
                    detail: Some(format!("plugin {}", p.name)),
                    kind: SymbolKind::CLASS,
                    range,
                    selection_range: range,
                    children: Some(children),
                    tags: None,
                    deprecated: None,
                });
            }
        }
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

/// Format a .sia document.
pub fn format_document(source: &str) -> Vec<TextEdit> {
    let line_index = LineIndex::new(source);
    let mut formatted = String::new();
    let mut indent = 0usize;

    for (_i, line) in source.lines().enumerate() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            formatted.push('\n');
            continue;
        }

        // Decrease indent for closing braces
        if trimmed.starts_with('}') {
            indent = indent.saturating_sub(1);
        }

        // Apply indent
        for _ in 0..indent {
            formatted.push_str("  ");
        }
        formatted.push_str(trimmed);
        formatted.push('\n');

        // Increase indent for opening braces
        if trimmed.ends_with('{') {
            indent += 1;
        }
    }

    // Return a single edit replacing the entire document
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
    InsidePlugin,
    Unknown,
}

fn determine_context(source: &str, offset: usize) -> CompletionContext {
    let before = &source[..offset.min(source.len())];

    // Count brace depth
    let mut depth = 0i32;
    let mut last_keyword = None;
    let mut in_plugin = false;

    for (i, ch) in before.char_indices() {
        if ch == '{' {
            depth += 1;
            if last_keyword == Some("plugin") {
                in_plugin = true;
            }
        } else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                in_plugin = false;
            }
        }

        // Track keywords (simple heuristic)
        if i + 6 <= before.len() && &before[i..i + 6] == "schema" {
            last_keyword = Some("schema");
        } else if i + 6 <= before.len() && &before[i..i + 6] == "plugin" {
            last_keyword = Some("plugin");
        }
    }

    if depth == 0 {
        CompletionContext::TopLevel
    } else if in_plugin && depth == 1 {
        CompletionContext::InsidePlugin
    } else if depth >= 1 {
        CompletionContext::FieldType
    } else {
        CompletionContext::Unknown
    }
}

fn get_word_at_offset<'a>(source: &'a str, offset: usize) -> Option<&'a str> {
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
