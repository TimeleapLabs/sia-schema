import type { CstNode, ICstVisitor, IToken } from "chevrotain";

export interface SiaSchemaCstNode extends CstNode {
  name: "siaSchema";
  children: SiaSchemaCstChildren;
}

export type SiaSchemaCstChildren = {
  schema?: SchemaCstNode[];
  plugin?: PluginCstNode[];
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

export interface MethodCstNode extends CstNode {
  name: "method";
  children: MethodCstChildren;
}

export type MethodCstChildren = {
  Method: IToken[];
  Identifier: IToken[];
  typeOptions?: TypeOptionsCstNode[];
  params?: ParamsCstNode[];
  returns?: ReturnsCstNode[];
};

export type ParamsCstChildren = {
  LCurly: IToken[];
  field?: FieldCstNode[];
  Identifier?: IToken[];
  RCurly: IToken[];
};

export interface ParamsCstNode extends CstNode {
  name: "params";
  children: ParamsCstChildren;
}

export type ReturnsCstChildren = {
  Returns: IToken[];
  LCurly: IToken[];
  field?: FieldCstNode[];
  Identifier?: IToken[];
  RCurly: IToken[];
};

export interface ReturnsCstNode extends CstNode {
  name: "returns";
  children: ReturnsCstChildren;
}

export type PluginNameCstChildren = {
  Identifier: IToken[];
  Dot?: IToken[];
};

export interface PluginNameCstNode extends CstNode {
  name: "pluginName";
  children: PluginNameCstChildren;
}

export type PluginAsNameCstChildren = {
  As: IToken[];
  Identifier: IToken[];
};

export interface PluginAsNameCstNode extends CstNode {
  name: "asName";
  children: PluginAsNameCstChildren;
}

export type PluginCstChildren = {
  Plugin: IToken[];
  pluginName: PluginNameCstNode[];
  asName?: PluginAsNameCstNode[];
  LCurly: IToken[];
  method?: MethodCstNode[];
  RCurly: IToken[];
};

export interface PluginCstNode extends CstNode {
  name: "plugin";
  children: PluginCstChildren;
}
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
  method(children: MethodCstChildren, param?: IN): OUT;
  plugin(children: PluginCstChildren, param?: IN): OUT;
  field(children: FieldCstChildren, param?: IN): OUT;
  typeOptions(children: TypeOptionsCstChildren, param?: IN): OUT;
  array(children: ArrayCstChildren, param?: IN): OUT;
  defaultValue(children: DefaultValueCstChildren, param?: IN): OUT;
}
