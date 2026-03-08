use std::collections::HashMap;

use crate::error::{Diagnostic, Span};
use crate::ir::*;
use crate::lexer::{SpannedToken, TokenKind};

/// Recursive descent parser for the Sia schema language.
pub struct Parser {
    tokens: Vec<SpannedToken>,
    pos: usize,
    diagnostics: Vec<Diagnostic>,
}

/// Result of parsing: schema definitions + diagnostics.
pub struct ParseResult {
    pub definitions: Vec<SchemaDefinition>,
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
                Some(TokenKind::Schema) => return,
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

    /// siaSchema = schema*
    fn parse_sia_schema(&mut self) -> Vec<SchemaDefinition> {
        let mut definitions = Vec::new();

        while !self.at_end() {
            match self.peek_kind() {
                Some(TokenKind::Schema) => {
                    if let Some(schema) = self.parse_schema() {
                        definitions.push(schema);
                    }
                }
                _ => {
                    let span = self.current_span();
                    self.diagnostics
                        .push(Diagnostic::error("Expected 'schema'", span));
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

        let s = &result.definitions[0];
        assert_eq!(s.name, "Foo");
        assert_eq!(s.fields.len(), 2);
        assert_eq!(s.fields[0].name, "name");
        assert_eq!(s.fields[0].field_type, "string8");
        assert_eq!(s.fields[1].name, "age");
        assert_eq!(s.fields[1].field_type, "int32");
    }

    #[test]
    fn test_optional_field() {
        let result = parse_source("schema Foo { name? string8 }");
        assert!(result.diagnostics.is_empty());
        assert!(result.definitions[0].fields[0].optional);
    }

    #[test]
    fn test_array_field() {
        let result = parse_source("schema Foo { tags string8[] }");
        assert!(result.diagnostics.is_empty());
        assert!(result.definitions[0].fields[0].is_array);
    }

    #[test]
    fn test_default_value() {
        let result = parse_source(r#"schema Foo { name string8 = "hello" }"#);
        assert!(result.diagnostics.is_empty());
        assert_eq!(
            result.definitions[0].fields[0].default_value,
            Some(Value::String("hello".into()))
        );
    }

    #[test]
    fn test_type_options() {
        let result = parse_source(r#"schema Foo { name string8(encoding = "ascii") }"#);
        assert!(result.diagnostics.is_empty());
        assert_eq!(
            result.definitions[0].fields[0].options.get("encoding"),
            Some(&Value::String("ascii".into()))
        );
    }

    #[test]
    fn test_keyword_as_field_name() {
        let result = parse_source("schema Foo { schema string8 }");
        assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
        assert_eq!(result.definitions[0].fields[0].name, "schema");
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
        assert_eq!(result.definitions.len(), 2); // 2 schemas
    }
}
