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
    const pluginNotices: string[] = [];

    for (const schema of this.schema) {
      if (schema.type === "schema") {
        parts.push(this.schemaToCode(schema));
      } else if (schema.type === "plugin") {
        pluginNotices.push(
          `# Cannot generate plugin '${schema.name}' due to lack of RPC support in the Python Sia generator.`,
        );
        pluginNotices.push(
          `# You must connect to this plugin manually via RPC. Please check the tutorial below:`,
        );
        pluginNotices.push(
          `# https://timeleap.swiss/docs/products/sia/highlevel#rpc\n`,
        );
      }
    }

    parts.push(...pluginNotices);
    return parts.join("\n\n");
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
        `        ${field.name}: ${this.fieldTypeToPyType(field.type as FieldType, field.isArray)},`,
      );
    }

    for (const field of optionalFields) {
      const defaultVal =
        field.defaultValue !== undefined
          ? ` = ${this.getPythonLiteralDefault(field)}`
          : " = None";
      parts.push(
        `        ${field.name}: ${this.fieldTypeToPyType(field.type as FieldType, field.isArray)}${defaultVal},`,
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
    const lines: string[] = [];
    lines.push("");
    lines.push("    def encode(self, sia: Sia) -> Sia:");

    for (const field of schema.fields) {
      const valueExpr = `self.${field.name}`;

      if (field.isArray) {
        const serializeElemFn = this.getSerializeFunctionName(field);
        const serializeElemArgs = this.getSerializeFunctionArgs(field);
        let lambda: string;

        if (serializeElemFn.startsWith("sia.")) {
          const method = serializeElemFn.slice(4);
          lambda = `lambda sia, v: sia.${method}(${serializeElemArgs}v)`;
        } else if (this.knownSchemas.has(field.type)) {
          lambda = `lambda sia, v: v.encode(sia)`;
        } else {
          lambda = `lambda sia, v: ${serializeElemFn}(sia, v)`;
        }

        lines.push(`        sia.add_array8(${valueExpr}, ${lambda})`);
      } else {
        const fn = this.getSerializeFunctionName(field);
        const isAscii = field.type == "string8" && field.encoding == "ascii";
        const comment = isAscii ? "  # ascii" : "";

        if (fn.startsWith("sia.")) {
          lines.push(`        ${fn}(${valueExpr})${comment}`);
        } else if (this.knownSchemas.has(field.type)) {
          lines.push(`        ${valueExpr}.encode(sia)`);
        } else {
          lines.push(`        ${fn}(sia, ${valueExpr})`);
        }
      }
    }

    lines.push("        return sia");
    return lines.join("\n");
  }

  private decodeMethod(schema: SchemaDefinition): string {
    const lines: string[] = [];
    lines.push("");
    lines.push("    @classmethod");
    lines.push(`    def decode(cls, sia: Sia) -> "${schema.name}":`);
    lines.push("        return cls(");

    for (const field of schema.fields) {
      if (field.isArray) {
        const deserializeElemFn = this.getDeserializeFunctionName(field);
        let lambda: string;

        if (deserializeElemFn.startsWith("sia.")) {
          const method = deserializeElemFn.slice(4);
          lambda = `lambda sia: sia.${method}()`;
        } else if (this.knownSchemas.has(field.type)) {
          lambda = `lambda sia: ${field.type}.decode(sia)`;
        } else {
          lambda = `lambda sia: ${deserializeElemFn}(sia)`;
        }

        lines.push(`            ${field.name}=sia.read_array8(${lambda}),`);
      } else {
        const fn = this.getDeserializeFunctionName(field);
        const args = this.getDeserializeFunctionArgs(field);
        lines.push(`            ${field.name}=${fn}(${args}),`);
      }
    }

    lines.push("        )");
    return lines.join("\n");
  }

  fieldTypeToPyType(fieldType: FieldType, isArray: boolean = false): string {
    let baseType: string;

    if (STRING_TYPES.includes(fieldType as StringType)) baseType = "str";
    else if (NUMBER_TYPES.includes(fieldType as NumberType)) baseType = "int";
    else if (BYTE_TYPES.includes(fieldType as ByteType)) baseType = "bytes";
    else if (fieldType === "bool") baseType = "bool";
    else if (!this.knownSchemas.has(fieldType)) {
      throw new Error(
        `Unknown field type: '${fieldType}'. If this is a custom type, please declare a schema with that name.`,
      );
    } else {
      baseType = `"${fieldType}"`;
    }

    return isArray ? `List[${baseType}]` : baseType;
  }

  private getPythonLiteralDefault(field: FieldDefinition): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      return JSON.stringify(field.defaultValue);
    }
    return "None";
  }

  STRING_ENCODING_MAP: Record<string, string> = {
    ascii: "string8",
    utf8: "string8",
    utf16: "string16",
    utf32: "string32",
    utf64: "string64",
  };

  BYTE_TYPE_MAP: Record<string, string> = {
    byteN: "byte_array_n",
    byte8: "byte_array8",
    byte16: "byte_array16",
    byte32: "byte_array32",
    byte64: "byte_array64",
  };

  getSerializeFunctionName(field: FieldDefinition): string {
    if (field.type === "string") {
      const suffix = this.STRING_ENCODING_MAP[field.encoding as string];
      if (!suffix) {
        throw new Error(`Unknown string encoding: ${field.encoding}`);
      }
      return `sia.add_${suffix}`;
    }

    if (this.BYTE_TYPE_MAP[field.type]) {
      return `sia.add_${this.BYTE_TYPE_MAP[field.type]}`;
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

  getSerializeFunctionArgs(field: FieldDefinition): string {
    if (FIELD_TYPES.includes(field.type as FieldType)) return "";
    if (
      BYTE_TYPES.includes(field.type as ByteType) ||
      NUMBER_TYPES.includes(field.type as NumberType)
    )
      return "sia, ";
    return "";
  }

  getDeserializeFunctionName(field: FieldDefinition): string {
    if (field.type === "string") {
      const suffix = this.STRING_ENCODING_MAP[field.encoding as string];
      if (!suffix) {
        throw new Error(`Unknown string encoding: ${field.encoding}`);
      }
      return `sia.read_${suffix}`;
    }

    if (this.BYTE_TYPE_MAP[field.type]) {
      return `sia.read_${this.BYTE_TYPE_MAP[field.type]}`;
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

  getDeserializeFunctionArgs(field: FieldDefinition): string {
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
}
