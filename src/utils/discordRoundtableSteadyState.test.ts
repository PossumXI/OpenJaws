import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { runDiscordRoundtableSteadyStatePass } from './discordRoundtableSteadyState.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) {
      rmSync(path, { recursive: true, force: true })
    }
  }
})

describe('discordRoundtableSteadyState', () => {
  it('returns the tracked sync snapshot plus planner output from one shared pass', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-steady-state-'))
    tempDirs.push(root)

    const repoRoot = join(root, 'openjaws')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    mkdirSync(join(repoRoot, 'src', 'utils'), { recursive: true })

    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })

    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2126-04-22T02:22:09.541Z',
          roundtableChannelName: 'q-roundtable',
          lastSummary: 'Blackbeak passed turn 9',
          lastError: null,
          activeJobId: null,
          ingestedHandoffs: [],
          jobs: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.session.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2126-04-22T02:22:09.541Z',
          startedAt: '2126-04-22T01:51:40.181Z',
          endsAt: '2126-04-22T05:51:40.181Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'q-roundtable',
          generalChannelId: 'general',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 9,
          nextPersona: 'q',
          lastSpeaker: 'blackbeak',
          lastSummary: 'Blackbeak passed turn 9',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.log'),
      [
        '[2126-04-22T02:22:25.000Z] roundtable window 1 live in #dev_support (123), ends 2126-04-22T06:22:25.000Z',
        '[2126-04-22T02:22:30.000Z] Blackbeak passed turn 9',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-memory.json'),
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2126-04-22T02:21:59.000Z',
          summary: 'Need a real OpenJaws code-bearing follow-through pass.',
          currentFocus: 'OpenJaws runtime truth',
          lastHumanQuestion: null,
          openThreads: [],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = runDiscordRoundtableSteadyStatePass({
      root,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-22T02:22:30.000Z'),
    })

    expect(result.queueStatePath).toBe(
      join(runtimeDir, 'discord-roundtable-queue.state.json'),
    )
    expect(result.sessionStatePath).toBe(
      join(runtimeDir, 'discord-roundtable.session.json'),
    )
    expect(result.status).toBe('running')
    expect(result.channelName).toBe('dev_support')
    expect(result.turnCount).toBe(9)
    expect(result.lastSummary).toBe('Blackbeak passed turn 9')
    expect(result.sync.state.roundtableChannelName).toBe('dev_support')
    expect(result.planner.reason).toContain('staged a scoped follow-through handoff')
    expect(result.planner.targetPath).toBe(join(repoRoot, 'src', 'utils'))
  })
})
