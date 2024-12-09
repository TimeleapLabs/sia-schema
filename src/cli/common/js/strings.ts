export const createAttributeString = (name: string, value: string) => {
  return `${name}: ${value},`;
};

export const createSiaImportString = (imports: string[]) => {
  if (imports.length === 0) {
    return "";
  }

  return `import { ${imports.join(", ")} } from "sializer";`;
};

export const createSiaAddTypeFunctionCallString = (
  fn: string,
  fieldName: string,
  serializer?: string,
) => {
  const serializerArg = serializer ? `, ${serializer}` : "";
  return `sia.${fn}(${fieldName}${serializerArg});\n`;
};

export const createIfConditionString = (condition: string, body: string) => {
  return `if (${condition}) {\n${body}\n}\n`;
};

export const createCustomSerializerFunctionDeclarationString = (
  fnName: string,
  signature: string,
  body: string,
) => {
  return `function ${fnName}(${signature}) {\n${body}return sia;\n}\n`;
};

export const createCustomSerializerFunctionCallString = (
  serializer: string,
  siaInstance: string,
  fieldName: string,
) => {
  return `serialize${serializer}(${siaInstance}, ${fieldName});\n`;
};

export const createNamedObjectString = (name: string, body: string) => {
  return `const ${name} = {\n${body}\n};\n`;
};

export const createSiaInstanceString = (schemaName: string) => {
  return `const ${schemaName.toLowerCase()}Sia = new Sia();\n`;
};

export const createSiaResultString = (instanceName: string) => {
  return `const result = ${instanceName}.content;`;
};
