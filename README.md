# Sia Schema Compiler

A schema compiler for [Sia](https://github.com/TimeleapLabs/ts-sia), the fastest serialization library. Define your data structures in `.sia` files and generate type-safe serialization code for TypeScript, Go, Python, and C++.

## Installation

### Cargo (from source)

```bash
cargo install sia-schema
```

### npm

```bash
npm install -g @timeleap/sia-schema
```

Or without installing:

```bash
npx @timeleap/sia-schema compile schema.sia
```

### pip

```bash
pip install timeleap-sia-schema
```

### GitHub Releases

Pre-built binaries for Linux (x64, arm64), macOS (x64, arm64), and Windows (x64) are available on the [releases page](https://github.com/TimeleapLabs/sia-schema/releases).

## Why a schema compiler?

Sia is a fast serialization library designed for scenarios where performance is critical, such as real-time or distributed systems. However, the library's API is low-level:

```javascript
new Sia().addString8("Alice").addUInt32(30).addAscii("alice@example.com").content;
```

This gets unwieldy fast with nested types, arrays, and optional fields. The schema compiler generates all the boilerplate for you from a simple, declarative schema definition.

## Schema syntax

```sia
schema Person {
  name     string8
  age?     int32
  email?   string8(encoding = "ascii")[]
  tags     string8[]
  address  Address
}

schema Address {
  street?  string(encoding = "ascii") = "Default Street"
  city     string8
  zip      int32
}
```

- **Types**: `bool`, `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `string`, `string8`, `string16`, `string32`, `string64` and custom schema references
- **Optional fields**: Append `?` to the field name
- **Arrays**: Append `[]` to the type
- **Options**: `(encoding = "ascii")`, `(encoding = "utf8")`, etc.
- **Default values**: `= "value"` after the type

## CLI

The `sia` binary provides four commands:

### `sia compile` — generate code

```bash
# Auto-detect target from project files (package.json, go.mod, etc.)
sia compile schema.sia

# Explicit output file
sia compile schema.sia -o output.ts

# Explicit language
sia compile schema.sia -e go -s

# Print to stdout
sia compile schema.sia -e py -s
```

### `sia ir` — emit intermediate representation

```bash
sia ir schema.sia           # JSON to stdout
sia ir schema.sia -o ir.json  # JSON to file
```

### `sia fmt` — format `.sia` files

```bash
sia fmt schema.sia          # Print formatted to stdout
sia fmt schema.sia --write  # Format in place
sia fmt src/ --check        # Check formatting (CI)
```

### `sia check` — lint `.sia` files

```bash
sia check schema.sia  # Lint a single file
sia check src/        # Lint all .sia files in a directory
```

## Editor support

### VS Code

Install the **Sia Schema** extension from the `packages/vscode/` directory (or from the VS Code Marketplace once published). Provides:

- Syntax highlighting (TextMate grammar)
- LSP integration (diagnostics, completions, formatting, hover, go-to-definition, document symbols, code actions)
- Format on save (enabled by default)

### Neovim

Install the [tree-sitter-sia](https://github.com/TimeleapLabs/tree-sitter-sia) plugin for syntax highlighting, LSP, and filetype detection. The compiler includes a built-in LSP server (`sia lsp`).

Requirements: Neovim 0.11+, `nvim-treesitter`, Mason (optional).

## Supported languages

| Language   | Structs | Encode | Decode | Arrays | Optional | Defaults |
| ---------- | ------- | ------ | ------ | ------ | -------- | -------- |
| TypeScript | Yes     | Yes    | Yes    | Yes    | Yes      | Yes      |
| Go         | Yes     | Yes    | Yes    | Yes    | Yes      | Yes      |
| Python     | Yes     | Yes    | Yes    | Yes    | Yes      | Yes      |
| C++        | Yes     | Yes    | Yes    | Yes    | Yes      | Yes      |

## Development

### Project structure

```
crates/
  sia-schema-core/     Core library: lexer, parser, IR, generators, formatter, linter
  sia-schema/          CLI binary (sia)
  sia-schema-lsp/      LSP server library (used by `sia lsp` subcommand)
  sia-schema-wasm/     WASM bindings
packages/
  npm/                 npm wrapper package (@timeleap/sia-schema)
  python/              Python wrapper for PyPI (timeleap-sia-schema)
  vscode/              VS Code extension
```

### Building

```bash
cargo build --workspace                    # Build everything
cargo test --workspace                     # Run all tests
cargo build --release -p sia-schema         # Release build of CLI
```

### Just recipes

```bash
just check    # cargo check + clippy + fmt --check
just test     # cargo test --workspace
just fmt      # cargo fmt
just clippy   # cargo clippy
just wasm     # wasm-pack build
```

Run `just --list` to see all available recipes.

## License

MIT
