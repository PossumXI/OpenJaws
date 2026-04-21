import { afterEach, describe, expect, it } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import {
  createDiscordRoundtableRuntimeState,
  loadDiscordRoundtableSessionState,
  formatDiscordRoundtableRuntimeStatus,
  formatDiscordRoundtableTransitionReceipt,
  getDiscordRoundtableQuarantineDir,
  getDiscordRoundtableSessionStatePath,
  getOpenJawsOperatorStatePath,
  ingestDiscordRoundtableHandoff,
  loadDiscordRoundtableRuntimeState,
  processDiscordRoundtableRuntime,
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
  it('ingests governed handoffs into queued repo-scoped jobs', () => {
    const repoRoot = createRepoRoot('oj-roundtable-repo-')
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
              repoId: 'asgard',
              repoLabel: 'Asgard',
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
    expect(ingested.state.jobs[0]?.projectKey).toBe('asgard')
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
      startedAt: '2026-04-21T13:14:12.770Z',
      endsAt: '2026-04-21T17:14:12.770Z',
      turnCount: 1,
      nextPersona: 'viola',
      lastSpeaker: 'q',
      lastSummary: 'Q posted turn 1',
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
    ).toContain('Confirm: @Q operator confirm-push discord-viola-job-1')
  })
})
