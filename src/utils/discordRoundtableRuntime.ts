import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, extname, join, resolve } from 'path'
import {
  executeDiscordRoundtableAction,
  type DiscordRoundtableExecutableAction,
  type DiscordRoundtableExecutionResult,
  type DiscordRoundtableRootDescriptor,
} from './discordRoundtableExecution.js'
import {
  getNextQueuedDiscordExecutionJob,
  reconcileDiscordExecutionJobs,
  shouldEnqueueDiscordExecutionJob,
  type DiscordExecutionApprovalState,
  type DiscordExecutionJobStatus,
  type DiscordExecutionTrackedJob,
} from './discordExecutionQueue.js'
import {
  findGitRoot,
  normalizeAbsolutePath,
  relativeWithinRoot,
} from './discordOperatorWork.js'
import {
  DEFAULT_ROUNDTABLE_WINDOW_HOURS,
  resolveRoundtableExecutionScope,
  resolveRoundtableDurationHours,
  resolveRoundtableApprovalTtlHours,
} from './discordRoundtableScheduler.js'

type JsonRecord = Record<string, unknown>

export type DiscordRoundtableRuntimeState = {
  version: 1
  status: 'idle' | 'queued' | 'running' | 'awaiting_approval' | 'error'
  updatedAt: string
  roundtableChannelName: string | null
  lastSummary: string | null
  lastError: string | null
  activeJobId: string | null
  ingestedHandoffs: string[]
  jobs: DiscordRoundtableTrackedJob[]
}

export type DiscordRoundtableSessionStatus =
  | DiscordRoundtableRuntimeState['status']
  | 'completed'

export type DiscordRoundtableSessionState = {
  version: 1
  status: DiscordRoundtableSessionStatus
  updatedAt: string
  startedAt: string | null
  endsAt: string | null
  guildId: string | null
  roundtableChannelId: string | null
  roundtableChannelName: string | null
  generalChannelId: string | null
  generalChannelName: string | null
  violaVoiceChannelId: string | null
  violaVoiceChannelName: string | null
  turnCount: number
  nextPersona: string | null
  lastSpeaker: string | null
  lastSummary: string | null
  lastError: string | null
  processedCommandMessageIds: string[]
}

export type DiscordRoundtableTrackedJob = DiscordExecutionTrackedJob & {
  kind: 'roundtable'
  action: DiscordRoundtableExecutableAction
  sourcePath: string
  sourceSessionId: string | null
  sourceScheduleId: string | null
  handoffKey: string | null
  repoId: string
  repoLabel: string
  role: string
  objective: string
  rationale: string
  commandHint: string | null
  targetPath: string
  targetRootLabel: string | null
  receiptPath: string | null
  outputDir: string | null
  commitStatement: string | null
  decisionTraceId: string | null
  routeSuggestion: string | null
  executionReady: boolean
  requiresManualCheckout: boolean
  workspaceMaterialized: boolean
  authorityBound: boolean
  verificationSummary: string | null
  commitSha: string | null
}

export type DiscordRoundtableLogSnapshot = {
  updatedAt: string | null
  channelName: string | null
  lastSummary: string | null
}

export type DiscordRoundtableProcessResult = {
  state: DiscordRoundtableRuntimeState
  ingestedCount: number
  executedCount: number
  queuedCount: number
  awaitingApprovalCount: number
  durationHours: number
  approvalTtlHours: number
  transitionReceipts: DiscordRoundtableTransitionReceipt[]
}

export type DiscordRoundtableTransitionReceipt = {
  jobId: string
  repoLabel: string
  role: string
  objective: string
  status: DiscordExecutionJobStatus
  branchName: string | null
  commitSha: string | null
  verificationSummary: string | null
  receiptPath: string | null
  rejectionReason: string | null
  summary: string | null
}

type DiscordRoundtableJobCounts = {
  queued: number
  running: number
  awaitingApproval: number
  completed: number
  rejected: number
  error: number
  skipped: number
}

export type DiscordRoundtableRuntimeOptions = {
  root?: string
  allowedRoots: string[]
  roots?: DiscordRoundtableRootDescriptor[]
  roundtableChannelName?: string | null
  handoffPaths?: string[]
  ingestInbox?: boolean
  maxActionsPerRun?: number
  durationHours?: number
  approvalTtlHours?: number
  timeoutMs?: number
  model: string
  runnerScriptPath: string
  worktreeRoot: string
  outputRoot: string
  operatorStatePath?: string
  now?: () => Date
  executeAction?: (args: {
    action: DiscordRoundtableExecutableAction
    personaId: string
    personaName: string
    roots: DiscordRoundtableRootDescriptor[]
    runnerScriptPath: string
    model: string
    worktreeRoot: string
    outputRoot: string
    timeoutMs: number
  }) => Promise<DiscordRoundtableExecutionResult>
}

type RawRoundtableAction = {
  id: string
  repoId: string
  repoLabel: string
  role: string
  objective: string
  rationale: string
  commandHint: string | null
  decisionTraceId: string | null
  routeSuggestion: string | null
  commitStatement: string | null
  targetPath: string | null
  executionReady: boolean
  requiresManualCheckout: boolean
  workspaceMaterialized: boolean
  authorityBound: boolean
  taskDocumentPath: string | null
  relevantFiles: string[]
  focusAreas: string[]
}

type RawRoundtableHandoff = {
  sessionId: string | null
  scheduleId: string | null
  handoffKey: string | null
  actions: RawRoundtableAction[]
}

type StoredOperatorState = {
  pendingPushes?: StoredOperatorPendingPush[]
}

type StoredOperatorPendingPush = {
  id: string
  jobId: string
  branchName: string
  worktreePath: string
  workspacePath: string
  changedFiles: string[]
  summary: string
  verificationSummary?: string | null
  commitSha: string
  gitRoot: string
  baseWorkspace: string
  requestedByUserId: string
  requestedByChannelId: string | null
  requestedAt: string
  prompt: string
  verificationPassed: boolean
  outputDir: string | null
  status: DiscordExecutionJobStatus
  approvalState: DiscordExecutionApprovalState
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
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
  return normalized || 'job'
}

function parseIsoTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getDiscordRoundtableObservedRuntimeDirs(root = process.cwd()): string[] {
  const primary = getDiscordRoundtableRuntimeDir(root)
  const nested = join(primary, 'roundtable-runtime')
  return existsSync(nested) ? [primary, nested] : [primary]
}

function getDiscordRoundtableLogPath(root = process.cwd()): string {
  const candidates = getDiscordRoundtableObservedRuntimeDirs(root)
    .map(dir => join(dir, 'discord-roundtable.log'))
    .filter(path => existsSync(path))

  if (candidates.length === 0) {
    return join(getDiscordRoundtableRuntimeDir(root), 'discord-roundtable.log')
  }

  const ranked = candidates.sort((left, right) => {
    try {
      return statSync(right).mtimeMs - statSync(left).mtimeMs
    } catch {
      return 0
    }
  })
  return ranked[0]!
}

function extractRoundtableChannelNameFromLogLine(line: string): string | null {
  const match =
    /roundtable(?: window \d+)? live in #([a-z0-9._-]+)/i.exec(line)
  return match?.[1]?.trim() || null
}

function deriveRoundtableStatusFromSummary(
  summary: string | null,
): DiscordRoundtableRuntimeState['status'] | null {
  if (!summary) {
    return null
  }
  if (/awaiting_approval/i.test(summary)) {
    return 'awaiting_approval'
  }
  if (/executing queued action/i.test(summary)) {
    return 'running'
  }
  if (/queued action/i.test(summary)) {
    return 'queued'
  }
  if (/failed/i.test(summary) || /\berror\b/i.test(summary)) {
    return 'error'
  }
  return null
}

export function readDiscordRoundtableLogSnapshot(
  root = process.cwd(),
): DiscordRoundtableLogSnapshot | null {
  const logPath = getDiscordRoundtableLogPath(root)
  if (!existsSync(logPath)) {
    return null
  }
  const lines = readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length === 0) {
    return null
  }

  let updatedAt: string | null = null
  let channelName: string | null = null
  let lastSummary: string | null = null

  for (const line of lines) {
    const timestampMatch = /^\[([^\]]+)\]\s*(.*)$/.exec(line)
    const timestamp = timestampMatch?.[1]?.trim() || null
    const summary = timestampMatch?.[2]?.trim() || line
    if (timestamp) {
      updatedAt = timestamp
    }
    if (summary) {
      lastSummary = summary
    }
    const channel = extractRoundtableChannelNameFromLogLine(summary)
    if (channel) {
      channelName = channel
    }
  }

  return {
    updatedAt,
    channelName,
    lastSummary,
  }
}

function overlayRoundtableLogSnapshot(args: {
  state: DiscordRoundtableRuntimeState
  logSnapshot: DiscordRoundtableLogSnapshot | null
}): DiscordRoundtableRuntimeState {
  const { state, logSnapshot } = args
  if (!logSnapshot) {
    return state
  }

  const stateUpdatedAtMs = parseIsoTimestampMs(state.updatedAt)
  const logUpdatedAtMs = parseIsoTimestampMs(logSnapshot.updatedAt)
  const logIsNewer =
    logUpdatedAtMs !== null &&
    (stateUpdatedAtMs === null || logUpdatedAtMs >= stateUpdatedAtMs)

  const currentChannelName = state.roundtableChannelName?.trim() || null
  const currentChannelLooksPreferredAlias =
    currentChannelName !== null &&
    ['q-roundtable', 'q-roundtable-live'].includes(currentChannelName.toLowerCase())
  const nextChannelName =
    logSnapshot.channelName &&
    (!currentChannelName || currentChannelLooksPreferredAlias || logIsNewer)
      ? logSnapshot.channelName
      : currentChannelName

  let nextStatus = state.status
  if (logIsNewer && state.activeJobId === null && state.jobs.length === 0) {
    nextStatus = deriveRoundtableStatusFromSummary(logSnapshot.lastSummary) ?? state.status
  }

  return {
    ...state,
    updatedAt: logIsNewer && logSnapshot.updatedAt ? logSnapshot.updatedAt : state.updatedAt,
    roundtableChannelName: nextChannelName,
    lastSummary:
      logIsNewer && logSnapshot.lastSummary ? logSnapshot.lastSummary : state.lastSummary,
    status: nextStatus,
  }
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function writeJsonFile(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function getDiscordRoundtableRuntimeDir(root = process.cwd()): string {
  return resolve(root, 'local-command-station', 'roundtable-runtime')
}

export function getDiscordRoundtableStatePath(root = process.cwd()): string {
  return join(getDiscordRoundtableRuntimeDir(root), 'discord-roundtable.state.json')
}

export function getDiscordRoundtableSessionStatePath(root = process.cwd()): string {
  return join(getDiscordRoundtableRuntimeDir(root), 'discord-roundtable.session.json')
}

export function getDiscordRoundtableInboxDir(root = process.cwd()): string {
  return join(getDiscordRoundtableRuntimeDir(root), 'handoffs')
}

export function getDiscordRoundtableQuarantineDir(root = process.cwd()): string {
  return join(getDiscordRoundtableRuntimeDir(root), 'handoff-quarantine')
}

export function getOpenJawsOperatorStatePath(root = process.cwd()): string {
  return resolve(root, 'local-command-station', 'openjaws-operator-state.json')
}

export function createDiscordRoundtableRuntimeState(args?: {
  now?: Date
  roundtableChannelName?: string | null
}): DiscordRoundtableRuntimeState {
  const nowIso = (args?.now ?? new Date()).toISOString()
  return {
    version: 1,
    status: 'idle',
    updatedAt: nowIso,
    roundtableChannelName: args?.roundtableChannelName ?? null,
    lastSummary: null,
    lastError: null,
    activeJobId: null,
    ingestedHandoffs: [],
    jobs: [],
  }
}

export function createDiscordRoundtableSessionState(args?: {
  now?: Date
  roundtableChannelName?: string | null
}): DiscordRoundtableSessionState {
  const nowIso = (args?.now ?? new Date()).toISOString()
  return {
    version: 1,
    status: 'idle',
    updatedAt: nowIso,
    startedAt: null,
    endsAt: null,
    guildId: null,
    roundtableChannelId: null,
    roundtableChannelName: args?.roundtableChannelName ?? null,
    generalChannelId: null,
    generalChannelName: null,
    violaVoiceChannelId: null,
    violaVoiceChannelName: null,
    turnCount: 0,
    nextPersona: null,
    lastSpeaker: null,
    lastSummary: null,
    lastError: null,
    processedCommandMessageIds: [],
  }
}

function normalizeDiscordRoundtableSessionStatus(
  value: unknown,
): DiscordRoundtableSessionStatus {
  switch (value) {
    case 'idle':
    case 'queued':
    case 'running':
    case 'awaiting_approval':
    case 'error':
    case 'completed':
      return value
    default:
      return 'idle'
  }
}

function readLegacyDiscordRoundtableSessionState(
  root = process.cwd(),
): Partial<DiscordRoundtableSessionState> | null {
  const legacySessionFields = [
    'startedAt',
    'endsAt',
    'guildId',
    'roundtableChannelId',
    'generalChannelId',
    'generalChannelName',
    'violaVoiceChannelId',
    'violaVoiceChannelName',
    'turnCount',
    'nextPersona',
    'lastSpeaker',
    'processedCommandMessageIds',
  ]

  let selected: JsonRecord | null = null
  let selectedUpdatedAtMs = Number.NEGATIVE_INFINITY
  for (const runtimeDir of getDiscordRoundtableObservedRuntimeDirs(root)) {
    const parsed = readJsonFile<JsonRecord>(join(runtimeDir, 'discord-roundtable.state.json'))
    if (!parsed || !legacySessionFields.some(field => field in parsed)) {
      continue
    }
    const parsedUpdatedAtMs = parseIsoTimestampMs(asString(parsed.updatedAt))
    const rank =
      parsedUpdatedAtMs ?? (selected === null ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
    if (selected === null || rank >= selectedUpdatedAtMs) {
      selected = parsed
      selectedUpdatedAtMs = rank
    }
  }

  return selected as Partial<DiscordRoundtableSessionState> | null
}

export function loadDiscordRoundtableRuntimeState(
  root = process.cwd(),
): DiscordRoundtableRuntimeState {
  const parsed = readJsonFile<Partial<DiscordRoundtableRuntimeState>>(
    getDiscordRoundtableStatePath(root),
  )
  const base = createDiscordRoundtableRuntimeState()
  if (!parsed) {
    return base
  }
  const state: DiscordRoundtableRuntimeState = {
    version: 1,
    status:
      parsed.status === 'idle' ||
      parsed.status === 'queued' ||
      parsed.status === 'running' ||
      parsed.status === 'awaiting_approval' ||
      parsed.status === 'error'
        ? parsed.status
        : base.status,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : base.updatedAt,
    roundtableChannelName:
      typeof parsed.roundtableChannelName === 'string'
        ? parsed.roundtableChannelName
        : base.roundtableChannelName,
    lastSummary:
      typeof parsed.lastSummary === 'string' ? parsed.lastSummary : base.lastSummary,
    lastError: typeof parsed.lastError === 'string' ? parsed.lastError : base.lastError,
    activeJobId:
      typeof parsed.activeJobId === 'string' ? parsed.activeJobId : base.activeJobId,
    ingestedHandoffs: Array.isArray(parsed.ingestedHandoffs)
      ? parsed.ingestedHandoffs.filter(
          (entry): entry is string => typeof entry === 'string' && entry.length > 0,
        )
      : [],
    jobs: Array.isArray(parsed.jobs) ? (parsed.jobs as DiscordRoundtableTrackedJob[]) : [],
  }
  return overlayRoundtableLogSnapshot({
    state,
    logSnapshot: readDiscordRoundtableLogSnapshot(root),
  })
}

export function loadDiscordRoundtableSessionState(
  root = process.cwd(),
): DiscordRoundtableSessionState | null {
  const parsed =
    readJsonFile<Partial<DiscordRoundtableSessionState>>(
      getDiscordRoundtableSessionStatePath(root),
    ) ?? readLegacyDiscordRoundtableSessionState(root)
  if (!parsed) {
    return null
  }
  const now =
    typeof parsed.updatedAt === 'string' ? new Date(parsed.updatedAt) : new Date()
  const base = createDiscordRoundtableSessionState({
    now,
    roundtableChannelName:
      typeof parsed.roundtableChannelName === 'string'
        ? parsed.roundtableChannelName
        : null,
  })
  const state: DiscordRoundtableSessionState = {
    version: 1,
    status: normalizeDiscordRoundtableSessionStatus(parsed.status),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : base.updatedAt,
    startedAt: asString(parsed.startedAt),
    endsAt: asString(parsed.endsAt),
    guildId: asString(parsed.guildId),
    roundtableChannelId: asString(parsed.roundtableChannelId),
    roundtableChannelName:
      typeof parsed.roundtableChannelName === 'string'
        ? parsed.roundtableChannelName
        : base.roundtableChannelName,
    generalChannelId: asString(parsed.generalChannelId),
    generalChannelName: asString(parsed.generalChannelName),
    violaVoiceChannelId: asString(parsed.violaVoiceChannelId),
    violaVoiceChannelName: asString(parsed.violaVoiceChannelName),
    turnCount: asNumber(parsed.turnCount),
    nextPersona: asString(parsed.nextPersona),
    lastSpeaker: asString(parsed.lastSpeaker),
    lastSummary: asString(parsed.lastSummary),
    lastError: asString(parsed.lastError),
    processedCommandMessageIds: asStringArray(parsed.processedCommandMessageIds),
  }

  const logSnapshot = readDiscordRoundtableLogSnapshot(root)
  if (!logSnapshot) {
    return state
  }

  const stateUpdatedAtMs = parseIsoTimestampMs(state.updatedAt)
  const logUpdatedAtMs = parseIsoTimestampMs(logSnapshot.updatedAt)
  const logIsNewer =
    logUpdatedAtMs !== null &&
    (stateUpdatedAtMs === null || logUpdatedAtMs >= stateUpdatedAtMs)
  const currentChannelName = state.roundtableChannelName?.trim() || null
  const currentChannelLooksPreferredAlias =
    currentChannelName !== null &&
    ['q-roundtable', 'q-roundtable-live'].includes(currentChannelName.toLowerCase())
  return {
    ...state,
    updatedAt: logIsNewer && logSnapshot.updatedAt ? logSnapshot.updatedAt : state.updatedAt,
    roundtableChannelName:
      logSnapshot.channelName &&
      (!currentChannelName || currentChannelLooksPreferredAlias || logIsNewer)
        ? logSnapshot.channelName
        : currentChannelName,
    lastSummary:
      logIsNewer && logSnapshot.lastSummary ? logSnapshot.lastSummary : state.lastSummary,
    status:
      logIsNewer
        ? normalizeDiscordRoundtableSessionStatus(
            deriveRoundtableStatusFromSummary(logSnapshot.lastSummary) ?? state.status,
          )
        : state.status,
  }
}

export function saveDiscordRoundtableRuntimeState(args: {
  root?: string
  state: DiscordRoundtableRuntimeState
}) {
  writeJsonFile(getDiscordRoundtableStatePath(args.root), args.state)
}

export function saveDiscordRoundtableSessionState(args: {
  root?: string
  state: DiscordRoundtableSessionState
}) {
  writeJsonFile(getDiscordRoundtableSessionStatePath(args.root), args.state)
}

export function stageDiscordRoundtableHandoff(args: {
  root?: string
  handoffPath: string
  now?: Date
}): string {
  const runtimeRoot = args.root ?? process.cwd()
  const sourcePath = resolve(args.handoffPath)
  if (!existsSync(sourcePath)) {
    throw new Error(`Roundtable handoff path not found: ${sourcePath}`)
  }
  const inboxDir = getDiscordRoundtableInboxDir(runtimeRoot)
  mkdirSync(inboxDir, { recursive: true })
  if (dirname(sourcePath).toLowerCase() === inboxDir.toLowerCase()) {
    return sourcePath
  }
  const stamp = (args.now ?? new Date())
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
  const targetPath = join(
    inboxDir,
    `${stamp}-${sanitizeSegment(basename(sourcePath, '.json'))}.json`,
  )
  copyFileSync(sourcePath, targetPath)
  return targetPath
}

export function listDiscordRoundtableHandoffs(root = process.cwd()): string[] {
  const inboxDir = getDiscordRoundtableInboxDir(root)
  if (!existsSync(inboxDir)) {
    return []
  }
  return readdirSync(inboxDir)
    .filter(name => name.toLowerCase().endsWith('.json'))
    .map(name => join(inboxDir, name))
    .sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs)
}

function normalizeRootDescriptors(
  allowedRoots: string[],
): DiscordRoundtableRootDescriptor[] {
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

function readRoundtableHandoff(path: string): RawRoundtableHandoff {
  const parsed = readJsonFile<JsonRecord>(path)
  if (!parsed) {
    throw new Error(`Roundtable handoff is not valid JSON: ${path}`)
  }
  const rawActions = Array.isArray(parsed.actions)
    ? parsed.actions
    : Array.isArray(parsed.roundtableActions)
      ? parsed.roundtableActions
      : []
  return {
    sessionId: asString(parsed.sessionId),
    scheduleId: asString(parsed.scheduleId),
    handoffKey: asString(parsed.handoffKey),
    actions: rawActions
      .map((entry, index): RawRoundtableAction | null => {
        const record = asRecord(entry)
        if (!record) {
          return null
        }
        const workspaceScope = asRecord(record.workspaceScope)
        const executionArtifact = asRecord(record.executionArtifact)
        const repoPath =
          asString(workspaceScope?.repoPath) ??
          asString(record.repoPath) ??
          null
        return {
          id:
            asString(record.id) ??
            asString(executionArtifact?.decisionTraceId) ??
            `roundtable-action-${index + 1}`,
          repoId:
            asString(record.repoId) ??
            basename(repoPath ?? `repo-${index + 1}`),
          repoLabel:
            asString(record.repoLabel) ??
            basename(repoPath ?? `repo-${index + 1}`),
          role: asString(record.role) ?? 'roundtable',
          objective:
            asString(record.objective) ??
            asString(record.title) ??
            `Roundtable pass ${index + 1}`,
          rationale:
            asString(record.rationale) ??
            asString(record.reason) ??
            'Governed roundtable action.',
          commandHint: asString(record.commandHint),
          decisionTraceId:
            asString(record.decisionTraceId) ??
            asString(executionArtifact?.decisionTraceId),
          routeSuggestion:
            asString(record.routeSuggestion) ??
            asString(executionArtifact?.routeSuggestion),
          commitStatement:
            asString(record.commitStatement) ??
            asString(executionArtifact?.commitStatement),
          targetPath:
            repoPath ??
            asString(workspaceScope?.worktreePath) ??
            null,
          executionReady: asBoolean(executionArtifact?.executionReady, true),
          requiresManualCheckout: asBoolean(
            executionArtifact?.requiresManualCheckout,
            false,
          ),
          workspaceMaterialized: asBoolean(
            executionArtifact?.workspaceMaterialized,
            false,
          ),
          authorityBound: asBoolean(executionArtifact?.authorityBound, false),
          taskDocumentPath: asString(executionArtifact?.taskDocumentPath),
          relevantFiles: asStringArray(executionArtifact?.relevantFiles),
          focusAreas: asStringArray(executionArtifact?.focusAreas),
        }
      })
      .filter((entry): entry is RawRoundtableAction => Boolean(entry)),
  }
}

function quarantineDiscordRoundtableHandoff(args: {
  root?: string
  handoffPath: string
  reason: string
  now?: Date
}): string {
  const runtimeRoot = args.root ?? process.cwd()
  const sourcePath = resolve(args.handoffPath)
  const quarantineDir = getDiscordRoundtableQuarantineDir(runtimeRoot)
  mkdirSync(quarantineDir, { recursive: true })
  const stamp = (args.now ?? new Date())
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
  const sourceBase = basename(sourcePath, extname(sourcePath))
  const sourceExt = extname(sourcePath) || '.json'
  const targetPath = join(
    quarantineDir,
    `${stamp}-${sanitizeSegment(sourceBase)}${sourceExt}`,
  )
  renameSync(sourcePath, targetPath)
  writeJsonFile(`${targetPath}.meta.json`, {
    sourcePath,
    quarantinedAt: (args.now ?? new Date()).toISOString(),
    reason: args.reason,
  })
  return targetPath
}

function buildActionPrompt(args: {
  action: RawRoundtableAction
  handoff: RawRoundtableHandoff
  targetPath: string
}): string {
  const taskPreview =
    args.action.taskDocumentPath && existsSync(args.action.taskDocumentPath)
      ? readFileSync(args.action.taskDocumentPath, 'utf8').trim().slice(0, 1_500)
      : null
  const lines = [
    'Execute this governed roundtable action inside the isolated workspace.',
    '',
    `Repository: ${args.action.repoLabel}`,
    `Repo id: ${args.action.repoId}`,
    `Role: ${args.action.role}`,
    `Objective: ${args.action.objective}`,
    `Reason: ${args.action.rationale}`,
    `Assigned target path: ${args.targetPath}`,
    ...(args.action.commandHint ? [`Command hint: ${args.action.commandHint}`] : []),
    ...(args.action.routeSuggestion
      ? [`Route suggestion: ${args.action.routeSuggestion}`]
      : []),
    ...(args.action.commitStatement
      ? [`Commit statement: ${args.action.commitStatement}`]
      : []),
    ...(args.handoff.sessionId ? [`Session id: ${args.handoff.sessionId}`] : []),
    ...(args.handoff.scheduleId ? [`Schedule id: ${args.handoff.scheduleId}`] : []),
    ...(args.action.focusAreas.length > 0
      ? [`Focus areas: ${args.action.focusAreas.join(', ')}`]
      : []),
    ...(args.action.relevantFiles.length > 0
      ? [`Relevant files: ${args.action.relevantFiles.join(', ')}`]
      : []),
    '',
    'Constraints:',
    '- stay inside the assigned repository workspace',
    '- prefer code changes over generated artifact output',
    '- verify the workspace before finishing',
    '- do not push any branch',
  ]
  if (taskPreview) {
    lines.push('', 'Task brief:', taskPreview)
  }
  return lines.join('\n')
}

function normalizeRuntimeStatus(
  jobs: DiscordRoundtableTrackedJob[],
  lastError: string | null,
  currentStatus?: DiscordRoundtableRuntimeState['status'],
): DiscordRoundtableRuntimeState['status'] {
  if (lastError) {
    return 'error'
  }
  if (jobs.some(job => job.status === 'running')) {
    return 'running'
  }
  if (jobs.some(job => job.status === 'awaiting_approval')) {
    return 'awaiting_approval'
  }
  if (jobs.some(job => job.status === 'queued')) {
    return 'queued'
  }
  if (currentStatus === 'running') {
    return 'running'
  }
  return 'idle'
}

function countRoundtableJobs(
  jobs: DiscordRoundtableTrackedJob[],
): DiscordRoundtableJobCounts {
  return jobs.reduce<DiscordRoundtableJobCounts>(
    (counts, job) => {
      switch (job.status) {
        case 'queued':
          counts.queued += 1
          break
        case 'running':
          counts.running += 1
          break
        case 'awaiting_approval':
          counts.awaitingApproval += 1
          break
        case 'completed':
          counts.completed += 1
          break
        case 'rejected':
          counts.rejected += 1
          break
        case 'error':
          counts.error += 1
          break
        case 'skipped':
          counts.skipped += 1
          break
      }
      return counts
    },
    {
      queued: 0,
      running: 0,
      awaitingApproval: 0,
      completed: 0,
      rejected: 0,
      error: 0,
      skipped: 0,
    },
  )
}

function getHighlightedRoundtableJob(
  state: DiscordRoundtableRuntimeState,
): DiscordRoundtableTrackedJob | null {
  if (state.activeJobId) {
    const activeJob = state.jobs.find(job => job.id === state.activeJobId)
    if (activeJob) {
      return activeJob
    }
  }
  return [...state.jobs].reverse().find(job => job.status !== 'queued') ?? state.jobs.at(-1) ?? null
}

function formatHighlightedRoundtableJob(
  job: DiscordRoundtableTrackedJob | null,
): string | null {
  if (!job) {
    return null
  }
  const segments = [job.repoLabel, job.role, job.status]
  if (job.branchName) {
    segments.push(job.branchName)
  }
  return segments.join(' · ')
}

function formatRoundtablePendingSummary(
  job: Pick<
    DiscordRoundtableTrackedJob,
    'repoLabel' | 'role' | 'objective' | 'verificationSummary'
  >,
): string {
  const objective = job.objective.replace(/\s+/g, ' ').trim()
  const prefix = `${job.repoLabel} · ${job.role}`
  if (job.verificationSummary?.trim()) {
    return `${prefix} · ${objective} · ${job.verificationSummary.trim()}`
  }
  return `${prefix} · ${objective}`
}

function buildRoundtableTransitionReceipts(args: {
  previousJobs: DiscordRoundtableTrackedJob[]
  nextJobs: DiscordRoundtableTrackedJob[]
}): DiscordRoundtableTransitionReceipt[] {
  const previousById = new Map(args.previousJobs.map(job => [job.id, job]))
  const receipts: DiscordRoundtableTransitionReceipt[] = []
  for (const job of args.nextJobs) {
    const previous = previousById.get(job.id)
    const changed =
      !previous ||
      previous.status !== job.status ||
      previous.branchName !== job.branchName ||
      previous.receiptPath !== job.receiptPath ||
      previous.rejectionReason !== job.rejectionReason ||
      previous.commitSha !== job.commitSha
    if (!changed) {
      continue
    }
    receipts.push({
      jobId: job.id,
      repoLabel: job.repoLabel,
      role: job.role,
      objective: job.objective,
      status: job.status,
      branchName: job.branchName ?? null,
      commitSha: job.commitSha ?? null,
      verificationSummary: job.verificationSummary ?? null,
      receiptPath: job.receiptPath ?? null,
      rejectionReason: job.rejectionReason ?? null,
      summary: job.summary ?? null,
    })
  }
  return receipts
}

function formatRoundtableQueueJobLine(
  label: string,
  job: DiscordRoundtableTrackedJob,
): string {
  const segments = [label, job.id]
  if (job.branchName) {
    segments.push(job.branchName)
  }
  segments.push(job.summary ?? job.objective)
  if (job.receiptPath) {
    segments.push(`receipt ${job.receiptPath}`)
  }
  return segments.join(' · ')
}

function isAllowedTargetPath(targetPath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some(root => relativeWithinRoot(root, targetPath) !== null)
}

function createTrackedJob(args: {
  action: RawRoundtableAction
  handoff: RawRoundtableHandoff
  sourcePath: string
  allowedRoots: string[]
}): DiscordRoundtableTrackedJob | null {
  const targetPath = normalizeAbsolutePath(args.action.targetPath)
  if (!targetPath || !existsSync(targetPath)) {
    return null
  }
  if (!isAllowedTargetPath(targetPath, args.allowedRoots)) {
    return null
  }
  const roots = normalizeRootDescriptors(args.allowedRoots)
  const scope = resolveRoundtableExecutionScope({
    targetPath,
    repoId: args.action.repoId,
    roots,
    pathExists: existsSync,
  })
  const gitRoot = findGitRoot(scope.targetPath)
  if (
    !gitRoot ||
    !args.action.executionReady ||
    args.action.requiresManualCheckout ||
    !args.action.workspaceMaterialized ||
    !args.action.authorityBound
  ) {
    return null
  }
  const jobId = sanitizeSegment(
    args.action.decisionTraceId ??
      `${args.handoff.sessionId ?? 'session'}-${args.action.repoId}-${args.action.id}`,
  )
  return {
    kind: 'roundtable',
    id: jobId,
    branchName: '',
    worktreePath: scope.targetPath,
    workspacePath: scope.targetPath,
    changedFiles: [],
    summary: args.action.objective,
    status: 'queued',
    approvalState: null,
    workKey: scope.workKey,
    projectKey: scope.projectKey,
    sourcePath: args.sourcePath,
    sourceSessionId: args.handoff.sessionId,
    sourceScheduleId: args.handoff.scheduleId,
    handoffKey: args.handoff.handoffKey,
    repoId: args.action.repoId,
    repoLabel: args.action.repoLabel,
    role: args.action.role,
    objective: args.action.objective,
    rationale: args.action.rationale,
    commandHint: args.action.commandHint,
    targetPath: scope.targetPath,
    targetRootLabel: scope.rootLabel,
    receiptPath: null,
    outputDir: null,
    commitStatement: args.action.commitStatement,
    decisionTraceId: args.action.decisionTraceId,
    routeSuggestion: args.action.routeSuggestion,
    executionReady: args.action.executionReady,
    requiresManualCheckout: args.action.requiresManualCheckout,
    workspaceMaterialized: args.action.workspaceMaterialized,
    authorityBound: args.action.authorityBound,
    verificationSummary: null,
    commitSha: null,
    action: {
      id: jobId,
      title: args.action.objective,
      reason: args.action.rationale,
      targetPath: scope.targetPath,
      prompt: buildActionPrompt({
        action: args.action,
        handoff: args.handoff,
        targetPath: scope.targetPath,
      }),
      gitRoot,
    },
  }
}

export function ingestDiscordRoundtableHandoff(args: {
  state: DiscordRoundtableRuntimeState
  handoffPath: string
  allowedRoots: string[]
  roundtableChannelName?: string | null
  now?: Date
}): { state: DiscordRoundtableRuntimeState; ingestedCount: number } {
  const handoff = readRoundtableHandoff(args.handoffPath)
  const jobs = [...args.state.jobs]
  const knownIds = new Set(jobs.map(job => job.id))
  let ingestedCount = 0
  for (const action of handoff.actions) {
    const candidate = createTrackedJob({
      action,
      handoff,
      sourcePath: args.handoffPath,
      allowedRoots: args.allowedRoots,
    })
    if (!candidate || knownIds.has(candidate.id)) {
      continue
    }
    if (
      !shouldEnqueueDiscordExecutionJob({
        candidate: {
          workKey: candidate.workKey,
          projectKey: candidate.projectKey,
        },
        jobs,
        maxActiveJobs: Number.MAX_SAFE_INTEGER,
      })
    ) {
      continue
    }
    jobs.push(candidate)
    knownIds.add(candidate.id)
    ingestedCount += 1
  }
  const nextState: DiscordRoundtableRuntimeState = {
    ...args.state,
    updatedAt: (args.now ?? new Date()).toISOString(),
    roundtableChannelName:
      args.roundtableChannelName ?? args.state.roundtableChannelName ?? null,
    ingestedHandoffs: args.state.ingestedHandoffs.includes(args.handoffPath)
      ? args.state.ingestedHandoffs
      : [...args.state.ingestedHandoffs, args.handoffPath],
    jobs,
    lastSummary:
      ingestedCount > 0
        ? `Ingested ${ingestedCount} roundtable action${ingestedCount === 1 ? '' : 's'} from ${basename(args.handoffPath)}.`
        : args.state.lastSummary,
    lastError: null,
  }
  nextState.status = normalizeRuntimeStatus(
    nextState.jobs,
    nextState.lastError,
    nextState.status,
  )
  return { state: nextState, ingestedCount }
}

function loadOperatorState(path: string): StoredOperatorState {
  return readJsonFile<StoredOperatorState>(path) ?? { pendingPushes: [] }
}

function appendOperatorPendingPush(args: {
  path: string
  job: DiscordRoundtableTrackedJob
  execution: DiscordRoundtableExecutionResult
  requestedAt: string
}) {
  const state = loadOperatorState(args.path)
  const pendingPush: StoredOperatorPendingPush = {
    id: args.job.id,
    jobId: args.job.id,
    branchName: args.execution.runContext.branchName ?? '',
    worktreePath: args.execution.runContext.worktreePath ?? '',
    workspacePath: args.execution.runContext.workspacePath,
    changedFiles: args.execution.job.changedFiles,
    summary: formatRoundtablePendingSummary({
      repoLabel: args.job.repoLabel,
      role: args.job.role,
      objective: args.job.objective,
      verificationSummary: args.execution.job.verification.summary,
    }),
    verificationSummary: args.execution.job.verification.summary,
    commitSha: args.execution.job.commitSha ?? '',
    gitRoot: args.execution.gitRoot,
    baseWorkspace: args.job.targetPath,
    requestedByUserId: `roundtable:${args.job.role}`,
    requestedByChannelId: null,
    requestedAt: args.requestedAt,
    prompt: args.job.action.prompt ?? args.job.objective,
    verificationPassed: args.execution.job.verification.passed,
    outputDir: args.execution.outputDir,
    status: 'awaiting_approval',
    approvalState: 'pending',
  }
  state.pendingPushes = [
    ...(state.pendingPushes ?? []).filter(candidate => candidate.jobId !== pendingPush.jobId),
    pendingPush,
  ]
  writeJsonFile(args.path, state)
}

function pruneOperatorPendingPushes(args: {
  path: string
  jobs: DiscordRoundtableTrackedJob[]
}) {
  const state = loadOperatorState(args.path)
  const activeApprovalJobs = new Set(
    args.jobs
      .filter(
        job =>
          job.status === 'awaiting_approval' && job.approvalState === 'pending',
      )
      .map(job => job.id),
  )
  const nextPendingPushes = (state.pendingPushes ?? []).filter(push => {
    if (!push.requestedByUserId.startsWith('roundtable:')) {
      return true
    }
    return activeApprovalJobs.has(push.jobId)
  })
  if (nextPendingPushes.length === (state.pendingPushes ?? []).length) {
    return
  }
  writeJsonFile(args.path, {
    ...state,
    pendingPushes: nextPendingPushes,
  })
}

function holdbackReason(result: DiscordRoundtableExecutionResult): string {
  if (result.artifactOnly) {
    return 'artifact-only output'
  }
  if (result.hasDisallowedChanges) {
    return 'mixed code and artifact output'
  }
  if (!result.verificationPassed) {
    return result.job.verification.summary
  }
  if (!result.hasCodeChanges) {
    return 'no code changes detected'
  }
  return 'execution did not produce an approval-safe branch'
}

async function runQueuedJob(args: {
  state: DiscordRoundtableRuntimeState
  job: DiscordRoundtableTrackedJob
  options: DiscordRoundtableRuntimeOptions
  roots: DiscordRoundtableRootDescriptor[]
}): Promise<DiscordRoundtableRuntimeState> {
  const now = args.options.now?.() ?? new Date()
  const runningAt = now.toISOString()
  const leaseOwner = `roundtable-runtime:${process.pid}`
  const runningJobs = args.state.jobs.map(candidate =>
    candidate.id === args.job.id
      ? {
          ...candidate,
          status: 'running' as const,
          leaseClaimedAt: runningAt,
          leaseExpiresAt: new Date(
            now.getTime() + (args.options.timeoutMs ?? 12 * 60_000),
          ).toISOString(),
          leaseOwner,
          rejectionReason: null,
        }
      : candidate,
  )
  let state: DiscordRoundtableRuntimeState = {
    ...args.state,
    jobs: runningJobs,
    updatedAt: runningAt,
    activeJobId: args.job.id,
    lastSummary: `Executing ${args.job.repoLabel} roundtable action ${args.job.id}.`,
    lastError: null,
    status: 'running',
  }
  const executeAction = args.options.executeAction ?? executeDiscordRoundtableAction
  const execution = await executeAction({
    action: args.job.action,
    personaId: sanitizeSegment(args.job.role),
    personaName: args.job.role,
    roots: args.options.roots ?? args.roots,
    runnerScriptPath: args.options.runnerScriptPath,
    model: args.options.model,
    worktreeRoot: args.options.worktreeRoot,
    outputRoot: args.options.outputRoot,
    timeoutMs: args.options.timeoutMs ?? 12 * 60_000,
  })
  const completedAt = (args.options.now?.() ?? new Date()).toISOString()
  const nextJobs = state.jobs.map(candidate => {
    if (candidate.id !== args.job.id) {
      return candidate
    }
    const nextCandidate: DiscordRoundtableTrackedJob = {
      ...candidate,
      branchName: execution.runContext.branchName ?? candidate.branchName,
      worktreePath: execution.runContext.worktreePath ?? candidate.worktreePath,
      workspacePath: execution.runContext.workspacePath,
      changedFiles: execution.job.changedFiles,
      summary: formatRoundtablePendingSummary({
        repoLabel: candidate.repoLabel,
        role: candidate.role,
        objective: candidate.objective,
        verificationSummary: execution.job.verification.summary,
      }),
      verificationSummary: execution.job.verification.summary,
      commitSha: execution.job.commitSha,
      targetRootLabel: execution.targetRootLabel,
      receiptPath: execution.receiptPath,
      outputDir: execution.outputDir,
      completedAt,
      leaseExpiresAt: null,
      leaseOwner: null,
    }
    if (execution.mergeable && execution.job.commitSha) {
      nextCandidate.status = 'awaiting_approval'
      nextCandidate.approvalState = 'pending'
    } else if (
      execution.hasDisallowedChanges ||
      (execution.hasCodeChanges && !execution.verificationPassed)
    ) {
      nextCandidate.status = 'rejected'
      nextCandidate.approvalState = 'rejected'
      nextCandidate.rejectedAt = completedAt
      nextCandidate.rejectionReason = holdbackReason(execution)
    } else {
      nextCandidate.status = 'completed'
      nextCandidate.approvalState = null
    }
    return nextCandidate
  })
  if (
    execution.mergeable &&
    execution.job.commitSha &&
    execution.runContext.branchName &&
    execution.runContext.worktreePath
  ) {
    appendOperatorPendingPush({
      path:
        args.options.operatorStatePath ??
        getOpenJawsOperatorStatePath(args.options.root),
      job: args.job,
      execution,
      requestedAt: completedAt,
    })
  }
  state = {
    ...state,
    jobs: nextJobs,
    updatedAt: completedAt,
    activeJobId: null,
    lastError: null,
    lastSummary: execution.mergeable
      ? `${args.job.repoLabel} roundtable action ${args.job.id} is awaiting approval on ${execution.runContext.branchName}.`
      : `${args.job.repoLabel} roundtable action ${args.job.id} completed and was held back: ${holdbackReason(execution)}.`,
  }
  state.status = normalizeRuntimeStatus(state.jobs, state.lastError, state.status)
  return state
}

export async function processDiscordRoundtableRuntime(
  options: DiscordRoundtableRuntimeOptions,
): Promise<DiscordRoundtableProcessResult> {
  const runtimeRoot = options.root ?? process.cwd()
  mkdirSync(getDiscordRoundtableRuntimeDir(runtimeRoot), { recursive: true })
  mkdirSync(options.outputRoot, { recursive: true })
  mkdirSync(options.worktreeRoot, { recursive: true })
  const allowedRoots = Array.from(
    new Set(
      options.allowedRoots
        .map(root => normalizeAbsolutePath(root))
        .filter((root): root is string => Boolean(root && existsSync(root))),
    ),
  )
  const roots =
    options.roots && options.roots.length > 0
      ? options.roots
      : normalizeRootDescriptors(allowedRoots)
  const durationHours = resolveRoundtableDurationHours({
    rawValue:
      options.durationHours !== undefined ? `${options.durationHours}` : undefined,
    fallbackHours: DEFAULT_ROUNDTABLE_WINDOW_HOURS,
  })
  const approvalTtlHours =
    options.approvalTtlHours !== undefined
      ? resolveRoundtableApprovalTtlHours({
          durationHours,
          rawValue: `${options.approvalTtlHours}`,
        })
      : resolveRoundtableApprovalTtlHours({
          durationHours,
        })
  let state = loadDiscordRoundtableRuntimeState(runtimeRoot)
  let sessionState =
    loadDiscordRoundtableSessionState(runtimeRoot) ??
    createDiscordRoundtableSessionState({
      now: options.now?.() ?? new Date(),
      roundtableChannelName:
        options.roundtableChannelName ?? state.roundtableChannelName ?? null,
    })
  const previousJobs = state.jobs.map(job => ({ ...job }))
  state = {
    ...state,
    roundtableChannelName:
      options.roundtableChannelName ?? state.roundtableChannelName ?? null,
    jobs: reconcileDiscordExecutionJobs(state.jobs, {
      approvalTtlHours,
      nowMs: (options.now?.() ?? new Date()).getTime(),
    }) as DiscordRoundtableTrackedJob[],
  }
  pruneOperatorPendingPushes({
    path:
      options.operatorStatePath ??
      getOpenJawsOperatorStatePath(options.root ?? runtimeRoot),
    jobs: state.jobs,
  })

  let ingestedCount = 0
  const handoffPaths = new Set<string>()
  if (options.ingestInbox !== false) {
    for (const path of listDiscordRoundtableHandoffs(runtimeRoot)) {
      handoffPaths.add(path)
    }
  }
  for (const handoffPath of options.handoffPaths ?? []) {
    handoffPaths.add(stageDiscordRoundtableHandoff({ root: runtimeRoot, handoffPath }))
  }
  for (const handoffPath of handoffPaths) {
    if (state.ingestedHandoffs.includes(handoffPath)) {
      continue
    }
    const handoffNow = options.now?.() ?? new Date()
    try {
      const ingested = ingestDiscordRoundtableHandoff({
        state,
        handoffPath,
        allowedRoots,
        roundtableChannelName: options.roundtableChannelName,
        now: handoffNow,
      })
      state = ingested.state
      ingestedCount += ingested.ingestedCount
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const quarantinedPath = quarantineDiscordRoundtableHandoff({
        root: runtimeRoot,
        handoffPath,
        reason: message,
        now: handoffNow,
      })
      state = {
        ...state,
        updatedAt: handoffNow.toISOString(),
        roundtableChannelName:
          options.roundtableChannelName ?? state.roundtableChannelName ?? null,
        ingestedHandoffs: state.ingestedHandoffs.includes(handoffPath)
          ? state.ingestedHandoffs
          : [...state.ingestedHandoffs, handoffPath],
        lastSummary: `Quarantined malformed roundtable handoff ${basename(handoffPath)} -> ${basename(quarantinedPath)}.`,
        lastError: null,
      }
      state.status = normalizeRuntimeStatus(state.jobs, state.lastError, state.status)
    }
  }

  let executedCount = 0
  while (executedCount < Math.max(0, options.maxActionsPerRun ?? 1)) {
    const nextJob = getNextQueuedDiscordExecutionJob(
      state.jobs as DiscordExecutionTrackedJob[],
    ) as DiscordRoundtableTrackedJob | null
    if (!nextJob) {
      break
    }
    try {
      state = await runQueuedJob({
        state,
        job: nextJob,
        options: {
          ...options,
          root: runtimeRoot,
        },
        roots,
      })
      executedCount += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedAt = (options.now?.() ?? new Date()).toISOString()
      state = {
        ...state,
        updatedAt: failedAt,
        activeJobId: null,
        lastError: message,
        lastSummary: `Roundtable execution failed: ${message}`,
        jobs: state.jobs.map(job =>
          job.id === nextJob.id
            ? {
                ...job,
                status: 'error',
                approvalState: 'rejected',
                completedAt: failedAt,
                rejectedAt: failedAt,
                rejectionReason: message,
                leaseExpiresAt: null,
                leaseOwner: null,
              }
            : job,
        ),
      }
      state.status = normalizeRuntimeStatus(state.jobs, state.lastError, state.status)
      break
    }
  }

  state.updatedAt = (options.now?.() ?? new Date()).toISOString()
  state.status = normalizeRuntimeStatus(state.jobs, state.lastError, state.status)
  sessionState = {
    ...sessionState,
    updatedAt: state.updatedAt,
    status:
      sessionState.status === 'completed' && state.status === 'idle'
        ? 'completed'
        : state.status,
    roundtableChannelName:
      options.roundtableChannelName ??
      sessionState.roundtableChannelName ??
      state.roundtableChannelName ??
      null,
    lastSummary: state.lastSummary,
    lastError: state.lastError,
  }
  pruneOperatorPendingPushes({
    path:
      options.operatorStatePath ??
      getOpenJawsOperatorStatePath(options.root ?? runtimeRoot),
    jobs: state.jobs,
  })
  saveDiscordRoundtableRuntimeState({
    root: runtimeRoot,
    state,
  })
  saveDiscordRoundtableSessionState({
    root: runtimeRoot,
    state: sessionState,
  })
  return {
    state,
    ingestedCount,
    executedCount,
    queuedCount: state.jobs.filter(job => job.status === 'queued').length,
    awaitingApprovalCount: state.jobs.filter(job => job.status === 'awaiting_approval').length,
    durationHours,
    approvalTtlHours,
    transitionReceipts: buildRoundtableTransitionReceipts({
      previousJobs,
      nextJobs: state.jobs,
    }),
  }
}

export function buildDiscordRoundtableRuntimeStatusLines(
  state: DiscordRoundtableRuntimeState,
): string[] {
  const counts = countRoundtableJobs(state.jobs)
  const highlighted = formatHighlightedRoundtableJob(
    getHighlightedRoundtableJob(state),
  )
  const lines = [
    `Roundtable: ${state.status} · queued ${counts.queued} · running ${counts.running} · awaiting approval ${counts.awaitingApproval} · completed ${counts.completed} · rejected ${counts.rejected} · errors ${counts.error}`,
    `Channel: ${state.roundtableChannelName ? `#${state.roundtableChannelName}` : 'unassigned'}`,
    `Active job: ${state.activeJobId ?? 'none'}`,
  ]
  if (highlighted) {
    lines.push(`Latest action: ${highlighted}`)
  }
  if (state.lastSummary) {
    lines.push(`Last summary: ${state.lastSummary}`)
  }
  if (state.lastError) {
    lines.push(`Last error: ${state.lastError}`)
  }
  for (const job of state.jobs.filter(job => job.status === 'awaiting_approval').slice(0, 3)) {
    lines.push(formatRoundtableQueueJobLine('Awaiting approval', job))
  }
  for (const job of state.jobs.filter(job => job.status === 'queued').slice(0, 2)) {
    lines.push(formatRoundtableQueueJobLine('Queued', job))
  }
  return lines
}

export function formatDiscordRoundtableRuntimeStatus(
  state: DiscordRoundtableRuntimeState,
): string {
  return buildDiscordRoundtableRuntimeStatusLines(state).join('\n')
}

export function formatDiscordRoundtableRuntimeAnnouncement(
  result: DiscordRoundtableProcessResult,
): string {
  const highlighted = formatHighlightedRoundtableJob(
    getHighlightedRoundtableJob(result.state),
  )
  const lines = [
    `Roundtable update: ingested ${result.ingestedCount}, executed ${result.executedCount}, queued ${result.queuedCount}, awaiting approval ${result.awaitingApprovalCount}.`,
  ]
  if (highlighted) {
    lines.push(`Latest action: ${highlighted}`)
  }
  if (result.state.lastSummary) {
    lines.push(`Summary: ${result.state.lastSummary}`)
  }
  lines.push('Use `@Q operator roundtable-status` for the current queue and approval state.')
  return lines.join('\n')
}

export function formatDiscordRoundtableTransitionReceipt(
  receipt: DiscordRoundtableTransitionReceipt,
): string {
  const lines = [
    `Roundtable receipt: ${receipt.status.replace(/_/g, ' ')}`,
    `Repo: ${receipt.repoLabel} · ${receipt.role}`,
    `Job: ${receipt.jobId}`,
    `Objective: ${receipt.objective}`,
  ]
  if (receipt.branchName) {
    lines.push(`Branch: ${receipt.branchName}`)
  }
  if (receipt.commitSha) {
    lines.push(`Commit: ${receipt.commitSha}`)
  }
  if (receipt.verificationSummary) {
    lines.push(`Tests: ${receipt.verificationSummary}`)
  }
  if (receipt.receiptPath) {
    lines.push(`Receipt: ${receipt.receiptPath}`)
  }
  if (receipt.status === 'awaiting_approval' && receipt.branchName) {
    lines.push(`Confirm: @Q operator confirm-push ${receipt.branchName}`)
  } else if (receipt.rejectionReason) {
    lines.push(`Reason: ${receipt.rejectionReason}`)
  } else if (receipt.summary) {
    lines.push(`Summary: ${receipt.summary}`)
  }
  return lines.join('\n')
}
