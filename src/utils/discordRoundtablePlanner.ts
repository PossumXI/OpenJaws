import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
import { basename, join } from 'path'

import {
  findGitRoot,
  normalizeAbsolutePath,
  relativeWithinRoot,
} from './discordOperatorWork.js'
import {
  getDiscordRoundtableInboxDir,
  getDiscordRoundtableRuntimeDir,
  loadDiscordRoundtableRuntimeState,
  readDiscordRoundtableSessionSnapshot,
  type DiscordRoundtableSessionState,
  type DiscordRoundtableTrackedJob,
} from './discordRoundtableRuntime.js'
import {
  chooseFallbackRoundtableRoot,
  resolveRoundtableExecutionScope,
  shouldForceRoundtableContribution,
  type DiscordRoundtableMemorySnapshot,
  type DiscordRoundtableRecentAction,
  type DiscordRoundtableSchedulerRoot,
} from './discordRoundtableScheduler.js'

export type DiscordRoundtablePlannerResult = {
  staged: boolean
  reason: string
  handoffPath: string | null
  targetPath: string | null
  workKey: string | null
  repoLabel: string | null
  personaName: string | null
}

type JsonRecord = Record<string, unknown>

const ACTIVE_ROUNDTABLE_ACTION_COOLDOWN_MS = 90 * 1000
const PASSIVE_ROUNDTABLE_ACTION_COOLDOWN_MS = 10 * 60 * 1000

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter((entry): entry is string => Boolean(entry))
    : []
}

function sanitizeSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'roundtable'
}

function parseIsoTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getObservedRoundtableRuntimeDirs(root: string): string[] {
  const primary = getDiscordRoundtableRuntimeDir(root)
  const nested = join(primary, 'roundtable-runtime')
  return existsSync(nested) ? [primary, nested] : [primary]
}

function readLatestObservedRoundtableJson(
  root: string,
  fileName: string,
): unknown | null {
  const candidates = getObservedRoundtableRuntimeDirs(root)
    .map(runtimeDir => join(runtimeDir, fileName))
    .filter(path => existsSync(path))
    .sort((left, right) => {
      try {
        return statSync(right).mtimeMs - statSync(left).mtimeMs
      } catch {
        return 0
      }
    })
  if (candidates.length === 0) {
    return null
  }
  try {
    return JSON.parse(readFileSync(candidates[0]!, 'utf8'))
  } catch {
    return null
  }
}

function readRoundtableMemorySnapshot(
  root: string,
): DiscordRoundtableMemorySnapshot | null {
  const parsed = asRecord(
    readLatestObservedRoundtableJson(root, 'discord-roundtable-memory.json'),
  )
  if (!parsed) {
    return null
  }
  return {
    summary: asString(parsed.summary),
    currentFocus: asString(parsed.currentFocus),
    lastHumanQuestion: asString(parsed.lastHumanQuestion),
    openThreads: asStringArray(parsed.openThreads),
  }
}

function readRecentRoundtableActions(root: string): DiscordRoundtableRecentAction[] {
  const parsed = readLatestObservedRoundtableJson(root, 'discord-roundtable-actions.json')
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed
    .slice(-24)
    .map(entry => {
      const record = asRecord(entry)
      if (!record) {
        return null
      }
      const status = asString(record.status)
      if (
        status !== 'queued' &&
        status !== 'running' &&
        status !== 'awaiting_approval' &&
        status !== 'completed' &&
        status !== 'rejected' &&
        status !== 'error' &&
        status !== 'skipped'
      ) {
        return null
      }
      const approvalState = asString(record.approvalState)
      return {
        targetPath:
          asString(record.targetPath) ??
          asString(record.workspacePath) ??
          asString(record.worktreePath),
        status,
        approvalState:
          approvalState === 'pending' ||
          approvalState === 'approved' ||
          approvalState === 'rejected'
            ? approvalState
            : undefined,
        completedAt: asString(record.completedAt) ?? asString(record.startedAt),
        changedFiles: asStringArray(record.changedFiles),
        commitSha: asString(record.commitSha),
        verificationSummary: asString(record.verificationSummary),
      } satisfies DiscordRoundtableRecentAction
    })
    .filter((entry): entry is DiscordRoundtableRecentAction => Boolean(entry))
}

function hasPendingInboxHandoffs(root: string): boolean {
  const inboxDir = getDiscordRoundtableInboxDir(root)
  if (!existsSync(inboxDir)) {
    return false
  }
  return readdirSync(inboxDir).some(name => name.toLowerCase().endsWith('.json'))
}

function hasActiveTrackedJobs(jobs: DiscordRoundtableTrackedJob[]): boolean {
  return jobs.some(
    job =>
      job.status === 'queued' ||
      job.status === 'running' ||
      (job.status === 'awaiting_approval' && job.approvalState === 'pending'),
  )
}

function getRecentRoundtableActionCooldownMs(
  action: DiscordRoundtableRecentAction,
): number {
  if (
    action.status === 'queued' ||
    action.status === 'running' ||
    action.status === 'awaiting_approval'
  ) {
    return PASSIVE_ROUNDTABLE_ACTION_COOLDOWN_MS
  }
  return ACTIVE_ROUNDTABLE_ACTION_COOLDOWN_MS
}

function hasRecentRoundtableAction(
  recentActions: DiscordRoundtableRecentAction[],
  nowMs: number,
): boolean {
  return recentActions.some(action => {
    const actionAtMs = parseIsoTimestampMs(action.completedAt)
    return (
      actionAtMs !== null &&
      nowMs - actionAtMs < getRecentRoundtableActionCooldownMs(action)
    )
  })
}

function looksPassHeavy(args: {
  session: DiscordRoundtableSessionState
  roundtableMemory: DiscordRoundtableMemorySnapshot | null
}): boolean {
  const combined = [
    args.session.lastSummary,
    args.roundtableMemory?.summary,
    args.roundtableMemory?.currentFocus,
  ]
    .filter(Boolean)
    .join('\n')
  return /\bpass(?:ed)? turn\b/i.test(combined) || /\bPASS\b/.test(combined)
}

function isPlannerRootExecutable(root: DiscordRoundtableSchedulerRoot): boolean {
  const gitRoot = findGitRoot(root.path)
  return Boolean(gitRoot && relativeWithinRoot(root.path, gitRoot) !== null)
}

function normalizePlannerRoots(allowedRoots: string[]): DiscordRoundtableSchedulerRoot[] {
  return Array.from(
    new Set(
      allowedRoots
        .map(root => normalizeAbsolutePath(root))
        .filter((root): root is string => Boolean(root && existsSync(root))),
    ),
  ).map(root => ({
    label: basename(root) || root,
    path: root,
    aliases: [basename(root).toLowerCase(), root.toLowerCase()],
  }))
}

function getPersonaName(personaId: string | null | undefined): string {
  switch ((personaId ?? '').trim().toLowerCase()) {
    case 'viola':
      return 'Viola'
    case 'blackbeak':
      return 'Blackbeak'
    case 'q':
    default:
      return 'Q'
  }
}

function buildPlannerFocusAreas(args: {
  rootLabel: string | null
  targetPath: string
}): string[] {
  const rootLabel = (args.rootLabel ?? '').toLowerCase()
  const focusAreas = [
    'scoped code-bearing diff',
    'verification before approval',
    'avoid artifacts and audit-only notes',
  ]
  if (rootLabel === 'openjaws') {
    focusAreas.unshift(
      'discord runtime status truth',
      'roundtable queue and scheduler policy',
      'operator and TUI execution surfaces',
    )
  } else if (rootLabel === 'immaculate') {
    focusAreas.unshift(
      'harness auth and governance',
      'dashboard orchestration surfaces',
      'code-bearing app path only',
    )
  } else if (rootLabel === 'asgard') {
    focusAreas.unshift(
      'workspace_api and app boundaries',
      'public telemetry truth',
      'path and bridge hardening',
    )
  }
  const normalizedTarget = args.targetPath.replace(/\\/g, '/')
  if (normalizedTarget.includes('/src/utils')) {
    focusAreas.unshift('shared utility path')
  } else if (normalizedTarget.includes('/src/commands')) {
    focusAreas.unshift('command surface')
  } else if (normalizedTarget.includes('/apps/harness/src')) {
    focusAreas.unshift('harness runtime path')
  } else if (normalizedTarget.includes('/apps/dashboard/app')) {
    focusAreas.unshift('dashboard route path')
  }
  return Array.from(new Set(focusAreas))
}

function buildPlannerRelevantFiles(args: {
  rootLabel: string | null
  targetPath: string
}): string[] {
  const rootLabel = (args.rootLabel ?? '').toLowerCase()
  const normalizedTarget = args.targetPath.replace(/\\/g, '/')
  if (rootLabel === 'openjaws') {
    return normalizedTarget.includes('/src')
      ? ['src/utils', 'src/commands', 'src/components']
      : ['src']
  }
  if (rootLabel === 'immaculate') {
    return normalizedTarget.includes('/apps')
      ? ['apps/harness/src', 'apps/dashboard/app']
      : ['apps']
  }
  if (rootLabel === 'asgard') {
    return normalizedTarget.includes('/scripts')
      ? ['scripts', 'internal/cortex', 'internal/security']
      : ['internal', 'scripts']
  }
  return [normalizedTarget]
}

function buildPlannerCommandHint(args: {
  personaName: string
  targetPath: string
  passReason: string
}): string {
  return `${args.personaName}: follow through on the current roundtable window inside ${args.targetPath}. Replace PASS/no-diff drift with one bounded code, config, or test fix. ${args.passReason}`
}

function writeSyntheticRoundtableHandoff(args: {
  root: string
  handoff: JsonRecord
  fileStem: string
  now: Date
}): string {
  const inboxDir = getDiscordRoundtableInboxDir(args.root)
  mkdirSync(inboxDir, { recursive: true })
  const stamp = args.now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
  const handoffPath = join(inboxDir, `${stamp}-${sanitizeSegment(args.fileStem)}.json`)
  writeFileSync(handoffPath, `${JSON.stringify(args.handoff, null, 2)}\n`, 'utf8')
  return handoffPath
}

export function planDiscordRoundtableFollowThrough(args: {
  root?: string
  allowedRoots: string[]
  now?: Date
}): DiscordRoundtablePlannerResult {
  const runtimeRoot = args.root ?? process.cwd()
  const now = args.now ?? new Date()
  const nowMs = now.getTime()
  const roots = normalizePlannerRoots(args.allowedRoots)
  if (roots.length === 0) {
    return {
      staged: false,
      reason: 'no allowed git-backed roots available',
      handoffPath: null,
      targetPath: null,
      workKey: null,
      repoLabel: null,
      personaName: null,
    }
  }

  const session = readDiscordRoundtableSessionSnapshot(runtimeRoot, now)
  if (!session || session.status !== 'running') {
    return {
      staged: false,
      reason: 'roundtable session is not actively running',
      handoffPath: null,
      targetPath: null,
      workKey: null,
      repoLabel: null,
      personaName: null,
    }
  }

  const runtimeState = loadDiscordRoundtableRuntimeState(runtimeRoot)
  if (hasActiveTrackedJobs(runtimeState.jobs)) {
    return {
      staged: false,
      reason: 'tracked queue already has active governed work',
      handoffPath: null,
      targetPath: null,
      workKey: null,
      repoLabel: null,
      personaName: null,
    }
  }

  if (hasPendingInboxHandoffs(runtimeRoot)) {
    return {
      staged: false,
      reason: 'roundtable inbox already contains staged handoffs',
      handoffPath: null,
      targetPath: null,
      workKey: null,
      repoLabel: null,
      personaName: null,
    }
  }

  const roundtableMemory = readRoundtableMemorySnapshot(runtimeRoot)
  const recentActions = readRecentRoundtableActions(runtimeRoot)
  if (hasRecentRoundtableAction(recentActions, nowMs)) {
    return {
      staged: false,
      reason: 'recent governed action already launched',
      handoffPath: null,
      targetPath: null,
      workKey: null,
      repoLabel: null,
      personaName: null,
    }
  }

  const passHeavy = looksPassHeavy({
    session,
    roundtableMemory,
  })
  const shouldForce = shouldForceRoundtableContribution({
    turnCount: session.turnCount,
    latestHumanQuestion: roundtableMemory?.lastHumanQuestion ?? null,
    roundtableMemory,
    recentActions,
    nowMs,
  })
  if (!passHeavy && !shouldForce) {
    return {
      staged: false,
      reason: 'steady-state planner pressure is not high enough',
      handoffPath: null,
      targetPath: null,
      workKey: null,
      repoLabel: null,
      personaName: null,
    }
  }

  const selectedRoot =
    chooseFallbackRoundtableRoot({
      roots,
      roundtableMemory,
      recentActions,
      nowMs,
      rootIsExecutable: isPlannerRootExecutable,
    }) ?? null
  if (!selectedRoot) {
    return {
      staged: false,
      reason: 'no git-backed roundtable root is executable',
      handoffPath: null,
      targetPath: null,
      workKey: null,
      repoLabel: null,
      personaName: null,
    }
  }
  const scope = resolveRoundtableExecutionScope({
    targetPath: selectedRoot.path,
    repoId: selectedRoot.label,
    roots,
    pathExists: existsSync,
  })
  const personaName = getPersonaName(session.nextPersona)
  const jobId = sanitizeSegment(
    `${session.nextPersona ?? 'q'}-follow-through-${selectedRoot.label}-${now.toISOString()}`,
  )
  const passReason = session.lastSummary
    ? `Current weak summary: ${session.lastSummary}`
    : 'The live channel is active but no tracked work is in flight.'
  const handoff = {
    sessionId: session.startedAt ?? session.updatedAt,
    scheduleId: session.endsAt ?? session.updatedAt,
    handoffKey: `synthetic:${jobId}`,
    roundtableActions: [
      {
        id: jobId,
        repoId: sanitizeSegment(selectedRoot.label),
        repoLabel: selectedRoot.label,
        role: personaName,
        objective: `${personaName} scoped follow-through pass`,
        rationale: `Tracked planner follow-through: queue is idle while the live Discord roundtable is still running in #${
          session.roundtableChannelName ?? 'dev_support'
        }. ${passReason}`,
        commandHint: buildPlannerCommandHint({
          personaName,
          targetPath: scope.targetPath,
          passReason,
        }),
        routeSuggestion: 'openjaws-visible',
        commitStatement: `${personaName} scoped follow-through pass`,
        workspaceScope: {
          repoPath: scope.targetPath,
        },
        executionArtifact: {
          decisionTraceId: jobId,
          routeSuggestion: 'openjaws-visible',
          commitStatement: `${personaName} scoped follow-through pass`,
          executionReady: true,
          requiresManualCheckout: false,
          workspaceMaterialized: true,
          authorityBound: true,
          relevantFiles: buildPlannerRelevantFiles({
            rootLabel: scope.rootLabel,
            targetPath: scope.targetPath,
          }),
          focusAreas: buildPlannerFocusAreas({
            rootLabel: scope.rootLabel,
            targetPath: scope.targetPath,
          }),
        },
      },
    ],
  } satisfies JsonRecord

  const handoffPath = writeSyntheticRoundtableHandoff({
    root: runtimeRoot,
    handoff,
    fileStem: `${personaName}-${selectedRoot.label}-follow-through`,
    now,
  })
  return {
    staged: true,
    reason: `staged a scoped follow-through handoff for ${personaName} in ${selectedRoot.label}`,
    handoffPath,
    targetPath: scope.targetPath,
    workKey: scope.workKey,
    repoLabel: selectedRoot.label,
    personaName,
  }
}
