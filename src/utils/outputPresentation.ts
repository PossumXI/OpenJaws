export type OutputLifecycleStatus =
  | 'completed'
  | 'failed'
  | 'killed'
  | 'running'
  | 'pending'
  | 'watch'

const INTERNAL_TAG_REGEX =
  /<\/?(?:task-notification|summary|status|teammate-message|plan-approval|shutdown-message|task-assignment-message)[^>]*>/gi
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g
const INLINE_CODE_REGEX = /`([^`]+)`/g
const CODE_FENCE_REGEX = /```[\s\S]*?```/g

function truncateByChars(text: string, maxLength: number): string {
  if (maxLength <= 3 || text.length <= maxLength) {
    return text.slice(0, maxLength)
  }
  return `${text.slice(0, maxLength - 3).trimEnd()}...`
}

export function sanitizeOutputText(text: string): string {
  return text
    .replace(CODE_FENCE_REGEX, ' code block ')
    .replace(MARKDOWN_LINK_REGEX, '$1')
    .replace(INLINE_CODE_REGEX, '$1')
    .replace(INTERNAL_TAG_REGEX, ' ')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function summarizeOutputText(
  text: string,
  maxLength = 120,
  fallback = 'Update ready',
): string {
  const sanitized = sanitizeOutputText(text)
  if (!sanitized) {
    return fallback
  }
  return truncateByChars(sanitized, maxLength).replace(/[;:,.!?]+$/, '')
}

export function formatLifecycleStatusText(
  status: OutputLifecycleStatus,
): string {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'failed':
      return 'retry'
    case 'killed':
      return 'stopped'
    case 'running':
      return 'active'
    case 'pending':
      return 'queued'
    case 'watch':
      return 'waiting'
  }
}

export function formatScopedActivitySummary(args: {
  scope: string
  title: string
  status: Extract<OutputLifecycleStatus, 'completed' | 'failed' | 'killed' | 'watch'>
  detail?: string
  completedLabel?: string
}): string {
  const title = summarizeOutputText(args.title, 72, args.scope)
  switch (args.status) {
    case 'completed':
      return `${args.scope} "${title}" ${args.completedLabel ?? 'completed'}`
    case 'failed':
      return `${args.scope} "${title}" needs retry${args.detail ? `: ${summarizeOutputText(args.detail, 72)}` : ''}`
    case 'killed':
      return `${args.scope} "${title}" stopped`
    case 'watch':
      return `${args.scope} "${title}" waiting for input`
  }
}

export function formatDirectDeliverySummary(args: {
  target: string
  summary?: string | null
  recipientCount?: number
}): string {
  const prefix =
    typeof args.recipientCount === 'number'
      ? `Delivered to ${args.recipientCount} teammate${args.recipientCount === 1 ? '' : 's'}`
      : `Delivered to ${args.target}`
  const summary = args.summary ? summarizeOutputText(args.summary, 88, '') : ''
  return summary ? `${prefix} · ${summary}` : prefix
}

export function polishToolUseSummaryLabel(
  label: string,
  maxLength = 48,
): string | null {
  const summary = summarizeOutputText(label, maxLength, '')
  if (!summary) {
    return null
  }
  return summary.replace(/^[a-z]/, letter => letter.toUpperCase())
}
