export const generateInterfaceString = (typeName: string, body: string) => {
  return `interface ${typeName} {\n${body}\n}`;
};

export const generateInterfaceFieldString = (
  name: string,
  type: string,
  optional: boolean = false,
) => {
  return `${name}${optional ? "?" : ""}: ${type};`;
};