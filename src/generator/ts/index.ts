import {
  STRING_TYPES,
  NUMBER_TYPES,
  BYTE_TYPES,
  FIELD_TYPES,
} from "@/generator/common/types.js";

import type {
  FieldType,
  CodeGenerator,
  StringType,
  NumberType,
  ByteType,
} from "@/generator/common/types.js";

import type {
  Definition,
  FieldDefinition,
  MethodDefinition,
  PluginDefinition,
  SchemaDefinition,
} from "@/compiler/visitor.js";

import { camelCase, pascalCase } from "change-case";
import { format } from "prettier";

export class TSGenerator implements CodeGenerator {
  private schema: Definition[];
  private knownSchemas: Set<string>;

  constructor(schema: Definition[]) {
    this.schema = schema;
    this.knownSchemas = new Set(
      this.schema.filter((s) => s.type === "schema").map((s) => s.name),
    );
  }
  async toCode(): Promise<string> {
    const imports = { sia: true, client: false };
    const parts: string[] = [];

    for (const schema of this.schema) {
      if (schema.type === "schema") {
        parts.push(this.schemaToCode(schema));
      } else if (schema.type === "plugin") {
        imports.client = true;
        parts.push(this.pluginToCode(schema));
      }
    }

    const importStatements = [];

    if (imports.sia) {
      importStatements.push("import { Sia } from '@timeleap/sia';");
    }

    if (imports.client) {
      importStatements.push(
        "import { Client, Function } from '@timeleap/client';",
      );
    }

    parts.unshift(importStatements.join("\n"));
    return await format(parts.join("\n\n"), { parser: "typescript" });
  }

  pluginToCode(plugin: PluginDefinition): string {
    const parts = [`export class ${plugin.as} {`];
    parts.push("private methods: Map<string, Function> = new Map();");
    parts.push(`private pluginName = "${plugin.name}";\n`);

    parts.push("  constructor(private client: Client) {}\n");

    parts.push(`static connect(client: Client): ${plugin.as} {`);
    parts.push(`  return new ${plugin.as}(client);`);
    parts.push("}\n");

    parts.push(
      "  public getMethod(method: string, timeout: number, fee: { currency: string, amount: number }): Function {",
    );
    parts.push("    if (!this.methods.has(method)) {");
    parts.push("      this.methods.set(method, this.client.method({");
    parts.push("        plugin: this.pluginName,");
    parts.push("        method,");
    parts.push("        timeout,");
    parts.push("        fee,");
    parts.push("      }));");
    parts.push("    }");
    parts.push("    return this.methods.get(method)!;");
    parts.push("  }\n");

    for (const method of plugin.methods) {
      parts.push(this.methodToCode(method));
    }

    parts.push("}");

    return parts.join("\n");
  }

  methodToCode(method: MethodDefinition): string {
    const parts = [`public async ${method.name}(sia: Sia,`];

    if (Array.isArray(method.fields)) {
      for (const field of method.fields) {
        const optional = field.optional ? "?" : "";
        const tsType = this.fieldTypeToTsType(field as FieldDefinition);
        parts.push(`  ${field.name}${optional}: ${tsType},`);
      }
    } else {
      const field = method.fields;
      const optional = field.optional ? "?" : "";
      const tsType = this.fieldTypeToTsType(field as FieldDefinition);
      parts.push(`  ${field.name}${optional}: ${tsType},`);
    }

    parts.push("): Promise<");

    if (Array.isArray(method.returns)) {
      parts.push("{");
      for (const field of method.returns) {
        const tsType = this.fieldTypeToTsType(field as FieldDefinition);
        parts.push(`  ${field.name}: ${tsType},`);
      }
      parts.push("}");
    } else {
      const field = method.returns;
      const tsType = this.fieldTypeToTsType(field as FieldDefinition);
      parts.push(`${tsType}`);
    }

    parts.push("> {");

    const allFields = Array.isArray(method.fields)
      ? method.fields
      : [method.fields];

    for (const field of allFields) {
      if (field.isArray) {
        const funcName = this.getSerializeFunctionName(field);
        const funcArgs = this.getSerializeFunctionArgs(field);
        parts.push(
          `  sia.addArray8(${field.name}, (s: Sia, v)  => ${funcName}(${funcArgs}v));`,
        );
      } else {
        const funcName = this.getSerializeFunctionName(field);
        const funcArgs = this.getSerializeFunctionArgs(field);
        const value = field.optional
          ? `${field.name} ?? ${this.getTSLiteralDefault(field as FieldDefinition)}`
          : field.name;
        parts.push(`  ${funcName}(${funcArgs}${value});`);
      }
    }

    const timeout = method.timeout ?? "5000";
    const fee = method.fee ?? "0";
    const currency = method.currency ?? "TLP";

    parts.push(
      `  const method = this.getMethod("${method.name}", ${timeout}, { currency: "${currency}", amount: ${fee} });`,
    );
    parts.push("  const response = await method.populate(sia).invoke();");

    const returnsArray = Array.isArray(method.returns)
      ? method.returns
      : [method.returns];

    if (returnsArray.length > 1) {
      for (const field of returnsArray) {
        const funcName = this.getDeserializeFunctionName(field, "response");
        const funcArgs = this.getDeserializeFunctionArgs(field, "response");
        const variable = camelCase(`resp_${field.name}`);
        parts.push(`  const ${variable} = ${funcName}(${funcArgs});`);
      }

      parts.push("  return {");
      for (const field of returnsArray) {
        const variable = camelCase(`resp_${field.name}`);
        parts.push(`    ${field.name}: ${variable},`);
      }
      parts.push("  };");
    } else {
      const field = returnsArray[0];
      const funcName = this.getDeserializeFunctionName(field, "response");
      const funcArgs = this.getDeserializeFunctionArgs(field, "response");
      parts.push(`  const value = ${funcName}(${funcArgs});`);
      parts.push("  return value;");
    }

    parts.push("}\n");
    return parts.join("\n");
  }

  schemaToCode(schema: SchemaDefinition): string {
    const parts: string[] = [];

    parts.push(`export interface ${schema.name} {`);
    for (const field of schema.fields) {
      const optional = field.optional ? "?" : "";
      const tsType = this.fieldTypeToTsType(field as FieldDefinition);
      parts.push(`  ${field.name}${optional}: ${tsType};`);
    }
    parts.push("}\n");

    return (
      parts.join("\n") +
      "\n" +
      this.encodeMethod(schema) +
      "\n" +
      this.decodeMethod(schema)
    );
  }

  private encodeMethod(schema: SchemaDefinition): string {
    const parts: string[] = [];
    const argName = camelCase(schema.name);

    parts.push(
      `export function encode${schema.name}(sia: Sia, ${argName}: ${schema.name}): Sia {`,
    );
    for (const field of schema.fields) {
      let value: string;
      if (field.optional) {
        value = `${argName}.${field.name} ?? ${this.getTSLiteralDefault(field as FieldDefinition)}`;
      } else {
        value = `${argName}.${field.name}`;
      }

      if (field.isArray) {
        const funcName = this.getSerializeFunctionName(field, "s");
        const funcArgs = this.getSerializeFunctionArgs(field);
        parts.push(
          `  sia.addArray8(${value}, (s: Sia, v) => ${funcName}(${funcArgs}v));`,
        );
      } else {
        const funcName = this.getSerializeFunctionName(field);
        const funcArgs = this.getSerializeFunctionArgs(field);
        parts.push(`  ${funcName}(${funcArgs}${value});`);
      }
    }

    parts.push("  return sia;");
    parts.push("}\n");
    return parts.join("\n");
  }

  private decodeMethod(schema: SchemaDefinition): string {
    const parts: string[] = [];

    parts.push(
      `export function decode${schema.name}(sia: Sia): ${schema.name} {`,
    );
    parts.push("  return {");
    for (const field of schema.fields) {
      if (field.isArray) {
        const funcName = this.getDeserializeFunctionName(field, "s");
        const funcArgs = this.getDeserializeFunctionArgs(field);
        parts.push(
          `    ${field.name}: sia.readArray8((s: Sia) => ${funcName}(${funcArgs})),`,
        );
      } else {
        const funcName = this.getDeserializeFunctionName(field);
        const funcArgs = this.getDeserializeFunctionArgs(field);
        parts.push(`    ${field.name}: ${funcName}(${funcArgs}),`);
      }
    }
    parts.push("  };");
    parts.push("}");

    return parts.join("\n");
  }

  private fieldTypeToTsType(field: FieldDefinition): string {
    let tsType: string;

    if (STRING_TYPES.includes(field.type as StringType)) {
      tsType = "string";
    } else if (NUMBER_TYPES.includes(field.type as NumberType)) {
      tsType = "number";
    } else if (BYTE_TYPES.includes(field.type as ByteType)) {
      tsType = "Uint8Array | Buffer";
    } else if (field.type === "bool") {
      tsType = "boolean";
    } else if (this.knownSchemas.has(field.type)) {
      tsType = field.type;
    } else {
      throw new Error(
        `Unknown field type: '${field.type}'. If this is a custom type, please declare a schema with that name.`,
      );
    }

    return field.isArray ? `${tsType}[]` : tsType;
  }

  private getSerializeFunctionName(
    field: FieldDefinition,
    sia = "sia",
  ): string {
    if (field.type === "string") {
      if (field.encoding === "ascii") {
        return `${sia}.addAscii`;
      }

      throw new Error(`Unknown encoding: ${field.encoding}`);
    }

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      switch (field.type) {
        case "byteN":
          return `${sia}.addByteArrayN`;
        case "byte8":
          return `${sia}.addByteArray8`;
        case "byte16":
          return `${sia}.addByteArray16`;
        case "byte32":
          return `${sia}.addByteArray32`;
        case "byte64":
          return `${sia}.addByteArray64`;
      }
    }

    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      switch (field.type) {
        case "uint8":
          return `${sia}.addUInt8`;
        case "uint16":
          return `${sia}.addUInt16`;
        case "uint32":
          return `${sia}.addUInt32`;
        case "uint64":
          return `${sia}.addUInt64`;
      }
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return `${sia}.add${pascalCase(field.type)}`;
    }

    return `encode${pascalCase(field.type)}`;
  }

  private getSerializeFunctionArgs(field: FieldDefinition): string {
    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return "";
    }

    return "sia, ";
  }

  private getDeserializeFunctionName(
    field: FieldDefinition,
    sia = "sia",
  ): string {
    if (field.type === "string") {
      if (field.encoding === "ascii") {
        return `${sia}.readAscii`;
      }

      throw new Error(`Unknown encoding: ${field.encoding}`);
    }

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      switch (field.type) {
        case "byteN":
          return `${sia}.readByteArrayN`;
        case "byte8":
          return `${sia}.readByteArray8`;
        case "byte16":
          return `${sia}.readByteArray16`;
        case "byte32":
          return `${sia}.readByteArray32`;
        case "byte64":
          return `${sia}.readByteArray64`;
      }
    }

    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      switch (field.type) {
        case "uint8":
          return `${sia}.readUInt8`;
        case "uint16":
          return `${sia}.readUInt16`;
        case "uint32":
          return `${sia}.readUInt32`;
        case "uint64":
          return `${sia}.readUInt64`;
      }
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return `${sia}.read${pascalCase(field.type)}`;
    }

    return `decode${pascalCase(field.type)}`;
  }

  private getDeserializeFunctionArgs(
    field: FieldDefinition,
    sia = "sia",
  ): string {
    if (field.type === "byteN") {
      return this.getFixedLength(field);
    }

    if (FIELD_TYPES.includes(field.type as FieldType)) {
      return "";
    }

    return sia;
  }

  private getFixedLength(field: FieldDefinition): string {
    if (field.length) {
      return field.length.toString();
    }

    if (field.fromEnd) {
      return `sia.offset - sia.length - ${field.fromEnd}`;
    }

    throw new Error(
      `Field ${field.name} is of fixed length but has no length specified.`,
    );
  }

  private getTSLiteralDefault(field: FieldDefinition): string {
    if (field.isArray) {
      return "[]";
    }
    if (STRING_TYPES.includes(field.type as StringType)) {
      return '""';
    }

    if (NUMBER_TYPES.includes(field.type as NumberType)) {
      return "0";
    }

    if (BYTE_TYPES.includes(field.type as ByteType)) {
      return "new Uint8Array(0)";
    }

    if (field.type === "bool") {
      return "false";
    }

    return "null";
  }
}
