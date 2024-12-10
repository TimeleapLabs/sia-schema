import { SchemaDefinition } from "../visitor.js";
import {
  generateAttribute,
  getRequiredSerializers,
} from "./common/js/index.js";
import {
  createCustomSerializerFunctionCallString,
  createCustomSerializerFunctionDeclarationString,
  createNamedObjectString,
  createSiaImportString,
  createSiaInstanceString,
  createSiaResultString,
} from "./common/js/strings.js";
import {
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
    return createSiaImportString(["Sia", ...requiredSerializers]);
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
    const mainSchema = this.sir[0];
    const fields = mainSchema.fields
      .map((field) => generateAttribute(field, this.sir))
      .join(createLineBreakString());
    const objectType = mainSchema.name;

    return createNamedObjectString(
      mainSchema.name.toLowerCase(),
      fields,
      this.typed ? objectType : undefined,
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

    output += createCustomSerializerFunctionCallString(
      mainSchema.name,
      instanceName,
      mainSchema.name.toLowerCase(),
    );
    output += createLineBreakString(2);
    output += createSiaResultString(instanceName);

    return output;
  }

  private generateSchemaFunction(schema: SchemaDefinition): string {
    const fnBody = generateSchemaFunctionBody(schema.fields);
    const fnName = `serialize${schema.name}`;
    const signature = this.typed ? `sia: Sia, obj: ${schema.name}` : `sia, obj`;
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
    ];

    return parts.join("\n");
  }
}
