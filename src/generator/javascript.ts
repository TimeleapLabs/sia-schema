import { existsSync } from "fs";
import path from "path";
import * as prettier from "prettier";
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
import { Generator, SiaType } from "./common/types.js";
import { createLineBreakString } from "./index.js";

export const isJsProject = () => {
  return existsSync(path.join(process.cwd(), "package.json"));
};

export class JavaScriptGenerator implements Generator {
  sir: SchemaDefinition[];

  constructor(schemas: SchemaDefinition[]) {
    this.sir = schemas;
  }

  imports(): string {
    const requiredSerializers = getRequiredSerializers(this.sir);
    return createSiaImportString(["Sia", ...requiredSerializers]);
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
    return createCustomSerializerFunctionDeclarationString(
      fnName,
      "sia, obj",
      fnBody,
    );
  }

  toString(): string {
    const parts = [
      this.imports(),
      "",
      this.sampleObject(),
      "",
      this.siaInstance(),
    ];

    return parts.join("\n");
  }
}

export const generateJs = async (schemas: SchemaDefinition[]) => {
  const generator = new JavaScriptGenerator(schemas);
  return prettier.format(generator.toString(), { parser: "babel" });
};
