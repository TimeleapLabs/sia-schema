import { SiaSchemaParserInstance } from "./parser.js";
import {
  DefaultValueCstChildren,
  FieldCstChildren,
  MethodCstChildren,
  ParamsCstChildren,
  PluginAsNameCstChildren,
  PluginCstChildren,
  PluginNameCstChildren,
  ReturnsCstChildren,
  SchemaCstChildren,
  SiaSchemaCstChildren,
  TypeOptionsCstChildren,
} from "../types/parser.js";
import { camelCase, pascalCase } from "change-case";

interface BaseDefinition {
  name: string;
  type: "schema" | "plugin";
}

export interface PluginDefinition extends BaseDefinition {
  type: "plugin";
  methods: MethodDefinition[];
  as: string;
}

export interface SchemaDefinition extends BaseDefinition {
  type: "schema";
  fields: FieldDefinition[];
}

export type Definition = SchemaDefinition | PluginDefinition;

export interface FieldDefinition {
  name: string;
  type: string;
  optional?: boolean;
  isArray?: boolean;
  defaultValue?: string | number | boolean;
  [key: string]: unknown;
}

export interface MethodDefinition {
  name: string;
  fields: FieldDefinition | FieldDefinition[];
  returns: FieldDefinition | FieldDefinition[];
  timeout?: string;
}

const SiaSchemaBaseVisitor =
  SiaSchemaParserInstance.getBaseCstVisitorConstructor();

export class SiaSchemaVisitor extends SiaSchemaBaseVisitor {
  src: string = "";
  private definitions: Definition[] = [];

  constructor(src: string) {
    super();
    this.validateVisitor();
    this.src = src;
  }

  siaSchema(ctx: SiaSchemaCstChildren): Definition[] {
    ctx.schema?.forEach((schema) => this.visit(schema));
    ctx.plugin?.forEach((plugin) => this.visit(plugin));
    return this.definitions;
  }

  schema(ctx: SchemaCstChildren) {
    const name = ctx.Identifier[0].image;
    const fields: FieldDefinition[] = [];

    ctx.field?.forEach((field) => {
      fields.push(this.visit(field));
    });

    this.definitions.push({ type: "schema", name, fields });
  }

  plugin(ctx: PluginCstChildren) {
    const name = this.visit(ctx.pluginName);
    const as = ctx.asName ? this.visit(ctx.asName) : pascalCase(name);

    const methods = ctx.method?.map((method) =>
      this.visit(method),
    ) as MethodDefinition[];

    this.definitions.push({ type: "plugin", name, as, methods });
  }

  pluginName(ctx: PluginNameCstChildren) {
    return ctx.Identifier.map((i) => i.image).join(".");
  }

  asName(ctx: PluginAsNameCstChildren) {
    return ctx.Identifier[0].image;
  }

  method(ctx: MethodCstChildren): MethodDefinition {
    const name = ctx.Identifier[0].image;
    const fields = this.visit(ctx.params![0]);
    const returns = this.visit(ctx.returns![0]);
    const options = ctx.typeOptions ? this.visit(ctx.typeOptions[0]) : {};
    return { name, fields, returns, ...options };
  }

  params(ctx: ParamsCstChildren): FieldDefinition | FieldDefinition[] {
    if (ctx.Identifier) {
      const type = ctx.Identifier[0].image;
      return { name: camelCase(type), type };
    }
    return ctx.field?.map((field) => this.visit(field)) ?? [];
  }

  returns(ctx: ReturnsCstChildren): FieldDefinition | FieldDefinition[] {
    if (ctx.Identifier) {
      const type = ctx.Identifier[0].image;
      return { name: camelCase(type), type };
    }
    return ctx.field?.map((field) => this.visit(field)) ?? [];
  }

  field(ctx: FieldCstChildren): FieldDefinition {
    const name = ctx.Identifier[0].image;
    const optional = ctx.OptionalMark !== undefined;
    const isArray = ctx.array !== undefined;
    const type = ctx.typeOptions
      ? ctx.Identifier[1].image
      : ctx.Identifier[1].image;

    const fieldDef: FieldDefinition = { name, type };

    if (optional) fieldDef.optional = true;
    if (isArray) fieldDef.isArray = true;
    if (ctx.typeOptions)
      Object.assign(fieldDef, this.visit(ctx.typeOptions[0]));
    if (ctx.defaultValue)
      fieldDef.defaultValue = this.visit(ctx.defaultValue[0]);

    return fieldDef;
  }

  typeOptions(ctx: TypeOptionsCstChildren): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    for (let i = 0; i < (ctx.Identifier?.length ?? 0); i++) {
      const key = ctx.Identifier![i].image;
      const value = ctx.NumberLiteral?.[i]
        ? Number(ctx.NumberLiteral[i].image)
        : ctx.StringLiteral?.[i]
          ? ctx.StringLiteral[i].image.slice(1, -1)
          : null;
      options[key] = value;
    }

    return options;
  }

  array(): { isArray: true } {
    return { isArray: true };
  }

  defaultValue(ctx: DefaultValueCstChildren): string | number | boolean {
    if (ctx.StringLiteral) return ctx.StringLiteral[0].image.slice(1, -1);
    if (ctx.NumberLiteral) return Number(ctx.NumberLiteral[0].image);
    if (ctx.Identifier) return ctx.Identifier[0].image;
    return "";
  }
}
