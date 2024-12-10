import { existsSync } from "fs";
import path from "path";
import { SchemaDefinition } from "../visitor.js";
import {
  generateAttribute,
  generateSchemaFunctionBody,
  generateTypeFields,
  hasBigInt,
} from "./common/go/index.js";
import {
  createCustomSerializerFunctionDeclarationString,
  createNamedObjectString,
  createSiaImportString,
  createSiaInstanceString,
  createSiaResultString,
  generateTypeString,
} from "./common/go/strings.js";
import { Generator } from "./common/types.js";
import { createLineBreakString } from "./index.js";

export const isGoProject = () => {
  return existsSync(path.join(process.cwd(), "go.mod"));
};

export class GoGenerator implements Generator {
  sir: SchemaDefinition[];

  constructor(schemas: SchemaDefinition[]) {
    this.sir = schemas;
  }

  imports(): string {
    return createSiaImportString(hasBigInt(this.sir));
  }

  types(): string {
    return this.sir
      .map((schema) => {
        const fields = generateTypeFields(schema.fields);
        return generateTypeString(schema.name, fields.join("\n"));
      })
      .join(createLineBreakString(2));
  }

  sampleObject(): string {
    const mainSchema = this.sir[0];
    const fields = mainSchema.fields
      .map((field) => generateAttribute(field, this.sir))
      .join(createLineBreakString());
    const objectType = mainSchema.name;

    return createNamedObjectString(
      mainSchema.name.toLowerCase(),
      fields,
      objectType,
    );
  }

  siaInstance(): string {
    const mainSchema = this.sir[0];
    const instanceName = `${mainSchema.name.toLowerCase()}Sia`;
    let output = createSiaInstanceString(mainSchema.name);
    output += createLineBreakString();

    this.sir.forEach((schema) => {
      output += this.generateSchemaFunction(schema);
      output += createLineBreakString(2);
    });

    output += createLineBreakString(2);
    output += createSiaResultString(mainSchema.name, instanceName);

    return output;
  }

  private generateSchemaFunction(schema: SchemaDefinition): string {
    const fnBody = generateSchemaFunctionBody(schema.fields);
    const fnName = `serialize${schema.name}`;
    const signature = `sia *sializer.Sia, obj *${schema.name}`;
    return createCustomSerializerFunctionDeclarationString(
      fnName,
      signature,
      fnBody,
    );
  }

  toString(): string {
    const parts = [
      "package main",
      "",
      this.imports(),
      "",
      this.types(),
      "",
      this.sampleObject(),
      "",
      this.siaInstance(),
    ];

    return parts.join("\n");
  }
}

export const generateGo = async (schemas: SchemaDefinition[]) => {
  const generator = new GoGenerator(schemas);
  return generator.toString();
};
