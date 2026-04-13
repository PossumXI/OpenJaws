import type { Notification } from 'src/context/notifications.js'
import type { TextProps } from '../../ink.js'
import { getTaskNotificationRenderTone } from '../messages/taskNotificationTone.js'

export type NotificationTextPresentation = {
  text: string
  color?: TextProps['color']
  dimColor: boolean
  bold: boolean
}

export function getNotificationTextPresentation(
  notification: Notification,
): NotificationTextPresentation | null {
  if (!('text' in notification)) {
    return null
  }

  const taskSummary = extractNotificationTag(notification.text, 'summary')
  if (taskSummary) {
    const status = extractNotificationTag(notification.text, 'status')
    const tone = getTaskNotificationRenderTone(status, taskSummary)
    const inferredColor =
      tone.bulletColor === 'text'
        ? undefined
        : (tone.summaryColor ?? tone.bulletColor)

    return {
      text: taskSummary,
      color: notification.color ?? inferredColor,
      dimColor: !notification.color && inferredColor === undefined,
      bold: Boolean(tone.summaryBold),
    }
  }

  const tone = notification.color
    ? null
    : getTaskNotificationRenderTone(null, notification.text)
  const inferredColor =
    tone && tone.bulletColor !== 'text'
      ? (tone.summaryColor ?? tone.bulletColor)
      : undefined

  return {
    text: notification.text,
    color: notification.color ?? inferredColor,
    dimColor: !notification.color && inferredColor === undefined,
    bold: Boolean(tone?.summaryBold),
  }
}

function extractNotificationTag(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return match?.[1]?.trim() || null
}
