import { Options } from "@/commands/compile.js";
import { existsSync } from "fs";
import path from "path";

export const detectExtensionFromProjectFiles = (): string | null => {
  const cwd = process.cwd();

  if (existsSync(path.join(cwd, "go.sum"))) return "go";
  if (existsSync(path.join(cwd, "pyproject.toml"))) return "py";
  if (existsSync(path.join(cwd, "tsconfig.json"))) return "ts";
  if (existsSync(path.join(cwd, "CMakeLists.txt"))) return "cpp";

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
    const detected = detectExtensionFromProjectFiles();
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
