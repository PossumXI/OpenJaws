import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { AppState } from '../state/AppState.js'
import {
  parseDirectMemberMessage,
  sendDirectMemberMessage,
} from './directMemberMessage.js'
import {
  getTeamFilePath,
  readTeamFileAsync,
  type TeamFile,
  writeTeamFileAsync,
} from './swarm/teamHelpers.js'

describe('directMemberMessage', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR
  })

  it('parses direct messages with an explicit phase id', () => {
    expect(
      parseDirectMemberMessage(
        '@scout [phase:phase-abc12345] keep working on the bridge diff',
      ),
    ).toEqual({
      recipientName: 'scout',
      phaseId: 'phase-abc12345',
      message: 'keep working on the bridge diff',
    })
  })

  it('rejects explicit phase sends when the phase does not exist', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'openjaws-direct-message-'))
    process.env.CLAUDE_CONFIG_DIR = configDir

    const teamName = 'bridge-crew'
    const teamFilePath = getTeamFilePath(teamName)
    mkdirSync(dirname(teamFilePath), { recursive: true })
    await writeTeamFileAsync(teamName, {
      name: teamName,
      createdAt: 1,
      leadAgentId: 'team-lead@bridge-crew',
      members: [
        {
          agentId: 'team-lead@bridge-crew',
          name: 'team-lead',
          joinedAt: 1,
          tmuxPaneId: '',
          cwd: 'D:\\openjaws\\OpenJaws',
          subscriptions: [],
        },
        {
          agentId: 'scout@bridge-crew',
          name: 'scout',
          joinedAt: 2,
          tmuxPaneId: '%2',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          subscriptions: [],
        },
      ],
    } satisfies TeamFile)

    const teamContext: AppState['teamContext'] = {
      teamName,
      teamFilePath,
      leadAgentId: 'team-lead@bridge-crew',
      teammates: {
        'team-lead@bridge-crew': {
          name: 'team-lead',
          color: 'red',
          tmuxSessionName: '',
          tmuxPaneId: '',
          cwd: 'D:\\openjaws\\OpenJaws',
          spawnedAt: 1,
        },
        'scout@bridge-crew': {
          name: 'scout',
          color: 'blue',
          tmuxSessionName: 'swarm',
          tmuxPaneId: '%2',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          spawnedAt: 2,
        },
      },
    }

    const writes: Array<{ recipientName: string; teamName: string }> = []
    const result = await sendDirectMemberMessage(
      'scout',
      'keep going',
      teamContext,
      'phase-missing01',
      async (recipientName, _message, mailboxTeamName) => {
        writes.push({ recipientName, teamName: mailboxTeamName })
      },
    )

    expect(result).toEqual({
      success: false,
      error: 'unknown_phase',
      recipientName: 'scout',
      phaseId: 'phase-missing01',
    })
    expect(writes).toEqual([])
  })

  it('reuses the pinned lead phase when no explicit phase id is provided', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'openjaws-direct-message-'))
    process.env.CLAUDE_CONFIG_DIR = configDir

    const teamName = 'bridge-crew'
    const teamFilePath = getTeamFilePath(teamName)
    mkdirSync(dirname(teamFilePath), { recursive: true })
    await writeTeamFileAsync(teamName, {
      name: teamName,
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
          activePhaseId: 'phase-bridge01',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          terminalContextId: 'term-scout02',
          agentId: 'scout@bridge-crew',
          agentName: 'scout',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          projectRoot: 'C:\\Users\\Knight\\Desktop\\cheeks',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      phaseReceipts: [
        {
          phaseId: 'phase-bridge01',
          label: 'bridge phase',
          status: 'active',
          createdAt: 1,
          updatedAt: 1,
          sourceAgentId: 'team-lead@bridge-crew',
          sourceAgentName: 'team-lead',
          sourceTerminalContextId: 'term-lead01',
          targetAgentIds: ['scout@bridge-crew'],
          targetAgentNames: ['scout'],
          targetTerminalContextIds: ['term-scout02'],
          collaboratorAgentIds: [],
          projectRoots: ['D:\\openjaws\\OpenJaws', 'C:\\Users\\Knight\\Desktop\\cheeks'],
          requestSummary: 'Keep the OCI bridge aligned.',
          deliveries: [
            {
              kind: 'request',
              timestamp: '2026-04-15T12:00:00.000Z',
              fromAgentId: 'team-lead@bridge-crew',
              fromAgentName: 'team-lead',
              toAgentIds: ['scout@bridge-crew'],
              toAgentNames: ['scout'],
              summary: 'Keep the OCI bridge aligned.',
            },
          ],
        },
      ],
    } satisfies TeamFile)

    const teamContext: AppState['teamContext'] = {
      teamName,
      teamFilePath,
      leadAgentId: 'team-lead@bridge-crew',
      leadTerminalContextId: 'term-lead01',
      teammates: {
        'scout@bridge-crew': {
          name: 'scout',
          color: 'blue',
          tmuxSessionName: 'swarm',
          tmuxPaneId: '%2',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          terminalContextId: 'term-scout02',
          spawnedAt: 2,
        },
      },
    }

    const writes: Array<{ recipientName: string; teamName: string }> = []
    const result = await sendDirectMemberMessage(
      'scout',
      'keep going',
      teamContext,
      undefined,
      async (recipientName, _message, mailboxTeamName) => {
        writes.push({ recipientName, teamName: mailboxTeamName })
      },
    )

    const updated = await readTeamFileAsync(teamName)

    expect(result).toEqual({
      success: true,
      recipientName: 'scout',
    })
    expect(writes).toEqual([{ recipientName: 'scout', teamName }])
    expect(updated?.phaseReceipts).toHaveLength(1)
    expect(updated?.phaseReceipts?.[0]?.deliveries).toHaveLength(2)
    expect(updated?.phaseReceipts?.[0]?.deliveries.at(-1)?.summary).toBe(
      'keep going',
    )
    expect(updated?.terminalContexts?.find(c => c.agentId === 'scout@bridge-crew')?.activePhaseId).toBe(
      'phase-bridge01',
    )
  })
})
