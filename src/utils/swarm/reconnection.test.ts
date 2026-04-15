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
      spawnedAt: 2,
    })
  })
})
