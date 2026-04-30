export type ContextConfidenceInput = {
  valid: boolean;
  confidenceScore: number;
  scannedFiles: number;
  totalFiles: number;
  skippedFiles: number;
};

export function clampContextScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function contextConfidenceLabel(input: ContextConfidenceInput): string {
  const score = clampContextScore(input.confidenceScore);
  if (!input.valid || input.scannedFiles === 0) return "workspace needed";
  if (score >= 85) return "trusted";
  if (score >= 65) return "usable";
  if (score >= 40) return "partial";
  return "thin";
}

export function formatTokenEstimate(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0 tokens";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K tokens`;
  return `${Math.round(tokens)} tokens`;
}

export function contextScanRatio(input: Pick<ContextConfidenceInput, "scannedFiles" | "totalFiles">): number {
  if (input.totalFiles <= 0) return 0;
  return clampContextScore((input.scannedFiles / input.totalFiles) * 100);
}

export function contextCoverageTone(percent: number): "active" | "waiting" | "blocked" {
  if (percent >= 40) return "active";
  if (percent > 0) return "waiting";
  return "blocked";
}
