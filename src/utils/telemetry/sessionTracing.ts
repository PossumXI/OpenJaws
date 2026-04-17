import { randomUUID } from 'crypto'
import { appendFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import {
  createImmaculateEvent,
  isImmaculateEventName,
  stableSerializeImmaculateEvent,
  type ImmaculateEvent,
  type ImmaculateEventName,
} from '../../immaculate/events.js'

type TraceAttributeValue = string | number | boolean | null

type ActiveSessionTrace = {
  sessionId: string
  path: string
  startedAt: number
}

let activeSessionTrace: ActiveSessionTrace | null = null
let currentInteractionSpan: Span | undefined
let currentToolSpan: Span | undefined
let currentToolBlockedSpan: Span | undefined
let currentToolExecutionSpan: Span | undefined
let trackedSessionId: string | null = null

export type Span = {
  id: string
  name: string
  startedAt: number
}

export type LLMRequestNewContext = Record<string, unknown>

function resolveTraceDir(): string {
  return resolve(
    process.env.OPENJAWS_SESSION_TRACE_DIR ??
      join(process.cwd(), 'artifacts', 'immaculate', 'session-traces'),
  )
}

function sanitizeSessionId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-')
}

function clipText(value: string | undefined, maxChars = 400): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}…` : trimmed
}

function normalizeAttributeValue(value: unknown): TraceAttributeValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (value === undefined) {
    return null
  }
  if (value instanceof Error) {
    return value.message
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeAttributes(
  attributes?: Record<string, unknown>,
): Record<string, TraceAttributeValue> | undefined {
  if (!attributes) {
    return undefined
  }
  const normalized = Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      normalizeAttributeValue(value),
    ]),
  )
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function appendEvent(event: ImmaculateEvent): void {
  if (!activeSessionTrace) {
    return
  }
  appendFileSync(activeSessionTrace.path, `${stableSerializeImmaculateEvent(event)}\n`, 'utf8')
}

function buildEvent(
  type: ImmaculateEventName,
  payload: Record<string, unknown>,
): ImmaculateEvent | null {
  if (!activeSessionTrace) {
    return null
  }

  try {
    return createImmaculateEvent({
      schemaVersion: 'immaculate.event.v1',
      timestamp: new Date().toISOString(),
      sessionId: activeSessionTrace.sessionId,
      type,
      ...payload,
    } as ImmaculateEvent)
  } catch {
    return null
  }
}

function logTypedEvent(type: ImmaculateEventName, payload: Record<string, unknown>): void {
  const event = buildEvent(type, payload)
  if (event) {
    appendEvent(event)
  }
}

function startNamedSpan(
  eventType: Extract<
    ImmaculateEventName,
    | 'interaction.started'
    | 'llm.request.started'
    | 'hook.started'
    | 'tool.started'
    | 'tool.blocked.started'
    | 'tool.execution.started'
  >,
  name: string,
  options?: {
    inputPreview?: string | null
    attributes?: Record<string, unknown>
  },
): Span {
  const span = {
    id: randomUUID(),
    name,
    startedAt: Date.now(),
  }
  logTypedEvent(eventType, {
    spanId: span.id,
    name: span.name,
    inputPreview: options?.inputPreview ?? null,
    attributes: normalizeAttributes(options?.attributes),
  })
  return span
}

function endNamedSpan(
  eventType: Extract<
    ImmaculateEventName,
    | 'interaction.completed'
    | 'llm.request.completed'
    | 'hook.completed'
    | 'tool.completed'
    | 'tool.blocked.completed'
    | 'tool.execution.completed'
  >,
  span: Span | undefined,
  options?: {
    outputPreview?: string | null
    attributes?: Record<string, unknown>
  },
): void {
  if (!span) {
    return
  }
  logTypedEvent(eventType, {
    spanId: span.id,
    name: span.name,
    latencyMs: Math.max(0, Date.now() - span.startedAt),
    outputPreview: options?.outputPreview ?? null,
    attributes: normalizeAttributes(options?.attributes),
  })
}

export function startSessionTrace(sessionId: string): void {
  const safeSessionId = sanitizeSessionId(sessionId)
  const traceDir = resolveTraceDir()
  mkdirSync(traceDir, { recursive: true })
  const path = join(traceDir, `${safeSessionId}.jsonl`)

  activeSessionTrace = {
    sessionId,
    path,
    startedAt: Date.now(),
  }
  currentInteractionSpan = undefined
  currentToolSpan = undefined
  currentToolBlockedSpan = undefined
  currentToolExecutionSpan = undefined

  logTypedEvent('session.started', {
    tracePath: path,
  })
}

export function endSessionTrace(): void {
  if (!activeSessionTrace) {
    return
  }
  logTypedEvent('session.ended', {
    durationMs: Math.max(0, Date.now() - activeSessionTrace.startedAt),
  })
  activeSessionTrace = null
  currentInteractionSpan = undefined
  currentToolSpan = undefined
  currentToolBlockedSpan = undefined
  currentToolExecutionSpan = undefined
  trackedSessionId = null
}

export function getActiveSessionTracePath(): string | null {
  return activeSessionTrace?.path ?? null
}

export function logSessionTraceEvent(event: string, data?: unknown): void {
  if (!activeSessionTrace || !isImmaculateEventName(event)) {
    return
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return
  }
  logTypedEvent(event, data as Record<string, unknown>)
}

export function isBetaTracingEnabled(): boolean {
  return activeSessionTrace !== null
}

export function startLLMRequestSpan(
  name = 'llm_request',
  context?: LLMRequestNewContext,
): Span | undefined {
  return startNamedSpan('llm.request.started', name, {
    attributes: context,
  })
}

export function endLLMRequestSpan(
  span?: Span,
  attributes?: Record<string, unknown>,
): void {
  endNamedSpan('llm.request.completed', span, {
    attributes,
  })
}

export function startHookSpan(
  name = 'hook',
  attributes?: Record<string, unknown>,
): Span | undefined {
  return startNamedSpan('hook.started', name, {
    attributes,
  })
}

export function endHookSpan(
  span?: Span,
  attributes?: Record<string, unknown>,
): void {
  endNamedSpan('hook.completed', span, {
    attributes,
  })
}

export function startInteractionSpan(
  prompt?: string,
  attributes?: Record<string, unknown>,
): Span | undefined {
  currentInteractionSpan = startNamedSpan('interaction.started', 'interaction', {
    inputPreview: clipText(prompt),
    attributes,
  })
  return currentInteractionSpan
}

export function endInteractionSpan(
  span?: Span,
  attributes?: Record<string, unknown>,
): void {
  const targetSpan = span ?? currentInteractionSpan
  endNamedSpan('interaction.completed', targetSpan, {
    attributes,
  })
  if (!span || span.id === currentInteractionSpan?.id) {
    currentInteractionSpan = undefined
  }
}

export function startToolSpan(
  toolName = 'tool',
  input?: string,
): Span | undefined {
  currentToolSpan = startNamedSpan('tool.started', toolName, {
    inputPreview: clipText(input),
  })
  return currentToolSpan
}

export function endToolSpan(
  output?: string,
  attributes?: Record<string, unknown>,
): void {
  endNamedSpan('tool.completed', currentToolSpan, {
    outputPreview: clipText(output),
    attributes,
  })
  currentToolSpan = undefined
}

export function startToolBlockedOnUserSpan(): Span | undefined {
  currentToolBlockedSpan = startNamedSpan('tool.blocked.started', 'tool_blocked')
  return currentToolBlockedSpan
}

export function endToolBlockedOnUserSpan(
  result?: string,
  source?: string,
): void {
  endNamedSpan('tool.blocked.completed', currentToolBlockedSpan, {
    outputPreview: clipText(result),
    attributes: source ? { source } : undefined,
  })
  currentToolBlockedSpan = undefined
}

export function startToolExecutionSpan(): Span | undefined {
  currentToolExecutionSpan = startNamedSpan(
    'tool.execution.started',
    'tool_execution',
  )
  return currentToolExecutionSpan
}

export function endToolExecutionSpan(
  attributes?: Record<string, unknown>,
): void {
  endNamedSpan('tool.execution.completed', currentToolExecutionSpan, {
    attributes,
  })
  currentToolExecutionSpan = undefined
}

export function addToolContentEvent(
  name: string,
  attributes?: Record<string, unknown>,
): void {
  if (!currentToolSpan) {
    return
  }
  logTypedEvent('tool.content', {
    spanId: currentToolSpan.id,
    name,
    attributes: normalizeAttributes(attributes),
  })
}

export function syncSessionTrace(sessionId: string): void {
  if (trackedSessionId === sessionId && activeSessionTrace) {
    return
  }
  if (activeSessionTrace) {
    endSessionTrace()
  }
  startSessionTrace(sessionId)
  trackedSessionId = sessionId
}
