import { describe, expect, it } from 'bun:test'
import type { Notification } from './notifications.js'
import { foldNotificationLatest } from './notificationFold.js'

describe('notificationFold', () => {
  it('keeps the latest text notification payload and fold behavior', () => {
    const first: Notification = {
      key: 'bridge-failed',
      text: 'Remote Control failed',
      color: 'error',
      priority: 'immediate',
      timeoutMs: 3000,
      fold: foldNotificationLatest,
    }

    const second: Notification = {
      key: 'bridge-failed',
      text: 'Remote Control failed · auth expired',
      color: 'error',
      priority: 'immediate',
    }

    expect(foldNotificationLatest(first, second)).toEqual({
      key: 'bridge-failed',
      text: 'Remote Control failed · auth expired',
      color: 'error',
      priority: 'immediate',
      timeoutMs: 3000,
      fold: foldNotificationLatest,
    })
  })

  it('keeps the latest jsx notification payload without stale text fields', () => {
    const first: Notification = {
      key: 'mcp-failed',
      text: 'stale',
      priority: 'medium',
      fold: foldNotificationLatest,
    }

    const second: Notification = {
      key: 'mcp-failed',
      jsx: '2 MCP servers failed',
      priority: 'medium',
      timeoutMs: 5000,
    }

    const folded = foldNotificationLatest(first, second)
    expect(folded).toEqual({
      key: 'mcp-failed',
      jsx: '2 MCP servers failed',
      priority: 'medium',
      timeoutMs: 5000,
      fold: foldNotificationLatest,
    })
    expect('text' in folded).toBe(false)
  })
})
