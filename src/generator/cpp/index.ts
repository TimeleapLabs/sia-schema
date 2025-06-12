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
  FieldType,
} from "@/generator/common/types.js";

import type {
  Definition,
  FieldDefinition,
  MethodDefinition,
  PluginDefinition,
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

  pluginToCode(schema: PluginDefinition): string {
    return [
      `// Plugin '${schema.name}' is not supported in C++ generator.`,
      `// RPC support must be implemented manually.`,
      `// See: https://timeleap.swiss/docs/products/sia/highlevel#rpc`,
    ].join("\n");
  }

  methodToCode(method: MethodDefinition): string {
    // Not implemented yet
    return `// method ${method} not implemented`;
  }

  schemaToCode(schema: SchemaDefinition): string {
    return this.schemaToHppAndCpp(schema).hpp;
  }

  async toHeaderAndSource(
    fileName?: string,
  ): Promise<{ hpp: string; cpp: string }> {
    const baseName = fileName ?? "header";

    const hppParts: string[] = [
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
        hppParts.push(`struct ${pascalCase(definition.name)};`);
      }
    }

    for (const definition of this.schema) {
      if (definition.type === "schema") {
        const { hpp, cpp } = this.schemaToHppAndCpp(definition);
        hppParts.push(hpp);
        cppParts.push(cpp);
      } else if (definition.type === "plugin") {
        cppParts.push(this.pluginToCode(definition));
      }
    }

    return {
      hpp: hppParts.join("\n\n"),
      cpp: cppParts.join("\n\n"),
    };
  }

  schemaToHppAndCpp(
    schema: SchemaDefinition,
    includeSource = true,
  ): { hpp: string; cpp: string } {
    const structName = pascalCase(schema.name);
    const varName = camelCase(schema.name);

    const hppParts = [`struct ${structName} {`];
    for (const field of schema.fields) {
      const cppType = field.isArray
        ? `std::vector<${this.fieldTypeToCppType(field)}>`
        : this.fieldTypeToCppType(field);
      let defaultValueCode = "";

      if (field.defaultValue !== undefined) {
        const defaultLiteral = this.getCppLiteralDefault(field);
        if (defaultLiteral) {
          defaultValueCode = ` = ${defaultLiteral}`;
        }
      }

      hppParts.push(`  ${cppType} ${field.name}${defaultValueCode};`);
    }

    hppParts.push(`}; \n`);

    let cpp = "";

    if (includeSource) {
      hppParts.push(this.encodeHppMethod(structName, varName));
      hppParts.push(this.decodeHppMethod(structName));

      const cppEncode = this.encodeCppSourceMethod(schema, structName, varName);
      const cppDecode = this.decodeCppSourceMethod(schema, structName);
      cpp = [cppEncode, cppDecode].join("\n\n");
    }

    return {
      hpp: hppParts.join("\n"),
      cpp,
    };
  }

  private encodeHppMethod(structName: string, varName: string): string {
    return `std::shared_ptr<sia::Sia> encode${structName}(const ${structName}& ${varName});`;
  }

  private decodeHppMethod(structName: string): string {
    return `${structName} decode${structName}(std::shared_ptr<sia::Sia> sia);`;
  }

  private encodeCppSourceMethod(
    schema: SchemaDefinition,
    structName: string,
    varName: string,
  ): string {
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
    cppParts.push(`}`);
    return cppParts.join("\n");
  }

  private decodeCppSourceMethod(
    schema: SchemaDefinition,
    structName: string,
  ): string {
    const cppParts = [
      `${structName} decode${structName}(std::shared_ptr<sia::Sia> sia) {`,
      `  ${structName} result;`,
    ];

    for (const field of schema.fields) {
      const code = this.getDeSerializeFunctionName(
        field,
        "sia",
        `result.${field.name}`,
      );
      cppParts.push(code);
    }

    cppParts.push(`  return result;`);
    cppParts.push(`}`);
    return cppParts.join("\n");
  }

  private fieldTypeToCppType(field: FieldDefinition): string {
    let baseType: string;

    if (STRING_TYPES.includes(field.type as StringType)) {
      baseType = "std::string";
    } else if (NUMBER_TYPES.includes(field.type as NumberType)) {
      return `${field.type}_t`;
    } else if (field.type === "bool") {
      baseType = "bool";
    } else if (BYTE_TYPES.includes(field.type as ByteType)) {
      baseType = "std::vector<uint8_t>";
    } else if (this.knownSchemas.has(field.type)) {
      baseType = `std::shared_ptr<${pascalCase(field.type)}>`;
    } else throw new Error(`Unknown field type: '${field.type}'`);

    return baseType;
  }

  private getSerializeFunctionName(
    field: FieldDefinition,
    accessExpr: string,
  ): string {
    if (field.isArray) {
      const cppType = this.fieldTypeToCppType(field);
      const encoder = this.encodeArrayHelper(field, cppType);
      return `sia::AddArray8<${cppType}>(sia, ${accessExpr}, ${encoder})`;
    }

    const fieldType = field.type as FieldType;

    if (STRING_TYPES.includes(fieldType as StringType)) {
      switch (fieldType) {
        case "string8":
          return `sia->AddString8(${accessExpr})`;
        case "string16":
          return `sia->AddString16(${accessExpr})`;
        case "string32":
          return `sia->AddString32(${accessExpr})`;
        case "string64":
          return `sia->AddString64(${accessExpr})`;
        default:
          throw new Error(`Unsupported string type: ${fieldType}`);
      }
    }

    if (NUMBER_TYPES.includes(fieldType as NumberType)) {
      switch (fieldType) {
        case "int8":
          return `sia->AddInt8(${accessExpr})`;
        case "int16":
          return `sia->AddInt16(${accessExpr})`;
        case "int32":
          return `sia->AddInt32(${accessExpr})`;
        case "int64":
          return `sia->AddInt64(${accessExpr})`;
        case "uint8":
          return `sia->AddUInt8(${accessExpr})`;
        case "uint16":
          return `sia->AddUInt16(${accessExpr})`;
        case "uint32":
          return `sia->AddUInt32(${accessExpr})`;
        case "uint64":
          return `sia->AddUInt64(${accessExpr})`;
        default:
          throw new Error(`Unsupported number type: ${fieldType}`);
      }
    }

    if (fieldType === "bool") {
      return `sia->AddBool(${accessExpr})`;
    }

    if (fieldType === "byteN") {
      return `sia->AddByteArrayN(${accessExpr})`;
    }

    if (BYTE_TYPES.includes(fieldType as ByteType)) {
      switch (fieldType) {
        case "byte8":
          return `sia->AddByteArray8(${accessExpr})`;
        case "byte16":
          return `sia->AddByteArray16(${accessExpr})`;
        case "byte32":
          return `sia->AddByteArray32(${accessExpr})`;
        case "byte64":
          return `sia->AddByteArray64(${accessExpr})`;
        default:
          throw new Error(`Unsupported byte type: ${fieldType}`);
      }
    }

    return [
      `if (${accessExpr}) {`,
      `  auto embedded = encode${pascalCase(fieldType)}(*${accessExpr});`,
      `  sia->EmbedSia(embedded);`,
      `} else {`,
      `  sia->EmbedSia(sia::New());`,
      `}`,
    ].join("\n  ");
  }

  private getDeSerializeFunctionName(
    field: FieldDefinition,
    siaVar: string,
    targetExpr: string,
  ): string {
    const assign = (val: string) => `  ${targetExpr} = ${val};`;
    const fieldType = field.type as FieldType;

    if (field.isArray) {
      const cppType = this.fieldTypeToCppType(field);
      const decoder = this.decodeArrayHelper(field, cppType);
      return assign(`sia::ReadArray8<${cppType}>(${siaVar}, ${decoder})`);
    }

    if (STRING_TYPES.includes(fieldType as StringType)) {
      switch (fieldType) {
        case "string8":
          return assign(`${siaVar}->ReadString8()`);
        case "string16":
          return assign(`${siaVar}->ReadString16()`);
        case "string32":
          return assign(`${siaVar}->ReadString32()`);
        case "string64":
          return assign(`${siaVar}->ReadString64()`);
        default:
          throw new Error(`Unsupported string type: ${fieldType}`);
      }
    }

    if (NUMBER_TYPES.includes(fieldType as NumberType)) {
      switch (fieldType) {
        case "int8":
          return assign(`${siaVar}->ReadInt8()`);
        case "int16":
          return assign(`${siaVar}->ReadInt16()`);
        case "int32":
          return assign(`${siaVar}->ReadInt32()`);
        case "int64":
          return assign(`${siaVar}->ReadInt64()`);
        case "uint8":
          return assign(`${siaVar}->ReadUInt8()`);
        case "uint16":
          return assign(`${siaVar}->ReadUInt16()`);
        case "uint32":
          return assign(`${siaVar}->ReadUInt32()`);
        case "uint64":
          return assign(`${siaVar}->ReadUInt64()`);
        default:
          throw new Error(`Unsupported number type: ${fieldType}`);
      }
    }

    if (fieldType === "bool") {
      return assign(`${siaVar}->ReadBool()`);
    }

    if (fieldType === "byteN") {
      return assign(`${siaVar}->ReadByteArrayN(${field.length})`);
    }

    if (BYTE_TYPES.includes(fieldType as ByteType)) {
      switch (fieldType) {
        case "byte8":
          return assign(`${siaVar}->ReadByteArray8()`);
        case "byte16":
          return assign(`${siaVar}->ReadByteArray16()`);
        case "byte32":
          return assign(`${siaVar}->ReadByteArray32()`);
        case "byte64":
          return assign(`${siaVar}->ReadByteArray64()`);
        default:
          throw new Error(`Unsupported byte type: ${fieldType}`);
      }
    }

    return assign(
      `std::make_shared<${pascalCase(fieldType)}>(decode${pascalCase(fieldType)}(${siaVar}))`,
    );
  }

  private encodeArrayHelper(field: FieldDefinition, cppType: string): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      const suffix = this.stringSizeTypeSuffixMap[field.type as StringType];
      return `[&](auto self, const ${cppType}& v) { self->Add${suffix}(v); }`;
    }
    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      const suffix = this.numberTypeSuffixMap[field.type as NumberType];
      return `[&](auto self, const ${cppType}& v) { self->Add${suffix}(v); }`;
    }
    if (field.type === "bool") {
      return `[&](auto self, const ${cppType}& v) { self->AddBool(v); }`;
    }
    if (BYTE_TYPES.includes(field.type as ByteType)) {
      const suffix = this.byteArrayTypeSuffixMap[field.type];
      return `[&](auto self, const ${cppType}& v) { self->Add${suffix}(v); }`;
    }
    if (this.knownSchemas.has(field.type)) {
      const encoderName = `encode${cppType}`;
      return `[&](auto self, const ${cppType}& v) { self->EmbedSia(${encoderName}(v)); }`;
    }

    throw new Error(`Unsupported encoder for type: '${field.type}'`);
  }

  private decodeArrayHelper(field: FieldDefinition, cppType: string): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      const suffix = this.stringSizeTypeSuffixMap[field.type as StringType];
      return `[&](auto self) -> ${cppType} { return self->Read${suffix}(); }`;
    }
    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      const suffix = this.numberTypeSuffixMap[field.type as NumberType];
      return `[&](auto self) -> ${cppType} { return self->Read${suffix}(); }`;
    }
    if (field.type === "bool") {
      return `[&](auto self) -> ${cppType} { return self->ReadBool(); }`;
    }
    if (BYTE_TYPES.includes(field.type as ByteType)) {
      const suffix = this.byteArrayTypeSuffixMap[field.type];
      return `[&](auto self) -> ${cppType} { return self->Read${suffix}(); }`;
    }
    if (this.knownSchemas.has(field.type)) {
      const decoderName = `decode${cppType}`;
      return `[&](auto self) -> ${cppType} { return ${decoderName}(self); }`;
    }

    throw new Error(`Unsupported decoder for type: '${field.type}'`);
  }

  private getCppLiteralDefault(field: FieldDefinition): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      const escaped = String(field.defaultValue)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

      return `"${escaped}"`;
    }

    if (this.knownSchemas.has(field.type)) {
      return "{}";
    }

    return "";
  }

  stringSizeTypeSuffixMap: Record<StringType, string> = {
    stringN: "String8",
    string8: "String8",
    string16: "String16",
    string32: "String32",
    string64: "String64",
  };

  numberTypeSuffixMap: Record<NumberType, string> = {
    int8: "Int8",
    int16: "Int16",
    int32: "Int32",
    int64: "Int64",
    uint8: "UInt8",
    uint16: "UInt16",
    uint32: "UInt32",
    uint64: "UInt64",
  };

  byteArrayTypeSuffixMap: Record<string, string> = {
    byte8: "ByteArray8",
    byte16: "ByteArray16",
    byte32: "ByteArray32",
    byte64: "ByteArray64",
  };
}
