// SANITIZED: Telemetry events removed
export type TelemetryEvent = Record<string, unknown>;
export function logTelemetryEvent(_event: TelemetryEvent): void {}
export async function logOTelEvent(_name: string, _event?: TelemetryEvent): Promise<void> {}
export function redactIfDisabled<T>(value: T): T { return value; }
export function flushTelemetryEvents(): Promise<void> { return Promise.resolve(); }
