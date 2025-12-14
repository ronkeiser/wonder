import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItem,
  createConnection,
  Definition,
  DefinitionParams,
  Hover,
  HoverParams,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  SemanticTokensParams,
  SemanticTokensRequest,
  TextDocumentChangeEvent,
  TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import {
  provideCompletions,
  provideDefinition,
  provideHover,
  provideSemanticTokens,
  semanticTokensLegend,
  validateDocument,
} from './capabilities/index';
import { DocumentManager } from './document-manager';

// Create connection
const connection = createConnection(ProposedFeatures.all);

// Create text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Create document manager for parsing/caching
const documentManager = new DocumentManager();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '$', ':', '"', "'"],
      },
      hoverProvider: true,
      definitionProvider: true,
      semanticTokensProvider: {
        legend: semanticTokensLegend,
        full: true,
      },
    },
  };
});

// Validate document on change
documents.onDidChangeContent((change: TextDocumentChangeEvent<TextDocument>) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(document: TextDocument): Promise<void> {
  const diagnostics = validateDocument(document, documentManager);
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Hover
connection.onHover((params: HoverParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return provideHover(params, document, documentManager);
});

// Go to definition
connection.onDefinition((params: DefinitionParams): Definition | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return provideDefinition(params, document, documentManager);
});

// Completions
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return provideCompletions(params, document, documentManager);
});

// Semantic tokens
connection.onRequest(SemanticTokensRequest.type, (params: SemanticTokensParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  return provideSemanticTokens(document, documentManager);
});

// Start listening
documents.listen(connection);
connection.listen();
