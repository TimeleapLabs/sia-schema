import { SchemaDefinition } from "../visitor.js";
import { Extension } from "./common/types.js";
import { generateGo, isGoProject } from "./go.js";
import { generateJs, isJsProject } from "./javascript.js";
import { generatePython, isPythonProject } from "./python.js";
import { generateTs, isTsProject } from "./typescript.js";

export const getExtension = (extension?: string) => {
  if (extension && !Object.values(Extension).includes(extension as Extension)) {
    return null;
  }

  // TODO: Add Ts, Go and Python support
  if (!extension) {
    if (isTsProject()) {
      return Extension.TS;
    } else if (isJsProject()) {
      return Extension.JS;
    } else if (isGoProject()) {
      return Extension.GO;
    } else if (isPythonProject()) {
      return Extension.PY;
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
    case Extension.TS:
      processor = generateTs;
      break;
    case Extension.GO:
      processor = generateGo;
      break;
    case Extension.PY:
      processor = generatePython;
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
