import { readFileSync, writeFileSync } from "fs";
import { compile } from "@/compiler/index.js";
import { logError } from "@/utils/log.js";
import { Command } from "commander";
import { TSGenerator } from "@/generator/ts/index.js";
import { PyGenerator } from "@/generator/python/index.js";
import { CPPGenerator } from "@/generator/cpp/index.js";
import { ILexingError, IRecognitionException } from "chevrotain";
import { CodeGeneratorConstructor } from "@/generator/common/types.js";
import { basename, extname, join } from "path";
import { resolveExtension } from "@/utils/extension.js";

export type Options = {
  string: boolean;
  output: string;
  extension?: string;
};

const getGenerator = (outputExt: string): CodeGeneratorConstructor => {
  switch (outputExt) {
    case "ts":
      return TSGenerator;
    case "py":
      return PyGenerator;
    case "cpp":
      return CPPGenerator;
    default:
      throw new Error(`Unsupported output extension: ${outputExt}`);
  }
};

const compileAction = async (file: string, options: Options) => {
  const src = readFileSync(file, "utf-8");
  const ext = await resolveExtension(options);

  try {
    const Generator = getGenerator(ext);
    const sir = compile(src);
    const generator = new Generator(sir);

    if (ext === "cpp" && generator instanceof CPPGenerator) {
      const basePath = options.output
        ? options.output
        : join(process.cwd(), basename(file, extname(file)));

      const baseFileName = basename(basePath, extname(basePath));
      const { hpp, cpp } = await generator.toHeaderAndSource(baseFileName);

      if (options.string) {
        console.log("Header File:\n", hpp);
        console.log("Source File:\n", cpp);
      } else {
        const headerPath = `${basePath}.hpp`;
        const sourcePath = `${basePath}.cpp`;
        writeFileSync(headerPath, hpp);
        writeFileSync(sourcePath, cpp);
        console.log(`Output written to ${headerPath} and ${sourcePath}`);
      }

      return;
    }

    const result = generator.toString();

    let outputPath = options.output;
    if (outputPath && extname(outputPath) === "") {
      outputPath += `.${ext}`;
    }

    if (options.string) {
      return console.log(result);
    }

    if (outputPath) {
      writeFileSync(outputPath, result);
      console.log(`Output written to ${outputPath}`);
      return;
    }

    return console.dir(result, { depth: null });
  } catch (error) {
    logError(src, file, error as ILexingError | IRecognitionException);
    process.exitCode = 1;
  }
};

export const compileCommand = new Command("compile")
  .description("Compile a .sia file")
  .argument("<file>", "file to compile")
  .option("-s, --string", "display the result as a string")
  .option("-o, --output <file>", "output the result to a file")
  .option("-e, --extension <ext>", "output extension")
  .action(compileAction);
