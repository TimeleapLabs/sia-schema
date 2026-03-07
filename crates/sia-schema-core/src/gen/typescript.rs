use std::collections::HashSet;
use std::fmt::Write;

use heck::{ToLowerCamelCase, ToPascalCase};

use crate::ir::*;

/// Generate TypeScript code from definitions.
pub fn generate(definitions: &[Definition]) -> String {
    let gen = TsGenerator::new(definitions);
    gen.generate()
}

#[allow(dead_code)]
struct TsGenerator<'a> {
    definitions: &'a [Definition],
    known_schemas: HashSet<&'a str>,
}

impl<'a> TsGenerator<'a> {
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
        let mut parts: Vec<String> = Vec::new();
        let mut has_plugins = false;

        for def in self.definitions {
            match def {
                Definition::Schema(s) => {
                    parts.push(self.schema_to_code(s));
                }
                Definition::Plugin(p) => {
                    has_plugins = true;
                    parts.push(self.plugin_to_code(p));
                }
            }
        }

        let mut imports = vec!["import { Sia } from \"@timeleap/sia\";".to_string()];
        if has_plugins {
            imports.push("import { Client, Function } from \"@timeleap/client\";".to_string());
        }

        let mut output = imports.join("\n");
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

    fn plugin_to_code(&self, plugin: &PluginDefinition) -> String {
        let mut out = String::new();

        writeln!(out, "export class {} {{", plugin.alias).unwrap();
        writeln!(out, "  private methods: Map<string, Function> = new Map();").unwrap();
        writeln!(out, "  private pluginName = \"{}\";", plugin.name).unwrap();
        writeln!(out).unwrap();
        writeln!(out, "  constructor(private client: Client) {{}}").unwrap();
        writeln!(out).unwrap();
        writeln!(out, "  static connect(client: Client): {} {{", plugin.alias).unwrap();
        writeln!(out, "    return new {}(client);", plugin.alias).unwrap();
        writeln!(out, "  }}").unwrap();
        writeln!(out).unwrap();

        // getMethod
        writeln!(out, "  private getMethod(").unwrap();
        writeln!(out, "    method: string,").unwrap();
        writeln!(out, "    timeout: number,").unwrap();
        writeln!(out, "    fee: {{ currency: string; amount: number }},").unwrap();
        writeln!(out, "  ): Function {{").unwrap();
        writeln!(out, "    if (!this.methods.has(method)) {{").unwrap();
        writeln!(out, "      this.methods.set(").unwrap();
        writeln!(out, "        method,").unwrap();
        writeln!(out, "        this.client.method({{").unwrap();
        writeln!(out, "          plugin: this.pluginName,").unwrap();
        writeln!(out, "          method,").unwrap();
        writeln!(out, "          timeout,").unwrap();
        writeln!(out, "          fee,").unwrap();
        writeln!(out, "        }}),").unwrap();
        writeln!(out, "      );").unwrap();
        writeln!(out, "    }}").unwrap();
        writeln!(out, "    return this.methods.get(method)!;").unwrap();
        writeln!(out, "  }}").unwrap();

        for method in &plugin.methods {
            out.push('\n');
            out.push_str(&self.method_to_code(method));
        }

        write!(out, "}}").unwrap();
        out
    }

    fn method_to_code(&self, method: &MethodDefinition) -> String {
        let mut out = String::new();

        // Method signature
        write!(out, "  public async {}(\n    sia: Sia,\n", method.name).unwrap();

        let fields = match &method.fields {
            MethodParams::Fields(fields) => fields.clone(),
            MethodParams::Reference(field) => vec![field.clone()],
        };

        for field in &fields {
            let optional = if field.optional { "?" } else { "" };
            let ts_type = self.field_type_to_ts_type(field);
            writeln!(out, "    {}{}: {},", field.name, optional, ts_type).unwrap();
        }

        // Return type
        let returns = match &method.returns {
            MethodParams::Fields(fields) => fields.clone(),
            MethodParams::Reference(field) => vec![field.clone()],
        };

        if returns.len() > 1 || matches!(&method.returns, MethodParams::Fields(_)) {
            writeln!(out, "  ): Promise<{{").unwrap();
            for field in &returns {
                let ts_type = self.field_type_to_ts_type(field);
                writeln!(out, "    {}: {};", field.name, ts_type).unwrap();
            }
            writeln!(out, "  }}> {{").unwrap();
        } else {
            let ts_type = self.field_type_to_ts_type(&returns[0]);
            writeln!(out, "  ): Promise<{}> {{", ts_type).unwrap();
        }

        // Serialize params
        for field in &fields {
            if field.is_array {
                let (func_name, _) = self.serialize_func(field, "sia");
                // Note: the TS expected output has `sia.addString8(v)` not `s.addString8(v)` inside the plugin method
                writeln!(
                    out,
                    "    sia.addArray8({}, (s: Sia, v) => {}(v));",
                    field.name, func_name
                )
                .unwrap();
            } else {
                let (func_name, func_args) = self.serialize_func(field, "sia");
                let value = if field.optional {
                    format!("{} ?? {}", field.name, self.ts_literal_default(field))
                } else {
                    field.name.clone()
                };
                writeln!(out, "    {}({}{});", func_name, func_args, value).unwrap();
            }
        }

        // getMethod call
        let timeout = method.timeout_num();
        let fee = method.fee();
        let currency = method.currency();

        // Check line length for prettier wrapping
        let single_line = format!(
            "    const method = this.getMethod(\"{}\", {}, {{ currency: \"{}\", amount: {} }});",
            method.name, timeout, currency, fee
        );
        if single_line.len() > 80 {
            writeln!(
                out,
                "    const method = this.getMethod(\"{}\", {}, {{",
                method.name, timeout
            )
            .unwrap();
            writeln!(out, "      currency: \"{}\",", currency).unwrap();
            writeln!(out, "      amount: {},", fee).unwrap();
            writeln!(out, "    }});").unwrap();
        } else {
            writeln!(out, "{}", single_line).unwrap();
        }
        writeln!(
            out,
            "    const response = await method.populate(sia).invoke();"
        )
        .unwrap();

        // Deserialize returns
        if returns.len() > 1 || matches!(&method.returns, MethodParams::Fields(_)) {
            for field in &returns {
                let variable = format!("resp_{}", field.name).to_lower_camel_case();
                let (func_name, func_args) = self.deserialize_func(field, "response");
                writeln!(
                    out,
                    "    const {} = {}({});",
                    variable, func_name, func_args
                )
                .unwrap();
            }

            writeln!(out, "    return {{").unwrap();
            for field in &returns {
                let variable = format!("resp_{}", field.name).to_lower_camel_case();
                writeln!(out, "      {}: {},", field.name, variable).unwrap();
            }
            writeln!(out, "    }};").unwrap();
        } else {
            let field = &returns[0];
            let (func_name, func_args) = self.deserialize_func(field, "response");
            writeln!(out, "    const value = {}({});", func_name, func_args).unwrap();
            writeln!(out, "    return value;").unwrap();
        }

        writeln!(out, "  }}").unwrap();
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
            if encoding == Some("ascii") {
                return (format!("{}.addAscii", sia), String::new());
            }
            panic!("Unknown encoding for string type");
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
            if encoding == Some("ascii") {
                return (format!("{}.readAscii", sia), String::new());
            }
            panic!("Unknown encoding for string type");
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
