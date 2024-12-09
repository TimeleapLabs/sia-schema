#!/usr/bin/env node

import { ILexingError, IRecognitionException } from "chevrotain";
import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { generateSia, getExtension } from "./generator/index.js";
import { compile } from "./index.js";
import { logError } from "./utils/log.js";

const program = new Command();

program
  .name("sia")
  .description("A schema compiler for the fastest serializing library.")
  .version("1.0.0");

program
  .command("compile")
  .description("Compile a .sia file")
  .argument("<file>", "file to compile")
  .option("-s, --generate-sir", "generate the sir file")
  .option("-e, --extension <extension>", "extension of the output file")
  .action(async (file, options) => {
    const extension = getExtension(options.extension);

    if (!extension) {
      console.error("Invalid extension");
      process.exitCode = 1;
      return;
    }

    const src = readFileSync(file, "utf-8");
    try {
      const sir = compile(src);

      if (options.generateSir) {
        const outputFile = file.replace(".sia", ".json");
        writeFileSync(outputFile, JSON.stringify(sir, null, 2));
        console.info(`Sir file written to ${outputFile}`);
      }

      if (options.extension) {
        console.info(`Generating ${extension} file`);
      } else {
        console.info(`Detected extension: ${extension}`);
      }

      const newFileName = file.replace(".sia", `.${extension}`);
      const generatedSia = await generateSia(sir, extension);
      writeFileSync(newFileName, generatedSia);
      console.info(`Sia file written to ${newFileName}`);
    } catch (error) {
      logError(src, file, error as ILexingError | IRecognitionException);
      process.exitCode = 1;
    }
  });

program.parse();
