import { describe, expect, test } from 'bun:test'
import {
  buildCausalTraceGraph,
  buildCognitiveRunScorecard,
  deriveMemoryUpdatesFromAssessment,
  evaluateCognitiveRatePacing,
  evaluateCognitiveRuntimeAction,
  validateCognitiveGoal,
  type CognitiveGoal,
  type CognitiveToolDefinition,
} from './cognitiveRuntime.js'

const now = '2026-05-01T12:00:00.000Z'

function baseGoal(overrides: Partial<CognitiveGoal> = {}): CognitiveGoal {
  return {
    id: 'goal-1',
    objective: 'Patch the workspace safely.',
    owner: 'founder',
    constraints: ['stay inside the workspace'],
    authorityScope: 'workspace_write',
    successCriteria: ['tests pass'],
    allowedTools: ['workspace.apply_patch'],
    rollbackPlan: 'revert the scoped patch before release',
    auditRequirements: ['record patch and test output'],
    status: 'active',
    createdAt: now,
    roleAssignments: {
      planner: { id: 'planner-1', role: 'planner' },
      executor: { id: 'executor-1', role: 'executor' },
      critic: { id: 'critic-1', role: 'critic' },
      governor: { id: 'governor-1', role: 'policy_governor' },
      recorder: { id: 'recorder-1', role: 'ledger_recorder' },
    },
    ...overrides,
  }
}

function baseTool(
  overrides: Partial<CognitiveToolDefinition> = {},
): CognitiveToolDefinition {
  return {
    name: 'workspace.apply_patch',
    summary: 'Apply a scoped patch.',
    riskTier: 2,
    authorityScopes: ['workspace_write'],
    allowedActionKinds: ['execute'],
    allowedRoles: ['executor'],
    requiresRollbackPlan: true,
    requiresLedgerRecord: true,
    ...overrides,
  }
}

describe('cognitive runtime policy foundation', () => {
  test('validates explicit goal objects before execution', () => {
    expect(
      validateCognitiveGoal(
        baseGoal({
          objective: '',
          successCriteria: [],
          allowedTools: [],
        }),
      ),
    ).toEqual([
      'goal objective is required',
      'goal success criteria are required',
      'goal allowed tools are required',
    ])
  })

  test('allows bounded execution when role, approval, rollback, and audit are present', () => {
    const decision = evaluateCognitiveRuntimeAction({
      goal: baseGoal(),
      actor: { id: 'executor-1', role: 'executor' },
      actionKind: 'execute',
      tool: baseTool(),
      confidence: 0.9,
      recentFailureCount: 0,
      approvals: [
        {
          kind: 'policy_governor',
          actorId: 'governor-1',
          approvedAt: now,
        },
      ],
      now,
    })

    expect(decision.status).toBe('allow')
    expect(decision.missingApprovals).toEqual([])
    expect(decision.ledgerRecord.proofSummary).toContain('policy checks passed')
  })

  test('denies malformed goals before bounded execution can start', () => {
    const decision = evaluateCognitiveRuntimeAction({
      goal: baseGoal({
        objective: '',
        successCriteria: [],
        allowedTools: ['workspace.apply_patch'],
      }),
      actor: { id: 'executor-1', role: 'executor' },
      actionKind: 'execute',
      tool: baseTool(),
      confidence: 0.9,
      recentFailureCount: 0,
      approvals: [
        {
          kind: 'policy_governor',
          actorId: 'governor-1',
          approvedAt: now,
        },
      ],
      now,
    })

    expect(decision.status).toBe('deny')
    expect(decision.reasons).toContain('goal objective is required')
    expect(decision.reasons).toContain('goal success criteria are required')
    expect(decision.ledgerRecord.proofSummary).toContain(
      'goal objective is required',
    )
  })

  test('blocks high-risk execution when the same actor owns planning and execution', () => {
    const decision = evaluateCognitiveRuntimeAction({
      goal: baseGoal({
        authorityScope: 'infrastructure',
        allowedTools: ['infra.deploy'],
        roleAssignments: {
          planner: { id: 'agent-1', role: 'planner' },
          executor: { id: 'agent-1', role: 'executor' },
          critic: { id: 'critic-1', role: 'critic' },
          governor: { id: 'governor-1', role: 'policy_governor' },
          recorder: { id: 'recorder-1', role: 'ledger_recorder' },
        },
      }),
      actor: { id: 'agent-1', role: 'executor' },
      actionKind: 'deploy',
      tool: baseTool({
        name: 'infra.deploy',
        riskTier: 5,
        authorityScopes: ['infrastructure'],
        allowedActionKinds: ['deploy'],
        requiredApprovals: [
          'human_operator',
          'policy_governor',
          'security_monitor',
          'ledger_recorder',
        ],
      }),
      confidence: 0.95,
      recentFailureCount: 0,
      approvals: [
        { kind: 'human_operator', actorId: 'human-1', approvedAt: now },
        { kind: 'policy_governor', actorId: 'governor-1', approvedAt: now },
        { kind: 'security_monitor', actorId: 'security-1', approvedAt: now },
        { kind: 'ledger_recorder', actorId: 'recorder-1', approvedAt: now },
      ],
      now,
    })

    expect(decision.status).toBe('deny')
    expect(decision.reasons).toContain(
      'role separation violation: agent-1 owns planner, executor',
    )
  })

  test('paces risky tools by rate window and recent failure count', () => {
    const decision = evaluateCognitiveRatePacing(
      {
        agentId: 'agent-1',
        toolName: 'browser.mutate',
        riskTier: 3,
        confidence: 0.8,
        recentFailureCount: 2,
        windows: [
          {
            key: 'tenant:acme',
            limit: 5,
            used: 5,
            resetAt: '2026-05-01T12:01:00.000Z',
          },
        ],
      },
      { now },
    )

    expect(decision.status).toBe('delay')
    expect(decision.delayMs).toBeGreaterThanOrEqual(60_000)
    expect(decision.exhaustedKeys).toEqual(['tenant:acme'])
  })

  test('builds causal trace graph from goal to governed decision', () => {
    const graph = buildCausalTraceGraph({
      goal: baseGoal(),
      planId: 'plan-1',
      stepId: 'step-1',
      toolCallId: 'tool-1',
      outputId: 'output-1',
      assessmentId: 'assessment-1',
      ledgerRecordId: 'ledger-1',
      decisionId: 'decision-1',
      now,
    })

    expect(graph.nodes.map((node) => node.kind)).toEqual([
      'goal',
      'plan',
      'step',
      'tool_call',
      'output',
      'assessment',
      'ledger_record',
      'decision',
    ])
    expect(graph.edges.at(-1)).toEqual({
      from: 'ledger-1',
      to: 'decision-1',
      relation: 'decides',
    })
  })

  test('turns assessments into layered memory updates and policy hints', () => {
    const goal = baseGoal()
    const scorecard = buildCognitiveRunScorecard({
      goalId: goal.id,
      accuracy: 0.7,
      latency: 0.8,
      toolCorrectness: 0.75,
      policyCompliance: 0.8,
      hallucinationRisk: 0.35,
      cost: 0.2,
      reversibility: 0.5,
      securityPosture: 0.8,
      humanEscalationRate: 0.5,
    })
    const trace = buildCausalTraceGraph({
      goal,
      planId: 'plan-1',
      stepId: 'step-1',
      toolCallId: 'tool-1',
      outputId: 'output-1',
      assessmentId: 'assessment-1',
      ledgerRecordId: 'ledger-1',
      decisionId: 'decision-1',
      now,
    })

    const updates = deriveMemoryUpdatesFromAssessment({
      goal,
      scorecard,
      trace,
      now,
      stableFacts: ['Q routes use signed manifests.'],
    })

    expect(updates.map((update) => update.layer)).toEqual([
      'working',
      'episodic',
      'procedural',
      'semantic',
    ])
    expect(updates[2]?.policyHints).toContain(
      'raise verifier coverage before repeating this action',
    )
  })
})
