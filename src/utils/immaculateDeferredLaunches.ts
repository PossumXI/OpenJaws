export type ImmaculateDeferredTeammateLaunch = {
  id: string
  teamName: string
  agentName: string
  queuedAt: number
  releaseAt: number
  attempts: number
  status: 'queued' | 'launching' | 'failed'
  lastError?: string
}

export function isActiveDeferredTeammateLaunch(
  launch: Pick<ImmaculateDeferredTeammateLaunch, 'status'>,
): boolean {
  return launch.status === 'queued' || launch.status === 'launching'
}

export function countActiveDeferredTeammateLaunches(
  launches: readonly ImmaculateDeferredTeammateLaunch[],
  options?: {
    teamName?: string
  },
): number {
  return launches.filter(
    launch =>
      isActiveDeferredTeammateLaunch(launch) &&
      (!options?.teamName || launch.teamName === options.teamName),
  ).length
}

export function getNextDeferredTeammateLaunch(
  launches: readonly ImmaculateDeferredTeammateLaunch[],
  teamName: string,
): ImmaculateDeferredTeammateLaunch | null {
  const queued = launches
    .filter(launch => launch.teamName === teamName && launch.status === 'queued')
    .sort((left, right) =>
      left.releaseAt === right.releaseAt
        ? left.queuedAt - right.queuedAt
        : left.releaseAt - right.releaseAt,
    )

  return queued[0] ?? null
}

export function prioritizeDeferredTeammateLaunches(
  launches: readonly ImmaculateDeferredTeammateLaunch[],
  launchId: string,
): ImmaculateDeferredTeammateLaunch[] {
  const target = launches.find(launch => launch.id === launchId)
  if (!target || target.status !== 'queued') {
    return [...launches]
  }

  const teamQueuedLaunches = launches.filter(
    launch => launch.teamName === target.teamName && launch.status === 'queued',
  )
  const earliestReleaseAt = Math.min(
    ...teamQueuedLaunches.map(launch => launch.releaseAt),
  )
  const earliestQueuedAt = Math.min(
    ...teamQueuedLaunches.map(launch => launch.queuedAt),
  )

  return launches.map(launch =>
    launch.id === launchId
      ? {
          ...launch,
          releaseAt: earliestReleaseAt,
          queuedAt: earliestQueuedAt - 1,
        }
      : launch,
  )
}

export function releaseDeferredTeammateLaunchNow(
  launches: readonly ImmaculateDeferredTeammateLaunch[],
  launchId: string,
  now: number = Date.now(),
): ImmaculateDeferredTeammateLaunch[] {
  const target = launches.find(launch => launch.id === launchId)
  if (!target || target.status !== 'queued') {
    return [...launches]
  }

  const teamQueuedAt = launches
    .filter(launch => launch.teamName === target.teamName && launch.status === 'queued')
    .map(launch => launch.queuedAt)
  const earliestQueuedAt =
    teamQueuedAt.length > 0 ? Math.min(...teamQueuedAt) : now

  return launches.map(launch =>
    launch.id === launchId
      ? {
          ...launch,
          releaseAt: now,
          queuedAt: earliestQueuedAt - 1,
        }
      : launch,
  )
}
