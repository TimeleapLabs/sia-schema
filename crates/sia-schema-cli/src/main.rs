use std::fs;
use std::path::{Path, PathBuf};
use std::process;

use clap::{Parser, Subcommand};
use sia_schema_core::gen::Target;

#[derive(Parser)]
#[command(name = "sia", about = "Sia schema compiler")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Compile a .sia file to target language code
    Compile {
        /// The .sia file to compile
        file: PathBuf,

        /// Display the result as a string (stdout)
        #[arg(short, long)]
        string: bool,

        /// Output the result to a file
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Output extension: ts, go, py, cpp
        #[arg(short, long)]
        extension: Option<String>,
    },

    /// Compile a .sia file to intermediate representation (JSON)
    Ir {
        /// The .sia file to compile
        file: PathBuf,

        /// Display the result as a string (stdout)
        #[arg(short, long)]
        string: bool,

        /// Output the result to a file
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Format .sia files
    Fmt {
        /// File or directory to format (formats all .sia files in a directory)
        path: PathBuf,

        /// Format files in-place (default: print to stdout)
        #[arg(short, long)]
        write: bool,

        /// Check if files are formatted (exit 1 if not)
        #[arg(short, long)]
        check: bool,
    },

    /// Lint .sia files for errors and warnings
    Check {
        /// File or directory to check
        path: PathBuf,
    },

    /// Start the Language Server Protocol (LSP) server
    Lsp,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Compile {
            file,
            string,
            output,
            extension,
        } => {
            cmd_compile(&file, string, output.as_deref(), extension.as_deref());
        }
        Commands::Ir {
            file,
            string,
            output,
        } => {
            cmd_ir(&file, string, output.as_deref());
        }
        Commands::Fmt { path, write, check } => {
            cmd_fmt(&path, write, check);
        }
        Commands::Check { path } => {
            cmd_check(&path);
        }
        Commands::Lsp => {
            let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
            rt.block_on(sia_schema_lsp::run());
        }
    }
}

fn cmd_fmt(path: &Path, write: bool, check: bool) {
    let files = collect_sia_files(path);

    if files.is_empty() {
        eprintln!("No .sia files found in {}", path.display());
        process::exit(1);
    }

    let mut unformatted_count = 0;

    for file in &files {
        let source = read_file(file);
        let formatted = sia_schema_core::formatter::format(&source);

        if check {
            if source != formatted {
                eprintln!("Would reformat: {}", file.display());
                unformatted_count += 1;
            }
        } else if write {
            if source != formatted {
                fs::write(file, &formatted).unwrap_or_else(|e| {
                    eprintln!("Error writing {}: {}", file.display(), e);
                    process::exit(1);
                });
                eprintln!("Formatted: {}", file.display());
            }
        } else {
            // Print to stdout (only useful for single files)
            print!("{}", formatted);
        }
    }

    if check && unformatted_count > 0 {
        eprintln!("{} file(s) would be reformatted", unformatted_count);
        process::exit(1);
    }
}

fn collect_sia_files(path: &Path) -> Vec<PathBuf> {
    if path.is_file() {
        return vec![path.to_path_buf()];
    }

    if path.is_dir() {
        let mut files = Vec::new();
        collect_sia_files_recursive(path, &mut files);
        files.sort();
        return files;
    }

    Vec::new()
}

fn collect_sia_files_recursive(dir: &Path, files: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // Skip hidden directories and common non-source dirs
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') || name == "node_modules" || name == "target" {
                    continue;
                }
            }
            collect_sia_files_recursive(&path, files);
        } else if path.extension().and_then(|e| e.to_str()) == Some("sia") {
            files.push(path);
        }
    }
}

fn cmd_check(path: &Path) {
    let files = collect_sia_files(path);

    if files.is_empty() {
        eprintln!("No .sia files found in {}", path.display());
        process::exit(1);
    }

    let mut total_errors = 0usize;
    let mut total_warnings = 0usize;
    let mut total_info = 0usize;

    for file in &files {
        let source = read_file(file);
        let (definitions, parse_diagnostics) = sia_schema_core::parse(&source);
        let line_index = sia_schema_core::error::LineIndex::new(&source);

        // Print parse errors
        for diag in &parse_diagnostics {
            let (line, col) = line_index.line_col(diag.span.offset);
            eprintln!(
                "{}:{}:{}: {:?}: {}",
                file.display(),
                line + 1,
                col + 1,
                diag.severity,
                diag.message
            );
            match diag.severity {
                sia_schema_core::error::Severity::Error => total_errors += 1,
                sia_schema_core::error::Severity::Warning => total_warnings += 1,
                sia_schema_core::error::Severity::Info => total_info += 1,
            }
        }

        // Run linter
        let lint_diags = sia_schema_core::linter::lint(&definitions, &source);
        for diag in &lint_diags {
            let (line, col) = line_index.line_col(diag.span.offset);
            let severity_label = match diag.severity {
                sia_schema_core::error::Severity::Error => "error",
                sia_schema_core::error::Severity::Warning => "warning",
                sia_schema_core::error::Severity::Info => "info",
            };
            eprintln!(
                "{}:{}:{}: {} [{}]: {}",
                file.display(),
                line + 1,
                col + 1,
                severity_label,
                diag.rule,
                diag.message
            );
            match diag.severity {
                sia_schema_core::error::Severity::Error => total_errors += 1,
                sia_schema_core::error::Severity::Warning => total_warnings += 1,
                sia_schema_core::error::Severity::Info => total_info += 1,
            }
        }
    }

    let total = total_errors + total_warnings + total_info;
    if total > 0 {
        eprintln!();
        eprintln!(
            "Found {} issue(s): {} error(s), {} warning(s), {} info",
            total, total_errors, total_warnings, total_info
        );
    }

    if total_errors > 0 {
        process::exit(1);
    }
}

fn cmd_compile(file: &Path, to_string: bool, output: Option<&Path>, extension: Option<&str>) {
    let source = read_file(file);
    let (definitions, diagnostics) = sia_schema_core::parse(&source);

    if !diagnostics.is_empty() {
        for diag in &diagnostics {
            let line_index = sia_schema_core::error::LineIndex::new(&source);
            let (line, col) = line_index.line_col(diag.span.offset);
            eprintln!(
                "{}:{}:{}: {:?}: {}",
                file.display(),
                line + 1,
                col + 1,
                diag.severity,
                diag.message
            );
        }
        if diagnostics
            .iter()
            .any(|d| d.severity == sia_schema_core::error::Severity::Error)
        {
            process::exit(1);
        }
    }

    // Determine target language
    let target = determine_target(extension, output, file);

    if target == Target::Cpp {
        // C++ generates two files
        let file_stem = output
            .and_then(|p| p.file_stem())
            .or_else(|| file.file_stem())
            .and_then(|s| s.to_str())
            .unwrap_or("output");

        let cpp_output = sia_schema_core::generate_cpp(&definitions, file_stem);

        if to_string {
            println!("{}", cpp_output.hpp);
            println!();
            println!("{}", cpp_output.cpp);
        } else if let Some(out_path) = output {
            let hpp_path = out_path.with_extension("hpp");
            let cpp_path = out_path.with_extension("cpp");
            fs::write(&hpp_path, &cpp_output.hpp).unwrap_or_else(|e| {
                eprintln!("Error writing {}: {}", hpp_path.display(), e);
                process::exit(1);
            });
            fs::write(&cpp_path, &cpp_output.cpp).unwrap_or_else(|e| {
                eprintln!("Error writing {}: {}", cpp_path.display(), e);
                process::exit(1);
            });
        } else {
            println!("{}", cpp_output.hpp);
            println!();
            println!("{}", cpp_output.cpp);
        }
    } else {
        let code = sia_schema_core::generate(&definitions, target);

        if to_string {
            print!("{}", code);
        } else if let Some(out_path) = output {
            fs::write(out_path, &code).unwrap_or_else(|e| {
                eprintln!("Error writing {}: {}", out_path.display(), e);
                process::exit(1);
            });
        } else {
            print!("{}", code);
        }
    }
}

fn cmd_ir(file: &Path, to_string: bool, output: Option<&Path>) {
    let source = read_file(file);
    let (definitions, diagnostics) = sia_schema_core::parse(&source);

    if !diagnostics.is_empty() {
        for diag in &diagnostics {
            let line_index = sia_schema_core::error::LineIndex::new(&source);
            let (line, col) = line_index.line_col(diag.span.offset);
            eprintln!(
                "{}:{}:{}: {:?}: {}",
                file.display(),
                line + 1,
                col + 1,
                diag.severity,
                diag.message
            );
        }
        if diagnostics
            .iter()
            .any(|d| d.severity == sia_schema_core::error::Severity::Error)
        {
            process::exit(1);
        }
    }

    let json = serde_json::to_string_pretty(&definitions).unwrap();

    if to_string || output.is_none() {
        println!("{}", json);
    }

    if let Some(out_path) = output {
        fs::write(out_path, &json).unwrap_or_else(|e| {
            eprintln!("Error writing {}: {}", out_path.display(), e);
            process::exit(1);
        });
    }
}

fn read_file(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("Error reading {}: {}", path.display(), e);
        process::exit(1);
    })
}

fn determine_target(extension: Option<&str>, output: Option<&Path>, input: &Path) -> Target {
    // 1. Explicit extension flag
    if let Some(ext) = extension {
        return Target::from_extension(ext).unwrap_or_else(|| {
            eprintln!("Unknown extension: {}. Use ts, go, py, or cpp.", ext);
            process::exit(1);
        });
    }

    // 2. Output file extension
    if let Some(out_path) = output {
        if let Some(ext) = out_path.extension().and_then(|e| e.to_str()) {
            if let Some(target) = Target::from_extension(ext) {
                return target;
            }
        }
    }

    // 3. Auto-detect from project files
    let dir = input.parent().unwrap_or(Path::new("."));
    if let Some(target) = Target::detect_from_dir(dir) {
        return target;
    }

    eprintln!("Unable to detect project language. Use -e to specify manually.");
    process::exit(1);
}
