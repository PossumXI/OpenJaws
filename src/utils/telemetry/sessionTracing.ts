// SANITIZED: Session tracing removed
export function startSessionTrace(_sessionId: string): void {}
export function endSessionTrace(): void {}
export function logSessionTraceEvent(_event: string, _data?: unknown): void {}

export type Span = {
  name: string
  startedAt: number
}

export type LLMRequestNewContext = Record<string, unknown>

export function isBetaTracingEnabled(): boolean {
  return false
}

export function startLLMRequestSpan(
  _name?: string,
  _context?: LLMRequestNewContext,
): Span | undefined {
  return { name: 'llm_request', startedAt: Date.now() }
}

export function endLLMRequestSpan(
  _span?: Span,
  _attributes?: Record<string, unknown>,
): void {}

export function startHookSpan(
  _name?: string,
  _attributes?: Record<string, unknown>,
): Span | undefined {
  return { name: 'hook', startedAt: Date.now() }
}

export function endHookSpan(
  _span?: Span,
  _attributes?: Record<string, unknown>,
): void {}

export function startInteractionSpan(
  _prompt?: string,
  _attributes?: Record<string, unknown>,
): Span | undefined {
  return { name: 'interaction', startedAt: Date.now() }
}

export function endInteractionSpan(
  _span?: Span,
  _attributes?: Record<string, unknown>,
): void {}

export function startToolSpan(
  _toolName?: string,
  _input?: string,
): Span | undefined {
  return { name: 'tool', startedAt: Date.now() }
}

export function endToolSpan(
  _output?: string,
  _attributes?: Record<string, unknown>,
): void {}

export function startToolBlockedOnUserSpan(): Span | undefined {
  return { name: 'tool_blocked', startedAt: Date.now() }
}

export function endToolBlockedOnUserSpan(
  _result?: string,
  _source?: string,
): void {}

export function startToolExecutionSpan(): Span | undefined {
  return { name: 'tool_execution', startedAt: Date.now() }
}

export function endToolExecutionSpan(
  _attributes?: Record<string, unknown>,
): void {}

export function addToolContentEvent(
  _name: string,
  _attributes?: Record<string, unknown>,
): void {}
