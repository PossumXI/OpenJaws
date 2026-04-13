import type { LocalCommandCall } from '../../types/command.js'
import {
  callImmaculateHarness,
  getImmaculateHarnessDeckReceipt,
  getImmaculateHarnessStatus,
  IMMACULATE_CONTROL_ACTIONS,
  IMMACULATE_OLLAMA_ROLES,
  type ImmaculateControlAction,
  type ImmaculateHarnessResult,
  type ImmaculateHarnessStatus,
} from '../../utils/immaculateHarness.js'

type ParsedImmaculateCommand =
  | { type: 'help' }
  | { type: 'status' }
  | {
      type:
        | 'health'
        | 'snapshot'
        | 'topology'
        | 'governance_status'
        | 'intelligence'
        | 'executions'
        | 'workers'
        | 'ollama_models'
    }
  | {
      type: 'register_ollama'
      role?: (typeof IMMACULATE_OLLAMA_ROLES)[number]
    }
  | {
      type: 'run'
      layerId?: string
      objective?: string
    }
  | {
      type: 'control'
      action: ImmaculateControlAction
      target?: string
      value?: number
    }
  | { type: 'error'; message: string }

const CONTROL_ACTION_SET = new Set(IMMACULATE_CONTROL_ACTIONS)
const OLLAMA_ROLE_SET = new Set(IMMACULATE_OLLAMA_ROLES)

function parseJsonRecord(json: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function buildHelpMessage(): string {
  return [
    'Usage: /immaculate [status|health|topology|intelligence|executions|workers|models|register|run|control] ...',
    '',
    'Commands:',
    '- /immaculate',
    '- /immaculate status',
    '- /immaculate health',
    '- /immaculate topology',
    '- /immaculate intelligence',
    '- /immaculate executions',
    '- /immaculate workers',
    '- /immaculate models',
    '- /immaculate register [soul|mid|reasoner|guard]',
    '- /immaculate run [--layer <layer-id>] [objective]',
    '- /immaculate control <pause|resume|boost|reroute|pulse|reset|step> [target] [value]',
    '- /immaculate pause',
    '- /immaculate pulse',
    '',
    'Notes:',
    '- Governed actions use explicit Immaculate actor/purpose/policy/consent headers by default.',
    '- /immaculate models reads Ollama models from the harness-side intelligence layer.',
  ].join('\n')
}

function parseValueToken(token?: string): number | undefined {
  if (!token) {
    return undefined
  }
  const value = Number(token)
  return Number.isFinite(value) ? value : undefined
}

export function parseImmaculateCommand(
  rawArgs?: string,
): ParsedImmaculateCommand {
  const args = rawArgs?.trim() ?? ''
  if (!args || args === 'status') {
    return { type: 'status' }
  }
  if (['help', '-h', '--help'].includes(args)) {
    return { type: 'help' }
  }

  const parts = args.split(/\s+/).filter(Boolean)
  const head = parts[0]?.toLowerCase()
  if (!head) {
    return { type: 'status' }
  }

  if (
    [
      'health',
      'snapshot',
      'topology',
      'intelligence',
      'executions',
      'workers',
    ].includes(head)
  ) {
    return { type: head as ParsedImmaculateCommand['type'] }
  }

  if (head === 'governance' || head === 'governance-status') {
    return { type: 'governance_status' }
  }

  if (head === 'models' || head === 'ollama-models') {
    return { type: 'ollama_models' }
  }

  if (head === 'register') {
    const role = parts[1]?.toLowerCase()
    if (!role) {
      return { type: 'register_ollama' }
    }
    if (!OLLAMA_ROLE_SET.has(role as (typeof IMMACULATE_OLLAMA_ROLES)[number])) {
      return {
        type: 'error',
        message: `Unknown Immaculate Ollama role "${parts[1]}". Valid roles: ${IMMACULATE_OLLAMA_ROLES.join(', ')}`,
      }
    }
    return {
      type: 'register_ollama',
      role: role as (typeof IMMACULATE_OLLAMA_ROLES)[number],
    }
  }

  if (head === 'run') {
    let remaining = parts.slice(1)
    let layerId: string | undefined
    if (remaining[0] === '--layer') {
      if (!remaining[1]) {
        return {
          type: 'error',
          message: 'Usage: /immaculate run [--layer <layer-id>] [objective]',
        }
      }
      layerId = remaining[1]
      remaining = remaining.slice(2)
    }
    return {
      type: 'run',
      layerId,
      objective: remaining.join(' ').trim() || undefined,
    }
  }

  if (head === 'control' || CONTROL_ACTION_SET.has(head as ImmaculateControlAction)) {
    const action =
      head === 'control'
        ? (parts[1]?.toLowerCase() as ImmaculateControlAction | undefined)
        : (head as ImmaculateControlAction)
    if (!action || !CONTROL_ACTION_SET.has(action)) {
      return {
        type: 'error',
        message: `Usage: /immaculate control <${IMMACULATE_CONTROL_ACTIONS.join('|')}> [target] [value]`,
      }
    }
    const remaining =
      head === 'control' ? parts.slice(2) : parts.slice(1)
    const lastValue = parseValueToken(remaining.at(-1))
    const targetTokens =
      lastValue !== undefined ? remaining.slice(0, -1) : remaining
    const target = targetTokens.join(' ').trim() || undefined
    return {
      type: 'control',
      action,
      target,
      value: lastValue,
    }
  }

  return {
    type: 'error',
    message: `Unknown /immaculate option "${head}".\n\n${buildHelpMessage()}`,
  }
}

export function formatImmaculateStatusMessage(
  status: ImmaculateHarnessStatus,
  deckReceipt: Awaited<ReturnType<typeof getImmaculateHarnessDeckReceipt>> | null,
): string {
  const lines = [
    `Immaculate: ${status.enabled ? 'on' : 'off'} · mode ${status.mode}`,
    `Harness: ${status.harnessUrl}`,
    `Actor: ${status.actor}`,
    `Auth: ${status.apiKeySource ?? (status.loopback ? 'loopback auth' : 'missing')}`,
  ]

  if (!status.enabled) {
    return lines.join('\n')
  }

  lines.push(`Reachability: ${status.reachable ? 'online' : 'offline'}`)
  if (status.service) {
    lines.push(
      `Service: ${status.service}${status.clients !== undefined ? ` · ${status.clients} clients` : ''}`,
    )
  }
  if (status.error) {
    lines.push(`Error: ${status.error}`)
  }
  if (deckReceipt) {
    lines.push(
      `Deck: ${deckReceipt.profile ?? 'live'} · cycle ${deckReceipt.cycle ?? '?'} · ${deckReceipt.nodes ?? '?'} nodes · ${deckReceipt.edges ?? '?'} edges`,
    )
    lines.push(
      `Intelligence: ${deckReceipt.layerCount} layers · ${deckReceipt.executionCount} executions${deckReceipt.recommendedLayerId ? ` · recommended ${deckReceipt.recommendedLayerId}` : ''}`,
    )
  }

  return lines.join('\n')
}

function formatImmaculateResult(result: ImmaculateHarnessResult): string {
  const lines = [`HTTP ${result.status} ${result.route}`, result.summary]
  if (result.governance) {
    lines.push(
      `Governance: ${result.governance.action} · ${result.governance.policyId} · ${result.governance.consentScope} · ${result.governance.actor}`,
    )
  }

  const data = parseJsonRecord(result.json)
  if (result.route === '/api/topology' && data) {
    lines.push(
      `Topology: ${String(data.profile ?? 'unknown')} · cycle ${String(data.cycle ?? '?')} · ${String(data.nodes ?? '?')} nodes · ${String(data.edges ?? '?')} edges`,
    )
    if (Array.isArray(data.planes) && data.planes.length > 0) {
      lines.push(`Planes: ${data.planes.join(', ')}`)
    }
    if (typeof data.objective === 'string') {
      lines.push(`Objective: ${data.objective}`)
    }
    return lines.join('\n')
  }

  if (result.route === '/api/intelligence' && data) {
    const layers = Array.isArray(data.layers) ? data.layers : []
    const executions = Array.isArray(data.executions) ? data.executions : []
    lines.push(`Recommended layer: ${String(data.recommendedLayerId ?? 'none')}`)
    lines.push(`Layers: ${layers.length} · Executions: ${executions.length}`)
    if (layers.length > 0) {
      const layerLines = layers.slice(0, 5).map(layer => {
        const entry =
          typeof layer === 'object' && layer !== null
            ? (layer as Record<string, unknown>)
            : null
        return `- ${String(entry?.id ?? 'unknown')} · ${String(entry?.model ?? 'unknown')} · ${String(entry?.status ?? 'unknown')}`
      })
      lines.push(...layerLines)
    }
    return lines.join('\n')
  }

  if (result.route === '/api/intelligence/executions' && data) {
    const executions = Array.isArray(data.executions) ? data.executions : []
    lines.push(`Recommended layer: ${String(data.recommendedLayerId ?? 'none')}`)
    lines.push(`Executions: ${executions.length}`)
    if (executions.length > 0) {
      const executionLines = executions.slice(0, 5).map(execution => {
        const entry =
          typeof execution === 'object' && execution !== null
            ? (execution as Record<string, unknown>)
            : null
        return `- ${String(entry?.id ?? 'unknown')} · ${String(entry?.status ?? 'unknown')} · ${String(entry?.objective ?? 'no objective')}`
      })
      lines.push(...executionLines)
    }
    return lines.join('\n')
  }

  if (result.route === '/api/intelligence/workers' && data) {
    const workers = Array.isArray(data.workers) ? data.workers : []
    lines.push(`Recommended layer: ${String(data.recommendedLayerId ?? 'none')}`)
    lines.push(
      `Workers: ${workers.length} · ${String(data.healthyWorkerCount ?? '?')} healthy · ${String(data.staleWorkerCount ?? 0)} stale · ${String(data.faultedWorkerCount ?? 0)} faulted · ${String(data.eligibleWorkerCount ?? '?')} eligible`,
    )
    if (workers.length > 0) {
      const workerLines = workers.slice(0, 10).map(worker => {
        const entry =
          typeof worker === 'object' && worker !== null
            ? (worker as Record<string, unknown>)
            : null
        return `- ${String(entry?.workerLabel ?? entry?.workerId ?? 'unknown')} · ${String(entry?.executionProfile ?? 'unknown')} · ${String(entry?.healthStatus ?? 'health unknown')} · ${String(entry?.hostLabel ?? 'host pending')}`
      })
      lines.push(...workerLines)
    }
    return lines.join('\n')
  }

  if (result.route === '/api/intelligence/ollama/models' && data) {
    const models = Array.isArray(data.models) ? data.models : []
    lines.push(`Models: ${models.length}`)
    if (models.length > 0) {
      const modelLines = models.slice(0, 10).map(model => {
        if (typeof model === 'string') {
          return `- ${model}`
        }
        const entry =
          typeof model === 'object' && model !== null
            ? (model as Record<string, unknown>)
            : null
        return `- ${String(entry?.model ?? entry?.name ?? 'unknown')}`
      })
      lines.push(...modelLines)
    }
    return lines.join('\n')
  }

  if (result.route === '/api/health' && data) {
    lines.push(
      `Recovery: ${String(data.recovered ?? '?')} · mode ${String(data.recoveryMode ?? '?')}`,
    )
    lines.push(
      `Integrity: ${String(data.integrityStatus ?? '?')} · findings ${String(data.integrityFindingCount ?? '?')}`,
    )
    lines.push(
      `Governance: ${String(data.governanceMode ?? '?')} · denied ${String(data.governanceDeniedCount ?? '?')}`,
    )
    return lines.join('\n')
  }

  if (result.route === '/api/control' && data) {
    const snapshot =
      typeof data.snapshot === 'object' && data.snapshot !== null
        ? (data.snapshot as Record<string, unknown>)
        : null
    if (snapshot) {
      lines.push(
        `Snapshot: cycle ${String(snapshot.cycle ?? '?')} · ${String(snapshot.status ?? 'unknown')} · ${String(snapshot.profile ?? 'unknown')}`,
      )
      lines.push(
        `Focus: ${String(snapshot.highlightedNodeId ?? 'none')} · throughput ${String(typeof snapshot.metrics === 'object' && snapshot.metrics !== null && 'throughput' in snapshot.metrics ? (snapshot.metrics as Record<string, unknown>).throughput : '?')}`,
      )
      if (typeof snapshot.objective === 'string') {
        lines.push(`Objective: ${snapshot.objective}`)
      }
      return lines.join('\n')
    }
  }

  if (result.route === '/api/intelligence/run' && data) {
    const execution =
      typeof data.execution === 'object' && data.execution !== null
        ? (data.execution as Record<string, unknown>)
        : null
    const layer =
      typeof data.layer === 'object' && data.layer !== null
        ? (data.layer as Record<string, unknown>)
        : null
    if (layer) {
      lines.push(
        `Layer: ${String(layer.id ?? 'unknown')} · ${String(layer.model ?? 'unknown')} · ${String(layer.status ?? 'unknown')}`,
      )
    }
    if (execution) {
      lines.push(
        `Execution: ${String(execution.id ?? 'unknown')} · ${String(execution.status ?? 'unknown')} · ${String(execution.objective ?? 'no objective')}`,
      )
      lines.push(`Latency: ${String(execution.latencyMs ?? '?')} ms`)
    }
    return lines.join('\n')
  }

  lines.push(result.json)
  return lines.join('\n')
}

export const call: LocalCommandCall = async (rawArgs, _context) => {
  const parsed = parseImmaculateCommand(rawArgs)

  if (parsed.type === 'help') {
    return { type: 'text', value: buildHelpMessage() }
  }
  if (parsed.type === 'error') {
    return { type: 'text', value: parsed.message }
  }
  if (parsed.type === 'status') {
    const [status, deckReceipt] = await Promise.all([
      getImmaculateHarnessStatus(),
      getImmaculateHarnessDeckReceipt(),
    ])
    return {
      type: 'text',
      value: formatImmaculateStatusMessage(status, deckReceipt),
    }
  }
  if (parsed.type === 'register_ollama') {
    const result = await callImmaculateHarness({
      action: 'register_ollama',
      register: {
        role: parsed.role,
      },
    })
    return { type: 'text', value: formatImmaculateResult(result) }
  }
  if (parsed.type === 'run') {
    const result = await callImmaculateHarness({
      action: 'run',
      run: {
        layerId: parsed.layerId,
        objective: parsed.objective,
      },
    })
    return { type: 'text', value: formatImmaculateResult(result) }
  }
  if (parsed.type === 'control') {
    const result = await callImmaculateHarness({
      action: 'control',
      control: {
        action: parsed.action,
        target: parsed.target,
        value: parsed.value,
      },
    })
    return { type: 'text', value: formatImmaculateResult(result) }
  }

  const result = await callImmaculateHarness({
    action: parsed.type,
  })
  return { type: 'text', value: formatImmaculateResult(result) }
}
