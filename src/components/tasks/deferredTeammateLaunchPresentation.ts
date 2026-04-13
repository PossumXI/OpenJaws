import type { ImmaculateDeferredTeammateLaunch } from '../../utils/immaculateDeferredLaunches.js'
import { formatDuration, formatRelativeTime } from '../../utils/format.js'

export function getDeferredTeammateLaunchTone(
  launch: Pick<ImmaculateDeferredTeammateLaunch, 'status'>,
): 'warning' | 'success' | 'error' {
  if (launch.status === 'failed') {
    return 'error'
  }
  if (launch.status === 'launching') {
    return 'success'
  }
  return 'warning'
}

export function getDeferredTeammateLaunchStateLabel(
  launch: Pick<ImmaculateDeferredTeammateLaunch, 'status'>,
): string {
  if (launch.status === 'launching') {
    return 'launching'
  }
  if (launch.status === 'failed') {
    return 'failed'
  }
  return 'queued'
}

export function getDeferredTeammateLaunchEta(
  launch: Pick<ImmaculateDeferredTeammateLaunch, 'status' | 'releaseAt'>,
  now: number = Date.now(),
): string | null {
  if (launch.status === 'failed') {
    return null
  }
  if (launch.status === 'launching') {
    return 'releasing now'
  }

  const remainingMs = Math.max(0, launch.releaseAt - now)
  if (remainingMs === 0) {
    return 'releasing now'
  }

  return `in ${formatDuration(remainingMs, { mostSignificantOnly: true })}`
}

export function buildDeferredTeammateLaunchRowText(
  launch: Pick<
    ImmaculateDeferredTeammateLaunch,
    'agentName' | 'status' | 'releaseAt' | 'attempts' | 'lastError'
  >,
  now: number = Date.now(),
): string {
  const parts = [`@${launch.agentName}`, getDeferredTeammateLaunchStateLabel(launch)]
  const eta = getDeferredTeammateLaunchEta(launch, now)
  if (eta) {
    parts.push(eta)
  }
  if (launch.attempts > 0) {
    parts.push(`${launch.attempts} ${launch.attempts === 1 ? 'retry' : 'retries'}`)
  }
  if (launch.status === 'failed' && launch.lastError) {
    parts.push(launch.lastError)
  }
  return parts.join(' · ')
}

export function buildDeferredTeammateLaunchDetailItems(
  launch: Pick<
    ImmaculateDeferredTeammateLaunch,
    | 'teamName'
    | 'status'
    | 'queuedAt'
    | 'releaseAt'
    | 'attempts'
    | 'lastError'
  >,
  now: number = Date.now(),
): Array<{ label: string; value: string; color?: 'warning' | 'success' | 'error' }> {
  const items: Array<{
    label: string
    value: string
    color?: 'warning' | 'success' | 'error'
  }> = [
    {
      label: 'team',
      value: launch.teamName,
    },
    {
      label: 'state',
      value: getDeferredTeammateLaunchStateLabel(launch),
      color: getDeferredTeammateLaunchTone(launch),
    },
    {
      label: 'queued',
      value: formatRelativeTime(new Date(launch.queuedAt), {
        now: new Date(now),
      }),
    },
  ]

  const eta = getDeferredTeammateLaunchEta(launch, now)
  if (eta) {
    items.push({
      label: 'release',
      value: eta,
      color: launch.status === 'queued' ? 'warning' : 'success',
    })
  }

  if (launch.attempts > 0) {
    items.push({
      label: 'attempts',
      value: `${launch.attempts}`,
    })
  }

  if (launch.status === 'failed' && launch.lastError) {
    items.push({
      label: 'error',
      value: launch.lastError,
      color: 'error',
    })
  }

  return items
}
