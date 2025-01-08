import { SiaType } from "../types.js";

export const siaTypeFunctionMap: Record<SiaType, string> = {
  [SiaType.Int8]: "addInt8",
  [SiaType.Int16]: "addInt16",
  [SiaType.Int32]: "addInt32",
  [SiaType.Int64]: "addInt64",
  [SiaType.UInt8]: "addUInt8",
  [SiaType.UInt16]: "addUInt16",
  [SiaType.UInt32]: "addUInt32",
  [SiaType.UInt64]: "addUInt64",
  [SiaType.String]: "addStringN",
  [SiaType.String8]: "addString8",
  [SiaType.String16]: "addString16",
  [SiaType.String32]: "addString32",
  [SiaType.String64]: "addString64",
  [SiaType.ByteArray8]: "addByteArray8",
  [SiaType.ByteArray16]: "addByteArray16",
  [SiaType.ByteArray32]: "addByteArray32",
  [SiaType.ByteArray64]: "addByteArray64",
  [SiaType.Bool]: "addBool",
  [SiaType.BigInt]: "addBigInt",
};

export const siaTypeSerializerArrayItemMap: Record<SiaType, string> = {
  [SiaType.Int8]: "serializeInt8ArrayItem",
  [SiaType.Int16]: "serializeInt16ArrayItem",
  [SiaType.Int32]: "serializeInt32ArrayItem",
  [SiaType.Int64]: "serializeInt64ArrayItem",
  [SiaType.UInt8]: "serializeUInt8ArrayItem",
  [SiaType.UInt16]: "serializeUInt16ArrayItem",
  [SiaType.UInt32]: "serializeUInt32ArrayItem",
  [SiaType.UInt64]: "serializeUInt64ArrayItem",
  [SiaType.String]: "serializeStringArrayItem",
  [SiaType.String8]: "serializeString8ArrayItem",
  [SiaType.String16]: "serializeString16ArrayItem",
  [SiaType.String32]: "serializeString32ArrayItem",
  [SiaType.String64]: "serializeString64ArrayItem",
  [SiaType.ByteArray8]: "serializeByteArray8ArrayItem",
  [SiaType.ByteArray16]: "serializeByteArray16ArrayItem",
  [SiaType.ByteArray32]: "serializeByteArray32ArrayItem",
  [SiaType.ByteArray64]: "serializeByteArray64ArrayItem",
  [SiaType.Bool]: "serializeBoolArrayItem",
  [SiaType.BigInt]: "serializeBigIntArrayItem",
};

export const siaTypeArraySizeFunctionMap: Record<number, string> = {
  [8]: "addArray8",
  [16]: "addArray16",
  [32]: "addArray32",
  [64]: "addArray64",
};
