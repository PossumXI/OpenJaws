export type MemoryLayer = 'working' | 'episodic' | 'semantic' | 'procedural'

export type ToolRiskTier = 0 | 1 | 2 | 3 | 4 | 5
export type CognitiveToolRiskTier = ToolRiskTier

export type CognitiveAuthorityScope =
  | 'read_only'
  | 'workspace_write'
  | 'external_communication'
  | 'financial'
  | 'infrastructure'
  | 'regulated'

export type CognitiveAgentRole =
  | 'operator'
  | 'planner'
  | 'researcher'
  | 'executor'
  | 'verifier'
  | 'critic'
  | 'security_monitor'
  | 'memory_curator'
  | 'ledger_recorder'
  | 'escalation_agent'
  | 'policy_governor'

export type CognitiveActionKind =
  | 'observe'
  | 'plan'
  | 'execute'
  | 'assess'
  | 'record'
  | 'propose_improvement'
  | 'deploy'

export type CognitiveApprovalKind =
  | 'goal_owner'
  | 'human_operator'
  | 'policy_governor'
  | 'security_monitor'
  | 'ledger_recorder'

export type CognitiveActorRef = {
  id: string
  role: CognitiveAgentRole
  displayName?: string | null
}

export type CognitiveGoalRoleAssignments = {
  planner?: CognitiveActorRef
  executor?: CognitiveActorRef
  critic?: CognitiveActorRef
  governor?: CognitiveActorRef
  recorder?: CognitiveActorRef
}

export type CognitiveGoalStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'complete'
  | 'blocked'

export type CognitiveGoal = {
  id: string
  objective: string
  owner: string
  constraints: string[]
  authorityScope: CognitiveAuthorityScope
  successCriteria: string[]
  deadline?: string | null
  allowedTools: string[]
  rollbackPlan?: string | null
  auditRequirements: string[]
  status: CognitiveGoalStatus
  createdAt: string
  roleAssignments?: CognitiveGoalRoleAssignments | null
}

export type CognitiveToolDefinition = {
  name: string
  summary: string
  riskTier: ToolRiskTier
  authorityScopes: CognitiveAuthorityScope[]
  allowedActionKinds: CognitiveActionKind[]
  allowedRoles?: CognitiveAgentRole[] | null
  requiredApprovals?: CognitiveApprovalKind[] | null
  requiresRollbackPlan?: boolean
  requiresLedgerRecord?: boolean
}

export type CognitiveApproval = {
  kind: CognitiveApprovalKind
  actorId: string
  approvedAt: string
  summary?: string | null
}

export type CognitiveRateLimitWindow = {
  key: string
  limit: number
  used: number
  resetAt: string
}

export type CognitivePacingSnapshot = {
  agentId: string
  tenantId?: string | null
  route?: string | null
  workspaceId?: string | null
  missionId?: string | null
  toolName: string
  riskTier: ToolRiskTier
  confidence: number
  recentFailureCount: number
  windows: CognitiveRateLimitWindow[]
}

export type CognitivePacingDecision = {
  status: 'clear' | 'delay' | 'block'
  delayMs: number
  reasons: string[]
  exhaustedKeys: string[]
}

export type CausalTraceNodeKind =
  | 'goal'
  | 'plan'
  | 'step'
  | 'tool_call'
  | 'output'
  | 'assessment'
  | 'ledger_record'
  | 'decision'

export type CausalTraceNode = {
  id: string
  kind: CausalTraceNodeKind
  label: string
  timestamp: string
  ref?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export type CausalTraceEdge = {
  from: string
  to: string
  relation:
    | 'creates'
    | 'executes'
    | 'produces'
    | 'assesses'
    | 'records'
    | 'decides'
}

export type CausalTraceGraph = {
  goalId: string
  nodes: CausalTraceNode[]
  edges: CausalTraceEdge[]
}

export type CognitiveRunScorecardStatus = 'pass' | 'review' | 'fail'

export type CognitiveRunScorecard = {
  goalId: string
  status: CognitiveRunScorecardStatus
  qualityScore: number
  metrics: {
    accuracy: number
    latency: number
    toolCorrectness: number
    policyCompliance: number
    hallucinationRisk: number
    cost: number
    reversibility: number
    securityPosture: number
    humanEscalationRate: number
  }
  findings: string[]
  escalationRequired: boolean
}

export type CognitiveMemoryEntry = {
  id: string
  layer: MemoryLayer
  goalId: string
  summary: string
  evidenceNodeIds: string[]
  createdAt: string
  retention: 'session' | 'project' | 'durable'
  tags: string[]
  policyHints: string[]
}

export type CognitiveRuntimePolicy = {
  minConfidenceByRiskTier: Record<ToolRiskTier, number>
  requiredApprovalsByRiskTier: Record<ToolRiskTier, CognitiveApprovalKind[]>
  maxRecentFailuresBeforeBlock: number
  roleSeparationRequiredFromTier: ToolRiskTier
}

export type CognitiveRuntimeActionRequest = {
  goal: CognitiveGoal
  actor: CognitiveActorRef
  actionKind: CognitiveActionKind
  tool: CognitiveToolDefinition
  confidence: number
  recentFailureCount: number
  approvals?: CognitiveApproval[]
  pacing?: CognitivePacingSnapshot | null
  now?: string
}

export type CognitiveLedgerRecord = {
  id: string
  goalId: string
  toolName: string
  riskTier: ToolRiskTier
  decisionStatus: CognitiveRuntimeDecisionStatus
  recordedAt: string
  proofSummary: string
}

export type CognitiveRuntimeDecisionStatus =
  | 'allow'
  | 'review'
  | 'delay'
  | 'deny'

export type CognitiveRuntimeDecision = {
  status: CognitiveRuntimeDecisionStatus
  goalId: string
  toolName: string
  riskTier: ToolRiskTier
  reasons: string[]
  requiredApprovals: CognitiveApprovalKind[]
  missingApprovals: CognitiveApprovalKind[]
  delayMs: number
  nextStep: string
  pacing: CognitivePacingDecision
  scorecardSeed: CognitiveRunScorecard
  trace: CausalTraceGraph
  ledgerRecord: CognitiveLedgerRecord
}

export const DEFAULT_COGNITIVE_RUNTIME_POLICY: CognitiveRuntimePolicy = {
  minConfidenceByRiskTier: {
    0: 0.15,
    1: 0.3,
    2: 0.55,
    3: 0.65,
    4: 0.75,
    5: 0.85,
  },
  requiredApprovalsByRiskTier: {
    0: [],
    1: [],
    2: ['policy_governor'],
    3: ['policy_governor', 'ledger_recorder'],
    4: ['human_operator', 'policy_governor', 'ledger_recorder'],
    5: [
      'human_operator',
      'policy_governor',
      'security_monitor',
      'ledger_recorder',
    ],
  },
  maxRecentFailuresBeforeBlock: 5,
  roleSeparationRequiredFromTier: 2,
}

export const DEFAULT_COGNITIVE_TOOL_REGISTRY: CognitiveToolDefinition[] = [
  {
    name: 'workspace.inspect',
    summary: 'Read workspace metadata, files, logs, and summaries.',
    riskTier: 0,
    authorityScopes: ['read_only', 'workspace_write'],
    allowedActionKinds: ['observe'],
    allowedRoles: ['operator', 'researcher', 'verifier', 'security_monitor'],
  },
  {
    name: 'workspace.draft',
    summary: 'Create a proposed patch or plan without applying it.',
    riskTier: 1,
    authorityScopes: ['read_only', 'workspace_write'],
    allowedActionKinds: ['plan', 'propose_improvement'],
    allowedRoles: ['operator', 'planner', 'researcher'],
  },
  {
    name: 'workspace.apply_patch',
    summary: 'Write project files inside an approved workspace.',
    riskTier: 2,
    authorityScopes: ['workspace_write'],
    allowedActionKinds: ['execute'],
    allowedRoles: ['operator', 'executor'],
    requiresRollbackPlan: true,
    requiresLedgerRecord: true,
  },
  {
    name: 'q.route.dispatch',
    summary: 'Dispatch a signed Q training route to a local or remote worker.',
    riskTier: 2,
    authorityScopes: ['workspace_write', 'external_communication'],
    allowedActionKinds: ['execute'],
    allowedRoles: ['operator', 'executor'],
    requiresRollbackPlan: true,
    requiresLedgerRecord: true,
  },
  {
    name: 'browser.mutate',
    summary: 'Use a browser to submit forms or change an external page.',
    riskTier: 3,
    authorityScopes: ['external_communication'],
    allowedActionKinds: ['execute'],
    allowedRoles: ['operator', 'executor'],
    requiresRollbackPlan: true,
    requiresLedgerRecord: true,
  },
  {
    name: 'billing.charge',
    summary: 'Create billing, checkout, refund, or subscription changes.',
    riskTier: 4,
    authorityScopes: ['financial'],
    allowedActionKinds: ['execute'],
    allowedRoles: ['operator', 'executor'],
    requiresRollbackPlan: true,
    requiresLedgerRecord: true,
  },
  {
    name: 'infra.deploy',
    summary: 'Deploy, migrate, delete, or expose production infrastructure.',
    riskTier: 5,
    authorityScopes: ['infrastructure', 'regulated'],
    allowedActionKinds: ['deploy'],
    allowedRoles: ['operator', 'executor'],
    requiresRollbackPlan: true,
    requiresLedgerRecord: true,
  },
]

const ROLE_ACTIONS: Record<CognitiveAgentRole, CognitiveActionKind[]> = {
  operator: [
    'observe',
    'plan',
    'execute',
    'assess',
    'record',
    'propose_improvement',
    'deploy',
  ],
  planner: ['observe', 'plan', 'propose_improvement'],
  researcher: ['observe', 'plan'],
  executor: ['observe', 'execute', 'deploy'],
  verifier: ['observe', 'assess'],
  critic: ['observe', 'assess', 'propose_improvement'],
  security_monitor: ['observe', 'assess'],
  memory_curator: ['observe', 'assess', 'record'],
  ledger_recorder: ['observe', 'record'],
  escalation_agent: ['observe', 'assess', 'record'],
  policy_governor: ['observe', 'assess', 'record', 'deploy'],
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values))
}

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function makeRuntimeId(prefix: string, parts: readonly string[]): string {
  return [prefix, ...parts.map((part) => part.replace(/[^A-Za-z0-9._-]/g, '_'))]
    .filter(Boolean)
    .join(':')
}

function isPastDeadline(
  deadline: string | null | undefined,
  now: string,
): boolean {
  if (!deadline) {
    return false
  }
  const deadlineMs = Date.parse(deadline)
  const nowMs = Date.parse(now)
  return (
    Number.isFinite(deadlineMs) && Number.isFinite(nowMs) && deadlineMs < nowMs
  )
}

export function createCognitiveToolRegistry(
  tools: CognitiveToolDefinition[] = DEFAULT_COGNITIVE_TOOL_REGISTRY,
): Map<string, CognitiveToolDefinition> {
  return new Map(tools.map((tool) => [tool.name, tool]))
}

export function validateCognitiveGoal(goal: CognitiveGoal): string[] {
  const issues: string[] = []

  if (!trimOrEmpty(goal.id)) {
    issues.push('goal id is required')
  }
  if (!trimOrEmpty(goal.objective)) {
    issues.push('goal objective is required')
  }
  if (!trimOrEmpty(goal.owner)) {
    issues.push('goal owner is required')
  }
  if (goal.successCriteria.length === 0) {
    issues.push('goal success criteria are required')
  }
  if (goal.allowedTools.length === 0) {
    issues.push('goal allowed tools are required')
  }
  if (goal.auditRequirements.length === 0) {
    issues.push('goal audit requirements are required')
  }
  if (
    !['draft', 'active', 'paused', 'complete', 'blocked'].includes(goal.status)
  ) {
    issues.push('goal status is invalid')
  }

  return issues
}

export function roleCanPerformAction(
  role: CognitiveAgentRole,
  actionKind: CognitiveActionKind,
): boolean {
  return ROLE_ACTIONS[role].includes(actionKind)
}

export function evaluateCognitiveRatePacing(
  snapshot: CognitivePacingSnapshot,
  options: {
    now?: string
    maxRecentFailuresBeforeBlock?: number
  } = {},
): CognitivePacingDecision {
  const now = Date.parse(options.now ?? new Date().toISOString())
  const reasons: string[] = []
  const exhaustedKeys: string[] = []
  let delayMs = 0

  for (const window of snapshot.windows) {
    const remaining = window.limit - window.used
    if (remaining > 0) {
      continue
    }

    exhaustedKeys.push(window.key)
    const resetMs = Date.parse(window.resetAt)
    const windowDelayMs =
      Number.isFinite(resetMs) && Number.isFinite(now)
        ? Math.max(resetMs - now, 0)
        : 60_000
    delayMs = Math.max(delayMs, windowDelayMs)
    reasons.push(`rate window exhausted: ${window.key}`)
  }

  const failureBlockThreshold =
    options.maxRecentFailuresBeforeBlock ??
    DEFAULT_COGNITIVE_RUNTIME_POLICY.maxRecentFailuresBeforeBlock
  if (snapshot.recentFailureCount >= failureBlockThreshold) {
    return {
      status: 'block',
      delayMs: 0,
      reasons: [
        ...reasons,
        `recent failure count ${snapshot.recentFailureCount} reached block threshold ${failureBlockThreshold}`,
      ],
      exhaustedKeys,
    }
  }

  if (snapshot.recentFailureCount >= 2 && snapshot.riskTier >= 3) {
    delayMs = Math.max(delayMs, snapshot.recentFailureCount * 30_000)
    reasons.push(
      `risk tier ${snapshot.riskTier} is paced after ${snapshot.recentFailureCount} recent failures`,
    )
  }

  if (snapshot.confidence < 0.25 && snapshot.riskTier >= 2) {
    return {
      status: 'block',
      delayMs: 0,
      reasons: [
        ...reasons,
        `confidence ${snapshot.confidence.toFixed(2)} is too low for governed execution`,
      ],
      exhaustedKeys,
    }
  }

  if (delayMs > 0) {
    return {
      status: 'delay',
      delayMs,
      reasons,
      exhaustedKeys,
    }
  }

  return {
    status: 'clear',
    delayMs: 0,
    reasons,
    exhaustedKeys,
  }
}

function getRequiredApprovals(
  tool: CognitiveToolDefinition,
  policy: CognitiveRuntimePolicy,
): CognitiveApprovalKind[] {
  return unique(
    tool.requiredApprovals ?? policy.requiredApprovalsByRiskTier[tool.riskTier],
  )
}

function findMissingApprovals(args: {
  requiredApprovals: CognitiveApprovalKind[]
  approvals: CognitiveApproval[]
  actorId: string
}): CognitiveApprovalKind[] {
  return args.requiredApprovals.filter(
    (kind) =>
      !args.approvals.some(
        (approval) =>
          approval.kind === kind && approval.actorId !== args.actorId,
      ),
  )
}

function findRoleSeparationIssues(
  assignments: CognitiveGoalRoleAssignments | null | undefined,
): string[] {
  if (!assignments) {
    return []
  }

  const byActor = new Map<string, string[]>()
  const entries = Object.entries(assignments) as Array<
    [keyof CognitiveGoalRoleAssignments, CognitiveActorRef | undefined]
  >

  for (const [slot, actor] of entries) {
    if (!actor?.id) {
      continue
    }
    const slots = byActor.get(actor.id) ?? []
    slots.push(slot)
    byActor.set(actor.id, slots)
  }

  return Array.from(byActor.entries())
    .filter(([, slots]) => slots.length > 1)
    .map(
      ([actorId, slots]) =>
        `role separation violation: ${actorId} owns ${slots.join(', ')}`,
    )
}

export function buildCausalTraceGraph(args: {
  goal: CognitiveGoal
  planId: string
  stepId: string
  toolCallId: string
  outputId: string
  assessmentId: string
  ledgerRecordId: string
  decisionId: string
  now?: string
}): CausalTraceGraph {
  const timestamp = args.now ?? new Date().toISOString()
  const nodes: CausalTraceNode[] = [
    {
      id: args.goal.id,
      kind: 'goal',
      label: args.goal.objective,
      timestamp,
      metadata: {
        owner: args.goal.owner,
        status: args.goal.status,
      },
    },
    {
      id: args.planId,
      kind: 'plan',
      label: 'Planner selected a bounded action plan.',
      timestamp,
    },
    {
      id: args.stepId,
      kind: 'step',
      label: 'Executor prepared the next bounded step.',
      timestamp,
    },
    {
      id: args.toolCallId,
      kind: 'tool_call',
      label: 'Tool call requested.',
      timestamp,
    },
    {
      id: args.outputId,
      kind: 'output',
      label: 'Tool output captured.',
      timestamp,
    },
    {
      id: args.assessmentId,
      kind: 'assessment',
      label: 'Critic and verifier scorecard captured.',
      timestamp,
    },
    {
      id: args.ledgerRecordId,
      kind: 'ledger_record',
      label: 'Recorder committed proof summary.',
      timestamp,
    },
    {
      id: args.decisionId,
      kind: 'decision',
      label: 'Governor decision captured.',
      timestamp,
    },
  ]

  return {
    goalId: args.goal.id,
    nodes,
    edges: [
      { from: args.goal.id, to: args.planId, relation: 'creates' },
      { from: args.planId, to: args.stepId, relation: 'creates' },
      { from: args.stepId, to: args.toolCallId, relation: 'executes' },
      { from: args.toolCallId, to: args.outputId, relation: 'produces' },
      { from: args.outputId, to: args.assessmentId, relation: 'assesses' },
      { from: args.assessmentId, to: args.ledgerRecordId, relation: 'records' },
      { from: args.ledgerRecordId, to: args.decisionId, relation: 'decides' },
    ],
  }
}

export function buildCognitiveRunScorecard(args: {
  goalId: string
  accuracy: number
  latency: number
  toolCorrectness: number
  policyCompliance: number
  hallucinationRisk: number
  cost: number
  reversibility: number
  securityPosture: number
  humanEscalationRate: number
}): CognitiveRunScorecard {
  const metrics = {
    accuracy: clampScore(args.accuracy),
    latency: clampScore(args.latency),
    toolCorrectness: clampScore(args.toolCorrectness),
    policyCompliance: clampScore(args.policyCompliance),
    hallucinationRisk: clampScore(args.hallucinationRisk),
    cost: clampScore(args.cost),
    reversibility: clampScore(args.reversibility),
    securityPosture: clampScore(args.securityPosture),
    humanEscalationRate: clampScore(args.humanEscalationRate),
  }
  const findings: string[] = []

  if (metrics.accuracy < 0.75) {
    findings.push('accuracy needs review')
  }
  if (metrics.toolCorrectness < 0.8) {
    findings.push('tool correctness needs review')
  }
  if (metrics.policyCompliance < 0.9) {
    findings.push('policy compliance needs review')
  }
  if (metrics.hallucinationRisk > 0.25) {
    findings.push('hallucination risk is elevated')
  }
  if (metrics.reversibility < 0.6) {
    findings.push('rollback confidence is low')
  }
  if (metrics.securityPosture < 0.85) {
    findings.push('security posture needs review')
  }
  if (metrics.humanEscalationRate > 0.4) {
    findings.push('human escalation rate is high')
  }

  const qualityScore =
    (metrics.accuracy +
      metrics.latency +
      metrics.toolCorrectness +
      metrics.policyCompliance +
      (1 - metrics.hallucinationRisk) +
      (1 - metrics.cost) +
      metrics.reversibility +
      metrics.securityPosture +
      (1 - metrics.humanEscalationRate)) /
    9

  const fail =
    metrics.policyCompliance < 0.6 ||
    metrics.securityPosture < 0.6 ||
    metrics.hallucinationRisk > 0.6

  return {
    goalId: args.goalId,
    status: fail ? 'fail' : findings.length > 0 ? 'review' : 'pass',
    qualityScore: Math.round(qualityScore * 1000) / 1000,
    metrics,
    findings,
    escalationRequired: fail || findings.length > 0,
  }
}

export function deriveMemoryUpdatesFromAssessment(args: {
  goal: CognitiveGoal
  scorecard: CognitiveRunScorecard
  trace: CausalTraceGraph
  now?: string
  stableFacts?: string[]
}): CognitiveMemoryEntry[] {
  const now = args.now ?? new Date().toISOString()
  const evidenceNodeIds = args.trace.nodes.map((node) => node.id)
  const entries: CognitiveMemoryEntry[] = [
    {
      id: makeRuntimeId('mem', [args.goal.id, 'working']),
      layer: 'working',
      goalId: args.goal.id,
      summary: `Current goal: ${args.goal.objective}`,
      evidenceNodeIds,
      createdAt: now,
      retention: 'session',
      tags: ['goal', args.goal.status],
      policyHints: [],
    },
    {
      id: makeRuntimeId('mem', [args.goal.id, 'episodic']),
      layer: 'episodic',
      goalId: args.goal.id,
      summary: `Run scorecard ended ${args.scorecard.status} with quality ${args.scorecard.qualityScore.toFixed(3)}.`,
      evidenceNodeIds,
      createdAt: now,
      retention: 'project',
      tags: ['scorecard', args.scorecard.status],
      policyHints: args.scorecard.findings,
    },
  ]

  if (args.scorecard.status !== 'pass') {
    entries.push({
      id: makeRuntimeId('mem', [args.goal.id, 'procedural']),
      layer: 'procedural',
      goalId: args.goal.id,
      summary:
        'Future similar work should route through planner, executor, critic, governor, and recorder roles before release.',
      evidenceNodeIds,
      createdAt: now,
      retention: 'durable',
      tags: ['procedure', 'policy-adjusted-future-behavior'],
      policyHints: [
        'raise verifier coverage before repeating this action',
        'require explicit rollback evidence for risky tools',
      ],
    })
  }

  for (const [index, fact] of (args.stableFacts ?? []).entries()) {
    entries.push({
      id: makeRuntimeId('mem', [args.goal.id, 'semantic', String(index)]),
      layer: 'semantic',
      goalId: args.goal.id,
      summary: fact,
      evidenceNodeIds,
      createdAt: now,
      retention: 'durable',
      tags: ['semantic'],
      policyHints: [],
    })
  }

  return entries
}

export function evaluateCognitiveRuntimeAction(
  request: CognitiveRuntimeActionRequest,
  policy: CognitiveRuntimePolicy = DEFAULT_COGNITIVE_RUNTIME_POLICY,
): CognitiveRuntimeDecision {
  const now = request.now ?? new Date().toISOString()
  const goalValidationIssues = validateCognitiveGoal(request.goal)
  const hardBlocks: string[] = [...goalValidationIssues]
  const reviewReasons: string[] = []

  if (request.goal.status !== 'active') {
    hardBlocks.push(`goal is ${request.goal.status}, not active`)
  }
  if (isPastDeadline(request.goal.deadline, now)) {
    hardBlocks.push('goal deadline has passed')
  }
  if (!request.goal.allowedTools.includes(request.tool.name)) {
    hardBlocks.push(`tool ${request.tool.name} is not allowed by goal`)
  }
  if (!request.tool.authorityScopes.includes(request.goal.authorityScope)) {
    hardBlocks.push(
      `tool ${request.tool.name} does not cover authority scope ${request.goal.authorityScope}`,
    )
  }
  if (!request.tool.allowedActionKinds.includes(request.actionKind)) {
    hardBlocks.push(
      `tool ${request.tool.name} does not allow ${request.actionKind}`,
    )
  }
  if (
    request.tool.allowedRoles &&
    !request.tool.allowedRoles.includes(request.actor.role)
  ) {
    hardBlocks.push(
      `role ${request.actor.role} cannot use tool ${request.tool.name}`,
    )
  }
  if (!roleCanPerformAction(request.actor.role, request.actionKind)) {
    hardBlocks.push(
      `role ${request.actor.role} cannot perform ${request.actionKind}`,
    )
  }

  const minConfidence = policy.minConfidenceByRiskTier[request.tool.riskTier]
  if (request.confidence < minConfidence) {
    reviewReasons.push(
      `confidence ${request.confidence.toFixed(2)} is below tier ${request.tool.riskTier} minimum ${minConfidence.toFixed(2)}`,
    )
  }

  const roleSeparationIssues = findRoleSeparationIssues(
    request.goal.roleAssignments,
  )
  if (
    request.tool.riskTier >= policy.roleSeparationRequiredFromTier &&
    roleSeparationIssues.length > 0
  ) {
    hardBlocks.push(...roleSeparationIssues)
  }

  if (
    request.tool.requiresRollbackPlan &&
    !trimOrEmpty(request.goal.rollbackPlan)
  ) {
    if (request.tool.riskTier >= 4) {
      hardBlocks.push('high-risk tool requires a rollback plan')
    } else {
      reviewReasons.push('tool requires a rollback plan')
    }
  }

  if (
    request.tool.requiresLedgerRecord &&
    request.goal.auditRequirements.length === 0
  ) {
    hardBlocks.push('tool requires ledger/audit requirements')
  }

  const requiredApprovals = getRequiredApprovals(request.tool, policy)
  const missingApprovals = findMissingApprovals({
    requiredApprovals,
    approvals: request.approvals ?? [],
    actorId: request.actor.id,
  })
  if (missingApprovals.length > 0) {
    reviewReasons.push(`missing approvals: ${missingApprovals.join(', ')}`)
  }

  const pacing = request.pacing
    ? evaluateCognitiveRatePacing(request.pacing, {
        now,
        maxRecentFailuresBeforeBlock: policy.maxRecentFailuresBeforeBlock,
      })
    : {
        status: 'clear' as const,
        delayMs: 0,
        reasons: [],
        exhaustedKeys: [],
      }
  if (pacing.status === 'block') {
    hardBlocks.push(...pacing.reasons)
  }

  const allReasons = [
    ...hardBlocks,
    ...reviewReasons,
    ...pacing.reasons,
  ]
  const status: CognitiveRuntimeDecisionStatus =
    hardBlocks.length > 0
      ? 'deny'
      : reviewReasons.length > 0
        ? 'review'
        : pacing.status === 'delay'
          ? 'delay'
          : 'allow'

  const trace = buildCausalTraceGraph({
    goal: request.goal,
    planId: makeRuntimeId('plan', [request.goal.id]),
    stepId: makeRuntimeId('step', [request.goal.id, request.tool.name]),
    toolCallId: makeRuntimeId('tool', [request.goal.id, request.tool.name]),
    outputId: makeRuntimeId('output', [request.goal.id, request.tool.name]),
    assessmentId: makeRuntimeId('assessment', [
      request.goal.id,
      request.tool.name,
    ]),
    ledgerRecordId: makeRuntimeId('ledger', [
      request.goal.id,
      request.tool.name,
    ]),
    decisionId: makeRuntimeId('decision', [
      request.goal.id,
      request.tool.name,
      status,
    ]),
    now,
  })

  const scorecardSeed = buildCognitiveRunScorecard({
    goalId: request.goal.id,
    accuracy: request.confidence,
    latency: pacing.status === 'delay' ? 0.45 : 1,
    toolCorrectness: hardBlocks.length > 0 ? 0.2 : 0.85,
    policyCompliance:
      missingApprovals.length > 0 || hardBlocks.length > 0 ? 0.55 : 0.95,
    hallucinationRisk: 1 - request.confidence,
    cost: Math.min(request.tool.riskTier / 5, 1),
    reversibility: trimOrEmpty(request.goal.rollbackPlan) ? 0.9 : 0.35,
    securityPosture: hardBlocks.length > 0 ? 0.35 : 0.9,
    humanEscalationRate: status === 'allow' ? 0.1 : 0.75,
  })

  const ledgerRecord: CognitiveLedgerRecord = {
    id: makeRuntimeId('ledger-record', [
      request.goal.id,
      request.tool.name,
      status,
    ]),
    goalId: request.goal.id,
    toolName: request.tool.name,
    riskTier: request.tool.riskTier,
    decisionStatus: status,
    recordedAt: now,
    proofSummary: `${status}: ${allReasons.length > 0 ? allReasons.join('; ') : 'policy checks passed'}`,
  }

  return {
    status,
    goalId: request.goal.id,
    toolName: request.tool.name,
    riskTier: request.tool.riskTier,
    reasons: allReasons,
    requiredApprovals,
    missingApprovals,
    delayMs: pacing.delayMs,
    nextStep:
      status === 'allow'
        ? 'execute bounded action and record the result'
        : status === 'delay'
          ? 'wait for pacing window before retry'
          : status === 'review'
            ? 'collect missing approvals or improve confidence before execution'
            : 'stop execution and preserve state for operator review',
    pacing,
    scorecardSeed,
    trace,
    ledgerRecord,
  }
}
