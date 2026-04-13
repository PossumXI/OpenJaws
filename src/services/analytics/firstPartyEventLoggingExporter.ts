// SANITIZED: 1P event logging removed
export class FirstPartyEventLoggingExporter {
  async export(_logs: unknown, _callback: unknown): Promise<void> {}
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
  async getQueuedEventCount(): Promise<number> { return 0; }
}
