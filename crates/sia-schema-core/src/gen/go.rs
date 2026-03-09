/*!
 * Go code generator.
 *
 * Generates structs with `Sia()`, `FromSia()`, and `FromSiaBytes()` methods
 * using `github.com/TimeleapLabs/go-sia/v2/pkg`. Non-array fields are
 * serialized before array fields to match the original compiler's output.
 */

use std::collections::HashSet;
use std::fmt::Write;

use crate::ir::*;

/// Generate Go code from schema definitions.
pub fn generate(definitions: &[SchemaDefinition]) -> String {
    let gen = GoGenerator::new(definitions);
    gen.generate()
}

struct GoGenerator<'a> {
    definitions: &'a [SchemaDefinition],
    known_schemas: HashSet<&'a str>,
}

impl<'a> GoGenerator<'a> {
    fn new(definitions: &'a [SchemaDefinition]) -> Self {
        let known_schemas = definitions.iter().map(|s| s.name.as_str()).collect();
        Self {
            definitions,
            known_schemas,
        }
    }

    fn generate(&self) -> String {
        let mut out = String::new();

        // Package and import — note the exact whitespace from the expected output
        // The TS generator has trailing spaces on lines 2-3
        out.push_str(
            "package schema\n  \n  import sia \"github.com/TimeleapLabs/go-sia/v2/pkg\"\n  \n",
        );

        for schema in self.definitions {
            out.push_str(&self.schema_to_code(schema));
        }

        // FromSiaBytes helpers at the end
        for schema in self.definitions {
            out.push_str(&self.decode_helper(&schema.name));
            out.push('\n');
        }

        // Trim to exactly one trailing newline
        let trimmed = out.trim_end_matches('\n');
        let mut result = trimmed.to_string();
        result.push('\n');

        result
    }

    fn schema_to_code(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();

        // Struct
        writeln!(out, "type {} struct {{", schema.name).unwrap();
        for field in &schema.fields {
            let go_type = self.field_type_to_go_type(field);
            writeln!(
                out,
                "  {} {} `json:\"{}\"`",
                capitalize(&field.name),
                go_type,
                field.name
            )
            .unwrap();
        }
        writeln!(out, "}}\n").unwrap();

        // Encode
        out.push_str(&self.encode_method(schema));

        // Decode
        out.push_str(&self.decode_method(schema));

        out
    }

    fn encode_method(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();

        writeln!(out, "func (p *{}) Sia() sia.Sia {{", schema.name).unwrap();
        writeln!(out, "  s := sia.New()").unwrap();

        // Non-array fields first
        for field in schema.fields.iter().filter(|f| !f.is_array) {
            let ref_name = format!("p.{}", capitalize(&field.name));
            let val = self.get_ref_with_default(field, &ref_name);
            let call = self.serialize_func_name(field, &val);
            writeln!(out, "  s.{}", call).unwrap();
        }

        // Array fields
        for field in schema.fields.iter().filter(|f| f.is_array) {
            let go_type = self.field_type_to_go_type(field);
            let element_type = if let Some(stripped) = go_type.strip_prefix("[]") {
                stripped
            } else {
                &go_type
            };
            let field_name = capitalize(&field.name);

            writeln!(out, "  {{").unwrap();
            writeln!(out, "    arr := sia.NewSiaArray[{}]()", element_type).unwrap();

            if self.known_schemas.contains(field.field_type.as_str()) {
                writeln!(
                    out,
                    "    arr.AddArray8(p.{}, func(s *sia.ArraySia[{}], item {}) {{",
                    field_name, element_type, element_type
                )
                .unwrap();
                writeln!(out, "      s.EmbedBytes(item.Sia().Bytes())").unwrap();
            } else {
                writeln!(
                    out,
                    "    arr.AddArray8(p.{}, func(s *sia.ArraySia[{}], item {}) {{",
                    field_name, element_type, element_type
                )
                .unwrap();
                let dummy = FieldDefinition {
                    is_array: false,
                    ..field.clone()
                };
                let ser_func = self.serialize_func_name(&dummy, "item");
                writeln!(out, "      s.{}", ser_func).unwrap();
            }

            writeln!(out, "    }})").unwrap();
            writeln!(out, "    s.EmbedSia(arr.GetSia())").unwrap();
            writeln!(out, "  }}").unwrap();
        }

        writeln!(out, "  return s").unwrap();
        writeln!(out, "}}\n").unwrap();
        out
    }

    fn decode_method(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();

        writeln!(
            out,
            "func (p *{}) FromSia(s sia.Sia) *{} {{",
            schema.name, schema.name
        )
        .unwrap();

        // Non-array fields first
        for field in schema.fields.iter().filter(|f| !f.is_array) {
            let name = format!("p.{}", capitalize(&field.name));

            if self.known_schemas.contains(field.field_type.as_str()) {
                let var_name = field.field_type.to_lowercase();
                writeln!(out, "  {} := {}{{}}", var_name, field.field_type).unwrap();
                writeln!(out, "  {} = {}.FromSia(s)", name, var_name).unwrap();
            } else {
                let call = self.deserialize_func_name(field);
                let args = self.deserialize_func_args(field);
                writeln!(out, "  {} = {}{}", name, call, args).unwrap();
            }
        }

        // Array fields
        for field in schema.fields.iter().filter(|f| f.is_array) {
            let go_type = self.field_type_to_go_type(field);
            let element_type = if let Some(stripped) = go_type.strip_prefix("[]") {
                stripped
            } else {
                &go_type
            };
            let field_name = format!("p.{}", capitalize(&field.name));

            writeln!(out, "  {{").unwrap();
            writeln!(out, "    reader := sia.NewArray[{}](&s)", element_type).unwrap();

            if self.known_schemas.contains(field.field_type.as_str()) {
                writeln!(
                    out,
                    "    {} = reader.ReadArray8(func(s *sia.ArraySia[{}]) {} {{",
                    field_name, element_type, element_type
                )
                .unwrap();
                writeln!(out, "      var x {}", element_type).unwrap();
                writeln!(out, "      return *x.FromSiaBytes(s.Bytes())").unwrap();
                writeln!(out, "    }})").unwrap();
            } else {
                let dummy = FieldDefinition {
                    is_array: false,
                    ..field.clone()
                };
                let deser_call = self.deserialize_func_name(&dummy);
                let deser_args = self.deserialize_func_args(&dummy);

                writeln!(
                    out,
                    "    {} = reader.ReadArray8(func(s *sia.ArraySia[{}]) {} {{",
                    field_name, element_type, element_type
                )
                .unwrap();
                writeln!(out, "      return {}{}", deser_call, deser_args).unwrap();
                writeln!(out, "    }})").unwrap();
            }

            writeln!(out, "  }}").unwrap();
        }

        writeln!(out, "  return p").unwrap();
        writeln!(out, "}}\n").unwrap();
        out
    }

    fn decode_helper(&self, type_name: &str) -> String {
        let mut out = String::new();
        writeln!(
            out,
            "func (p *{}) FromSiaBytes(bytes []byte) *{} {{",
            type_name, type_name
        )
        .unwrap();
        writeln!(out, "  s := sia.NewFromBytes(bytes)").unwrap();
        writeln!(out, " \treturn p.FromSia(s)").unwrap();
        writeln!(out, "}}").unwrap();
        out
    }

    fn field_type_to_go_type(&self, field: &FieldDefinition) -> String {
        let base = if is_string_type(&field.field_type) {
            "string".to_string()
        } else if is_number_type(&field.field_type) {
            field.field_type.clone()
        } else if is_byte_type(&field.field_type) {
            "[]byte".to_string()
        } else if field.field_type == "bool" {
            "bool".to_string()
        } else if self.known_schemas.contains(field.field_type.as_str()) {
            format!("*{}", field.field_type)
        } else {
            field.field_type.clone()
        };

        if field.is_array {
            format!("[]{}", base)
        } else {
            base
        }
    }

    fn serialize_func_name(&self, field: &FieldDefinition, ref_val: &str) -> String {
        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if is_string_type(&field.field_type) {
            let suffix = string_encoding_suffix(encoding);
            return format!("Add{}({})", suffix, ref_val);
        }
        if let Some(suffix) = byte_type_suffix(&field.field_type) {
            return format!("Add{}({})", suffix, ref_val);
        }
        if field.field_type == "bool" {
            return format!("AddBool({})", ref_val);
        }
        if is_number_type(&field.field_type) {
            let suffix = number_type_suffix(&field.field_type);
            return format!("Add{}({})", suffix, ref_val);
        }
        // Custom schema
        format!("EmbedSia({}.Sia().GetSia())", ref_val)
    }

    fn deserialize_func_name(&self, field: &FieldDefinition) -> String {
        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if is_string_type(&field.field_type) {
            let suffix = string_encoding_suffix(encoding);
            return format!("s.Read{}", suffix);
        }
        if let Some(suffix) = byte_type_suffix(&field.field_type) {
            return format!("s.Read{}", suffix);
        }
        if field.field_type == "bool" {
            return "s.ReadBool".to_string();
        }
        if is_number_type(&field.field_type) {
            let suffix = number_type_suffix(&field.field_type);
            return format!("s.Read{}", suffix);
        }
        // Custom schema
        format!("Decode{}", field.field_type)
    }

    fn deserialize_func_args(&self, field: &FieldDefinition) -> String {
        if field.field_type == "byteN" {
            return format!("({})", self.get_fixed_length(field));
        }
        if is_builtin_type(&field.field_type) {
            return "()".to_string();
        }
        "(s)".to_string()
    }

    fn get_fixed_length(&self, field: &FieldDefinition) -> String {
        if let Some(length) = field.options.get("length") {
            return format!("{}", length);
        }
        if let Some(from_end) = field.options.get("fromEnd") {
            return format!("sia.Offset - sia.Length - {}", from_end);
        }
        panic!(
            "Field {} is fixed-length but has no length specified",
            field.name
        );
    }

    fn get_ref_with_default(&self, field: &FieldDefinition, ref_val: &str) -> String {
        if !field.optional || field.default_value.is_none() {
            return ref_val.to_string();
        }

        if !is_string_type(&field.field_type) {
            return ref_val.to_string();
        }

        let default_val = self.go_literal_default(field);
        let zero = self.zero_value_for_type(&field.field_type);

        if default_val == zero {
            return ref_val.to_string();
        }

        let go_type = if is_string_type(&field.field_type) {
            "string"
        } else {
            &field.field_type
        };

        format!(
            "(func() {} {{\n    if {} == {} {{\n      return {}\n    }}\n      return {}\n    }})()",
            go_type, ref_val, zero, default_val, ref_val
        )
    }

    fn zero_value_for_type(&self, field_type: &str) -> String {
        if is_string_type(field_type) {
            "\"\"".to_string()
        } else {
            "nil".to_string()
        }
    }

    fn go_literal_default(&self, field: &FieldDefinition) -> String {
        if is_string_type(&field.field_type) {
            if let Some(dv) = &field.default_value {
                return format!("\"{}\"", dv);
            }
        }
        "\"\"".to_string()
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

fn string_encoding_suffix(encoding: Option<&str>) -> &'static str {
    match encoding.unwrap_or("utf8") {
        "ascii" | "utf8" => "String8",
        "utf16" => "String16",
        "utf32" => "String32",
        "utf64" => "String64",
        _ => "String8",
    }
}

fn byte_type_suffix(t: &str) -> Option<&'static str> {
    match t {
        "byteN" => Some("ByteArrayN"),
        "byte8" => Some("ByteArray8"),
        "byte16" => Some("ByteArray16"),
        "byte32" => Some("ByteArray32"),
        "byte64" => Some("ByteArray64"),
        _ => None,
    }
}

fn number_type_suffix(t: &str) -> &'static str {
    match t {
        "int8" => "Int8",
        "int16" => "Int16",
        "int32" => "Int32",
        "int64" => "Int64",
        "uint8" => "UInt8",
        "uint16" => "UInt16",
        "uint32" => "UInt32",
        "uint64" => "UInt64",
        _ => panic!("Unknown number type: {}", t),
    }
}
