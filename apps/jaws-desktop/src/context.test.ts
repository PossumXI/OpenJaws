import { describe, expect, test } from "bun:test";
import {
  contextConfidenceLabel,
  contextCoverageTone,
  contextScanRatio,
  formatTokenEstimate
} from "./context";

describe("context trust helpers", () => {
  test("labels confidence without claiming trust for empty context", () => {
    expect(
      contextConfidenceLabel({
        valid: false,
        confidenceScore: 100,
        scannedFiles: 10,
        totalFiles: 10,
        skippedFiles: 0
      })
    ).toBe("workspace needed");
    expect(
      contextConfidenceLabel({
        valid: true,
        confidenceScore: 88,
        scannedFiles: 10,
        totalFiles: 12,
        skippedFiles: 2
      })
    ).toBe("trusted");
  });

  test("computes scan ratios and tones", () => {
    expect(contextScanRatio({ scannedFiles: 4, totalFiles: 10 })).toBe(40);
    expect(contextCoverageTone(0)).toBe("blocked");
    expect(contextCoverageTone(15)).toBe("waiting");
    expect(contextCoverageTone(45)).toBe("active");
  });

  test("formats token estimates", () => {
    expect(formatTokenEstimate(0)).toBe("0 tokens");
    expect(formatTokenEstimate(980)).toBe("980 tokens");
    expect(formatTokenEstimate(18_400)).toBe("18.4K tokens");
    expect(formatTokenEstimate(1_200_000)).toBe("1.2M tokens");
  });
});
