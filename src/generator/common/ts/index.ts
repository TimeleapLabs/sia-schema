import { FieldDefinition } from "../../../visitor.js";
import { SiaType } from "../types.js";
import { generateInterfaceFieldString } from "./strings.js";

export const generateInterfaceFields = (fields: FieldDefinition[]) => {
  return fields.map((field) => {
    return generateInterfaceFieldString(field.name, field.type, field.optional);
  });
};

const getTypeScriptType = (fieldType: string): string => {
  if (fieldType.startsWith("int") || fieldType.startsWith("uint")) {
    return "number";
  }
  if (fieldType === "bool") {
    return "boolean";
  }
  if (Object.values(SiaType).includes(fieldType as SiaType)) {
    return "string";
  }
  return fieldType; // For custom types (schema references)
};

export const generateInterfaceField = (field: FieldDefinition) => {
  let type = getTypeScriptType(field.type);
  if (field.isArray) {
    type = `Array<${type}>`;
  }
  return generateInterfaceFieldString(field.name, type, field.optional);
};
