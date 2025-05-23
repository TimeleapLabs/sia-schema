import { CstParser, Rule } from "chevrotain";
import {
  Comma,
  Equals,
  Plugin,
  Method,
  Dot,
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
  As,
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
        { ALT: () => this.SUBRULE(this.plugin) },
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

  public plugin = this.RULE("plugin", () => {
    this.CONSUME(Plugin); // Plugin keyword
    this.SUBRULE(this.pluginName); // Plugin name
    this.OPTION(() => this.SUBRULE(this.asName)); // As name
    this.CONSUME(LCurly);
    this.MANY(() => this.SUBRULE(this.method)); // Zero or more method
    this.CONSUME(RCurly);
  });

  public asName = this.RULE("asName", () => {
    this.CONSUME(As); // As keyword
    this.CONSUME(Identifier); // As name
  });

  public pluginName = this.RULE("pluginName", () => {
    this.CONSUME(Identifier); // Plugin name
    this.MANY(() => {
      this.CONSUME(Dot);
      this.CONSUME1(Identifier);
    });
  });

  // Root rule for a method
  public method = this.RULE("method", () => {
    this.CONSUME(Method); // Schema name
    this.CONSUME(Identifier); // Method name
    this.SUBRULE(this.typeOptions); // Type options
    this.SUBRULE(this.params); // Method parameters
    this.SUBRULE(this.returns); // Returns
  });

  public params = this.RULE("params", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(LCurly);
          this.MANY(() => this.SUBRULE(this.field)); // Zero or more fields
          this.CONSUME(RCurly);
        },
      },
      { ALT: () => this.CONSUME(Identifier) },
    ]);
  });

  public returns = this.RULE("returns", () => {
    this.CONSUME(Returns); // Returns keyword
    this.OR([
      {
        ALT: () => {
          this.CONSUME(LCurly);
          this.MANY(() => this.SUBRULE(this.field)); // Zero or more fields
          this.CONSUME(RCurly);
        },
      },
      { ALT: () => this.CONSUME(Identifier) },
    ]);
  });

  // Rule for a field
  public field = this.RULE("field", () => {
    this.CONSUME(Identifier); // Field name
    this.OPTION(() => this.CONSUME(OptionalMark)); // Optional marker (e.g., `fieldName?`)
    this.CONSUME1(Identifier); // Field type
    this.OPTION2(() => this.SUBRULE(this.typeOptions)); // Type options
    this.OPTION1(() => this.SUBRULE(this.array)); // Array
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
    this.CONSUME(LSquare); // Field name
    this.CONSUME(RSquare); // Field name
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
