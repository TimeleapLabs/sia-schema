import type { CstNode, ICstVisitor, IToken } from "chevrotain";

export interface SiaSchemaCstNode extends CstNode {
  name: "siaSchema";
  children: SiaSchemaCstChildren;
}

export type SiaSchemaCstChildren = {
  schema?: SchemaCstNode[];
  function?: FunctionCstNode[];
};

export interface SchemaCstNode extends CstNode {
  name: "schema";
  children: SchemaCstChildren;
}

export type SchemaCstChildren = {
  Schema: IToken[];
  Identifier: IToken[];
  LCurly: IToken[];
  field?: FieldCstNode[];
  RCurly: IToken[];
};

export interface FunctionCstNode extends CstNode {
  name: "function";
  children: FunctionCstChildren;
}

export type FunctionCstChildren = {
  Function: IToken[];
  Identifier: IToken[];
  Returns: IToken[];
  LCurly: IToken[];
  field?: FieldCstNode[];
  RCurly: IToken[];
};

export interface FieldCstNode extends CstNode {
  name: "field";
  children: FieldCstChildren;
}

export type FieldCstChildren = {
  Identifier: IToken[];
  OptionalMark?: IToken[];
  array?: ArrayCstNode[];
  typeOptions?: TypeOptionsCstNode[];
  defaultValue?: DefaultValueCstNode[];
};

export interface TypeOptionsCstNode extends CstNode {
  name: "typeOptions";
  children: TypeOptionsCstChildren;
}

export type TypeOptionsCstChildren = {
  LParen: IToken[];
  Identifier?: IToken[];
  Equals?: IToken[];
  NumberLiteral?: IToken[];
  StringLiteral?: IToken[];
  Comma?: IToken[];
  RParen: IToken[];
};

export interface ArrayCstNode extends CstNode {
  name: "array";
  children: ArrayCstChildren;
}

export type ArrayCstChildren = {
  LSquare: IToken[];
  RSquare: IToken[];
};

export interface DefaultValueCstNode extends CstNode {
  name: "defaultValue";
  children: DefaultValueCstChildren;
}

export type DefaultValueCstChildren = {
  Equals: IToken[];
  Identifier?: IToken[];
  StringLiteral?: IToken[];
  NumberLiteral?: IToken[];
};

export interface ISiaSchemaVisitor<IN, OUT> extends ICstVisitor<IN, OUT> {
  siaSchema(children: SiaSchemaCstChildren, param?: IN): OUT;
  schema(children: SchemaCstChildren, param?: IN): OUT;
  function(children: FunctionCstChildren, param?: IN): OUT;
  field(children: FieldCstChildren, param?: IN): OUT;
  typeOptions(children: TypeOptionsCstChildren, param?: IN): OUT;
  array(children: ArrayCstChildren, param?: IN): OUT;
  defaultValue(children: DefaultValueCstChildren, param?: IN): OUT;
}
