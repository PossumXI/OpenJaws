import { describe, expect, it } from 'bun:test'
import {
  chooseFallbackRoundtableRoot,
  inspectRoundtableReply,
  resolveRoundtableExecutionScope,
  resolvePreferredRoundtableExecutionTargetPath,
  resolveRoundtableApprovalTtlHours,
  resolveRoundtableDurationHours,
  shouldForceRoundtableContribution,
  type DiscordRoundtableSchedulerRoot,
} from './discordRoundtableScheduler.js'

const roots: DiscordRoundtableSchedulerRoot[] = [
  {
    label: 'OpenJaws',
    path: 'D:\\openjaws\\OpenJaws',
    aliases: ['openjaws', 'qline'],
  },
  {
    label: 'Immaculate',
    path: 'C:\\Users\\Knight\\Desktop\\Immaculate',
    aliases: ['immaculate', 'harness'],
  },
]

describe('discordRoundtableScheduler', () => {
  it('resolves duration and approval TTL with fail-closed fallbacks', () => {
    expect(resolveRoundtableDurationHours()).toBe(4)
    expect(
      resolveRoundtableDurationHours({
        rawValue: '6',
      }),
    ).toBe(6)
    expect(
      resolveRoundtableDurationHours({
        rawValue: 'bad',
      }),
    ).toBe(4)

    expect(
      resolveRoundtableApprovalTtlHours({
        durationHours: 4,
      }),
    ).toBe(1)
    expect(
      resolveRoundtableApprovalTtlHours({
        durationHours: 4,
        rawValue: '0.5',
      }),
    ).toBe(0.5)
    expect(
      resolveRoundtableApprovalTtlHours({
        durationHours: 2,
        rawValue: '-1',
      }),
    ).toBe(1)
  })

  it('prefers concrete repo paths before falling back to the repo root', () => {
    const target = resolvePreferredRoundtableExecutionTargetPath(roots[0]!, path =>
      path.endsWith('\\src'),
    )
    expect(target).toBe('D:\\openjaws\\OpenJaws\\src')
    expect(
      resolvePreferredRoundtableExecutionTargetPath(roots[1]!, () => false),
    ).toBe('C:\\Users\\Knight\\Desktop\\Immaculate')
  })

  it('narrows repo-root execution scopes to a concrete code path and stable work key', () => {
    expect(
      resolveRoundtableExecutionScope({
        targetPath: 'D:\\openjaws\\OpenJaws',
        repoId: 'OpenJaws',
        roots,
        pathExists: path => path.endsWith('\\src'),
      }),
    ).toEqual({
      targetPath: 'D:\\openjaws\\OpenJaws\\src',
      projectKey: 'openjaws',
      workKey: 'openjaws::src',
      rootLabel: 'OpenJaws',
    })

    expect(
      resolveRoundtableExecutionScope({
        targetPath: 'C:\\Users\\Knight\\Desktop\\Immaculate\\apps\\harness',
        repoId: 'Immaculate',
        roots,
      }),
    ).toEqual({
      targetPath: 'C:\\Users\\Knight\\Desktop\\Immaculate\\apps\\harness',
      projectKey: 'immaculate',
      workKey: 'immaculate::apps/harness',
      rootLabel: 'Immaculate',
    })
  })

  it('uses the deepest matching root when parent and child roots are both present', () => {
    expect(
      resolveRoundtableExecutionScope({
        targetPath: 'D:\\openjaws\\OpenJaws\\src\\utils',
        repoId: 'OpenJaws',
        roots: [
          {
            label: 'openjaws-parent',
            path: 'D:\\openjaws',
            aliases: ['openjaws'],
          },
          roots[0]!,
        ],
      }),
    ).toEqual({
      targetPath: 'D:\\openjaws\\OpenJaws\\src\\utils',
      projectKey: 'openjaws',
      workKey: 'openjaws::src/utils',
      rootLabel: 'OpenJaws',
    })
  })

  it('penalizes pending approvals and stale non-mergeable work when choosing a fallback root', () => {
    const selected = chooseFallbackRoundtableRoot({
      roots,
      roundtableMemory: {
        summary: 'Need one more OpenJaws pass, then validate harness auth in Immaculate.',
        currentFocus: 'OpenJaws scheduler extraction',
      },
      recentActions: [
        {
          targetPath: 'D:\\openjaws\\OpenJaws\\src',
          status: 'awaiting_approval',
          approvalState: 'pending',
          completedAt: '2026-04-20T21:00:00.000Z',
          changedFiles: ['src/utils/discordRoundtableRuntime.ts'],
          commitSha: 'abc123',
          verificationSummary: 'Verification passed: bun run build',
        },
        {
          targetPath: 'D:\\openjaws\\OpenJaws\\src',
          status: 'completed',
          completedAt: '2026-04-20T21:05:00.000Z',
          changedFiles: ['receipt.json'],
          commitSha: null,
          verificationSummary: 'Verification failed: mixed artifact output',
        },
      ],
      nowMs: Date.parse('2026-04-20T21:10:00.000Z'),
    })

    expect(selected?.label).toBe('Immaculate')
  })

  it('forces contribution when the queue is active and relaxes only after sustained recent concrete work exists', () => {
    expect(
      shouldForceRoundtableContribution({
        turnCount: 8,
        latestHumanQuestion: null,
        roundtableMemory: {
          summary: 'Discuss the next repo-grounded pass.',
          openThreads: [],
        },
        recentActions: [
          {
            status: 'awaiting_approval',
            approvalState: 'pending',
            changedFiles: ['src/utils/discordRoundtableRuntime.ts'],
            completedAt: '2026-04-20T21:00:00.000Z',
            commitSha: 'abc123',
          },
        ],
        nowMs: Date.parse('2026-04-20T21:05:00.000Z'),
      }),
    ).toBe(true)

    expect(
      shouldForceRoundtableContribution({
        turnCount: 8,
        latestHumanQuestion: null,
        roundtableMemory: {
          summary: 'Discuss the next repo-grounded pass.',
          openThreads: [],
        },
        recentActions: [
          {
            status: 'completed',
            changedFiles: ['src/utils/discordRoundtableRuntime.ts'],
            completedAt: '2026-04-20T21:00:00.000Z',
            commitSha: 'abc123',
            verificationSummary: 'Verification passed: bun run build',
          },
        ],
        nowMs: Date.parse('2026-04-20T21:05:00.000Z'),
      }),
    ).toBe(true)

    expect(
      shouldForceRoundtableContribution({
        turnCount: 8,
        latestHumanQuestion: null,
        roundtableMemory: {
          summary: 'Discuss the next repo-grounded pass.',
          openThreads: [],
        },
        recentActions: [
          {
            status: 'completed',
            changedFiles: ['src/utils/discordRoundtableRuntime.ts'],
            completedAt: '2026-04-20T21:00:00.000Z',
            commitSha: 'abc123',
            verificationSummary: 'Verification passed: bun run build',
          },
          {
            status: 'completed',
            changedFiles: ['src/utils/discordRoundtableScheduler.ts'],
            completedAt: '2026-04-20T21:03:00.000Z',
            commitSha: 'def456',
            verificationSummary: 'Verification passed: bun run test',
          },
        ],
        nowMs: Date.parse('2026-04-20T21:05:00.000Z'),
      }),
    ).toBe(false)
  })

  it('keeps forcing contribution while older pending approval work is still unresolved', () => {
    expect(
      shouldForceRoundtableContribution({
        turnCount: 12,
        latestHumanQuestion: null,
        roundtableMemory: {
          summary: 'Keep the roundtable moving on repo-grounded work.',
          openThreads: [],
        },
        recentActions: [
          {
            status: 'awaiting_approval',
            approvalState: 'pending',
            changedFiles: ['src/utils/discordRoundtableRuntime.ts'],
            completedAt: '2026-04-20T20:00:00.000Z',
            commitSha: 'pending-approval-sha',
            verificationSummary: 'Verification passed: bun run build',
          },
          {
            status: 'completed',
            changedFiles: ['src/utils/discordRoundtableScheduler.ts'],
            completedAt: '2026-04-20T20:05:00.000Z',
            commitSha: 'sha-1',
            verificationSummary: 'Verification passed: bun run test',
          },
          {
            status: 'completed',
            changedFiles: ['src/utils/discordRoundtableRuntime.ts'],
            completedAt: '2026-04-20T20:07:00.000Z',
            commitSha: 'sha-2',
            verificationSummary: 'Verification passed: bun run build',
          },
          {
            status: 'completed',
            changedFiles: ['src/utils/discordExecutionQueue.ts'],
            completedAt: '2026-04-20T20:10:00.000Z',
            commitSha: 'sha-3',
            verificationSummary: 'Verification passed: bun run test',
          },
          {
            status: 'completed',
            changedFiles: ['src/utils/discordRoundtableExecution.ts'],
            completedAt: '2026-04-20T20:12:00.000Z',
            commitSha: 'sha-4',
            verificationSummary: 'Verification passed: bun run build',
          },
          {
            status: 'completed',
            changedFiles: ['src/utils/discordProjectTargets.ts'],
            completedAt: '2026-04-20T20:15:00.000Z',
            commitSha: 'sha-5',
            verificationSummary: 'Verification passed: bun run test',
          },
          {
            status: 'completed',
            changedFiles: ['src/utils/discordOperatorWork.ts'],
            completedAt: '2026-04-20T20:18:00.000Z',
            commitSha: 'sha-6',
            verificationSummary: 'Verification passed: bun run build',
          },
        ],
        nowMs: Date.parse('2026-04-20T20:19:00.000Z'),
      }),
    ).toBe(true)
  })

  it('keeps forcing contribution when the latest run produced no diff-bearing commit', () => {
    expect(
      shouldForceRoundtableContribution({
        turnCount: 8,
        latestHumanQuestion: null,
        roundtableMemory: {
          summary: 'Keep pushing toward a scoped code-bearing action.',
          openThreads: [],
        },
        recentActions: [
          {
            status: 'completed',
            changedFiles: [],
            completedAt: '2026-04-20T21:00:00.000Z',
            commitSha: null,
            verificationSummary: 'No file changes were detected after the run.',
          },
        ],
        nowMs: Date.parse('2026-04-20T21:05:00.000Z'),
      }),
    ).toBe(true)
  })

  it('keeps forcing contribution after a recent rejected mixed-output run', () => {
    expect(
      shouldForceRoundtableContribution({
        turnCount: 8,
        latestHumanQuestion: null,
        roundtableMemory: {
          summary: 'Recover from the rejected mixed-output pass.',
          openThreads: [],
        },
        recentActions: [
          {
            status: 'rejected',
            changedFiles: ['apps/harness/src/server.ts', 'receipt.json'],
            completedAt: '2026-04-20T21:00:00.000Z',
            commitSha: null,
            verificationSummary: 'Verification failed: mixed code and artifact output.',
          },
        ],
        nowMs: Date.parse('2026-04-20T21:05:00.000Z'),
      }),
    ).toBe(true)
  })

  it('does not treat skipped actions with changed files as weak after enough concrete work exists', () => {
    expect(
      shouldForceRoundtableContribution({
        turnCount: 8,
        latestHumanQuestion: null,
        roundtableMemory: {
          summary: 'Recent code-bearing work landed.',
          openThreads: [],
        },
        recentActions: [
          {
            status: 'completed',
            changedFiles: ['src/utils/alpha.ts'],
            completedAt: '2026-04-20T21:00:00.000Z',
            commitSha: 'sha-alpha',
            verificationSummary: 'Verification passed',
          },
          {
            status: 'completed',
            changedFiles: ['src/utils/beta.ts'],
            completedAt: '2026-04-20T21:05:00.000Z',
            commitSha: 'sha-beta',
            verificationSummary: 'Verification passed',
          },
          {
            status: 'skipped',
            changedFiles: ['src/utils/review-notes.md'],
            completedAt: '2026-04-20T21:10:00.000Z',
            commitSha: null,
            verificationSummary: 'Skipped: review-only change was held back.',
          },
        ],
        nowMs: Date.parse('2026-04-20T21:15:00.000Z'),
      }),
    ).toBe(false)
  })

  it('inspects replies so PASS is retried when contribution is required', () => {
    expect(
      inspectRoundtableReply({
        rawReply: 'PASS',
        forceContribution: true,
      }),
    ).toEqual({
      normalizedReply: 'PASS',
      isPass: true,
      isIncomplete: false,
      shouldRetry: true,
    })

    expect(
      inspectRoundtableReply({
        rawReply: 'Quick note',
        forceContribution: false,
      }),
    ).toEqual({
      normalizedReply: 'Quick note',
      isPass: false,
      isIncomplete: true,
      shouldRetry: true,
    })

    expect(
      inspectRoundtableReply({
        rawReply:
          'OpenJaws should keep the scheduler policy tracked in src/utils and only let the Discord shell own channel pacing, because that keeps approval TTL, fallback root scoring, and reply retry behavior testable.',
        forceContribution: true,
      }),
    ).toEqual({
      normalizedReply:
        'OpenJaws should keep the scheduler policy tracked in src/utils and only let the Discord shell own channel pacing, because that keeps approval TTL, fallback root scoring, and reply retry behavior testable.',
      isPass: false,
      isIncomplete: false,
      shouldRetry: false,
    })
  })
})
