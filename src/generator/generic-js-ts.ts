import { SchemaDefinition } from "../visitor.js";
import {
  generateAttribute,
  getRequiredSerializers,
  getStringTypeFromLength,
  isAnyString,
} from "./common/js/index.js";
import {
  siaTypeFunctionMap,
  siaTypeSerializerArrayItemMap,
} from "./common/js/maps.js";
import {
  createCustomSerializerFunctionCallString,
  createCustomSerializerFunctionDeclarationString,
  createIfConditionString,
  createNamedObjectString,
  createSiaAddTypeFunctionCallString,
  createSiaImportString,
  createSiaInstanceString,
  createSiaResultString,
} from "./common/js/strings.js";
import { generateInterfaceField } from "./common/ts/index.js";
import { generateInterfaceString } from "./common/ts/strings.js";
import { Generator, SiaType } from "./common/types.js";
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
        const fields = schema.fields.map(generateInterfaceField);
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
    let fnBody = "";

    schema.fields.forEach((field) => {
      let fieldType = field.type as SiaType;
      const fieldName = `obj.${field.name}`;

      if (fieldType === SiaType.String) {
        fieldType = getStringTypeFromLength(field.max);
      }

      if (field.isArray) {
        const serializer =
          siaTypeSerializerArrayItemMap[
            fieldType as keyof typeof siaTypeSerializerArrayItemMap
          ];
        fnBody += createSiaAddTypeFunctionCallString(
          siaTypeFunctionMap[SiaType.Array8],
          fieldName,
          serializer,
        );
      } else if (isAnyString(fieldType) && field.encoding === "ascii") {
        fnBody += createSiaAddTypeFunctionCallString("addAscii", fieldName);
      } else if (!Object.values(SiaType).includes(fieldType)) {
        if (field.optional) {
          fnBody += createIfConditionString(
            fieldName,
            createCustomSerializerFunctionCallString(
              field.type,
              "sia",
              fieldName,
            ),
          );
        } else {
          fnBody += createCustomSerializerFunctionCallString(
            field.type,
            "sia",
            fieldName,
          );
        }
      } else {
        const fn = siaTypeFunctionMap[fieldType];
        if (fn) {
          fnBody += createSiaAddTypeFunctionCallString(fn, fieldName);
        }
      }
    });

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
