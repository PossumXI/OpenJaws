import { formatTokens, truncate } from '../../utils/format.js'

export type TaskSummaryTone =
  | 'suggestion'
  | 'warning'
  | 'error'
  | 'success'

export type TaskRollupSummary = {
  text: string
  tone?: TaskSummaryTone
}

type LocalAgentSummaryTask = {
  model?: string
  pendingMessages: readonly string[]
  progress?: {
    toolUseCount?: number
    tokenCount?: number
  }
  error?: string
}

type TeammateSummaryTask = {
  model?: string
  pendingUserMessages: readonly string[]
  progress?: {
    toolUseCount?: number
    tokenCount?: number
  }
  error?: string
  awaitingPlanApproval?: boolean
}

type RemoteAgentSummaryTask = {
  ultraplanPhase?: 'needs_input' | 'plan_ready'
}

type SummaryPart = {
  full: string
  compact?: string | null
  terse?: string | null
}

export function summarizeLocalAgentSection(
  tasks: readonly LocalAgentSummaryTask[],
  width: number,
): TaskRollupSummary | null {
  return summarizeSection(
    tasks.map(task => task.model),
    tasks.reduce((total, task) => total + task.pendingMessages.length, 0),
    tasks.reduce((total, task) => total + (task.progress?.toolUseCount ?? 0), 0),
    tasks.reduce((total, task) => total + (task.progress?.tokenCount ?? 0), 0),
    {
      retryCount: tasks.reduce(
        (total, task) => total + (task.error?.trim() ? 1 : 0),
        0,
      ),
    },
    width,
  )
}

export function summarizeTeammateSection(
  tasks: readonly TeammateSummaryTask[],
  width: number,
): TaskRollupSummary | null {
  return summarizeSection(
    tasks.map(task => task.model),
    tasks.reduce(
      (total, task) => total + task.pendingUserMessages.length,
      0,
    ),
    tasks.reduce((total, task) => total + (task.progress?.toolUseCount ?? 0), 0),
    tasks.reduce((total, task) => total + (task.progress?.tokenCount ?? 0), 0),
    {
      retryCount: tasks.reduce(
        (total, task) => total + (task.error?.trim() ? 1 : 0),
        0,
      ),
      approvalCount: tasks.reduce(
        (total, task) => total + (task.awaitingPlanApproval ? 1 : 0),
        0,
      ),
    },
    width,
  )
}

export function summarizeRemoteAgentSection(
  tasks: readonly RemoteAgentSummaryTask[],
  width: number,
): TaskRollupSummary | null {
  return summarizeSection(
    [],
    0,
    0,
    0,
    {
      inputCount: tasks.reduce(
        (total, task) => total + (task.ultraplanPhase === 'needs_input' ? 1 : 0),
        0,
      ),
      readyCount: tasks.reduce(
        (total, task) => total + (task.ultraplanPhase === 'plan_ready' ? 1 : 0),
        0,
      ),
    },
    width,
  )
}

function summarizeSection(
  models: readonly (string | undefined)[],
  queuedCount: number,
  toolUseCount: number,
  tokenCount: number,
  severity: {
    retryCount?: number
    approvalCount?: number
    inputCount?: number
    readyCount?: number
  },
  width: number,
): TaskRollupSummary | null {
  const modelSummary = summarizeModelMix(models)
  const modelPart = modelSummary
    ? {
        full: modelSummary.detailed,
        compact: modelSummary.compact,
        terse: modelSummary.terse,
      }
    : null
  const retryPart = renderStatePart(severity.retryCount ?? 0, 'retry', 'rt')
  const approvalPart = renderStatePart(
    severity.approvalCount ?? 0,
    'approval',
    'ap',
  )
  const inputPart = renderStatePart(severity.inputCount ?? 0, 'input', 'in')
  const readyPart = renderStatePart(severity.readyCount ?? 0, 'ready', 'ok')
  const queuedPart =
    queuedCount > 0
      ? {
          full: `${queuedCount} queued`,
          compact: `${queuedCount}q`,
        }
      : null
  const toolPart =
    toolUseCount > 0
      ? {
          full: `${toolUseCount} tools`,
          compact: `${toolUseCount}t`,
        }
      : null
  const tokenPart =
    tokenCount > 0
      ? {
          full: `${formatTokens(tokenCount)} tok`,
        }
      : null

  const render = (
    modelVariant: 'full' | 'compact' | 'terse' = 'full',
    severityVariant: 'full' | 'compact' = 'full',
    queueVariant: 'full' | 'compact' = 'full',
    toolVariant: 'full' | 'compact' = 'full',
    includeTokens = true,
    includeReady = true,
  ): string | null => {
    const parts = [
      readVariant(modelPart, modelVariant),
      readVariant(retryPart, severityVariant),
      readVariant(approvalPart, severityVariant),
      readVariant(inputPart, severityVariant),
      includeReady ? readVariant(readyPart, severityVariant) : null,
      readVariant(queuedPart, queueVariant),
      readVariant(toolPart, toolVariant),
      includeTokens ? tokenPart?.full : null,
    ].filter((part): part is string => Boolean(part))

    if (parts.length === 0) {
      return null
    }

    return parts.join(' · ')
  }

  const candidates = [
    render(),
    render('full', 'full', 'full', 'full', false),
    render('full', 'full', 'full', 'compact', false),
    render('full', 'compact', 'full', 'compact', false),
    render('full', 'compact', 'compact', 'compact', false),
    render('compact', 'compact', 'compact', 'compact', false),
    render('compact', 'compact', 'compact', 'compact', false, false),
    render('terse', 'compact', 'compact', 'compact', false, false),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (candidate.length <= width) {
      return {
        text: candidate,
        tone: resolveSummaryTone(severity),
      }
    }
  }

  if (candidates.length === 0) {
    return null
  }

  return {
    text: truncate(candidates[candidates.length - 1]!, width, true),
    tone: resolveSummaryTone(severity),
  }
}

function renderStatePart(
  count: number,
  singular: string,
  compactLabel: string,
): SummaryPart | null {
  if (count <= 0) {
    return null
  }

  const plural = count === 1 ? singular : `${singular}s`
  return {
    full: `${count} ${plural}`,
    compact: `${count}${compactLabel}`,
  }
}

function summarizeModelMix(
  models: readonly (string | undefined)[],
): { detailed: string; compact: string | null; terse: string | null } | null {
  const unique = [...new Set(models.map(normalizeModelLabel).filter(Boolean))]
  if (unique.length === 0) {
    return null
  }

  if (unique.length === 1) {
    return {
      detailed: unique[0]!,
      compact: '1 model',
      terse: '1 mdl',
    }
  }

  return {
    detailed: `${unique.length} models`,
    compact: null,
    terse: `${unique.length} mdl`,
  }
}

function readVariant<T extends { full: string }>(
  part: (T & {
    compact?: string | null
    terse?: string | null
  }) | null,
  variant: 'full' | 'compact' | 'terse',
): string | null {
  if (!part) {
    return null
  }

  if (variant === 'compact') {
    return part.compact ?? part.full
  }

  if (variant === 'terse') {
    return part.terse ?? part.compact ?? part.full
  }

  return part.full
}

function normalizeModelLabel(model: string | undefined): string | null {
  if (!model?.trim()) {
    return null
  }

  const trimmed = model.trim()
  const match = trimmed.match(/^[a-z0-9_-]+:(.+)$/i)
  return match?.[1]?.trim() || trimmed
}

function resolveSummaryTone(severity: {
  retryCount?: number
  approvalCount?: number
  inputCount?: number
  readyCount?: number
}): TaskSummaryTone | undefined {
  if ((severity.retryCount ?? 0) > 0) {
    return 'error'
  }

  if ((severity.approvalCount ?? 0) > 0 || (severity.inputCount ?? 0) > 0) {
    return 'warning'
  }

  if ((severity.readyCount ?? 0) > 0) {
    return 'success'
  }

  return undefined
}
