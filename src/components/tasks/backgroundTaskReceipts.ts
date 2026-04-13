import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'
import { formatTokens, truncate } from '../../utils/format.js'
import { plural } from '../../utils/stringUtils.js'
import { formatPermissionModeLabel } from './taskDetailHelpers.js'

type AgentProgressLike = {
  toolUseCount?: number
  tokenCount?: number
  summary?: string
  lastActivity?: { activityDescription?: string }
  recentActivities?: readonly {
    toolName: string
    input: Record<string, unknown>
    activityDescription?: string
    isSearch?: boolean
    isRead?: boolean
  }[]
}

type LocalAgentLike = {
  status: 'running' | 'pending' | 'completed' | 'failed' | 'killed'
  model?: string
  pendingMessages: readonly string[]
  progress?: AgentProgressLike
  error?: string
}

type InProcessTeammateLike = {
  model?: string
  permissionMode: PermissionMode
  pendingUserMessages: readonly string[]
  progress?: AgentProgressLike
}

type TaskReceiptOrder = 'default' | 'selected'

type TaskReceiptSegment = {
  kind: 'model' | 'permissionMode' | 'queued' | 'tool' | 'tokens' | 'focus'
  text: string
}

export function formatTaskModelLabel(model: string | undefined): string | null {
  if (!model?.trim()) {
    return null
  }

  return model.trim()
}

export function buildLocalAgentReceipt(
  task: LocalAgentLike,
  width: number,
  options?: {
    hideQueuedCount?: boolean
    hideToolCount?: boolean
    order?: TaskReceiptOrder
  },
): string | null {
  const parts: TaskReceiptSegment[] = []

  const model = formatTaskModelLabel(task.model)
  if (model) {
    parts.push({
      kind: 'model',
      text: model,
    })
  }

  if (!options?.hideQueuedCount && task.pendingMessages.length > 0) {
    parts.push(
      {
        kind: 'queued',
        text: `${task.pendingMessages.length} queued ${plural(
          task.pendingMessages.length,
          'note',
        )}`,
      },
    )
  }

  const toolUseCount = task.progress?.toolUseCount ?? 0
  if (!options?.hideToolCount && toolUseCount > 0) {
    parts.push({
      kind: 'tool',
      text: `${toolUseCount} ${plural(toolUseCount, 'tool')}`,
    })
  }

  const tokenCount = task.progress?.tokenCount ?? 0
  if (tokenCount > 0) {
    parts.push({
      kind: 'tokens',
      text: `${formatTokens(tokenCount)} tok`,
    })
  }

  const focus =
    task.status === 'failed' && task.error
      ? task.error
      : getProgressFocus(task.progress)
  if (focus) {
    parts.push({
      kind: 'focus',
      text: focus,
    })
  }

  if (parts.length === 0) {
    return null
  }

  return truncate(
    orderReceiptSegments(parts, options?.order).map(part => part.text).join(' · '),
    width,
    true,
  )
}

export function buildTeammateReceipt(
  task: InProcessTeammateLike,
  width: number,
  options?: {
    hideQueuedCount?: boolean
    hideToolCount?: boolean
    order?: TaskReceiptOrder
  },
): string | null {
  const parts: TaskReceiptSegment[] = []

  const model = formatTaskModelLabel(task.model)
  if (model) {
    parts.push({
      kind: 'model',
      text: model,
    })
  }

  const permissionMode = formatPermissionModeLabel(task.permissionMode)
  if (permissionMode) {
    parts.push({
      kind: 'permissionMode',
      text: `mode ${permissionMode}`,
    })
  }

  if (!options?.hideQueuedCount && task.pendingUserMessages.length > 0) {
    parts.push(
      {
        kind: 'queued',
        text: `${task.pendingUserMessages.length} queued ${plural(
          task.pendingUserMessages.length,
          'note',
        )}`,
      },
    )
  }

  const toolUseCount = task.progress?.toolUseCount ?? 0
  if (!options?.hideToolCount && toolUseCount > 0) {
    parts.push({
      kind: 'tool',
      text: `${toolUseCount} ${plural(toolUseCount, 'tool')}`,
    })
  }

  const tokenCount = task.progress?.tokenCount ?? 0
  if (tokenCount > 0) {
    parts.push({
      kind: 'tokens',
      text: `${formatTokens(tokenCount)} tok`,
    })
  }

  if (parts.length === 0) {
    return null
  }

  return truncate(
    orderReceiptSegments(parts, options?.order).map(part => part.text).join(' · '),
    width,
    true,
  )
}

function getProgressFocus(progress: AgentProgressLike | undefined): string | null {
  if (!progress) {
    return null
  }

  if (progress.summary?.trim()) {
    return progress.summary.trim()
  }

  if (progress.recentActivities && progress.recentActivities.length > 0) {
    for (let i = progress.recentActivities.length - 1; i >= 0; i--) {
      const description = progress.recentActivities[i]?.activityDescription?.trim()
      if (description) {
        return description
      }
    }
  }

  const fallback = progress.lastActivity?.activityDescription?.trim()
  return fallback || null
}

function orderReceiptSegments(
  segments: readonly TaskReceiptSegment[],
  order: TaskReceiptOrder | undefined,
): readonly TaskReceiptSegment[] {
  if (!order || order === 'default') {
    return segments
  }

  const priority: Record<TaskReceiptSegment['kind'], number> = {
    focus: 0,
    tool: 1,
    queued: 2,
    permissionMode: 3,
    model: 4,
    tokens: 5,
  }

  return [...segments].sort((left, right) => {
    const delta = priority[left.kind] - priority[right.kind]
    if (delta !== 0) {
      return delta
    }

    return 0
  })
}
