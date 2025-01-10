import { existsSync } from "fs";
import path from "path";
import * as prettier from "prettier";
import { SchemaDefinition } from "../visitor.js";
import { GenericJsTsGenerator } from "./generic-js-ts.js";

export const isTsProject = () => {
  return existsSync(path.join(process.cwd(), "package.json"));
};

export class TypeScriptGenerator extends GenericJsTsGenerator {
  constructor(schemas: SchemaDefinition[]) {
    super(schemas, true);
  }

  imports(): string {
    return super.imports();
  }

  types(): string {
    return super.types();
  }

  sampleObject(): string {
    return super.sampleObject();
  }

  siaInstance(): string {
    return super.siaInstance();
  }

  deserializers(): string {
    return super.deserializers();
  }

  toString(): string {
    return super.toString();
  }
}

export const generateTs = async (schemas: SchemaDefinition[]) => {
  const generator = new TypeScriptGenerator(schemas);
  return prettier.format(generator.toString(), { parser: "typescript" });
};
