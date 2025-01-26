import { readFileSync, writeFileSync } from "fs";
import { compile } from "@/compiler/index.js";
import { logError } from "@/utils/log.js";
import { Command } from "commander";

import { ILexingError, IRecognitionException } from "chevrotain";

type Options = {
  string: boolean;
  output: string;
};

const irAction = async (file: string, options: Options) => {
  const src = readFileSync(file, "utf-8");
  try {
    const result = compile(src);

    if (options.string) {
      return console.log(JSON.stringify(result, null, 2));
    }

    if (options.output) {
      writeFileSync(options.output, JSON.stringify(result, null, 2));
      console.log(`Output written to ${options.output}`);
      return;
    }

    return console.dir(result, { depth: null });
  } catch (error) {
    logError(src, file, error as ILexingError | IRecognitionException);
    process.exitCode = 1;
  }
};

export const compileCommand = new Command("ir")
  .description("Compile a .sia file to intermediate representation")
  .argument("<file>", "file to compile")
  .option("-s, --string", "display the result as a string")
  .option("-o, --output <file>", "output the result to a file")
  .action(irAction);
