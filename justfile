# Sia Schema — task runner
# https://github.com/casey/just

# Tree-sitter CLI needs brew-installed Node (bun's node shim breaks it)
tree-sitter-path := "/opt/homebrew/bin:" + env("PATH")
tree-sitter-dir := "packages/tree-sitter-sia"
nvim-parser := "~/.config/nvim/parser/sia.so"

# Default: run full check
default: check

# Build all crates
build:
    cargo build

# Run all Rust tests
test:
    cargo test

# Format Rust code
fmt:
    cargo fmt

# Lint with clippy
clippy:
    cargo clippy --all-targets --all-features

# Full CI-style check: format, lint, test
check:
    cargo fmt --check
    cargo clippy --all-targets --all-features
    cargo test

# Regenerate Tree-sitter parser from grammar.js
grammar-generate:
    cd {{tree-sitter-dir}} && PATH="{{tree-sitter-path}}" tree-sitter generate

# Run Tree-sitter corpus tests
grammar-test:
    cd {{tree-sitter-dir}} && PATH="{{tree-sitter-path}}" tree-sitter test

# Recompile Tree-sitter parser .so for Neovim
grammar-nvim:
    cc -o {{nvim-parser}} -shared -fPIC -Os {{tree-sitter-dir}}/src/parser.c -I {{tree-sitter-dir}}/src

# Full grammar pipeline: generate, test, install to Neovim
grammar: grammar-generate grammar-test grammar-nvim

# Build WASM package
wasm:
    wasm-pack build crates/sia-schema-wasm --target web

# Build VS Code extension
vscode:
    cd packages/vscode && npm install && npm run compile

# Install sia binary to PATH from source
install:
    cargo install --path crates/sia-schema-cli

# Install sia binary, compile extension, launch Extension Development Host
vscode-dev: vscode
    cargo install --path crates/sia-schema-cli
    code --extensionDevelopmentPath="$(pwd)/packages/vscode" "$(pwd)"

# Package VS Code extension as .vsix
vscode-package: vscode
    cd packages/vscode && npx @vscode/vsce package

# Package and install VS Code extension locally
vscode-install: vscode-package
    code --install-extension packages/vscode/sia-schema-2.0.0.vsix

# Everything: full check + grammar rebuild
all: check grammar
