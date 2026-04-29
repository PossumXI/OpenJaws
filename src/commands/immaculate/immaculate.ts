import type { LocalCommandCall } from '../../types/command.js'
import {
  callImmaculateHarness,
  IMMACULATE_ARTIFACT_FORMATS,
  getImmaculateHarnessDeckReceipt,
  getImmaculateHarnessStatus,
  IMMACULATE_CONTROL_ACTIONS,
  IMMACULATE_OLLAMA_ROLES,
  IMMACULATE_SEARCH_FRESHNESS,
  IMMACULATE_TOOL_RECEIPT_KINDS,
  type ImmaculateControlAction,
  type ImmaculateArtifactFormat,
  type ImmaculateHarnessResult,
  type ImmaculateHarnessStatus,
  type ImmaculateSearchFreshness,
  type ImmaculateToolReceiptKind,
} from '../../utils/immaculateHarness.js'
import {
  readLatestImmaculateTraceSummary,
  type ImmaculateTraceSummary,
} from '../../immaculate/traceSummary.js'

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
        | 'tool_capabilities'
    }
  | {
      type: 'tool_receipts'
      kind?: ImmaculateToolReceiptKind
      limit?: number
    }
  | {
      type: 'tool_receipt'
      kind: ImmaculateToolReceiptKind
      receiptId: string
    }
  | {
      type: 'tool_fetch'
      url: string
      maxBytes?: number
    }
  | {
      type: 'tool_search'
      query: string
      maxResults?: number
      freshness?: ImmaculateSearchFreshness
      domains?: string[]
    }
  | {
      type: 'artifact_package'
      format: ImmaculateArtifactFormat
      name?: string
      content: string
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
const TOOL_RECEIPT_KIND_SET = new Set(IMMACULATE_TOOL_RECEIPT_KINDS)
const SEARCH_FRESHNESS_SET = new Set(IMMACULATE_SEARCH_FRESHNESS)
const ARTIFACT_FORMAT_SET = new Set(IMMACULATE_ARTIFACT_FORMATS)

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
    'Usage: /immaculate [status|health|topology|intelligence|executions|workers|models|tools|fetch|search|artifact|receipts|register|run|control] ...',
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
    '- /immaculate tools',
    '- /immaculate fetch <url> [max-bytes]',
    '- /immaculate search [--max <n>] [--freshness <day|week|month|year>] [--domain <domain>] <query>',
    '- /immaculate artifact <markdown|text|json|html|docx|pdf> <name> -- <content>',
    '- /immaculate receipts [fetch|search] [limit]',
    '- /immaculate receipt <fetch|search> <receipt-id>',
    '- /immaculate register [soul|mid|reasoner|guard]',
    '- /immaculate run [--layer <layer-id>] [objective]',
    '- /immaculate control <pause|resume|boost|reroute|pulse|reset|step> [target] [value]',
    '- /immaculate pause',
    '- /immaculate pulse',
    '',
    'Notes:',
    '- Governed actions use explicit Immaculate actor/purpose/policy/consent headers by default.',
    '- /immaculate models reads Ollama models from the harness-side intelligence layer.',
    '- /immaculate fetch/search/package leave harness receipts instead of leaking raw secrets to shell history.',
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

  if (head === 'tools' || head === 'tool-capabilities') {
    return { type: 'tool_capabilities' }
  }

  if (head === 'fetch') {
    const url = parts[1]
    if (!url) {
      return {
        type: 'error',
        message: 'Usage: /immaculate fetch <url> [max-bytes]',
      }
    }
    return {
      type: 'tool_fetch',
      url,
      maxBytes: parseValueToken(parts[2]),
    }
  }

  if (head === 'search') {
    const queryTokens: string[] = []
    const domains: string[] = []
    let maxResults: number | undefined
    let freshness: ImmaculateSearchFreshness | undefined

    for (let index = 1; index < parts.length; index += 1) {
      const token = parts[index]
      if (token === '--max') {
        maxResults = parseValueToken(parts[index + 1])
        index += 1
        continue
      }
      if (token === '--freshness') {
        const candidate = parts[index + 1]?.toLowerCase()
        if (
          candidate &&
          SEARCH_FRESHNESS_SET.has(candidate as ImmaculateSearchFreshness)
        ) {
          freshness = candidate as ImmaculateSearchFreshness
          index += 1
          continue
        }
        return {
          type: 'error',
          message:
            'Usage: /immaculate search [--max <n>] [--freshness <day|week|month|year>] [--domain <domain>] <query>',
        }
      }
      if (token === '--domain') {
        const domain = parts[index + 1]?.trim()
        if (domain) {
          domains.push(domain)
          index += 1
          continue
        }
        return {
          type: 'error',
          message:
            'Usage: /immaculate search [--max <n>] [--freshness <day|week|month|year>] [--domain <domain>] <query>',
        }
      }
      queryTokens.push(token)
    }

    const query = queryTokens.join(' ').trim()
    if (!query) {
      return {
        type: 'error',
        message:
          'Usage: /immaculate search [--max <n>] [--freshness <day|week|month|year>] [--domain <domain>] <query>',
      }
    }
    return {
      type: 'tool_search',
      query,
      maxResults,
      freshness,
      domains: domains.length > 0 ? domains : undefined,
    }
  }

  if (head === 'receipts') {
    const kind = parts[1]?.toLowerCase()
    const limitToken =
      kind && TOOL_RECEIPT_KIND_SET.has(kind as ImmaculateToolReceiptKind)
        ? parts[2]
        : parts[1]
    return {
      type: 'tool_receipts',
      kind:
        kind && TOOL_RECEIPT_KIND_SET.has(kind as ImmaculateToolReceiptKind)
          ? (kind as ImmaculateToolReceiptKind)
          : undefined,
      limit: parseValueToken(limitToken),
    }
  }

  if (head === 'receipt') {
    const kind = parts[1]?.toLowerCase()
    const receiptId = parts[2]
    if (
      !kind ||
      !TOOL_RECEIPT_KIND_SET.has(kind as ImmaculateToolReceiptKind) ||
      !receiptId
    ) {
      return {
        type: 'error',
        message: 'Usage: /immaculate receipt <fetch|search> <receipt-id>',
      }
    }
    return {
      type: 'tool_receipt',
      kind: kind as ImmaculateToolReceiptKind,
      receiptId,
    }
  }

  if (head === 'artifact') {
    const format = parts[1]?.toLowerCase()
    if (!format || !ARTIFACT_FORMAT_SET.has(format as ImmaculateArtifactFormat)) {
      return {
        type: 'error',
        message:
          'Usage: /immaculate artifact <markdown|text|json|html|docx|pdf> <name> -- <content>',
      }
    }
    const separatorIndex = parts.indexOf('--')
    const nameTokens =
      separatorIndex === -1 ? parts.slice(2, 3) : parts.slice(2, separatorIndex)
    const contentTokens =
      separatorIndex === -1 ? parts.slice(3) : parts.slice(separatorIndex + 1)
    const content = contentTokens.join(' ').trim()
    if (!content) {
      return {
        type: 'error',
        message:
          'Usage: /immaculate artifact <markdown|text|json|html|docx|pdf> <name> -- <content>',
      }
    }
    return {
      type: 'artifact_package',
      format: format as ImmaculateArtifactFormat,
      name: nameTokens.join('-').trim() || undefined,
      content,
    }
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
  traceSummary: ImmaculateTraceSummary | null = null,
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
  if (traceSummary) {
    const formatTraceLatency = (value: number | null) =>
      value === null ? 'n/a' : `${Math.round(value)}ms`
    lines.push(
      `Trace: ${traceSummary.sessionId} · ${traceSummary.eventCount} events · ${traceSummary.routeDispatchCount} dispatched · ${traceSummary.workerAssignmentCount} assigned`,
    )
    lines.push(
      `Latency: interaction p95 ${formatTraceLatency(traceSummary.interactionLatency.p95Ms)} · reflex p95 ${formatTraceLatency(traceSummary.reflexLatency.p95Ms)} · cognitive p95 ${formatTraceLatency(traceSummary.cognitiveLatency.p95Ms)}`,
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

  if (result.route === '/api/tools/capabilities' && data) {
    const capabilities =
      typeof data.capabilities === 'object' && data.capabilities !== null
        ? (data.capabilities as Record<string, unknown>)
        : null
    const internet =
      typeof capabilities?.internet === 'object' && capabilities.internet !== null
        ? (capabilities.internet as Record<string, unknown>)
        : null
    const search =
      typeof internet?.search === 'object' && internet.search !== null
        ? (internet.search as Record<string, unknown>)
        : null
    const artifacts =
      typeof capabilities?.artifacts === 'object' &&
      capabilities.artifacts !== null
        ? (capabilities.artifacts as Record<string, unknown>)
        : null
    lines.push(`Search: ${String(search?.status ?? 'unknown')}`)
    if (typeof search?.reason === 'string') {
      lines.push(`Search detail: ${search.reason}`)
    }
    lines.push(`Artifacts: ${String(artifacts?.status ?? 'unknown')}`)
    return lines.join('\n')
  }

  if (result.route.startsWith('/api/tools/receipts') && data) {
    const list =
      typeof data.receipts === 'object' && data.receipts !== null
        ? (data.receipts as Record<string, unknown>)
        : null
    const entries = Array.isArray(list?.receipts) ? list.receipts : []
    lines.push(`Receipts: ${String(list?.count ?? entries.length)}`)
    for (const entry of entries.slice(0, 8)) {
      const receipt =
        typeof entry === 'object' && entry !== null
          ? (entry as Record<string, unknown>)
          : null
      lines.push(
        `- ${String(receipt?.kind ?? '?')} · ${String(receipt?.id ?? '?')} · ${String(receipt?.recordedAt ?? '?')}`,
      )
    }
    return lines.join('\n')
  }

  if (result.route === '/api/tools/fetch' && data) {
    const receipt =
      typeof data.receipt === 'object' && data.receipt !== null
        ? (data.receipt as Record<string, unknown>)
        : null
    lines.push(`Receipt: ${String(receipt?.id ?? 'unknown')}`)
    lines.push(
      `Fetched: HTTP ${String(receipt?.status ?? '?')} · ${String(receipt?.byteLength ?? '?')} bytes · truncated ${String(receipt?.truncated ?? '?')}`,
    )
    if (typeof receipt?.bodyPreview === 'string') {
      lines.push(`Preview: ${receipt.bodyPreview}`)
    }
    return lines.join('\n')
  }

  if (result.route === '/api/tools/search' && data) {
    const receipt =
      typeof data.receipt === 'object' && data.receipt !== null
        ? (data.receipt as Record<string, unknown>)
        : null
    const results = Array.isArray(receipt?.results) ? receipt.results : []
    lines.push(`Receipt: ${String(receipt?.id ?? 'unknown')}`)
    lines.push(
      `Provider: ${String(receipt?.provider ?? '?')} · Results: ${String(receipt?.resultCount ?? results.length)}`,
    )
    for (const resultEntry of results.slice(0, 5)) {
      const entry =
        typeof resultEntry === 'object' && resultEntry !== null
          ? (resultEntry as Record<string, unknown>)
          : null
      lines.push(`- ${String(entry?.title ?? 'untitled')} · ${String(entry?.url ?? '')}`)
    }
    return lines.join('\n')
  }

  if (result.route === '/api/artifacts/package' && data) {
    const receipt =
      typeof data.receipt === 'object' && data.receipt !== null
        ? (data.receipt as Record<string, unknown>)
        : null
    lines.push(`Artifact: ${String(receipt?.name ?? 'unknown')}`)
    lines.push(
      `Format: ${String(receipt?.format ?? '?')} · Bytes: ${String(receipt?.byteLength ?? '?')}`,
    )
    lines.push(`Receipt: ${String(receipt?.id ?? 'unknown')}`)
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
    const [status, deckReceipt, traceSummary] = await Promise.all([
      getImmaculateHarnessStatus(),
      getImmaculateHarnessDeckReceipt(),
      Promise.resolve(readLatestImmaculateTraceSummary()),
    ])
    return {
      type: 'text',
      value: formatImmaculateStatusMessage(status, deckReceipt, traceSummary),
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
  if (parsed.type === 'tool_receipts') {
    const result = await callImmaculateHarness({
      action: 'tool_receipts',
      receipts: {
        kind: parsed.kind,
        limit: parsed.limit,
      },
    })
    return { type: 'text', value: formatImmaculateResult(result) }
  }
  if (parsed.type === 'tool_receipt') {
    const result = await callImmaculateHarness({
      action: 'tool_receipt',
      receipts: {
        kind: parsed.kind,
        receiptId: parsed.receiptId,
      },
    })
    return { type: 'text', value: formatImmaculateResult(result) }
  }
  if (parsed.type === 'tool_fetch') {
    const result = await callImmaculateHarness({
      action: 'tool_fetch',
      toolFetch: {
        url: parsed.url,
        maxBytes: parsed.maxBytes,
      },
    })
    return { type: 'text', value: formatImmaculateResult(result) }
  }
  if (parsed.type === 'tool_search') {
    const result = await callImmaculateHarness({
      action: 'tool_search',
      toolSearch: {
        query: parsed.query,
        maxResults: parsed.maxResults,
        freshness: parsed.freshness,
        domains: parsed.domains,
      },
    })
    return { type: 'text', value: formatImmaculateResult(result) }
  }
  if (parsed.type === 'artifact_package') {
    const result = await callImmaculateHarness({
      action: 'artifact_package',
      artifact: {
        format: parsed.format,
        name: parsed.name,
        content: parsed.content,
        metadata: {
          source: 'openjaws-immaculate-command',
        },
      },
    })
    return { type: 'text', value: formatImmaculateResult(result) }
  }

  const result = await callImmaculateHarness({
    action: parsed.type,
  })
  return { type: 'text', value: formatImmaculateResult(result) }
}
