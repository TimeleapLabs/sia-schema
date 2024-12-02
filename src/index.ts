import { createToken, Lexer, CstParser } from "chevrotain";

// --- TOKENS ---

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

const Function = createToken({ name: "Function", pattern: /function/ });
const Returns = createToken({ name: "Returns", pattern: /returns/ });
const Equals = createToken({ name: "Equals", pattern: /=/ });
const LCurly = createToken({ name: "LCurly", pattern: /{/ });
const RCurly = createToken({ name: "RCurly", pattern: /}/ });
const LParen = createToken({ name: "LParen", pattern: /\(/ });
const RParen = createToken({ name: "RParen", pattern: /\)/ });
const LSquare = createToken({ name: "LSquare", pattern: /\[/ });
const RSquare = createToken({ name: "RSquare", pattern: /]/ });
const OptionalMark = createToken({ name: "OptionalMark", pattern: /\?/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });
const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// Token list
const allTokens = [
  WhiteSpace,
  Function,
  Returns,
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
];

// Create the lexer
const lexer = new Lexer(allTokens);

// --- PARSER ---

class ECSNParser extends CstParser {
  constructor() {
    super(allTokens);
    this.performSelfAnalysis();
  }

  public siaSchema = this.RULE("siaSchema", () => {
    this.MANY(() =>
      this.OR([
        { ALT: () => this.SUBRULE(this.schema) },
        { ALT: () => this.SUBRULE(this.function) },
      ])
    );
  });

  // Root rule for a schema
  public schema = this.RULE("schema", () => {
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
const parser = new ECSNParser();

// --- PARSE FUNCTION ---

function parseECSN(input: string): any {
  const lexingResult = lexer.tokenize(input);
  parser.input = lexingResult.tokens;
  const cst = parser.siaSchema();

  if (parser.errors.length > 0) {
    throw new Error("Parsing errors detected: " + parser.errors[0].message);
  }

  return cst;
}

// --- TESTING THE PARSER ---

const exampleSchema = `
Person {
  name    text
  age?    int32(min = 0, max = 120)
  email?  text(encoding = "ascii")
  tags    text[]
  address Address
}

Address {
  street  text = "Default Street"
  city    text
  zip     int32
}

function add returns int64 {
  lhs int32
  rhs int32
}
`;

try {
  const cst = parseECSN(exampleSchema);
  console.log("Parse Tree:", JSON.stringify(cst, null, 2));
} catch (e) {
  console.error("Parsing failed:", (e as Error).message);
}
