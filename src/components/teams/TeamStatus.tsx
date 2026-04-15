import * as React from 'react'
import { Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'

type Props = {
  teamsSelected: boolean
  showHint: boolean
}

/**
 * Footer status indicator showing teammate count
 * Similar to BackgroundTaskStatus but for teammates
 */
export function TeamStatus({
  teamsSelected,
  showHint,
}: Props): React.ReactNode {
  const teamContext = useAppState(s => s.teamContext)

  const visibleTeammates = teamContext
    ? Object.values(teamContext.teammates).filter(
        teammate => teammate.name !== 'team-lead',
      )
    : []

  if (visibleTeammates.length === 0) {
    return null
  }

  const coworkCount = visibleTeammates.filter(teammate =>
    Boolean(teammate.terminalContextId),
  ).length
  const hint =
    showHint && teamsSelected ? (
      <>
        <Text dimColor>· </Text>
        <Text dimColor>Enter to inspect</Text>
      </>
    ) : null
  const statusText =
    coworkCount > 0
      ? `crew ${visibleTeammates.length} · co-work ${coworkCount}`
      : `crew ${visibleTeammates.length}`

  return (
    <>
      <Text
        key={teamsSelected ? 'selected' : 'normal'}
        color={teamsSelected ? 'background' : 'openjawsOcean'}
        inverse={teamsSelected}
        bold={!teamsSelected}
      >
        {statusText}
      </Text>
      {hint ? <Text> {hint}</Text> : null}
    </>
  )
}
