import * as path from "path";
import { workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

function findSiaLspBinary(context: ExtensionContext): string {
  // 1. Check user configuration
  const config = workspace.getConfiguration("sia-schema");
  const configPath = config.get<string>("lsp.path");
  if (configPath) {
    return configPath;
  }

  // 2. Check bundled binary in extension
  const platform = process.platform;
  const arch = process.arch;
  const binaryName = platform === "win32" ? "sia-lsp.exe" : "sia-lsp";
  const bundledPath = path.join(
    context.extensionPath,
    "bin",
    `${platform}-${arch}`,
    binaryName,
  );

  try {
    require("fs").accessSync(bundledPath);
    return bundledPath;
  } catch {
    // Fall through to PATH
  }

  // 3. Fall back to PATH
  return "sia-lsp";
}

export function activate(context: ExtensionContext) {
  const serverPath = findSiaLspBinary(context);

  const serverOptions: ServerOptions = {
    command: serverPath,
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "sia" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.sia"),
    },
  };

  client = new LanguageClient(
    "sia-schema",
    "Sia Schema Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
