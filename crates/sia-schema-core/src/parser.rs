use std::collections::HashMap;

use crate::error::{Diagnostic, Span};
use crate::ir::*;
use crate::lexer::{SpannedToken, TokenKind};

use heck::{ToLowerCamelCase, ToPascalCase};

/// Recursive descent parser for the Sia schema language.
pub struct Parser {
    tokens: Vec<SpannedToken>,
    pos: usize,
    diagnostics: Vec<Diagnostic>,
}

/// Result of parsing: definitions + diagnostics.
pub struct ParseResult {
    pub definitions: Vec<Definition>,
    pub diagnostics: Vec<Diagnostic>,
}

impl Parser {
    pub fn new(tokens: Vec<SpannedToken>) -> Self {
        Self {
            tokens,
            pos: 0,
            diagnostics: Vec::new(),
        }
    }

    /// Parse the full source into definitions.
    pub fn parse(mut self) -> ParseResult {
        let definitions = self.parse_sia_schema();
        ParseResult {
            definitions,
            diagnostics: self.diagnostics,
        }
    }

    // -- Helpers --

    fn peek(&self) -> Option<&SpannedToken> {
        self.tokens.get(self.pos)
    }

    fn peek_kind(&self) -> Option<TokenKind> {
        self.peek().map(|t| t.kind)
    }

    fn advance(&mut self) -> Option<&SpannedToken> {
        let token = self.tokens.get(self.pos);
        if token.is_some() {
            self.pos += 1;
        }
        token
    }

    fn expect(&mut self, kind: TokenKind) -> Option<&SpannedToken> {
        if let Some(token) = self.peek() {
            if token.kind == kind {
                self.pos += 1;
                return self.tokens.get(self.pos - 1);
            }
            let span = token.span;
            self.diagnostics.push(Diagnostic::error(
                format!("Expected {:?}, found {:?}", kind, token.kind),
                span,
            ));
            None
        } else {
            let offset = self.tokens.last().map(|t| t.span.end()).unwrap_or(0);
            self.diagnostics.push(Diagnostic::error(
                format!("Expected {:?}, found end of file", kind),
                Span::new(offset, 0),
            ));
            None
        }
    }

    fn at(&self, kind: TokenKind) -> bool {
        self.peek_kind() == Some(kind)
    }

    fn at_end(&self) -> bool {
        self.pos >= self.tokens.len()
    }

    fn current_span(&self) -> Span {
        self.peek().map(|t| t.span).unwrap_or_else(|| {
            let offset = self.tokens.last().map(|t| t.span.end()).unwrap_or(0);
            Span::new(offset, 0)
        })
    }

    /// Skip tokens until we find a synchronization point.
    fn synchronize(&mut self) {
        while !self.at_end() {
            match self.peek_kind() {
                Some(TokenKind::Schema) | Some(TokenKind::Plugin) => return,
                Some(TokenKind::RCurly) => {
                    self.advance();
                    return;
                }
                _ => {
                    self.advance();
                }
            }
        }
    }

    // -- Grammar rules --

    /// siaSchema = (schema | plugin)*
    fn parse_sia_schema(&mut self) -> Vec<Definition> {
        let mut definitions = Vec::new();

        while !self.at_end() {
            match self.peek_kind() {
                Some(TokenKind::Schema) => {
                    if let Some(schema) = self.parse_schema() {
                        definitions.push(Definition::Schema(schema));
                    }
                }
                Some(TokenKind::Plugin) => {
                    if let Some(plugin) = self.parse_plugin() {
                        definitions.push(Definition::Plugin(plugin));
                    }
                }
                _ => {
                    let span = self.current_span();
                    self.diagnostics
                        .push(Diagnostic::error("Expected 'schema' or 'plugin'", span));
                    self.synchronize();
                }
            }
        }

        definitions
    }

    /// schema = "schema" Identifier "{" field* "}"
    fn parse_schema(&mut self) -> Option<SchemaDefinition> {
        self.expect(TokenKind::Schema)?;

        let name_token = self.expect(TokenKind::Identifier)?;
        let name = name_token.text.clone();

        self.expect(TokenKind::LCurly)?;

        let mut fields = Vec::new();
        while !self.at(TokenKind::RCurly) && !self.at_end() {
            if let Some(field) = self.parse_field() {
                fields.push(field);
            } else {
                // Skip to next field or closing brace
                self.advance();
            }
        }

        self.expect(TokenKind::RCurly)?;

        Some(SchemaDefinition { name, fields })
    }

    /// plugin = "plugin" pluginName [asName] "{" method* "}"
    fn parse_plugin(&mut self) -> Option<PluginDefinition> {
        self.expect(TokenKind::Plugin)?;

        let name = self.parse_plugin_name()?;

        let alias = if self.at(TokenKind::As) {
            self.parse_as_name()?
        } else {
            name.to_pascal_case()
        };

        self.expect(TokenKind::LCurly)?;

        let mut methods = Vec::new();
        while !self.at(TokenKind::RCurly) && !self.at_end() {
            if self.at(TokenKind::Method) {
                if let Some(method) = self.parse_method() {
                    methods.push(method);
                }
            } else {
                let span = self.current_span();
                self.diagnostics.push(Diagnostic::error(
                    "Expected 'method' inside plugin block",
                    span,
                ));
                self.advance();
            }
        }

        self.expect(TokenKind::RCurly)?;

        Some(PluginDefinition {
            name,
            alias,
            methods,
        })
    }

    /// pluginName = Identifier ("." Identifier)*
    fn parse_plugin_name(&mut self) -> Option<String> {
        let first = self.expect(TokenKind::Identifier)?;
        let mut name = first.text.clone();

        while self.at(TokenKind::Dot) {
            self.advance(); // consume '.'
            let part = self.expect(TokenKind::Identifier)?;
            name.push('.');
            name.push_str(&part.text);
        }

        Some(name)
    }

    /// asName = "as" Identifier
    fn parse_as_name(&mut self) -> Option<String> {
        self.expect(TokenKind::As)?;
        let name = self.expect(TokenKind::Identifier)?;
        Some(name.text.clone())
    }

    /// method = "method" Identifier [typeOptions] params "returns" returns
    fn parse_method(&mut self) -> Option<MethodDefinition> {
        self.expect(TokenKind::Method)?;

        let name_token = self.expect(TokenKind::Identifier)?;
        let name = name_token.text.clone();

        let options = if self.at(TokenKind::LParen) {
            self.parse_type_options()
        } else {
            HashMap::new()
        };

        let fields = self.parse_params()?;

        self.expect(TokenKind::Returns)?;

        let returns = self.parse_returns()?;

        Some(MethodDefinition {
            name,
            fields,
            returns,
            options,
        })
    }

    /// params = "{" field* "}" | Identifier
    fn parse_params(&mut self) -> Option<MethodParams> {
        if self.at(TokenKind::LCurly) {
            self.advance(); // consume '{'
            let mut fields = Vec::new();
            while !self.at(TokenKind::RCurly) && !self.at_end() {
                if let Some(field) = self.parse_field() {
                    fields.push(field);
                } else {
                    self.advance();
                }
            }
            self.expect(TokenKind::RCurly)?;
            Some(MethodParams::Fields(fields))
        } else if self.at(TokenKind::Identifier) {
            let token = self.advance().unwrap();
            let type_name = token.text.clone();
            let field_name = type_name.to_lower_camel_case();
            Some(MethodParams::Reference(FieldDefinition {
                name: field_name,
                field_type: type_name,
                optional: false,
                is_array: false,
                default_value: None,
                options: HashMap::new(),
            }))
        } else {
            let span = self.current_span();
            self.diagnostics.push(Diagnostic::error(
                "Expected '{' or type name for method params",
                span,
            ));
            None
        }
    }

    /// returns = "returns" ( "{" field* "}" | Identifier )
    fn parse_returns(&mut self) -> Option<MethodParams> {
        // Same structure as params
        self.parse_params()
    }

    /// field = Identifier ["?"] Identifier [typeOptions] ["[]"] ["=" defaultValue]
    fn parse_field(&mut self) -> Option<FieldDefinition> {
        // Field name
        if !self.at(TokenKind::Identifier) {
            return None;
        }
        let name_token = self.advance().unwrap();
        let name = name_token.text.clone();

        // Optional marker
        let optional = if self.at(TokenKind::Question) {
            self.advance();
            true
        } else {
            false
        };

        // Field type
        let type_token = self.expect(TokenKind::Identifier)?;
        let field_type = type_token.text.clone();

        // Type options
        let options = if self.at(TokenKind::LParen) {
            self.parse_type_options()
        } else {
            HashMap::new()
        };

        // Array marker
        let is_array = if self.at(TokenKind::LSquare) {
            self.advance(); // [
            self.expect(TokenKind::RSquare)?; // ]
            true
        } else {
            false
        };

        // Default value
        let default_value = if self.at(TokenKind::Equals) {
            self.advance(); // =
            Some(self.parse_default_value()?)
        } else {
            None
        };

        Some(FieldDefinition {
            name,
            field_type,
            optional,
            is_array,
            default_value,
            options,
        })
    }

    /// typeOptions = "(" Identifier "=" (StringLiteral | NumberLiteral)
    ///               ("," Identifier "=" (StringLiteral | NumberLiteral))* ")"
    fn parse_type_options(&mut self) -> HashMap<String, Value> {
        let mut options = HashMap::new();

        if self.expect(TokenKind::LParen).is_none() {
            return options;
        }

        loop {
            if self.at(TokenKind::RParen) || self.at_end() {
                break;
            }

            let key_token = match self.expect(TokenKind::Identifier) {
                Some(t) => t.text.clone(),
                None => break,
            };

            if self.expect(TokenKind::Equals).is_none() {
                break;
            }

            let value = match self.peek_kind() {
                Some(TokenKind::StringLiteral) => {
                    let token = self.advance().unwrap();
                    // Strip quotes
                    let s = &token.text[1..token.text.len() - 1];
                    Value::String(s.to_string())
                }
                Some(TokenKind::NumberLiteral) => {
                    let token = self.advance().unwrap();
                    let n: f64 = token.text.parse().unwrap_or(0.0);
                    Value::Number(n)
                }
                Some(TokenKind::Identifier) => {
                    let token = self.advance().unwrap();
                    Value::String(token.text.clone())
                }
                _ => {
                    let span = self.current_span();
                    self.diagnostics.push(Diagnostic::error(
                        "Expected string, number, or identifier value in type option",
                        span,
                    ));
                    break;
                }
            };

            options.insert(key_token, value);

            if self.at(TokenKind::Comma) {
                self.advance(); // consume ','
            }
        }

        self.expect(TokenKind::RParen);

        options
    }

    /// defaultValue = StringLiteral | NumberLiteral | Identifier
    fn parse_default_value(&mut self) -> Option<Value> {
        match self.peek_kind() {
            Some(TokenKind::StringLiteral) => {
                let token = self.advance().unwrap();
                let s = &token.text[1..token.text.len() - 1];
                Some(Value::String(s.to_string()))
            }
            Some(TokenKind::NumberLiteral) => {
                let token = self.advance().unwrap();
                let n: f64 = token.text.parse().unwrap_or(0.0);
                Some(Value::Number(n))
            }
            Some(TokenKind::Identifier) => {
                let token = self.advance().unwrap();
                // "true" / "false" become bools
                match token.text.as_str() {
                    "true" => Some(Value::Bool(true)),
                    "false" => Some(Value::Bool(false)),
                    _ => Some(Value::String(token.text.clone())),
                }
            }
            _ => {
                let span = self.current_span();
                self.diagnostics.push(Diagnostic::error(
                    "Expected default value (string, number, or identifier)",
                    span,
                ));
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::tokenize;

    fn parse_source(source: &str) -> ParseResult {
        let (tokens, lex_errors) = tokenize(source);
        assert!(lex_errors.is_empty(), "Lex errors: {:?}", lex_errors);
        Parser::new(tokens).parse()
    }

    #[test]
    fn test_simple_schema() {
        let result = parse_source("schema Foo { name string8 age int32 }");
        assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
        assert_eq!(result.definitions.len(), 1);

        if let Definition::Schema(s) = &result.definitions[0] {
            assert_eq!(s.name, "Foo");
            assert_eq!(s.fields.len(), 2);
            assert_eq!(s.fields[0].name, "name");
            assert_eq!(s.fields[0].field_type, "string8");
            assert_eq!(s.fields[1].name, "age");
            assert_eq!(s.fields[1].field_type, "int32");
        } else {
            panic!("Expected schema");
        }
    }

    #[test]
    fn test_optional_field() {
        let result = parse_source("schema Foo { name? string8 }");
        assert!(result.diagnostics.is_empty());
        if let Definition::Schema(s) = &result.definitions[0] {
            assert!(s.fields[0].optional);
        }
    }

    #[test]
    fn test_array_field() {
        let result = parse_source("schema Foo { tags string8[] }");
        assert!(result.diagnostics.is_empty());
        if let Definition::Schema(s) = &result.definitions[0] {
            assert!(s.fields[0].is_array);
        }
    }

    #[test]
    fn test_default_value() {
        let result = parse_source(r#"schema Foo { name string8 = "hello" }"#);
        assert!(result.diagnostics.is_empty());
        if let Definition::Schema(s) = &result.definitions[0] {
            assert_eq!(
                s.fields[0].default_value,
                Some(Value::String("hello".into()))
            );
        }
    }

    #[test]
    fn test_type_options() {
        let result = parse_source(r#"schema Foo { name string8(encoding = "ascii") }"#);
        assert!(result.diagnostics.is_empty());
        if let Definition::Schema(s) = &result.definitions[0] {
            assert_eq!(
                s.fields[0].options.get("encoding"),
                Some(&Value::String("ascii".into()))
            );
        }
    }

    #[test]
    fn test_plugin() {
        let result = parse_source(
            r#"plugin swiss.timeleap.v1 as Sorcery {
                method test(timeout = 5000) {
                    name string8
                } returns {
                    ok bool
                }
            }"#,
        );
        assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);

        if let Definition::Plugin(p) = &result.definitions[0] {
            assert_eq!(p.name, "swiss.timeleap.v1");
            assert_eq!(p.alias, "Sorcery");
            assert_eq!(p.methods.len(), 1);
            assert_eq!(p.methods[0].name, "test");
            assert_eq!(
                p.methods[0].options.get("timeout"),
                Some(&Value::Number(5000.0))
            );
        } else {
            panic!("Expected plugin");
        }
    }

    #[test]
    fn test_keyword_as_field_name() {
        let result = parse_source("schema Foo { schema string8 method int32 returns bool }");
        assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
        if let Definition::Schema(s) = &result.definitions[0] {
            assert_eq!(s.fields[0].name, "schema");
            assert_eq!(s.fields[1].name, "method");
            assert_eq!(s.fields[2].name, "returns");
        }
    }

    #[test]
    fn test_multiple_definitions() {
        let result = parse_source("schema Foo { name string8 } schema Bar { age int32 }");
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.definitions.len(), 2);
    }

    #[test]
    fn test_error_recovery() {
        let result = parse_source("schema { } schema Bar { name string8 }");
        // Should have an error for the first schema (missing name)
        assert!(!result.diagnostics.is_empty());
        // But should still parse the second schema
        assert!(!result.definitions.is_empty());
    }

    #[test]
    fn test_sample_sia() {
        let source = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/sample.sia"
        ))
        .unwrap();
        let result = parse_source(&source);
        assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
        assert_eq!(result.definitions.len(), 3); // 2 schemas + 1 plugin
    }
}
