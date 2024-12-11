import { SiaType } from "../types.js";

export const siaTypeFunctionMap: Record<SiaType, string> = {
  [SiaType.Int8]: "add_int8",
  [SiaType.Int16]: "add_int16",
  [SiaType.Int32]: "add_int32",
  [SiaType.Int64]: "add_int64",
  [SiaType.UInt8]: "add_uint8",
  [SiaType.UInt16]: "add_uint16",
  [SiaType.UInt32]: "add_uint32",
  [SiaType.UInt64]: "add_uint64",
  [SiaType.String]: "add_string",
  [SiaType.String8]: "add_string8",
  [SiaType.String16]: "add_string16",
  [SiaType.String32]: "add_string32",
  [SiaType.String64]: "add_string64",
  [SiaType.ByteArray8]: "add_byte_array8",
  [SiaType.ByteArray16]: "add_byte_array16",
  [SiaType.ByteArray32]: "add_byte_array32",
  [SiaType.ByteArray64]: "add_byte_array64",
  [SiaType.Bool]: "add_bool",
  [SiaType.BigInt]: "add_int64",
};

export const siaTypeSerializerArrayItemMap: Record<SiaType, string> = {
  [SiaType.Int8]: "serialize_int8_array_item",
  [SiaType.Int16]: "serialize_int16_array_item",
  [SiaType.Int32]: "serialize_int32_array_item",
  [SiaType.Int64]: "serialize_int64_array_item",
  [SiaType.UInt8]: "serialize_uint8_array_item",
  [SiaType.UInt16]: "serialize_uint16_array_item",
  [SiaType.UInt32]: "serialize_uint32_array_item",
  [SiaType.UInt64]: "serialize_uint64_array_item",
  [SiaType.String]: "serialize_string_array_item",
  [SiaType.String8]: "serialize_string8_array_item",
  [SiaType.String16]: "serialize_string16_array_item",
  [SiaType.String32]: "serialize_string32_array_item",
  [SiaType.String64]: "serialize_string64_array_item",
  [SiaType.ByteArray8]: "serialize_bytearray8_array_item",
  [SiaType.ByteArray16]: "serialize_bytearray16_array_item",
  [SiaType.ByteArray32]: "serialize_bytearray32_array_item",
  [SiaType.ByteArray64]: "serialize_bytearray64_array_item",
  [SiaType.Bool]: "serialize_bool_array_item",
  [SiaType.BigInt]: "serialize_int64_array_item",
};

export const siaTypeArraySizeFunctionMap: Record<number, string> = {
  [8]: "add_array8",
  [16]: "add_array16",
  [32]: "add_array32",
  [64]: "add_array64",
};
