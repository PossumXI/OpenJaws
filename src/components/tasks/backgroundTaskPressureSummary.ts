import { truncate } from '../../utils/format.js'
import type { BackgroundTaskState } from '../../tasks/types.js'
import type { TaskRollupSummary } from './backgroundTaskSectionSummary.js'

type PressureCounts = {
  retryCount: number
  approvalCount: number
  inputCount: number
  readyCount: number
}

export function summarizeBackgroundTaskPressure(
  tasks: readonly BackgroundTaskState[],
  width: number,
): TaskRollupSummary | null {
  if (width <= 0) {
    return null
  }

  const counts = countPressure(tasks)
  const tone = resolvePressureTone(counts)
  if (!tone) {
    return null
  }

  const parts = [
    renderPressurePart(counts.retryCount, 'retry', 'rt'),
    renderPressurePart(counts.approvalCount, 'approval', 'ap'),
    renderPressurePart(counts.inputCount, 'input', 'in'),
    renderPressurePart(counts.readyCount, 'ready', 'ok'),
  ].filter((part): part is { full: string; compact: string } => Boolean(part))

  const full = parts.map(part => part.full).join(' · ')
  if (full.length <= width) {
    return { text: full, tone }
  }

  const compact = parts.map(part => part.compact).join(' · ')
  if (compact.length <= width) {
    return { text: compact, tone }
  }

  const highestPriority = parts[0]
  if (!highestPriority) {
    return null
  }

  if (highestPriority.full.length <= width) {
    return { text: highestPriority.full, tone }
  }

  return {
    text: truncate(highestPriority.compact, width, true),
    tone,
  }
}

function countPressure(tasks: readonly BackgroundTaskState[]): PressureCounts {
  let retryCount = 0
  let approvalCount = 0
  let inputCount = 0
  let readyCount = 0

  for (const task of tasks) {
    switch (task.type) {
      case 'local_agent':
        if (task.error?.trim()) {
          retryCount++
        }
        break
      case 'in_process_teammate':
        if (task.error?.trim()) {
          retryCount++
        } else if (task.awaitingPlanApproval) {
          approvalCount++
        }
        break
      case 'remote_agent':
        if (task.ultraplanPhase === 'needs_input') {
          inputCount++
        } else if (task.ultraplanPhase === 'plan_ready') {
          readyCount++
        }
        break
    }
  }

  return {
    retryCount,
    approvalCount,
    inputCount,
    readyCount,
  }
}

function renderPressurePart(
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

function resolvePressureTone(
  counts: PressureCounts,
): TaskRollupSummary['tone'] {
  if (counts.retryCount > 0) {
    return 'error'
  }

  if (counts.approvalCount > 0 || counts.inputCount > 0) {
    return 'warning'
  }

  if (counts.readyCount > 0) {
    return 'success'
  }

  return undefined
}
