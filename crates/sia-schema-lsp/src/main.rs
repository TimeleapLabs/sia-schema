mod capabilities;
mod symbols;

use dashmap::DashMap;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

use sia_schema_core::error::LineIndex;
use sia_schema_core::ir::Definition;

/// Per-document state.
struct DocumentState {
    source: String,
    definitions: Vec<Definition>,
    line_index: LineIndex,
    symbol_table: symbols::SymbolTable,
}

struct SiaLspBackend {
    client: Client,
    documents: DashMap<Url, DocumentState>,
}

impl SiaLspBackend {
    fn new(client: Client) -> Self {
        Self {
            client,
            documents: DashMap::new(),
        }
    }

    async fn on_change(&self, uri: Url, source: String) {
        let line_index = LineIndex::new(&source);
        let (definitions, parse_diagnostics) = sia_schema_core::parse(&source);
        let symbol_table = symbols::SymbolTable::from_definitions(&definitions, &source);

        // Collect diagnostics
        let mut lsp_diags = capabilities::to_lsp_diagnostics(&parse_diagnostics, &line_index);
        lsp_diags.extend(capabilities::semantic_diagnostics(
            &definitions,
            &source,
            &line_index,
        ));

        self.client
            .publish_diagnostics(uri.clone(), lsp_diags, None)
            .await;

        self.documents.insert(
            uri,
            DocumentState {
                source,
                definitions,
                line_index,
                symbol_table,
            },
        );
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for SiaLspBackend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(vec![" ".into(), "\n".into()]),
                    ..Default::default()
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                definition_provider: Some(OneOf::Left(true)),
                document_symbol_provider: Some(OneOf::Left(true)),
                rename_provider: Some(OneOf::Right(RenameOptions {
                    prepare_provider: Some(true),
                    work_done_progress_options: Default::default(),
                })),
                document_formatting_provider: Some(OneOf::Left(true)),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Sia schema LSP server initialized")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        self.on_change(params.text_document.uri, params.text_document.text)
            .await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        if let Some(change) = params.content_changes.into_iter().last() {
            self.on_change(params.text_document.uri, change.text).await;
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        self.documents.remove(&params.text_document.uri);
        self.client
            .publish_diagnostics(params.text_document.uri, vec![], None)
            .await;
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = &params.text_document_position.text_document.uri;
        let position = params.text_document_position.position;

        if let Some(doc) = self.documents.get(uri) {
            let items = capabilities::completions(&doc.source, position, &doc.symbol_table);
            Ok(Some(CompletionResponse::Array(items)))
        } else {
            Ok(None)
        }
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let position = params.text_document_position_params.position;

        if let Some(doc) = self.documents.get(uri) {
            Ok(capabilities::hover(
                &doc.source,
                position,
                &doc.symbol_table,
            ))
        } else {
            Ok(None)
        }
    }

    async fn goto_definition(
        &self,
        params: GotoDefinitionParams,
    ) -> Result<Option<GotoDefinitionResponse>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let position = params.text_document_position_params.position;

        if let Some(doc) = self.documents.get(uri) {
            Ok(capabilities::goto_definition(
                &doc.source,
                position,
                &doc.symbol_table,
                uri,
            ))
        } else {
            Ok(None)
        }
    }

    async fn document_symbol(
        &self,
        params: DocumentSymbolParams,
    ) -> Result<Option<DocumentSymbolResponse>> {
        let uri = &params.text_document.uri;

        if let Some(doc) = self.documents.get(uri) {
            let symbols = capabilities::document_symbols(
                &doc.definitions,
                &doc.line_index,
                &doc.symbol_table,
            );
            Ok(Some(DocumentSymbolResponse::Nested(symbols)))
        } else {
            Ok(None)
        }
    }

    async fn prepare_rename(
        &self,
        params: TextDocumentPositionParams,
    ) -> Result<Option<PrepareRenameResponse>> {
        let uri = &params.text_document.uri;
        let position = params.position;

        if let Some(doc) = self.documents.get(uri) {
            Ok(capabilities::prepare_rename(
                &doc.source,
                position,
                &doc.symbol_table,
            ))
        } else {
            Ok(None)
        }
    }

    async fn rename(&self, params: RenameParams) -> Result<Option<WorkspaceEdit>> {
        let uri = &params.text_document_position.text_document.uri;
        let position = params.text_document_position.position;

        if let Some(doc) = self.documents.get(uri) {
            Ok(capabilities::rename(
                &doc.source,
                position,
                &params.new_name,
                &doc.symbol_table,
                uri,
            ))
        } else {
            Ok(None)
        }
    }

    async fn formatting(&self, params: DocumentFormattingParams) -> Result<Option<Vec<TextEdit>>> {
        let uri = &params.text_document.uri;

        if let Some(doc) = self.documents.get(uri) {
            Ok(Some(capabilities::format_document(&doc.source)))
        } else {
            Ok(None)
        }
    }
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::new(SiaLspBackend::new);
    Server::new(stdin, stdout, socket).serve(service).await;
}
