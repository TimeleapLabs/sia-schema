import { FieldDefinition } from "../../../visitor.js";
import { SiaType } from "../types.js";
import { generateInterfaceFieldString } from "./strings.js";

export const generateInterfaceFields = (fields: FieldDefinition[]) => {
  return fields.map((field) => {
    return generateInterfaceFieldString(field.name, field.type, field.optional);
  });
};

const makeArrayType = (type: string) => {
  return `Array<${type}>`;
};

const getTypeScriptType = (fieldType: string, isArray: boolean): string => {
  if (fieldType.startsWith("int") || fieldType.startsWith("uint")) {
    return isArray ? makeArrayType("number") : "number";
  }
  if (fieldType === "bool") {
    return isArray ? makeArrayType("boolean") : "boolean";
  }
  if (fieldType.startsWith("byte")) {
    switch (fieldType) {
      case "byte16":
        return "Buffer | Uint16Array";
      case "byte32":
        return "Buffer | Uint32Array";
      case "byte64":
        return "Buffer | BigUint64Array";
      default:
        return "Buffer | Uint8Array";
    }
  }
  if (Object.values(SiaType).includes(fieldType as SiaType)) {
    return isArray ? makeArrayType("string") : "string";
  }
  return fieldType; // For custom types (schema references)
};

export const generateInterfaceField = (field: FieldDefinition) => {
  const type = getTypeScriptType(field.type, Boolean(field.isArray));
  return generateInterfaceFieldString(field.name, type, field.optional);
};
