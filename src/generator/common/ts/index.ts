import { FieldDefinition } from "../../../visitor.js";
import { getStringTypeFromLength, isAnyString, isByteArray } from "../index.js";
import { getDefaultValueForType } from "../js/index.js";
import {
  siaTypeArraySizeFunctionMap,
  siaTypeFunctionMap,
  siaTypeSerializerArrayItemMap,
} from "../js/maps.js";
import {
  createCustomSerializerFunctionCallString,
  createSiaAddTypeFunctionCallString,
} from "../js/strings.js";
import { SiaType } from "../types.js";
import { generateInterfaceFieldString } from "./strings.js";

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

export const generateInterfaceFields = (fields: FieldDefinition[]) => {
  return fields.map((field) => {
    return generateInterfaceField(field);
  });
};

export const generateArraySerializer = (
  fieldType: SiaType,
  fieldName: string,
  arraySize?: number,
  defaultValue?: string,
) => {
  if (isByteArray(fieldType)) {
    return createSiaAddTypeFunctionCallString(
      siaTypeFunctionMap[fieldType],
      fieldName,
      undefined,
      defaultValue,
    );
  } else {
    const serializer =
      siaTypeSerializerArrayItemMap[
        fieldType as keyof typeof siaTypeSerializerArrayItemMap
      ];
    return createSiaAddTypeFunctionCallString(
      arraySize
        ? siaTypeArraySizeFunctionMap[arraySize]
        : siaTypeArraySizeFunctionMap[8],
      fieldName,
      serializer,
      defaultValue,
    );
  }
};

export const generateSchemaFunctionBody = (fields: FieldDefinition[]) => {
  let fnBody = "";

  fields.forEach((field) => {
    let fieldType = field.type as SiaType;
    const fieldName = `obj.${field.name}`;

    if (fieldType === SiaType.String) {
      fieldType = getStringTypeFromLength(field.max);
    }

    if (field.isArray) {
      fnBody += generateArraySerializer(
        fieldType,
        fieldName,
        field.arraySize,
        field.optional ? `[]` : undefined,
      );
    } else if (isAnyString(fieldType) && field.encoding === "ascii") {
      fnBody += createSiaAddTypeFunctionCallString(
        "addAscii",
        fieldName,
        undefined,
        field.optional ? '""' : undefined,
      );
    } else if (!Object.values(SiaType).includes(fieldType)) {
      fnBody += createCustomSerializerFunctionCallString(
        fieldType,
        "sia",
        fieldName,
        field.optional ? `empty${fieldType}` : undefined,
      );
    } else {
      const fn = siaTypeFunctionMap[fieldType];
      if (fn) {
        fnBody += createSiaAddTypeFunctionCallString(
          fn,
          fieldName,
          undefined,
          field.optional ? getDefaultValueForType(field) : undefined,
        );
      }
    }
  });

  return fnBody;
};
