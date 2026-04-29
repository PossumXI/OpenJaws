import type {
  ImmaculateArtifactFormat,
  ImmaculateHarnessResult,
  ImmaculateSearchFreshness,
} from './immaculateHarness.js'

export const DISCORD_GOVERNED_FETCH_MAX_BYTES = 48 * 1024
export const DISCORD_GOVERNED_FETCH_URL_LIMIT = 3
export const DISCORD_GOVERNED_SEARCH_MAX_RESULTS = 5

export type DiscordGovernedHarnessCallInput = {
  action: 'tool_capabilities' | 'tool_fetch' | 'tool_search' | 'artifact_package'
  actor?: string
  purpose?: string[]
  policyId?: string
  consentScope?: string
  toolFetch?: {
    url: string
    maxBytes?: number
  }
  toolSearch?: {
    query: string
    maxResults?: number
    freshness?: ImmaculateSearchFreshness
    domains?: string[]
  }
  artifact?: {
    name?: string
    format: ImmaculateArtifactFormat
    content: string
    sourceReceiptPath?: string
    metadata?: Record<string, unknown>
  }
}

export type DiscordGovernedHarnessCall = (
  input: DiscordGovernedHarnessCallInput,
  options?: {
    timeoutMs?: number
    signal?: AbortSignal
  },
) => Promise<ImmaculateHarnessResult>

export type DiscordGovernedWebContextResult = {
  attempted: boolean
  liveEvidence: boolean
  context: string | null
  receiptIds: string[]
  artifactReceiptId: string | null
  unavailableReason: string | null
}

type SearchCapabilityState = {
  status: 'available' | 'not-configured' | 'unknown'
  reason: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function parseHarnessJson(result: ImmaculateHarnessResult): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(result.json))
  } catch {
    return null
  }
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanField(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key]
  return typeof value === 'boolean' ? value : null
}

function clampText(value: string | null | undefined, maxChars: number): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`
}

function sanitizeExtractedUrl(rawUrl: string): string | null {
  let value = rawUrl.trim().replace(/^<+/, '').replace(/>+$/, '')
  while (/[),.;!?\]}]+$/.test(value)) {
    value = value.slice(0, -1)
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

export function extractDiscordGovernedFetchUrls(
  text: string | null | undefined,
  limit = DISCORD_GOVERNED_FETCH_URL_LIMIT,
): string[] {
  const source = text ?? ''
  const urls: string[] = []
  const seen = new Set<string>()
  for (const match of source.matchAll(/\bhttps?:\/\/[^\s<>"']+/gi)) {
    const url = sanitizeExtractedUrl(match[0])
    if (!url || seen.has(url)) {
      continue
    }
    seen.add(url)
    urls.push(url)
    if (urls.length >= limit) {
      break
    }
  }
  return urls
}

function resolveSearchCapability(
  capabilitiesResult: ImmaculateHarnessResult | null,
): SearchCapabilityState {
  if (!capabilitiesResult || capabilitiesResult.status >= 400) {
    return {
      status: 'unknown',
      reason: capabilitiesResult?.summary ?? 'Unable to read governed tool capabilities.',
    }
  }
  const data = parseHarnessJson(capabilitiesResult)
  const capabilities = asRecord(data?.capabilities)
  const internet = asRecord(capabilities?.internet)
  const search = asRecord(internet?.search)
  const status = stringField(search, 'status')
  if (status === 'available' || status === 'not-configured') {
    return {
      status,
      reason: stringField(search, 'reason'),
    }
  }
  return {
    status: 'unknown',
    reason: 'Governed search capability did not report a usable status.',
  }
}

function formatFetchReceipt(result: ImmaculateHarnessResult): {
  lines: string[]
  receiptId: string | null
  liveEvidence: boolean
} {
  const data = parseHarnessJson(result)
  const receipt = asRecord(data?.receipt)
  const receiptId = stringField(receipt, 'id')
  const url = stringField(receipt, 'url')
  const status = numberField(receipt, 'status')
  const statusText = stringField(receipt, 'statusText')
  const byteLength = numberField(receipt, 'byteLength')
  const truncated = booleanField(receipt, 'truncated')
  const bodyPreview = clampText(stringField(receipt, 'bodyPreview'), 2200)
  const receiptHash = stringField(receipt, 'receiptHash')
  const lines = [
    `Fetch receipt: ${receiptId ?? 'unknown'} - HTTP ${status ?? '?'}${statusText ? ` ${statusText}` : ''}`,
    `URL: ${url ?? 'unknown'}`,
    `Bytes: ${byteLength ?? '?'}${truncated ? ' - truncated' : ''}`,
    receiptHash ? `Receipt hash: ${receiptHash}` : null,
    bodyPreview ? `Preview: ${bodyPreview}` : 'Preview: No body preview was returned.',
  ].filter((line): line is string => Boolean(line))
  return {
    lines,
    receiptId,
    liveEvidence: Boolean(receiptId),
  }
}

function formatSearchReceipt(result: ImmaculateHarnessResult): {
  lines: string[]
  receiptId: string | null
  liveEvidence: boolean
} {
  const data = parseHarnessJson(result)
  const receipt = asRecord(data?.receipt)
  const receiptId = stringField(receipt, 'id')
  const query = stringField(receipt, 'query')
  const provider = stringField(receipt, 'provider')
  const searchedAt = stringField(receipt, 'searchedAt')
  const resultCount = numberField(receipt, 'resultCount')
  const receiptHash = stringField(receipt, 'receiptHash')
  const resultRecords = Array.isArray(receipt?.results)
    ? receipt.results.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : []
  const resultLines = resultRecords.slice(0, DISCORD_GOVERNED_SEARCH_MAX_RESULTS).flatMap(
    (item, index) => {
      const title = stringField(item, 'title') ?? 'Untitled result'
      const url = stringField(item, 'url') ?? 'unknown'
      const snippet = clampText(stringField(item, 'snippet'), 320)
      const publishedAt = stringField(item, 'publishedAt')
      return [
        `${index + 1}. ${title}`,
        `URL: ${url}`,
        publishedAt ? `Published: ${publishedAt}` : null,
        snippet ? `Snippet: ${snippet}` : null,
      ].filter((line): line is string => Boolean(line))
    },
  )
  const lines = [
    `Search receipt: ${receiptId ?? 'unknown'} - ${resultCount ?? resultRecords.length} results${provider ? ` - ${provider}` : ''}`,
    query ? `Query: ${query}` : null,
    searchedAt ? `Searched at: ${searchedAt}` : null,
    receiptHash ? `Receipt hash: ${receiptHash}` : null,
    ...resultLines,
  ].filter((line): line is string => Boolean(line))
  return {
    lines,
    receiptId,
    liveEvidence: Boolean(receiptId),
  }
}

function formatHarnessFailure(prefix: string, result: ImmaculateHarnessResult): string {
  const data = parseHarnessJson(result)
  const message = stringField(data, 'message') ?? stringField(data, 'error')
  return `${prefix}: ${message ?? result.summary} (HTTP ${result.status}).`
}

async function packageDiscordWebContext(args: {
  callHarness: DiscordGovernedHarnessCall
  actor: string
  content: string
  query: string | null
  urls: string[]
}): Promise<string | null> {
  const timestamp = new Date().toISOString()
  const name = `discord-q-web-context-${timestamp.replace(/[:.]/g, '-')}.md`
  const result = await args.callHarness(
    {
      action: 'artifact_package',
      actor: args.actor,
      artifact: {
        name,
        format: 'markdown',
        content: args.content,
        metadata: {
          source: 'discord-q-agent',
          query: args.query,
          urls: args.urls,
          createdAt: timestamp,
        },
      },
    },
    {
      timeoutMs: 20_000,
    },
  )
  if (result.status >= 400) {
    return null
  }
  const receipt = asRecord(parseHarnessJson(result)?.receipt)
  return stringField(receipt, 'id')
}

export async function buildDiscordGovernedWebContext(args: {
  prompt: string | null | undefined
  query: string | null
  shouldSearch: boolean
  callHarness: DiscordGovernedHarnessCall
  actor?: string
  freshness?: ImmaculateSearchFreshness
}): Promise<DiscordGovernedWebContextResult> {
  const prompt = args.prompt ?? ''
  const urls = extractDiscordGovernedFetchUrls(prompt)
  const shouldSearch = Boolean(args.shouldSearch && args.query?.trim())
  const attempted = shouldSearch || urls.length > 0
  const receiptIds: string[] = []
  const contextLines: string[] = []
  let liveEvidence = false
  let unavailableReason: string | null = null

  if (!attempted) {
    return {
      attempted: false,
      liveEvidence: false,
      context: null,
      receiptIds,
      artifactReceiptId: null,
      unavailableReason,
    }
  }

  let capabilitiesResult: ImmaculateHarnessResult | null = null
  try {
    capabilitiesResult = await args.callHarness(
      {
        action: 'tool_capabilities',
        actor: args.actor ?? 'discord-q-agent',
      },
      {
        timeoutMs: 10_000,
      },
    )
  } catch (error) {
    unavailableReason =
      error instanceof Error ? error.message : 'Unable to read governed tool capabilities.'
    contextLines.push(`Governed tool capabilities unavailable: ${unavailableReason}`)
  }

  const actor = args.actor ?? 'discord-q-agent'
  contextLines.push('Governed Immaculate web/tool context for this Discord request:')

  for (const url of urls) {
    try {
      const result = await args.callHarness(
        {
          action: 'tool_fetch',
          actor,
          toolFetch: {
            url,
            maxBytes: DISCORD_GOVERNED_FETCH_MAX_BYTES,
          },
        },
        {
          timeoutMs: 20_000,
        },
      )
      if (result.status >= 400) {
        contextLines.push(formatHarnessFailure(`Governed fetch failed for ${url}`, result))
        continue
      }
      const formatted = formatFetchReceipt(result)
      contextLines.push(...formatted.lines)
      if (formatted.receiptId) {
        receiptIds.push(formatted.receiptId)
      }
      liveEvidence ||= formatted.liveEvidence
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to complete governed fetch.'
      contextLines.push(`Governed fetch failed for ${url}: ${message}`)
    }
  }

  if (shouldSearch) {
    const searchCapability = resolveSearchCapability(capabilitiesResult)
    if (searchCapability.status === 'not-configured') {
      unavailableReason =
        searchCapability.reason ??
        'Search is not configured. Set IMMACULATE_SEARCH_PROVIDER=brave or tavily plus the matching API key.'
      contextLines.push(
        `Governed search is not configured: ${unavailableReason}`,
        'Do not claim live search was performed. Answer only from attached fetch receipts or explicitly say current web search needs configuration.',
      )
    } else {
      try {
        const result = await args.callHarness(
          {
            action: 'tool_search',
            actor,
            toolSearch: {
              query: args.query!.trim(),
              maxResults: DISCORD_GOVERNED_SEARCH_MAX_RESULTS,
              freshness: args.freshness ?? 'month',
            },
          },
          {
            timeoutMs: 25_000,
          },
        )
        if (result.status >= 400) {
          contextLines.push(formatHarnessFailure('Governed search failed', result))
        } else {
          const formatted = formatSearchReceipt(result)
          contextLines.push(...formatted.lines)
          if (formatted.receiptId) {
            receiptIds.push(formatted.receiptId)
          }
          liveEvidence ||= formatted.liveEvidence
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to complete governed search.'
        contextLines.push(`Governed search failed: ${message}`)
      }
    }
  }

  let artifactReceiptId: string | null = null
  const context = contextLines.join('\n')
  if (liveEvidence) {
    try {
      artifactReceiptId = await packageDiscordWebContext({
        callHarness: args.callHarness,
        actor,
        content: context,
        query: shouldSearch ? args.query?.trim() ?? null : null,
        urls,
      })
    } catch {
      artifactReceiptId = null
    }
  }

  const artifactLine = artifactReceiptId
    ? `Artifact receipt: ${artifactReceiptId} - markdown package of this governed web context.`
    : null

  return {
    attempted,
    liveEvidence,
    context: artifactLine ? `${context}\n${artifactLine}` : context,
    receiptIds,
    artifactReceiptId,
    unavailableReason,
  }
}
