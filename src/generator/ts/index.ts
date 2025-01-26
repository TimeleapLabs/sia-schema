import {
  STRING_TYPES,
  NUMBER_TYPES,
  BYTE_TYPES,
  FIELD_TYPES,
} from "@/generator/common/types.js";

import type {
  FieldType,
  CodeGenerator,
  StringType,
  NumberType,
  ByteType,
} from "@/generator/common/types.js";

import type { FieldDefinition, SchemaDefinition } from "@/compiler/visitor.js";

import { camelCase, pascalCase } from "change-case";
import { format } from "prettier";

export class TSGenerator implements CodeGenerator {
  private schema: SchemaDefinition[];

  constructor(schema: SchemaDefinition[]) {
    this.schema = schema;
  }

  async toCode(): Promise<string> {
    const parts: string[] = [];

    for (const schema of this.schema) {
      if (schema.type === "schema") {
        parts.push(this.schemaToCode(schema));
      } else {
        throw new Error("Unknown top-level type");
      }
    }

    return await format(parts.join("\n\n"), { parser: "typescript" });
  }

  schemaToCode(schema: SchemaDefinition): string {
    const parts: string[] = [];

    // Generate the interface
    parts.push(`export interface ${schema.name} {`);

    for (const field of schema.fields) {
      const optional = field.optional ? "?" : "";
      const tsType = this.fieldTypeToTsType(field.type as FieldType);
      parts.push(`  ${field.name}${optional}: ${tsType};`);
    }

    parts.push("}\n");

    // Generate a helper function to serialize the schema
    const argName = camelCase(schema.name);
    parts.push(
      `export function serialize${schema.name}(sia: Sia, ${argName}: ${schema.name}): Uint8Array {`,
    );

    for (const field of schema.fields) {
      const name = this.getSerializeFunctionName(field);
      const valueParts = [`${argName}.${field.name}`];

      if (field.optional) {
        if (field.defaultValue) {
          valueParts.push(`?? "${field.defaultValue}"`);
        } else {
          valueParts.push(
            "?? " + this.getDefaultValue(field.type as FieldType),
          );
        }
      }

      const value = valueParts.join(" ");
      parts.push(`  ${name}(sia, ${value});`);
    }

    parts.push("}\n");

    // Generate a helper function to deserialize the schema
    parts.push(
      `export function deserialize${schema.name}(sia: Sia): ${schema.name} {`,
    );
    parts.push(`  return {`);

    for (const field of schema.fields) {
      const name = this.getDeserializeFunctionName(field);
      parts.push(`    ${field.name}: ${name}(sia),`);
    }

    parts.push(`  }`);
    parts.push(`}`);

    return parts.join("\n");
  }

  private fieldTypeToTsType(fieldType: FieldType): string {
    if (STRING_TYPES.includes(fieldType as StringType)) {
      return "string";
    }

    if (NUMBER_TYPES.includes(fieldType as NumberType)) {
      return "number";
    }

    if (BYTE_TYPES.includes(fieldType as ByteType)) {
      return "Uint8Array | Buffer";
    }

    return fieldType;
  }

  private getSerializeFunctionName(field: FieldDefinition): string {
    if (field.type === "string") {
      if (field.encoding === "ascii") {
        return "sia.addAscii";
      }

      throw new Error(`Unknown encoding: ${field.encoding}`);
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return `sia.add${pascalCase(field.type)}`;
    }

    return `serialize${pascalCase(field.type)}`;
  }

  private getDeserializeFunctionName(field: FieldDefinition): string {
    if (field.type === "string") {
      if (field.encoding === "ascii") {
        return "sia.readAscii";
      }

      throw new Error(`Unknown encoding: ${field.encoding}`);
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return `sia.read${pascalCase(field.type)}`;
    }

    return `deserialize${pascalCase(field.type)}`;
  }

  private getDefaultValue(fieldType: FieldType): string {
    if (STRING_TYPES.includes(fieldType as StringType)) {
      return '""';
    }

    if (NUMBER_TYPES.includes(fieldType as NumberType)) {
      return "0";
    }

    if (BYTE_TYPES.includes(fieldType as ByteType)) {
      return "new Uint8Array(0)";
    }

    return "null";
  }
}
