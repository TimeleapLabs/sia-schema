import {
  STRING_TYPES,
  NUMBER_TYPES,
  BYTE_TYPES,
} from "@/generator/common/types.js";

import type {
  StringType,
  NumberType,
  ByteType,
  CodeGenerator,
} from "@/generator/common/types.js";

import type {
  Definition,
  FieldDefinition,
  SchemaDefinition,
} from "@/compiler/visitor.js";

import { camelCase, pascalCase } from "change-case";

export class CPPGenerator implements CodeGenerator {
  private schema: Definition[];
  private knownSchemas: Set<string>;

  constructor(schema: Definition[]) {
    this.schema = schema;
    this.knownSchemas = new Set(
      this.schema.filter((s) => s.type === "schema").map((s) => s.name),
    );
  }

  async toCode(): Promise<string> {
    const { hpp, cpp } = await this.toHeaderAndSource();
    return hpp + "\n\n" + cpp;
  }

  schemaToCode(schema: SchemaDefinition): string {
    return this.schemaToHppAndCpp(schema).hpp;
  }

  async toHeaderAndSource(
    fileName?: string,
  ): Promise<{ hpp: string; cpp: string }> {
    const baseName = fileName ?? "header";

    const hppParts: string[] = [
      `// ${baseName}.hpp`,
      "#pragma once",
      [
        "#include <sia/sia.hpp>",
        "#include <vector>",
        "#include <string>",
        "#include <memory>",
      ].join("\n"),
    ];

    const cppParts: string[] = [`#include "${baseName}.hpp"`];

    for (const definition of this.schema) {
      if (definition.type === "schema") {
        const { hpp, cpp } = this.schemaToHppAndCpp(definition);
        hppParts.push(hpp);
        cppParts.push(cpp);
      } else if (definition.type === "plugin") {
        cppParts.push(this.pluginNotice(definition.name));
      }
    }

    return {
      hpp: hppParts.join("\n\n"),
      cpp: cppParts.join("\n\n"),
    };
  }

  schemaToHppAndCpp(
    schema: SchemaDefinition,
    includeSerialization = true,
  ): { hpp: string; cpp: string } {
    const structName = pascalCase(schema.name);
    const varName = camelCase(schema.name);

    const hppParts = [`struct ${structName} {`];
    for (const field of schema.fields) {
      const cppType = this.fieldTypeToCppType(field);
      hppParts.push(`  ${cppType} ${field.name};`);
    }
    hppParts.push(`}; \n`);

    if (includeSerialization) {
      hppParts.push(
        `std::shared_ptr<sia::Sia> encode${structName}(const ${structName}& ${varName});`,
        `${structName} decode${structName}(std::shared_ptr<sia::Sia> sia);`,
      );

      const cppParts = [
        `std::shared_ptr<sia::Sia> encode${structName}(const ${structName}& ${varName}) {`,
        `  auto sia = sia::New();`,
      ];
      for (const field of schema.fields) {
        const code = this.getSerializeFunctionName(
          field,
          `${varName}.${field.name}`,
        );
        cppParts.push(`  ${code};`);
      }
      cppParts.push(`  return sia;`);
      cppParts.push(`} \n`);

      cppParts.push(
        `${structName} decode${structName}(std::shared_ptr<sia::Sia> sia) {`,
      );
      cppParts.push(`  ${structName} result;`);
      for (const field of schema.fields) {
        const code = this.getDeSerializeFunctionArgs(
          field,
          "sia",
          `result.${field.name}`,
        );
        cppParts.push(code);
      }
      cppParts.push(`  return result;`);
      cppParts.push(`}`);

      return {
        hpp: hppParts.join("\n"),
        cpp: cppParts.join("\n"),
      };
    } else {
      return {
        hpp: hppParts.join("\n"),
        cpp: "",
      };
    }
  }

  private pluginNotice(name: string): string {
    return [
      `// Plugin '${name}' is not supported in C++ generator.`,
      `// RPC support must be implemented manually.`,
      `// See: https://timeleap.swiss/docs/products/sia/highlevel#rpc`,
    ].join("\n");
  }

  private fieldTypeToCppType(field: FieldDefinition): string {
    if (STRING_TYPES.includes(field.type as StringType)) return "std::string";
    if (NUMBER_TYPES.includes(field.type as NumberType)) return "uint64_t";
    if (field.type === "bool") return "bool";
    if (BYTE_TYPES.includes(field.type as ByteType))
      return "std::vector<uint8_t>";

    if (!this.knownSchemas.has(field.type)) {
      throw new Error(
        `Unknown field type: '${field.type}'. If this is a custom type, please declare a schema with that name.`,
      );
    }

    return pascalCase(field.type);
  }

  stringEncodingMap: Record<string, string> = {
    ascii: "String8",
    utf8: "String8",
    utf16: "String16",
    utf32: "String32",
    utf64: "String64",
  };

  numbersEncodingMap: Record<string, string> = {
    int8: "Int8",
    int16: "Int16",
    int32: "Int32",
    int64: "Int64",
    uint8: "UInt8",
    uint16: "UInt16",
    uint32: "UInt32",
    uint64: "UInt64",
  };

  byteArrayEncodingMap: Record<string, string> = {
    byte8: "ByteArray8",
    byte16: "ByteArray16",
    byte32: "ByteArray32",
    byte64: "ByteArray64",
  };

  private getSerializeFunctionName(
    field: FieldDefinition,
    accessExpr: string,
  ): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      const funcSuffix =
        this.stringEncodingMap[(field.encoding ?? "utf8") as string];
      return `sia->Add${funcSuffix}(${accessExpr})`;
    }
    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      const suffix = this.numbersEncodingMap[field.type];
      return `sia->Add${suffix}(${accessExpr})`;
    }
    if (field.type === "bool") {
      return `sia->AddBool(${accessExpr})`;
    }

    if (field.type === "byteN") {
      return `sia->AddByteArrayN(${accessExpr})`;
    }

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      const funcSuffix = this.byteArrayEncodingMap[field.type];
      return `sia->Add${funcSuffix}(${accessExpr})`;
    }
    return `auto embedded = encode${pascalCase(field.type)}(${accessExpr});\n  sia->EmbedSia(embedded)`;
  }

  private getDeSerializeFunctionArgs(
    field: FieldDefinition,
    siaVar: string,
    targetExpr: string,
  ): string {
    const assign = (val: string) => `  ${targetExpr} = ${val};`;
    if (STRING_TYPES.includes(field.type as StringType)) {
      return assign(
        `${siaVar}->Read${this.stringEncodingMap[(field.encoding ?? "utf8") as string]}()`,
      );
    }
    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      return assign(`${siaVar}->Read${this.numbersEncodingMap[field.type]}()`);
    }
    if (field.type === "bool") {
      return assign(`${siaVar}->ReadBool()`);
    }
    if (field.type === "byteN") {
      return assign(`${siaVar}->ReadByteArrayN(${field.length})`);
    }

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      return assign(
        `${siaVar}->Read${this.byteArrayEncodingMap[field.type]}()`,
      );
    }
    return assign(`decode${pascalCase(field.type)}(${siaVar})`);
  }
}
