import type {
  PublicShowcaseActivityEntry,
  PublicShowcaseActivityFeed,
} from './publicShowcaseActivity.js'

export type AuraGenesisTelemetryStatus = {
  generatedAt?: string | null
  network?: {
    available?: boolean
    info?: {
      height?: number
      peerCount?: number
      version?: string | null
      consensusType?: string | null
      poiSolved?: number
      mempoolSize?: number
    } | null
  } | null
  ledger?: {
    available?: boolean
    verification?: {
      totalEntries?: number
      chainValid?: boolean
      lastBlock?: number
    } | null
  } | null
  fabric?: {
    available?: boolean
    status?: string | null
    latestLaneReady?: boolean
    showcase?: {
      mode?: string | null
      title?: string | null
      summary?: string | null
      fleetLabel?: string | null
      subsystemCount?: number
      onlineSubsystemCount?: number
      simulatedSubsystemCount?: number
      degradedSubsystemCount?: number
      publicHeight?: number
      verifiedLedgerEntries?: number
      orchestrationProfile?: string | null
      qAuthMode?: string | null
      operatorUpdatedAt?: string | null
      resultsReady?: boolean
    } | null
  } | null
  publicLane?: {
    height?: number
    version?: string | null
  } | null
  privateLane?: {
    totalEntries?: number
    chainValid?: boolean
  } | null
  orchestration?: {
    profile?: string | null
    objective?: string | null
    workerCount?: number
    healthyWorkerCount?: number
  } | null
  brain?: {
    ready?: boolean
    summary?: string | null
    authMode?: string | null
  } | null
}

export type DiscordPublicLedgerMirrorState = {
  version: 1
  updatedAt: string
  lastStatusFingerprint: string | null
  lastStatusAt: string | null
  postedActivityIds: string[]
  lastProductUpdateFingerprint: string | null
  lastProductUpdateAt: string | null
}

function sanitizeInlineText(
  value: string | null | undefined,
  maxLength = 320,
): string | null {
  if (!value) {
    return null
  }
  const normalized = value
    .replace(
      /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}\b/g,
      '[redacted-discord-token]',
    )
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|SESSION)[A-Z0-9_]*)\s*[:=]\s*["']?[^"',\s]{6,}/gi,
      '$1=[redacted]',
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) {
    return null
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(value => sanitizeInlineText(value, 72))
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

export function createDiscordPublicLedgerMirrorState(
  now = new Date(),
): DiscordPublicLedgerMirrorState {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    lastStatusFingerprint: null,
    lastStatusAt: null,
    postedActivityIds: [],
    lastProductUpdateFingerprint: null,
    lastProductUpdateAt: null,
  }
}

export function normalizeDiscordPublicLedgerMirrorState(
  value: unknown,
  now = new Date(),
): DiscordPublicLedgerMirrorState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDiscordPublicLedgerMirrorState(now)
  }
  const record = value as Partial<DiscordPublicLedgerMirrorState>
  const base = createDiscordPublicLedgerMirrorState(now)
  return {
    version: 1,
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : base.updatedAt,
    lastStatusFingerprint:
      typeof record.lastStatusFingerprint === 'string'
        ? record.lastStatusFingerprint
        : null,
    lastStatusAt:
      typeof record.lastStatusAt === 'string' ? record.lastStatusAt : null,
    postedActivityIds: Array.isArray(record.postedActivityIds)
      ? uniqueStrings(
          record.postedActivityIds.map(entry =>
            typeof entry === 'string' ? entry : null,
          ),
        )
      : [],
    lastProductUpdateFingerprint:
      typeof record.lastProductUpdateFingerprint === 'string'
        ? record.lastProductUpdateFingerprint
        : null,
    lastProductUpdateAt:
      typeof record.lastProductUpdateAt === 'string'
        ? record.lastProductUpdateAt
        : null,
  }
}

export function buildAuraGenesisStatusFingerprint(
  status: AuraGenesisTelemetryStatus,
): string {
  const fingerprintPayload = {
    networkHeight: status.network?.info?.height ?? status.publicLane?.height ?? null,
    peerCount: status.network?.info?.peerCount ?? null,
    version: status.network?.info?.version ?? status.publicLane?.version ?? null,
    ledgerEntries:
      status.ledger?.verification?.totalEntries ?? status.privateLane?.totalEntries ?? null,
    chainValid:
      status.ledger?.verification?.chainValid ?? status.privateLane?.chainValid ?? null,
    fabricStatus: status.fabric?.status ?? null,
    latestLaneReady: status.fabric?.latestLaneReady ?? null,
    fleetLabel: status.fabric?.showcase?.fleetLabel ?? null,
    subsystemCount: status.fabric?.showcase?.subsystemCount ?? null,
    onlineSubsystemCount: status.fabric?.showcase?.onlineSubsystemCount ?? null,
    simulatedSubsystemCount: status.fabric?.showcase?.simulatedSubsystemCount ?? null,
    verifiedLedgerEntries: status.fabric?.showcase?.verifiedLedgerEntries ?? null,
    publicHeight: status.fabric?.showcase?.publicHeight ?? null,
    orchestrationProfile:
      status.fabric?.showcase?.orchestrationProfile ??
      status.orchestration?.profile ??
      null,
    qReady: status.brain?.ready ?? null,
    qAuthMode:
      status.fabric?.showcase?.qAuthMode ?? status.brain?.authMode ?? null,
    operatorUpdatedAt: status.fabric?.showcase?.operatorUpdatedAt ?? null,
    resultsReady: status.fabric?.showcase?.resultsReady ?? null,
  }
  return JSON.stringify(fingerprintPayload)
}

export function buildAuraGenesisStatusMessage(
  status: AuraGenesisTelemetryStatus,
): string {
  const lines = ['Arobi public ledger status']
  const networkVersion =
    status.network?.info?.version ??
    status.publicLane?.version ??
    status.fabric?.showcase?.mode ??
    null
  const networkHeight =
    status.network?.info?.height ??
    status.publicLane?.height ??
    status.fabric?.showcase?.publicHeight ??
    null
  const peerCount = status.network?.info?.peerCount ?? null
  if (networkVersion || networkHeight !== null || peerCount !== null) {
    lines.push(
      [
        networkVersion ? `Network ${networkVersion}` : null,
        networkHeight !== null ? `height ${networkHeight.toLocaleString()}` : null,
        peerCount !== null ? `${peerCount.toLocaleString()} peers` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
  }
  const ledgerEntries =
    status.ledger?.verification?.totalEntries ?? status.privateLane?.totalEntries ?? null
  const chainValid =
    status.ledger?.verification?.chainValid ?? status.privateLane?.chainValid ?? null
  if (ledgerEntries !== null || chainValid !== null) {
    lines.push(
      [
        ledgerEntries !== null
          ? `${ledgerEntries.toLocaleString()} ledger entries`
          : null,
        chainValid !== null ? (chainValid ? 'chain valid' : 'chain degraded') : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
  }
  const fleetLabel = sanitizeInlineText(status.fabric?.showcase?.fleetLabel, 80)
  const subsystemCount = status.fabric?.showcase?.subsystemCount ?? null
  const onlineSubsystemCount = status.fabric?.showcase?.onlineSubsystemCount ?? null
  const simulatedSubsystemCount =
    status.fabric?.showcase?.simulatedSubsystemCount ?? null
  if (fleetLabel || subsystemCount !== null) {
    lines.push(
      [
        fleetLabel,
        subsystemCount !== null
          ? `${subsystemCount.toLocaleString()} defense subsystems`
          : null,
        onlineSubsystemCount !== null
          ? `${onlineSubsystemCount.toLocaleString()} live`
          : null,
        simulatedSubsystemCount !== null
          ? `${simulatedSubsystemCount.toLocaleString()} simulated`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
  }
  if (subsystemCount !== null) {
    const verifiedLedgerEntries =
      status.fabric?.showcase?.verifiedLedgerEntries ?? null
    const publicHeight = status.fabric?.showcase?.publicHeight ?? null
    const resultsReady = status.fabric?.showcase?.resultsReady ?? null
    lines.push(
      [
        `Public-safe pressure loop: ${subsystemCount.toLocaleString()} subsystem demo`,
        verifiedLedgerEntries !== null
          ? `${verifiedLedgerEntries.toLocaleString()} public ledger proofs`
          : null,
        publicHeight !== null
          ? `public height ${publicHeight.toLocaleString()}`
          : null,
        resultsReady !== null
          ? resultsReady
            ? 'results ready'
            : 'results pending'
          : null,
        'private 00 payloads stay closed',
      ]
        .filter(Boolean)
        .join(' · '),
    )
  }
  const orchestrationProfile =
    sanitizeInlineText(
      status.fabric?.showcase?.orchestrationProfile ??
        status.orchestration?.profile ??
        null,
      96,
    ) ?? 'unreported'
  const qAuthMode = sanitizeInlineText(
    status.fabric?.showcase?.qAuthMode ?? status.brain?.authMode ?? null,
    32,
  )
  lines.push(
    [
      `Immaculate ${orchestrationProfile}`,
      status.brain?.ready ? 'Q ready' : 'Q not ready',
      qAuthMode ? `auth ${qAuthMode}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  )
  const showcaseSummary = sanitizeInlineText(
    status.fabric?.showcase?.summary ??
      status.orchestration?.objective ??
      status.brain?.summary ??
      null,
    320,
  )
  if (showcaseSummary) {
    lines.push(showcaseSummary)
  }
  return lines.join('\n')
}

export function selectUnpostedPublicShowcaseEntries(args: {
  feed: PublicShowcaseActivityFeed | null
  postedIds: string[]
  limit?: number
}): PublicShowcaseActivityEntry[] {
  if (!args.feed) {
    return []
  }
  const posted = new Set(args.postedIds)
  return [...args.feed.entries]
    .filter(entry => !posted.has(entry.id))
    .sort((left, right) => {
      const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0
      const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0
      return leftTime - rightTime
    })
    .slice(0, Math.max(args.limit ?? 3, 0))
}

export function formatPublicShowcaseEntryForDiscord(
  entry: PublicShowcaseActivityEntry,
): string {
  const lines = [entry.title]
  if (entry.status || entry.source) {
    lines.push(
      [entry.status ? `status ${entry.status}` : null, entry.source]
        .filter(Boolean)
        .join(' · '),
    )
  }
  if (entry.summary) {
    lines.push(sanitizeInlineText(entry.summary, 320) ?? entry.summary)
  }
  if (entry.operatorActions.length > 0) {
    lines.push(`Actions: ${entry.operatorActions.slice(0, 4).join(', ')}`)
  }
  if (entry.artifacts.length > 0) {
    lines.push(`Artifacts: ${entry.artifacts.slice(0, 3).join(', ')}`)
  }
  return lines.join('\n')
}

type MarkdownSection = {
  heading: string
  bullets: string[]
}

function parseLatestMarkdownSection(markdown: string): MarkdownSection | null {
  const sections = markdown
    .split(/^## /gm)
    .slice(1)
    .map(section => section.trim())
    .filter(Boolean)
  const first = sections[0]
  if (!first) {
    return null
  }
  const lines = first.split(/\r?\n/).map(line => line.trim())
  const heading = lines[0] ?? null
  if (!heading) {
    return null
  }
  const bullets = lines
    .slice(1)
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean)
  return {
    heading,
    bullets,
  }
}

export function buildOpenJawsProductUpdateDigest(
  changelogMarkdown: string,
): { fingerprint: string | null; content: string | null } {
  const section = parseLatestMarkdownSection(changelogMarkdown)
  if (!section) {
    return {
      fingerprint: null,
      content: null,
    }
  }
  const selectedBullets = section.bullets.slice(0, 4)
  const fingerprint = JSON.stringify({
    heading: section.heading,
    bullets: selectedBullets,
  })
  return {
    fingerprint,
    content: [
      'OpenJaws public product update',
      section.heading,
      ...selectedBullets.map(bullet => `- ${sanitizeInlineText(bullet, 220) ?? bullet}`),
      'Live now: OCI-backed Q, governed Discord operator work, runtime coherence, and the bounded Apex bridge.',
      'Still tightening: approval-safe autonomous branches and steadier roundtable follow-through.',
    ].join('\n'),
  }
}
