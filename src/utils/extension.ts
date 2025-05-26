import { Options } from "@/commands/compile.js";
import { existsSync } from "fs";
import path from "path";

/**
 * Tries to detect the language extension based on common project files
 * in the given directory and up to two parent directories.
 */
export const detectExtensionFromProjectFiles = (
  directory: string,
): string | null => {
  const maxDepth = 3;
  let currentDir = path.resolve(directory);

  for (let i = 0; i < maxDepth; i++) {
    if (existsSync(path.join(currentDir, "go.sum"))) return "go";
    if (existsSync(path.join(currentDir, "pyproject.toml"))) return "py";
    if (existsSync(path.join(currentDir, "tsconfig.json"))) return "ts";
    if (existsSync(path.join(currentDir, "CMakeLists.txt"))) return "cpp";

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // reached root
    currentDir = parentDir;
  }

  return null;
};

export const extensionToLanguageMap: Record<string, string> = {
  ts: "TypeScript",
  py: "Python",
  go: "Go",
  cpp: "C++",
};

export const resolveExtension = async (options: Options): Promise<string> => {
  let ext =
    options.extension ??
    (options.output ? path.extname(options.output).slice(1) : "");

  if (!ext) {
    const directory = options.output
      ? path.dirname(path.resolve(options.output))
      : process.cwd();

    const detected = detectExtensionFromProjectFiles(directory);
    if (detected) {
      ext = detected;
      const languageName = extensionToLanguageMap[ext] ?? ext;
      console.log(
        `\x1b[32mGenerating code for language ${languageName}, if you want to override this behavior use \x1b[1m-e {extension}\x1b[0m\x1b[32m\x1b[0m`,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else {
      throw new Error(
        "Unable to detect project language. Use -e to specify manually.",
      );
    }
  }

  return ext;
};
