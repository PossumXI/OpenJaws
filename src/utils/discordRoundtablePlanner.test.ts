import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { planDiscordRoundtableFollowThrough } from './discordRoundtablePlanner.js'

const tempDirs: string[] = []

afterEach(() => {
  // Skip cleanup to avoid EBUSY errors during tests
  tempDirs.length = 0;
})

function createRoot(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(root)
  return root
}

describe('discordRoundtablePlanner', () => {
  it('stages a scoped synthetic handoff when the live roundtable is running but drifting into PASS', () => {
    const root = createRoot('oj-roundtable-planner-')
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
          updatedAt: '2026-04-22T02:22:09.541Z',
          roundtableChannelName: 'dev_support',
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
          updatedAt: '2026-04-22T02:22:09.541Z',
          startedAt: '2026-04-22T01:51:40.181Z',
          endsAt: '2026-04-22T05:51:40.181Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'dev_support',
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
      join(runtimeDir, 'discord-roundtable-memory.json'),
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2026-04-22T02:21:59.000Z',
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
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-actions.json'),
      JSON.stringify(
        [
          {
            id: 'older-weak-outcome',
            targetPath: repoRoot,
            status: 'skipped',
            completedAt: '2026-04-22T01:55:00.000Z',
            changedFiles: [],
            commitSha: null,
            verificationSummary: 'no code changes detected',
          },
        ],
        null,
        2,
      ),
      'utf8',
    )

    const result = planDiscordRoundtableFollowThrough({
      root,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-22T02:22:30.000Z'),
    })

    expect(result.staged).toBe(true)
    expect(result.repoLabel).toBe('openjaws')
    expect(result.personaName).toBe('Q')
    expect(result.targetPath).toBe(join(repoRoot, 'src', 'utils'))
    expect(result.workKey).toBe('openjaws::src/utils')
    expect(result.handoffPath).not.toBeNull()

    const handoff = JSON.parse(readFileSync(result.handoffPath!, 'utf8')) as {
      roundtableActions: Array<{
        role: string
        workspaceScope: { repoPath: string }
        executionArtifact: { authorityBound: boolean; workspaceMaterialized: boolean }
      }>
    }
    expect(handoff.roundtableActions).toHaveLength(1)
    expect(handoff.roundtableActions[0]?.role).toBe('Q')
    expect(handoff.roundtableActions[0]?.workspaceScope.repoPath).toBe(
      join(repoRoot, 'src', 'utils'),
    )
    expect(
      handoff.roundtableActions[0]?.executionArtifact.authorityBound,
    ).toBe(true)
    expect(
      handoff.roundtableActions[0]?.executionArtifact.workspaceMaterialized,
    ).toBe(true)
  })

  it('narrows broad allowed parent directories to exact git checkout roots', () => {
    const root = createRoot('oj-roundtable-planner-parent-')
    const broadParent = join(root, 'repos')
    const repoRoot = join(broadParent, 'OpenJaws')
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
          updatedAt: '2026-04-29T20:55:00.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q passed turn 9',
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
          updatedAt: '2026-04-29T20:55:00.000Z',
          startedAt: '2026-04-29T20:00:00.000Z',
          endsAt: '2026-04-30T00:00:00.000Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'dev_support',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 9,
          nextPersona: 'q',
          lastSpeaker: 'viola',
          lastSummary: 'Q passed turn 9',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = planDiscordRoundtableFollowThrough({
      root,
      allowedRoots: [broadParent],
      now: new Date('2026-04-29T20:56:00.000Z'),
    })

    expect(result.staged).toBe(true)
    expect(result.repoLabel).toBe('OpenJaws')
    expect(result.targetPath).toBe(join(repoRoot, 'src', 'utils'))
    expect(result.workKey).toBe('openjaws::src/utils')
  })

  it('does not stage a synthetic handoff while tracked governed work is already active', () => {
    const root = createRoot('oj-roundtable-planner-active-')
    const repoRoot = join(root, 'openjaws')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    mkdirSync(join(repoRoot, 'src'), { recursive: true })

    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'queued',
          updatedAt: '2026-04-22T02:22:09.541Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Queued one action already.',
          lastError: null,
          activeJobId: null,
          ingestedHandoffs: [],
          jobs: [
            {
              kind: 'roundtable',
              id: 'job-1',
              status: 'queued',
              approvalState: null,
            },
          ],
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
          updatedAt: '2026-04-22T02:22:09.541Z',
          startedAt: '2026-04-22T01:51:40.181Z',
          endsAt: '2026-04-22T05:51:40.181Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'dev_support',
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

    const result = planDiscordRoundtableFollowThrough({
      root,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-22T02:22:30.000Z'),
    })

    expect(result.staged).toBe(false)
    expect(result.reason).toContain('tracked queue already has active governed work')
  })

  it('throttles recent weak tracked outcomes before staging another follow-through', () => {
    const root = createRoot('oj-roundtable-planner-weak-cooldown-')
    const repoRoot = join(root, 'OpenJaws')
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
          updatedAt: '2026-04-29T21:10:00.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q passed turn 9',
          lastError: null,
          activeJobId: null,
          ingestedHandoffs: [],
          jobs: [
            {
              kind: 'roundtable',
              id: 'recent-no-diff',
              status: 'skipped',
              approvalState: null,
              targetPath: join(repoRoot, 'src', 'utils'),
              changedFiles: [],
              commitSha: null,
              completedAt: '2026-04-29T21:07:00.000Z',
              verificationSummary: 'No file changes were detected.',
            },
          ],
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
          updatedAt: '2026-04-29T21:10:00.000Z',
          startedAt: '2026-04-29T21:00:00.000Z',
          endsAt: '2026-04-30T01:00:00.000Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'dev_support',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 9,
          nextPersona: 'q',
          lastSpeaker: 'viola',
          lastSummary: 'Q passed turn 9',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = planDiscordRoundtableFollowThrough({
      root,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-29T21:12:00.000Z'),
    })

    expect(result.staged).toBe(false)
    expect(result.reason).toBe('recent governed action already launched')
  })

  it('allows a quick scoped follow-through shortly after a completed action', () => {
    const root = createRoot('oj-roundtable-planner-follow-through-')
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
          updatedAt: '2026-04-22T02:38:30.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q action completed: Q audit-and-tighten pass',
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
          updatedAt: '2026-04-22T02:38:30.000Z',
          startedAt: '2026-04-22T02:35:54.441Z',
          endsAt: '2026-04-22T06:35:54.441Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'dev_support',
          generalChannelId: 'general',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 1,
          nextPersona: 'viola',
          lastSpeaker: 'q',
          lastSummary: 'Q action completed: Q audit-and-tighten pass',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-memory.json'),
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2026-04-22T02:38:20.000Z',
          summary: 'Need another scoped OpenJaws change while the channel is still active.',
          currentFocus: 'Carry the first governed action into a second bounded code pass.',
          lastHumanQuestion: 'keep going',
          openThreads: ['follow through on runtime truth'],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-actions.json'),
      JSON.stringify(
        [
          {
            id: 'completed-action',
            targetPath: join(repoRoot, 'src', 'utils'),
            status: 'completed',
            completedAt: '2026-04-22T02:36:38.000Z',
            changedFiles: ['src/utils/discordRoundtableRuntime.ts'],
            commitSha: 'abc1234',
            verificationSummary: 'verified',
          },
        ],
        null,
        2,
      ),
      'utf8',
    )

    const result = planDiscordRoundtableFollowThrough({
      root,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-22T02:38:30.000Z'),
    })

    expect(result.staged).toBe(true)
    expect(result.personaName).toBe('Viola')
    expect(result.targetPath).toBe(join(repoRoot, 'src', 'utils'))
  })

  it('backs off when the tracked queue recently produced a no-diff action', () => {
    const root = createRoot('oj-roundtable-planner-no-diff-cooldown-')
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
          updatedAt: '2026-04-29T21:03:00.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Viola action completed: no code changes detected.',
          lastError: null,
          activeJobId: null,
          ingestedHandoffs: [],
          jobs: [
            {
              kind: 'roundtable',
              id: 'recent-no-diff',
              status: 'skipped',
              approvalState: null,
              targetPath: join(repoRoot, 'src', 'utils'),
              changedFiles: [],
              commitSha: null,
              verificationSummary:
                'No file changes were detected, so no verification run was required.',
              completedAt: '2026-04-29T21:00:00.000Z',
            },
          ],
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
          updatedAt: '2026-04-29T21:03:00.000Z',
          startedAt: '2026-04-29T20:57:57.993Z',
          endsAt: '2026-04-30T00:57:57.993Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'dev_support',
          generalChannelId: 'general',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 7,
          nextPersona: 'q',
          lastSpeaker: 'viola',
          lastSummary: 'Viola action completed: no code changes detected.',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-memory.json'),
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2026-04-29T21:02:30.000Z',
          summary: 'The live channel is drifting back into PASS turns.',
          currentFocus: 'Need another scoped OpenJaws follow-through pass.',
          lastHumanQuestion: 'keep going',
          openThreads: ['follow through on runtime truth'],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = planDiscordRoundtableFollowThrough({
      root,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-29T21:03:00.000Z'),
    })

    expect(result).toMatchObject({
      staged: false,
      reason: 'recent governed action already launched',
    })
  })

  it('ignores already-ingested handoff files when deciding whether the inbox is blocked', () => {
    const root = createRoot('oj-roundtable-planner-ingested-')
    const repoRoot = join(root, 'openjaws')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    mkdirSync(join(repoRoot, 'src', 'utils'), { recursive: true })

    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const handoffDir = join(runtimeDir, 'handoffs')
    mkdirSync(handoffDir, { recursive: true })
    const ingestedHandoffPath = join(
      handoffDir,
      '20260422T024252-blackbeak-openjaws-follow-through.json',
    )
    writeFileSync(
      ingestedHandoffPath,
      JSON.stringify(
        {
          sessionId: '2026-04-22T02:35:54.441Z',
          scheduleId: '2026-04-22T06:35:54.441Z',
          handoffKey: 'synthetic:already-ingested',
          roundtableActions: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-22T18:32:15.255Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q posted turn 13',
          lastError: null,
          activeJobId: null,
          ingestedHandoffs: [ingestedHandoffPath],
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
          updatedAt: '2026-04-22T18:32:15.255Z',
          startedAt: '2026-04-22T17:32:15.255Z',
          endsAt: '2026-04-22T21:32:15.255Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'dev_support',
          generalChannelId: 'general',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 13,
          nextPersona: 'blackbeak',
          lastSpeaker: 'q',
          lastSummary: 'Q posted turn 13',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-memory.json'),
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2026-04-22T18:32:10.000Z',
          summary: 'The live channel is drifting back into PASS turns.',
          currentFocus: 'Need another scoped OpenJaws follow-through pass.',
          lastHumanQuestion: 'keep going',
          openThreads: ['follow through on runtime truth'],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-actions.json'),
      JSON.stringify(
        [
          {
            id: 'older-skipped-action',
            targetPath: join(repoRoot, 'src', 'utils'),
            status: 'skipped',
            completedAt: '2026-04-22T18:04:52.858Z',
            changedFiles: [],
            commitSha: null,
            verificationSummary: 'No file changes were detected, so no verification run was required.',
          },
        ],
        null,
        2,
      ),
      'utf8',
    )

    const result = planDiscordRoundtableFollowThrough({
      root,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-22T18:32:30.000Z'),
    })

    expect(result.staged).toBe(true)
    expect(result.personaName).toBe('Blackbeak')
    expect(result.targetPath).toBe(join(repoRoot, 'src', 'utils'))
    expect(result.handoffPath).not.toBeNull()
    expect(result.handoffPath).not.toBe(ingestedHandoffPath)
  })
})
