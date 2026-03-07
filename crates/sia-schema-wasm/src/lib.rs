use wasm_bindgen::prelude::*;

/// Parse a .sia source string and return the IR as a JSON string.
#[wasm_bindgen]
pub fn compile(source: &str) -> Result<JsValue, JsValue> {
    let (definitions, diagnostics) = sia_schema_core::parse(source);

    if diagnostics
        .iter()
        .any(|d| d.severity == sia_schema_core::error::Severity::Error)
    {
        let err_json =
            serde_json::to_string(&diagnostics).map_err(|e| JsValue::from_str(&e.to_string()))?;
        return Err(JsValue::from_str(&err_json));
    }

    let json =
        serde_json::to_string(&definitions).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(JsValue::from_str(&json))
}

/// Generate code for a target language from an IR JSON string.
///
/// `target` should be one of: "ts", "go", "py", "cpp"
#[wasm_bindgen]
pub fn generate(ir_json: &str, target: &str) -> Result<String, JsValue> {
    let definitions: Vec<sia_schema_core::ir::Definition> =
        serde_json::from_str(ir_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let target = sia_schema_core::gen::Target::from_extension(target)
        .ok_or_else(|| JsValue::from_str(&format!("Unknown target: {}", target)))?;

    Ok(sia_schema_core::generate(&definitions, target))
}

/// Parse and generate in one step.
#[wasm_bindgen]
pub fn compile_and_generate(source: &str, target: &str) -> Result<String, JsValue> {
    let (definitions, diagnostics) = sia_schema_core::parse(source);

    if diagnostics
        .iter()
        .any(|d| d.severity == sia_schema_core::error::Severity::Error)
    {
        let err_msgs: Vec<String> = diagnostics.iter().map(|d| d.message.clone()).collect();
        return Err(JsValue::from_str(&err_msgs.join("\n")));
    }

    let target = sia_schema_core::gen::Target::from_extension(target)
        .ok_or_else(|| JsValue::from_str(&format!("Unknown target: {}", target)))?;

    Ok(sia_schema_core::generate(&definitions, target))
}
