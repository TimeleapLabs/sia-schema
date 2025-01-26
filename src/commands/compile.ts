import { readFileSync, writeFileSync } from "fs";
import { compile } from "@/compiler/index.js";
import { logError } from "@/utils/log.js";
import { Command } from "commander";
import { TSGenerator } from "@/generator/ts/index.js";

import { ILexingError, IRecognitionException } from "chevrotain";
import { CodeGeneratorConstructor } from "@/generator/common/types.js";

type Options = {
  string: boolean;
  output: string;
  extension?: string;
};

const getGenerator = (outputExt: string): CodeGeneratorConstructor => {
  switch (outputExt) {
    case "ts":
      return TSGenerator;
    default:
      throw new Error(`Unsupported output extension: ${outputExt}`);
  }
};

const compileAction = async (file: string, options: Options) => {
  const src = readFileSync(file, "utf-8");
  const ext = options.output?.split(".").pop() ?? options.extension ?? "";

  try {
    const Generator = getGenerator(ext);
    const sir = compile(src);
    const generator = new Generator(sir);
    const result = await generator.toCode();

    if (options.string) {
      return console.log(result);
    }

    if (options.output) {
      writeFileSync(options.output, result);
      console.log(`Output written to ${options.output}`);
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
