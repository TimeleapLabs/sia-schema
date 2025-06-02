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
    this.schema = this.reorderSchemas();
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
        "#include <sia/array.hpp>",
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
      let defaultValueCode = "";

      if (field.defaultValue !== undefined) {
        if (this.cppLiteralDefault(field))
          defaultValueCode += ` = ${this.cppLiteralDefault(field)}`;
      }

      hppParts.push(`  ${cppType} ${field.name}${defaultValueCode};`);
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
    let baseType: string;

    if (STRING_TYPES.includes(field.type as StringType))
      baseType = "std::string";
    else if (NUMBER_TYPES.includes(field.type as NumberType))
      baseType = "uint64_t";
    else if (field.type === "bool") baseType = "bool";
    else if (BYTE_TYPES.includes(field.type as ByteType))
      baseType = "std::vector<uint8_t>";
    else if (this.knownSchemas.has(field.type))
      baseType = pascalCase(field.type);
    else throw new Error(`Unknown field type: '${field.type}'`);

    return field.isArray ? `std::vector<${baseType}>` : baseType;
  }

  private cppLiteralDefault(field: FieldDefinition): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      const escaped = String(field.defaultValue)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
      // console.log(escaped);

      return `"${escaped}"`;
    }

    if (this.knownSchemas.has(field.type)) {
      return "{}";
    }

    return "";
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
    if (field.isArray) {
      let encoder: string;
      let cppType: string;

      if (STRING_TYPES.includes(field.type as StringType)) {
        cppType = "std::string";

        const suffix =
          this.stringEncodingMap[(field.encoding as string) ?? "utf8"];
        encoder = `[&](auto self, const ${cppType}& v) { self->Add${suffix}(v); }`;
      } else if (NUMBER_TYPES.includes(field.type as NumberType)) {
        cppType = field.type + "_t";
        const suffix = this.numbersEncodingMap[field.type];
        encoder = `[&](auto self, const ${cppType}& v) { self->Add${suffix}(v); }`;
      } else if (field.type === "bool") {
        cppType = "bool";
        encoder = `[&](auto self, const ${cppType}& v) { self->AddBool(v); }`;
      } else if (BYTE_TYPES.includes(field.type as ByteType)) {
        const suffix = this.byteArrayEncodingMap[field.type];
        cppType = "std::vector<uint8_t>";
        encoder = `[&](auto self, const ${cppType}& v) { self->Add${suffix}(v); }`;
      } else if (this.knownSchemas.has(field.type)) {
        cppType = pascalCase(field.type);
        const encoderName = `encode${cppType}`;
        encoder = `[&](auto self, const ${cppType}& v) { self->EmbedSia(${encoderName}(v)); }`;
      } else {
        throw new Error(`Unsupported array element type: '${field.type}'`);
      }

      return `sia::AddArray8<${cppType}>(sia, ${accessExpr}, ${encoder})`;
    }

    if (STRING_TYPES.includes(field.type as StringType)) {
      const funcSuffix =
        this.stringEncodingMap[(field.encoding as string) ?? "utf8"];
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

    if (field.isArray) {
      let decoder: string;
      let cppType: string;

      if (STRING_TYPES.includes(field.type as StringType)) {
        cppType = "std::string";
        const suffix =
          this.stringEncodingMap[(field.encoding as string) ?? "utf8"];
        decoder = `[&](auto self) -> ${cppType} { return self->Read${suffix}(); }`;
      } else if (NUMBER_TYPES.includes(field.type as NumberType)) {
        cppType = field.type + "_t";
        const suffix = this.numbersEncodingMap[field.type];
        decoder = `[&](auto self) -> ${cppType} { return self->Read${suffix}(); }`;
      } else if (field.type === "bool") {
        cppType = "bool";
        decoder = `[&](auto self) -> ${cppType} { return self->ReadBool(); }`;
      } else if (BYTE_TYPES.includes(field.type as ByteType)) {
        cppType = "std::vector<uint8_t>";
        const suffix = this.byteArrayEncodingMap[field.type];
        decoder = `[&](auto self) -> ${cppType} { return self->Read${suffix}(); }`;
      } else if (this.knownSchemas.has(field.type)) {
        cppType = pascalCase(field.type);
        const decoderName = `decode${cppType}`;
        decoder = `[&](auto self) -> ${cppType} { return ${decoderName}(self); }`;
      } else {
        throw new Error(`Unsupported array element type: '${field.type}'`);
      }

      return assign(`sia::ReadArray8<${cppType}>(${siaVar}, ${decoder})`);
    }

    if (STRING_TYPES.includes(field.type as StringType)) {
      return assign(
        `${siaVar}->Read${this.stringEncodingMap[(field.encoding as string) ?? "utf8"]}()`,
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

  // reorders an array of schema definitions so that any schema's dependencies come before the schema itself. (cpp only)
  private reorderSchemas(): Definition[] {
    const schemaMap = new Map<string, SchemaDefinition>();
    const dependencies = new Map<string, Set<string>>();

    for (const def of this.schema) {
      if (def.type === "schema") {
        schemaMap.set(def.name, def);
        const deps = new Set<string>();
        for (const field of def.fields) {
          if (this.knownSchemas.has(field.type)) {
            deps.add(field.type);
          }
        }
        dependencies.set(def.name, deps);
      }
    }

    const visited = new Set<string>();
    const sorted: SchemaDefinition[] = [];

    function visit(name: string) {
      if (visited.has(name)) return;
      visited.add(name);

      for (const dep of dependencies.get(name) ?? []) {
        visit(dep);
      }

      const schema = schemaMap.get(name);
      if (schema) sorted.push(schema);
    }

    // Visit all schemas
    for (const name of schemaMap.keys()) {
      visit(name);
    }

    return sorted;
  }
}
