// SANITIZED: Sink killswitch - both sinks killed
export type SinkName = 'datadog' | 'firstParty'
export function isSinkKilled(_sink: SinkName): boolean { return true; }
