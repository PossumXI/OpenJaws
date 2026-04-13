import { buildTaskNotificationOverflowMessage } from '../../tasks/taskNotificationSummary.js'
import type { QueuedCommand } from '../../types/textInputTypes.js'
import { jsonParse } from '../../utils/slowOperations.js'

export const MAX_VISIBLE_TASK_NOTIFICATIONS = 3

export function isIdleNotification(value: string): boolean {
  try {
    const parsed = jsonParse(value)
    return parsed?.type === 'idle_notification'
  } catch {
    return false
  }
}

export function createOverflowTaskNotificationMessage(
  notifications: readonly QueuedCommand[],
): string {
  return buildTaskNotificationOverflowMessage(
    notifications.map(cmd => (typeof cmd.value === 'string' ? cmd.value : '')),
  )
}

export function processQueuedCommandsForPreview(
  queuedCommands: readonly QueuedCommand[],
): QueuedCommand[] {
  const filteredCommands = queuedCommands.filter(
    cmd =>
      typeof cmd.value !== 'string' || !isIdleNotification(cmd.value),
  )

  const taskNotificationCount = filteredCommands.reduce(
    (count, cmd) => count + (cmd.mode === 'task-notification' ? 1 : 0),
    0,
  )

  if (taskNotificationCount <= MAX_VISIBLE_TASK_NOTIFICATIONS) {
    return [...filteredCommands]
  }

  const visibleTaskBudget = MAX_VISIBLE_TASK_NOTIFICATIONS - 1
  let remainingVisibleTaskBudget = visibleTaskBudget
  let overflowInsertIndex: number | null = null
  const overflowNotifications: QueuedCommand[] = []
  const output: QueuedCommand[] = []

  for (const cmd of filteredCommands) {
    if (cmd.mode !== 'task-notification') {
      output.push(cmd)
      continue
    }

    if (remainingVisibleTaskBudget > 0) {
      output.push(cmd)
      remainingVisibleTaskBudget--
      continue
    }

    if (overflowInsertIndex === null) {
      overflowInsertIndex = output.length
    }
    overflowNotifications.push(cmd)
  }

  if (overflowNotifications.length === 0 || overflowInsertIndex === null) {
    return output
  }

  const overflowCommand: QueuedCommand = {
    value: createOverflowTaskNotificationMessage(overflowNotifications),
    mode: 'task-notification',
  }

  output.splice(overflowInsertIndex, 0, overflowCommand)
  return output
}
