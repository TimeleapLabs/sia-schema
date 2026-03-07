use std::collections::HashSet;
use std::fmt::Write;

use crate::ir::*;

/// Generate Python code from definitions.
pub fn generate(definitions: &[Definition]) -> String {
    let gen = PyGenerator::new(definitions);
    gen.generate()
}

struct PyGenerator<'a> {
    definitions: &'a [Definition],
    known_schemas: HashSet<&'a str>,
}

impl<'a> PyGenerator<'a> {
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

    fn generate(&self) -> String {
        let mut parts: Vec<String> = vec!["from sia import Sia".to_string()];

        for def in self.definitions {
            match def {
                Definition::Schema(s) => {
                    parts.push(self.schema_to_code(s));
                }
                Definition::Plugin(p) => {
                    parts.push(self.plugin_to_code(p));
                }
            }
        }

        parts.join("\n\n")
    }

    fn schema_to_code(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();

        let has_array = schema.fields.iter().any(|f| f.is_array);
        if has_array {
            writeln!(out, "from typing import List\n").unwrap();
        }

        writeln!(out, "class {}():", schema.name).unwrap();
        writeln!(out, "    def __init__(self,").unwrap();

        // Required fields first
        let required: Vec<_> = schema.fields.iter().filter(|f| !f.optional).collect();
        let optional: Vec<_> = schema.fields.iter().filter(|f| f.optional).collect();

        for field in &required {
            writeln!(
                out,
                "        {}: {},",
                field.name,
                self.field_type_to_py_type(field)
            )
            .unwrap();
        }

        for field in &optional {
            let default_val = if field.default_value.is_some() {
                format!(" = {}", self.python_literal_default(field))
            } else {
                " = None".to_string()
            };
            writeln!(
                out,
                "        {}: {}{},",
                field.name,
                self.field_type_to_py_type(field),
                default_val
            )
            .unwrap();
        }

        writeln!(out, "    ):").unwrap();

        for field in &schema.fields {
            writeln!(out, "        self.{} = {}", field.name, field.name).unwrap();
        }

        // Encode method
        out.push_str(&self.encode_method(schema));

        // Decode method
        out.push_str(&self.decode_method(schema));

        out
    }

    fn encode_method(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();
        writeln!(out).unwrap();
        writeln!(out, "    def encode(self, sia: Sia) -> Sia:").unwrap();

        for field in &schema.fields {
            let value_expr = format!("self.{}", field.name);

            if field.is_array {
                let lambda = self.encode_array_helper(field);
                writeln!(out, "        sia.add_array8({}, {})", value_expr, lambda).unwrap();
            } else {
                let func = self.serialize_func_name(field);
                if func.starts_with("sia.") {
                    writeln!(out, "        {}({})", func, value_expr).unwrap();
                } else if self.known_schemas.contains(field.field_type.as_str()) {
                    writeln!(out, "        {}.encode(sia)", value_expr).unwrap();
                } else {
                    writeln!(out, "        {}(sia, {})", func, value_expr).unwrap();
                }
            }
        }

        writeln!(out, "        return sia").unwrap();
        out
    }

    fn decode_method(&self, schema: &SchemaDefinition) -> String {
        let mut out = String::new();
        writeln!(out).unwrap();
        writeln!(out, "    @classmethod").unwrap();
        writeln!(out, "    def decode(cls, sia: Sia) -> \"{}\":", schema.name).unwrap();
        writeln!(out, "        return cls(").unwrap();

        for field in &schema.fields {
            if field.is_array {
                let lambda = self.decode_array_helper(field);
                writeln!(
                    out,
                    "            {}=sia.read_array8({}),",
                    field.name, lambda
                )
                .unwrap();
            } else {
                let func = self.deserialize_func_name(field);
                let args = self.deserialize_func_args(field);
                writeln!(out, "            {}={}({}),", field.name, func, args).unwrap();
            }
        }

        write!(out, "        )").unwrap();
        out
    }

    fn plugin_to_code(&self, plugin: &PluginDefinition) -> String {
        format!(
            "# Cannot generate plugin '{}' due to lack of RPC support in the Python Sia generator.\n\
             # You must connect to this plugin manually via RPC. Please check the tutorial below:\n\
             # https://timeleap.swiss/docs/products/sia/highlevel#rpc",
            plugin.name
        )
    }

    fn field_type_to_py_type(&self, field: &FieldDefinition) -> String {
        let base = if is_string_type(&field.field_type) {
            "str".to_string()
        } else if is_number_type(&field.field_type) {
            "int".to_string()
        } else if is_byte_type(&field.field_type) {
            "bytes".to_string()
        } else if field.field_type == "bool" {
            "bool".to_string()
        } else if self.known_schemas.contains(field.field_type.as_str()) {
            format!("\"{}\"", field.field_type)
        } else {
            field.field_type.clone()
        };

        if field.is_array {
            format!("List[{}]", base)
        } else {
            base
        }
    }

    fn serialize_func_name(&self, field: &FieldDefinition) -> String {
        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if field.field_type == "string" {
            let suffix = py_string_encoding_suffix(encoding);
            return format!("sia.add_{}", suffix);
        }

        if let Some(suffix) = py_byte_type_suffix(&field.field_type) {
            return format!("sia.add_{}", suffix);
        }

        if field.field_type == "bool" {
            return "sia.add_bool".to_string();
        }

        if is_number_type(&field.field_type) || is_builtin_type(&field.field_type) {
            return format!("sia.add_{}", field.field_type);
        }

        format!("{}.encode", field.field_type)
    }

    fn deserialize_func_name(&self, field: &FieldDefinition) -> String {
        let encoding = field.options.get("encoding").and_then(|v| v.as_str());

        if field.field_type == "string" {
            let suffix = py_string_encoding_suffix(encoding);
            return format!("sia.read_{}", suffix);
        }

        if let Some(suffix) = py_byte_type_suffix(&field.field_type) {
            return format!("sia.read_{}", suffix);
        }

        if field.field_type == "bool" {
            return "sia.read_bool".to_string();
        }

        if is_number_type(&field.field_type) || is_builtin_type(&field.field_type) {
            return format!("sia.read_{}", field.field_type);
        }

        format!("{}.decode", field.field_type)
    }

    fn deserialize_func_args(&self, field: &FieldDefinition) -> String {
        if field.field_type == "byteN" {
            return self.get_fixed_length(field);
        }
        if is_builtin_type(&field.field_type) {
            return String::new();
        }
        "sia".to_string()
    }

    fn encode_array_helper(&self, field: &FieldDefinition) -> String {
        let func = self.serialize_func_name(field);

        if func.starts_with("sia.") {
            let method = &func[4..];
            return format!("lambda sia, v: sia.{}(v)", method);
        }
        if self.known_schemas.contains(field.field_type.as_str()) {
            return "lambda sia, v: v.encode(sia)".to_string();
        }
        format!("lambda sia, v: {}(sia, v)", func)
    }

    fn decode_array_helper(&self, field: &FieldDefinition) -> String {
        let func = self.deserialize_func_name(field);

        if func.starts_with("sia.") {
            let method = &func[4..];
            return format!("lambda sia: sia.{}()", method);
        }
        if self.known_schemas.contains(field.field_type.as_str()) {
            return format!("lambda sia: {}.decode(sia)", field.field_type);
        }
        format!("lambda sia: {}(sia)", func)
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

    fn python_literal_default(&self, field: &FieldDefinition) -> String {
        if is_string_type(&field.field_type) {
            if let Some(dv) = &field.default_value {
                return format!("\"{}\"", dv);
            }
        }
        "None".to_string()
    }
}

fn py_string_encoding_suffix(encoding: Option<&str>) -> &'static str {
    match encoding.unwrap_or("utf8") {
        "ascii" | "utf8" => "string8",
        "utf16" => "string16",
        "utf32" => "string32",
        "utf64" => "string64",
        _ => "string8",
    }
}

fn py_byte_type_suffix(t: &str) -> Option<&'static str> {
    match t {
        "byteN" => Some("byte_array_n"),
        "byte8" => Some("byte_array8"),
        "byte16" => Some("byte_array16"),
        "byte32" => Some("byte_array32"),
        "byte64" => Some("byte_array64"),
        _ => None,
    }
}
