// SANITIZED: Telemetry logger - no-op
export class OpenJawsDiagLogger {
  error(_message: string, ..._: unknown[]): void {}
  warn(_message: string, ..._: unknown[]): void {}
  info(_message: string, ..._args: unknown[]): void {}
  debug(_message: string, ..._args: unknown[]): void {}
  verbose(_message: string, ..._args: unknown[]): void {}
}
