import { z } from 'zod'

const IMMACULATE_EVENT_SCHEMA_VERSION = 'immaculate.event.v1' as const

const attributeValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const attributeRecordSchema = z.record(z.string(), attributeValueSchema)

const baseEventSchema = z.object({
  schemaVersion: z.literal(IMMACULATE_EVENT_SCHEMA_VERSION),
  timestamp: z.string().datetime(),
  sessionId: z.string().min(1),
})

const sessionStartedEventSchema = baseEventSchema.extend({
  type: z.literal('session.started'),
  tracePath: z.string().min(1),
  runId: z.string().min(1).optional(),
  sessionScope: z.string().min(1).optional(),
  repoPath: z.string().min(1).optional(),
  worktreePath: z.string().min(1).optional(),
  gitBranch: z.string().min(1).optional(),
  repoSha: z.string().min(1).optional(),
})

const sessionEndedEventSchema = baseEventSchema.extend({
  type: z.literal('session.ended'),
  durationMs: z.number().nonnegative().nullable().optional(),
})

const routeDispatchedEventSchema = baseEventSchema.extend({
  type: z.literal('route.dispatched'),
  routeId: z.string().min(1),
  runId: z.string().min(1).nullable().optional(),
  provider: z.string().min(1).nullable().optional(),
  model: z.string().min(1).nullable().optional(),
  workerId: z.string().min(1).nullable().optional(),
  queueDepth: z.number().int().nonnegative().nullable().optional(),
  projectRoot: z.string().min(1).nullable().optional(),
})

const routeLeasedEventSchema = baseEventSchema.extend({
  type: z.literal('route.leased'),
  routeId: z.string().min(1),
  leaseId: z.string().min(1),
  workerId: z.string().min(1).nullable().optional(),
  ttlMs: z.number().nonnegative().nullable().optional(),
})

const workerAssignedEventSchema = baseEventSchema.extend({
  type: z.literal('worker.assigned'),
  workerId: z.string().min(1),
  routeId: z.string().min(1),
  assignmentId: z.string().min(1).nullable().optional(),
  projectRoot: z.string().min(1).nullable().optional(),
})

const turnCompleteEventSchema = baseEventSchema.extend({
  type: z.literal('turn.complete'),
  turnId: z.string().min(1),
  routeId: z.string().min(1).nullable().optional(),
  workerId: z.string().min(1).nullable().optional(),
  status: z.enum(['completed', 'failed', 'timeout']),
  latencyMs: z.number().nonnegative(),
  promptTokens: z.number().int().nonnegative().nullable().optional(),
  completionTokens: z.number().int().nonnegative().nullable().optional(),
})

const sampleEventStatusSchema = z.enum(['completed', 'failed', 'timeout'])

const reflexSampledEventSchema = baseEventSchema.extend({
  type: z.literal('reflex.sampled'),
  sampleId: z.string().min(1),
  workerId: z.string().min(1).nullable().optional(),
  latencyMs: z.number().nonnegative(),
  tokenCount: z.number().int().nonnegative().nullable().optional(),
  status: sampleEventStatusSchema,
})

const cognitiveSampledEventSchema = baseEventSchema.extend({
  type: z.literal('cognitive.sampled'),
  sampleId: z.string().min(1),
  workerId: z.string().min(1).nullable().optional(),
  latencyMs: z.number().nonnegative(),
  tokenCount: z.number().int().nonnegative().nullable().optional(),
  status: sampleEventStatusSchema,
})

const spanStartedEventSchema = baseEventSchema.extend({
  type: z.enum([
    'interaction.started',
    'llm.request.started',
    'hook.started',
    'tool.started',
    'tool.blocked.started',
    'tool.execution.started',
  ]),
  spanId: z.string().min(1),
  name: z.string().min(1),
  inputPreview: z.string().nullable().optional(),
  attributes: attributeRecordSchema.optional(),
})

const spanCompletedEventSchema = baseEventSchema.extend({
  type: z.enum([
    'interaction.completed',
    'llm.request.completed',
    'hook.completed',
    'tool.completed',
    'tool.blocked.completed',
    'tool.execution.completed',
  ]),
  spanId: z.string().min(1),
  name: z.string().min(1),
  latencyMs: z.number().nonnegative(),
  outputPreview: z.string().nullable().optional(),
  attributes: attributeRecordSchema.optional(),
})

const toolContentEventSchema = baseEventSchema.extend({
  type: z.literal('tool.content'),
  spanId: z.string().min(1),
  name: z.string().min(1),
  attributes: attributeRecordSchema.optional(),
})

export const immaculateEventSchema = z.discriminatedUnion('type', [
  sessionStartedEventSchema,
  sessionEndedEventSchema,
  routeDispatchedEventSchema,
  routeLeasedEventSchema,
  workerAssignedEventSchema,
  turnCompleteEventSchema,
  reflexSampledEventSchema,
  cognitiveSampledEventSchema,
  spanStartedEventSchema,
  spanCompletedEventSchema,
  toolContentEventSchema,
])

export type ImmaculateEvent = z.infer<typeof immaculateEventSchema>
export type ImmaculateEventName = ImmaculateEvent['type']

const IMMACULATE_EVENT_NAMES = [
  'session.started',
  'session.ended',
  'route.dispatched',
  'route.leased',
  'worker.assigned',
  'turn.complete',
  'reflex.sampled',
  'cognitive.sampled',
  'interaction.started',
  'interaction.completed',
  'llm.request.started',
  'llm.request.completed',
  'hook.started',
  'hook.completed',
  'tool.started',
  'tool.completed',
  'tool.blocked.started',
  'tool.blocked.completed',
  'tool.execution.started',
  'tool.execution.completed',
  'tool.content',
] as const satisfies readonly ImmaculateEventName[]

const eventNames = new Set<ImmaculateEventName>(IMMACULATE_EVENT_NAMES)

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableNormalize(child)]),
    )
  }
  return value
}

export function isImmaculateEventName(value: string): value is ImmaculateEventName {
  return eventNames.has(value as ImmaculateEventName)
}

export function createImmaculateEvent(event: ImmaculateEvent): ImmaculateEvent {
  return immaculateEventSchema.parse(event)
}

export function stableSerializeImmaculateEvent(event: ImmaculateEvent): string {
  return JSON.stringify(stableNormalize(createImmaculateEvent(event)))
}

export { IMMACULATE_EVENT_NAMES, IMMACULATE_EVENT_SCHEMA_VERSION }
