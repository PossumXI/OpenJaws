import { describe, expect, it } from 'bun:test'
import {
  buildTaskNotificationOverflowMessage,
  formatBackgroundShellBatchSummary,
  formatBackgroundShellWaitingSummary,
  formatGenericTaskStatusText,
  formatLocalAgentNotificationSummary,
  formatLocalShellNotificationSummary,
  formatMainSessionNotificationSummary,
  formatRemoteReviewNotificationSummary,
  formatRemoteTaskNotificationSummary,
  formatUltraplanFailureSummary,
  summarizeTaskNotificationOverflow,
} from './taskNotificationSummary.js'

describe('taskNotificationSummary', () => {
  it('formats local agent summaries with short triage wording', () => {
    expect(
      formatLocalAgentNotificationSummary({
        description: 'scan repo',
        status: 'completed',
      }),
    ).toBe('Agent "scan repo" done')

    expect(
      formatLocalAgentNotificationSummary({
        description: 'scan repo',
        status: 'failed',
        error: 'timeout',
      }),
    ).toBe('Agent "scan repo" retry: timeout')

    expect(
      formatLocalAgentNotificationSummary({
        description: 'scan repo',
        status: 'killed',
      }),
    ).toBe('Agent "scan repo" stopped')
  })

  it('formats remote and main-session summaries consistently', () => {
    expect(
      formatMainSessionNotificationSummary({
        description: 'ship the fix',
        status: 'completed',
      }),
    ).toBe('Background session "ship the fix" done')

    expect(
      formatRemoteTaskNotificationSummary({
        title: 'Review PR',
        status: 'failed',
      }),
    ).toBe('Remote task "Review PR" retry')

    expect(formatUltraplanFailureSummary('approval missing')).toBe(
      'Ultraplan retry: approval missing',
    )

    expect(
      formatRemoteReviewNotificationSummary({
        status: 'completed',
      }),
    ).toBe('Remote review done')

    expect(
      formatRemoteReviewNotificationSummary({
        status: 'failed',
        reason: 'no findings tag',
      }),
    ).toBe('Remote review retry: no findings tag')
  })

  it('formats generic task status text with the same vocabulary', () => {
    expect(formatGenericTaskStatusText('completed')).toBe('done')
    expect(formatGenericTaskStatusText('failed')).toBe('retry')
    expect(formatGenericTaskStatusText('killed')).toBe('stopped')
    expect(formatGenericTaskStatusText('running')).toBe('live')
    expect(formatGenericTaskStatusText('pending')).toBe('queued')
  })

  it('formats shell notification summaries with short transcript wording', () => {
    expect(
      formatLocalShellNotificationSummary({
        description: 'npm test',
        status: 'completed',
      }),
    ).toBe('Background command "npm test" done')

    expect(
      formatLocalShellNotificationSummary({
        description: 'npm test',
        status: 'failed',
        exitCode: 1,
      }),
    ).toBe('Background command "npm test" retry (exit 1)')

    expect(
      formatLocalShellNotificationSummary({
        description: 'watch logs',
        status: 'completed',
        kind: 'monitor',
      }),
    ).toBe('Monitor "watch logs" ended')

    expect(formatBackgroundShellWaitingSummary('npm test')).toBe(
      'Background command "npm test" watch: waiting for input',
    )
    expect(formatBackgroundShellBatchSummary(3)).toBe(
      '3 background commands done',
    )
  })

  it('summarizes queued task-notification overflow by pressure', () => {
    const digest = summarizeTaskNotificationOverflow([
      '<task-notification><summary>Agent "a" done</summary><status>completed</status></task-notification>',
      '<task-notification><summary>Agent "b" retry</summary><status>failed</status></task-notification>',
      '<task-notification><summary>Background command "c" watch: waiting for input</summary></task-notification>',
    ])

    expect(digest).toEqual({
      summary: '+3 more task receipts · 1 done · 1 retry · 1 watch',
      status: 'failed',
    })

    expect(
      buildTaskNotificationOverflowMessage([
        '<task-notification><summary>Agent "a" done</summary><status>completed</status></task-notification>',
      ]),
    ).toContain('+1 more task receipt · 1 done')
  })
})
