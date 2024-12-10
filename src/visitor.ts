import { SiaSchemaParserInstance } from "./parser.js";
import {
  DefaultValueCstChildren,
  FieldCstChildren,
  FunctionCstChildren,
  SchemaCstChildren,
  SiaSchemaCstChildren,
  TypeOptionsCstChildren,
} from "./types/parser.js";

interface SchemaDefinition {
  name: string;
  type: "schema" | "function";
  fields: FieldDefinition[];
}

interface FieldDefinition {
  name: string;
  type: string;
  optional?: boolean;
  isArray?: boolean;
  arraySize?: number;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  [key: string]: unknown;
}

const SiaSchemaBaseVisitor =
  SiaSchemaParserInstance.getBaseCstVisitorConstructor();

class SiaSchemaVisitor extends SiaSchemaBaseVisitor {
  src: string = "";
  private definitions: SchemaDefinition[] = [];

  constructor(src: string) {
    super();
    this.validateVisitor();
    this.src = src;
  }

  siaSchema(ctx: SiaSchemaCstChildren): SchemaDefinition[] {
    ctx.schema?.forEach((schema) => this.visit(schema));
    ctx.function?.forEach((func) => this.visit(func));
    return this.definitions;
  }

  schema(ctx: SchemaCstChildren) {
    const name = ctx.Identifier[0].image;
    const fields: FieldDefinition[] = [];

    ctx.field?.forEach((field) => {
      fields.push(this.visit(field));
    });

    this.definitions.push({ name, type: "schema", fields });
  }

  function(ctx: FunctionCstChildren) {
    const name = ctx.Identifier[0].image;
    const fields: FieldDefinition[] = [];

    ctx.field?.forEach((field) => {
      fields.push(this.visit(field));
    });

    this.definitions.push({
      name,
      type: "function",
      fields,
    });
  }

  field(ctx: FieldCstChildren): FieldDefinition {
    const name = ctx.Identifier[0].image;
    const optional = ctx.OptionalMark !== undefined;
    const type = ctx.typeOptions
      ? ctx.Identifier[1].image
      : ctx.Identifier[1].image;

    const fieldDef: FieldDefinition = { name, type };

    if (optional) fieldDef.optional = true;
    if (ctx.array !== undefined) {
      fieldDef.isArray = true;
      if (ctx.array[0].children.NumberLiteral) {
        fieldDef.arraySize = Number(
          ctx.array[0].children.NumberLiteral[0].image,
        );
      }
    }
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

export { FieldDefinition, SchemaDefinition, SiaSchemaVisitor };
