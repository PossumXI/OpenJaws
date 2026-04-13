import { describe, expect, it } from 'bun:test'
import type { Notification } from 'src/context/notifications.js'
import { getNotificationQueueSummary } from './notificationQueueSummary.js'

function textNotification(
  key: string,
  text: string,
  overrides: Partial<Extract<Notification, { text: string }>> = {},
): Notification {
  return {
    key,
    text,
    priority: 'low',
    ...overrides,
  }
}

describe('notificationQueueSummary', () => {
  it('summarizes hidden backlog using pressure-first wording', () => {
    expect(
      getNotificationQueueSummary([
        textNotification(
          'a',
          '<task-notification><summary>Agent "scan repo" retry</summary><status>failed</status></task-notification>',
        ),
        textNotification(
          'b',
          'Background command "npm test" watch: waiting for input',
        ),
        textNotification('c', '1 agent spawned'),
      ]),
    ).toEqual({
      text: '+3 more notices · 1 retry · 1 watch · 1 note',
      color: 'error',
      dimColor: false,
    })
  })

  it('uses compact labels on narrow surfaces', () => {
    expect(
      getNotificationQueueSummary(
        [
          textNotification(
            'a',
            '<task-notification><summary>Remote review done</summary><status>completed</status></task-notification>',
          ),
          textNotification('b', 'Remote Control failed', { color: 'error' }),
          textNotification('c', 'Debug mode', { color: 'warning' }),
        ],
        true,
      ),
    ).toEqual({
      text: '+3 notices · 1er · 1dn · 1wr',
      color: 'error',
      dimColor: false,
    })
  })

  it('returns warning tone for stopped-only ancillary backlog', () => {
    expect(
      getNotificationQueueSummary([
        textNotification('a', '2 agents shut down'),
      ]),
    ).toEqual({
      text: '+1 more notice · 1 stopped',
      color: 'warning',
      dimColor: false,
    })
  })
})
