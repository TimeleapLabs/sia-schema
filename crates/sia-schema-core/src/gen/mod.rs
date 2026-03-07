pub mod cpp;
pub mod go;
pub mod python;
pub mod typescript;

/// Target language for code generation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    TypeScript,
    Go,
    Python,
    Cpp,
}

impl Target {
    /// Parse a target from a file extension string.
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext {
            "ts" => Some(Target::TypeScript),
            "go" => Some(Target::Go),
            "py" => Some(Target::Python),
            "cpp" | "hpp" | "h" | "cc" => Some(Target::Cpp),
            _ => None,
        }
    }

    /// Get the default file extension for this target.
    pub fn extension(&self) -> &'static str {
        match self {
            Target::TypeScript => "ts",
            Target::Go => "go",
            Target::Python => "py",
            Target::Cpp => "cpp",
        }
    }

    /// Detect target from project files in a directory.
    pub fn detect_from_dir(dir: &std::path::Path) -> Option<Self> {
        // Walk up to 3 parent directories
        let mut current = dir.to_path_buf();
        for _ in 0..3 {
            if current.join("go.sum").exists() {
                return Some(Target::Go);
            }
            if current.join("pyproject.toml").exists() {
                return Some(Target::Python);
            }
            if current.join("tsconfig.json").exists() {
                return Some(Target::TypeScript);
            }
            if current.join("CMakeLists.txt").exists() {
                return Some(Target::Cpp);
            }
            if !current.pop() {
                break;
            }
        }
        None
    }
}
