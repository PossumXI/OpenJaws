import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { AppState } from '../state/AppState.js'
import {
  parseDirectMemberMessage,
  sendDirectMemberMessage,
} from './directMemberMessage.js'
import { getTeamFilePath, type TeamFile, writeTeamFileAsync } from './swarm/teamHelpers.js'

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
})
