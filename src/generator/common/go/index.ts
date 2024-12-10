import { exec } from "child_process";
import { promisify } from "util";
import { FieldDefinition, SchemaDefinition } from "../../../visitor.js";
import { getStringTypeFromLength, isAnyString, isByteArray } from "../index.js";
import { SiaType } from "../types.js";
import {
  siaTypeArraySizeFunctionMap,
  siaTypeFunctionMap,
  siaTypeSerializerArrayItemMap,
} from "./maps.js";
import {
  capitalizeFirstLetter,
  createAttributeString,
  createCustomSerializerFunctionCallString,
  createIfConditionString,
  createSiaAddTypeFunctionCallString,
  generateTypeFieldString,
} from "./strings.js";

const makeArrayType = (type: string) => {
  return `[]${type}`;
};

export const hasBigInt = (schemas: SchemaDefinition[]): boolean => {
  return schemas.some((schema) =>
    schema.fields.some((field) => field.type.startsWith("bigint")),
  );
};

const getGoType = (fieldType: string, isArray: boolean): string => {
  if (isAnyString(fieldType as SiaType)) {
    return isArray ? makeArrayType("string") : "string";
  }
  if (fieldType.startsWith("byte")) {
    return isArray ? makeArrayType("byte") : "Buffer";
  }
  if (fieldType.startsWith("bigint")) {
    return isArray ? makeArrayType("big.Int") : "big.Int";
  }
  return isArray ? makeArrayType(fieldType) : fieldType;
};

export const generateInterfaceField = (field: FieldDefinition) => {
  const type = getGoType(field.type, Boolean(field.isArray));
  return generateTypeFieldString(field.name, type, field.optional);
};

export const generateTypeFields = (fields: FieldDefinition[]) => {
  return fields.map((field) => {
    return generateInterfaceField(field);
  });
};

export const getDefaultValueForType = (
  field: SchemaDefinition["fields"][0],
): string => {
  if (field.optional) {
    return "nil";
  }
  if (field.isArray) {
    if (isAnyString(field.type as SiaType)) {
      return `make([]string, 0)`;
    }
    if (isByteArray(field.type as SiaType)) {
      return `make([]byte, 0)`;
    }
    if (field.type.startsWith("bigint")) {
      return `make([]big.Int, 0)`;
    }
    return `make([]${field.type}, 0)`;
  }
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
  if (Object.values(SiaType).includes(field.type as SiaType)) {
    return createAttributeString(field.name, getDefaultValueForType(field));
  } else {
    return generateNestedObjectAttribute(field, schemas);
  }
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

  return createAttributeString(
    field.type,
    `${field.optional ? "&" : ""}${field.type}{\n${nestedFields}\n}`,
  );
};

const execAsync = promisify(exec);

const isGoInstalled = async (): Promise<boolean> => {
  try {
    await execAsync("go version");
    return true;
  } catch {
    return false;
  }
};

export const formatGoFile = async (filePath: string) => {
  if (await isGoInstalled()) {
    await execAsync(`go fmt ${filePath}`);
    console.info("Go file formatted");
  } else {
    console.warn("Go is not installed. Skipping formatting...");
  }
};

export const generateArraySerializer = (
  fieldType: SiaType,
  fieldName: string,
  arraySize?: number,
) => {
  if (isByteArray(fieldType)) {
    return createSiaAddTypeFunctionCallString(
      siaTypeFunctionMap[fieldType],
      fieldName,
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
    );
  }
};

export const generateSchemaFunctionBody = (fields: FieldDefinition[]) => {
  let fnBody = "";

  fields.forEach((field) => {
    let fieldType = field.type as SiaType;
    const fieldName = `obj.${capitalizeFirstLetter(field.name)}`;

    if (fieldType === SiaType.String) {
      fieldType = getStringTypeFromLength(field.max);
    }

    let serializer = "";

    if (field.isArray) {
      serializer = generateArraySerializer(
        fieldType,
        `${field.optional ? "*" : ""}${fieldName}`,
        field.arraySize,
      );
    } else if (isAnyString(fieldType) && field.encoding === "ascii") {
      serializer = createSiaAddTypeFunctionCallString(
        "AddAscii",
        `${field.optional ? "*" : ""}${fieldName}`,
      );
    } else if (!Object.values(SiaType).includes(fieldType)) {
      serializer = createCustomSerializerFunctionCallString(
        fieldType,
        "sia",
        `${field.optional ? "" : "&"}${fieldName}`,
      );
    } else {
      const fn = siaTypeFunctionMap[fieldType];
      if (fn) {
        serializer = createSiaAddTypeFunctionCallString(
          fn,
          `${field.optional ? "*" : ""}${fieldName}`,
        );
      }
    }

    if (field.optional) {
      fnBody += createIfConditionString(`${fieldName} != nil`, serializer);
    } else {
      fnBody += serializer;
    }
  });

  return fnBody;
};
