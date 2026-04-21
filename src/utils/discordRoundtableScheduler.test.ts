import { describe, expect, it } from 'bun:test'
import {
  chooseFallbackRoundtableRoot,
  inspectRoundtableReply,
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

  it('forces contribution when the queue is active and relaxes once recent concrete work exists', () => {
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
