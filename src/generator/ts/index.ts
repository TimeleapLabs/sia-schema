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
    const parts: string[] = ["import { Sia } from '@timeleap/sia';"];

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
      `export function encode${schema.name}(sia: Sia, ${argName}: ${schema.name}): Sia {`,
    );

    for (const field of schema.fields) {
      const name = this.getSerializeFunctionName(field);
      const args = this.getSerializeFunctionArgs(field);
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
      parts.push(`  ${name}(${args}${value});`);
    }

    parts.push("  return sia;");
    parts.push("}\n");

    // Generate a helper function to deserialize the schema
    parts.push(
      `export function decode${schema.name}(sia: Sia): ${schema.name} {`,
    );
    parts.push(`  return {`);

    for (const field of schema.fields) {
      const name = this.getDeserializeFunctionName(field);
      const args = this.getDeserializeFunctionArgs(field);

      parts.push(`    ${field.name}: ${name}(${args}),`);
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

    if (fieldType === "bool") {
      return "boolean";
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

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      switch (field.type) {
        case "byteN":
          return "sia.addByteArrayN";
        case "byte8":
          return "sia.addByteArray8";
        case "byte16":
          return "sia.addByteArray16";
        case "byte32":
          return "sia.addByteArray32";
        case "byte64":
          return "sia.addByteArray64";
      }
    }

    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      switch (field.type) {
        case "uint8":
          return "sia.addUInt8";
        case "uint16":
          return "sia.addUInt16";
        case "uint32":
          return "sia.addUInt32";
        case "uint64":
          return "sia.addUInt64";
      }
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return `sia.add${pascalCase(field.type)}`;
    }

    return `encode${pascalCase(field.type)}`;
  }

  private getSerializeFunctionArgs(field: FieldDefinition): string {
    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return "";
    }

    return "sia, ";
  }

  private getDeserializeFunctionName(field: FieldDefinition): string {
    if (field.type === "string") {
      if (field.encoding === "ascii") {
        return "sia.readAscii";
      }

      throw new Error(`Unknown encoding: ${field.encoding}`);
    }

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      switch (field.type) {
        case "byteN":
          return "sia.readByteArrayN";
        case "byte8":
          return "sia.readByteArray8";
        case "byte16":
          return "sia.readByteArray16";
        case "byte32":
          return "sia.readByteArray32";
        case "byte64":
          return "sia.readByteArray64";
      }
    }

    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      switch (field.type) {
        case "uint8":
          return "sia.readUInt8";
        case "uint16":
          return "sia.readUInt16";
        case "uint32":
          return "sia.readUInt32";
        case "uint64":
          return "sia.readUInt64";
      }
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return `sia.read${pascalCase(field.type)}`;
    }

    return `decode${pascalCase(field.type)}`;
  }

  private getDeserializeFunctionArgs(field: FieldDefinition): string {
    if (field.type === "byteN") {
      return `${field.length}`;
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return "";
    }

    return "sia";
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

    if (fieldType === "bool") {
      return "false";
    }

    return "null";
  }
}
