import { formatTokens, truncate } from '../../utils/format.js'
import {
  summarizeImmaculateCrewBurstBudget,
  summarizeImmaculateCrewWave,
  type ImmaculateCrewBurstBudget,
  type ImmaculateCrewWaveState,
} from '../../utils/immaculateHarness.js'
import type { TaskRollupSummary } from './backgroundTaskSectionSummary.js'

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

type SummaryInput = {
  localAgents: readonly LocalAgentSummaryTask[]
  teammates: readonly TeammateSummaryTask[]
  remoteAgents: readonly RemoteAgentSummaryTask[]
  shellCount: number
  monitorCount: number
  workflowCount: number
  dreamCount: number
  width: number
  immaculateCrewWave?: ImmaculateCrewWaveState | null
  immaculateCrewBurstBudget?: ImmaculateCrewBurstBudget | null
  deferredLaunchCount?: number
}

export function summarizeBackgroundTaskDialog({
  localAgents,
  teammates,
  remoteAgents,
  shellCount,
  monitorCount,
  workflowCount,
  dreamCount,
  width,
  immaculateCrewWave,
  immaculateCrewBurstBudget,
  deferredLaunchCount = 0,
}: SummaryInput): TaskRollupSummary | null {
  const crewCount = localAgents.length + teammates.length
  const queuedCount =
    localAgents.reduce((total, task) => total + task.pendingMessages.length, 0) +
    teammates.reduce(
      (total, task) => total + task.pendingUserMessages.length,
      0,
    )
  const toolUseCount =
    localAgents.reduce(
      (total, task) => total + (task.progress?.toolUseCount ?? 0),
      0,
    ) +
    teammates.reduce(
      (total, task) => total + (task.progress?.toolUseCount ?? 0),
      0,
    )
  const tokenCount =
    localAgents.reduce(
      (total, task) => total + (task.progress?.tokenCount ?? 0),
      0,
    ) +
    teammates.reduce(
      (total, task) => total + (task.progress?.tokenCount ?? 0),
      0,
    )
  const retryCount =
    localAgents.reduce(
      (total, task) => total + (task.error?.trim() ? 1 : 0),
      0,
    ) +
    teammates.reduce(
      (total, task) => total + (task.error?.trim() ? 1 : 0),
      0,
    )
  const approvalCount = teammates.reduce(
    (total, task) => total + (task.awaitingPlanApproval ? 1 : 0),
    0,
  )
  const inputCount = remoteAgents.reduce(
    (total, task) => total + (task.ultraplanPhase === 'needs_input' ? 1 : 0),
    0,
  )
  const readyCount = remoteAgents.reduce(
    (total, task) => total + (task.ultraplanPhase === 'plan_ready' ? 1 : 0),
    0,
  )

  const modelSummary = summarizeModelMix([
    ...localAgents.map(task => task.model),
    ...teammates.map(task => task.model),
  ])

  const crewPart =
    crewCount > 0
      ? {
          full: `${crewCount} crew`,
          terse: `${crewCount}c`,
        }
      : null
  const modelPart = modelSummary
    ? {
        full: modelSummary.detailed,
        compact: modelSummary.compact,
        terse: modelSummary.terse,
      }
    : null
  const retryPart = renderStatePart(retryCount, 'retry', 'rt')
  const approvalPart = renderStatePart(approvalCount, 'approval', 'ap')
  const inputPart = renderStatePart(inputCount, 'input', 'in')
  const readyPart = renderStatePart(readyCount, 'ready', 'ok')
  const waveSummary = summarizeImmaculateCrewWave(immaculateCrewWave)
  const burstSummary = summarizeImmaculateCrewBurstBudget(
    immaculateCrewBurstBudget,
  )
  const wavePart = waveSummary
    ? {
        full: waveSummary.text,
        compact:
          immaculateCrewWave?.label === 'reroute'
            ? 'wave reroute'
            : immaculateCrewWave?.label === 'hold'
              ? 'wave hold'
              : waveSummary.text,
      }
    : null
  const burstPart = burstSummary
    ? {
        full: burstSummary.text,
        compact:
          immaculateCrewBurstBudget?.label === 'reroute'
            ? 'burst reroute'
            : 'burst hold',
      }
    : null
  const deferredPart =
    deferredLaunchCount > 0
      ? {
          full: `${deferredLaunchCount} deferred`,
          compact: `${deferredLaunchCount} def`,
        }
      : null
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

  const ancillaryParts = [
    renderCountPart(remoteAgents.length, 'remote', 'remote'),
    renderCountPart(shellCount, 'shell', 'sh'),
    renderCountPart(monitorCount, 'monitor', 'mon'),
    renderCountPart(workflowCount, 'workflow', 'wf'),
    renderCountPart(dreamCount, 'dream', 'drm'),
  ].filter((part): part is SummaryPart => Boolean(part))

  const render = (
    options: {
      includeAncillary?: boolean
      includeTokens?: boolean
      includeReady?: boolean
      crewVariant?: 'full' | 'terse'
      modelVariant?: 'full' | 'compact' | 'terse'
      severityVariant?: 'full' | 'compact'
      queueVariant?: 'full' | 'compact'
      toolVariant?: 'full' | 'compact'
      ancillaryVariant?: 'full' | 'compact'
    } = {},
  ): string | null => {
    const {
      includeAncillary = true,
      includeTokens = true,
      includeReady = true,
      crewVariant = 'full',
      modelVariant = 'full',
      severityVariant = 'full',
      queueVariant = 'full',
      toolVariant = 'full',
      ancillaryVariant = 'full',
    } = options

    const parts = [
      readVariant(crewPart, crewVariant),
      readVariant(modelPart, modelVariant),
      readVariant(retryPart, severityVariant),
      readVariant(approvalPart, severityVariant),
      readVariant(inputPart, severityVariant),
      includeReady ? readVariant(readyPart, severityVariant) : null,
      readVariant(wavePart, queueVariant),
      readVariant(burstPart, queueVariant),
      readVariant(deferredPart, queueVariant),
      readVariant(queuedPart, queueVariant),
      readVariant(toolPart, toolVariant),
      includeTokens ? tokenPart?.full ?? null : null,
      ...(includeAncillary
        ? ancillaryParts
            .map(part => readVariant(part, ancillaryVariant))
            .filter((part): part is string => Boolean(part))
        : []),
    ].filter((part): part is string => Boolean(part))

    if (parts.length === 0) {
      return null
    }

    return parts.join(' · ')
  }

  const candidates = [
    render(),
    render({ includeAncillary: false }),
    render({ includeAncillary: false, includeTokens: false }),
    render({
      includeAncillary: false,
      includeTokens: false,
      toolVariant: 'compact',
    }),
    render({
      includeAncillary: false,
      includeTokens: false,
      severityVariant: 'compact',
      toolVariant: 'compact',
    }),
    render({
      includeAncillary: false,
      includeTokens: false,
      includeReady: false,
      severityVariant: 'compact',
      queueVariant: 'compact',
      toolVariant: 'compact',
    }),
    render({
      includeAncillary: false,
      includeTokens: false,
      includeReady: false,
      modelVariant: 'compact',
      severityVariant: 'compact',
      queueVariant: 'compact',
      toolVariant: 'compact',
    }),
    render({
      includeAncillary: false,
      includeTokens: false,
      includeReady: false,
      crewVariant: 'terse',
      modelVariant: 'terse',
      severityVariant: 'compact',
      queueVariant: 'compact',
      toolVariant: 'compact',
    }),
    render({
      includeTokens: false,
      includeReady: false,
      severityVariant: 'compact',
      queueVariant: 'compact',
      toolVariant: 'compact',
      ancillaryVariant: 'compact',
    }),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (candidate.length <= width) {
      return {
        text: candidate,
        tone: resolveSummaryTone({
          retryCount,
          approvalCount,
          inputCount,
          readyCount,
          waveTone: waveSummary?.tone,
          burstTone: burstSummary?.tone,
          deferredLaunchCount,
        }),
      }
    }
  }

  if (candidates.length === 0) {
    return null
  }

  return {
    text: truncate(candidates[candidates.length - 1]!, width, true),
    tone: resolveSummaryTone({
      retryCount,
      approvalCount,
      inputCount,
      readyCount,
      waveTone: waveSummary?.tone,
      burstTone: burstSummary?.tone,
      deferredLaunchCount,
    }),
  }
}

function renderCountPart(
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
    compact: `${count} ${compactLabel}`,
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

function readVariant(
  part: SummaryPart | null,
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
  retryCount: number
  approvalCount: number
  inputCount: number
  readyCount: number
  waveTone?: TaskRollupSummary['tone']
  burstTone?: TaskRollupSummary['tone']
  deferredLaunchCount?: number
}): TaskRollupSummary['tone'] {
  if (severity.retryCount > 0) {
    return 'error'
  }

  if (severity.waveTone === 'error' || severity.burstTone === 'error') {
    return 'error'
  }

  if (
    severity.approvalCount > 0 ||
    severity.inputCount > 0 ||
    severity.waveTone === 'warning' ||
    severity.burstTone === 'warning' ||
    (severity.deferredLaunchCount ?? 0) > 0
  ) {
    return 'warning'
  }

  if (severity.readyCount > 0) {
    return 'success'
  }

  return undefined
}
