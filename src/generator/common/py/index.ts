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
  createAttributeString,
  createCustomSerializerFunctionCallString,
  createIfConditionString,
  createSiaAddTypeFunctionCallString,
} from "./strings.js";

const execAsync = promisify(exec);

const isPythonInstalled = async (): Promise<boolean> => {
  try {
    await execAsync("python --version");
    await execAsync("autopep8 --version");
    return true;
  } catch {
    return false;
  }
};

export const formatPythonFile = async (filePath: string) => {
  if (await isPythonInstalled()) {
    await execAsync(`autopep8 --in-place --aggressive ${filePath}`);
    console.info("Python file formatted");
  } else {
    console.warn("Python is not installed. Skipping formatting...");
  }
};

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
  if (field.isArray) {
    if (isByteArray(field.type as SiaType)) {
      return "bytearray([])";
    }
    return "[]";
  }
  if (field.defaultValue) {
    return `"${field.defaultValue}"`;
  }
  if (field.type.startsWith("int") || field.type.startsWith("uint")) {
    return "0";
  }
  if (field.type === "bool") {
    return "False";
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

  return createAttributeString(field.name, `{\n${nestedFields}\n}`);
};

export const generateArraySerializer = (
  fieldType: SiaType,
  fieldName: string,
  optional: boolean,
  arraySize?: number,
) => {
  if (isByteArray(fieldType)) {
    return createSiaAddTypeFunctionCallString(
      siaTypeFunctionMap[fieldType],
      fieldName,
      optional,
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
      optional,
      serializer,
    );
  }
};

export const generateSchemaFunctionBody = (fields: FieldDefinition[]) => {
  let fnBody = "";

  fields.forEach((field) => {
    let fieldType = field.type as SiaType;
    const fieldName = `obj["${field.name}"]`;

    if (fieldType === SiaType.String) {
      fieldType = getStringTypeFromLength(field.max);
    }

    let serializer = "";

    if (field.isArray) {
      serializer = generateArraySerializer(
        fieldType,
        fieldName,
        Boolean(field.optional),
        field.arraySize,
      );
    } else if (isAnyString(fieldType) && field.encoding === "ascii") {
      serializer = createSiaAddTypeFunctionCallString(
        "add_ascii",
        fieldName,
        field.optional,
      );
    } else if (!Object.values(SiaType).includes(fieldType)) {
      serializer = createCustomSerializerFunctionCallString(
        fieldType,
        "sia",
        fieldName,
        Boolean(field.optional),
      );
    } else {
      const fn = siaTypeFunctionMap[fieldType];
      if (fn) {
        serializer = createSiaAddTypeFunctionCallString(
          fn,
          fieldName,
          field.optional,
        );
      }
    }

    if (field.optional) {
      fnBody += createIfConditionString(`"${field.name}" in obj`, serializer);
    } else {
      fnBody += serializer;
    }
  });

  return fnBody;
};
