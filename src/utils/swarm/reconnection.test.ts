import { describe, expect, it } from 'bun:test'
import { buildTeamContextTeammates } from './reconnection.js'
import type { TeamFile } from './teamHelpers.js'

describe('reconnection agent co-work hydration', () => {
  it('hydrates teammate terminal context ids from the saved team file', () => {
    const teamFile: TeamFile = {
      name: 'bridge-crew',
      createdAt: 1,
      leadAgentId: 'team-lead@bridge-crew',
      leadTerminalContextId: 'term-lead01',
      members: [
        {
          agentId: 'team-lead@bridge-crew',
          name: 'team-lead',
          joinedAt: 1,
          tmuxPaneId: '',
          cwd: 'D:\\openjaws\\OpenJaws',
          terminalContextId: 'term-lead01',
          subscriptions: [],
        },
        {
          agentId: 'scout@bridge-crew',
          name: 'scout',
          joinedAt: 2,
          tmuxPaneId: '%2',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          worktreePath: 'C:\\Users\\Knight\\Desktop\\cheeks',
          terminalContextId: 'term-scout02',
          subscriptions: [],
        },
      ],
      terminalContexts: [
        {
          terminalContextId: 'term-lead01',
          agentId: 'team-lead@bridge-crew',
          agentName: 'team-lead',
          cwd: 'D:\\openjaws\\OpenJaws',
          projectRoot: 'D:\\openjaws\\OpenJaws',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          terminalContextId: 'term-scout02',
          agentId: 'scout@bridge-crew',
          agentName: 'scout',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          projectRoot: 'C:\\Users\\Knight\\Desktop\\cheeks',
          activePhaseId: 'phase-scout02',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      phaseReceipts: [
        {
          phaseId: 'phase-scout02',
          label: 'scout pinned phase',
          sourceAgentId: 'team-lead@bridge-crew',
          sourceAgentName: 'team-lead',
          sourceTerminalContextId: 'term-lead01',
          targetAgentIds: ['scout@bridge-crew'],
          targetAgentNames: ['scout'],
          targetTerminalContextIds: ['term-scout02'],
          collaboratorAgentIds: ['scout@bridge-crew'],
          projectRoots: ['C:\\Users\\Knight\\Desktop\\cheeks'],
          requestSummary: 'Audit shared OCI config',
          lastDeliverableSummary: 'Pinned scout context is ready',
          lastDeliveredAt: 2,
          deliveries: [
            {
              kind: 'request',
              timestamp: '1970-01-01T00:00:00.002Z',
              fromAgentId: 'team-lead@bridge-crew',
              fromAgentName: 'team-lead',
              toAgentIds: ['scout@bridge-crew'],
              toAgentNames: ['scout'],
              summary: 'Audit shared OCI config',
            },
          ],
          createdAt: 2,
          updatedAt: 2,
          status: 'delivered',
        },
      ],
    }

    const teammates = buildTeamContextTeammates(teamFile)

    expect(teammates['team-lead@bridge-crew']).toEqual({
      name: 'team-lead',
      agentType: undefined,
      color: undefined,
      tmuxSessionName: '',
      tmuxPaneId: '',
      cwd: 'D:\\openjaws\\OpenJaws',
      worktreePath: undefined,
      terminalContextId: 'term-lead01',
      activePhaseId: undefined,
      spawnedAt: 1,
    })
    expect(teammates['scout@bridge-crew']).toEqual({
      name: 'scout',
      agentType: undefined,
      color: undefined,
      tmuxSessionName: '',
      tmuxPaneId: '%2',
      cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
      worktreePath: 'C:\\Users\\Knight\\Desktop\\cheeks',
      terminalContextId: 'term-scout02',
      activePhaseId: 'phase-scout02',
      spawnedAt: 2,
    })
  })
})
