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

import { snakeCase } from "change-case";

export class PyGenerator implements CodeGenerator {
  private schema: Definition[];

  constructor(schema: Definition[]) {
    this.schema = schema;
  }

  async toCode(): Promise<string> {
    const parts: string[] = ["from sia import Sia\n"];

    const decodeFunctions: string[] = [];
    const pluginNotices: string[] = [];

    for (const schema of this.schema) {
      if (schema.type === "schema") {
        parts.push(this.schemaToCode(schema));
        decodeFunctions.push(this.decodeFunction(schema));
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

    parts.push(...decodeFunctions);
    parts.push(...pluginNotices);

    return parts.join("\n\n");
  }

  schemaToCode(schema: SchemaDefinition): string {
    const parts: string[] = [];

    // class definition
    parts.push(`class ${schema.name}():`);
    parts.push("    def __init__(self,");
    for (const field of schema.fields) {
      const optional = field.optional ? " = None" : "";
      parts.push(
        `        ${field.name}: ${this.fieldTypeToPyType(field.type as FieldType)}${optional},`,
      );
    }
    parts.push("    ):");
    for (const field of schema.fields) {
      parts.push(`        self.${field.name} = ${field.name}`);
    }

    // external encode function
    const encodeParts: string[] = [];
    encodeParts.push(
      `\ndef encode_${snakeCase(schema.name)}(sia: Sia, value: ${schema.name}) -> Sia:`,
    );
    for (const field of schema.fields) {
      const fn = this.getSerializeFunctionName(field);
      const valueExpr = `value.${field.name}`;
      const isAscii = field.type == "string8" && field.encoding == "ascii";

      const comment = isAscii ? "  # ascii" : "";

      let call: string;
      if (fn.startsWith("sia.")) {
        call = `${fn}(${valueExpr})`;
      } else {
        call = `${fn}(sia, ${valueExpr})`;
      }

      encodeParts.push(`    ${call}${comment}`);
    }
    encodeParts.push("    return sia");

    return parts.join("\n") + "\n" + encodeParts.join("\n");
  }

  decodeFunction(schema: SchemaDefinition): string {
    const args = schema.fields
      .map((f) => {
        const method = this.getDeserializeFunctionName(f);
        const call = `${method}(${this.getDeserializeFunctionArgs(f)})`;
        return `${f.name}=${call}`;
      })
      .join(", ");

    return `\ndef decode_${snakeCase(schema.name)}(sia: Sia) -> ${schema.name}:\n    return ${schema.name}(${args})\n`;
  }

  fieldTypeToPyType(fieldType: FieldType): string {
    if (STRING_TYPES.includes(fieldType as StringType)) return "str";
    if (NUMBER_TYPES.includes(fieldType as NumberType)) return "int";
    if (BYTE_TYPES.includes(fieldType as ByteType)) return "bytes";
    if (fieldType === "bool") return "bool";
    return fieldType;
  }

  getSerializeFunctionName(field: FieldDefinition): string {
    if (field.type === "string") {
      if (field.encoding === "ascii") {
        return "sia.add_string8";
      }
    }

    if (field.type === "string") {
      if (STRING_TYPES.includes(field.type as StringType)) {
        switch (field.encoding) {
          case "utf8":
            return "sia.add_string8";
          case "utf16":
            return "sia.add_string16";
          case "utf32":
            return "sia.add_string32";
          case "utf64":
            return "sia.add_string64";
          default:
            throw new Error(`Unknown string encoding: ${field.encoding}`);
        }
      } else {
        throw new Error(`Unsupported byte type: ${field.type}`);
      }
    }

    if (field.type.startsWith("byte")) {
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
      } else {
        throw new Error(`Unsupported byte type: ${field.type}`);
      }
    }

    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      return `sia.add_${field.type}`;
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return `sia.add_${field.type}`;
    }

    if (field.type === "bool") {
      return "sia.add_bool";
    }

    return `encode_${snakeCase(field.type)}`;
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
      if (field.encoding === "ascii") {
        return "sia.read_string8";
      }
    }

    if (field.type === "string") {
      if (STRING_TYPES.includes(field.type as StringType)) {
        switch (field.encoding) {
          case "utf8":
            return "sia.read_string8";
          case "utf16":
            return "sia.read_string16";
          case "utf32":
            return "sia.read_string32";
          case "utf64":
            return "sia.read_string64";
          default:
            throw new Error(`Unknown string encoding: ${field.encoding}`);
        }
      } else {
        throw new Error(`Unsupported byte type: ${field.type}`);
      }
    }

    if (field.type.startsWith("byte")) {
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
      } else {
        throw new Error(`Unsupported byte type: ${field.type}`);
      }
    }

    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      return `sia.read_${field.type}`;
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return `sia.read_${field.type}`;
    }

    if (field.type === "bool") {
      return "sia.read_bool";
    }

    return `decode_${snakeCase(field.type)}`;
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

  getDeserializeFunctionArgs(field: FieldDefinition): string {
    if (field.type === "byteN") return this.getFixedLength(field);
    if (FIELD_TYPES.includes(field.type as FieldType)) return "";
    return "sia";
  }
}
