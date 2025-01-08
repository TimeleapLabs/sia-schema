export const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const createSiaImportString = (hasBigInt: boolean) => {
  let importString = "import (\n";
  if (hasBigInt) {
    importString += '"math/big"\n';
  }
  importString += 'sializer "github.com/TimeleapLabs/go-sia/v2/pkg"\n';

  return importString + ")";
};

export const generateTypeString = (typeName: string, body: string) => {
  return `type ${typeName} struct {\n${body}\n}`;
};

export const generateTypeFieldString = (
  name: string,
  type: string,
  optional: boolean = false,
) => {
  return `${capitalizeFirstLetter(name)} ${optional ? "*" : ""}${type}`;
};

export const createAttributeString = (name: string, value: string) => {
  return `${capitalizeFirstLetter(name)}: ${value},`;
};

export const createNamedObjectString = (
  name: string,
  body: string,
  type: string,
) => {
  return `var ${name} = ${type}{\n${body}\n};\n`;
};

export const createSiaInstanceString = (schemaName: string) => {
  return `var ${schemaName.toLowerCase()}Sia = sializer.New()\n`;
};

export const createSiaAddTypeFunctionCallString = (
  fn: string,
  fieldName: string,
  serializer?: string,
) => {
  const serializerArg = serializer ? `, sializer.${serializer}` : "";
  return `sia.${fn}(${fieldName}${serializerArg})\n`;
};

export const createIfConditionString = (condition: string, body: string) => {
  return `if ${condition} {\n${body}}\n`;
};

export const createCustomSerializerFunctionCallString = (
  serializer: string,
  siaInstance: string,
  fieldName: string,
) => {
  return `serialize${capitalizeFirstLetter(serializer)}(${siaInstance}, ${fieldName})\n`;
};

export const createCustomSerializerFunctionDeclarationString = (
  fnName: string,
  signature: string,
  body: string,
) => {
  return `func ${fnName}(${signature}) *sializer.Sia {\n${body}return sia\n}\n`;
};

export const createSiaResultString = (
  schemaName: string,
  instanceName: string,
) => {
  return `
  func main() {
  serialize${schemaName}(${instanceName}, &${schemaName.toLowerCase()})
  result := ${instanceName}.Content()
  _ = result
  }
  `;
};
