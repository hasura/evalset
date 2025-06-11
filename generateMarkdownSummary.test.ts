import { describe, it, expect } from "vitest";
import testResults from "./mock_latency_results.json";
import fs from "fs";
import path from "path";
import { generateMarkdownSummary } from "./generateMarkdownSummary";

const markdownSummary = fs.readFileSync(
  path.join(__dirname, "mock_latency_results_summary.md"),
  "utf-8"
);

describe("generateMarkdownSummary", () => {
  it("should generate a markdown report from latency test results", () => {
    const testEnvConfigs = [
      { name: "production" },
      { name: "production(6fafc431d2)" },
    ];

    const result = generateMarkdownSummary(testResults, testEnvConfigs);

    expect(result).toEqual(markdownSummary);
  });
});
