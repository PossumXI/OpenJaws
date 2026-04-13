import type { Notification } from './notifications.js'

export function foldNotificationLatest(
  accumulator: Notification,
  incoming: Notification,
): Notification {
  const base = {
    key: incoming.key,
    invalidates: incoming.invalidates ?? accumulator.invalidates,
    priority: incoming.priority,
    timeoutMs: incoming.timeoutMs ?? accumulator.timeoutMs,
    fold: incoming.fold ?? accumulator.fold ?? foldNotificationLatest,
  }

  if ('jsx' in incoming) {
    return {
      ...base,
      jsx: incoming.jsx,
    }
  }

  return {
    ...base,
    text: incoming.text,
    color: incoming.color,
  }
}
