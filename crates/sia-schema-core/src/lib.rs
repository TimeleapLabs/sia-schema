//! Sia schema compiler core library.
//!
//! This crate provides the compiler pipeline for the Sia schema language:
//! lexing, parsing, IR construction, code generation, formatting, and linting.
//!
//! # Pipeline
//!
//! ```text
//! .sia source -> lexer -> parser -> IR (SchemaDefinition) -> generator -> target code
//! ```
//!
//! The [`parse`] function runs the lexer and parser in sequence, returning
//! schema definitions and any diagnostics. The [`generate`] function takes
//! those definitions and produces code for a target language.

/*!
 * Sia schema compiler core library.
 *
 * Provides the full compiler pipeline for the Sia schema language:
 * lexing, parsing, IR construction, code generation, formatting, and linting.
 *
 * # Pipeline
 *
 * ```text
 * .sia source -> lexer -> parser -> IR (SchemaDefinition) -> generator -> target code
 * ```
 *
 * The [`parse`] function runs the lexer and parser in sequence, returning
 * schema definitions and any diagnostics. The [`generate`] function takes
 * those definitions and produces code for a target language.
 */

pub mod error;
pub mod formatter;
pub mod gen;
pub mod ir;
pub mod lexer;
pub mod linter;
pub mod parser;

use error::Diagnostic;
use gen::Target;
use ir::SchemaDefinition;

/**
 * Parse a `.sia` source string into schema definitions and diagnostics.
 *
 * Returns definitions even when there are diagnostics, enabling partial
 * results for editor integrations. Check the diagnostics vec for parse errors.
 */
pub fn parse(source: &str) -> (Vec<SchemaDefinition>, Vec<Diagnostic>) {
    let (tokens, mut lex_diagnostics) = lexer::tokenize(source);
    let parse_result = parser::Parser::new(tokens).parse();
    lex_diagnostics.extend(parse_result.diagnostics);
    (parse_result.definitions, lex_diagnostics)
}

/**
 * Generate code for the given target language from schema definitions.
 *
 * For C++ this returns the combined header and source as a single string.
 * Use [`generate_cpp`] to get them separately.
 */
pub fn generate(definitions: &[SchemaDefinition], target: Target) -> String {
    match target {
        Target::TypeScript => gen::typescript::generate(definitions),
        Target::Go => gen::go::generate(definitions),
        Target::Python => gen::python::generate(definitions),
        Target::Cpp => gen::cpp::generate_combined(definitions, "output"),
    }
}

/** C++ code generation output split into header and source files. */
pub struct CppOutput {
    /** The `.hpp` header file contents. */
    pub hpp: String,
    /** The `.cpp` source file contents. */
    pub cpp: String,
}

/**
 * Generate C++ code as separate header (`.hpp`) and source (`.cpp`) files.
 *
 * `file_name` is used for the `#include` directive in the source file.
 */
pub fn generate_cpp(definitions: &[SchemaDefinition], file_name: &str) -> CppOutput {
    let (hpp, cpp) = gen::cpp::generate(definitions, file_name);
    CppOutput { hpp, cpp }
}
