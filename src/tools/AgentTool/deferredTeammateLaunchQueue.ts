import type { ToolUseContext } from '../../Tool.js'
import { errorMessage } from '../../utils/errors.js'
import {
  countActiveDeferredTeammateLaunches,
  getNextDeferredTeammateLaunch,
  prioritizeDeferredTeammateLaunches,
  releaseDeferredTeammateLaunchNow as releaseDeferredTeammateLaunchesNow,
  type ImmaculateDeferredTeammateLaunch,
} from '../../utils/immaculateDeferredLaunches.js'
import { shouldDeferImmaculateCrewSpawn } from '../../utils/immaculateHarness.js'
import { createSystemMessage } from '../../utils/messages.js'
import { sleep } from '../../utils/sleep.js'
import { spawnTeammate } from '../shared/spawnMultiAgent.js'

type DeferredTeammateLaunchRecord = ImmaculateDeferredTeammateLaunch
type DeferredTeammateLaunchConfig = Parameters<typeof spawnTeammate>[0]
type DeferredTeammateLaunchSpawnFn = typeof spawnTeammate
type DeferredTeammateLaunchRuntimeOverrides = {
  autoProcess?: boolean
  spawnTeammate?: DeferredTeammateLaunchSpawnFn
}
type DeferredTeammateLaunchContext = ToolUseContext & {
  __deferredTeammateLaunchRuntimeOverrides?: DeferredTeammateLaunchRuntimeOverrides
}

const deferredTeammateLaunchConfigs = new Map<
  string,
  DeferredTeammateLaunchConfig
>()
const deferredTeammateLaunchAbortCleanups = new Map<string, () => void>()
const deferredTeammateLaunchTeamsInFlight = new Set<string>()
const deferredTeammateLaunchWakeVersions = new Map<string, number>()
const TEAM_WAKE_POLL_MS = 250

function getDeferredTeammateLaunchRuntimeOverrides(
  toolUseContext: ToolUseContext,
): DeferredTeammateLaunchRuntimeOverrides | null {
  return (
    (toolUseContext as DeferredTeammateLaunchContext)
      .__deferredTeammateLaunchRuntimeOverrides ?? null
  )
}

export function setDeferredTeammateLaunchRuntimeOverrides(
  toolUseContext: ToolUseContext,
  overrides: DeferredTeammateLaunchRuntimeOverrides | null,
): void {
  const context = toolUseContext as DeferredTeammateLaunchContext
  if (overrides) {
    context.__deferredTeammateLaunchRuntimeOverrides = overrides
    return
  }
  delete context.__deferredTeammateLaunchRuntimeOverrides
}

function shouldProcessDeferredTeammateLaunches(
  toolUseContext: ToolUseContext,
): boolean {
  return (
    getDeferredTeammateLaunchRuntimeOverrides(toolUseContext)?.autoProcess !==
    false
  )
}

function resolveDeferredTeammateSpawnFn(
  toolUseContext: ToolUseContext,
): DeferredTeammateLaunchSpawnFn {
  return (
    getDeferredTeammateLaunchRuntimeOverrides(toolUseContext)?.spawnTeammate ??
    spawnTeammate
  )
}

function bumpDeferredTeammateLaunchTeamWakeVersion(teamName: string): void {
  deferredTeammateLaunchWakeVersions.set(
    teamName,
    (deferredTeammateLaunchWakeVersions.get(teamName) ?? 0) + 1,
  )
}

function cleanupDeferredTeammateLaunch(launchId: string): void {
  deferredTeammateLaunchConfigs.delete(launchId)
  const cleanup = deferredTeammateLaunchAbortCleanups.get(launchId)
  cleanup?.()
  deferredTeammateLaunchAbortCleanups.delete(launchId)
}

function upsertDeferredTeammateLaunch(
  toolUseContext: ToolUseContext,
  launch: DeferredTeammateLaunchRecord,
): void {
  toolUseContext.setAppState(prev => ({
    ...prev,
    immaculateDeferredTeammateLaunches: [
      ...prev.immaculateDeferredTeammateLaunches.filter(
        existing => existing.id !== launch.id,
      ),
      launch,
    ],
  }))
}

function updateDeferredTeammateLaunches(
  toolUseContext: ToolUseContext,
  updater: (
    launches: readonly DeferredTeammateLaunchRecord[],
  ) => DeferredTeammateLaunchRecord[],
): void {
  toolUseContext.setAppState(prev => ({
    ...prev,
    immaculateDeferredTeammateLaunches: updater(
      prev.immaculateDeferredTeammateLaunches,
    ),
  }))
}

function updateDeferredTeammateLaunch(
  toolUseContext: ToolUseContext,
  launchId: string,
  updater: (launch: DeferredTeammateLaunchRecord) => DeferredTeammateLaunchRecord,
): void {
  updateDeferredTeammateLaunches(toolUseContext, launches =>
    launches.map(launch =>
      launch.id === launchId ? updater(launch) : launch,
    ),
  )
}

function removeDeferredTeammateLaunch(
  toolUseContext: ToolUseContext,
  launchId: string,
): void {
  cleanupDeferredTeammateLaunch(launchId)
  toolUseContext.setAppState(prev => ({
    ...prev,
    immaculateDeferredTeammateLaunches:
      prev.immaculateDeferredTeammateLaunches.filter(
        launch => launch.id !== launchId,
      ),
  }))
}

function getDeferredTeammateLaunch(
  toolUseContext: ToolUseContext,
  launchId: string,
): DeferredTeammateLaunchRecord | null {
  return (
    toolUseContext
      .getAppState()
      .immaculateDeferredTeammateLaunches.find(launch => launch.id === launchId) ??
    null
  )
}

async function waitForDeferredTeammateLaunchWindow(
  teamName: string,
  releaseAt: number,
): Promise<void> {
  const wakeVersion = deferredTeammateLaunchWakeVersions.get(teamName) ?? 0
  while (true) {
    const waitMs = Math.max(0, releaseAt - Date.now())
    if (waitMs === 0) {
      return
    }
    await sleep(Math.min(waitMs, TEAM_WAKE_POLL_MS))
    if ((deferredTeammateLaunchWakeVersions.get(teamName) ?? 0) !== wakeVersion) {
      return
    }
  }
}

function registerDeferredTeammateLaunchAbort(
  toolUseContext: ToolUseContext,
  launchId: string,
): void {
  const signal = toolUseContext.abortController.signal
  const onAbort = () => {
    const currentLaunch = getDeferredTeammateLaunch(toolUseContext, launchId)
    if (!currentLaunch || currentLaunch.status !== 'queued') {
      return
    }
    const config = deferredTeammateLaunchConfigs.get(launchId)
    removeDeferredTeammateLaunch(toolUseContext, launchId)
    bumpDeferredTeammateLaunchTeamWakeVersion(currentLaunch.teamName)
    if (config) {
      toolUseContext.appendSystemMessage?.(
        createSystemMessage(
          `Immaculate release cancelled · ${config.name} · ${config.team_name}`,
          'info',
        ),
      )
    }
  }

  if (signal.aborted) {
    onAbort()
    return
  }

  signal.addEventListener('abort', onAbort, {
    once: true,
  })
  deferredTeammateLaunchAbortCleanups.set(launchId, () => {
    signal.removeEventListener('abort', onAbort)
  })
}

function ensureDeferredTeammateLaunchProcessor(
  toolUseContext: ToolUseContext,
  teamName: string,
): void {
  if (!shouldProcessDeferredTeammateLaunches(toolUseContext)) {
    return
  }
  if (deferredTeammateLaunchTeamsInFlight.has(teamName)) {
    return
  }

  deferredTeammateLaunchTeamsInFlight.add(teamName)
  void (async () => {
    try {
      while (true) {
        const nextLaunch = getNextDeferredTeammateLaunch(
          toolUseContext.getAppState().immaculateDeferredTeammateLaunches,
          teamName,
        )
        if (!nextLaunch) {
          return
        }

        await waitForDeferredTeammateLaunchWindow(teamName, nextLaunch.releaseAt)

        let claimedLaunch = false
        toolUseContext.setAppState(prev => {
          const currentLaunch = prev.immaculateDeferredTeammateLaunches.find(
            launch => launch.id === nextLaunch.id,
          )
          if (!currentLaunch || currentLaunch.status !== 'queued') {
            return prev
          }
          claimedLaunch = true
          return {
            ...prev,
            immaculateDeferredTeammateLaunches:
              prev.immaculateDeferredTeammateLaunches.map(launch =>
                launch.id === nextLaunch.id
                  ? {
                      ...launch,
                      status: 'launching',
                    }
                  : launch,
              ),
          }
        })

        if (!claimedLaunch) {
          continue
        }

        const config = deferredTeammateLaunchConfigs.get(nextLaunch.id)
        if (!config) {
          removeDeferredTeammateLaunch(toolUseContext, nextLaunch.id)
          continue
        }

        const burstBudget = toolUseContext.getAppState().immaculateCrewBurstBudget
        if (
          shouldDeferImmaculateCrewSpawn(burstBudget, {
            teamName,
          })
        ) {
          const deferredUntil = Math.max(
            Date.now() + TEAM_WAKE_POLL_MS,
            burstBudget?.holdUntil ?? Date.now() + TEAM_WAKE_POLL_MS,
          )
          updateDeferredTeammateLaunch(toolUseContext, nextLaunch.id, launch => ({
            ...launch,
            status: 'queued',
            attempts: launch.attempts + 1,
            releaseAt: deferredUntil,
          }))
          bumpDeferredTeammateLaunchTeamWakeVersion(teamName)
          continue
        }

        try {
          await resolveDeferredTeammateSpawnFn(toolUseContext)(
            config,
            toolUseContext,
          )
          removeDeferredTeammateLaunch(toolUseContext, nextLaunch.id)
          toolUseContext.appendSystemMessage?.(
            createSystemMessage(
              `Immaculate release: launched queued teammate ${config.name} · ${config.team_name}`,
              'info',
            ),
          )
        } catch (error) {
          const detail = errorMessage(error)
          removeDeferredTeammateLaunch(toolUseContext, nextLaunch.id)
          toolUseContext.appendSystemMessage?.(
            createSystemMessage(
              `Immaculate release failed · ${config.name} · ${detail}`,
              'warning',
            ),
          )
        }
      }
    } finally {
      deferredTeammateLaunchTeamsInFlight.delete(teamName)
      if (
        countActiveDeferredTeammateLaunches(
          toolUseContext.getAppState().immaculateDeferredTeammateLaunches,
          {
            teamName,
          },
        ) > 0
      ) {
        ensureDeferredTeammateLaunchProcessor(toolUseContext, teamName)
      }
    }
  })()
}

export function countDeferredTeammateLaunchesForTeam(
  appState: {
    immaculateDeferredTeammateLaunches: readonly DeferredTeammateLaunchRecord[]
  },
  teamName: string,
): number {
  return countActiveDeferredTeammateLaunches(
    appState.immaculateDeferredTeammateLaunches,
    {
      teamName,
    },
  )
}

export function enqueueDeferredTeammateLaunch(
  toolUseContext: ToolUseContext,
  {
    launch,
    config,
  }: {
    launch: DeferredTeammateLaunchRecord
    config: DeferredTeammateLaunchConfig
  },
): void {
  upsertDeferredTeammateLaunch(toolUseContext, launch)
  deferredTeammateLaunchConfigs.set(launch.id, config)
  registerDeferredTeammateLaunchAbort(toolUseContext, launch.id)
  bumpDeferredTeammateLaunchTeamWakeVersion(launch.teamName)
  if (!toolUseContext.abortController.signal.aborted) {
    ensureDeferredTeammateLaunchProcessor(toolUseContext, launch.teamName)
  }
}

export function cancelDeferredTeammateLaunch(
  toolUseContext: ToolUseContext,
  launchId: string,
): boolean {
  const currentLaunch = getDeferredTeammateLaunch(toolUseContext, launchId)
  if (!currentLaunch || currentLaunch.status !== 'queued') {
    return false
  }
  removeDeferredTeammateLaunch(toolUseContext, launchId)
  bumpDeferredTeammateLaunchTeamWakeVersion(currentLaunch.teamName)
  toolUseContext.appendSystemMessage?.(
    createSystemMessage(
      `Immaculate queue: cancelled ${currentLaunch.agentName} · ${currentLaunch.teamName}`,
      'info',
    ),
  )
  return true
}

export function prioritizeDeferredTeammateLaunch(
  toolUseContext: ToolUseContext,
  launchId: string,
): boolean {
  const currentLaunch = getDeferredTeammateLaunch(toolUseContext, launchId)
  if (!currentLaunch || currentLaunch.status !== 'queued') {
    return false
  }
  updateDeferredTeammateLaunches(toolUseContext, launches =>
    prioritizeDeferredTeammateLaunches(launches, launchId),
  )
  bumpDeferredTeammateLaunchTeamWakeVersion(currentLaunch.teamName)
  ensureDeferredTeammateLaunchProcessor(toolUseContext, currentLaunch.teamName)
  toolUseContext.appendSystemMessage?.(
    createSystemMessage(
      `Immaculate queue: prioritized ${currentLaunch.agentName} · ${currentLaunch.teamName}`,
      'info',
    ),
  )
  return true
}

export function releaseDeferredTeammateLaunchNow(
  toolUseContext: ToolUseContext,
  launchId: string,
): boolean {
  const currentLaunch = getDeferredTeammateLaunch(toolUseContext, launchId)
  if (!currentLaunch || currentLaunch.status !== 'queued') {
    return false
  }
  updateDeferredTeammateLaunches(toolUseContext, launches =>
    releaseDeferredTeammateLaunchesNow(launches, launchId),
  )
  bumpDeferredTeammateLaunchTeamWakeVersion(currentLaunch.teamName)
  ensureDeferredTeammateLaunchProcessor(toolUseContext, currentLaunch.teamName)
  toolUseContext.appendSystemMessage?.(
    createSystemMessage(
      `Immaculate queue: release requested for ${currentLaunch.agentName} · ${currentLaunch.teamName}`,
      'info',
    ),
  )
  return true
}
