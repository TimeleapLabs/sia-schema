use std::collections::HashMap;

use sia_schema_core::ir::*;

/// Build the mock IR matching tests/sample-mock.ts from the TS compiler.
fn sample_definitions() -> Vec<SchemaDefinition> {
    vec![
        SchemaDefinition {
            name: "Sample".into(),
            fields: vec![
                FieldDefinition {
                    name: "name".into(),
                    field_type: "string8".into(),
                    optional: false,
                    is_array: false,
                    default_value: None,
                    options: HashMap::new(),
                },
                FieldDefinition {
                    name: "age".into(),
                    field_type: "int32".into(),
                    optional: true,
                    is_array: false,
                    default_value: None,
                    options: HashMap::new(),
                },
                FieldDefinition {
                    name: "email".into(),
                    field_type: "string8".into(),
                    optional: true,
                    is_array: true,
                    default_value: None,
                    options: HashMap::from([("encoding".into(), Value::String("ascii".into()))]),
                },
                FieldDefinition {
                    name: "tags".into(),
                    field_type: "string8".into(),
                    optional: false,
                    is_array: true,
                    default_value: None,
                    options: HashMap::new(),
                },
                FieldDefinition {
                    name: "test".into(),
                    field_type: "byteN".into(),
                    optional: true,
                    is_array: false,
                    default_value: None,
                    options: HashMap::from([("length".into(), Value::Number(32.0))]),
                },
                FieldDefinition {
                    name: "test64".into(),
                    field_type: "byte64".into(),
                    optional: false,
                    is_array: false,
                    default_value: None,
                    options: HashMap::new(),
                },
                FieldDefinition {
                    name: "address".into(),
                    field_type: "SampleAddress".into(),
                    optional: false,
                    is_array: false,
                    default_value: None,
                    options: HashMap::new(),
                },
            ],
        },
        SchemaDefinition {
            name: "SampleAddress".into(),
            fields: vec![
                FieldDefinition {
                    name: "street".into(),
                    field_type: "string".into(),
                    optional: true,
                    is_array: false,
                    default_value: Some(Value::String("Default Street".into())),
                    options: HashMap::from([("encoding".into(), Value::String("ascii".into()))]),
                },
                FieldDefinition {
                    name: "city".into(),
                    field_type: "string8".into(),
                    optional: false,
                    is_array: false,
                    default_value: None,
                    options: HashMap::new(),
                },
                FieldDefinition {
                    name: "zip".into(),
                    field_type: "int32".into(),
                    optional: false,
                    is_array: false,
                    default_value: None,
                    options: HashMap::new(),
                },
            ],
        },
    ]
}

fn fixture_path(path: &str) -> String {
    format!(
        "{}/tests/fixtures/expected-outputs/{}",
        env!("CARGO_MANIFEST_DIR"),
        path
    )
}

#[test]
fn test_typescript_generator() {
    let defs = sample_definitions();
    let output = sia_schema_core::gen::typescript::generate(&defs);
    let expected = std::fs::read_to_string(fixture_path("ts/sample.ts.expected")).unwrap();
    assert_eq!(output, expected, "TypeScript output mismatch");
}

#[test]
fn test_go_generator() {
    let defs = sample_definitions();
    let output = sia_schema_core::gen::go::generate(&defs);
    let expected = std::fs::read_to_string(fixture_path("go/sample.go.expected")).unwrap();
    assert_eq!(output, expected, "Go output mismatch");
}

#[test]
fn test_python_generator() {
    let defs = sample_definitions();
    let output = sia_schema_core::gen::python::generate(&defs);
    let expected = std::fs::read_to_string(fixture_path("py/sample.py.expected")).unwrap();
    assert_eq!(output, expected, "Python output mismatch");
}

#[test]
fn test_cpp_generator() {
    let defs = sample_definitions();
    let (hpp, cpp) = sia_schema_core::gen::cpp::generate(&defs, "sample");
    let expected_hpp = std::fs::read_to_string(fixture_path("cpp/sample.hpp.expected")).unwrap();
    let expected_cpp = std::fs::read_to_string(fixture_path("cpp/sample.cpp.expected")).unwrap();
    assert_eq!(hpp, expected_hpp, "C++ header output mismatch");
    assert_eq!(cpp, expected_cpp, "C++ source output mismatch");
}
