import { SiaType } from "../types.js";

export const createAttributeString = (name: string, value: string) => {
  return `${name}: ${value},`;
};

export const createSiaImportString = (imports: string[]) => {
  if (imports.length === 0) {
    return "";
  }

  return `import { ${imports.join(", ")} } from "@timeleap/sia";`;
};

export const createSiaAddTypeFunctionCallString = (
  fn: string,
  fieldName: string,
  serializer?: string,
  defaultValue?: string,
) => {
  const serializerArg = serializer ? `, ${serializer}` : "";
  return `sia.${fn}(${fieldName}${defaultValue ? ` ?? ${defaultValue}` : ""}${serializerArg});\n`;
};

export const createSiaReadArrayFunctionCallString = (
  arrayFn: string,
  typeFn: string,
  fieldName: string,
  schemaType?: string,
) => {
  return `${fieldName}: sia.${arrayFn}((sia${schemaType ? `: Sia` : ""}) => {
    return sia.${typeFn}()
  }),\n`;
};

export const createSiaReadTypeFunctionCallString = (
  fn: string,
  fieldName: string,
) => {
  return `${fieldName}: sia.${fn}(),\n`;
};

export const createIfConditionString = (condition: string, body: string) => {
  return `if (${condition}) {\n${body}\n}\n`;
};

export const createCustomSerializerFunctionDeclarationString = (
  fnName: string,
  signature: string,
  body: string,
) => {
  return `export function ${fnName}(${signature}) {\n${body}\nreturn sia;\n}\n`;
};

export const createDeserializerFunctionDeclarationString = (
  fnName: string,
  signature: string,
  body: string,
) => {
  return `export function ${fnName}(${signature}) {\n${body}\nreturn obj;\n}\n`;
};

export const createCustomSerializerFunctionCallString = (
  serializer: string,
  siaInstance: string,
  fieldName: string,
  defaultValue?: string,
) => {
  return `serialize${serializer}(${siaInstance}, ${fieldName}${defaultValue ? ` ?? ${defaultValue}` : ""});\n`;
};

export const createCustomDeserializerFunctionCallString = (
  deserializer: string,
  siaInstance: string,
  fieldName: string,
) => {
  return `${fieldName}: deserialize${deserializer}(${siaInstance}),\n`;
};

export const createNamedObjectString = (
  name: string,
  body: string,
  type?: string,
) => {
  const typeString = type ? `: ${type}` : "";
  return `const ${name}${typeString} = {\n${body}\n};\n`;
};

export const createSiaInstanceString = (schemaName: string) => {
  return `const ${schemaName.toLowerCase()}Sia = new Sia();\n`;
};

export const createSiaResultString = (instanceName: string) => {
  return `const result = ${instanceName}.content;`;
};

export const createByteArrayString = (type: SiaType) => {
  const jsType = "new Uint8Array()";

  switch (type) {
    case SiaType.ByteArray16:
      return "new Uint16Array()";
    case SiaType.ByteArray32:
      return "new Uint32Array()";
    case SiaType.ByteArray64:
      return "new BigUint64Array()";
    default:
      return jsType;
  }
};
