import { CPPGenerator } from "../src/generator/cpp/index.js";
import fs from "fs";
import path from "path";
import { sampleSiaDefinition } from "./sample-mock.js";

const EXPECTED_OUTPUT_ROOT = path.join(
  process.cwd(),
  "tests",
  "expected-outputs",
);

describe("CPPGenerator with sample.sia schema", () => {
  it("should generate C++ header and source files for sample.sia that match the expected output", async () => {
    const generator = new CPPGenerator(sampleSiaDefinition);
    const { hpp, cpp } = await generator.toHeaderAndSource("sample");

    const expectedHppFilePath = path.resolve(
      EXPECTED_OUTPUT_ROOT,
      "cpp",
      "sample.hpp.expected",
    );
    const expectedHpp = fs.readFileSync(expectedHppFilePath, "utf8");
    expect(hpp).toBe(expectedHpp);

    const expectedCppFilePath = path.resolve(
      EXPECTED_OUTPUT_ROOT,
      "cpp",
      "sample.cpp.expected",
    );
    const expectedCpp = fs.readFileSync(expectedCppFilePath, "utf8");
    expect(cpp).toBe(expectedCpp);
  });
});
