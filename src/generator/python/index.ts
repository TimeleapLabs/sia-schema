import {
  STRING_TYPES,
  NUMBER_TYPES,
  BYTE_TYPES,
  FIELD_TYPES,
} from "@/generator/common/types.js";

import type {
  CodeGenerator,
  FieldType,
  StringType,
  NumberType,
  ByteType,
} from "@/generator/common/types.js";

import type {
  Definition,
  FieldDefinition,
  MethodDefinition,
  PluginDefinition,
  SchemaDefinition,
} from "@/compiler/visitor.js";

export class PyGenerator implements CodeGenerator {
  private schema: Definition[];
  private knownSchemas: Set<string>;

  constructor(schema: Definition[]) {
    this.schema = schema;
    this.knownSchemas = new Set(
      this.schema.filter((s) => s.type === "schema").map((s) => s.name),
    );
  }

  async toCode(): Promise<string> {
    const parts: string[] = ["from sia import Sia"];

    for (const schema of this.schema) {
      if (schema.type === "schema") {
        parts.push(this.schemaToCode(schema));
      } else if (schema.type === "plugin") {
        parts.push(this.pluginToCode(schema));
      }
    }

    return parts.join("\n\n");
  }

  pluginToCode(schema: PluginDefinition): string {
    return [
      `# Cannot generate plugin '${schema.name}' due to lack of RPC support in the Python Sia generator.`,
      `# You must connect to this plugin manually via RPC. Please check the tutorial below:`,
      `# https://timeleap.swiss/docs/products/sia/highlevel#rpc`,
    ].join("\n");
  }

  methodToCode(method: MethodDefinition): string {
    // Not implemented yet
    return `# method ${method} not implemented`;
  }

  schemaToCode(schema: SchemaDefinition): string {
    const parts: string[] = [];

    const hasArray = schema.fields.some((f) => f.isArray);
    if (hasArray) {
      parts.push("from typing import List\n");
    }

    parts.push(`class ${schema.name}():`);
    parts.push("    def __init__(self,");

    const requiredFields = schema.fields.filter((f) => !f.optional);
    const optionalFields = schema.fields.filter((f) => f.optional);

    for (const field of requiredFields) {
      parts.push(
        `        ${field.name}: ${this.fieldTypeToPyType(field as FieldDefinition)},`,
      );
    }

    for (const field of optionalFields) {
      const defaultVal =
        field.defaultValue !== undefined
          ? ` = ${this.getPythonLiteralDefault(field)}`
          : " = None";
      parts.push(
        `        ${field.name}: ${this.fieldTypeToPyType(field as FieldDefinition)}${defaultVal},`,
      );
    }

    parts.push("    ):");

    for (const field of schema.fields) {
      parts.push(`        self.${field.name} = ${field.name}`);
    }

    return [
      parts.join("\n"),
      this.encodeMethod(schema),
      this.decodeMethod(schema),
    ].join("\n");
  }

  private encodeMethod(schema: SchemaDefinition): string {
    const parts: string[] = [];
    parts.push("");
    parts.push("    def encode(self, sia: Sia) -> Sia:");

    for (const field of schema.fields) {
      const valueExpr = `self.${field.name}`;

      if (field.isArray) {
        const lambda = this.encodeArrayHelper(field);
        parts.push(`        sia.add_array8(${valueExpr}, ${lambda})`);
      } else {
        const fn = this.getSerializeFunctionName(field);
        const isAscii = field.type == "string8" && field.encoding == "ascii";
        const comment = isAscii ? "  # ascii" : "";

        if (fn.startsWith("sia.")) {
          parts.push(`        ${fn}(${valueExpr})${comment}`);
        } else if (this.knownSchemas.has(field.type)) {
          parts.push(`        ${valueExpr}.encode(sia)`);
        } else {
          parts.push(`        ${fn}(sia, ${valueExpr})`);
        }
      }
    }

    parts.push("        return sia");
    return parts.join("\n");
  }

  private decodeMethod(schema: SchemaDefinition): string {
    const parts: string[] = [];
    parts.push("");
    parts.push("    @classmethod");
    parts.push(`    def decode(cls, sia: Sia) -> "${schema.name}":`);
    parts.push("        return cls(");

    for (const field of schema.fields) {
      if (field.isArray) {
        const lambda = this.decodeArrayHelper(field);
        parts.push(`            ${field.name}=sia.read_array8(${lambda}),`);
      } else {
        const fn = this.getDeserializeFunctionName(field);
        const args = this.getDeserializeFunctionArgs(field);
        parts.push(`            ${field.name}=${fn}(${args}),`);
      }
    }

    parts.push("        )");
    return parts.join("\n");
  }

  private encodeArrayHelper(field: FieldDefinition): string {
    const fn = this.getSerializeFunctionName(field);
    const args = this.getSerializeFunctionArgs(field);

    if (fn.startsWith("sia.")) {
      const method = fn.slice(4);
      return `lambda sia, v: sia.${method}(${args}v)`;
    }
    if (this.knownSchemas.has(field.type)) {
      return `lambda sia, v: v.encode(sia)`;
    }
    return `lambda sia, v: ${fn}(sia, v)`;
  }

  private decodeArrayHelper(field: FieldDefinition): string {
    const fn = this.getDeserializeFunctionName(field);

    if (fn.startsWith("sia.")) {
      const method = fn.slice(4);
      return `lambda sia: sia.${method}()`;
    }
    if (this.knownSchemas.has(field.type)) {
      return `lambda sia: ${field.type}.decode(sia)`;
    }
    return `lambda sia: ${fn}(sia)`;
  }

  fieldTypeToPyType(field: FieldDefinition): string {
    let baseType: string;

    if (STRING_TYPES.includes(field.type as StringType)) baseType = "str";
    else if (NUMBER_TYPES.includes(field.type as NumberType)) baseType = "int";
    else if (BYTE_TYPES.includes(field.type as ByteType)) baseType = "bytes";
    else if (field.type === "bool") baseType = "bool";
    else if (!this.knownSchemas.has(field.type)) {
      throw new Error(
        `Unknown field type: '${field.type}'. If this is a custom type, please declare a schema with that name.`,
      );
    } else {
      baseType = `"${field.type}"`;
    }

    return field.isArray ? `List[${baseType}]` : baseType;
  }

  private getSerializeFunctionName(field: FieldDefinition): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      return `sia.add_${field.type}`;
    }

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      switch (field.type) {
        case "byteN":
          return "sia.add_byte_array_n";
        case "byte8":
          return "sia.add_byte_array8";
        case "byte16":
          return "sia.add_byte_array16";
        case "byte32":
          return "sia.add_byte_array32";
        case "byte64":
          return "sia.add_byte_array64";
        default:
          throw new Error(`Unsupported byte type: ${field.type}`);
      }
    }

    if (field.type === "bool") {
      return "sia.add_bool";
    }

    if (
      NUMBER_TYPES.includes(field.type as NumberType) ||
      FIELD_TYPES.includes(field.type as FieldType)
    ) {
      return `sia.add_${field.type}`;
    }

    return `${field.type}.encode`;
  }

  private getSerializeFunctionArgs(field: FieldDefinition): string {
    if (FIELD_TYPES.includes(field.type as FieldType)) return "";
    if (
      BYTE_TYPES.includes(field.type as ByteType) ||
      NUMBER_TYPES.includes(field.type as NumberType)
    )
      return "sia, ";
    return "";
  }

  private getDeserializeFunctionName(field: FieldDefinition): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      return `sia.read_${field.type}`;
    }

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      switch (field.type) {
        case "byteN":
          return "sia.read_byte_array_n";
        case "byte8":
          return "sia.read_byte_array8";
        case "byte16":
          return "sia.read_byte_array16";
        case "byte32":
          return "sia.read_byte_array32";
        case "byte64":
          return "sia.read_byte_array64";
        default:
          throw new Error(`Unsupported byte type: ${field.type}`);
      }
    }

    if (field.type === "bool") {
      return "sia.read_bool";
    }

    if (
      NUMBER_TYPES.includes(field.type as NumberType) ||
      FIELD_TYPES.includes(field.type as FieldType)
    ) {
      return `sia.read_${field.type}`;
    }

    return `${field.type}.decode`;
  }

  private getDeserializeFunctionArgs(field: FieldDefinition): string {
    if (field.type === "byteN") return this.getFixedLength(field);
    if (FIELD_TYPES.includes(field.type as FieldType)) return "";
    return "sia";
  }

  private getFixedLength(field: FieldDefinition): string {
    if (field.length) {
      return field.length.toString();
    }

    if (field.fromEnd) {
      return `sia.offset - sia.length - ${field.fromEnd}`;
    }

    throw new Error(
      `Field ${field.name} is of fixed length but has no length specified.`,
    );
  }

  private getPythonLiteralDefault(field: FieldDefinition): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      return JSON.stringify(field.defaultValue);
    }
    return "None";
  }
}
