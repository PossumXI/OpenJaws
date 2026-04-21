import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import {
  createDiscordRoundtableRuntimeState,
  formatDiscordRoundtableRuntimeStatus,
  formatDiscordRoundtableTransitionReceipt,
  getOpenJawsOperatorStatePath,
  ingestDiscordRoundtableHandoff,
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
      runnerScriptPath: 'D:\\openjaws\\OpenJaws\\local-command-station\\launch-openjaws-visible.ps1',
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
      runnerScriptPath: 'D:\\openjaws\\OpenJaws\\local-command-station\\launch-openjaws-visible.ps1',
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
      runnerScriptPath: 'D:\\openjaws\\OpenJaws\\local-command-station\\launch-openjaws-visible.ps1',
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
      runnerScriptPath: 'D:\\openjaws\\OpenJaws\\local-command-station\\launch-openjaws-visible.ps1',
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
