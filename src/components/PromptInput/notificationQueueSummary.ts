import type { Notification } from 'src/context/notifications.js'
import type { TextProps } from '../../ink.js'
import { getNotificationTextPresentation } from './notificationTextPresentation.js'

type QueueBucket =
  | 'retry'
  | 'error'
  | 'watch'
  | 'stopped'
  | 'ready'
  | 'done'
  | 'warn'
  | 'ok'
  | 'note'

type QueueCounts = Record<QueueBucket, number>

export type NotificationQueueSummary = {
  text: string
  color?: TextProps['color']
  dimColor: boolean
}

export function getNotificationQueueSummary(
  queue: readonly Notification[],
  compact = false,
): NotificationQueueSummary | null {
  if (queue.length === 0) {
    return null
  }

  const counts = queue.reduce<QueueCounts>(
    (acc, notification) => {
      acc[classifyNotification(notification)] += 1
      return acc
    },
    {
      retry: 0,
      error: 0,
      watch: 0,
      stopped: 0,
      ready: 0,
      done: 0,
      warn: 0,
      ok: 0,
      note: 0,
    },
  )

  const parts = [
    renderPart(counts.retry, 'retry', 'rt'),
    renderPart(counts.error, 'error', 'er'),
    renderPart(counts.watch, 'watch', 'wt'),
    renderPart(counts.stopped, 'stopped', 'st'),
    renderPart(counts.ready, 'ready', 'rd'),
    renderPart(counts.done, 'done', 'dn'),
    renderPart(counts.warn, 'warn', 'wr'),
    renderPart(counts.ok, 'ok', 'ok'),
    renderPart(counts.note, 'note', 'nt'),
  ].filter((part): part is { full: string; compact: string } => Boolean(part))

  const lead = compact
    ? `+${queue.length} ${queue.length === 1 ? 'notice' : 'notices'}`
    : `+${queue.length} more ${queue.length === 1 ? 'notice' : 'notices'}`

  const color = resolveSummaryColor(counts)

  return {
    text: [lead, ...parts.map(part => (compact ? part.compact : part.full))].join(
      ' · ',
    ),
    color,
    dimColor: color === undefined,
  }
}

function classifyNotification(notification: Notification): QueueBucket {
  if (!('text' in notification)) {
    return 'note'
  }

  const presentation = getNotificationTextPresentation(notification)
  const text = (presentation?.text ?? notification.text).toLowerCase()

  if (hasWord(text, 'retry')) {
    return 'retry'
  }

  if (
    notification.color === 'error' ||
    hasWord(text, 'error') ||
    hasWord(text, 'failed')
  ) {
    return 'error'
  }

  if (
    hasWord(text, 'watch') ||
    text.includes('waiting for input') ||
    hasWord(text, 'approval') ||
    hasWord(text, 'input')
  ) {
    return 'watch'
  }

  if (hasWord(text, 'stopped') || text.includes('shut down')) {
    return 'stopped'
  }

  if (hasWord(text, 'ready')) {
    return 'ready'
  }

  if (hasWord(text, 'done') || hasWord(text, 'ended')) {
    return 'done'
  }

  if (notification.color === 'warning') {
    return 'warn'
  }

  if (notification.color === 'success') {
    return 'ok'
  }

  return 'note'
}

function renderPart(
  count: number,
  singular: string,
  compactLabel: string,
): { full: string; compact: string } | null {
  if (count <= 0) {
    return null
  }

  return {
    full: `${count} ${count === 1 ? singular : `${singular}s`}`,
    compact: `${count}${compactLabel}`,
  }
}

function resolveSummaryColor(counts: QueueCounts): TextProps['color'] | undefined {
  if (counts.retry > 0 || counts.error > 0) {
    return 'error'
  }

  if (counts.watch > 0 || counts.stopped > 0 || counts.warn > 0) {
    return 'warning'
  }

  if (counts.ready > 0 || counts.done > 0 || counts.ok > 0) {
    return 'success'
  }

  return undefined
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
