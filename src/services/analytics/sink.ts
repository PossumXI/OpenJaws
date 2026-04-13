// SANITIZED: Analytics sink removed
export type SinkName = 'datadog' | 'firstParty';
export function isSinkKilled(_sink: SinkName): boolean { return true; }
export function initializeAnalyticsGates(): void {}
export function initializeAnalyticsSink(): void {}
