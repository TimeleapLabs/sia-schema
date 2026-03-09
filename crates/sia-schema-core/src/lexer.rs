/*!
 * Lexer for the Sia schema language.
 *
 * Uses the [`logos`] crate for fast tokenization. After lexing, a post-lex
 * pass demotes keywords to identifiers inside `schema { }` blocks so that
 * fields can use reserved words as names.
 */

use crate::error::Span;
use logos::Logos;

/** Token types for the Sia schema language. */
#[derive(Logos, Debug, Clone, Copy, PartialEq, Eq)]
#[logos(skip r"[ \t\r\n\f]+")]
#[logos(skip r"//[^\n]*")]
#[logos(skip r"/\*[^*]*\*+(?:[^/*][^*]*\*+)*/")]
pub enum TokenKind {
    #[token("schema")]
    Schema,

    #[regex(r"[a-zA-Z_][a-zA-Z0-9_]*")]
    Identifier,

    #[regex(r#""([^"\\]|\\.)*""#)]
    StringLiteral,

    #[regex(r"-?[0-9]+(\.[0-9]+)?")]
    NumberLiteral,

    #[token("=")]
    Equals,
    #[token("{")]
    LCurly,
    #[token("}")]
    RCurly,
    #[token("(")]
    LParen,
    #[token(")")]
    RParen,
    #[token("[")]
    LSquare,
    #[token("]")]
    RSquare,
    #[token("?")]
    Question,
    #[token(",")]
    Comma,
}

impl TokenKind {
    /** Returns `true` if this token is a language keyword. */
    pub fn is_keyword(self) -> bool {
        matches!(self, TokenKind::Schema)
    }
}

/** A token with its kind, source span, and original text. */
#[derive(Debug, Clone)]
pub struct SpannedToken {
    pub kind: TokenKind,
    pub span: Span,
    pub text: String,
}

/**
 * Tokenize source code into a list of spanned tokens.
 *
 * Returns `(tokens, diagnostics)` where diagnostics contain spans of
 * unrecognized input. Runs the keyword demotion pass before returning.
 */
pub fn tokenize(source: &str) -> (Vec<SpannedToken>, Vec<crate::error::Diagnostic>) {
    let mut tokens = Vec::new();
    let mut errors = Vec::new();
    let mut lexer = TokenKind::lexer(source);

    while let Some(result) = lexer.next() {
        let logos_span = lexer.span();
        let span = Span::new(logos_span.start, logos_span.end - logos_span.start);
        let text = lexer.slice().to_string();

        match result {
            Ok(kind) => {
                tokens.push(SpannedToken { kind, span, text });
            }
            Err(()) => {
                errors.push(crate::error::Diagnostic::error(
                    format!("Unexpected character: {:?}", &source[logos_span.clone()]),
                    span,
                ));
            }
        }
    }

    // Post-lex pass: demote keywords to identifiers inside schema {} blocks.
    demote_keywords_in_blocks(&mut tokens);

    (tokens, errors)
}

/**
 * Demote keywords to identifiers inside `schema { ... }` blocks.
 *
 * This allows fields to use reserved words like "schema" as names.
 * Replicates the original TypeScript compiler's post-tokenization behavior.
 */
fn demote_keywords_in_blocks(tokens: &mut [SpannedToken]) {
    let mut maybe_field_def = false;
    let mut in_field_def = false;

    for token in tokens.iter_mut() {
        if in_field_def && token.kind.is_keyword() {
            token.kind = TokenKind::Identifier;
            continue;
        }

        if !in_field_def && token.kind == TokenKind::Schema {
            maybe_field_def = true;
            continue;
        }

        match token.kind {
            TokenKind::RCurly => {
                in_field_def = false;
                maybe_field_def = false;
            }
            TokenKind::LCurly if maybe_field_def => {
                in_field_def = true;
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_tokens() {
        let source = r#"schema Foo { name string8 }"#;
        let (tokens, errors) = tokenize(source);
        assert!(errors.is_empty());
        assert_eq!(tokens.len(), 6);
        assert_eq!(tokens[0].kind, TokenKind::Schema);
        assert_eq!(tokens[1].kind, TokenKind::Identifier);
        assert_eq!(tokens[1].text, "Foo");
        assert_eq!(tokens[2].kind, TokenKind::LCurly);
        // "name" and "string8" inside {} are identifiers
        assert_eq!(tokens[3].kind, TokenKind::Identifier);
        assert_eq!(tokens[3].text, "name");
        assert_eq!(tokens[4].kind, TokenKind::Identifier);
        assert_eq!(tokens[4].text, "string8");
        assert_eq!(tokens[5].kind, TokenKind::RCurly);
    }

    #[test]
    fn test_keyword_demotion_in_schema_block() {
        let source = r#"schema Foo { schema string8 }"#;
        let (tokens, errors) = tokenize(source);
        assert!(errors.is_empty());
        // "schema" after { should be demoted to Identifier
        assert_eq!(tokens[0].kind, TokenKind::Schema); // top-level schema keyword
        assert_eq!(tokens[2].kind, TokenKind::LCurly);
        assert_eq!(tokens[3].kind, TokenKind::Identifier); // "schema" as field name
        assert_eq!(tokens[3].text, "schema");
    }

    #[test]
    fn test_comments_skipped() {
        let source = "// line comment\nschema Foo { /* block */ name string8 }";
        let (tokens, errors) = tokenize(source);
        assert!(errors.is_empty());
        assert_eq!(tokens[0].kind, TokenKind::Schema);
        assert_eq!(tokens[1].text, "Foo");
    }

    #[test]
    fn test_string_literal() {
        let source = r#"= "hello world""#;
        let (tokens, errors) = tokenize(source);
        assert!(errors.is_empty());
        assert_eq!(tokens[1].kind, TokenKind::StringLiteral);
        assert_eq!(tokens[1].text, r#""hello world""#);
    }

    #[test]
    fn test_number_literal() {
        let source = "= -42";
        let (tokens, errors) = tokenize(source);
        assert!(errors.is_empty());
        assert_eq!(tokens[1].kind, TokenKind::NumberLiteral);
        assert_eq!(tokens[1].text, "-42");
    }

    #[test]
    fn test_optional_and_array() {
        let source = "schema X { name? string8[] }";
        let (tokens, errors) = tokenize(source);
        assert!(errors.is_empty());
        // schema X { name ? string8 [ ] }
        assert_eq!(tokens[3].kind, TokenKind::Identifier); // name
        assert_eq!(tokens[4].kind, TokenKind::Question);
        assert_eq!(tokens[5].kind, TokenKind::Identifier); // string8
        assert_eq!(tokens[6].kind, TokenKind::LSquare);
        assert_eq!(tokens[7].kind, TokenKind::RSquare);
    }

    #[test]
    fn test_type_options() {
        let source = r#"schema X { name string8(encoding = "ascii") }"#;
        let (tokens, errors) = tokenize(source);
        assert!(errors.is_empty());
        assert_eq!(tokens[5].kind, TokenKind::LParen);
        assert_eq!(tokens[6].kind, TokenKind::Identifier); // encoding
        assert_eq!(tokens[7].kind, TokenKind::Equals);
        assert_eq!(tokens[8].kind, TokenKind::StringLiteral);
        assert_eq!(tokens[9].kind, TokenKind::RParen);
    }

    #[test]
    fn test_spans_are_correct() {
        let source = "schema Foo";
        let (tokens, _) = tokenize(source);
        assert_eq!(tokens[0].span, Span::new(0, 6)); // "schema"
        assert_eq!(tokens[1].span, Span::new(7, 3)); // "Foo"
    }
}
