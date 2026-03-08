import * as path from "path";
import { workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

function findSiaBinary(): string {
  // 1. Check user configuration
  const config = workspace.getConfiguration("sia-schema");
  const configPath = config.get<string>("lsp.path");
  if (configPath) {
    return configPath;
  }

  // 2. Try to find sia from the npm platform package
  const platform = process.platform;
  const arch = process.arch;
  const key = `${platform}-${arch}`;
  const PLATFORM_PACKAGES: Record<string, string> = {
    "linux-x64": "@timeleap/sia-schema-linux-x64",
    "linux-arm64": "@timeleap/sia-schema-linux-arm64",
    "darwin-x64": "@timeleap/sia-schema-darwin-x64",
    "darwin-arm64": "@timeleap/sia-schema-darwin-arm64",
    "win32-x64": "@timeleap/sia-schema-win32-x64",
  };

  const pkg = PLATFORM_PACKAGES[key];
  if (pkg) {
    try {
      const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
      const binaryName = platform === "win32" ? "sia.exe" : "sia";
      const binaryPath = path.join(pkgDir, "bin", binaryName);
      require("fs").accessSync(binaryPath);
      return binaryPath;
    } catch {
      // Fall through to PATH
    }
  }

  // 3. Fall back to PATH
  return "sia";
}

export function activate(_context: ExtensionContext) {
  const siaBinary = findSiaBinary();

  const serverOptions: ServerOptions = {
    command: siaBinary,
    args: ["lsp"],
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
