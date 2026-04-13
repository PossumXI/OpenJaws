// SANITIZED: Plugin fetch telemetry - no-op
export type PluginFetchSource = 'install_counts'
export type PluginFetchOutcome = 'success'

export function logPluginFetch(
  _source: PluginFetchSource,
  _urlOrSpec: string | undefined,
  _outcome: PluginFetchOutcome,
  _durationMs: number,
  _errorKind?: string,
): void {}

export function classifyFetchError(_error: unknown): string { return 'other'; }
