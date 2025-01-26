import { SchemaDefinition } from "@/compiler/visitor.js";

export const STRING_TYPES = [
  "stringN",
  "string",
  "string8",
  "string16",
  "string32",
  "string64",
] as const;

export const BYTE_TYPES = [
  "byteN",
  "byte8",
  "byte16",
  "byte32",
  "byte64",
] as const;

export const NUMBER_TYPES = [
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
] as const;

export const FIELD_TYPES = [
  ...STRING_TYPES,
  ...BYTE_TYPES,
  ...NUMBER_TYPES,
] as const;

export type StringType = (typeof STRING_TYPES)[number];
export type ByteType = (typeof BYTE_TYPES)[number];
export type NumberType = (typeof NUMBER_TYPES)[number];
export type FieldType = StringType | ByteType | NumberType;

export interface CodeGenerator {
  toCode: () => Promise<string>;
  schemaToCode: (schema: SchemaDefinition) => string;
}

export type CodeGeneratorConstructor = new (
  schema: SchemaDefinition[],
) => CodeGenerator;
