import { existsSync } from "fs";
import path from "path";
import * as prettier from "prettier";
import { SchemaDefinition } from "../visitor.js";
import { GenericJsTsGenerator } from "./generic-js-ts.js";

export const isJsProject = () => {
  return existsSync(path.join(process.cwd(), "package.json"));
};

export class JavaScriptGenerator extends GenericJsTsGenerator {
  constructor(schemas: SchemaDefinition[]) {
    super(schemas, false);
  }

  imports(): string {
    return super.imports();
  }

  types(): string {
    return "";
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
}

export const generateJs = async (schemas: SchemaDefinition[]) => {
  const generator = new JavaScriptGenerator(schemas);
  return prettier.format(generator.toString(), { parser: "babel" });
};
