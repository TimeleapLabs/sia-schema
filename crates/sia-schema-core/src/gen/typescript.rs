use std::fmt::Write;

use heck::{ToLowerCamelCase, ToPascalCase};

use crate::ir::*;

/// Generate TypeScript code from schema definitions.
pub fn generate(definitions: &[SchemaDefinition]) -> String {
    let gen = TsGenerator::new(definitions);
    gen.generate()
}

struct TsGenerator<'a> {
    definitions: &'a [SchemaDefinition],
}

impl<'a> TsGenerator<'a> {
    fn new(definitions: &'a [SchemaDefinition]) -> Self {
        Self { definitions }
    }

    fn generate(&self) -> String {
        let mut parts: Vec<String> = Vec::new();

        for schema in self.definitions {
            parts.push(self.schema_to_code(schema));
        }

        let mut output = "import { Sia } from \"@timeleap/sia\";".to_string();
        for part in &parts {
            output.push_str("\n\n");
            output.push_str(part);
        }
        output.push('\n');
        output
    }

    fn schema_to_code(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();

        // Interface
        writeln!(out, "export interface {} {{", schema.name).unwrap();
        for field in &schema.fields {
            let optional = if field.optional { "?" } else { "" };
            let ts_type = self.field_type_to_ts_type(field);
            writeln!(out, "  {}{}: {};", field.name, optional, ts_type).unwrap();
        }
        writeln!(out, "}}").unwrap();

        // Encode
        out.push('\n');
        out.push_str(&self.encode_method(schema));
        out.push('\n');

        // Decode
        out.push_str(&self.decode_method(schema));

        out
    }

    fn encode_method(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();
        let arg_name = schema.name.to_lower_camel_case();

        // Check if the single-line signature exceeds 80 chars (prettier wraps)
        let single_line = format!(
            "export function encode{}(sia: Sia, {}: {}): Sia {{",
            schema.name, arg_name, schema.name
        );
        if single_line.len() > 80 {
            writeln!(out, "export function encode{}(", schema.name).unwrap();
            writeln!(out, "  sia: Sia,").unwrap();
            writeln!(out, "  {}: {},", arg_name, schema.name).unwrap();
            writeln!(out, "): Sia {{").unwrap();
        } else {
            writeln!(out, "{}", single_line).unwrap();
        }

        for field in &schema.fields {
            let value = if field.optional {
                format!(
                    "{}.{} ?? {}",
                    arg_name,
                    field.name,
                    self.ts_literal_default(field)
                )
            } else {
                format!("{}.{}", arg_name, field.name)
            };

            if field.is_array {
                let (func_name, _) = self.serialize_func(field, "s");
                writeln!(
                    out,
                    "  sia.addArray8({}, (s: Sia, v) => {}(v));",
                    value, func_name
                )
                .unwrap();
            } else {
                let (func_name, func_args) = self.serialize_func(field, "sia");
                writeln!(out, "  {}({}{});", func_name, func_args, value).unwrap();
            }
        }

        writeln!(out, "  return sia;").unwrap();
        writeln!(out, "}}").unwrap();
        out
    }

    fn decode_method(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();

        writeln!(
            out,
            "export function decode{}(sia: Sia): {} {{",
            schema.name, schema.name
        )
        .unwrap();
        writeln!(out, "  return {{").unwrap();

        for field in &schema.fields {
            if field.is_array {
                let (func_name, _) = self.deserialize_func(field, "s");
                writeln!(
                    out,
                    "    {}: sia.readArray8((s: Sia) => {}()),",
                    field.name, func_name
                )
                .unwrap();
            } else {
                let (func_name, func_args) = self.deserialize_func(field, "sia");
                writeln!(out, "    {}: {}({}),", field.name, func_name, func_args).unwrap();
            }
        }

        writeln!(out, "  }};").unwrap();
        write!(out, "}}").unwrap();
        out
    }

    fn field_type_to_ts_type(&self, field: &FieldDefinition) -> String {
        let base = if is_string_type(&field.field_type) {
            "string".to_string()
        } else if is_number_type(&field.field_type) {
            "number".to_string()
        } else if is_byte_type(&field.field_type) {
            "Uint8Array | Buffer".to_string()
        } else if field.field_type == "bool" {
            "boolean".to_string()
        } else {
            field.field_type.clone()
        };

        if field.is_array {
            format!("{}[]", base)
        } else {
            base
        }
    }

    /// Returns (function_name, prefix_args).
    /// For builtins, prefix_args is "" (the value is the only arg).
    /// For custom types, prefix_args is "sia, " (sia is passed before the value).
    fn serialize_func(&self, field: &FieldDefinition, sia: &str) -> (String, String) {
        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if field.field_type == "string" {
            let enc = encoding.unwrap_or("utf8");
            let suffix = match enc {
                "ascii" => "Ascii",
                _ => "String8",
            };
            return (format!("{}.add{}", sia, suffix), String::new());
        }

        // Explicit mapping for uint types (preserve casing)
        let func = match field.field_type.as_str() {
            "uint8" => format!("{}.addUInt8", sia),
            "uint16" => format!("{}.addUInt16", sia),
            "uint32" => format!("{}.addUInt32", sia),
            "uint64" => format!("{}.addUInt64", sia),
            "byteN" => format!("{}.addByteArrayN", sia),
            "byte8" => format!("{}.addByteArray8", sia),
            "byte16" => format!("{}.addByteArray16", sia),
            "byte32" => format!("{}.addByteArray32", sia),
            "byte64" => format!("{}.addByteArray64", sia),
            t if is_builtin_type(t) => {
                format!("{}.add{}", sia, t.to_pascal_case())
            }
            t => {
                // Custom type
                return (format!("encode{}", t.to_pascal_case()), "sia, ".to_string());
            }
        };

        (func, String::new())
    }

    /// Returns (function_name, args_string).
    fn deserialize_func(&self, field: &FieldDefinition, sia: &str) -> (String, String) {
        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if field.field_type == "string" {
            let enc = encoding.unwrap_or("utf8");
            let suffix = match enc {
                "ascii" => "Ascii",
                _ => "String8",
            };
            return (format!("{}.read{}", sia, suffix), String::new());
        }

        let func = match field.field_type.as_str() {
            "uint8" => format!("{}.readUInt8", sia),
            "uint16" => format!("{}.readUInt16", sia),
            "uint32" => format!("{}.readUInt32", sia),
            "uint64" => format!("{}.readUInt64", sia),
            "byteN" => {
                let length = self.get_fixed_length(field);
                return (format!("{}.readByteArrayN", sia), length);
            }
            "byte8" => format!("{}.readByteArray8", sia),
            "byte16" => format!("{}.readByteArray16", sia),
            "byte32" => format!("{}.readByteArray32", sia),
            "byte64" => format!("{}.readByteArray64", sia),
            t if is_builtin_type(t) => {
                format!("{}.read{}", sia, t.to_pascal_case())
            }
            t => {
                return (format!("decode{}", t.to_pascal_case()), sia.to_string());
            }
        };

        (func, String::new())
    }

    fn get_fixed_length(&self, field: &FieldDefinition) -> String {
        if let Some(length) = field.options.get("length") {
            return format!("{}", length);
        }
        if let Some(from_end) = field.options.get("fromEnd") {
            return format!("sia.offset - sia.length - {}", from_end);
        }
        panic!(
            "Field {} is fixed-length but has no length specified",
            field.name
        );
    }

    fn ts_literal_default(&self, field: &FieldDefinition) -> &'static str {
        if field.is_array {
            return "[]";
        }
        if is_string_type(&field.field_type) {
            return "\"\"";
        }
        if is_number_type(&field.field_type) {
            return "0";
        }
        if is_byte_type(&field.field_type) {
            return "new Uint8Array(0)";
        }
        if field.field_type == "bool" {
            return "false";
        }
        "null"
    }
}
