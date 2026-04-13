import type { BackgroundTaskState } from 'src/tasks/types.js'
import type { DeepImmutable } from 'src/types/utils.js'

export type TaskAttentionTone =
  | 'background'
  | 'suggestion'
  | 'warning'
  | 'error'
  | 'success'

export type TaskAttentionBadge = {
  kind:
    | 'queued'
    | 'tool'
    | 'approval'
    | 'retry'
    | 'stopping'
    | 'idle'
    | 'input'
    | 'ready'
    | 'review'
    | 'staging'
    | 'watch'
    | 'dream'
  label: string
  tone: TaskAttentionTone
}

export type TaskAttentionState = {
  badges: TaskAttentionBadge[]
  collapseActivityText: boolean
  rowTone?: Exclude<TaskAttentionTone, 'background'>
  leadTone?: Extract<TaskAttentionTone, 'warning' | 'error' | 'success'>
}

const TOOL_HEAVY_THRESHOLD = 8
const MAX_VISIBLE_BADGES = 2

export function getBackgroundTaskAttention(
  task: DeepImmutable<BackgroundTaskState>,
): TaskAttentionState {
  const badges: TaskAttentionBadge[] = []
  let collapseActivityText = false

  switch (task.type) {
    case 'local_bash':
      if (task.kind === 'monitor') {
        badges.push({
          kind: 'watch',
          label: 'watch',
          tone: 'background',
        })
      }
      if (task.status === 'pending') {
        badges.push({
          kind: 'staging',
          label: 'staging',
          tone: 'background',
        })
      }
      break

    case 'remote_agent':
      if (task.ultraplanPhase === 'needs_input') {
        badges.push({
          kind: 'input',
          label: 'input',
          tone: 'warning',
        })
      } else if (task.ultraplanPhase === 'plan_ready') {
        badges.push({
          kind: 'ready',
          label: 'ready',
          tone: 'success',
        })
      } else if (task.status === 'pending') {
        badges.push({
          kind: 'staging',
          label: 'staging',
          tone: 'background',
        })
      }

      if (task.isRemoteReview) {
        badges.push({
          kind: 'review',
          label: 'review',
          tone: 'suggestion',
        })
      }
      break

    case 'local_agent':
      if (task.error?.trim()) {
        badges.push({
          kind: 'retry',
          label: 'retry',
          tone: 'error',
        })
      }
      if (task.status === 'pending') {
        badges.push({
          kind: 'staging',
          label: 'staging',
          tone: 'background',
        })
      }
      if (task.pendingMessages.length > 0) {
        badges.push({
          kind: 'queued',
          label: 'queued',
          tone: 'suggestion',
        })
      }
      if ((task.progress?.toolUseCount ?? 0) >= TOOL_HEAVY_THRESHOLD) {
        badges.push({
          kind: 'tool',
          label: `${task.progress?.toolUseCount ?? 0}t`,
          tone: 'background',
        })
      }
      break

    case 'in_process_teammate':
      if (task.error?.trim()) {
        badges.push({
          kind: 'retry',
          label: 'retry',
          tone: 'error',
        })
        collapseActivityText = true
      } else if (task.awaitingPlanApproval) {
        badges.push({
          kind: 'approval',
          label: 'approval',
          tone: 'warning',
        })
        collapseActivityText = true
      } else if (task.shutdownRequested) {
        badges.push({
          kind: 'stopping',
          label: 'stopping',
          tone: 'warning',
        })
        collapseActivityText = true
      } else if (task.isIdle) {
        badges.push({
          kind: 'idle',
          label: 'idle',
          tone: 'background',
        })
        collapseActivityText = true
      }

      if (task.pendingUserMessages.length > 0) {
        badges.push({
          kind: 'queued',
          label: 'queued',
          tone: 'suggestion',
        })
      }

      if (
        !task.isIdle &&
        (task.progress?.toolUseCount ?? 0) >= TOOL_HEAVY_THRESHOLD
      ) {
        badges.push({
          kind: 'tool',
          label: `${task.progress?.toolUseCount ?? 0}t`,
          tone: 'background',
        })
      }
      break

    case 'local_workflow':
      if (task.status === 'pending') {
        badges.push({
          kind: 'staging',
          label: 'staging',
          tone: 'background',
        })
      }
      break

    case 'monitor_mcp':
      badges.push({
        kind: 'watch',
        label: 'watch',
        tone: 'background',
      })
      break

    case 'dream':
      badges.push({
        kind: 'dream',
        label: task.phase === 'updating' ? 'updating' : 'warming',
        tone: task.phase === 'updating' ? 'suggestion' : 'background',
      })
      break
  }

  return {
    badges: badges.slice(0, MAX_VISIBLE_BADGES),
    collapseActivityText,
    rowTone: resolveRowTone(badges),
    leadTone: resolveLeadTone(badges),
  }
}

export function hasQueuedBadge(attention: TaskAttentionState): boolean {
  return attention.badges.some(badge => badge.kind === 'queued')
}

export function hasToolBadge(attention: TaskAttentionState): boolean {
  return attention.badges.some(badge => badge.kind === 'tool')
}

function resolveRowTone(
  badges: readonly TaskAttentionBadge[],
): Exclude<TaskAttentionTone, 'background'> | undefined {
  return badges.find(badge => badge.tone !== 'background')?.tone
}

function resolveLeadTone(
  badges: readonly TaskAttentionBadge[],
): Extract<TaskAttentionTone, 'warning' | 'error' | 'success'> | undefined {
  const tone = badges.find(
    badge =>
      badge.tone === 'warning' ||
      badge.tone === 'error' ||
      badge.tone === 'success',
  )?.tone

  return tone as Extract<TaskAttentionTone, 'warning' | 'error' | 'success'> | undefined
}
