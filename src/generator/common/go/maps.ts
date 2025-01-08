import { SiaType } from "../types.js";

export const siaTypeFunctionMap: Record<SiaType, string> = {
  [SiaType.Int8]: "AddInt8",
  [SiaType.Int16]: "AddInt16",
  [SiaType.Int32]: "AddInt32",
  [SiaType.Int64]: "AddInt64",
  [SiaType.UInt8]: "AddUInt8",
  [SiaType.UInt16]: "AddUInt16",
  [SiaType.UInt32]: "AddUInt32",
  [SiaType.UInt64]: "AddUInt64",
  [SiaType.String]: "AddStringN",
  [SiaType.String8]: "AddString8",
  [SiaType.String16]: "AddString16",
  [SiaType.String32]: "AddString32",
  [SiaType.String64]: "AddString64",
  [SiaType.ByteArray8]: "AddByteArray8",
  [SiaType.ByteArray16]: "AddByteArray16",
  [SiaType.ByteArray32]: "AddByteArray32",
  [SiaType.ByteArray64]: "AddByteArray64",
  [SiaType.Bool]: "AddBool",
  [SiaType.BigInt]: "AddBigInt",
};

export const siaTypeSerializerArrayItemMap: Record<SiaType, string> = {
  [SiaType.Int8]: "SerializeInt8ArrayItem",
  [SiaType.Int16]: "SerializeInt16ArrayItem",
  [SiaType.Int32]: "SerializeInt32ArrayItem",
  [SiaType.Int64]: "SerializeInt64ArrayItem",
  [SiaType.UInt8]: "SerializeUInt8ArrayItem",
  [SiaType.UInt16]: "SerializeUInt16ArrayItem",
  [SiaType.UInt32]: "SerializeUInt32ArrayItem",
  [SiaType.UInt64]: "SerializeUInt64ArrayItem",
  [SiaType.String]: "SerializeStringArrayItem",
  [SiaType.String8]: "SerializeString8ArrayItem",
  [SiaType.String16]: "SerializeString16ArrayItem",
  [SiaType.String32]: "SerializeString32ArrayItem",
  [SiaType.String64]: "SerializeString64ArrayItem",
  [SiaType.ByteArray8]: "SerializeByteArray8ArrayItem",
  [SiaType.ByteArray16]: "SerializeByteArray16ArrayItem",
  [SiaType.ByteArray32]: "SerializeByteArray32ArrayItem",
  [SiaType.ByteArray64]: "SerializeByteArray64ArrayItem",
  [SiaType.Bool]: "SerializeBoolArrayItem",
  [SiaType.BigInt]: "SerializeBigIntArrayItem",
};

export const siaTypeArraySizeFunctionMap: Record<number, string> = {
  [8]: "AddArray8",
  [16]: "AddArray16",
  [32]: "AddArray32",
  [64]: "AddArray64",
};
