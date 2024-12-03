import { SiaSchemaLexerInstance } from "./lexer.js";
import { SiaSchemaParserInstance } from "./parser.js";
import { SchemaDefinition, SiaSchemaVisitor } from "./visitor.js";

export const compile = (src: string) => {
  const lexResult = SiaSchemaLexerInstance.tokenize(src);

  if (lexResult.errors.length > 0) {
    throw lexResult.errors[0];
  }

  SiaSchemaParserInstance.input = lexResult.tokens;
  const cst = SiaSchemaParserInstance.siaSchema();

  if (SiaSchemaParserInstance.errors.length > 0) {
    throw SiaSchemaParserInstance.errors[0];
  }

  // return cst;

  const SiaSchemaVisitorInstance = new SiaSchemaVisitor(src);
  const result = SiaSchemaVisitorInstance.visit(cst);

  return result as SchemaDefinition[];
};
