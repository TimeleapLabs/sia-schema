import {
  STRING_TYPES,
  NUMBER_TYPES,
  BYTE_TYPES,
  FIELD_TYPES,
} from "@/generator/common/types.js";

import type {
  CodeGenerator,
  FieldType,
  StringType,
  NumberType,
  ByteType,
} from "@/generator/common/types.js";

import type {
  Definition,
  FieldDefinition,
  SchemaDefinition,
} from "@/compiler/visitor.js";

export class GoGenerator implements CodeGenerator {
  private schema: Definition[];
  private knownSchemas: Set<string>;

  constructor(schema: Definition[]) {
    this.schema = schema;
    this.knownSchemas = new Set(
      this.schema.filter((s) => s.type === "schema").map((s) => s.name),
    );
  }

  async toCode(): Promise<string> {
    const parts: string[] = [
      'package schema\n\nimport sia "github.com/TimeleapLabs/go-sia/v2/pkg"\n',
    ];
    const pluginNotices: string[] = [];

    for (const schema of this.schema) {
      if (schema.type === "schema") {
        parts.push(this.schemaToCode(schema));
      } else if (schema.type === "plugin") {
        pluginNotices.push(
          `// Cannot generate plugin '${schema.name}' due to lack of RPC support in the Go Sia generator.`,
        );
        pluginNotices.push(
          `// You must connect to this plugin manually via RPC.`,
        );
        pluginNotices.push(
          `// https://timeleap.swiss/docs/products/sia/highlevel#rpc\n`,
        );
      }
    }

    parts.push(...pluginNotices);
    return parts.join("\n\n");
  }

  schemaToCode(schema: SchemaDefinition): string {
    const parts: string[] = [];

    parts.push(`type ${schema.name} struct {`);
    for (const field of schema.fields) {
      const goType = this.fieldTypeToGoType(field.type as FieldType);
      parts.push(`    ${this.capitalize(field.name)} ${goType}`);
    }
    parts.push("}\n");

    parts.push(this.encodeMethod(schema));
    parts.push(this.decodeMethod(schema));

    return parts.join("\n");
  }

  fieldTypeToGoType(fieldType: FieldType): string {
    if (STRING_TYPES.includes(fieldType as StringType)) return "string";

    if (NUMBER_TYPES.includes(fieldType as NumberType)) return fieldType;
    if (BYTE_TYPES.includes(fieldType as ByteType)) return "[]byte";
    if (fieldType === "bool") return "bool";

    if (!this.knownSchemas.has(fieldType)) {
      throw new Error(`Unknown field type: '${fieldType}'`);
    }
    return `*${fieldType}`;
  }

  encodeMethod(schema: SchemaDefinition): string {
    const lines: string[] = [];
    lines.push(`func (x *${schema.name}) Encode(sia sia.Sia) sia.Sia {`);
    for (const field of schema.fields) {
      const name = this.capitalize(field.name);
      const fn = this.getSerializeFunctionName(field, `x.${name}`);
      lines.push(`    ${fn}`);
    }
    lines.push("    return sia");
    lines.push("}");
    return lines.join("\n");
  }

  decodeMethod(schema: SchemaDefinition): string {
    const assignments: string[] = schema.fields.map((f) => {
      const name = this.capitalize(f.name);
      const call = this.getDeserializeFunctionName(f);
      const args = this.getDeserializeFunctionArgs(f);
      return `        ${name}: ${call}${args},`;
    });

    return `func Decode${schema.name}(sia sia.Sia) *${schema.name} {
    return &${schema.name}{
${assignments.join("\n")}
    }
}`;
  }

  capitalize(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  getSerializeFunctionName(field: FieldDefinition, ref: string): string {
    if (field.type.startsWith("string")) {
      const suffix = this.STRING_ENCODING_MAP[field.encoding as string];
      if (!suffix)
        throw new Error(`Unknown string encoding: ${field.encoding}`);
      return `sia.Add${suffix}(${ref})`;
    }
    if (this.BYTE_TYPE_MAP[field.type])
      return `sia.Add${this.BYTE_TYPE_MAP[field.type]}(${ref})`;
    if (field.type === "bool") return `sia.AddBool(${ref})`;
    if (NUMBER_TYPES.includes(field.type as NumberType))
      return `sia.Add${this.NUMBER_TYPE_MAP[field.type]}(${ref})`;

    // custom schema
    return `${ref}.Encode(sia)`;
  }

  getDeserializeFunctionName(field: FieldDefinition): string {
    if (field.type.startsWith("string")) {
      const suffix = this.STRING_ENCODING_MAP[field.encoding as string];
      if (!suffix)
        throw new Error(`Unknown string encoding: ${field.encoding}`);
      return `sia.Read${suffix}`;
    }
    if (this.BYTE_TYPE_MAP[field.type])
      return `sia.Read${this.BYTE_TYPE_MAP[field.type]}`;

    if (field.type === "bool") return "sia.ReadBool";

    if (NUMBER_TYPES.includes(field.type as NumberType))
      return `sia.Read${this.NUMBER_TYPE_MAP[field.type]}`;

    return `Decode${field.type}`;
  }

  getDeserializeFunctionArgs(field: FieldDefinition): string {
    if (field.type === "byteN") {
      const fixedLength = this.getFixedLength(field);
      return `(${fixedLength})`;
    }
    if (FIELD_TYPES.includes(field.type as FieldType)) return "()";
    return "(sia)";
  }

  private getFixedLength(field: FieldDefinition): string {
    if (field.length) {
      return field.length.toString();
    }
    if (field.fromEnd) {
      return `sia.Offset - sia.Length - ${field.fromEnd}`;
    }
    throw new Error(
      `Field ${field.name} is of fixed length but has no length specified.`,
    );
  }

  STRING_ENCODING_MAP: Record<string, string> = {
    ascii: "String8",
    utf8: "String8",
    utf16: "String16",
    utf32: "String32",
    utf64: "String64",
  };

  BYTE_TYPE_MAP: Record<string, string> = {
    byteN: "ByteArrayN",
    byte8: "ByteArray8",
    byte16: "ByteArray16",
    byte32: "ByteArray32",
    byte64: "ByteArray64",
  };

  NUMBER_TYPE_MAP: Record<string, string> = {
    int8: "Int8",
    int16: "Int16",
    int32: "Int32",
    int64: "Int64",
    uint8: "UInt8",
    uint16: "UInt16",
    uint32: "UInt32",
    uint64: "UInt64",
  };
}
