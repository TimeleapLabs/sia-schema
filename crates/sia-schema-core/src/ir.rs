/*!
 * Intermediate representation for parsed Sia schemas.
 *
 * The IR is the bridge between the parser and the code generators.
 * It also serves as the JSON output format for `sia ir`, using serde
 * serialization that matches the original TypeScript compiler's output.
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/** A value in the IR: string, number, or boolean. */
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Value {
    String(String),
    Number(f64),
    Bool(bool),
}

impl Value {
    /** Try to get the inner string reference. */
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    /** Try to get the inner value as `f64`. */
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Number(n) => Some(*n),
            _ => None,
        }
    }

    /** Try to get the inner value as `i64` (truncating). */
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Number(n) => Some(*n as i64),
            _ => None,
        }
    }

    /** Try to get the inner boolean value. */
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

/** A schema definition containing a name and a list of fields. */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaDefinition {
    pub name: String,
    pub fields: Vec<FieldDefinition>,
}

/** A field definition within a schema. */
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
    /**
     * Type options like encoding, length, fromEnd etc.
     * Flattened into the JSON output for TypeScript compiler compatibility.
     */
    #[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")]
    pub options: HashMap<String, Value>,
}

// -- Type classification helpers -------------------------------------------

/// All recognized string types in the Sia schema language.
pub const STRING_TYPES: &[&str] = &[
    "stringN", "string", "string8", "string16", "string32", "string64",
];

/// All recognized byte array types.
pub const BYTE_TYPES: &[&str] = &["byteN", "byte8", "byte16", "byte32", "byte64"];

/// All recognized integer types (signed and unsigned).
pub const NUMBER_TYPES: &[&str] = &[
    "int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64",
];

/// Boolean type.
pub const BOOLEAN_TYPES: &[&str] = &["bool"];

/// Returns `true` if `t` is a string type.
pub fn is_string_type(t: &str) -> bool {
    STRING_TYPES.contains(&t)
}

/// Returns `true` if `t` is a byte array type.
pub fn is_byte_type(t: &str) -> bool {
    BYTE_TYPES.contains(&t)
}

/// Returns `true` if `t` is an integer type.
pub fn is_number_type(t: &str) -> bool {
    NUMBER_TYPES.contains(&t)
}

/// Returns `true` if `t` is `"bool"`.
pub fn is_boolean_type(t: &str) -> bool {
    BOOLEAN_TYPES.contains(&t)
}

/// Returns `true` if `t` is any built-in type (string, byte, number, or bool).
pub fn is_builtin_type(t: &str) -> bool {
    is_string_type(t) || is_byte_type(t) || is_number_type(t) || is_boolean_type(t)
}

/// Returns `true` if the type is a custom (user-defined schema) type.
pub fn is_custom_type(t: &str) -> bool {
    !is_builtin_type(t)
}
