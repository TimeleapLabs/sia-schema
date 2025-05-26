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
      schema.filter((s) => s.type === "schema").map((s) => s.name),
    );
  }

  async toCode(): Promise<string> {
    const parts = [
      `package schema

import sia "github.com/TimeleapLabs/go-sia/v2/pkg"
`,
    ];
    const pluginNotices: string[] = [];

    for (const schema of this.schema) {
      if (schema.type === "schema") {
        parts.push(this.schemaToCode(schema));
      } else if (schema.type === "plugin") {
        pluginNotices.push(
          `// Cannot generate plugin '${schema.name}' due to lack of RPC support in the Go Sia generator.`,
          `// You must connect to this plugin manually via RPC.`,
          `// https://timeleap.swiss/docs/products/sia/highlevel#rpc\n`,
        );
      }
    }

    for (const type of this.knownSchemas) {
      parts.push(this.decodeHelper(type));
    }

    parts.push(...pluginNotices);
    return parts.join("\n");
  }

  schemaToCode(schema: SchemaDefinition): string {
    const structFields = schema.fields
      .map(
        (field) =>
          `  ${this.capitalize(field.name)} ${this.fieldTypeToGoType(field.type as FieldType)} \`json:"${field.name}"\``,
      )
      .join("\n");

    return [
      `type ${schema.name} struct {`,
      structFields,
      `}\n`,
      this.encodeMethod(schema),
      this.decodeMethod(schema),
    ].join("\n");
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

  decodeHelper(typeName: string): string {
    return [
      `func Decode${typeName}(s sia.Sia) *${typeName} {`,
      `  var x ${typeName}`,
      `  return x.FromSiaBytes(s.Bytes())`,
      `}\n`,
    ].join("\n");
  }

  encodeMethod(schema: SchemaDefinition): string {
    const lines = schema.fields.map((field) => {
      const name = this.capitalize(field.name);
      const ref = `p.${name}`;
      const val = this.getRefWithDefault(field, ref);
      return this.getSerializeFunctionName(field, val);
    });

    const formattedLines = lines.map((line, index) =>
      index < lines.length - 1 ? `    ${line}.` : `    ${line}`,
    );

    return [
      `func (p *${schema.name}) Sia() sia.Sia {`,
      `  return sia.New().`,
      ...formattedLines,
      `}\n`,
    ].join("\n");
  }

  decodeMethod(schema: SchemaDefinition): string {
    const lines = schema.fields.map((field) => {
      const name = `p.${this.capitalize(field.name)}`;
      const call = this.getDeserializeFunctionName(field);
      const args = this.getDeserializeFunctionArgs(field);
      return `  ${name} = ${call}${args}`;
    });

    return [
      `func (p *${schema.name}) FromSiaBytes(bytes []byte) *${schema.name} {`,
      `  s := sia.NewFromBytes(bytes)`,
      ...lines,
      `  return p`,
      `}\n`,
    ].join("\n");
  }

  capitalize(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private getStringEncodingSuffix(encoding: string | undefined): string {
    const suffix = this.STRING_ENCODING_MAP[encoding ?? "utf8"];
    if (!suffix) throw new Error(`Unknown string encoding: ${encoding}`);
    return suffix;
  }

  getSerializeFunctionName(field: FieldDefinition, ref: string): string {
    const fieldType = field.type as FieldType;

    if (STRING_TYPES.includes(fieldType as StringType)) {
      const suffix = this.getStringEncodingSuffix(field.encoding as string);
      return `Add${suffix}(${ref})`;
    }
    if (this.BYTE_TYPE_MAP[fieldType]) {
      return `Add${this.BYTE_TYPE_MAP[fieldType]}(${ref})`;
    }
    if (fieldType === "bool") return `AddBool(${ref})`;
    if (NUMBER_TYPES.includes(fieldType as NumberType)) {
      return `Add${this.NUMBER_TYPE_MAP[fieldType]}(${ref})`;
    }

    // custom schema
    return `EmbedSia(${ref}.Sia().GetSia())`;
  }

  getDeserializeFunctionName(field: FieldDefinition): string {
    const fieldType = field.type as FieldType;

    if (STRING_TYPES.includes(fieldType as StringType)) {
      return `s.Read${this.getStringEncodingSuffix(field.encoding as string)}`;
    }
    if (this.BYTE_TYPE_MAP[fieldType]) {
      return `s.Read${this.BYTE_TYPE_MAP[fieldType]}`;
    }
    if (fieldType === "bool") return "s.ReadBool";
    if (NUMBER_TYPES.includes(fieldType as NumberType)) {
      return `s.Read${this.NUMBER_TYPE_MAP[fieldType]}`;
    }

    return `Decode${fieldType}`;
  }

  getDeserializeFunctionArgs(field: FieldDefinition): string {
    if (field.type === "byteN") {
      return `(${this.getFixedLength(field)})`;
    }
    if (FIELD_TYPES.includes(field.type as FieldType)) return "()";
    return "(s)";
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

  private getRefWithDefault(field: FieldDefinition, ref: string): string {
    if (!field.optional || field.defaultValue === undefined) return ref;

    const fieldType = field.type;

    // Only apply default value logic for strings
    if (!STRING_TYPES.includes(fieldType as StringType)) return ref;

    const defaultVal = this.getGoLiteralDefault(field);
    const zero = this.zeroValueForType(fieldType);

    if (defaultVal == zero) return ref;

    return `(func() ${fieldType} {
      if ${ref} == ${zero} {
        return ${defaultVal}
      }
      return ${ref}
    })()`;
  }

  private zeroValueForType(fieldType: string): string {
    if (STRING_TYPES.includes(fieldType as StringType)) return `""`;
    if (this.knownSchemas.has(fieldType)) return `nil`;
    return `nil`;
  }

  private getGoLiteralDefault(field: FieldDefinition): string {
    if (STRING_TYPES.includes(field.type as StringType)) {
      return `"${field.defaultValue}"`;
    }
    return `""`;
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
