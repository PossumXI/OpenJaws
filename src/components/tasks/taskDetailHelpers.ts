import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'

export type QueuedMessageSummary = {
  count: number
  previews: string[]
}

export function summarizeQueuedMessages(
  messages: readonly string[] | undefined,
  maxPreviews = 2,
  maxChars = 120,
): QueuedMessageSummary | null {
  if (!messages || messages.length === 0) {
    return null
  }

  const previewCount = Math.max(1, maxPreviews)
  const previewSlice = messages.slice(-previewCount)

  return {
    count: messages.length,
    previews: previewSlice.map(message =>
      truncateInlineWhitespace(message, maxChars),
    ),
  }
}

export function formatPermissionModeLabel(
  permissionMode: PermissionMode | undefined,
): string | null {
  if (!permissionMode) {
    return null
  }

  switch (permissionMode) {
    case 'default':
      return 'standard'
    case 'acceptEdits':
      return 'builder'
    case 'bypassPermissions':
      return 'unrestricted'
    case 'dontAsk':
      return 'dont-ask'
    default:
      return permissionMode
  }
}

function truncateInlineWhitespace(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}
