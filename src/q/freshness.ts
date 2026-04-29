export const Q_BASE_KNOWLEDGE_CUTOFF = 'June 2024'

export type QRuntimeFreshnessOptions = {
  now?: Date
  voiceLive?: boolean
  webResearchAvailable?: boolean
  localReceiptsAvailable?: boolean
  benchmarkMode?: boolean
}

const CURRENT_FACT_PATTERN =
  /\b(latest|current|today|tonight|tomorrow|yesterday|this week|this month|this year|news|documentation|docs|official docs?|api docs?|release notes?|pricing|price|status page|recent|version|newest|up[- ]to[- ]date|breaking|github|changelog|roadmap|leaderboards?|benchmarks?|202[5-9])\b/i

const FRESH_RELEASE_PATTERN =
  /\b(new|fresh)\s+(?:release|version|docs?|benchmark|leaderboard|status|pricing|api)\b/i

function normalizeFreshnessText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

export function requestNeedsFreshContext(
  text: string | null | undefined,
): boolean {
  const normalized = normalizeFreshnessText(text)
  return (
    normalized.length > 0 &&
    (CURRENT_FACT_PATTERN.test(normalized) ||
      FRESH_RELEASE_PATTERN.test(normalized))
  )
}

function resolveRuntimeClock(now: Date): {
  iso: string
  local: string
  timeZone: string
} {
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'system local timezone'
  const local = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone,
  }).format(now)

  return {
    iso: now.toISOString(),
    local,
    timeZone,
  }
}

export function isQModelId(modelId: string | null | undefined): boolean {
  const normalized = (modelId ?? '').trim().toLowerCase()
  if (!normalized) {
    return false
  }
  return (
    normalized === 'q' ||
    normalized === 'oci:q' ||
    normalized === 'ollama:q' ||
    normalized === 'ollama:q:latest' ||
    /^q(?:[-_:]|$)/.test(normalized) ||
    normalized.includes('oci:q') ||
    normalized.includes('ollama:q')
  )
}

export function buildQRuntimeFreshnessLines(
  options: QRuntimeFreshnessOptions = {},
): string[] {
  const clock = resolveRuntimeClock(options.now ?? new Date())
  const lines = [
    `Current runtime date/time: ${clock.iso} UTC; local runtime clock: ${clock.local} (${clock.timeZone}). Treat this as the current clock for temporal reasoning, and answer date questions from this runtime clock instead of training memory.`,
    `Base Q model knowledge cutoff: ${Q_BASE_KNOWLEDGE_CUTOFF}. Treat current, latest, live, price/status/version/benchmark, and post-June-2024 facts as requiring tool output, local receipts, or governed web research.`,
  ]

  if (options.webResearchAvailable) {
    lines.push(
      'Live web verification is available in this lane only through attached governed web context or explicit approved tool output. Use that evidence for current facts before acting; do not guess, and if the attached evidence is insufficient, say exactly what remains unverified.',
    )
  } else {
    lines.push(
      'No live web research output or browser tool is available inside this model call; rely only on local files, receipts, and command output, and mark current/latest claims as unverified when needed.',
    )
  }

  if (options.localReceiptsAvailable !== false) {
    lines.push(
      'Local receipts, benchmark reports, runtime health checks, and command output can verify local system state, but they do not verify public internet facts unless they include fresh fetched evidence.',
    )
  }

  if (options.benchmarkMode) {
    lines.push(
      'Benchmark lanes must not use network access unless the benchmark explicitly permits it; report freshness limits as part of the receipt instead of guessing.',
    )
  }

  if (options.voiceLive) {
    lines.push(
      'For live voice, keep date and freshness corrections concise, then offer to verify before taking consequential action.',
    )
  }

  return lines
}

export function buildQRuntimeFreshnessBlock(
  options: QRuntimeFreshnessOptions = {},
): string {
  return [
    '# Q Freshness',
    ...buildQRuntimeFreshnessLines(options).map(line => `- ${line}`),
  ].join('\n')
}

export function appendQRuntimeFreshnessBlock(
  systemPrompt: string | null | undefined,
  options: QRuntimeFreshnessOptions = {},
): string {
  const base = systemPrompt?.trim() ?? ''
  if (
    base.includes('Base Q model knowledge cutoff:') ||
    base.includes('base Q model knowledge is current only through June 2024')
  ) {
    return base
  }

  const block = buildQRuntimeFreshnessBlock(options)
  return base ? `${base}\n\n${block}` : block
}
