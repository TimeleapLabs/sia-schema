#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { compile } from "./index.js";
import { logError } from "./utils/log.js";

import { ILexingError, IRecognitionException } from "chevrotain";

const program = new Command();

program
  .name("sia-schema")
  .description("A schema compiler for the fastest serializing library.")
  .version("1.0.0");

program
  .command("compile")
  .description("Compile a .sia file")
  .argument("<file>", "file to compile")
  .option("-s, --string", "display the result as a string")
  .option("-o, --output <file>", "output the result to a file")
  .action(async (file, options) => {
    const src = readFileSync(file, "utf-8");
    try {
      const result = compile(src);

      if (options.string) {
        try {
          return console.log(JSON.stringify(result, null, 2));
        } catch (error) {
          console.error(error);
          process.exitCode = 1;
          return;
        }
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
  });

program.parse();
