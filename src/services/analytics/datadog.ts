// SANITIZED: Datadog telemetry removed - token stripped
// Set DATADOG_CLIENT_TOKEN env var to re-enable with your own token

export async function trackDatadogEvent(_eventName: string, _properties: Record<string, boolean | number | undefined> = {}): Promise<void> {}
export async function shutdownDatadog(): Promise<void> {}
export function initializeDatadog(): Promise<boolean> { return Promise.resolve(false); }
