import { FieldDefinition, SchemaDefinition } from "../../../visitor.js";
import { SiaType } from "../types.js";
import { siaTypeSerializerArrayItemMap } from "./maps.js";
import { createAttributeString } from "./strings.js";

export const isAnyString = (type: SiaType) => {
  return [
    SiaType.String8,
    SiaType.String16,
    SiaType.String32,
    SiaType.String64,
  ].includes(type);
};

export const getStringTypeFromLength = (max: number = 255) => {
  if (max <= 255) return SiaType.String8;
  if (max <= 65535) return SiaType.String16;
  if (max <= 4294967295) return SiaType.String32;
  return SiaType.String64;
};

export const getRequiredSerializers = (schemas: SchemaDefinition[]) => {
  return Array.from(
    new Set(
      schemas
        .map((schema) => schema.fields.filter((field) => field.isArray))
        .flat()
        .filter(Boolean)
        .map(
          (field) =>
            siaTypeSerializerArrayItemMap[
              field.type as keyof typeof siaTypeSerializerArrayItemMap
            ],
        ),
    ),
  );
};

export const getDefaultValueForType = (
  field: SchemaDefinition["fields"][0],
): string => {
  if (field.defaultValue) {
    return `"${field.defaultValue}"`;
  }

  if (field.type.startsWith("int") || field.type.startsWith("uint")) {
    return "0";
  }

  if (field.type === "bool") {
    return "false";
  }

  return '""';
};

export const generateAttribute = (
  field: FieldDefinition,
  schemas: SchemaDefinition[],
): string => {
  if (field.isArray) {
    return createAttributeString(field.name, "[]");
  }

  if (!Object.values(SiaType).includes(field.type as SiaType)) {
    return generateNestedObjectAttribute(field, schemas);
  }

  return createAttributeString(field.name, getDefaultValueForType(field));
};

export const generateNestedObjectAttribute = (
  field: SchemaDefinition["fields"][0],
  schemas: SchemaDefinition[],
): string => {
  const referencedSchema = schemas.find((s) => s.name === field.type);
  if (!referencedSchema) {
    throw new Error(`Referenced schema ${field.type} not found`);
  }

  const nestedFields = referencedSchema.fields
    .map((nestedField) => generateAttribute(nestedField, schemas))
    .join("\n");

  return createAttributeString(field.name, `{\n${nestedFields}\n}`);
};
