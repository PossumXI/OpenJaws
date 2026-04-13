import React from 'react'
import { useSyncExternalStore } from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import { formatDuration } from '../../utils/format.js'
import type { ImmaculateDeferredTeammateLaunch } from '../../utils/immaculateDeferredLaunches.js'
import { Text } from '../../ink.js'
import {
  getDeferredTeammateLaunchEta,
  getDeferredTeammateLaunchStateLabel,
  getDeferredTeammateLaunchTone,
} from './deferredTeammateLaunchPresentation.js'

type Props = {
  launch: DeepImmutable<ImmaculateDeferredTeammateLaunch>
  isSelected?: boolean
}

function useDeferredLaunchCountdown(
  releaseAt: number,
  isLive: boolean,
): string | null {
  const get = () => {
    if (!isLive) {
      return null
    }
    return formatDuration(Math.max(0, releaseAt - Date.now()), {
      mostSignificantOnly: true,
    })
  }

  const subscribe = (notify: () => void) => {
    if (!isLive) {
      return () => {}
    }
    const interval = setInterval(notify, 1000)
    return () => clearInterval(interval)
  }

  return useSyncExternalStore(subscribe, get, get)
}

export function DeferredTeammateLaunchRow({
  launch,
  isSelected = false,
}: Props): React.ReactNode {
  const tone = getDeferredTeammateLaunchTone(launch)
  const countdown = useDeferredLaunchCountdown(
    launch.releaseAt,
    launch.status === 'queued',
  )
  const statusLabel = getDeferredTeammateLaunchStateLabel(launch)
  const badgeLabel =
    launch.status === 'queued'
      ? 'queued'
      : launch.status === 'launching'
        ? 'launching'
        : 'failed'
  const etaLabel =
    launch.status === 'queued'
      ? countdown === '0s'
        ? 'releasing now'
        : countdown
          ? `in ${countdown}`
          : getDeferredTeammateLaunchEta(launch)
      : getDeferredTeammateLaunchEta(launch)

  return (
    <Text>
      <Text color={tone}>[{badgeLabel}]</Text>{' '}
      <Text bold={isSelected} color={tone}>
        @{launch.agentName}
      </Text>
      <Text dimColor>{` · ${statusLabel}`}</Text>
      {etaLabel ? <Text dimColor>{` · ${etaLabel}`}</Text> : null}
      {launch.attempts > 0 ? (
        <Text dimColor>{` · ${launch.attempts} ${launch.attempts === 1 ? 'retry' : 'retries'}`}</Text>
      ) : null}
      <Text dimColor>{` · crew ${launch.teamName}`}</Text>
    </Text>
  )
}
