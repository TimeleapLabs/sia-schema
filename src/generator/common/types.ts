import { SchemaDefinition } from "../../visitor.js";

export enum SiaType {
  Int8 = "int8",
  Int16 = "int16",
  Int32 = "int32",
  Int64 = "int64",
  UInt8 = "uint8",
  UInt16 = "uint16",
  UInt32 = "uint32",
  UInt64 = "uint64",
  String = "string",
  String8 = "string8",
  String16 = "string16",
  String32 = "string32",
  String64 = "string64",
  ByteArray8 = "byte8",
  ByteArray16 = "byte16",
  ByteArray32 = "byte32",
  ByteArray64 = "byte64",
  Bool = "bool",
  BigInt = "bigint",
}

export enum Extension {
  JS = "js",
  TS = "ts",
  GO = "go",
}

export interface Generator {
  sir: SchemaDefinition[];
  imports: () => string;
  types: () => string;
  sampleObject: () => string;
  siaInstance: () => string;
  toString: () => string;
}
