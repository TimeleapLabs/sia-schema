import { TSGenerator } from "../src/generator/ts/index.js";
import fs from "fs";
import path from "path";
import { sampleSiaDefinition } from "./sample-mock.js";

const EXPECTED_OUTPUT_ROOT = path.join(
  process.cwd(),
  "tests",
  "expected-outputs",
);

describe("TSGenerator with sample.sia schema", () => {
  it("should generate code for sample.sia that matches the expected output file", async () => {
    const generator = new TSGenerator(sampleSiaDefinition);
    const generatedCode = await generator.toCode();

    const expectedFilePath = path.join(
      EXPECTED_OUTPUT_ROOT,
      "ts",
      "sample.ts.expected",
    );
    const expectedCode = fs.readFileSync(expectedFilePath, "utf8");

    expect(generatedCode).toBe(expectedCode);
  });
});
