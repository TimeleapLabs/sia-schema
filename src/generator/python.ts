import { existsSync } from "fs";
import path from "path";
import { SchemaDefinition } from "../visitor.js";
import {
  generateAttribute,
  generateSchemaFunctionBody,
  getRequiredSerializers,
} from "./common/py/index.js";
import {
  createCustomSerializerFunctionDeclarationString,
  createNamedObjectString,
  createSiaImportString,
  createSiaInstanceString,
  createSiaResultString,
  snakify,
} from "./common/py/strings.js";
import { Generator } from "./common/types.js";
import { createLineBreakString } from "./index.js";

export const isPythonProject = () => {
  return (
    existsSync(path.join(process.cwd(), "pyproject.toml")) ||
    existsSync(path.join(process.cwd(), "pyproject.lock")) ||
    existsSync(path.join(process.cwd(), "requirements.txt"))
  );
};

export class PythonGenerator implements Generator {
  sir: SchemaDefinition[];

  constructor(schemas: SchemaDefinition[]) {
    this.sir = schemas;
  }

  imports(): string {
    const serializers = getRequiredSerializers(this.sir);
    return createSiaImportString(["Sia", ...serializers]);
  }

  types(): string {
    return "";
  }

  sampleObject(): string {
    const mainSchema = this.sir[0];
    const fields = mainSchema.fields
      .map((field) => generateAttribute(field, this.sir))
      .join(createLineBreakString());

    return createNamedObjectString(mainSchema.name.toLowerCase(), fields);
  }

  siaInstance(): string {
    const mainSchema = this.sir[0];
    const instanceName = `${mainSchema.name.toLowerCase()}_sia`;
    let output = createSiaInstanceString(mainSchema.name);
    output += createLineBreakString();

    this.sir.forEach((schema) => {
      output += this.generateSchemaFunction(schema);
      output += createLineBreakString(2);
    });

    output += createLineBreakString(2);
    output += createSiaResultString(
      mainSchema.name.toLowerCase(),
      instanceName,
    );

    return output;
  }

  deserializers(): string {
    return "";
  }

  private generateSchemaFunction(schema: SchemaDefinition): string {
    const fnBody = generateSchemaFunctionBody(schema.fields);
    const fnName = `serialize${snakify(schema.name)}`;
    const signature = `sia: Sia, obj: dict`;
    return createCustomSerializerFunctionDeclarationString(
      fnName,
      signature,
      fnBody,
    );
  }

  toString(): string {
    const parts = [
      this.imports(),
      "",
      this.types(),
      "",
      this.sampleObject(),
      "",
      this.siaInstance(),
      "",
      this.deserializers(),
    ];

    return parts.join("\n");
  }
}

export const generatePython = async (schemas: SchemaDefinition[]) => {
  const generator = new PythonGenerator(schemas);
  return generator.toString();
};
