pub mod error;
pub mod formatter;
pub mod gen;
pub mod ir;
pub mod lexer;
pub mod parser;

use error::Diagnostic;
use gen::Target;
use ir::Definition;

/// Parse a `.sia` source string into definitions and diagnostics.
///
/// Returns definitions even if there are diagnostics (for partial results).
pub fn parse(source: &str) -> (Vec<Definition>, Vec<Diagnostic>) {
    let (tokens, mut lex_diagnostics) = lexer::tokenize(source);
    let parse_result = parser::Parser::new(tokens).parse();
    lex_diagnostics.extend(parse_result.diagnostics);
    (parse_result.definitions, lex_diagnostics)
}

/// Generate code for the given target language from definitions.
pub fn generate(definitions: &[Definition], target: Target) -> String {
    match target {
        Target::TypeScript => gen::typescript::generate(definitions),
        Target::Go => gen::go::generate(definitions),
        Target::Python => gen::python::generate(definitions),
        Target::Cpp => gen::cpp::generate_combined(definitions, "output"),
    }
}

/// Generate C++ code split into header and source files.
pub struct CppOutput {
    pub hpp: String,
    pub cpp: String,
}

pub fn generate_cpp(definitions: &[Definition], file_name: &str) -> CppOutput {
    let (hpp, cpp) = gen::cpp::generate(definitions, file_name);
    CppOutput { hpp, cpp }
}
