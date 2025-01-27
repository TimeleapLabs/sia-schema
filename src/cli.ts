#!/usr/bin/env node

import { Command } from "commander";
import { compileCommand } from "./commands/compile.js";
import { irCommand } from "./commands/ir.js";

const program = new Command();

program
  .name("sia")
  .description("A schema compiler for the fastest serializing library.")
  .version("1.0.0")
  .addCommand(irCommand)
  .addCommand(compileCommand);

program.parse();
