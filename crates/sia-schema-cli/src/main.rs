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
