import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildDiscordRoundtableRuntimeStatusLines,
  buildDiscordRoundtableSessionStatusLines,
  loadDiscordRoundtableRuntimeState,
  readDiscordRoundtableSessionSnapshot,
} from './discordRoundtableRuntime.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) {
      rmSync(path, { recursive: true, force: true })
    }
  }
})

describe('discord roundtable status truth', () => {
  it('prefers the live session snapshot over stale queue aliases in status output', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-status-truth-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })

    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'queued',
          updatedAt: '2026-04-21T00:00:00.000Z',
          roundtableChannelName: 'q-roundtable',
          lastSummary: 'queue state says roundtable is queued',
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
          status: 'queued',
          updatedAt: '2026-04-21T00:00:00.000Z',
          startedAt: '2026-04-21T00:00:00.000Z',
          endsAt: '2026-04-21T04:01:00.000Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          roundtableChannelName: 'q-roundtable',
          generalChannelId: 'general-1',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice-1',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 3,
          nextPersona: 'viola',
          lastSpeaker: 'q',
          lastSummary: 'session snapshot says roundtable is queued',
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
        '[2026-04-21T00:01:00.000Z] roundtable window 1 live in #dev_support (1426904647313916014), ends 2026-04-21T04:01:00.000Z',
        '[2026-04-21T00:07:09.643Z] Q action awaiting_approval: Q audit-and-tighten pass',
      ].join('\n'),
      'utf8',
    )

    const state = loadDiscordRoundtableRuntimeState(root)
    const session = readDiscordRoundtableSessionSnapshot(
      root,
      new Date('2026-04-21T00:07:10.000Z'),
    )

    expect(state.roundtableChannelName).toBe('dev_support')
    expect(state.status).toBe('awaiting_approval')
    expect(session?.roundtableChannelName).toBe('dev_support')
    expect(session?.status).toBe('awaiting_approval')

    const statusLines = [
      ...(session ? buildDiscordRoundtableSessionStatusLines(session) : []),
      ...buildDiscordRoundtableRuntimeStatusLines(state),
    ]

    expect(statusLines[0]).toBe('Live roundtable: awaiting_approval · #dev_support')
    expect(statusLines).toContain(
      'Live summary: Q action awaiting_approval: Q audit-and-tighten pass',
    )
    expect(statusLines).toContain(
      'Roundtable: awaiting_approval · queued 0 · running 0 · awaiting approval 0 · completed 0 · rejected 0 · errors 0',
    )
    expect(statusLines).toContain('Update channel: #dev_support')
  })
})
