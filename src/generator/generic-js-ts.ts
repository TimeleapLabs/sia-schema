import { SchemaDefinition } from "../visitor.js";
import {
  generateAttribute,
  getRequiredSerializers,
} from "./common/js/index.js";
import {
  createCustomSerializerFunctionDeclarationString,
  createDeserializerFunctionDeclarationString,
  createNamedObjectString,
  createSiaImportString,
} from "./common/js/strings.js";
import {
  generateDeserializerFunctionBody,
  generateInterfaceFields,
  generateSchemaFunctionBody,
} from "./common/ts/index.js";
import { generateInterfaceString } from "./common/ts/strings.js";
import { Generator } from "./common/types.js";
import { createLineBreakString } from "./index.js";

export class GenericJsTsGenerator implements Generator {
  sir: SchemaDefinition[];
  typed: boolean;

  constructor(schemas: SchemaDefinition[], typed: boolean) {
    this.sir = schemas;
    this.typed = typed;
  }

  imports(): string {
    const requiredSerializers = getRequiredSerializers(this.sir);
    return createSiaImportString(
      [this.typed ? "Sia" : "", ...requiredSerializers].filter(Boolean),
    );
  }

  types(): string {
    return this.sir
      .map((schema) => {
        const fields = generateInterfaceFields(schema.fields);
        return generateInterfaceString(schema.name, fields.join("\n"));
      })
      .join(createLineBreakString(2));
  }

  sampleObject(): string {
    return this.sir
      .sort((a, b) => {
        const nested = a.fields.find((field) => field.type === b.name);
        return nested ? 1 : -1;
      })
      .map((schema) => {
        const fields = schema.fields
          .map((field) => generateAttribute(field))
          .join(createLineBreakString());
        const objectType = schema.name;

        return createNamedObjectString(
          `empty${schema.name}`,
          fields,
          this.typed ? objectType : undefined,
        );
      })
      .join(createLineBreakString(2));
  }

  siaInstance(): string {
    let output = "";

    this.sir.forEach((schema) => {
      output += this.generateSchemaFunction(schema);
      output += createLineBreakString(2);
    });

    return output;
  }

  private generateSchemaFunction(schema: SchemaDefinition): string {
    const fnBody = generateSchemaFunctionBody(schema.fields);
    const fnName = `serialize${schema.name}`;
    const signature = this.typed
      ? `sia: Sia, obj: ${schema.name} = empty${schema.name}`
      : `sia, obj = empty${schema.name}`;
    return createCustomSerializerFunctionDeclarationString(
      fnName,
      signature,
      fnBody,
    );
  }

  deserializers(): string {
    let output = "";

    this.sir.forEach((schema) => {
      output += this.generateDeserializerFunction(schema);
      output += createLineBreakString(2);
    });

    return output;
  }

  private generateDeserializerFunction(schema: SchemaDefinition): string {
    const fnBody = generateDeserializerFunctionBody(
      schema.fields,
      this.typed ? schema.name : "",
    );
    const fnName = `deserialize${schema.name}`;
    const signature = this.typed ? `sia: Sia` : `sia`;
    return createDeserializerFunctionDeclarationString(
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
