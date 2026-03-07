use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A value in the IR: string, number, or bool.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Value {
    String(String),
    Number(f64),
    Bool(bool),
}

impl Value {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Number(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Number(n) => Some(*n as i64),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }
}

impl std::fmt::Display for Value {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Value::String(s) => write!(f, "{}", s),
            Value::Number(n) => {
                if *n == (*n as i64) as f64 {
                    write!(f, "{}", *n as i64)
                } else {
                    write!(f, "{}", n)
                }
            }
            Value::Bool(b) => write!(f, "{}", b),
        }
    }
}

/// A top-level definition: either a schema or a plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Definition {
    Schema(SchemaDefinition),
    Plugin(PluginDefinition),
}

/// A schema definition with fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaDefinition {
    pub name: String,
    pub fields: Vec<FieldDefinition>,
}

/// A plugin definition with methods.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginDefinition {
    pub name: String,
    #[serde(rename = "as")]
    pub alias: String,
    pub methods: Vec<MethodDefinition>,
}

/// A field definition within a schema or method.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDefinition {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub optional: bool,
    #[serde(
        default,
        rename = "isArray",
        skip_serializing_if = "std::ops::Not::not"
    )]
    pub is_array: bool,
    #[serde(
        default,
        rename = "defaultValue",
        skip_serializing_if = "Option::is_none"
    )]
    pub default_value: Option<Value>,
    /// Type options like encoding, length, fromEnd etc.
    /// These are flattened into the JSON output for TS compatibility.
    #[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")]
    pub options: HashMap<String, Value>,
}

/// Method parameters: either inline fields or a type reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MethodParams {
    Fields(Vec<FieldDefinition>),
    Reference(FieldDefinition),
}

impl MethodParams {
    pub fn fields(&self) -> Vec<&FieldDefinition> {
        match self {
            MethodParams::Fields(fields) => fields.iter().collect(),
            MethodParams::Reference(field) => vec![field],
        }
    }

    pub fn into_fields(self) -> Vec<FieldDefinition> {
        match self {
            MethodParams::Fields(fields) => fields,
            MethodParams::Reference(field) => vec![field],
        }
    }
}

/// A method definition within a plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodDefinition {
    pub name: String,
    pub fields: MethodParams,
    pub returns: MethodParams,
    /// Method options like timeout, fee, currency.
    /// These are flattened into the JSON output for TS compatibility.
    #[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")]
    pub options: HashMap<String, Value>,
}

impl MethodDefinition {
    /// Get the timeout value, defaulting to "5000".
    pub fn timeout(&self) -> &str {
        self.options
            .get("timeout")
            .and_then(|v| v.as_str())
            .unwrap_or("5000")
    }

    /// Get the timeout as a number, defaulting to 5000.
    pub fn timeout_num(&self) -> i64 {
        self.options
            .get("timeout")
            .and_then(|v| match v {
                Value::String(s) => s.parse().ok(),
                Value::Number(n) => Some(*n as i64),
                _ => None,
            })
            .unwrap_or(5000)
    }

    /// Get the fee, defaulting to 0.
    pub fn fee(&self) -> i64 {
        self.options
            .get("fee")
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
    }

    /// Get the currency, defaulting to "TLP".
    pub fn currency(&self) -> &str {
        self.options
            .get("currency")
            .and_then(|v| v.as_str())
            .unwrap_or("TLP")
    }
}

// -- Type classification helpers --

pub const STRING_TYPES: &[&str] = &[
    "stringN", "string", "string8", "string16", "string32", "string64",
];

pub const BYTE_TYPES: &[&str] = &["byteN", "byte8", "byte16", "byte32", "byte64"];

pub const NUMBER_TYPES: &[&str] = &[
    "int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64",
];

pub const BOOLEAN_TYPES: &[&str] = &["bool"];

pub fn is_string_type(t: &str) -> bool {
    STRING_TYPES.contains(&t)
}

pub fn is_byte_type(t: &str) -> bool {
    BYTE_TYPES.contains(&t)
}

pub fn is_number_type(t: &str) -> bool {
    NUMBER_TYPES.contains(&t)
}

pub fn is_boolean_type(t: &str) -> bool {
    BOOLEAN_TYPES.contains(&t)
}

pub fn is_builtin_type(t: &str) -> bool {
    is_string_type(t) || is_byte_type(t) || is_number_type(t) || is_boolean_type(t)
}

/// Returns true if the type is a custom (user-defined schema) type.
pub fn is_custom_type(t: &str) -> bool {
    !is_builtin_type(t)
}
