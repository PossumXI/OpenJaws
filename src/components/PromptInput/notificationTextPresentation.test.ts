import { describe, expect, it } from 'bun:test'
import type { Notification } from 'src/context/notifications.js'
import { getNotificationTextPresentation } from './notificationTextPresentation.js'

function textNotification(
  text: string,
  overrides: Partial<Extract<Notification, { text: string }>> = {},
): Notification {
  return {
    key: 'test',
    text,
    priority: 'low',
    ...overrides,
  }
}

describe('notificationTextPresentation', () => {
  it('keeps plain neutral notifications dimmed', () => {
    expect(
      getNotificationTextPresentation(textNotification('1 agent spawned')),
    ).toEqual({
      text: '1 agent spawned',
      color: undefined,
      dimColor: true,
      bold: false,
    })
  })

  it('preserves explicit notification colors', () => {
    expect(
      getNotificationTextPresentation(
        textNotification('Remote Control failed', { color: 'error' }),
      ),
    ).toEqual({
      text: 'Remote Control failed',
      color: 'error',
      dimColor: false,
      bold: false,
    })
  })

  it('extracts task-notification summaries and applies shared tone', () => {
    expect(
      getNotificationTextPresentation(
        textNotification(
          '<task-notification><summary>Agent "scan repo" retry</summary><status>failed</status></task-notification>',
        ),
      ),
    ).toEqual({
      text: 'Agent "scan repo" retry',
      color: 'error',
      dimColor: false,
      bold: true,
    })
  })

  it('infers warning tone for plain watch receipts', () => {
    expect(
      getNotificationTextPresentation(
        textNotification('Background command "npm test" watch: waiting for input'),
      ),
    ).toEqual({
      text: 'Background command "npm test" watch: waiting for input',
      color: 'warning',
      dimColor: false,
      bold: true,
    })
  })
})
