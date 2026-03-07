use std::collections::HashMap;

use sia_schema_core::error::{LineIndex, Span};
use sia_schema_core::ir::*;

/// Information about a schema symbol for LSP features.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SchemaSymbol {
    /// The schema name.
    pub name: String,
    /// Span of the schema name in the source.
    pub name_span: Span,
    /// Span of the entire schema block.
    pub definition_span: Span,
    /// Fields in this schema.
    pub fields: Vec<FieldSymbol>,
}

/// Information about a field for LSP features.
#[derive(Debug, Clone)]
pub struct FieldSymbol {
    pub name: String,
    pub field_type: String,
    pub span: Span,
}

/// Information about a plugin symbol.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PluginSymbol {
    pub name: String,
    pub alias: String,
    pub name_span: Span,
    pub definition_span: Span,
    pub methods: Vec<MethodSymbol>,
}

/// Information about a method.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct MethodSymbol {
    pub name: String,
    pub span: Span,
}

/// A symbol table built from parsed definitions for LSP features.
#[derive(Debug, Default)]
pub struct SymbolTable {
    pub schemas: HashMap<String, SchemaSymbol>,
    pub plugins: HashMap<String, PluginSymbol>,
    /// Maps type references (field types) to the locations where they appear.
    pub type_references: Vec<TypeReference>,
}

/// A reference to a type (schema name) from a field.
#[derive(Debug, Clone)]
pub struct TypeReference {
    pub type_name: String,
    pub span: Span,
}

impl SymbolTable {
    /// Build a symbol table from definitions.
    ///
    /// Note: Since the parser doesn't currently track spans for individual
    /// fields and schemas at a fine-grained level, we use approximate spans
    /// based on searching the source text. A future improvement would be to
    /// have the parser emit spans for each AST node.
    pub fn from_definitions(definitions: &[Definition], source: &str) -> Self {
        let mut table = SymbolTable::default();
        let _line_index = LineIndex::new(source);

        for def in definitions {
            match def {
                Definition::Schema(schema) => {
                    // Find the schema name in the source
                    let name_span =
                        find_identifier_span(source, &schema.name, 0).unwrap_or(Span::new(0, 0));

                    let mut fields = Vec::new();
                    for field in &schema.fields {
                        let field_span = find_identifier_span(source, &field.name, name_span.end())
                            .unwrap_or(Span::new(0, 0));
                        fields.push(FieldSymbol {
                            name: field.name.clone(),
                            field_type: field.field_type.clone(),
                            span: field_span,
                        });

                        // Track type references for custom types
                        if is_custom_type(&field.field_type) {
                            let type_span =
                                find_identifier_span(source, &field.field_type, field_span.end())
                                    .unwrap_or(Span::new(0, 0));
                            table.type_references.push(TypeReference {
                                type_name: field.field_type.clone(),
                                span: type_span,
                            });
                        }
                    }

                    table.schemas.insert(
                        schema.name.clone(),
                        SchemaSymbol {
                            name: schema.name.clone(),
                            name_span,
                            definition_span: name_span, // Approximate
                            fields,
                        },
                    );
                }
                Definition::Plugin(plugin) => {
                    let name_span =
                        find_identifier_span(source, &plugin.alias, 0).unwrap_or(Span::new(0, 0));

                    let mut methods = Vec::new();
                    for method in &plugin.methods {
                        let method_span =
                            find_identifier_span(source, &method.name, name_span.end())
                                .unwrap_or(Span::new(0, 0));
                        methods.push(MethodSymbol {
                            name: method.name.clone(),
                            span: method_span,
                        });
                    }

                    table.plugins.insert(
                        plugin.alias.clone(),
                        PluginSymbol {
                            name: plugin.name.clone(),
                            alias: plugin.alias.clone(),
                            name_span,
                            definition_span: name_span,
                            methods,
                        },
                    );
                }
            }
        }

        table
    }
}

/// Find an identifier in source text starting from a given offset.
fn find_identifier_span(source: &str, name: &str, start: usize) -> Option<Span> {
    let search = &source[start..];
    // Look for the identifier as a whole word
    let mut pos = 0;
    while let Some(idx) = search[pos..].find(name) {
        let abs = start + pos + idx;
        let before_ok = abs == 0
            || !source.as_bytes()[abs - 1].is_ascii_alphanumeric()
                && source.as_bytes()[abs - 1] != b'_';
        let after = abs + name.len();
        let after_ok = after >= source.len()
            || !source.as_bytes()[after].is_ascii_alphanumeric()
                && source.as_bytes()[after] != b'_';
        if before_ok && after_ok {
            return Some(Span::new(abs, name.len()));
        }
        pos += idx + 1;
    }
    None
}

/// Get hover information for a type.
pub fn type_hover_info(type_name: &str) -> Option<String> {
    Some(match type_name {
        "string8" => "string8: variable-length string, 1-byte length prefix, max 255 bytes".into(),
        "string16" => {
            "string16: variable-length string, 2-byte length prefix, max 65,535 bytes".into()
        }
        "string32" => "string32: variable-length string, 4-byte length prefix, max ~4GB".into(),
        "string64" => "string64: variable-length string, 8-byte length prefix".into(),
        "string" => "string: encoding-specified string (requires encoding option)".into(),
        "stringN" => "stringN: fixed-length string".into(),
        "uint8" => "uint8: unsigned 8-bit integer (0 to 255)".into(),
        "uint16" => "uint16: unsigned 16-bit integer (0 to 65,535)".into(),
        "uint32" => "uint32: unsigned 32-bit integer (0 to 4,294,967,295)".into(),
        "uint64" => "uint64: unsigned 64-bit integer".into(),
        "int8" => "int8: signed 8-bit integer (-128 to 127)".into(),
        "int16" => "int16: signed 16-bit integer (-32,768 to 32,767)".into(),
        "int32" => "int32: signed 32-bit integer".into(),
        "int64" => "int64: signed 64-bit integer".into(),
        "bool" => "bool: boolean value (true/false)".into(),
        "byte8" => "byte8: variable-length byte array, 1-byte length prefix".into(),
        "byte16" => "byte16: variable-length byte array, 2-byte length prefix".into(),
        "byte32" => "byte32: variable-length byte array, 4-byte length prefix".into(),
        "byte64" => "byte64: variable-length byte array, 8-byte length prefix".into(),
        "byteN" => "byteN: fixed-length byte array (requires length option)".into(),
        _ => return None,
    })
}

/// Get all built-in type names for completion.
pub fn builtin_type_names() -> Vec<&'static str> {
    vec![
        "string8", "string16", "string32", "string64", "string", "stringN", "uint8", "uint16",
        "uint32", "uint64", "int8", "int16", "int32", "int64", "bool", "byte8", "byte16", "byte32",
        "byte64", "byteN",
    ]
}
