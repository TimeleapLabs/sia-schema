import { CstParser, Rule } from "chevrotain";
import {
  Comma,
  Equals,
  Function,
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
  SiaSchemaTokens,
  StringLiteral,
} from "./lexer.js";

class ECSNParser extends CstParser {
  constructor() {
    super(SiaSchemaTokens, { nodeLocationTracking: "full", maxLookahead: 3 });
    this.performSelfAnalysis();
  }

  public siaSchema = this.RULE("siaSchema", () => {
    this.MANY(() =>
      this.OR([
        { ALT: () => this.SUBRULE(this.schema) },
        { ALT: () => this.SUBRULE(this.function) },
      ]),
    );
  });

  // Root rule for a schema
  public schema = this.RULE("schema", () => {
    this.CONSUME(Schema); // Schema keyword
    this.CONSUME(Identifier); // Schema name
    this.CONSUME(LCurly);
    this.MANY(() => this.SUBRULE(this.field)); // Zero or more fields
    this.CONSUME(RCurly);
  });

  // Root rule for a function
  public function = this.RULE("function", () => {
    this.CONSUME(Function); // Schema name
    this.CONSUME(Identifier); // Function name
    this.CONSUME(Returns);
    this.CONSUME1(Identifier); // Return type
    this.CONSUME(LCurly);
    this.MANY(() => this.SUBRULE(this.field)); // Zero or more fields
    this.CONSUME(RCurly);
  });

  // Rule for a field
  public field = this.RULE("field", () => {
    this.CONSUME(Identifier); // Field name
    this.OPTION(() => this.CONSUME(OptionalMark)); // Optional marker (e.g., `fieldName?`)
    this.CONSUME1(Identifier); // Field type
    this.OPTION1(() => this.SUBRULE(this.array)); // Array
    this.OPTION2(() => this.SUBRULE(this.typeOptions)); // Type options
    this.OPTION3(() => this.SUBRULE(this.defaultValue)); // Default value
  });

  // Rule for type options
  public typeOptions = this.RULE("typeOptions", () => {
    this.CONSUME(LParen);
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => {
        this.CONSUME(Identifier); // Option name
        this.CONSUME(Equals);
        this.OR([
          { ALT: () => this.CONSUME1(Identifier) },
          { ALT: () => this.CONSUME(NumberLiteral) },
          { ALT: () => this.CONSUME(StringLiteral) },
        ]);
      },
    });
    this.CONSUME(RParen);
  });

  // Rule for a field
  public array = this.RULE("array", () => {
    this.CONSUME(LSquare);
    this.OPTION(() => this.CONSUME(NumberLiteral)); // Array size
    this.CONSUME(RSquare);
  });

  // Rule for default values
  public defaultValue = this.RULE("defaultValue", () => {
    this.CONSUME(Equals);
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(NumberLiteral) },
    ]);
  });
}

// Instantiate the parser
export const SiaSchemaParserInstance = new ECSNParser();

export const SiaSchemaProductions: Record<string, Rule> =
  SiaSchemaParserInstance.getGAstProductions();
