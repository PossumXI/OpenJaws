import { afterEach, describe, expect, it } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import {
  bootstrapDiscordRoundtableRuntime,
  createDiscordRoundtableRuntimeState,
  loadDiscordRoundtableSessionState,
  formatDiscordRoundtableRuntimeStatus,
  formatDiscordRoundtableTransitionReceipt,
  getDiscordRoundtableQuarantineDir,
  getDiscordRoundtableQueueStatePath,
  getDiscordRoundtableSessionStatePath,
  getOpenJawsOperatorStatePath,
  ingestDiscordRoundtableHandoff,
  loadDiscordRoundtableRuntimeState,
  processDiscordRoundtableRuntime,
  syncDiscordRoundtableRuntimeState,
  type DiscordRoundtableTrackedJob,
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

function createRepoRoot(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(root)
  mkdirSync(join(root, '.git'), { recursive: true })
  return root
}

describe('discordRoundtableRuntime', () => {
  it('loads BOM-prefixed runtime JSON written by PowerShell tools', () => {
    const root = createRepoRoot('oj-roundtable-runtime-bom-')
    const state = createDiscordRoundtableRuntimeState({
      now: new Date('2026-04-30T00:00:00.000Z'),
      roundtableChannelName: 'dev_support',
    })
    mkdirSync(dirname(getDiscordRoundtableQueueStatePath(root)), {
      recursive: true,
    })
    writeFileSync(
      getDiscordRoundtableQueueStatePath(root),
      `\uFEFF${JSON.stringify(
        {
          ...state,
          status: 'running',
          lastSummary: 'Roundtable live in #dev_support.',
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    expect(loadDiscordRoundtableRuntimeState(root)).toMatchObject({
      status: 'running',
      roundtableChannelName: 'dev_support',
      lastSummary: 'Roundtable live in #dev_support.',
    })
  })

  it('ingests governed handoffs into queued repo-scoped jobs', () => {
    const repoRoot = createRepoRoot('oj-roundtable-repo-')
    mkdirSync(join(repoRoot, 'src'), { recursive: true })
    const handoffPath = join(repoRoot, 'handoff.json')
    writeFileSync(
      handoffPath,
      JSON.stringify(
        {
          sessionId: 'session-a',
          scheduleId: 'schedule-a',
          actions: [
            {
              id: 'action-a',
              repoId: 'openjaws',
              repoLabel: 'OpenJaws',
              role: 'Violet',
              objective: 'Harden the orchestrator',
              rationale: 'Close the roundtable execution gap.',
              workspaceScope: {
                repoPath: repoRoot,
              },
              executionArtifact: {
                executionReady: true,
                workspaceMaterialized: true,
                authorityBound: true,
              },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    const ingested = ingestDiscordRoundtableHandoff({
      state: createDiscordRoundtableRuntimeState(),
      handoffPath,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-20T20:00:00.000Z'),
    })

    expect(ingested.ingestedCount).toBe(1)
    expect(ingested.state.jobs).toHaveLength(1)
    expect(ingested.state.jobs[0]?.status).toBe('queued')
    expect(ingested.state.jobs[0]?.projectKey).toBe('openjaws')
    expect(ingested.state.jobs[0]?.targetPath).toBe(join(repoRoot, 'src'))
    expect(ingested.state.jobs[0]?.workKey).toBe('openjaws::src')
    expect(ingested.state.jobs[0]?.action.targetPath).toBe(join(repoRoot, 'src'))
    expect(ingested.state.jobs[0]?.action.prompt).toContain(
      `Assigned target path: ${join(repoRoot, 'src')}`,
    )
    expect(ingested.state.jobs[0]?.action.prompt).toContain(
      'Objective: Harden the orchestrator',
    )
  })

  it('rejects handoffs that are not authority-bound execution lanes', () => {
    const repoRoot = createRepoRoot('oj-roundtable-unsafe-repo-')
    const nestedWorkspace = join(repoRoot, 'packages', 'discord')
    mkdirSync(nestedWorkspace, { recursive: true })
    const handoffPath = join(repoRoot, 'handoff-unsafe.json')
    writeFileSync(
      handoffPath,
      JSON.stringify(
        {
          sessionId: 'session-unsafe',
          actions: [
            {
              id: 'action-unsafe',
              repoId: 'openjaws',
              repoLabel: 'OpenJaws',
              role: 'Viola',
              objective: 'Run from a manually checked out workspace',
              rationale: 'This should never queue.',
              workspaceScope: {
                repoPath: nestedWorkspace,
              },
              executionArtifact: {
                executionReady: true,
                requiresManualCheckout: true,
                workspaceMaterialized: false,
                authorityBound: false,
              },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    const ingested = ingestDiscordRoundtableHandoff({
      state: createDiscordRoundtableRuntimeState(),
      handoffPath,
      allowedRoots: [repoRoot],
      now: new Date('2026-04-20T20:01:00.000Z'),
    })

    expect(ingested.ingestedCount).toBe(0)
    expect(ingested.state.jobs).toHaveLength(0)
  })

  it('reconciles stale state with the live roundtable log snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-log-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T00:00:00.000Z',
          roundtableChannelName: 'q-roundtable',
          lastSummary: 'roundtable booting',
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
      join(runtimeDir, 'discord-roundtable.log'),
      [
        '[2026-04-21T00:01:00.000Z] roundtable window 1 live in #dev_support (1426904647313916014), ends 2026-04-21T04:01:00.000Z',
        '[2026-04-21T00:07:09.643Z] Q action awaiting_approval: Q audit-and-tighten pass',
      ].join('\n'),
      'utf8',
    )

    const state = loadDiscordRoundtableRuntimeState(root)

    expect(state.roundtableChannelName).toBe('dev_support')
    expect(state.updatedAt).toBe('2026-04-21T00:07:09.643Z')
    expect(state.lastSummary).toBe(
      'Q action awaiting_approval: Q audit-and-tighten pass',
    )
    expect(state.status).toBe('awaiting_approval')
  })

  it('classifies executing queued actions as running instead of queued', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-executing-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T00:00:00.000Z',
          roundtableChannelName: 'q-roundtable',
          lastSummary: 'roundtable booting',
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
      join(runtimeDir, 'discord-roundtable.log'),
      [
        '[2026-04-21T00:01:00.000Z] roundtable window 1 live in #dev_support (1426904647313916014), ends 2026-04-21T04:01:00.000Z',
        '[2026-04-21T00:02:00.000Z] Q executing queued action "Q audit-and-tighten pass" in D:\\openjaws\\OpenJaws\\src',
      ].join('\n'),
      'utf8',
    )

    const state = loadDiscordRoundtableRuntimeState(root)

    expect(state.status).toBe('running')
    expect(state.lastSummary).toBe(
      'Q executing queued action "Q audit-and-tighten pass" in D:\\openjaws\\OpenJaws\\src',
    )
  })

  it('loads live session metadata from the legacy mixed state file without polluting the tracked queue state', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-session-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T00:25:52.409Z',
          roundtableChannelName: 'q-roundtable',
          lastSummary: 'Viola action queued',
          lastError: null,
          activeJobId: null,
          ingestedHandoffs: [],
          jobs: [],
          startedAt: '2026-04-20T23:58:32.098Z',
          endsAt: '2026-04-21T03:58:32.098Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          turnCount: 5,
          nextPersona: 'blackbeak',
          lastSpeaker: 'viola',
          processedCommandMessageIds: ['msg-1'],
        },
        null,
        2,
      ),
      'utf8',
    )

    const queueState = loadDiscordRoundtableRuntimeState(root)
    const sessionState = loadDiscordRoundtableSessionState(root)

    expect('startedAt' in queueState).toBe(false)
    expect(sessionState).toMatchObject({
      startedAt: '2026-04-20T23:58:32.098Z',
      endsAt: '2026-04-21T03:58:32.098Z',
      guildId: 'guild-1',
      roundtableChannelId: 'channel-1',
      turnCount: 5,
      nextPersona: 'blackbeak',
      lastSpeaker: 'viola',
    })
  })

  it('prefers nested bundle runtime session and log data when the live roundtable falls back to the bundled entrypoint', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-bundle-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const nestedRuntimeDir = join(runtimeDir, 'roundtable-runtime')
    mkdirSync(nestedRuntimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T12:00:00.000Z',
          roundtableChannelName: 'q-roundtable',
          lastSummary: 'stale top-level state',
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
      join(nestedRuntimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T13:14:57.078Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q posted turn 1',
          lastError: null,
          startedAt: '2026-04-21T13:14:12.770Z',
          endsAt: '2026-04-21T17:14:12.770Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          turnCount: 1,
          nextPersona: 'viola',
          lastSpeaker: 'q',
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.log'),
      [
        '[2026-04-21T13:14:13.838Z] roundtable live in #dev_support (1426904647313916014), ends 2026-04-21T17:14:12.770Z',
        '[2026-04-21T13:14:57.074Z] Q posted turn 1',
      ].join('\n'),
      'utf8',
    )

    const queueState = loadDiscordRoundtableRuntimeState(root)
    const sessionState = loadDiscordRoundtableSessionState(root)

    expect(queueState.roundtableChannelName).toBe('dev_support')
    expect(queueState.lastSummary).toBe('Q posted turn 1')
    expect(queueState.updatedAt).toBe('2026-04-21T13:14:57.074Z')
    expect(sessionState).toMatchObject({
      roundtableChannelName: 'dev_support',
      status: 'running',
      startedAt: '2026-04-21T13:14:12.770Z',
      endsAt: '2026-04-21T17:14:12.770Z',
      turnCount: 1,
      nextPersona: 'viola',
      lastSpeaker: 'q',
      lastSummary: 'Q posted turn 1',
    })
  })

  it('clears stale stored errors after newer nested roundtable progress recovers', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-recovered-error-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const nestedRuntimeDir = join(runtimeDir, 'roundtable-runtime')
    mkdirSync(nestedRuntimeDir, { recursive: true })
    const staleError =
      '{"ok": false, "error": "Internal Server Error", "error_type": "InternalServerError"}'
    writeFileSync(
      getDiscordRoundtableQueueStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-05-02T02:06:26.366Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q turn error: Internal Server Error',
          lastError: staleError,
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
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-05-02T02:06:26.366Z',
          startedAt: '2026-05-02T01:43:32.088Z',
          endsAt: '2026-05-03T01:43:32.088Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          roundtableChannelName: 'dev_support',
          generalChannelId: 'general-1',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice-1',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 7,
          nextPersona: 'viola',
          lastSpeaker: 'q',
          lastSummary: 'Q turn error: Internal Server Error',
          lastError: staleError,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-05-02T02:13:22.314Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Blackbeak posted turn 9',
          lastError: null,
          startedAt: '2026-05-02T01:43:32.088Z',
          endsAt: '2026-05-03T01:43:32.088Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          generalChannelId: 'general-1',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice-1',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 9,
          nextPersona: 'q',
          lastSpeaker: 'blackbeak',
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.log'),
      [
        '[2026-05-02T02:06:26.366Z] Q turn error: Internal Server Error',
        '[2026-05-02T02:10:03.464Z] Viola posted turn 8',
        '[2026-05-02T02:13:22.314Z] Blackbeak posted turn 9',
      ].join('\n'),
      'utf8',
    )

    const queueState = loadDiscordRoundtableRuntimeState(root)
    const sessionState = loadDiscordRoundtableSessionState(root)

    expect(queueState).toMatchObject({
      status: 'running',
      updatedAt: '2026-05-02T02:13:22.314Z',
      lastSummary: 'Blackbeak posted turn 9',
      lastError: null,
    })
    expect(sessionState).toMatchObject({
      status: 'running',
      updatedAt: '2026-05-02T02:13:22.314Z',
      turnCount: 9,
      lastSummary: 'Blackbeak posted turn 9',
      lastError: null,
    })

    const synced = syncDiscordRoundtableRuntimeState(
      root,
      new Date('2026-05-02T02:14:00.000Z'),
    )

    expect(synced.changed).toBe(true)
    expect(
      JSON.parse(readFileSync(getDiscordRoundtableQueueStatePath(root), 'utf8')),
    ).toMatchObject({
      status: 'running',
      lastSummary: 'Blackbeak posted turn 9',
      lastError: null,
    })
    expect(
      JSON.parse(readFileSync(getDiscordRoundtableSessionStatePath(root), 'utf8')),
    ).toMatchObject({
      status: 'running',
      lastSummary: 'Blackbeak posted turn 9',
      lastError: null,
    })
  })

  it('keeps active job errors until the governed job leaves the active lane', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-active-error-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    const activeError = 'OpenJaws scripted operator job timed out.'
    const activeJob = {
      kind: 'roundtable',
      id: 'job-active',
      branchName: 'discord-q-job-active',
      worktreePath: 'D:\\worktree',
      workspacePath: 'D:\\repo',
      changedFiles: [],
      summary: 'OpenJaws · Q · Active repair',
      status: 'running',
      approvalState: null,
      workKey: 'openjaws::src/utils',
      projectKey: 'openjaws',
      sourcePath: 'D:\\handoff.json',
      sourceSessionId: 'session-1',
      sourceScheduleId: 'schedule-1',
      handoffKey: 'handoff-1',
      repoId: 'openjaws',
      repoLabel: 'OpenJaws',
      role: 'Q',
      objective: 'Active repair',
      rationale: 'Keep active failures visible until they are reconciled.',
      commandHint: null,
      targetPath: 'D:\\repo\\src\\utils',
      targetRootLabel: 'OpenJaws',
      receiptPath: null,
      outputDir: 'D:\\output',
      commitStatement: null,
      decisionTraceId: null,
      routeSuggestion: null,
      executionReady: true,
      requiresManualCheckout: false,
      workspaceMaterialized: true,
      authorityBound: true,
      completedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      leaseClaimedAt: '2026-05-02T02:12:00.000Z',
      leaseExpiresAt: '2026-05-02T02:42:00.000Z',
      leaseOwner: 'roundtable-runtime',
    } satisfies DiscordRoundtableTrackedJob
    writeFileSync(
      getDiscordRoundtableQueueStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-05-02T02:12:00.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q launching action "Active repair" in D:\\repo',
          lastError: activeError,
          activeJobId: activeJob.id,
          ingestedHandoffs: [],
          jobs: [activeJob],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.log'),
      [
        '[2026-05-02T02:12:00.000Z] Q launching action "Active repair" in D:\\repo',
        '[2026-05-02T02:13:22.314Z] Blackbeak posted turn 9',
      ].join('\n'),
      'utf8',
    )

    expect(loadDiscordRoundtableRuntimeState(root)).toMatchObject({
      status: 'running',
      activeJobId: activeJob.id,
      lastSummary: 'Blackbeak posted turn 9',
      lastError: activeError,
    })
  })

  it('treats early live log activity as a running roundtable instead of falling back to idle', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-live-log-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-04-22T02:47:34.853Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Roundtable bootstrapped in #dev_support.',
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
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-04-22T02:47:34.853Z',
          startedAt: '2026-04-22T02:47:34.853Z',
          endsAt: '2026-04-22T06:47:34.853Z',
          guildId: null,
          roundtableChannelId: null,
          roundtableChannelName: 'dev_support',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 0,
          nextPersona: null,
          lastSpeaker: null,
          lastSummary: 'Roundtable bootstrapped in #dev_support.',
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
        '[2026-04-22T02:47:38.970Z] roundtable live in #dev_support (1426904647313916014), ends 2026-04-22T06:47:37.660Z',
        '[2026-04-22T02:48:01.774Z] Q posted turn 1',
        '[2026-04-22T02:48:07.052Z] Q launching action "Q audit-and-tighten pass" in C:\\Users\\Knight\\Desktop\\cheeks\\Asgard',
        '[2026-04-22T02:48:16.515Z] Q action completed: Q audit-and-tighten pass',
      ].join('\n'),
      'utf8',
    )

    const queueState = loadDiscordRoundtableRuntimeState(root)
    const sessionState = loadDiscordRoundtableSessionState(root)

    expect(queueState.status).toBe('running')
    expect(queueState.lastSummary).toBe('Q action completed: Q audit-and-tighten pass')
    expect(sessionState).toMatchObject({
      status: 'running',
      roundtableChannelName: 'dev_support',
      lastSummary: 'Q action completed: Q audit-and-tighten pass',
    })
  })

  it('prefers the latest timestamped child stdout log when it is newer than discord-roundtable.log', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-stdout-log-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-04-22T02:47:34.853Z',
          roundtableChannelName: 'openjaws-updates',
          lastSummary: 'stale top-level state',
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
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-04-22T02:47:34.853Z',
          startedAt: '2026-04-22T02:47:34.853Z',
          endsAt: '2026-04-22T06:47:34.853Z',
          guildId: null,
          roundtableChannelId: null,
          roundtableChannelName: 'openjaws-updates',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 0,
          nextPersona: null,
          lastSpeaker: null,
          lastSummary: 'stale top-level state',
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
      '[2026-04-22T02:47:38.970Z] roundtable live in #openjaws-updates (111)\n',
      'utf8',
    )
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-20260422T024733Z.stdout.log'),
      [
        '[roundtable-child] entrypoint D:\\openjaws\\OpenJaws\\local-command-station\\discord-roundtable.ts',
        '[2026-04-22T02:47:38.970Z] roundtable live in #dev_support (1426904647313916014), ends 2026-04-22T06:47:37.660Z',
        '[2026-04-22T02:48:01.774Z] Q posted turn 1',
      ].join('\n'),
      'utf8',
    )

    const queueState = loadDiscordRoundtableRuntimeState(root)
    const sessionState = loadDiscordRoundtableSessionState(root)

    expect(queueState.status).toBe('running')
    expect(queueState.roundtableChannelName).toBe('dev_support')
    expect(queueState.lastSummary).toBe('Q posted turn 1')
    expect(sessionState).toMatchObject({
      status: 'running',
      roundtableChannelName: 'dev_support',
      lastSummary: 'Q posted turn 1',
    })
  })

  it('prefers the embedded child stdout timestamp when candidate log mtimes tie', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-stdout-tie-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-04-22T02:47:34.853Z',
          roundtableChannelName: 'openjaws-updates',
          lastSummary: 'stale top-level state',
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
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-04-22T02:47:34.853Z',
          startedAt: '2026-04-22T02:47:34.853Z',
          endsAt: '2026-04-22T06:47:34.853Z',
          guildId: null,
          roundtableChannelId: null,
          roundtableChannelName: 'openjaws-updates',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 0,
          nextPersona: null,
          lastSpeaker: null,
          lastSummary: 'stale top-level state',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    const legacyLogPath = join(runtimeDir, 'discord-roundtable.log')
    const childLogPath = join(
      runtimeDir,
      'discord-roundtable-20260422T024733Z.stdout.log',
    )
    writeFileSync(
      legacyLogPath,
      '[2026-04-22T02:47:38.970Z] roundtable live in #openjaws-updates (111)\n',
      'utf8',
    )
    writeFileSync(
      childLogPath,
      [
        '[roundtable-child] entrypoint D:\\openjaws\\OpenJaws\\local-command-station\\discord-roundtable.ts',
        '[2026-04-22T02:47:38.970Z] roundtable live in #dev_support (1426904647313916014), ends 2026-04-22T06:47:37.660Z',
        '[2026-04-22T02:48:01.774Z] Q posted turn 1',
      ].join('\n'),
      'utf8',
    )
    const tiedMtime = new Date('2026-04-22T02:48:10.000Z')
    utimesSync(legacyLogPath, tiedMtime, tiedMtime)
    utimesSync(childLogPath, tiedMtime, tiedMtime)

    const queueState = loadDiscordRoundtableRuntimeState(root)
    const sessionState = loadDiscordRoundtableSessionState(root)

    expect(queueState.status).toBe('running')
    expect(queueState.roundtableChannelName).toBe('dev_support')
    expect(queueState.lastSummary).toBe('Q posted turn 1')
    expect(sessionState).toMatchObject({
      status: 'running',
      roundtableChannelName: 'dev_support',
      lastSummary: 'Q posted turn 1',
    })
  })

  it('merges newer nested live session fields over stale tracked top-level session state', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-merge-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const nestedRuntimeDir = join(runtimeDir, 'roundtable-runtime')
    mkdirSync(nestedRuntimeDir, { recursive: true })
    writeFileSync(
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T12:00:00.000Z',
          startedAt: '2026-04-21T11:55:00.000Z',
          endsAt: '2026-04-21T15:55:00.000Z',
          guildId: null,
          roundtableChannelId: null,
          roundtableChannelName: 'openjaws-updates',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 0,
          nextPersona: null,
          lastSpeaker: null,
          lastSummary: 'stale top-level summary',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T13:14:57.078Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Viola posted turn 5',
          lastError: null,
          startedAt: '2026-04-21T13:14:12.770Z',
          endsAt: '2026-04-21T17:14:12.770Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          turnCount: 5,
          nextPersona: 'blackbeak',
          lastSpeaker: 'viola',
          processedCommandMessageIds: ['msg-1'],
        },
        null,
        2,
      ),
      'utf8',
    )

    const sessionState = loadDiscordRoundtableSessionState(root)

    expect(sessionState).toMatchObject({
      roundtableChannelName: 'dev_support',
      startedAt: '2026-04-21T13:14:12.770Z',
      endsAt: '2026-04-21T17:14:12.770Z',
      guildId: 'guild-1',
      roundtableChannelId: 'channel-1',
      turnCount: 5,
      nextPersona: 'blackbeak',
      lastSpeaker: 'viola',
      lastSummary: 'Viola posted turn 5',
    })
  })

  it('prefers nested live channel identity when the tracked session matches turn count but drifts to the wrong channel', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-channel-drift-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const nestedRuntimeDir = join(runtimeDir, 'roundtable-runtime')
    mkdirSync(nestedRuntimeDir, { recursive: true })
    writeFileSync(
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-22T00:01:45.822Z',
          startedAt: '2026-04-21T23:56:22.508Z',
          endsAt: '2026-04-22T03:56:22.508Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          roundtableChannelName: 'openjaws-updates',
          generalChannelId: 'general-1',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice-1',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 2,
          nextPersona: 'blackbeak',
          lastSpeaker: 'viola',
          lastSummary: 'Viola posted turn 2',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-22T00:00:35.638Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Viola posted turn 2',
          lastError: null,
          startedAt: '2026-04-21T23:56:22.508Z',
          endsAt: '2026-04-22T03:56:22.508Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          generalChannelId: 'general-1',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice-1',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 2,
          nextPersona: 'blackbeak',
          lastSpeaker: 'viola',
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )

    const sessionState = loadDiscordRoundtableSessionState(root)

    expect(sessionState).toMatchObject({
      roundtableChannelName: 'dev_support',
      roundtableChannelId: 'channel-1',
      guildId: 'guild-1',
      turnCount: 2,
      nextPersona: 'blackbeak',
      lastSpeaker: 'viola',
      lastSummary: 'Viola posted turn 2',
    })
  })

  it('syncs nested live bundle state back into tracked queue and session files', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-sync-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const nestedRuntimeDir = join(runtimeDir, 'roundtable-runtime')
    mkdirSync(nestedRuntimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable-queue.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T12:00:00.000Z',
          roundtableChannelName: 'openjaws-updates',
          lastSummary: 'stale queue summary',
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
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T12:00:00.000Z',
          startedAt: '2026-04-21T11:55:00.000Z',
          endsAt: '2026-04-21T15:55:00.000Z',
          guildId: null,
          roundtableChannelId: null,
          roundtableChannelName: 'openjaws-updates',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 0,
          nextPersona: null,
          lastSpeaker: null,
          lastSummary: 'stale queue summary',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T13:14:57.078Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q posted turn 1',
          lastError: null,
          startedAt: '2026-04-21T13:14:12.770Z',
          endsAt: '2026-04-21T17:14:12.770Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          turnCount: 1,
          nextPersona: 'viola',
          lastSpeaker: 'q',
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = syncDiscordRoundtableRuntimeState(
      root,
      new Date('2026-04-21T13:15:00.000Z'),
    )

    expect(result.changed).toBe(true)
    expect(JSON.parse(readFileSync(getDiscordRoundtableSessionStatePath(root), 'utf8'))).toMatchObject({
      roundtableChannelName: 'dev_support',
      turnCount: 1,
      lastSummary: 'Q posted turn 1',
    })
    expect(
      JSON.parse(
        readFileSync(join(runtimeDir, 'discord-roundtable-queue.state.json'), 'utf8'),
      ),
    ).toMatchObject({
      roundtableChannelName: 'dev_support',
      lastSummary: 'Q posted turn 1',
      updatedAt: '2026-04-21T13:14:57.078Z',
    })
  })

  it('bootstraps a fresh tracked session and clears stale nested bundle state', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-bootstrap-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const nestedRuntimeDir = join(runtimeDir, 'roundtable-runtime')
    mkdirSync(nestedRuntimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-04-21T12:00:00.000Z',
          roundtableChannelName: 'q-roundtable',
          lastSummary: 'roundtable completed',
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
      join(nestedRuntimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'completed',
          updatedAt: '2026-04-21T13:00:00.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'roundtable completed',
          lastError: null,
          startedAt: '2026-04-21T09:00:00.000Z',
          endsAt: '2026-04-21T13:00:00.000Z',
          turnCount: 63,
          nextPersona: 'q',
          lastSpeaker: 'viola',
          processedCommandMessageIds: ['old-message'],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.log'),
      '[2026-04-21T13:00:00.000Z] roundtable completed\n',
      'utf8',
    )

    const bootstrapped = bootstrapDiscordRoundtableRuntime({
      root,
      roundtableChannelName: 'dev_support',
      durationHours: 4,
      now: new Date('2026-04-21T14:00:00.000Z'),
    })

    const nestedState = JSON.parse(
      readFileSync(join(nestedRuntimeDir, 'discord-roundtable.state.json'), 'utf8'),
    ) as {
      status: string
      roundtableChannelName: string
      startedAt: string
      endsAt: string
      turnCount: number
      processedCommandMessageIds: string[]
    }
    const nestedMemory = JSON.parse(
      readFileSync(join(nestedRuntimeDir, 'discord-roundtable-memory.json'), 'utf8'),
    ) as {
      summary: string | null
      openThreads: unknown[]
    }
    const nestedActions = JSON.parse(
      readFileSync(join(nestedRuntimeDir, 'discord-roundtable-actions.json'), 'utf8'),
    ) as unknown[]

    expect(bootstrapped.sessionState).toMatchObject({
      status: 'running',
      roundtableChannelName: 'dev_support',
      startedAt: '2026-04-21T14:00:00.000Z',
      endsAt: '2026-04-21T18:00:00.000Z',
      turnCount: 0,
    })
    expect(bootstrapped.clearedLogPaths).toHaveLength(1)
    expect(readFileSync(join(nestedRuntimeDir, 'discord-roundtable.log'), 'utf8')).toBe('')
    expect(nestedState).toMatchObject({
      status: 'running',
      roundtableChannelName: 'dev_support',
      startedAt: '2026-04-21T14:00:00.000Z',
      endsAt: '2026-04-21T18:00:00.000Z',
      turnCount: 0,
      processedCommandMessageIds: [],
    })
    expect(nestedMemory).toEqual({
      summary: null,
      currentFocus: null,
      lastHumanQuestion: null,
      openThreads: [],
    })
    expect(nestedActions).toEqual([])
  })

  it('rehydrates the live bundle state from the tracked session file instead of stale nested session data', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-rehydrate-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const nestedRuntimeDir = join(runtimeDir, 'roundtable-runtime')
    mkdirSync(nestedRuntimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'queued',
          updatedAt: '2026-04-21T13:15:00.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Queued 1 scoped action.',
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
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T13:15:00.000Z',
          startedAt: '2026-04-21T13:14:12.770Z',
          endsAt: '2026-04-21T17:14:12.770Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          roundtableChannelName: 'dev_support',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 2,
          nextPersona: 'blackbeak',
          lastSpeaker: 'viola',
          lastSummary: 'Queued 1 scoped action.',
          lastError: null,
          processedCommandMessageIds: ['msg-1'],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'completed',
          updatedAt: '2026-04-21T18:12:22.108Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'roundtable completed and Viola posted the closing report',
          lastError: null,
          startedAt: '2026-04-21T14:10:24.736Z',
          endsAt: '2026-04-21T18:10:24.736Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          turnCount: 63,
          nextPersona: 'q',
          lastSpeaker: 'viola',
          processedCommandMessageIds: ['old-message'],
        },
        null,
        2,
      ),
      'utf8',
    )

    const bootstrapped = bootstrapDiscordRoundtableRuntime({
      root,
      roundtableChannelName: 'dev_support',
      durationHours: 4,
      now: new Date('2026-04-21T14:30:00.000Z'),
    })
    const nestedState = JSON.parse(
      readFileSync(join(nestedRuntimeDir, 'discord-roundtable.state.json'), 'utf8'),
    ) as {
      startedAt: string
      endsAt: string
      turnCount: number
      nextPersona: string
      lastSpeaker: string
      processedCommandMessageIds: string[]
    }

    expect(bootstrapped.sessionState).toMatchObject({
      startedAt: '2026-04-21T13:14:12.770Z',
      endsAt: '2026-04-21T17:14:12.770Z',
      turnCount: 2,
      nextPersona: 'blackbeak',
      lastSpeaker: 'viola',
      processedCommandMessageIds: ['msg-1'],
    })
    expect(nestedState).toMatchObject({
      startedAt: '2026-04-21T13:14:12.770Z',
      endsAt: '2026-04-21T17:14:12.770Z',
      turnCount: 2,
      nextPersona: 'blackbeak',
      lastSpeaker: 'viola',
      processedCommandMessageIds: ['msg-1'],
    })
  })

  it('processes mergeable jobs into awaiting-approval operator pushes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    const handoffPath = join(root, 'handoff.json')
    writeFileSync(
      handoffPath,
      JSON.stringify(
        {
          sessionId: 'session-b',
          scheduleId: 'schedule-b',
          actions: [
            {
              id: 'action-b',
              repoId: 'openjaws',
              repoLabel: 'OpenJaws',
              role: 'Viola',
              objective: 'Implement the roundtable runtime',
              rationale: 'Make the roundtable executable.',
              workspaceScope: {
                repoPath: repoRoot,
              },
              executionArtifact: {
                executionReady: true,
                workspaceMaterialized: true,
                authorityBound: true,
              },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = await processDiscordRoundtableRuntime({
      root,
      allowedRoots: [repoRoot],
      handoffPaths: [handoffPath],
      ingestInbox: false,
      maxActionsPerRun: 1,
      model: 'oci:Q',
      runnerScriptPath: 'D:\\openjaws\\OpenJaws\\local-command-station\\run-openjaws-visible.ps1',
      worktreeRoot: join(root, 'worktrees'),
      outputRoot: join(root, 'outputs'),
      now: () => new Date('2026-04-20T20:05:00.000Z'),
      executeAction: async args =>
        ({
          targetRootLabel: 'OpenJaws',
          gitRoot: repoRoot,
          runContext: {
            jobId: args.action.id,
            requestedWorkspace: repoRoot,
            gitRoot: repoRoot,
            gitRelativePath: '.',
            branchName: 'discord-viola-openjaws-action-b',
            worktreePath: join(
              root,
              'worktrees',
              'openjaws',
              'discord-viola-openjaws-action-b',
            ),
            workspacePath: join(
              root,
              'worktrees',
              'openjaws',
              'discord-viola-openjaws-action-b',
            ),
            repoLabel: 'openjaws',
          },
          outputDir: join(root, 'outputs', 'job-b'),
          receiptPath: join(root, 'outputs', 'job-b', 'receipt.json'),
          job: {
            runContext: {
              jobId: args.action.id,
              requestedWorkspace: repoRoot,
              gitRoot: repoRoot,
              gitRelativePath: '.',
              branchName: 'discord-viola-openjaws-action-b',
              worktreePath: join(
                root,
                'worktrees',
                'openjaws',
                'discord-viola-openjaws-action-b',
              ),
              workspacePath: join(
                root,
                'worktrees',
                'openjaws',
                'discord-viola-openjaws-action-b',
              ),
              repoLabel: 'openjaws',
            },
            outputDir: join(root, 'outputs', 'job-b'),
            result: {
              startedAt: '2026-04-20T20:05:00.000Z',
              completedAt: '2026-04-20T20:06:00.000Z',
            },
            delivery: null,
            changedFiles: ['src/utils/discordRoundtableRuntime.ts'],
            verification: {
              attempted: true,
              passed: true,
              summary: 'Verification passed: bun run build',
              command: 'bun run build',
              stdout: null,
              stderr: null,
            },
            commitSha: 'abc123',
          },
          hasCodeChanges: true,
          artifactOnly: false,
          hasDisallowedChanges: false,
          verificationPassed: true,
          mergeable: true,
        }),
    })

    const awaitingApproval = result.state.jobs.find(
      job => job.status === 'awaiting_approval',
    ) as DiscordRoundtableTrackedJob | undefined
    expect(awaitingApproval?.branchName).toBe(
      'discord-viola-openjaws-action-b',
    )
    const operatorState = JSON.parse(
      readFileSync(getOpenJawsOperatorStatePath(root), 'utf8'),
    ) as {
      pendingPushes?: Array<{ jobId: string; branchName: string }>
    }
    expect(operatorState.pendingPushes?.[0]?.jobId).toBe(awaitingApproval?.id)
    expect(operatorState.pendingPushes?.[0]?.branchName).toBe(
      'discord-viola-openjaws-action-b',
    )
    expect(result.transitionReceipts).toHaveLength(1)
    expect(result.transitionReceipts[0]?.status).toBe('awaiting_approval')
    expect(result.transitionReceipts[0]?.branchName).toBe(
      'discord-viola-openjaws-action-b',
    )
    expect(result.durationHours).toBe(4)
    expect(result.approvalTtlHours).toBe(1)
    expect(existsSync(getDiscordRoundtableSessionStatePath(root))).toBe(true)
    expect(loadDiscordRoundtableSessionState(root)).toMatchObject({
      updatedAt: '2026-04-20T20:05:00.000Z',
      status: 'awaiting_approval',
      roundtableChannelName: null,
      lastSummary:
        'OpenJaws roundtable action session-b-openjaws-action-b is awaiting approval on discord-viola-openjaws-action-b.',
      lastError: null,
    })
  })

  it('quarantines malformed handoffs without aborting later valid work', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-quarantine-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    const malformedPath = join(root, 'handoff-bad.json')
    writeFileSync(malformedPath, '# not json\nobjective: nope\n', 'utf8')
    const validPath = join(root, 'handoff-good.json')
    writeFileSync(
      validPath,
      JSON.stringify(
        {
          sessionId: 'session-quarantine',
          actions: [
            {
              id: 'action-good',
              repoId: 'openjaws',
              repoLabel: 'OpenJaws',
              role: 'Q',
              objective: 'Ship the safe path',
              rationale: 'Keep the runtime alive after malformed input.',
              workspaceScope: {
                repoPath: repoRoot,
              },
              executionArtifact: {
                executionReady: true,
                workspaceMaterialized: true,
                authorityBound: true,
              },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = await processDiscordRoundtableRuntime({
      root,
      allowedRoots: [repoRoot],
      handoffPaths: [malformedPath, validPath],
      ingestInbox: false,
      maxActionsPerRun: 0,
      model: 'oci:Q',
      runnerScriptPath:
        'D:\\openjaws\\OpenJaws\\local-command-station\\run-openjaws-visible.ps1',
      worktreeRoot: join(root, 'worktrees'),
      outputRoot: join(root, 'outputs'),
      now: () => new Date('2026-04-21T16:00:00.000Z'),
    })

    const quarantineDir = getDiscordRoundtableQuarantineDir(root)
    const quarantinedEntries = readdirSync(quarantineDir)
    expect(quarantinedEntries.some(entry => entry.endsWith('.json'))).toBe(true)
    expect(quarantinedEntries.some(entry => entry.endsWith('.meta.json'))).toBe(
      true,
    )
    expect(result.ingestedCount).toBe(1)
    expect(result.state.jobs).toHaveLength(1)
    expect(result.state.jobs[0]?.status).toBe('queued')
    expect(result.state.lastError).toBeNull()
    expect(result.state.lastSummary).toMatch(
      /^Ingested 1 roundtable action from .*handoff-good\.json\.$/,
    )
  })

  it('holds back mixed artifact output instead of creating an approval candidate', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-reject-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    const handoffPath = join(root, 'handoff.json')
    writeFileSync(
      handoffPath,
      JSON.stringify(
        {
          sessionId: 'session-c',
          actions: [
            {
              id: 'action-c',
              repoId: 'immaculate',
              repoLabel: 'Immaculate',
              role: 'Blackbeak',
              objective: 'Trim artifact spillover',
              rationale: 'Keep approval-safe code only.',
              workspaceScope: {
                repoPath: repoRoot,
              },
              executionArtifact: {
                executionReady: true,
                workspaceMaterialized: true,
                authorityBound: true,
              },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = await processDiscordRoundtableRuntime({
      root,
      allowedRoots: [repoRoot],
      handoffPaths: [handoffPath],
      ingestInbox: false,
      maxActionsPerRun: 1,
      model: 'oci:Q',
      runnerScriptPath: 'D:\\openjaws\\OpenJaws\\local-command-station\\run-openjaws-visible.ps1',
      worktreeRoot: join(root, 'worktrees'),
      outputRoot: join(root, 'outputs'),
      now: () => new Date('2026-04-20T20:10:00.000Z'),
      executeAction: async args =>
        ({
          targetRootLabel: 'Immaculate',
          gitRoot: repoRoot,
          runContext: {
            jobId: args.action.id,
            requestedWorkspace: repoRoot,
            gitRoot: repoRoot,
            gitRelativePath: '.',
            branchName: 'discord-blackbeak-immaculate-action-c',
            worktreePath: join(
              root,
              'worktrees',
              'immaculate',
              'discord-blackbeak-immaculate-action-c',
            ),
            workspacePath: join(
              root,
              'worktrees',
              'immaculate',
              'discord-blackbeak-immaculate-action-c',
            ),
            repoLabel: 'immaculate',
          },
          outputDir: join(root, 'outputs', 'job-c'),
          receiptPath: join(root, 'outputs', 'job-c', 'receipt.json'),
          job: {
            runContext: {
              jobId: args.action.id,
              requestedWorkspace: repoRoot,
              gitRoot: repoRoot,
              gitRelativePath: '.',
              branchName: 'discord-blackbeak-immaculate-action-c',
              worktreePath: join(
                root,
                'worktrees',
                'immaculate',
                'discord-blackbeak-immaculate-action-c',
              ),
              workspacePath: join(
                root,
                'worktrees',
                'immaculate',
                'discord-blackbeak-immaculate-action-c',
              ),
              repoLabel: 'immaculate',
            },
            outputDir: join(root, 'outputs', 'job-c'),
            result: {
              startedAt: '2026-04-20T20:10:00.000Z',
              completedAt: '2026-04-20T20:11:00.000Z',
            },
            delivery: null,
            changedFiles: ['apps/harness/src/server.ts', 'receipt.json'],
            verification: {
              attempted: true,
              passed: true,
              summary: 'Verification passed: bun run build',
              command: 'bun run build',
              stdout: null,
              stderr: null,
            },
            commitSha: null,
          },
          hasCodeChanges: true,
          artifactOnly: false,
          hasDisallowedChanges: true,
          verificationPassed: true,
          mergeable: false,
        }),
    })

    expect(
      result.state.jobs.some(job => job.status === 'awaiting_approval'),
    ).toBe(false)
    expect(existsSync(getOpenJawsOperatorStatePath(root))).toBe(false)
    expect(result.transitionReceipts[0]?.status).toBe('rejected')
  })

  it('updates the runtime summary when a running lease expires', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-lease-summary-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'repo')
    const targetPath = join(repoRoot, 'src', 'utils')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    mkdirSync(targetPath, { recursive: true })
    const runningJob: DiscordRoundtableTrackedJob = {
      kind: 'roundtable',
      id: 'lease-running-job',
      branchName: 'discord-q-lease-running',
      worktreePath: repoRoot,
      workspacePath: targetPath,
      changedFiles: [],
      summary: 'OpenJaws · Q · stale running job',
      verificationSummary: null,
      commitSha: null,
      status: 'running',
      approvalState: null,
      workKey: 'openjaws::src/utils',
      projectKey: 'openjaws',
      sourcePath: join(root, 'handoff.json'),
      sourceSessionId: 'session-lease',
      sourceScheduleId: null,
      handoffKey: 'handoff-lease',
      repoId: 'openjaws',
      repoLabel: 'OpenJaws',
      role: 'Q',
      objective: 'Recover a stalled running lease',
      rationale: 'Expired running leases should be operator-visible.',
      commandHint: null,
      targetPath,
      targetRootLabel: 'OpenJaws',
      receiptPath: null,
      outputDir: null,
      commitStatement: null,
      decisionTraceId: null,
      routeSuggestion: null,
      executionReady: true,
      requiresManualCheckout: false,
      workspaceMaterialized: true,
      authorityBound: true,
      action: {
        id: 'lease-running-job',
        title: 'Recover a stalled running lease',
        reason: 'Expired running leases should be operator-visible.',
        targetPath,
        prompt: 'continue the guarded runtime work',
        gitRoot: repoRoot,
      },
      completedAt: null,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      leaseClaimedAt: '2026-04-30T04:00:00.000Z',
      leaseExpiresAt: '2026-04-30T04:10:00.000Z',
      leaseOwner: 'q',
    }
    mkdirSync(dirname(getDiscordRoundtableQueueStatePath(root)), {
      recursive: true,
    })
    writeFileSync(
      getDiscordRoundtableQueueStatePath(root),
      JSON.stringify(
        {
          ...createDiscordRoundtableRuntimeState({
            now: new Date('2026-04-30T04:05:00.000Z'),
            roundtableChannelName: 'dev_support',
          }),
          status: 'running',
          activeJobId: runningJob.id,
          lastSummary: 'Executing OpenJaws roundtable action lease-running-job.',
          jobs: [runningJob],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = await processDiscordRoundtableRuntime({
      root,
      allowedRoots: [repoRoot],
      ingestInbox: false,
      maxActionsPerRun: 0,
      model: 'oci:Q',
      runnerScriptPath:
        'D:\\openjaws\\OpenJaws\\local-command-station\\run-openjaws-visible.ps1',
      worktreeRoot: join(root, 'worktrees'),
      outputRoot: join(root, 'outputs'),
      now: () => new Date('2026-04-30T04:20:00.000Z'),
    })

    expect(result.state.activeJobId).toBeNull()
    expect(result.state.jobs[0]?.status).toBe('error')
    expect(result.state.jobs[0]?.rejectionReason).toBe(
      'execution lease expired before completion',
    )
    expect(result.state.lastSummary).toContain(
      'Stopped expired running roundtable action OpenJaws roundtable action lease-running-job',
    )
    expect(result.transitionReceipts[0]).toMatchObject({
      jobId: 'lease-running-job',
      status: 'error',
      rejectionReason: 'execution lease expired before completion',
    })
    const status = formatDiscordRoundtableRuntimeStatus(result.state)
    expect(status).toContain('errors 1')
    expect(status).toContain('Latest action: OpenJaws · Q · error')
    expect(status).toContain('execution lease expired before completion')
  })

  it('marks no-diff roundtable executions as skipped instead of completed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-no-diff-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    const handoffPath = join(root, 'handoff.json')
    writeFileSync(
      handoffPath,
      JSON.stringify(
        {
          sessionId: 'session-no-diff',
          actions: [
            {
              id: 'action-no-diff',
              repoId: 'openjaws',
              repoLabel: 'OpenJaws',
              role: 'Q',
              objective: 'Produce a real diff',
              rationale: 'PASS/no-diff should not count as completion.',
              workspaceScope: {
                repoPath: repoRoot,
              },
              executionArtifact: {
                executionReady: true,
                workspaceMaterialized: true,
                authorityBound: true,
              },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = await processDiscordRoundtableRuntime({
      root,
      allowedRoots: [repoRoot],
      handoffPaths: [handoffPath],
      ingestInbox: false,
      maxActionsPerRun: 1,
      model: 'oci:Q',
      runnerScriptPath:
        'D:\\openjaws\\OpenJaws\\local-command-station\\run-openjaws-visible.ps1',
      worktreeRoot: join(root, 'worktrees'),
      outputRoot: join(root, 'outputs'),
      now: () => new Date('2026-04-20T20:14:00.000Z'),
      executeAction: async args =>
        ({
          targetRootLabel: 'OpenJaws',
          gitRoot: repoRoot,
          runContext: {
            jobId: args.action.id,
            requestedWorkspace: repoRoot,
            gitRoot: repoRoot,
            gitRelativePath: '.',
            branchName: null,
            worktreePath: join(root, 'worktrees', 'openjaws', 'discord-q-action-no-diff'),
            workspacePath: join(root, 'worktrees', 'openjaws', 'discord-q-action-no-diff'),
            repoLabel: 'openjaws',
          },
          outputDir: join(root, 'outputs', 'job-no-diff'),
          receiptPath: join(root, 'outputs', 'job-no-diff', 'receipt.json'),
          job: {
            runContext: {
              jobId: args.action.id,
              requestedWorkspace: repoRoot,
              gitRoot: repoRoot,
              gitRelativePath: '.',
              branchName: null,
              worktreePath: join(
                root,
                'worktrees',
                'openjaws',
                'discord-q-action-no-diff',
              ),
              workspacePath: join(
                root,
                'worktrees',
                'openjaws',
                'discord-q-action-no-diff',
              ),
              repoLabel: 'openjaws',
            },
            outputDir: join(root, 'outputs', 'job-no-diff'),
            result: {
              startedAt: '2026-04-20T20:14:00.000Z',
              completedAt: '2026-04-20T20:15:00.000Z',
            },
            delivery: null,
            changedFiles: [],
            verification: {
              attempted: true,
              passed: true,
              summary: 'No file changes were detected after the run.',
              command: 'bun run build',
              stdout: null,
              stderr: null,
            },
            commitSha: null,
          },
          hasCodeChanges: false,
          artifactOnly: false,
          hasDisallowedChanges: false,
          verificationPassed: true,
          mergeable: false,
        }),
    })

    expect(result.state.jobs[0]?.status).toBe('skipped')
    expect(result.transitionReceipts[0]?.status).toBe('skipped')
    expect(result.state.lastSummary).toContain('was held back: no code changes detected')
  })

  it('resolves explicit duration and approval TTL options through the tracked scheduler policy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-policy-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })

    const result = await processDiscordRoundtableRuntime({
      root,
      allowedRoots: [repoRoot],
      ingestInbox: false,
      maxActionsPerRun: 0,
      durationHours: 6,
      approvalTtlHours: 0.5,
      model: 'oci:Q',
      runnerScriptPath: 'D:\\openjaws\\OpenJaws\\local-command-station\\run-openjaws-visible.ps1',
      worktreeRoot: join(root, 'worktrees'),
      outputRoot: join(root, 'outputs'),
      now: () => new Date('2026-04-20T20:12:00.000Z'),
    })

    expect(result.durationHours).toBe(6)
    expect(result.approvalTtlHours).toBe(0.5)
  })

  it('prunes expired roundtable approval branches from operator state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-prune-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    mkdirSync(dirname(getOpenJawsOperatorStatePath(root)), { recursive: true })
    writeFileSync(
      getOpenJawsOperatorStatePath(root),
      JSON.stringify(
        {
          pendingPushes: [
            {
              id: 'job-expired',
              jobId: 'job-expired',
              branchName: 'discord-viola-expired',
              worktreePath: repoRoot,
              workspacePath: repoRoot,
              changedFiles: ['src/runtime.ts'],
              summary: 'Expired roundtable branch',
              gitRoot: repoRoot,
              baseWorkspace: repoRoot,
              requestedByUserId: 'roundtable:viola',
              requestedByChannelId: null,
              requestedAt: '2026-04-20T20:00:00.000Z',
              prompt: 'do the work',
              commitSha: 'abc123',
              verificationPassed: true,
              outputDir: null,
              status: 'awaiting_approval',
              approvalState: 'pending',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    await processDiscordRoundtableRuntime({
      root,
      allowedRoots: [repoRoot],
      ingestInbox: false,
      maxActionsPerRun: 0,
      approvalTtlHours: 0.5,
      model: 'oci:Q',
      runnerScriptPath: 'D:\\openjaws\\OpenJaws\\local-command-station\\run-openjaws-visible.ps1',
      worktreeRoot: join(root, 'worktrees'),
      outputRoot: join(root, 'outputs'),
      now: () => new Date('2026-04-20T21:00:00.000Z'),
    })

    const operatorState = JSON.parse(
      readFileSync(getOpenJawsOperatorStatePath(root), 'utf8'),
    ) as {
      pendingPushes?: Array<{ jobId: string }>
    }
    expect(operatorState.pendingPushes ?? []).toHaveLength(0)
  })

  it('persists the authoritative live roundtable channel when a stale caller channel name is provided', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-runtime-authoritative-channel-'))
    tempDirs.push(root)
    const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
    const nestedRuntimeDir = join(runtimeDir, 'roundtable-runtime')
    const repoRoot = join(root, 'repo')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })
    mkdirSync(nestedRuntimeDir, { recursive: true })
    writeFileSync(
      getDiscordRoundtableSessionStatePath(root),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-21T23:58:30.000Z',
          startedAt: '2026-04-21T23:56:22.508Z',
          endsAt: '2026-04-22T03:56:22.508Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          roundtableChannelName: 'openjaws-updates',
          generalChannelId: 'general-1',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice-1',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 6,
          nextPersona: 'q',
          lastSpeaker: 'blackbeak',
          lastSummary: 'Blackbeak posted turn 6',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-22T00:18:37.163Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'Q posted turn 7',
          lastError: null,
          startedAt: '2026-04-21T23:56:22.508Z',
          endsAt: '2026-04-22T03:56:22.508Z',
          guildId: 'guild-1',
          roundtableChannelId: 'channel-1',
          generalChannelId: 'general-1',
          generalChannelName: 'general-chat',
          violaVoiceChannelId: 'voice-1',
          violaVoiceChannelName: 'viola-lounge',
          turnCount: 7,
          nextPersona: 'viola',
          lastSpeaker: 'q',
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(nestedRuntimeDir, 'discord-roundtable.log'),
      [
        '[2026-04-21T23:56:23.525Z] roundtable live in #dev_support (1426904647313916014), ends 2026-04-22T03:56:22.508Z',
        '[2026-04-22T00:18:37.162Z] Q posted turn 7',
      ].join('\n'),
      'utf8',
    )

    await processDiscordRoundtableRuntime({
      root,
      allowedRoots: [repoRoot],
      ingestInbox: false,
      maxActionsPerRun: 0,
      model: 'oci:Q',
      runnerScriptPath:
        'D:\\openjaws\\OpenJaws\\local-command-station\\run-openjaws-visible.ps1',
      worktreeRoot: join(root, 'worktrees'),
      outputRoot: join(root, 'outputs'),
      roundtableChannelName: 'openjaws-updates',
      now: () => new Date('2026-04-22T00:20:45.854Z'),
    })

    const persistedQueueState = JSON.parse(
      readFileSync(join(runtimeDir, 'discord-roundtable-queue.state.json'), 'utf8'),
    ) as { roundtableChannelName?: string | null }
    const persistedSessionState = JSON.parse(
      readFileSync(getDiscordRoundtableSessionStatePath(root), 'utf8'),
    ) as { roundtableChannelName?: string | null }

    expect(persistedQueueState.roundtableChannelName).toBe('dev_support')
    expect(persistedSessionState.roundtableChannelName).toBe('dev_support')
  })

  it('formats queue summaries and operator confirmation receipts', () => {
    const status = formatDiscordRoundtableRuntimeStatus({
      ...createDiscordRoundtableRuntimeState({
        roundtableChannelName: 'q-roundtable',
      }),
      status: 'awaiting_approval',
      jobs: [
        {
          kind: 'roundtable',
          id: 'job-1',
          branchName: 'discord-viola-job-1',
          worktreePath: 'D:\\worktree',
          workspacePath: 'D:\\repo',
          changedFiles: [],
          summary: 'OpenJaws · Viola · Runtime hardening · Verification passed: bun run build',
          verificationSummary: 'Verification passed: bun run build',
          commitSha: 'abc123',
          status: 'awaiting_approval',
          approvalState: 'pending',
          workKey: 'openjaws::.',
          projectKey: 'openjaws',
          sourcePath: 'D:\\handoff.json',
          sourceSessionId: 'session-1',
          sourceScheduleId: 'schedule-1',
          handoffKey: 'handoff-1',
          repoId: 'openjaws',
          repoLabel: 'OpenJaws',
          role: 'Viola',
          objective: 'Runtime hardening',
          rationale: 'Close the audit loop.',
          commandHint: null,
          targetPath: 'D:\\repo',
          targetRootLabel: 'OpenJaws',
          receiptPath: 'D:\\receipt.json',
          outputDir: 'D:\\output',
          commitStatement: null,
          decisionTraceId: null,
          routeSuggestion: null,
          executionReady: true,
          requiresManualCheckout: false,
          workspaceMaterialized: true,
          authorityBound: true,
          completedAt: '2026-04-20T20:05:00.000Z',
          rejectedAt: null,
          rejectionReason: null,
          leaseClaimedAt: null,
          leaseExpiresAt: null,
          leaseOwner: null,
        },
      ],
    })

    expect(status).toContain('Awaiting approval · job-1')
    expect(status).toContain('receipt D:\\receipt.json')
    expect(
      formatDiscordRoundtableTransitionReceipt({
        jobId: 'job-1',
        repoLabel: 'OpenJaws',
        role: 'Viola',
        objective: 'Runtime hardening',
        status: 'awaiting_approval',
        branchName: 'discord-viola-job-1',
        commitSha: 'abc123',
        verificationSummary: 'Verification passed: bun run build',
        receiptPath: 'D:\\receipt.json',
        rejectionReason: null,
        summary: 'Runtime hardening',
      }),
    ).toContain('Confirm: @Q operator confirm-push job-1')
  })
})
