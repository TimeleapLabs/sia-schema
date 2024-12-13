export const snakify = (str: string) => {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
};

export const createSiaImportString = (imports: string[]) => {
  if (imports.length === 0) {
    return "";
  }

  return `from sia import (\n${imports.join(",\n")}\n)`;
};

export const createAttributeString = (name: string, value: string) => {
  return `"${name}": ${value},`;
};

export const createNamedObjectString = (name: string, body: string) => {
  return `${name} = {\n${body}\n};\n`;
};

export const createSiaInstanceString = (schemaName: string) => {
  return `${schemaName.toLowerCase()}_sia = Sia()\n`;
};

export const createSiaAddTypeFunctionCallString = (
  fn: string,
  fieldName: string,
  optional: boolean = false,
  serializer?: string,
) => {
  const serializerArg = serializer ? `, ${serializer}` : "";
  return `    ${optional ? "    " : ""}sia.${fn}(${fieldName}${serializerArg})\n`;
};

export const createIfConditionString = (condition: string, body: string) => {
  return `    if ${condition}:\n${body}`;
};

export const createCustomSerializerFunctionCallString = (
  serializer: string,
  siaInstance: string,
  fieldName: string,
  optional: boolean = false,
) => {
  return `    ${optional ? "    " : ""}serialize${snakify(serializer)}(${siaInstance}, ${fieldName})\n`;
};

export const createCustomSerializerFunctionDeclarationString = (
  fnName: string,
  signature: string,
  body: string,
) => {
  return `def ${fnName}(${signature}) -> Sia:\n${body}    return sia\n`;
};

export const createSiaResultString = (
  schemaName: string,
  instanceName: string,
) => {
  return `
serialize_${schemaName}(${instanceName}, ${schemaName.toLowerCase()})
result = ${instanceName}.content
  `;
};
