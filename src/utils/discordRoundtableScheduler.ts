import { existsSync } from 'fs'

import type {
  DiscordExecutionApprovalState,
  DiscordExecutionJobStatus,
} from './discordExecutionQueue.js'

export const DEFAULT_ROUNDTABLE_WINDOW_HOURS = 4
export const DEFAULT_FORCED_ROUNDTABLE_TURNS = 6

export type DiscordRoundtableSchedulerRoot = {
  label: string
  path: string
  aliases: string[]
}

export type DiscordRoundtableMemorySnapshot = {
  summary?: string | null
  currentFocus?: string | null
  lastHumanQuestion?: string | null
  openThreads?: string[] | null
}

export type DiscordRoundtableRecentAction = {
  targetPath?: string | null
  status: DiscordExecutionJobStatus
  approvalState?: DiscordExecutionApprovalState
  completedAt?: string | null
  changedFiles: string[]
  commitSha?: string | null
  verificationSummary?: string | null
}

export type DiscordRoundtableReplyInspection = {
  normalizedReply: string | null
  isPass: boolean
  isIncomplete: boolean
  shouldRetry: boolean
}

export type DiscordRoundtableExecutionScope = {
  targetPath: string
  workKey: string
  projectKey: string
  rootLabel: string | null
}

export function resolveRoundtableDurationHours(args?: {
  rawValue?: string | null
  fallbackHours?: number
}): number {
  const fallback = args?.fallbackHours ?? DEFAULT_ROUNDTABLE_WINDOW_HOURS
  const raw = Number.parseFloat(args?.rawValue ?? `${fallback}`)
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallback
  }
  return raw
}

export function resolveRoundtableApprovalTtlHours(args: {
  durationHours: number
  rawValue?: string | null
}): number {
  const fallback = Math.min(args.durationHours, 1)
  const raw = Number.parseFloat(args.rawValue ?? `${fallback}`)
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallback
  }
  return raw
}

export function resolvePreferredRoundtableExecutionTargetPath(
  root: DiscordRoundtableSchedulerRoot,
  pathExists: (path: string) => boolean = existsSync,
): string {
  for (const relativePath of ['src', 'apps', 'packages', 'scripts', 'internal']) {
    const candidate = `${root.path}\\${relativePath}`
    if (pathExists(candidate)) {
      return candidate
    }
  }
  return root.path
}

function parseIsoTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function findRoundtableRootDescriptor(
  targetPath: string,
  roots: DiscordRoundtableSchedulerRoot[],
): DiscordRoundtableSchedulerRoot | null {
  const normalizedTarget = targetPath.toLowerCase()
  return (
    roots.find(root => {
      const normalizedRoot = root.path.toLowerCase()
      return (
        normalizedTarget === normalizedRoot ||
        normalizedTarget.startsWith(`${normalizedRoot}\\`)
      )
    }) ?? null
  )
}

function sanitizeRoundtableProjectKey(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'repo'
}

function buildRoundtableScopeSuffix(
  targetPath: string,
  root: DiscordRoundtableSchedulerRoot | null,
): string {
  if (!root) {
    return '.'
  }
  const normalizedTarget = targetPath.toLowerCase()
  const normalizedRoot = root.path.toLowerCase()
  if (normalizedTarget === normalizedRoot) {
    return '.'
  }
  if (normalizedTarget.startsWith(`${normalizedRoot}\\`)) {
    return targetPath.slice(root.path.length + 1).replace(/\\/g, '/').toLowerCase()
  }
  return '.'
}

export function resolveRoundtableExecutionScope(args: {
  targetPath: string
  repoId: string
  roots: DiscordRoundtableSchedulerRoot[]
  pathExists?: (path: string) => boolean
}): DiscordRoundtableExecutionScope {
  const initialRoot = findRoundtableRootDescriptor(args.targetPath, args.roots)
  const narrowedTargetPath =
    initialRoot && args.targetPath.toLowerCase() === initialRoot.path.toLowerCase()
      ? resolvePreferredRoundtableExecutionTargetPath(
          initialRoot,
          args.pathExists ?? existsSync,
        )
      : args.targetPath
  const resolvedRoot =
    findRoundtableRootDescriptor(narrowedTargetPath, args.roots) ?? initialRoot
  const projectKey = sanitizeRoundtableProjectKey(args.repoId)
  const scopeSuffix = buildRoundtableScopeSuffix(narrowedTargetPath, resolvedRoot)
  return {
    targetPath: narrowedTargetPath,
    projectKey,
    workKey: `${projectKey}::${scopeSuffix}`,
    rootLabel: resolvedRoot?.label ?? null,
  }
}

function isNonMergeableRoundtablePath(path: string): boolean {
  return /^(artifacts\/|_AUDIT|_NOTE|AUDIT|docs\/wiki\/Audit)/i.test(
    path.replace(/\\/g, '/'),
  )
}

export function scoreRoundtableRoot(args: {
  root: DiscordRoundtableSchedulerRoot
  roundtableMemory: DiscordRoundtableMemorySnapshot | null
  recentActions: DiscordRoundtableRecentAction[]
  nowMs?: number
}): number {
  const haystack = [
    args.roundtableMemory?.currentFocus,
    args.roundtableMemory?.summary,
    args.roundtableMemory?.lastHumanQuestion,
    ...(args.roundtableMemory?.openThreads ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  if (!haystack) {
    return args.root.label.toLowerCase() === 'openjaws' ? 1 : 0
  }

  let score = 0
  for (const token of [args.root.label.toLowerCase(), ...args.root.aliases]) {
    if (!token) {
      continue
    }
    if (haystack.includes(token)) {
      score += token === args.root.label.toLowerCase() ? 6 : 3
    }
  }

  const nowMs = args.nowMs ?? Date.now()
  const recentForRoot = args.recentActions.filter(
    action =>
      action.targetPath &&
      findRoundtableRootDescriptor(action.targetPath, [args.root]) !== null,
  )
  const veryRecentCompleted = recentForRoot.filter(action => {
    const completedAtMs = parseIsoTimestampMs(action.completedAt)
    return (
      action.status === 'completed' &&
      completedAtMs !== null &&
      nowMs - completedAtMs < 45 * 60_000
    )
  }).length
  const veryRecentErrors = recentForRoot.filter(action => {
    const completedAtMs = parseIsoTimestampMs(action.completedAt)
    return (
      action.status === 'error' &&
      completedAtMs !== null &&
      nowMs - completedAtMs < 30 * 60_000
    )
  }).length
  const pendingApprovals = recentForRoot.filter(
    action =>
      action.status === 'awaiting_approval' && action.approvalState === 'pending',
  ).length
  const veryRecentNonMergeable = recentForRoot.filter(action => {
    const completedAtMs = parseIsoTimestampMs(action.completedAt)
    const recentEnough = completedAtMs !== null && nowMs - completedAtMs < 60 * 60_000
    const artifactOnly =
      action.changedFiles.length > 0 &&
      action.changedFiles.every(path => isNonMergeableRoundtablePath(path))
    const hasDisallowedChanges = action.changedFiles.some(path =>
      isNonMergeableRoundtablePath(path),
    )
    const verificationFailed = Boolean(
      action.verificationSummary?.startsWith('Verification failed:'),
    )
    return (
      recentEnough &&
      (artifactOnly || hasDisallowedChanges || verificationFailed || !action.commitSha)
    )
  }).length
  let consecutiveRootHits = 0
  for (const action of [...args.recentActions].reverse()) {
    if (
      action.targetPath &&
      findRoundtableRootDescriptor(action.targetPath, [args.root]) !== null
    ) {
      consecutiveRootHits += 1
      continue
    }
    break
  }

  score -= veryRecentCompleted * 4
  score -= veryRecentErrors * 2
  score -= pendingApprovals * 10
  score -= veryRecentNonMergeable * 8
  score -= consecutiveRootHits * 6
  if (recentForRoot.length === 0) {
    score += 2
  }
  return score
}

export function chooseFallbackRoundtableRoot(args: {
  roots: DiscordRoundtableSchedulerRoot[]
  roundtableMemory: DiscordRoundtableMemorySnapshot | null
  recentActions: DiscordRoundtableRecentAction[]
  nowMs?: number
}): DiscordRoundtableSchedulerRoot | null {
  const ranked = [...args.roots].sort((left, right) => {
    const scoreDelta =
      scoreRoundtableRoot({
        root: right,
        roundtableMemory: args.roundtableMemory,
        recentActions: args.recentActions,
        nowMs: args.nowMs,
      }) -
      scoreRoundtableRoot({
        root: left,
        roundtableMemory: args.roundtableMemory,
        recentActions: args.recentActions,
        nowMs: args.nowMs,
      })
    if (scoreDelta !== 0) {
      return scoreDelta
    }
    return left.label.localeCompare(right.label)
  })
  return ranked[0] ?? null
}

export function normalizeRoundtableReply(text: string): string | null {
  const normalized = text
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/^```(?:\w+)?/g, '')
    .replace(/```$/g, '')
    .trim()
  if (!normalized) {
    return null
  }
  if (/^\(?no content\)?$/i.test(normalized)) {
    return null
  }
  if (normalized.toUpperCase() === 'PASS') {
    return 'PASS'
  }
  return normalized
}

export function looksIncompleteRoundtableReply(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 140) {
    return true
  }
  if (
    /[:\-]\s*$/.test(trimmed) ||
    /\*\*$/.test(trimmed) ||
    /\b(openjaws|immaculate|asgard|gtm|marketing|release)\*\*$/i.test(trimmed)
  ) {
    return true
  }
  return !/[.!?][)"']?\s*$/.test(trimmed)
}

export function inspectRoundtableReply(args: {
  rawReply: string
  forceContribution: boolean
}): DiscordRoundtableReplyInspection {
  const normalizedReply = normalizeRoundtableReply(args.rawReply)
  if (!normalizedReply) {
    return {
      normalizedReply: null,
      isPass: false,
      isIncomplete: true,
      shouldRetry: true,
    }
  }

  const isPass = normalizedReply === 'PASS'
  const isIncomplete = isPass ? false : looksIncompleteRoundtableReply(normalizedReply)
  return {
    normalizedReply,
    isPass,
    isIncomplete,
    shouldRetry:
      normalizedReply === null ||
      isIncomplete ||
      (args.forceContribution && isPass),
  }
}

export function shouldForceRoundtableContribution(args: {
  turnCount: number
  latestHumanQuestion: string | null
  roundtableMemory: DiscordRoundtableMemorySnapshot | null
  recentActions: DiscordRoundtableRecentAction[]
  nowMs?: number
}): boolean {
  if (args.turnCount < DEFAULT_FORCED_ROUNDTABLE_TURNS) {
    return true
  }
  if (args.latestHumanQuestion?.trim()) {
    return true
  }
  if ((args.roundtableMemory?.openThreads?.filter(Boolean).length ?? 0) > 0) {
    return true
  }

  if (
    args.recentActions.some(
      action =>
        action.status === 'queued' ||
        action.status === 'running' ||
        (action.status === 'awaiting_approval' && action.approvalState === 'pending'),
    )
  ) {
    return true
  }

  const nowMs = args.nowMs ?? Date.now()
  const recentActions = args.recentActions.slice(-6)
  const recentConcreteOutcome = recentActions.some(action => {
    const completedAtMs = parseIsoTimestampMs(action.completedAt)
    return (
      completedAtMs !== null &&
      nowMs - completedAtMs < 20 * 60_000 &&
      (action.changedFiles.length > 0 || Boolean(action.verificationSummary))
    )
  })

  return recentActions.length > 0 && !recentConcreteOutcome
}
