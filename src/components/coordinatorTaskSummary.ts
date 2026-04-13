import type { LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type {
  ImmaculateCrewBurstBudget,
  ImmaculateCrewWaveState,
  ImmaculateHarnessDeckReceipt,
  ImmaculateHarnessStatus,
} from '../utils/immaculateHarness.js'
import {
  summarizeImmaculateCrewBurstBudget,
  summarizeImmaculateCrewWave,
} from '../utils/immaculateHarness.js'

export type CoordinatorTaskSummary = {
  text: string
  tone: 'claude' | 'warning' | 'error'
  detail?: string
}

function buildImmaculateCoordinatorDetail(
  status: ImmaculateHarnessStatus | null,
  deckReceipt: ImmaculateHarnessDeckReceipt | null,
  wave: ImmaculateCrewWaveState | null | undefined,
  burstBudget: ImmaculateCrewBurstBudget | null | undefined,
): string | undefined {
  if (!status?.enabled && !wave) {
    return undefined
  }

  const parts: string[] = []
  if (status?.enabled) {
    parts.push(status.reachable ? 'immaculate online' : 'immaculate offline')
    if (deckReceipt?.profile) {
      parts.push(deckReceipt.profile)
    }
    if (deckReceipt?.executionCount) {
      parts.push(`${deckReceipt.executionCount} exec`)
    }
    if (deckReceipt?.recommendedLayerId) {
      parts.push(`recommend ${deckReceipt.recommendedLayerId}`)
    }
    if (!status.reachable && status.error) {
      parts.push(status.error)
    }
  }

  const waveSummary = summarizeImmaculateCrewWave(wave)
  if (waveSummary) {
    parts.push(waveSummary.text)
  }
  const burstSummary = summarizeImmaculateCrewBurstBudget(burstBudget)
  if (burstSummary) {
    parts.push(burstSummary.text)
  }

  return parts.length > 0 ? parts.join(' · ') : undefined
}

export function summarizeCoordinatorTasks(
  tasks: readonly LocalAgentTaskState[],
  immaculate?: {
    status: ImmaculateHarnessStatus | null
    deckReceipt: ImmaculateHarnessDeckReceipt | null
    wave?: ImmaculateCrewWaveState | null
    burstBudget?: ImmaculateCrewBurstBudget | null
    deferredLaunchCount?: number
  },
): CoordinatorTaskSummary {
  const liveCount = tasks.reduce(
    (total, task) => total + (task.status === 'running' ? 1 : 0),
    0,
  )
  const retryCount = tasks.reduce(
    (total, task) =>
      total + (task.status === 'failed' && task.error ? 1 : 0),
    0,
  )
  const queuedCount = tasks.reduce(
    (total, task) => total + task.pendingMessages.length,
    0,
  )

  const parts = [
    'flight deck roster',
    `${tasks.length} ${tasks.length === 1 ? 'agent' : 'agents'}`,
    `${liveCount} live`,
  ]

  if (retryCount > 0) {
    parts.push(`${retryCount} retry`)
  }

  if (queuedCount > 0) {
    parts.push(`${queuedCount} queued`)
  }
  if ((immaculate?.deferredLaunchCount ?? 0) > 0) {
    parts.push(
      `${immaculate!.deferredLaunchCount} deferred`,
    )
  }

  const immaculateDetail = buildImmaculateCoordinatorDetail(
    immaculate?.status ?? null,
    immaculate?.deckReceipt ?? null,
    immaculate?.wave,
    immaculate?.burstBudget,
  )
  const waveSummary = summarizeImmaculateCrewWave(immaculate?.wave)
  const burstSummary = summarizeImmaculateCrewBurstBudget(
    immaculate?.burstBudget,
  )

  return {
    text: parts.join(' · '),
    tone:
      retryCount > 0
        ? 'error'
        : waveSummary?.tone === 'error' || burstSummary?.tone === 'error'
          ? 'error'
          : queuedCount > 0 ||
              immaculate?.status?.reachable === false ||
              waveSummary?.tone === 'warning' ||
              burstSummary?.tone === 'warning' ||
              (immaculate?.deferredLaunchCount ?? 0) > 0
          ? 'warning'
          : 'claude',
    detail: immaculateDetail,
  }
}
