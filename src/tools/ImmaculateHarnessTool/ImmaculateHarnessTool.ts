import { z } from 'zod/v4'
import type { ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  callImmaculateHarness,
  IMMACULATE_ARTIFACT_FORMATS,
  IMMACULATE_CONTROL_ACTIONS,
  IMMACULATE_HARNESS_ACTIONS,
  IMMACULATE_OLLAMA_ROLES,
  IMMACULATE_SEARCH_FRESHNESS,
  IMMACULATE_TOOL_RECEIPT_KINDS,
} from '../../utils/immaculateHarness.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  DESCRIPTION,
  IMMACULATE_HARNESS_TOOL_NAME,
  PROMPT,
} from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(IMMACULATE_HARNESS_ACTIONS),
    actor: z
      .string()
      .optional()
      .describe('Optional Immaculate actor override for governed actions'),
    purpose: z
      .array(z.string())
      .optional()
      .describe('Optional Immaculate purpose override for governed actions'),
    policyId: z
      .string()
      .optional()
      .describe('Optional Immaculate policy override for governed actions'),
    consentScope: z
      .string()
      .optional()
      .describe(
        'Optional Immaculate consent scope override for governed actions',
      ),
    control: z
      .object({
        action: z.enum(IMMACULATE_CONTROL_ACTIONS),
        target: z.string().optional(),
        value: z.number().optional(),
      })
      .optional()
      .describe('Required for action="control"'),
    run: z
      .object({
        layerId: z.string().optional(),
        objective: z.string().optional(),
      })
      .optional()
      .describe('Optional payload for action="run"'),
    register: z
      .object({
        role: z.enum(IMMACULATE_OLLAMA_ROLES).optional(),
      })
      .optional()
      .describe('Optional payload for action="register_ollama"'),
    worker: z
      .object({
        workerId: z.string(),
        workerLabel: z.string().optional(),
        hostLabel: z.string().optional(),
        executionProfile: z.enum(['local', 'remote']).optional(),
        executionEndpoint: z.string().optional(),
        registeredAt: z.string().optional(),
        heartbeatAt: z.string().optional(),
        leaseDurationMs: z.number().optional(),
        watch: z.boolean().optional(),
        allowHostRisk: z.boolean().optional(),
        supportedBaseModels: z.array(z.string()).optional(),
        preferredLayerIds: z.array(z.string()).optional(),
      })
      .optional()
      .describe('Optional payload for worker registration, heartbeat, or unregister actions'),
    assignWorker: z
      .object({
        requestedExecutionDecision: z
          .enum(['allow_local', 'remote_required', 'preflight_blocked'])
          .optional(),
        baseModel: z.string().optional(),
        preferredLayerIds: z.array(z.string()).optional(),
        recommendedLayerId: z.string().optional(),
        target: z.string().optional(),
      })
      .optional()
      .describe('Optional payload for action="assign_worker"'),
    receipts: z
      .object({
        kind: z.enum(IMMACULATE_TOOL_RECEIPT_KINDS).optional(),
        limit: z.number().optional(),
        receiptId: z.string().optional(),
      })
      .optional()
      .describe('Optional payload for tool_receipts or tool_receipt actions'),
    toolFetch: z
      .object({
        url: z.string(),
        maxBytes: z.number().optional(),
      })
      .optional()
      .describe('Required for action="tool_fetch"'),
    toolSearch: z
      .object({
        query: z.string(),
        maxResults: z.number().optional(),
        freshness: z.enum(IMMACULATE_SEARCH_FRESHNESS).optional(),
        domains: z.array(z.string()).optional(),
      })
      .optional()
      .describe('Required for action="tool_search"'),
    artifact: z
      .object({
        name: z.string().optional(),
        format: z.enum(IMMACULATE_ARTIFACT_FORMATS),
        content: z.string(),
        sourceReceiptPath: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .optional()
      .describe('Required for action="artifact_package"'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    status: z.number(),
    route: z.string(),
    summary: z.string(),
    json: z.string(),
    governance: z
      .object({
        action: z.string(),
        purpose: z.array(z.string()),
        policyId: z.string(),
        consentScope: z.string(),
        actor: z.string(),
      })
      .nullable(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

const READ_ONLY_ACTIONS = new Set([
  'health',
  'snapshot',
  'topology',
  'governance_status',
  'intelligence',
  'executions',
  'workers',
  'ollama_models',
  'tool_capabilities',
  'tool_receipts',
  'tool_receipt',
])

export const ImmaculateHarnessTool = buildTool({
  name: IMMACULATE_HARNESS_TOOL_NAME,
  userFacingName() {
    return 'ImmaculateHarness'
  },
  searchHint: 'inspect and control the Immaculate orchestration harness',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly(input: Input) {
    return READ_ONLY_ACTIONS.has(input.action)
  },
  toAutoClassifierInput(input: Input) {
    return `Immaculate ${input.action}${input.control?.action ? ` ${input.control.action}` : ''}`
  },
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  async call(input: Input, context: ToolUseContext) {
    const result = await callImmaculateHarness(input, {
      signal: context.abortController.signal,
    })

    return {
      data: result,
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const governance = output.governance
      ? `\nGovernance ${output.governance.action} · ${output.governance.policyId} · ${output.governance.consentScope} · ${output.governance.actor}`
      : ''
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `HTTP ${output.status} ${output.route}\n${output.summary}${governance}\n${output.json}`,
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, Output>)
