import { PyGenerator } from "../src/generator/python/index.js";
import fs from "fs";
import path from "path";
import { sampleSiaDefinition } from "./sample-mock.js";

const EXPECTED_OUTPUT_ROOT = path.join(
  process.cwd(),
  "tests",
  "expected-outputs",
);

describe("PyGenerator with sample.sia schema", () => {
  it("should generate Python code for sample.sia that matches the expected output file", async () => {
    const generator = new PyGenerator(sampleSiaDefinition);
    const generatedCode = await generator.toCode();

    const expectedFilePath = path.join(
      EXPECTED_OUTPUT_ROOT,
      "py",
      "sample.py.expected",
    );
    const expectedCode = fs.readFileSync(expectedFilePath, "utf8");

    expect(generatedCode).toBe(expectedCode);
  });
});
