import { SchemaDefinition } from "../visitor.js";
import { Extension } from "./common/types.js";
import { generateJs, isJsProject } from "./javascript.js";

export const getExtension = (extension?: string) => {
  if (extension && !Object.values(Extension).includes(extension as Extension)) {
    return null;
  }

  // TODO: Add Ts, Go and Python support
  if (!extension) {
    if (isJsProject()) {
      return Extension.JS;
    }
  }

  return extension as Extension;
};

export const generateSia = (sir: SchemaDefinition[], extension: Extension) => {
  const schemas = sir.filter((s) => s.type === "schema");
  const functions = sir.filter((s) => s.type === "function");

  if (functions.length > 0) {
    console.warn("Functions are not yet supported.");
  }

  let processor = null;

  switch (extension) {
    case Extension.JS:
      processor = generateJs;
      break;
  }

  if (!processor) {
    throw new Error(`Unsupported extension: ${extension}`);
  }

  return processor(schemas);
};

export const createLineBreakString = (count: number = 1) => {
  return "\n".repeat(count);
};
