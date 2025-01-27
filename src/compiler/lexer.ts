// --- TOKENS ---

import { createToken, Lexer } from "chevrotain";

// Basic tokens
const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
});

const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /"([^"\\]|\\.)*"/,
});

const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /-?\d+(\.\d+)?/,
});

const Method = createToken({ name: "Method", pattern: /method/ });
const Plugin = createToken({ name: "Plugin", pattern: /plugin/ });
const As = createToken({ name: "As", pattern: /as/ });
const Returns = createToken({ name: "Returns", pattern: /returns/ });
const Schema = createToken({ name: "Schema", pattern: /schema/ });
const Equals = createToken({ name: "Equals", pattern: /=/ });
const LCurly = createToken({ name: "LCurly", pattern: /{/ });
const RCurly = createToken({ name: "RCurly", pattern: /}/ });
const LParen = createToken({ name: "LParen", pattern: /\(/ });
const RParen = createToken({ name: "RParen", pattern: /\)/ });
const LSquare = createToken({ name: "LSquare", pattern: /\[/ });
const RSquare = createToken({ name: "RSquare", pattern: /]/ });
const Dot = createToken({ name: "Dot", pattern: /\./ });
const OptionalMark = createToken({
  name: "OptionalMark",
  pattern: /\?/,
});
const Comma = createToken({ name: "Comma", pattern: /,/ });
const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// Token list
export const SiaSchemaTokens = [
  WhiteSpace,
  Plugin,
  Method,
  As,
  Returns,
  Schema,
  Identifier,
  StringLiteral,
  NumberLiteral,
  Equals,
  LCurly,
  RCurly,
  LParen,
  RParen,
  LSquare,
  RSquare,
  OptionalMark,
  Comma,
  Dot,
];

// Create the lexer
export const SiaSchemaLexerInstance = new Lexer(SiaSchemaTokens);

export {
  Comma,
  Equals,
  Plugin,
  Method,
  As,
  Identifier,
  LCurly,
  LParen,
  LSquare,
  NumberLiteral,
  OptionalMark,
  RCurly,
  Returns,
  RParen,
  RSquare,
  Schema,
  StringLiteral,
  WhiteSpace,
  Dot,
};
