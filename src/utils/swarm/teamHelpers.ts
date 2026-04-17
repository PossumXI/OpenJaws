import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod/v4'
import { getProjectRoot, getSessionCreatedTeams } from '../../bootstrap/state.js'
import { getTeamMemPath, isTeamMemoryEnabled } from '../../memdir/teamMemPaths.js'
import { logForDebugging } from '../debug.js'
import { getTeamsDir } from '../envUtils.js'
import { errorMessage, getErrnoCode } from '../errors.js'
import { execFileNoThrowWithCwd } from '../execFileNoThrow.js'
import { gitExe } from '../git.js'
import { getImmaculateHarnessConfig } from '../immaculateHarness.js'
import { lazySchema } from '../lazySchema.js'
import { resolveOciQRuntime } from '../ociQRuntime.js'
import type { PermissionMode } from '../permissions/PermissionMode.js'
import { jsonParse, jsonStringify } from '../slowOperations.js'
import { getTasksDir, notifyTasksUpdated } from '../tasks.js'
import { getAgentName, getTeamName, isTeammate } from '../teammate.js'
import { type BackendType, isPaneBackend } from './backends/types.js'
import { TEAM_LEAD_NAME } from './constants.js'

export const inputSchema = lazySchema(() =>
  z.strictObject({
    operation: z
      .enum(['spawnTeam', 'cleanup'])
      .describe(
        'Operation: spawnTeam to create a team, cleanup to remove team and task directories.',
      ),
    agent_type: z
      .string()
      .optional()
      .describe(
        'Type/role of the team lead (e.g., "researcher", "test-runner"). ' +
          'Used for team file and inter-agent coordination.',
      ),
    team_name: z
      .string()
      .optional()
      .describe('Name for the new team to create (required for spawnTeam).'),
    description: z
      .string()
      .optional()
      .describe('Team description/purpose (only used with spawnTeam).'),
  }),
)

// Output types for different operations
export type SpawnTeamOutput = {
  team_name: string
  team_file_path: string
  lead_agent_id: string
}

export type CleanupOutput = {
  success: boolean
  message: string
  team_name?: string
}

export type TeamAllowedPath = {
  path: string // Directory path (absolute)
  toolName: string // The tool this applies to (e.g., "Edit", "Write")
  addedBy: string // Agent name who added this rule
  addedAt: number // Timestamp when added
}

export type TeamTerminalContext = {
  terminalContextId: string
  agentId: string
  agentName: string
  sessionId?: string
  parentSessionId?: string
  cwd: string
  projectRoot: string
  model?: string
  provider?: string
  backendType?: BackendType | 'leader'
  tmuxPaneId?: string
  qBaseUrl?: string | null
  immaculateHarnessUrl?: string | null
  teamMemoryPath?: string | null
  activePhaseId?: string
  createdAt: number
  updatedAt: number
}

export type TeamPhaseDeliveryKind = 'request' | 'handoff' | 'deliverable'

export type TeamPhaseDelivery = {
  kind: TeamPhaseDeliveryKind
  timestamp: string
  fromAgentId: string
  fromAgentName: string
  toAgentIds: string[]
  toAgentNames: string[]
  summary: string
}

export type TeamPhaseReceipt = {
  phaseId: string
  label: string
  status: 'active' | 'delivered'
  createdAt: number
  updatedAt: number
  sourceAgentId: string
  sourceAgentName: string
  sourceTerminalContextId?: string
  targetAgentIds: string[]
  targetAgentNames: string[]
  targetTerminalContextIds: string[]
  collaboratorAgentIds: string[]
  projectRoots: string[]
  requestSummary: string
  lastDeliverableSummary?: string
  lastDeliveredAt?: number
  deliveries: TeamPhaseDelivery[]
}

export type TeamFile = {
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string // Actual session UUID of the leader (for discovery)
  leadTerminalContextId?: string
  hiddenPaneIds?: string[] // Pane IDs that are currently hidden from the UI
  teamAllowedPaths?: TeamAllowedPath[] // Paths all teammates can edit without asking
  terminalContexts?: TeamTerminalContext[]
  phaseReceipts?: TeamPhaseReceipt[]
  members: Array<{
    agentId: string
    name: string
    agentType?: string
    model?: string
    prompt?: string
    color?: string
    planModeRequired?: boolean
    joinedAt: number
    tmuxPaneId: string
    cwd: string
    worktreePath?: string
    sessionId?: string
    terminalContextId?: string
    subscriptions: string[]
    backendType?: BackendType
    isActive?: boolean // false when idle, undefined/true when active
    mode?: PermissionMode // Current permission mode for this teammate
  }>
}

type TeamFileCacheEntry = {
  mtimeMs: number
  sizeBytes: number
  teamFile: TeamFile
}

type TeamFileIndex = {
  terminalContextsById: Map<string, TeamTerminalContext>
  latestTerminalContextByAgentId: Map<string, TeamTerminalContext>
  activeTerminalContexts: TeamTerminalContext[]
  phaseReceiptsByRecency: TeamPhaseReceipt[]
  phaseReceiptsById: Map<string, TeamPhaseReceipt>
  phaseReceiptsBySourceAgentId: Map<string, TeamPhaseReceipt[]>
  phaseReceiptsByTargetAgentId: Map<string, TeamPhaseReceipt[]>
  phaseReceiptsByRelatedAgentId: Map<string, TeamPhaseReceipt[]>
}

const TEAM_FILE_CACHE = new Map<string, TeamFileCacheEntry>()
const TEAM_FILE_INDEX_CACHE = new WeakMap<TeamFile, TeamFileIndex>()
const TEAM_FILE_SHARED_INSTANCES = new WeakSet<TeamFile>()

type TeamFileReadMode = 'clone' | 'shared'

function cloneTeamFile<T extends TeamFile>(teamFile: T): T {
  return structuredClone(teamFile)
}

function rememberCachedTeamFile(
  teamName: string,
  teamFile: TeamFile,
  mtimeMs: number,
  sizeBytes: number,
  options?: {
    preserveInput?: boolean
  },
): TeamFile {
  const cachedTeamFile = options?.preserveInput ? teamFile : cloneTeamFile(teamFile)
  TEAM_FILE_SHARED_INSTANCES.add(cachedTeamFile)
  TEAM_FILE_CACHE.set(teamName, {
    mtimeMs,
    sizeBytes,
    teamFile: cachedTeamFile,
  })
  return cachedTeamFile
}

function clearCachedTeamFile(teamName: string): void {
  TEAM_FILE_CACHE.delete(teamName)
}

function invalidateTeamFileIndex(teamFile: TeamFile): void {
  TEAM_FILE_INDEX_CACHE.delete(teamFile)
}

function pushReceiptToAgentIndex(
  map: Map<string, TeamPhaseReceipt[]>,
  agentId: string,
  receipt: TeamPhaseReceipt,
): void {
  const existing = map.get(agentId)
  if (!existing) {
    map.set(agentId, [receipt])
    return
  }
  if (!existing.includes(receipt)) {
    existing.push(receipt)
  }
}

function getTeamFileIndex(teamFile: TeamFile): TeamFileIndex {
  const cached = TEAM_FILE_INDEX_CACHE.get(teamFile)
  if (cached) {
    return cached
  }

  const activeAgentIds = new Set(teamFile.members.map(member => member.agentId))
  const terminalContextsById = new Map<string, TeamTerminalContext>()
  const latestTerminalContextByAgentId = new Map<string, TeamTerminalContext>()
  const activeTerminalContexts: TeamTerminalContext[] = []
  for (const context of teamFile.terminalContexts ?? []) {
    terminalContextsById.set(context.terminalContextId, context)
    const current = latestTerminalContextByAgentId.get(context.agentId)
    if (!current || context.updatedAt > current.updatedAt) {
      latestTerminalContextByAgentId.set(context.agentId, context)
    }
    if (activeAgentIds.has(context.agentId)) {
      activeTerminalContexts.push(context)
    }
  }

  const phaseReceiptsById = new Map<string, TeamPhaseReceipt>()
  const phaseReceiptsBySourceAgentId = new Map<string, TeamPhaseReceipt[]>()
  const phaseReceiptsByTargetAgentId = new Map<string, TeamPhaseReceipt[]>()
  const phaseReceiptsByRelatedAgentId = new Map<string, TeamPhaseReceipt[]>()
  const phaseReceiptsByRecency = [...(teamFile.phaseReceipts ?? [])].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )

  for (const receipt of phaseReceiptsByRecency) {
    phaseReceiptsById.set(receipt.phaseId, receipt)
    pushReceiptToAgentIndex(
      phaseReceiptsBySourceAgentId,
      receipt.sourceAgentId,
      receipt,
    )
    pushReceiptToAgentIndex(
      phaseReceiptsByRelatedAgentId,
      receipt.sourceAgentId,
      receipt,
    )
    for (const agentId of receipt.targetAgentIds) {
      pushReceiptToAgentIndex(phaseReceiptsByTargetAgentId, agentId, receipt)
      pushReceiptToAgentIndex(phaseReceiptsByRelatedAgentId, agentId, receipt)
    }
    for (const agentId of receipt.collaboratorAgentIds) {
      pushReceiptToAgentIndex(phaseReceiptsByRelatedAgentId, agentId, receipt)
    }
  }

  const index: TeamFileIndex = {
    terminalContextsById,
    latestTerminalContextByAgentId,
    activeTerminalContexts,
    phaseReceiptsByRecency,
    phaseReceiptsById,
    phaseReceiptsBySourceAgentId,
    phaseReceiptsByTargetAgentId,
    phaseReceiptsByRelatedAgentId,
  }
  TEAM_FILE_INDEX_CACHE.set(teamFile, index)
  return index
}

export function getActiveTeamTerminalContexts(
  teamFile: TeamFile,
): TeamTerminalContext[] {
  return getTeamFileIndex(teamFile).activeTerminalContexts
}

export function getTeamPhaseReceiptsByRecency(
  teamFile: TeamFile,
): TeamPhaseReceipt[] {
  return getTeamFileIndex(teamFile).phaseReceiptsByRecency
}

function inferTerminalProvider(model?: string): string | undefined {
  const normalized = model?.trim().toLowerCase()
  if (!normalized) {
    return resolveOciQRuntime().ready ? 'oci' : undefined
  }
  if (normalized.startsWith('oci:')) {
    return 'oci'
  }
  if (normalized.startsWith('ollama:')) {
    return 'ollama'
  }
  if (normalized.startsWith('openai:')) {
    return 'openai'
  }
  if (normalized.startsWith('groq:')) {
    return 'groq'
  }
  if (normalized.startsWith('gemini:')) {
    return 'gemini'
  }
  if (normalized === 'q' && resolveOciQRuntime().ready) {
    return 'oci'
  }
  return undefined
}

export function createTeamTerminalContext(args: {
  agentId: string
  agentName: string
  sessionId?: string
  parentSessionId?: string
  cwd: string
  projectRoot?: string
  model?: string
  provider?: string
  backendType?: BackendType | 'leader'
  tmuxPaneId?: string
}): TeamTerminalContext {
  const runtime = resolveOciQRuntime()
  const immaculate = getImmaculateHarnessConfig()
  const provider = args.provider ?? inferTerminalProvider(args.model)
  const createdAt = Date.now()
  return {
    terminalContextId: `term-${randomUUID().slice(0, 8)}`,
    agentId: args.agentId,
    agentName: args.agentName,
    sessionId: args.sessionId,
    parentSessionId: args.parentSessionId,
    cwd: args.cwd,
    projectRoot: args.projectRoot ?? getProjectRoot(),
    model: args.model,
    provider,
    backendType: args.backendType,
    tmuxPaneId: args.tmuxPaneId,
    qBaseUrl: provider === 'oci' && runtime.ready ? runtime.baseURL : null,
    immaculateHarnessUrl: immaculate.enabled ? immaculate.harnessUrl : null,
    teamMemoryPath: isTeamMemoryEnabled() ? getTeamMemPath() : null,
    createdAt,
    updatedAt: createdAt,
  }
}

export function upsertTeamTerminalContext(
  teamFile: TeamFile,
  entry: TeamTerminalContext,
): TeamFile {
  invalidateTeamFileIndex(teamFile)
  const entries = [...(teamFile.terminalContexts ?? [])]
  const existingIndex = entries.findIndex(
    context =>
      context.terminalContextId === entry.terminalContextId ||
      (context.agentId === entry.agentId &&
        (context.tmuxPaneId ?? '') === (entry.tmuxPaneId ?? '') &&
        context.cwd === entry.cwd),
  )
  if (existingIndex >= 0) {
    entries[existingIndex] = {
      ...entries[existingIndex],
      ...entry,
      terminalContextId: entries[existingIndex]!.terminalContextId,
      createdAt: entries[existingIndex]!.createdAt,
      updatedAt: Date.now(),
    }
  } else {
    entries.push(entry)
  }
  teamFile.terminalContexts = entries
  return teamFile
}

export function getTeamTerminalRegistryPath(teamName: string): string | null {
  if (!isTeamMemoryEnabled()) {
    return null
  }
  return join(getTeamMemPath(), `${sanitizeName(teamName)}-TERMINALS.md`)
}

export function getTeamPhaseRegistryPath(teamName: string): string | null {
  if (!isTeamMemoryEnabled()) {
    return null
  }
  return join(getTeamMemPath(), `${sanitizeName(teamName)}-PHASES.md`)
}

function summarizeTeamPhaseText(text: string, maxLength = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

function uniqStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(value => value?.trim()).filter(Boolean) as string[])]
}

function getMemberByAgentId(teamFile: TeamFile, agentId: string) {
  return teamFile.members.find(member => member.agentId === agentId)
}

function getMemberByName(teamFile: TeamFile, name: string) {
  return teamFile.members.find(member => member.name === name)
}

export function getLatestTerminalContextForAgent(
  teamFile: TeamFile,
  agentId: string,
  terminalContextId?: string,
): TeamTerminalContext | null {
  if (!teamFile.terminalContexts || teamFile.terminalContexts.length === 0) {
    return null
  }

  const index = getTeamFileIndex(teamFile)
  if (terminalContextId) {
    const exactMatch = index.terminalContextsById.get(terminalContextId)
    if (exactMatch) {
      return exactMatch
    }
  }

  return index.latestTerminalContextByAgentId.get(agentId) ?? null
}

function getRequestedTerminalContextIdForAgent(
  teamFile: TeamFile,
  agentId: string,
  requestedTerminalContextIds?: string[],
): string | undefined {
  if (!requestedTerminalContextIds || requestedTerminalContextIds.length === 0) {
    return undefined
  }
  const index = getTeamFileIndex(teamFile)
  for (const terminalContextId of requestedTerminalContextIds) {
    const context = index.terminalContextsById.get(terminalContextId)
    if (context?.agentId === agentId) {
      return terminalContextId
    }
  }
  return undefined
}

export function getActiveTeamPhaseId(
  teamFile: TeamFile,
  agentId: string,
  terminalContextId?: string | null,
): string | null {
  const context = getLatestTerminalContextForAgent(
    teamFile,
    agentId,
    terminalContextId ?? undefined,
  )
  if (!context?.activePhaseId) {
    return null
  }
  if (!getTeamPhaseReceiptById(teamFile, context.activePhaseId)) {
    delete context.activePhaseId
    return null
  }
  return context.activePhaseId
}

export function getActiveTeamPhaseReceiptForAgent(
  teamFile: TeamFile,
  agentId: string,
  terminalContextId?: string | null,
): TeamPhaseReceipt | null {
  const phaseId = getActiveTeamPhaseId(teamFile, agentId, terminalContextId)
  if (!phaseId) {
    return null
  }
  return getTeamPhaseReceiptById(teamFile, phaseId)
}

export function setActiveTeamPhaseId(
  teamFile: TeamFile,
  args: {
    agentId: string
    terminalContextId?: string | null
    phaseId?: string | null
  },
): TeamTerminalContext | null {
  const context = getLatestTerminalContextForAgent(
    teamFile,
    args.agentId,
    args.terminalContextId ?? undefined,
  )
  if (!context) {
    return null
  }
  if (args.phaseId) {
    const receipt = getTeamPhaseReceiptById(teamFile, args.phaseId)
    if (!receipt) {
      return null
    }
    invalidateTeamFileIndex(teamFile)
    context.activePhaseId = receipt.phaseId
  } else {
    invalidateTeamFileIndex(teamFile)
    delete context.activePhaseId
  }
  context.updatedAt = Date.now()
  return context
}

function pinTeamPhaseForAgents(
  teamFile: TeamFile,
  phaseId: string,
  participants: Array<{
    agentId: string
    terminalContextId?: string | null
  }>,
): void {
  for (const participant of participants) {
    setActiveTeamPhaseId(teamFile, {
      agentId: participant.agentId,
      terminalContextId: participant.terminalContextId,
      phaseId,
    })
  }
}

function createPhaseDelivery(args: {
  kind: TeamPhaseDeliveryKind
  fromAgentId: string
  fromAgentName: string
  toAgentIds: string[]
  toAgentNames: string[]
  summary: string
  timestamp?: string
}): TeamPhaseDelivery {
  return {
    kind: args.kind,
    timestamp: args.timestamp ?? new Date().toISOString(),
    fromAgentId: args.fromAgentId,
    fromAgentName: args.fromAgentName,
    toAgentIds: [...args.toAgentIds],
    toAgentNames: [...args.toAgentNames],
    summary: summarizeTeamPhaseText(args.summary),
  }
}

export function buildTeamTerminalMemoryMarkdown(teamFile: TeamFile): string {
  const contexts = getActiveTeamTerminalContexts(teamFile)
  const lines = [
    `# Agent Co-Work Terminal Registry: ${teamFile.name}`,
    '',
    'This shared registry links active OpenJaws terminals for the current team so agents can reuse context instead of rediscovering the same runtime, cloud paths, and workspace relationships.',
    '',
    '- Treat these terminal context IDs as the handoff map for related project work on the same machine and under the same owner.',
    '- Reuse existing OCI, Immaculate, workspace, and model context when a sibling terminal already has it.',
    '- Never write secrets into this file. Reference paths and runtime facts only.',
    '',
    `Updated: ${new Date().toISOString()}`,
  ]

  if (contexts.length === 0) {
    lines.push('', 'No active terminal contexts are registered yet.')
    return lines.join('\n')
  }

  for (const context of contexts) {
    lines.push(
      '',
      `## ${context.agentName}`,
      `- terminal_context_id: \`${context.terminalContextId}\``,
      `- agent_id: \`${context.agentId}\``,
      ...(context.sessionId ? [`- session_id: \`${context.sessionId}\``] : []),
      ...(context.parentSessionId
        ? [`- parent_session_id: \`${context.parentSessionId}\``]
        : []),
      `- cwd: \`${context.cwd}\``,
      `- project_root: \`${context.projectRoot}\``,
      ...(context.model ? [`- model: \`${context.model}\``] : []),
      ...(context.provider ? [`- provider: \`${context.provider}\``] : []),
      ...(context.backendType ? [`- backend: \`${context.backendType}\``] : []),
      ...(context.tmuxPaneId ? [`- pane: \`${context.tmuxPaneId}\``] : []),
      ...(context.qBaseUrl ? [`- q_base_url: \`${context.qBaseUrl}\``] : []),
      ...(context.immaculateHarnessUrl
        ? [`- immaculate_harness_url: \`${context.immaculateHarnessUrl}\``]
        : []),
      ...(context.teamMemoryPath
        ? [`- team_memory_path: \`${context.teamMemoryPath}\``]
        : []),
      ...(context.activePhaseId
        ? [`- active_phase_id: \`${context.activePhaseId}\``]
        : []),
    )
  }

  return lines.join('\n')
}

export function recordTeamPhaseRequest(
  teamFile: TeamFile,
  args: {
    sourceAgentId: string
    targetAgentIds: string[]
    requestSummary: string
    label?: string
    sourceTerminalContextId?: string
    targetTerminalContextIds?: string[]
    projectRoots?: string[]
  },
): TeamPhaseReceipt {
  const createdAt = Date.now()
  const sourceMember = getMemberByAgentId(teamFile, args.sourceAgentId)
  const sourceContext = getLatestTerminalContextForAgent(
    teamFile,
    args.sourceAgentId,
    args.sourceTerminalContextId,
  )
  const targetMembers = args.targetAgentIds
    .map(agentId => getMemberByAgentId(teamFile, agentId))
    .filter(Boolean)
  const targetContexts = args.targetAgentIds
    .map(agentId =>
      getLatestTerminalContextForAgent(
        teamFile,
        agentId,
        getRequestedTerminalContextIdForAgent(
          teamFile,
          agentId,
          args.targetTerminalContextIds,
        ),
      ),
    )
    .filter(Boolean)

  const sourceAgentName = sourceMember?.name ?? args.sourceAgentId
  const targetAgentNames =
    targetMembers.length > 0
      ? targetMembers.map(member => member!.name)
      : [...args.targetAgentIds]
  const requestSummary = summarizeTeamPhaseText(args.requestSummary)

  const receipt: TeamPhaseReceipt = {
    phaseId: `phase-${randomUUID().slice(0, 8)}`,
    label: args.label ?? `${sourceAgentName} -> ${targetAgentNames.join(', ')}`,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    sourceAgentId: args.sourceAgentId,
    sourceAgentName,
    sourceTerminalContextId:
      args.sourceTerminalContextId ?? sourceContext?.terminalContextId,
    targetAgentIds: [...args.targetAgentIds],
    targetAgentNames,
    targetTerminalContextIds: uniqStrings([
      ...(args.targetTerminalContextIds ?? []),
      ...targetContexts.map(context => context?.terminalContextId),
    ]),
    collaboratorAgentIds: [],
    projectRoots: uniqStrings([
      ...(args.projectRoots ?? []),
      sourceContext?.projectRoot,
      ...targetContexts.map(context => context?.projectRoot),
    ]),
    requestSummary,
    deliveries: [
      createPhaseDelivery({
        kind: 'request',
        fromAgentId: args.sourceAgentId,
        fromAgentName: sourceAgentName,
        toAgentIds: args.targetAgentIds,
        toAgentNames: targetAgentNames,
        summary: requestSummary,
        timestamp: new Date(createdAt).toISOString(),
      }),
    ],
  }

  teamFile.phaseReceipts = [...(teamFile.phaseReceipts ?? []), receipt]
  invalidateTeamFileIndex(teamFile)
  return receipt
}

export function getTeamPhaseReceiptById(
  teamFile: TeamFile,
  phaseId: string,
): TeamPhaseReceipt | null {
  return getTeamFileIndex(teamFile).phaseReceiptsById.get(phaseId) ?? null
}

export function reuseTeamPhaseReceipt(
  teamFile: TeamFile,
  args: {
    phaseId: string
    fromAgentId: string
    toAgentIds: string[]
    summary: string
    kind: TeamPhaseDeliveryKind
    sourceTerminalContextId?: string
    targetTerminalContextIds?: string[]
    projectRoots?: string[]
  },
): TeamPhaseReceipt | null {
  const receipt = getTeamPhaseReceiptById(teamFile, args.phaseId)
  if (!receipt) {
    return null
  }

  const timestamp = Date.now()
  const fromMember = getMemberByAgentId(teamFile, args.fromAgentId)
  const fromContext = getLatestTerminalContextForAgent(
    teamFile,
    args.fromAgentId,
    args.sourceTerminalContextId,
  )
  const toMembers = args.toAgentIds
    .map(agentId => getMemberByAgentId(teamFile, agentId))
    .filter(Boolean)
  const toContexts = args.toAgentIds
    .map(agentId =>
      getLatestTerminalContextForAgent(
        teamFile,
        agentId,
        getRequestedTerminalContextIdForAgent(
          teamFile,
          agentId,
          args.targetTerminalContextIds,
        ),
      ),
    )
    .filter(Boolean)
  const summary = summarizeTeamPhaseText(args.summary)

  invalidateTeamFileIndex(teamFile)
  receipt.updatedAt = timestamp
  receipt.status = args.kind === 'deliverable' ? 'delivered' : 'active'
  receipt.sourceTerminalContextId ??=
    args.sourceTerminalContextId ?? fromContext?.terminalContextId
  receipt.targetAgentIds = uniqStrings([...receipt.targetAgentIds, ...args.toAgentIds])
  receipt.targetAgentNames = uniqStrings([
    ...receipt.targetAgentNames,
    ...toMembers.map(member => member!.name),
  ])
  receipt.targetTerminalContextIds = uniqStrings([
    ...receipt.targetTerminalContextIds,
    ...(args.targetTerminalContextIds ?? []),
    ...toContexts.map(context => context?.terminalContextId),
  ])
  receipt.collaboratorAgentIds = uniqStrings([
    ...receipt.collaboratorAgentIds,
    args.fromAgentId,
    ...args.toAgentIds,
  ]).filter(agentId => agentId !== receipt.sourceAgentId)
  receipt.projectRoots = uniqStrings([
    ...receipt.projectRoots,
    ...(args.projectRoots ?? []),
    fromContext?.projectRoot,
    ...toContexts.map(context => context?.projectRoot),
  ])
  receipt.deliveries.push(
    createPhaseDelivery({
      kind: args.kind,
      fromAgentId: args.fromAgentId,
      fromAgentName: fromMember?.name ?? args.fromAgentId,
      toAgentIds: args.toAgentIds,
      toAgentNames:
        toMembers.length > 0
          ? toMembers.map(member => member!.name)
          : [...args.toAgentIds],
      summary,
      timestamp: new Date(timestamp).toISOString(),
    }),
  )

  if (args.kind === 'deliverable') {
    receipt.lastDeliverableSummary = summary
    receipt.lastDeliveredAt = timestamp
  }

  return receipt
}

function findPhaseReceiptForAgent(
  teamFile: TeamFile,
  fromAgentId: string,
  toAgentIds: string[],
): TeamPhaseReceipt | null {
  const index = getTeamFileIndex(teamFile)
  const receipts = index.phaseReceiptsByTargetAgentId.get(fromAgentId) ?? []

  for (const receipt of receipts) {
    if (
      toAgentIds.length === 0 ||
      toAgentIds.includes(receipt.sourceAgentId) ||
      toAgentIds.some(agentId => receipt.targetAgentIds.includes(agentId))
    ) {
      return receipt
    }
  }

  for (const receipt of index.phaseReceiptsBySourceAgentId.get(fromAgentId) ??
    []) {
    if (toAgentIds.some(agentId => receipt.targetAgentIds.includes(agentId))) {
      return receipt
    }
  }

  return null
}

export function recordTeamPhaseDelivery(
  teamFile: TeamFile,
  args: {
    fromAgentId: string
    toAgentIds: string[]
    summary: string
    kind: TeamPhaseDeliveryKind
  },
): TeamPhaseReceipt | null {
  const receipt = findPhaseReceiptForAgent(
    teamFile,
    args.fromAgentId,
    args.toAgentIds,
  )
  if (!receipt) {
    return null
  }

  const timestamp = Date.now()
  const fromMember = getMemberByAgentId(teamFile, args.fromAgentId)
  const fromContext = getLatestTerminalContextForAgent(teamFile, args.fromAgentId)
  const toMembers = args.toAgentIds
    .map(agentId => getMemberByAgentId(teamFile, agentId))
    .filter(Boolean)
  const toContexts = args.toAgentIds
    .map(agentId => getLatestTerminalContextForAgent(teamFile, agentId))
    .filter(Boolean)
  const summary = summarizeTeamPhaseText(args.summary)

  invalidateTeamFileIndex(teamFile)
  receipt.updatedAt = timestamp
  receipt.collaboratorAgentIds = uniqStrings([
    ...receipt.collaboratorAgentIds,
    args.fromAgentId,
    ...args.toAgentIds,
  ]).filter(agentId => agentId !== receipt.sourceAgentId)
  receipt.projectRoots = uniqStrings([
    ...receipt.projectRoots,
    fromContext?.projectRoot,
    ...toContexts.map(context => context?.projectRoot),
  ])
  receipt.deliveries.push(
    createPhaseDelivery({
      kind: args.kind,
      fromAgentId: args.fromAgentId,
      fromAgentName: fromMember?.name ?? args.fromAgentId,
      toAgentIds: args.toAgentIds,
      toAgentNames:
        toMembers.length > 0
          ? toMembers.map(member => member!.name)
          : [...args.toAgentIds],
      summary,
      timestamp: new Date(timestamp).toISOString(),
    }),
  )

  if (args.kind === 'deliverable') {
    receipt.lastDeliverableSummary = summary
    receipt.lastDeliveredAt = timestamp
    if (args.toAgentIds.includes(receipt.sourceAgentId)) {
      receipt.status = 'delivered'
    }
  }

  return receipt
}

export function getLatestPhaseReceiptForAgent(
  teamFile: TeamFile,
  agentId: string,
): TeamPhaseReceipt | null {
  return getTeamFileIndex(teamFile).phaseReceiptsByRelatedAgentId.get(agentId)?.[0] ?? null
}

export async function recordMailboxPhaseMemory(
  teamName: string,
  args: {
    fromName: string
    toNames: string[]
    phaseId?: string
    summary?: string
    text: string
    sourceTerminalContextId?: string | null
  },
): Promise<void> {
  const normalizedFromName =
    args.fromName === 'user' ? TEAM_LEAD_NAME : args.fromName
  const teamFile = await readTeamFileSessionSnapshotAsync(teamName)
  if (!teamFile) {
    return
  }

  const sourceMember = getMemberByName(teamFile, normalizedFromName)
  const targetMembers = args.toNames
    .map(name => getMemberByName(teamFile, name))
    .filter(Boolean)
  if (!sourceMember || targetMembers.length === 0) {
    return
  }

  const summary = summarizeTeamPhaseText(args.summary ?? args.text)
  const sourceTerminalContextId =
    args.sourceTerminalContextId ?? sourceMember.terminalContextId ?? null
  const effectivePhaseId =
    args.phaseId ??
    getActiveTeamPhaseId(
      teamFile,
      sourceMember.agentId,
      sourceTerminalContextId,
    )
  let receipt: TeamPhaseReceipt | null = null

  if (effectivePhaseId) {
    receipt = reuseTeamPhaseReceipt(teamFile, {
      phaseId: effectivePhaseId,
      fromAgentId: sourceMember.agentId,
      toAgentIds: targetMembers.map(member => member!.agentId),
      summary,
      kind: targetMembers.some(member => member!.agentId === teamFile.leadAgentId)
        ? 'deliverable'
        : sourceMember.agentId === teamFile.leadAgentId
          ? 'request'
          : 'handoff',
      sourceTerminalContextId,
    })
  } else if (sourceMember.agentId === teamFile.leadAgentId) {
    receipt = recordTeamPhaseRequest(teamFile, {
      sourceAgentId: sourceMember.agentId,
      sourceTerminalContextId,
      targetAgentIds: targetMembers.map(member => member!.agentId),
      requestSummary: summary,
      label:
        targetMembers.length === 1
          ? `${targetMembers[0]!.name} assignment`
          : `Team handoff (${targetMembers.length})`,
    })
  } else {
    receipt = recordTeamPhaseDelivery(teamFile, {
      fromAgentId: sourceMember.agentId,
      toAgentIds: targetMembers.map(member => member!.agentId),
      summary,
      kind: targetMembers.some(member => member!.agentId === teamFile.leadAgentId)
        ? 'deliverable'
        : 'handoff',
    })
  }

  if (receipt) {
    pinTeamPhaseForAgents(teamFile, receipt.phaseId, [
      {
        agentId: sourceMember.agentId,
        terminalContextId: sourceTerminalContextId,
      },
      ...targetMembers.map(member => ({
        agentId: member!.agentId,
        terminalContextId: member!.terminalContextId ?? null,
      })),
    ])
  }

  await writeTeamFileAsync(teamName, teamFile)
}

export function buildTeamPhaseMemoryMarkdown(teamFile: TeamFile): string {
  const receipts = getTeamPhaseReceiptsByRecency(teamFile)
  const lines = [
    `# Agent Co-Work Phase Memory: ${teamFile.name}`,
    '',
    'This shared ledger preserves high-signal work phases so teammates can reuse what was asked, what was handed off, and what was delivered across active terminals and related projects.',
    '',
    '- Each phase starts with a request or assignment.',
    '- Deliverables and teammate handoffs append to that phase instead of starting from scratch.',
    '- Keep summaries concise and secret-free.',
    '',
    `Updated: ${new Date().toISOString()}`,
  ]

  if (receipts.length === 0) {
    lines.push('', 'No co-work phase receipts are registered yet.')
    return lines.join('\n')
  }

  for (const receipt of receipts.slice(0, 12)) {
    lines.push(
      '',
      `## ${receipt.label}`,
      `- phase_id: \`${receipt.phaseId}\``,
      `- status: \`${receipt.status}\``,
      `- request: ${receipt.requestSummary}`,
      ...(receipt.lastDeliverableSummary
        ? [`- last_deliverable: ${receipt.lastDeliverableSummary}`]
        : []),
      `- source: \`${receipt.sourceAgentName}\`${receipt.sourceTerminalContextId ? ` via \`${receipt.sourceTerminalContextId}\`` : ''}`,
      `- targets: ${receipt.targetAgentNames.map(name => `\`${name}\``).join(', ')}`,
      ...(receipt.projectRoots.length > 0
        ? [`- project_roots: ${receipt.projectRoots.map(path => `\`${path}\``).join(', ')}`]
        : []),
      ...(receipt.collaboratorAgentIds.length > 0
        ? [`- collaborators: ${receipt.collaboratorAgentIds.map(agentId => `\`${agentId}\``).join(', ')}`]
        : []),
      '- deliveries:',
      ...receipt.deliveries
        .slice(-4)
        .map(
          delivery =>
            `  - ${delivery.kind} · ${delivery.fromAgentName} -> ${delivery.toAgentNames.join(', ')} · ${delivery.summary}`,
        ),
    )
  }

  return lines.join('\n')
}

function syncTeamTerminalMemory(teamName: string, teamFile: TeamFile): void {
  if (!isTeamMemoryEnabled()) {
    return
  }
  const path = getTeamTerminalRegistryPath(teamName)
  if (!path) {
    return
  }
  mkdirSync(getTeamMemPath(), { recursive: true })
  writeFileSync(path, `${buildTeamTerminalMemoryMarkdown(teamFile)}\n`, 'utf8')
}

function syncTeamPhaseMemory(teamName: string, teamFile: TeamFile): void {
  if (!isTeamMemoryEnabled()) {
    return
  }
  const path = getTeamPhaseRegistryPath(teamName)
  if (!path) {
    return
  }
  mkdirSync(getTeamMemPath(), { recursive: true })
  writeFileSync(path, `${buildTeamPhaseMemoryMarkdown(teamFile)}\n`, 'utf8')
}

function removeTerminalContextsForMember(
  teamFile: TeamFile,
  identifier: { agentId?: string; tmuxPaneId?: string; name?: string },
): void {
  if (!teamFile.terminalContexts || teamFile.terminalContexts.length === 0) {
    return
  }
  invalidateTeamFileIndex(teamFile)
  teamFile.terminalContexts = teamFile.terminalContexts.filter(context => {
    if (identifier.agentId && context.agentId === identifier.agentId) {
      return false
    }
    if (
      identifier.tmuxPaneId &&
      context.tmuxPaneId &&
      context.tmuxPaneId === identifier.tmuxPaneId
    ) {
      return false
    }
    if (identifier.name && context.agentName === identifier.name) {
      return false
    }
    return true
  })
}

export type Input = z.infer<ReturnType<typeof inputSchema>>
// Export SpawnTeamOutput as Output for backward compatibility
export type Output = SpawnTeamOutput

/**
 * Sanitizes a name for use in tmux window names, worktree paths, and file paths.
 * Replaces all non-alphanumeric characters with hyphens and lowercases.
 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

/**
 * Sanitizes an agent name for use in deterministic agent IDs.
 * Replaces @ with - to prevent ambiguity in the agentName@teamName format.
 */
export function sanitizeAgentName(name: string): string {
  return name.replace(/@/g, '-')
}

/**
 * Gets the path to a team's directory
 */
export function getTeamDir(teamName: string): string {
  return join(getTeamsDir(), sanitizeName(teamName))
}

/**
 * Gets the path to a team's config.json file
 */
export function getTeamFilePath(teamName: string): string {
  return join(getTeamDir(teamName), 'config.json')
}

function getCachedTeamFile(
  teamName: string,
  currentMtimeMs: number,
  currentSizeBytes: number,
  mode: TeamFileReadMode,
): TeamFile | null {
  const cached = TEAM_FILE_CACHE.get(teamName)
  if (
    !cached ||
    cached.mtimeMs !== currentMtimeMs ||
    cached.sizeBytes !== currentSizeBytes
  ) {
    return null
  }
  return mode === 'shared' ? cached.teamFile : cloneTeamFile(cached.teamFile)
}

function cacheParsedTeamFile(
  teamName: string,
  content: string,
  mtimeMs: number,
  sizeBytes: number,
): TeamFile {
  return rememberCachedTeamFile(
    teamName,
    jsonParse(content) as TeamFile,
    mtimeMs,
    sizeBytes,
    {
      preserveInput: true,
    },
  )
}

function readTeamFileWithMode(
  teamName: string,
  mode: TeamFileReadMode,
): TeamFile | null {
  const teamFilePath = getTeamFilePath(teamName)
  try {
    const currentStat = statSync(teamFilePath)
    const cached = getCachedTeamFile(
      teamName,
      currentStat.mtimeMs,
      currentStat.size,
      mode,
    )
    if (cached) {
      return cached
    }
    const content = readFileSync(teamFilePath, 'utf-8')
    const teamFile = cacheParsedTeamFile(
      teamName,
      content,
      currentStat.mtimeMs,
      currentStat.size,
    )
    return mode === 'shared' ? teamFile : cloneTeamFile(teamFile)
  } catch (e) {
    if (getErrnoCode(e) === 'ENOENT') {
      clearCachedTeamFile(teamName)
      return null
    }
    logForDebugging(
      `[TeammateTool] Failed to read team file for ${teamName}: ${errorMessage(e)}`,
    )
    return null
  }
}

async function readTeamFileWithModeAsync(
  teamName: string,
  mode: TeamFileReadMode,
): Promise<TeamFile | null> {
  const teamFilePath = getTeamFilePath(teamName)
  try {
    const currentStat = await stat(teamFilePath)
    const cached = getCachedTeamFile(
      teamName,
      currentStat.mtimeMs,
      currentStat.size,
      mode,
    )
    if (cached) {
      return cached
    }
    const content = await readFile(teamFilePath, 'utf-8')
    const teamFile = cacheParsedTeamFile(
      teamName,
      content,
      currentStat.mtimeMs,
      currentStat.size,
    )
    return mode === 'shared' ? teamFile : cloneTeamFile(teamFile)
  } catch (e) {
    if (getErrnoCode(e) === 'ENOENT') {
      clearCachedTeamFile(teamName)
      return null
    }
    logForDebugging(
      `[TeammateTool] Failed to read team file for ${teamName}: ${errorMessage(e)}`,
    )
    return null
  }
}

/**
 * Reads a team file by name (sync — for sync contexts like React render paths)
 * @internal Exported for team discovery UI
 */
// sync IO: called from sync context
export function readTeamFile(teamName: string): TeamFile | null {
  return readTeamFileWithMode(teamName, 'clone')
}

/**
 * Reads the session-hot shared snapshot for read-only Agent Co-Work lookups.
 * Callers must not mutate the returned object.
 */
export function readTeamFileSessionSnapshot(teamName: string): TeamFile | null {
  return readTeamFileWithMode(teamName, 'shared')
}

/**
 * Reads a team file by name (async — for tool handlers and other async contexts)
 */
export async function readTeamFileAsync(
  teamName: string,
): Promise<TeamFile | null> {
  return readTeamFileWithModeAsync(teamName, 'clone')
}

/**
 * Reads the session-hot shared snapshot for read-only Agent Co-Work lookups.
 * Callers must not mutate the returned object.
 */
export async function readTeamFileSessionSnapshotAsync(
  teamName: string,
): Promise<TeamFile | null> {
  return readTeamFileWithModeAsync(teamName, 'shared')
}

/**
 * Writes a team file (sync — for sync contexts)
 */
// sync IO: called from sync context
function writeTeamFile(teamName: string, teamFile: TeamFile): void {
  const teamDir = getTeamDir(teamName)
  invalidateTeamFileIndex(teamFile)
  mkdirSync(teamDir, { recursive: true })
  const teamFilePath = getTeamFilePath(teamName)
  writeFileSync(teamFilePath, jsonStringify(teamFile, null, 2))
  const fileStat = statSync(teamFilePath)
  rememberCachedTeamFile(teamName, teamFile, fileStat.mtimeMs, fileStat.size, {
    preserveInput: TEAM_FILE_SHARED_INSTANCES.has(teamFile),
  })
  syncTeamTerminalMemory(teamName, teamFile)
  syncTeamPhaseMemory(teamName, teamFile)
}

/**
 * Writes a team file (async — for tool handlers)
 */
export async function writeTeamFileAsync(
  teamName: string,
  teamFile: TeamFile,
): Promise<void> {
  const teamDir = getTeamDir(teamName)
  invalidateTeamFileIndex(teamFile)
  await mkdir(teamDir, { recursive: true })
  const teamFilePath = getTeamFilePath(teamName)
  await writeFile(teamFilePath, jsonStringify(teamFile, null, 2))
  const fileStat = await stat(teamFilePath)
  rememberCachedTeamFile(teamName, teamFile, fileStat.mtimeMs, fileStat.size, {
    preserveInput: TEAM_FILE_SHARED_INSTANCES.has(teamFile),
  })
  syncTeamTerminalMemory(teamName, teamFile)
  syncTeamPhaseMemory(teamName, teamFile)
}

/**
 * Removes a teammate from the team file by agent ID or name.
 * Used by the leader when processing shutdown approvals.
 */
export function removeTeammateFromTeamFile(
  teamName: string,
  identifier: { agentId?: string; name?: string },
): boolean {
  const identifierStr = identifier.agentId || identifier.name
  if (!identifierStr) {
    logForDebugging(
      '[TeammateTool] removeTeammateFromTeamFile called with no identifier',
    )
    return false
  }

  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    logForDebugging(
      `[TeammateTool] Cannot remove teammate ${identifierStr}: failed to read team file for "${teamName}"`,
    )
    return false
  }

  const originalLength = teamFile.members.length
  teamFile.members = teamFile.members.filter(m => {
    if (identifier.agentId && m.agentId === identifier.agentId) return false
    if (identifier.name && m.name === identifier.name) return false
    return true
  })

  if (teamFile.members.length === originalLength) {
    logForDebugging(
      `[TeammateTool] Teammate ${identifierStr} not found in team file for "${teamName}"`,
    )
    return false
  }

  removeTerminalContextsForMember(teamFile, identifier)
  writeTeamFile(teamName, teamFile)
  logForDebugging(
    `[TeammateTool] Removed teammate from team file: ${identifierStr}`,
  )
  return true
}

/**
 * Adds a pane ID to the hidden panes list in the team file.
 * @param teamName - The name of the team
 * @param paneId - The pane ID to hide
 * @returns true if the pane was added to hidden list, false if team doesn't exist
 */
export function addHiddenPaneId(teamName: string, paneId: string): boolean {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    return false
  }

  const hiddenPaneIds = teamFile.hiddenPaneIds ?? []
  if (!hiddenPaneIds.includes(paneId)) {
    hiddenPaneIds.push(paneId)
    teamFile.hiddenPaneIds = hiddenPaneIds
    writeTeamFile(teamName, teamFile)
    logForDebugging(
      `[TeammateTool] Added ${paneId} to hidden panes for team ${teamName}`,
    )
  }
  return true
}

/**
 * Removes a pane ID from the hidden panes list in the team file.
 * @param teamName - The name of the team
 * @param paneId - The pane ID to show (remove from hidden list)
 * @returns true if the pane was removed from hidden list, false if team doesn't exist
 */
export function removeHiddenPaneId(teamName: string, paneId: string): boolean {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    return false
  }

  const hiddenPaneIds = teamFile.hiddenPaneIds ?? []
  const index = hiddenPaneIds.indexOf(paneId)
  if (index !== -1) {
    hiddenPaneIds.splice(index, 1)
    teamFile.hiddenPaneIds = hiddenPaneIds
    writeTeamFile(teamName, teamFile)
    logForDebugging(
      `[TeammateTool] Removed ${paneId} from hidden panes for team ${teamName}`,
    )
  }
  return true
}

/**
 * Removes a teammate from the team config file by pane ID.
 * Also removes from hiddenPaneIds if present.
 * @param teamName - The name of the team
 * @param tmuxPaneId - The pane ID of the teammate to remove
 * @returns true if the member was removed, false if team or member doesn't exist
 */
export function removeMemberFromTeam(
  teamName: string,
  tmuxPaneId: string,
): boolean {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    return false
  }

  const memberIndex = teamFile.members.findIndex(
    m => m.tmuxPaneId === tmuxPaneId,
  )
  if (memberIndex === -1) {
    return false
  }

  const removedMember = teamFile.members[memberIndex]

  // Remove from members array
  teamFile.members.splice(memberIndex, 1)

  // Also remove from hiddenPaneIds if present
  if (teamFile.hiddenPaneIds) {
    const hiddenIndex = teamFile.hiddenPaneIds.indexOf(tmuxPaneId)
    if (hiddenIndex !== -1) {
      teamFile.hiddenPaneIds.splice(hiddenIndex, 1)
    }
  }

  removeTerminalContextsForMember(teamFile, {
    agentId: removedMember?.agentId,
    tmuxPaneId,
    name: removedMember?.name,
  })
  writeTeamFile(teamName, teamFile)
  logForDebugging(
    `[TeammateTool] Removed member with pane ${tmuxPaneId} from team ${teamName}`,
  )
  return true
}

/**
 * Removes a teammate from a team's member list by agent ID.
 * Use this for in-process teammates which all share the same tmuxPaneId.
 * @param teamName - The name of the team
 * @param agentId - The agent ID of the teammate to remove (e.g., "researcher@my-team")
 * @returns true if the member was removed, false if team or member doesn't exist
 */
export function removeMemberByAgentId(
  teamName: string,
  agentId: string,
): boolean {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    return false
  }

  const memberIndex = teamFile.members.findIndex(m => m.agentId === agentId)
  if (memberIndex === -1) {
    return false
  }

  const removedMember = teamFile.members[memberIndex]

  // Remove from members array
  teamFile.members.splice(memberIndex, 1)

  removeTerminalContextsForMember(teamFile, {
    agentId,
    tmuxPaneId: removedMember?.tmuxPaneId,
    name: removedMember?.name,
  })
  writeTeamFile(teamName, teamFile)
  logForDebugging(
    `[TeammateTool] Removed member ${agentId} from team ${teamName}`,
  )
  return true
}

/**
 * Sets a team member's permission mode.
 * Called when the team leader changes a teammate's mode via the TeamsDialog.
 * @param teamName - The name of the team
 * @param memberName - The name of the member to update
 * @param mode - The new permission mode
 */
export function setMemberMode(
  teamName: string,
  memberName: string,
  mode: PermissionMode,
): boolean {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    return false
  }

  const member = teamFile.members.find(m => m.name === memberName)
  if (!member) {
    logForDebugging(
      `[TeammateTool] Cannot set member mode: member ${memberName} not found in team ${teamName}`,
    )
    return false
  }

  // Only write if the value is actually changing
  if (member.mode === mode) {
    return true
  }

  // Create updated members array immutably
  const updatedMembers = teamFile.members.map(m =>
    m.name === memberName ? { ...m, mode } : m,
  )
  writeTeamFile(teamName, { ...teamFile, members: updatedMembers })
  logForDebugging(
    `[TeammateTool] Set member ${memberName} in team ${teamName} to mode: ${mode}`,
  )
  return true
}

/**
 * Sync the current teammate's mode to config.json so team lead sees it.
 * No-op if not running as a teammate.
 * @param mode - The permission mode to sync
 * @param teamNameOverride - Optional team name override (uses env var if not provided)
 */
export function syncTeammateMode(
  mode: PermissionMode,
  teamNameOverride?: string,
): void {
  if (!isTeammate()) return
  const teamName = teamNameOverride ?? getTeamName()
  const agentName = getAgentName()
  if (teamName && agentName) {
    setMemberMode(teamName, agentName, mode)
  }
}

/**
 * Sets multiple team members' permission modes in a single atomic operation.
 * Avoids race conditions when updating multiple teammates at once.
 * @param teamName - The name of the team
 * @param modeUpdates - Array of {memberName, mode} to update
 */
export function setMultipleMemberModes(
  teamName: string,
  modeUpdates: Array<{ memberName: string; mode: PermissionMode }>,
): boolean {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    return false
  }

  // Build a map of updates for efficient lookup
  const updateMap = new Map(modeUpdates.map(u => [u.memberName, u.mode]))

  // Create updated members array immutably
  let anyChanged = false
  const updatedMembers = teamFile.members.map(member => {
    const newMode = updateMap.get(member.name)
    if (newMode !== undefined && member.mode !== newMode) {
      anyChanged = true
      return { ...member, mode: newMode }
    }
    return member
  })

  if (anyChanged) {
    writeTeamFile(teamName, { ...teamFile, members: updatedMembers })
    logForDebugging(
      `[TeammateTool] Set ${modeUpdates.length} member modes in team ${teamName}`,
    )
  }
  return true
}

/**
 * Sets a team member's active status.
 * Called when a teammate becomes idle (isActive=false) or starts a new turn (isActive=true).
 * @param teamName - The name of the team
 * @param memberName - The name of the member to update
 * @param isActive - Whether the member is active (true) or idle (false)
 */
export async function setMemberActive(
  teamName: string,
  memberName: string,
  isActive: boolean,
): Promise<void> {
  const teamFile = await readTeamFileAsync(teamName)
  if (!teamFile) {
    logForDebugging(
      `[TeammateTool] Cannot set member active: team ${teamName} not found`,
    )
    return
  }

  const member = teamFile.members.find(m => m.name === memberName)
  if (!member) {
    logForDebugging(
      `[TeammateTool] Cannot set member active: member ${memberName} not found in team ${teamName}`,
    )
    return
  }

  // Only write if the value is actually changing
  if (member.isActive === isActive) {
    return
  }

  member.isActive = isActive
  await writeTeamFileAsync(teamName, teamFile)
  logForDebugging(
    `[TeammateTool] Set member ${memberName} in team ${teamName} to ${isActive ? 'active' : 'idle'}`,
  )
}

/**
 * Destroys a git worktree at the given path.
 * First attempts to use `git worktree remove`, then falls back to rm -rf.
 * Safe to call on non-existent paths.
 */
async function destroyWorktree(worktreePath: string): Promise<void> {
  // Read the .git file in the worktree to find the main repo
  const gitFilePath = join(worktreePath, '.git')
  let mainRepoPath: string | null = null

  try {
    const gitFileContent = (await readFile(gitFilePath, 'utf-8')).trim()
    // The .git file contains something like: gitdir: /path/to/repo/.git/worktrees/worktree-name
    const match = gitFileContent.match(/^gitdir:\s*(.+)$/)
    if (match && match[1]) {
      // Extract the main repo .git directory (go up from .git/worktrees/name to .git)
      const worktreeGitDir = match[1]
      // Go up 2 levels from .git/worktrees/name to get to .git, then get parent for repo root
      const mainGitDir = join(worktreeGitDir, '..', '..')
      mainRepoPath = join(mainGitDir, '..')
    }
  } catch {
    // Ignore errors reading .git file (path doesn't exist, not a file, etc.)
  }

  // Try to remove using git worktree remove command
  if (mainRepoPath) {
    const result = await execFileNoThrowWithCwd(
      gitExe(),
      ['worktree', 'remove', '--force', worktreePath],
      { cwd: mainRepoPath },
    )

    if (result.code === 0) {
      logForDebugging(
        `[TeammateTool] Removed worktree via git: ${worktreePath}`,
      )
      return
    }

    // Check if the error is "not a working tree" (already removed)
    if (result.stderr?.includes('not a working tree')) {
      logForDebugging(
        `[TeammateTool] Worktree already removed: ${worktreePath}`,
      )
      return
    }

    logForDebugging(
      `[TeammateTool] git worktree remove failed, falling back to rm: ${result.stderr}`,
    )
  }

  // Fallback: manually remove the directory
  try {
    await rm(worktreePath, { recursive: true, force: true })
    logForDebugging(
      `[TeammateTool] Removed worktree directory manually: ${worktreePath}`,
    )
  } catch (error) {
    logForDebugging(
      `[TeammateTool] Failed to remove worktree ${worktreePath}: ${errorMessage(error)}`,
    )
  }
}

/**
 * Mark a team as created this session so it gets cleaned up on exit.
 * Call this right after the initial writeTeamFile. TeamDelete should
 * call unregisterTeamForSessionCleanup to prevent double-cleanup.
 * Backing Set lives in bootstrap/state.ts so resetStateForTests()
 * clears it between tests (avoids the PR #17615 cross-shard leak class).
 */
export function registerTeamForSessionCleanup(teamName: string): void {
  getSessionCreatedTeams().add(teamName)
}

/**
 * Remove a team from session cleanup tracking (e.g., after explicit
 * TeamDelete — already cleaned, don't try again on shutdown).
 */
export function unregisterTeamForSessionCleanup(teamName: string): void {
  getSessionCreatedTeams().delete(teamName)
}

/**
 * Clean up all teams created this session that weren't explicitly deleted.
 * Registered with gracefulShutdown from init.ts.
 */
export async function cleanupSessionTeams(): Promise<void> {
  const sessionCreatedTeams = getSessionCreatedTeams()
  if (sessionCreatedTeams.size === 0) return
  const teams = Array.from(sessionCreatedTeams)
  logForDebugging(
    `cleanupSessionTeams: removing ${teams.length} orphan team dir(s): ${teams.join(', ')}`,
  )
  // Kill panes first — on SIGINT the teammate processes are still running;
  // deleting directories alone would orphan them in open tmux/iTerm2 panes.
  // (TeamDeleteTool's path doesn't need this — by then teammates have
  // gracefully exited and useInboxPoller has already closed their panes.)
  await Promise.allSettled(teams.map(name => killOrphanedTeammatePanes(name)))
  await Promise.allSettled(teams.map(name => cleanupTeamDirectories(name)))
  sessionCreatedTeams.clear()
}

/**
 * Best-effort kill of all pane-backed teammate panes for a team.
 * Called from cleanupSessionTeams on ungraceful leader exit (SIGINT/SIGTERM).
 * Dynamic imports avoid adding registry/detection to this module's static
 * dep graph — this only runs at shutdown, so the import cost is irrelevant.
 */
async function killOrphanedTeammatePanes(teamName: string): Promise<void> {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) return

  const paneMembers = teamFile.members.filter(
    m =>
      m.name !== TEAM_LEAD_NAME &&
      m.tmuxPaneId &&
      m.backendType &&
      isPaneBackend(m.backendType),
  )
  if (paneMembers.length === 0) return

  const [{ ensureBackendsRegistered, getBackendByType }, { isInsideTmux }] =
    await Promise.all([
      import('./backends/registry.js'),
      import('./backends/detection.js'),
    ])
  await ensureBackendsRegistered()
  const useExternalSession = !(await isInsideTmux())

  await Promise.allSettled(
    paneMembers.map(async m => {
      // filter above guarantees these; narrow for the type system
      if (!m.tmuxPaneId || !m.backendType || !isPaneBackend(m.backendType)) {
        return
      }
      const ok = await getBackendByType(m.backendType).killPane(
        m.tmuxPaneId,
        useExternalSession,
      )
      logForDebugging(
        `cleanupSessionTeams: killPane ${m.name} (${m.backendType} ${m.tmuxPaneId}) → ${ok}`,
      )
    }),
  )
}

/**
 * Cleans up team and task directories for a given team name.
 * Also cleans up git worktrees created for teammates.
 * Called when a swarm session is terminated.
 */
export async function cleanupTeamDirectories(teamName: string): Promise<void> {
  const sanitizedName = sanitizeName(teamName)

  // Read team file to get worktree paths BEFORE deleting the team directory
  const teamFile = readTeamFile(teamName)
  const worktreePaths: string[] = []
  if (teamFile) {
    for (const member of teamFile.members) {
      if (member.worktreePath) {
        worktreePaths.push(member.worktreePath)
      }
    }
  }

  // Clean up worktrees first
  for (const worktreePath of worktreePaths) {
    await destroyWorktree(worktreePath)
  }

  // Clean up team directory (~/.openjaws/teams/{team-name}/)
  const teamDir = getTeamDir(teamName)
  try {
    await rm(teamDir, { recursive: true, force: true })
    clearCachedTeamFile(teamName)
    logForDebugging(`[TeammateTool] Cleaned up team directory: ${teamDir}`)
  } catch (error) {
    logForDebugging(
      `[TeammateTool] Failed to clean up team directory ${teamDir}: ${errorMessage(error)}`,
    )
  }

  // Clean up tasks directory (~/.openjaws/tasks/{taskListId}/)
  // The leader and teammates all store tasks under the sanitized team name.
  const tasksDir = getTasksDir(sanitizedName)
  try {
    await rm(tasksDir, { recursive: true, force: true })
    logForDebugging(`[TeammateTool] Cleaned up tasks directory: ${tasksDir}`)
    notifyTasksUpdated()
  } catch (error) {
    logForDebugging(
      `[TeammateTool] Failed to clean up tasks directory ${tasksDir}: ${errorMessage(error)}`,
    )
  }
}
