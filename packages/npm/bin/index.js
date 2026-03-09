#!/usr/bin/env node

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const PLATFORM_PACKAGES = {
  "linux-x64": "@timeleap/sia-schema-linux-x64",
  "linux-arm64": "@timeleap/sia-schema-linux-arm64",
  "darwin-x64": "@timeleap/sia-schema-darwin-x64",
  "darwin-arm64": "@timeleap/sia-schema-darwin-arm64",
  "win32-x64": "@timeleap/sia-schema-win32-x64",
};

function findBinary() {
  const platform = process.platform;
  const arch = process.arch;
  const key = `${platform}-${arch}`;
  const pkg = PLATFORM_PACKAGES[key];

  if (!pkg) {
    console.error(
      `Unsupported platform: ${platform}-${arch}. ` +
        `Supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}`,
    );
    process.exit(1);
  }

  // Try to find the platform-specific package
  try {
    const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
    const binaryName = platform === "win32" ? "sia.exe" : "sia";
    const binaryPath = path.join(pkgDir, "bin", binaryName);

    if (fs.existsSync(binaryPath)) {
      return binaryPath;
    }
  } catch {
    // Package not installed
  }

  // Fall back to PATH
  return "sia";
}

const binary = findBinary();
const args = process.argv.slice(2);

try {
  execFileSync(binary, args, { stdio: "inherit" });
} catch (error) {
  if (error.status !== undefined) {
    process.exit(error.status);
  }
  throw error;
}
