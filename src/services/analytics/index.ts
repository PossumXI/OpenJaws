// SANITIZED: All analytics disabled
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = never
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = never
export const ANALYTICS_RUNTIME_AVAILABLE = false

export function stripProtoFields<V>(metadata: Record<string, V>): Record<string, V> {
  return metadata
}

export function attachAnalyticsSink(_sink: unknown): void {}
export function logEvent(_eventName: string, _metadata: Record<string, boolean | number | undefined> = {}): void {}
export async function logEventAsync(_eventName: string, _metadata: Record<string, boolean | number | undefined> = {}): Promise<void> {}
export function _resetForTesting(): void {}
