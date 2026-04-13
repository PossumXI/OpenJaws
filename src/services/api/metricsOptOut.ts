// SANITIZED: Metrics opt-out - always disabled
export async function checkMetricsEnabled(): Promise<{ enabled: boolean; hasError: boolean }> {
  return { enabled: false, hasError: false };
}
