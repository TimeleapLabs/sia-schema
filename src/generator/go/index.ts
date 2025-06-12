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
  MethodDefinition,
  PluginDefinition,
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

    for (const schema of this.schema) {
      if (schema.type === "schema") {
        parts.push(this.schemaToCode(schema));
      } else if (schema.type === "plugin") {
        parts.push(this.pluginToCode(schema));
      }
    }

    for (const type of this.knownSchemas) {
      parts.push(this.decodeHelper(type));
    }

    return parts.join("\n");
  }

  pluginToCode(schema: PluginDefinition): string {
    return [
      `// Cannot generate plugin '${schema.name}' due to lack of RPC support in the Go Sia generator.`,
      `// You must connect to this plugin manually via RPC.`,
      `// https://timeleap.swiss/docs/products/sia/highlevel#rpc\n`,
    ].join("\n");
  }

  methodToCode(method: MethodDefinition): string {
    // Not implemented yet
    return `// method ${method} not implemented`;
  }

  schemaToCode(schema: SchemaDefinition): string {
    const structFields = schema.fields
      .map(
        (field) =>
          `  ${this.capitalize(field.name)} ${this.fieldTypeToGoType(field as FieldDefinition)} \`json:"${field.name}"\``,
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

  decodeHelper(typeName: string): string {
    return [
      `func (p *${typeName}) FromSiaBytes(bytes []byte) *${typeName} {`,
      `  s := sia.NewFromBytes(bytes)`,
      ` 	return p.FromSia(s)`,
      `}\n`,
    ].join("\n");
  }

  encodeMethod(schema: SchemaDefinition): string {
    const parts = [
      `func (p *${schema.name}) Sia() sia.Sia {`,
      `  s := sia.New()`,
    ];

    for (const field of schema.fields) {
      if (!field.isArray) {
        const ref = `p.${this.capitalize(field.name)}`;
        const val = this.getRefWithDefault(field, ref);
        const call = this.getSerializeFunctionName(field, val);
        parts.push(`  s.${call}`);
      }
    }

    for (const field of schema.fields.filter((f) => f.isArray)) {
      const goType = this.fieldTypeToGoType(field as FieldDefinition);
      const elementType = goType.startsWith("[]") ? goType.slice(2) : goType;
      const fieldName = this.capitalize(field.name);

      parts.push(`  {`);
      parts.push(`    arr := sia.NewSiaArray[${elementType}]()`);

      parts.push(
        `    arr.AddArray8(p.${fieldName}, func(s *sia.ArraySia[${elementType}], item ${elementType}) {`,
      );

      if (this.knownSchemas.has(field.type as string)) {
        parts.push(`      s.EmbedBytes(item.Sia().Bytes())`);
      } else {
        const dummyField = { ...field, isArray: false, type: field.type };
        const serFunc = this.getSerializeFunctionName(dummyField, "item");
        parts.push(`      s.${serFunc}`);
      }

      parts.push(`    })`);
      parts.push(`    s.EmbedSia(arr.GetSia())`);
      parts.push(`  }`);
    }

    parts.push(`  return s`);
    parts.push(`}\n`);

    return parts.join("\n");
  }

  decodeMethod(schema: SchemaDefinition): string {
    const parts: string[] = [];

    parts.push(`func (p *${schema.name}) FromSia(s sia.Sia) *${schema.name} {`);

    for (const field of schema.fields.filter((f) => !f.isArray)) {
      const name = `p.${this.capitalize(field.name)}`;
      const fieldType = field.type as string;

      if (this.knownSchemas.has(fieldType)) {
        const varName = fieldType.toLowerCase();
        parts.push(`  ${varName} := ${fieldType}{}`);
        parts.push(`  ${name} = ${varName}.FromSia(s)`);
      } else {
        const call = this.getDeserializeFunctionName(field);
        const args = this.getDeserializeFunctionArgs(field);
        parts.push(`  ${name} = ${call}${args}`);
      }
    }

    for (const field of schema.fields.filter((f) => f.isArray)) {
      const goType = this.fieldTypeToGoType(field as FieldDefinition);
      const elementType = goType.startsWith("[]") ? goType.slice(2) : goType;

      const fieldName = `p.${this.capitalize(field.name)}`;

      parts.push(`  {`);
      parts.push(`    reader := sia.NewArray[${elementType}](&s)`);

      if (this.knownSchemas.has(field.type as string)) {
        parts.push(
          `    ${fieldName} = reader.ReadArray8(func(s *sia.ArraySia[${elementType}]) ${elementType} {`,
          `      var x ${elementType}`,
          `      return *x.FromSiaBytes(s.Bytes())`,
          `    })`,
        );
      } else {
        const dummyField = { ...field, isArray: false, type: field.type };
        const deserializeCall = this.getDeserializeFunctionName(dummyField);
        const deserializeArgs = this.getDeserializeFunctionArgs(dummyField);
        parts.push(
          `    ${fieldName} = reader.ReadArray8(func(s *sia.ArraySia[${elementType}]) ${elementType} {`,
          `      return ${deserializeCall}${deserializeArgs}`,
          `    })`,
        );
      }

      parts.push(`  }`);
    }

    parts.push(`  return p`);
    parts.push(`}\n`);

    return parts.join("\n");
  }

  fieldTypeToGoType(field: FieldDefinition): string {
    let baseType: string;

    if (STRING_TYPES.includes(field.type as StringType)) {
      baseType = "string";
    } else if (NUMBER_TYPES.includes(field.type as NumberType)) {
      baseType = field.type;
    } else if (BYTE_TYPES.includes(field.type as ByteType)) {
      baseType = "[]byte";
    } else if (field.type === "bool") {
      baseType = "bool";
    } else {
      if (!this.knownSchemas.has(field.type)) {
        throw new Error(`Unknown field type: '${field.type}'`);
      }
      baseType = `*${field.type}`;
    }

    return field?.isArray ? `[]${baseType}` : baseType;
  }

  capitalize(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private getSerializeFunctionName(
    field: FieldDefinition,
    ref: string,
  ): string {
    const fieldType = field.type as FieldType;

    if (field.isArray) {
      const itemType = this.fieldTypeToGoType(field);
      const serializeFunc = this.getSerializeFunctionName(
        { type: field.type } as FieldDefinition,
        "item",
      );
      return `AddArray8(${ref}, func(s *sia.ArraySia[${itemType}], item ${itemType}) {
    s.${serializeFunc}
  })`;
    }

    if (STRING_TYPES.includes(fieldType as StringType)) {
      switch (fieldType) {
        case "string8":
          return `AddString8(${ref})`;
        case "string16":
          return `AddString16(${ref})`;
        case "string32":
          return `AddString32(${ref})`;
        case "string64":
          return `AddString64(${ref})`;
        default:
          throw new Error(`Unsupported string type: ${field.type}`);
      }
    }
    if (BYTE_TYPES.includes(fieldType as ByteType)) {
      switch (fieldType) {
        case "byteN":
          return `AddByteArrayN(${ref})`;
        case "byte8":
          return `AddByteArray8(${ref})`;
        case "byte16":
          return `AddByteArray16(${ref})`;
        case "byte32":
          return `AddByteArray32(${ref})`;
        case "byte64":
          return `AddByteArray64(${ref})`;
        default:
          throw new Error(`Unsupported byte type: ${field.type}`);
      }
    }

    if (fieldType === "bool") {
      return `AddBool(${ref})`;
    }

    if (NUMBER_TYPES.includes(fieldType as NumberType)) {
      switch (fieldType) {
        case "int8":
          return `AddInt8(${ref})`;
        case "int16":
          return `AddInt16(${ref})`;
        case "int32":
          return `AddInt32(${ref})`;
        case "int64":
          return `AddInt64(${ref})`;
        case "uint8":
          return `AddUInt8(${ref})`;
        case "uint16":
          return `AddUInt16(${ref})`;
        case "uint32":
          return `AddUInt32(${ref})`;
        case "uint64":
          return `AddUInt64(${ref})`;
        default:
          throw new Error(`Unsupported string type: ${field.type}`);
      }
    }

    // custom schema
    return `EmbedSia(${ref}.Sia().GetSia())`;
  }

  private getDeserializeFunctionName(field: FieldDefinition): string {
    const fieldType = field.type as FieldType;

    if (STRING_TYPES.includes(fieldType as StringType)) {
      switch (fieldType) {
        case "string8":
          return "s.ReadString8";
        case "string16":
          return "s.ReadString16";
        case "string32":
          return "s.ReadString32";
        case "string64":
          return "s.ReadString64";
        default:
          throw new Error(`Unsupported string type: ${field.type}`);
      }
    }

    if (BYTE_TYPES.includes(fieldType as ByteType)) {
      switch (fieldType) {
        case "byteN":
          return "s.ReadByteArrayN";
        case "byte8":
          return "s.ReadByteArray8";
        case "byte16":
          return "s.ReadByteArray16";
        case "byte32":
          return "s.ReadByteArray32";
        case "byte64":
          return "s.ReadByteArray64";
        default:
          throw new Error(`Unsupported byte type: ${field.type}`);
      }
    }

    if (fieldType === "bool") {
      return "s.ReadBool";
    }

    if (NUMBER_TYPES.includes(fieldType as NumberType)) {
      switch (fieldType) {
        case "int8":
          return "s.ReadInt8";
        case "int16":
          return "s.ReadInt16";
        case "int32":
          return "s.ReadInt32";
        case "int64":
          return "s.ReadInt64";
        case "uint8":
          return "s.ReadUInt8";
        case "uint16":
          return "s.ReadUInt16";
        case "uint32":
          return "s.ReadUInt32";
        case "uint64":
          return "s.ReadUInt64";
        default:
          throw new Error(`Unsupported number type: ${field.type}`);
      }
    }

    if (this.knownSchemas.has(fieldType)) {
      return `${fieldType.toLowerCase()} := ${fieldType}{}\n`;
    }

    return `Decode${fieldType}`;
  }

  private getDeserializeFunctionArgs(field: FieldDefinition): string {
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

    const goFieldType = this.fieldTypeToGoType(field as FieldDefinition);

    return `(func() ${goFieldType} {
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
}
