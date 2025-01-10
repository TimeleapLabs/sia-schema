import { FieldDefinition, SchemaDefinition } from "../../../visitor.js";
import { isByteArray } from "../index.js";
import { SiaType } from "../types.js";
import { siaTypeSerializerArrayItemMap } from "./maps.js";
import { createAttributeString, createByteArrayString } from "./strings.js";

export const getRequiredSerializers = (schemas: SchemaDefinition[]) => {
  return Array.from(
    new Set(
      schemas
        .map((schema) =>
          schema.fields.filter(
            (field) => field.isArray && !isByteArray(field.type as SiaType),
          ),
        )
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

const capitalizeFirstLetter = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const generateAttribute = (field: FieldDefinition): string => {
  if (field.isArray && isByteArray(field.type as SiaType)) {
    return createAttributeString(
      field.name,
      createByteArrayString(field.type as SiaType),
    );
  } else if (field.isArray) {
    return createAttributeString(field.name, "[]");
  }

  if (!Object.values(SiaType).includes(field.type as SiaType)) {
    return `${field.name}: empty${capitalizeFirstLetter(field.name)},`;
  }

  return createAttributeString(field.name, getDefaultValueForType(field));
};
