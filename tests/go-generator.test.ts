import { GoGenerator } from "../src/generator/go/index.js";
import fs from "fs";
import path from "path";
import { sampleSiaDefinition } from "./sample-mock.js";

const EXPECTED_OUTPUT_ROOT = path.join(
  process.cwd(),
  "tests",
  "expected-outputs",
);

describe("GoGenerator with sample.sia schema", () => {
  it("should generate Go code for sample.sia that matches the expected output file", async () => {
    const generator = new GoGenerator(sampleSiaDefinition);
    const generatedCode = await generator.toCode();

    const expectedFilePath = path.resolve(
      EXPECTED_OUTPUT_ROOT,
      "go",
      "sample.go.expected",
    );
    const expectedCode = fs.readFileSync(expectedFilePath, "utf8");

    expect(generatedCode).toBe(expectedCode);
  });
});
