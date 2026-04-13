import { describe, expect, test } from 'bun:test'
import {
  formatPermissionModeLabel,
  summarizeQueuedMessages,
} from './taskDetailHelpers.js'

describe('taskDetailHelpers', () => {
  test('summarizes the most recent queued messages with normalized previews', () => {
    const summary = summarizeQueuedMessages(
      [
        'first note',
        ' second   note with   extra space ',
        'third note stays visible',
      ],
      2,
      18,
    )

    expect(summary).toEqual({
      count: 3,
      previews: ['second note with…', 'third note stays…'],
    })
  })

  test('returns null when no queued messages exist', () => {
    expect(summarizeQueuedMessages([], 2, 40)).toBeNull()
    expect(summarizeQueuedMessages(undefined, 2, 40)).toBeNull()
  })

  test('formats permission modes for user-facing receipts', () => {
    expect(formatPermissionModeLabel('default')).toBe('standard')
    expect(formatPermissionModeLabel('acceptEdits')).toBe('builder')
    expect(formatPermissionModeLabel('bypassPermissions')).toBe(
      'unrestricted',
    )
    expect(formatPermissionModeLabel('plan')).toBe('plan')
  })
})
