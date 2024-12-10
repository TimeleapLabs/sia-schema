import { SiaType } from "./types.js";

export const isAnyString = (type: SiaType) => {
  return [
    SiaType.String8,
    SiaType.String16,
    SiaType.String32,
    SiaType.String64,
  ].includes(type);
};

export const isByteArray = (type: SiaType) => {
  return [
    SiaType.ByteArray8,
    SiaType.ByteArray16,
    SiaType.ByteArray32,
    SiaType.ByteArray64,
  ].includes(type);
};

export const getStringTypeFromLength = (max: number = 255) => {
  if (max <= 255) return SiaType.String8;
  if (max <= 65535) return SiaType.String16;
  if (max <= 4294967295) return SiaType.String32;
  return SiaType.String64;
};
