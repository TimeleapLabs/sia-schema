use std::collections::HashSet;
use std::fmt::Write;

use heck::{ToLowerCamelCase, ToPascalCase};

use crate::ir::*;

/// Generate combined C++ output (hpp + cpp joined).
pub fn generate_combined(definitions: &[Definition], file_name: &str) -> String {
    let (hpp, cpp) = generate(definitions, file_name);
    format!("{}\n\n{}", hpp, cpp)
}

/// Generate C++ code split into header and source.
pub fn generate(definitions: &[Definition], file_name: &str) -> (String, String) {
    let gen = CppGenerator::new(definitions);
    gen.generate(file_name)
}

struct CppGenerator<'a> {
    definitions: &'a [Definition],
    known_schemas: HashSet<&'a str>,
}

impl<'a> CppGenerator<'a> {
    fn new(definitions: &'a [Definition]) -> Self {
        let known_schemas = definitions
            .iter()
            .filter_map(|d| match d {
                Definition::Schema(s) => Some(s.name.as_str()),
                _ => None,
            })
            .collect();
        Self {
            definitions,
            known_schemas,
        }
    }

    fn generate(&self, file_name: &str) -> (String, String) {
        let mut hpp_parts: Vec<String> = vec![
            "#pragma once".to_string(),
            "#include <sia/sia.hpp>\n\
             #include <vector>\n\
             #include <string>\n\
             #include <sia/array.hpp>\n\
             #include <memory>"
                .to_string(),
        ];

        let mut cpp_parts: Vec<String> = vec![format!("#include \"{}.hpp\"", file_name)];

        // Forward declarations
        for def in self.definitions {
            if let Definition::Schema(s) = def {
                hpp_parts.push(format!("struct {};", s.name.to_pascal_case()));
            }
        }

        for def in self.definitions {
            match def {
                Definition::Schema(s) => {
                    let (hpp, cpp) = self.schema_to_hpp_and_cpp(s);
                    hpp_parts.push(hpp);
                    cpp_parts.push(cpp);
                }
                Definition::Plugin(p) => {
                    cpp_parts.push(self.plugin_to_code(p));
                }
            }
        }

        (hpp_parts.join("\n\n"), cpp_parts.join("\n\n"))
    }

    fn schema_to_hpp_and_cpp(&self, schema: &SchemaDefinition) -> (String, String) {
        let struct_name = schema.name.to_pascal_case();
        let var_name = schema.name.to_lower_camel_case();

        // HPP: struct + declarations
        let mut hpp = String::new();
        writeln!(hpp, "struct {} {{", struct_name).unwrap();

        for field in &schema.fields {
            let cpp_type = if field.is_array {
                format!("std::vector<{}>", self.field_type_to_cpp_type(field))
            } else {
                self.field_type_to_cpp_type(field)
            };

            let default_code = if field.default_value.is_some() {
                let lit = self.cpp_literal_default(field);
                if lit.is_empty() {
                    String::new()
                } else {
                    format!(" = {}", lit)
                }
            } else {
                String::new()
            };

            writeln!(hpp, "  {} {}{};", cpp_type, field.name, default_code).unwrap();
        }

        write!(hpp, "}}; \n\n").unwrap();
        writeln!(
            hpp,
            "std::shared_ptr<sia::Sia> encode{}(const {}& {});",
            struct_name, struct_name, var_name
        )
        .unwrap();
        write!(
            hpp,
            "{} decode{}(std::shared_ptr<sia::Sia> sia);",
            struct_name, struct_name
        )
        .unwrap();

        // CPP: encode + decode implementations
        let cpp_encode = self.encode_cpp_method(schema, &struct_name, &var_name);
        let cpp_decode = self.decode_cpp_method(schema, &struct_name);
        let cpp = format!("{}\n\n{}", cpp_encode, cpp_decode);

        (hpp, cpp)
    }

    fn encode_cpp_method(
        &self,
        schema: &SchemaDefinition,
        struct_name: &str,
        var_name: &str,
    ) -> String {
        let mut out = String::new();
        writeln!(
            out,
            "std::shared_ptr<sia::Sia> encode{}(const {}& {}) {{",
            struct_name, struct_name, var_name
        )
        .unwrap();
        writeln!(out, "  auto sia = sia::New();").unwrap();

        for field in &schema.fields {
            let access = format!("{}.{}", var_name, field.name);
            let code = self.serialize_expr(field, &access);
            writeln!(out, "  {};", code).unwrap();
        }

        writeln!(out, "  return sia;").unwrap();
        write!(out, "}}").unwrap();
        out
    }

    fn decode_cpp_method(&self, schema: &SchemaDefinition, struct_name: &str) -> String {
        let mut out = String::new();
        writeln!(
            out,
            "{} decode{}(std::shared_ptr<sia::Sia> sia) {{",
            struct_name, struct_name
        )
        .unwrap();
        writeln!(out, "  {} result;", struct_name).unwrap();

        for field in &schema.fields {
            let target = format!("result.{}", field.name);
            let code = self.deserialize_expr(field, "sia", &target);
            writeln!(out, "  {} = {};", target, code).unwrap();
        }

        writeln!(out, "  return result;").unwrap();
        write!(out, "}}").unwrap();
        out
    }

    fn plugin_to_code(&self, plugin: &PluginDefinition) -> String {
        format!(
            "// Plugin '{}' is not supported in C++ generator.\n\
             // RPC support must be implemented manually.\n\
             // See: https://timeleap.swiss/docs/products/sia/highlevel#rpc",
            plugin.name
        )
    }

    fn field_type_to_cpp_type(&self, field: &FieldDefinition) -> String {
        if is_string_type(&field.field_type) {
            "std::string".to_string()
        } else if is_number_type(&field.field_type) {
            format!("{}_t", field.field_type)
        } else if field.field_type == "bool" {
            "bool".to_string()
        } else if is_byte_type(&field.field_type) {
            "std::vector<uint8_t>".to_string()
        } else if self.known_schemas.contains(field.field_type.as_str()) {
            format!("std::shared_ptr<{}>", field.field_type.to_pascal_case())
        } else {
            field.field_type.clone()
        }
    }

    fn serialize_expr(&self, field: &FieldDefinition, access: &str) -> String {
        if field.is_array {
            let cpp_type = self.field_type_to_cpp_type(field);
            let encoder = self.encode_array_helper(field, &cpp_type);
            return format!("sia::AddArray8<{}>(sia, {}, {})", cpp_type, access, encoder);
        }

        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if is_string_type(&field.field_type) {
            let suffix = cpp_string_encoding_suffix(encoding);
            return format!("sia->Add{}({})", suffix, access);
        }
        if is_number_type(&field.field_type) {
            let suffix = cpp_number_suffix(&field.field_type);
            return format!("sia->Add{}({})", suffix, access);
        }
        if field.field_type == "bool" {
            return format!("sia->AddBool({})", access);
        }
        if field.field_type == "byteN" {
            return format!("sia->AddByteArrayN({})", access);
        }
        if is_byte_type(&field.field_type) {
            let suffix = cpp_byte_suffix(&field.field_type);
            return format!("sia->Add{}({})", suffix, access);
        }

        // Custom schema
        format!(
            "if ({access}) {{\n\
             \x20   auto embedded = encode{}(*{access});\n\
             \x20   sia->EmbedSia(embedded);\n\
             \x20 }} else {{\n\
             \x20   sia->EmbedSia(sia::New());\n\
             \x20 }}",
            field.field_type.to_pascal_case(),
        )
    }

    fn deserialize_expr(&self, field: &FieldDefinition, sia_var: &str, _target: &str) -> String {
        if field.is_array {
            let cpp_type = self.field_type_to_cpp_type(field);
            let decoder = self.decode_array_helper(field, &cpp_type);
            return format!("sia::ReadArray8<{}>({}, {})", cpp_type, sia_var, decoder);
        }

        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if is_string_type(&field.field_type) {
            let suffix = cpp_string_encoding_suffix(encoding);
            return format!("{}->Read{}()", sia_var, suffix);
        }
        if is_number_type(&field.field_type) {
            let suffix = cpp_number_suffix(&field.field_type);
            return format!("{}->Read{}()", sia_var, suffix);
        }
        if field.field_type == "bool" {
            return format!("{}->ReadBool()", sia_var);
        }
        if field.field_type == "byteN" {
            let length = self.get_fixed_length(field);
            return format!("{}->ReadByteArrayN({})", sia_var, length);
        }
        if is_byte_type(&field.field_type) {
            let suffix = cpp_byte_suffix(&field.field_type);
            return format!("{}->Read{}()", sia_var, suffix);
        }

        // Custom schema
        format!(
            "std::make_shared<{}>(decode{}({}))",
            field.field_type.to_pascal_case(),
            field.field_type.to_pascal_case(),
            sia_var
        )
    }

    fn encode_array_helper(&self, field: &FieldDefinition, cpp_type: &str) -> String {
        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if is_string_type(&field.field_type) {
            let suffix = cpp_string_encoding_suffix(encoding);
            return format!(
                "[&](auto self, const {}& v) {{ self->Add{}(v); }}",
                cpp_type, suffix
            );
        }
        if is_number_type(&field.field_type) {
            let suffix = cpp_number_suffix(&field.field_type);
            return format!(
                "[&](auto self, const {}& v) {{ self->Add{}(v); }}",
                cpp_type, suffix
            );
        }
        if field.field_type == "bool" {
            return format!(
                "[&](auto self, const {}& v) {{ self->AddBool(v); }}",
                cpp_type
            );
        }
        if is_byte_type(&field.field_type) {
            let suffix = cpp_byte_suffix(&field.field_type);
            return format!(
                "[&](auto self, const {}& v) {{ self->Add{}(v); }}",
                cpp_type, suffix
            );
        }
        if self.known_schemas.contains(field.field_type.as_str()) {
            return format!(
                "[&](auto self, const {}& v) {{ self->EmbedSia(encode{}(v)); }}",
                cpp_type, cpp_type
            );
        }

        panic!("Unsupported encoder for type: {}", field.field_type);
    }

    fn decode_array_helper(&self, field: &FieldDefinition, cpp_type: &str) -> String {
        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if is_string_type(&field.field_type) {
            let suffix = cpp_string_encoding_suffix(encoding);
            return format!(
                "[&](auto self) -> {} {{ return self->Read{}(); }}",
                cpp_type, suffix
            );
        }
        if is_number_type(&field.field_type) {
            let suffix = cpp_number_suffix(&field.field_type);
            return format!(
                "[&](auto self) -> {} {{ return self->Read{}(); }}",
                cpp_type, suffix
            );
        }
        if field.field_type == "bool" {
            return format!(
                "[&](auto self) -> {} {{ return self->ReadBool(); }}",
                cpp_type
            );
        }
        if is_byte_type(&field.field_type) {
            let suffix = cpp_byte_suffix(&field.field_type);
            return format!(
                "[&](auto self) -> {} {{ return self->Read{}(); }}",
                cpp_type, suffix
            );
        }
        if self.known_schemas.contains(field.field_type.as_str()) {
            return format!(
                "[&](auto self) -> {} {{ return decode{}(self); }}",
                cpp_type, cpp_type
            );
        }

        panic!("Unsupported decoder for type: {}", field.field_type);
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

    fn cpp_literal_default(&self, field: &FieldDefinition) -> String {
        if is_string_type(&field.field_type) {
            if let Some(dv) = &field.default_value {
                let escaped = dv.to_string().replace('\\', "\\\\").replace('"', "\\\"");
                return format!("\"{}\"", escaped);
            }
        }
        if self.known_schemas.contains(field.field_type.as_str()) {
            return "{}".to_string();
        }
        String::new()
    }
}

fn cpp_string_encoding_suffix(encoding: Option<&str>) -> &'static str {
    match encoding.unwrap_or("utf8") {
        "ascii" | "utf8" => "String8",
        "utf16" => "String16",
        "utf32" => "String32",
        "utf64" => "String64",
        _ => "String8",
    }
}

fn cpp_number_suffix(t: &str) -> &'static str {
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

fn cpp_byte_suffix(t: &str) -> &'static str {
    match t {
        "byte8" => "ByteArray8",
        "byte16" => "ByteArray16",
        "byte32" => "ByteArray32",
        "byte64" => "ByteArray64",
        _ => panic!("Unknown byte type: {}", t),
    }
}
