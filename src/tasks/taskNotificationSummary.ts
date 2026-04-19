import { STATUS_TAG, SUMMARY_TAG, TASK_NOTIFICATION_TAG } from '../constants/xml.js'
import type { BashTaskKind } from './LocalShellTask/guards.js'
import {
  formatLifecycleStatusText,
  formatScopedActivitySummary,
} from '../utils/outputPresentation.js'

function extractNotificationTag(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match?.[1] ?? null
}

export function formatLocalAgentNotificationSummary({
  description,
  status,
  error,
}: {
  description: string
  status: 'completed' | 'failed' | 'killed'
  error?: string
}): string {
  return formatScopedActivitySummary({
    scope: 'Agent',
    title: description,
    status,
    detail: error || 'Unknown error',
  })
}

export function formatMainSessionNotificationSummary({
  description,
  status,
}: {
  description: string
  status: 'completed' | 'failed'
}): string {
  switch (status) {
    case 'completed':
      return `Background session "${description}" completed`
    case 'failed':
      return `Background session "${description}" needs retry`
  }
}

export function formatRemoteTaskNotificationSummary({
  title,
  status,
}: {
  title: string
  status: 'completed' | 'failed' | 'killed'
}): string {
  return formatScopedActivitySummary({
    scope: 'Remote task',
    title,
    status,
  })
}

export function formatUltraplanFailureSummary(reason: string): string {
  return `Ultraplan needs retry: ${reason}`
}

export function formatRemoteReviewNotificationSummary({
  status,
  reason,
}: {
  status: 'completed' | 'failed'
  reason?: string
}): string {
  switch (status) {
    case 'completed':
      return 'Remote review completed'
    case 'failed':
      return `Remote review needs retry: ${reason || 'Unknown error'}`
  }
}

export function formatGenericTaskStatusText(status: {
  type: 'completed' | 'failed' | 'killed' | 'running' | 'pending'
}['type']): string {
  return formatLifecycleStatusText(status)
}

export function formatLocalShellNotificationSummary({
  description,
  status,
  exitCode,
  kind = 'bash',
}: {
  description: string
  status: 'completed' | 'failed' | 'killed'
  exitCode?: number
  kind?: BashTaskKind
}): string {
  if (kind === 'monitor') {
    return formatScopedActivitySummary({
      scope: 'Monitor',
      title: description,
      status,
      detail: exitCode !== undefined ? `exit ${exitCode}` : undefined,
      completedLabel: 'ended',
    })
  }

  return formatScopedActivitySummary({
    scope: 'Background command',
    title: description,
    status,
    detail: exitCode !== undefined ? `exit ${exitCode}` : undefined,
  })
}

export function formatBackgroundShellWaitingSummary(description: string): string {
  return formatScopedActivitySummary({
    scope: 'Background command',
    title: description,
    status: 'watch',
  })
}

export function formatBackgroundShellBatchSummary(count: number): string {
  return `${count} background command${count === 1 ? '' : 's'} completed`
}

type TaskNotificationStatus = 'completed' | 'failed' | 'killed'

export function summarizeTaskNotificationOverflow(notifications: string[]): {
  summary: string
  status: TaskNotificationStatus | null
} {
  let completed = 0
  let failed = 0
  let killed = 0
  let watch = 0

  for (const notification of notifications) {
    const status = extractNotificationTag(notification, STATUS_TAG)
    switch (status) {
      case 'completed':
        completed++
        break
      case 'failed':
        failed++
        break
      case 'killed':
        killed++
        break
      default:
        watch++
        break
    }
  }

  const count = notifications.length
  const parts = [`+${count} more task receipt${count === 1 ? '' : 's'}`]

  if (completed > 0) {
    parts.push(`${completed} completed`)
  }
  if (failed > 0) {
    parts.push(`${failed} retry`)
  }
  if (killed > 0) {
    parts.push(`${killed} stopped`)
  }
  if (watch > 0) {
    parts.push(`${watch} waiting`)
  }

  return {
    summary: parts.join(' · '),
    status:
      failed > 0
        ? 'failed'
        : killed > 0
          ? 'killed'
          : completed > 0 && watch === 0
            ? 'completed'
            : null,
  }
}

export function buildTaskNotificationOverflowMessage(
  notifications: string[],
): string {
  const { summary, status } = summarizeTaskNotificationOverflow(notifications)
  const statusLine = status ? `\n<${STATUS_TAG}>${status}</${STATUS_TAG}>` : ''

  return `<${TASK_NOTIFICATION_TAG}>
<${SUMMARY_TAG}>${summary}</${SUMMARY_TAG}>${statusLine}
</${TASK_NOTIFICATION_TAG}>`
}
