import { describe, expect, test } from 'bun:test'
import {
  getBackgroundTaskAttention,
  hasQueuedBadge,
  hasToolBadge,
} from './backgroundTaskAttention.js'

describe('backgroundTaskAttention', () => {
  test('prioritizes queued and tool-pressure badges for local agents', () => {
    const attention = getBackgroundTaskAttention({
      type: 'local_agent',
      status: 'running',
      pendingMessages: ['note 1'],
      progress: { toolUseCount: 9 },
    } as never)

    expect(attention.badges).toEqual([
      { kind: 'queued', label: 'queued', tone: 'suggestion' },
      { kind: 'tool', label: '9t', tone: 'background' },
    ])
    expect(attention.rowTone).toBe('suggestion')
    expect(attention.leadTone).toBeUndefined()
    expect(hasQueuedBadge(attention)).toBe(true)
    expect(hasToolBadge(attention)).toBe(true)
  })

  test('collapses teammate activity when an approval badge is present', () => {
    const attention = getBackgroundTaskAttention({
      type: 'in_process_teammate',
      status: 'running',
      awaitingPlanApproval: true,
      shutdownRequested: false,
      isIdle: false,
      pendingUserMessages: ['watch this'],
      progress: { toolUseCount: 4 },
    } as never)

    expect(attention.badges).toEqual([
      { kind: 'approval', label: 'approval', tone: 'warning' },
      { kind: 'queued', label: 'queued', tone: 'suggestion' },
    ])
    expect(attention.collapseActivityText).toBe(true)
    expect(attention.rowTone).toBe('warning')
    expect(attention.leadTone).toBe('warning')
  })

  test('surfaces remote ultraplan attention states ahead of review state', () => {
    const attention = getBackgroundTaskAttention({
      type: 'remote_agent',
      status: 'running',
      isRemoteReview: true,
      ultraplanPhase: 'needs_input',
    } as never)

    expect(attention.badges).toEqual([
      { kind: 'input', label: 'input', tone: 'warning' },
      { kind: 'review', label: 'review', tone: 'suggestion' },
    ])
    expect(attention.rowTone).toBe('warning')
    expect(attention.leadTone).toBe('warning')
  })

  test('labels dream work with a phase badge', () => {
    const attention = getBackgroundTaskAttention({
      type: 'dream',
      status: 'running',
      phase: 'updating',
    } as never)

    expect(attention.badges).toEqual([
      { kind: 'dream', label: 'updating', tone: 'suggestion' },
    ])
    expect(attention.rowTone).toBe('suggestion')
    expect(attention.leadTone).toBeUndefined()
  })

  test('surfaces retry severity ahead of queue pressure for recovering agents', () => {
    const attention = getBackgroundTaskAttention({
      type: 'local_agent',
      status: 'running',
      error: 'provider rejected tool round',
      pendingMessages: ['retry this'],
      progress: { toolUseCount: 9 },
    } as never)

    expect(attention.badges).toEqual([
      { kind: 'retry', label: 'retry', tone: 'error' },
      { kind: 'queued', label: 'queued', tone: 'suggestion' },
    ])
    expect(attention.rowTone).toBe('error')
    expect(attention.leadTone).toBe('error')
  })
})
