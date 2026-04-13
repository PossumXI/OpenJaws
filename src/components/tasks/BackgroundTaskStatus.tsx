import figures from 'figures'
import * as React from 'react'
import { useMemo, useState } from 'react'
import { useTerminalSize } from 'src/hooks/useTerminalSize.js'
import { stringWidth } from 'src/ink/stringWidth.js'
import { useAppState, useSetAppState } from 'src/state/AppState.js'
import {
  enterTeammateView,
  exitTeammateView,
} from 'src/state/teammateViewHelpers.js'
import { isPanelAgentTask } from 'src/tasks/LocalAgentTask/LocalAgentTask.js'
import { getPillLabel, pillNeedsCta } from 'src/tasks/pillLabel.js'
import {
  type BackgroundTaskState,
  isBackgroundTask,
  type TaskState,
} from 'src/tasks/types.js'
import { calculateHorizontalScrollWindow } from 'src/utils/horizontalScroll.js'
import {
  summarizeImmaculateCrewBurstBudget,
  summarizeImmaculateCrewWave,
} from 'src/utils/immaculateHarness.js'
import { countActiveDeferredTeammateLaunches } from 'src/utils/immaculateDeferredLaunches.js'
import { buildGemmaTrainingRouteReceipt } from 'src/utils/gemmaTraining.js'
import { Box, Text } from '../../ink.js'
import {
  AGENT_COLOR_TO_THEME_COLOR,
  AGENT_COLORS,
  type AgentColorName,
} from '../../tools/AgentTool/agentColorManager.js'
import type { Theme } from '../../utils/theme.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { summarizeBackgroundTaskPressure } from './backgroundTaskPressureSummary.js'
import { shouldHideTasksFooter } from './taskStatusUtils.js'

type Props = {
  tasksSelected: boolean
  isViewingTeammate?: boolean
  teammateFooterIndex?: number
  isLeaderIdle?: boolean
  onOpenDialog?: (taskId?: string) => void
}

type TeamPill = {
  name: string
  color?: keyof Theme
  isIdle: boolean
  taskId?: string
  idx: number
}

export function BackgroundTaskStatus({
  tasksSelected,
  isViewingTeammate,
  teammateFooterIndex = 0,
  isLeaderIdle = false,
  onOpenDialog,
}: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const { columns } = useTerminalSize()
  const tasks = useAppState(s => s.tasks)
  const teamContext = useAppState(s => s.teamContext)
  const immaculateCrewWave = useAppState(s => s.immaculateCrewWave)
  const immaculateCrewBurstBudget = useAppState(s => s.immaculateCrewBurstBudget)
  const deferredLaunchCount = useAppState(
    s =>
      countActiveDeferredTeammateLaunches(
        s.immaculateDeferredTeammateLaunches,
        teamContext?.teamName
          ? {
              teamName: teamContext.teamName,
            }
          : undefined,
      ),
  )
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  const expandedView = useAppState(s => s.expandedView)

  const runningTasks = useMemo(
    () =>
      (Object.values(tasks ?? {}) as TaskState[]).filter(
        task =>
          isBackgroundTask(task) &&
          !("external" === 'jaws' && isPanelAgentTask(task)),
      ),
    [tasks],
  )

  const showSpinnerTree = expandedView === 'teammates'
  const allTeammates =
    !showSpinnerTree &&
    runningTasks.length > 0 &&
    runningTasks.every(task => task.type === 'in_process_teammate')

  const teammateEntries = useMemo(
    () =>
      runningTasks
        .filter(
          (
            task,
          ): task is BackgroundTaskState & { type: 'in_process_teammate' } =>
            task.type === 'in_process_teammate',
        )
        .sort((left, right) =>
          left.identity.agentName.localeCompare(right.identity.agentName),
        ),
    [runningTasks],
  )

  const allPills = useMemo<TeamPill[]>(() => {
    const mainPill = {
      name: 'main',
      color: undefined as keyof Theme | undefined,
      isIdle: isLeaderIdle,
      taskId: undefined as string | undefined,
    }

    const teammatePills = teammateEntries.map(teammate => ({
      name: teammate.identity.agentName,
      color: getAgentThemeColor(teammate.identity.color),
      isIdle: teammate.isIdle,
      taskId: teammate.id,
    }))

    if (!tasksSelected) {
      teammatePills.sort((left, right) => {
        if (left.isIdle !== right.isIdle) {
          return left.isIdle ? 1 : -1
        }
        return 0
      })
    }

    return [mainPill, ...teammatePills].map((pill, idx) => ({
      ...pill,
      idx,
    }))
  }, [teammateEntries, isLeaderIdle, tasksSelected])

  const pillWidths = useMemo(
    () =>
      allPills.map((pill, index) => stringWidth(`@${pill.name}`) + (index > 0 ? 1 : 0)),
    [allPills],
  )

  const pressureSummary = summarizeBackgroundTaskPressure(
    runningTasks,
    columns >= 120 ? 26 : columns >= 96 ? 16 : 0,
  )
  const inlinePressureSummary =
    columns >= 132
      ? summarizeBackgroundTaskPressure(runningTasks, 18)
      : null
  const waveSummary = summarizeImmaculateCrewWave(immaculateCrewWave, {
    teamName: teamContext?.teamName,
  })
  const burstSummary = summarizeImmaculateCrewBurstBudget(
    immaculateCrewBurstBudget,
    {
      teamName: teamContext?.teamName,
    },
  )
  const deferredSummary =
    deferredLaunchCount > 0
      ? {
          text: `${deferredLaunchCount} deferred`,
          tone: 'warning' as const,
        }
      : null
  const gemmaRouteSummary = useMemo(
    () => buildGemmaTrainingRouteReceipt({ compact: columns < 144 }),
    [columns],
  )

  if (allTeammates || (!showSpinnerTree && isViewingTeammate)) {
    const selectedIdx = tasksSelected ? teammateFooterIndex : -1
    const viewedIdx = viewingAgentTaskId
      ? teammateEntries.findIndex(task => task.id === viewingAgentTaskId) + 1
      : 0
    const availableWidth = Math.max(20, columns - 20 - 4)
    const { startIndex, endIndex, showLeftArrow, showRightArrow } =
      calculateHorizontalScrollWindow(
        pillWidths,
        availableWidth,
        2,
        selectedIdx >= 0 ? selectedIdx : 0,
      )
    const visiblePills = allPills.slice(startIndex, endIndex)

    return (
      <>
        {showLeftArrow && <Text dimColor>{figures.arrowLeft} </Text>}
        {visiblePills.map((pill, index) => (
          <React.Fragment key={pill.name}>
            {index > 0 && <Text> </Text>}
            <AgentPill
              name={pill.name}
              color={pill.color}
              isSelected={selectedIdx === pill.idx}
              isViewed={viewedIdx === pill.idx}
              isIdle={pill.isIdle}
              onClick={() =>
                pill.taskId
                  ? enterTeammateView(pill.taskId, setAppState)
                  : exitTeammateView(setAppState)
              }
            />
          </React.Fragment>
        ))}
        {showRightArrow && <Text dimColor> {figures.arrowRight}</Text>}
        {inlinePressureSummary ? (
          <PressureSummaryText summary={inlinePressureSummary} />
        ) : null}
        {waveSummary ? <PressureSummaryText summary={waveSummary} /> : null}
        {burstSummary ? <PressureSummaryText summary={burstSummary} /> : null}
        {deferredSummary ? (
          <PressureSummaryText summary={deferredSummary} />
        ) : null}
        {gemmaRouteSummary ? (
          <PressureSummaryText summary={gemmaRouteSummary} />
        ) : null}
        <Text dimColor>
          {' '}
          · <KeyboardShortcutHint shortcut="shift + ↓" action="expand" />
        </Text>
      </>
    )
  }

  if (
    shouldHideTasksFooter(tasks ?? {}, showSpinnerTree) &&
    deferredLaunchCount === 0 &&
    !gemmaRouteSummary
  ) {
    return null
  }

  if (runningTasks.length === 0 && deferredLaunchCount === 0 && !gemmaRouteSummary) {
    return null
  }

  const pillLabel =
    runningTasks.length > 0
      ? `deck ${getPillLabel(runningTasks)}`
      : gemmaRouteSummary
        ? 'deck gemma'
        : 'deck queued'
  const showAggregatePressure =
    !(
      runningTasks.length === 1 &&
      runningTasks[0]?.type === 'remote_agent' &&
      runningTasks[0].isUltraplan === true &&
      runningTasks[0].ultraplanPhase !== undefined
    ) || deferredLaunchCount > 0
  const summaryTone =
    pressureSummary?.tone ??
    deferredSummary?.tone ??
    burstSummary?.tone ??
    waveSummary?.tone ??
    gemmaRouteSummary?.tone

  return (
    <>
      <SummaryPill
        selected={tasksSelected}
        onClick={onOpenDialog}
        tone={showAggregatePressure ? summaryTone : undefined}
      >
        {pillLabel}
      </SummaryPill>
      {showAggregatePressure && pressureSummary ? (
        <PressureSummaryText summary={pressureSummary} />
      ) : null}
      {waveSummary ? <PressureSummaryText summary={waveSummary} /> : null}
      {burstSummary ? <PressureSummaryText summary={burstSummary} /> : null}
      {deferredSummary ? <PressureSummaryText summary={deferredSummary} /> : null}
      {gemmaRouteSummary ? (
        <PressureSummaryText summary={gemmaRouteSummary} />
      ) : null}
      {pillNeedsCta(runningTasks) ? (
        <Text dimColor> · {figures.arrowDown} inspect</Text>
      ) : null}
    </>
  )
}

type AgentPillProps = {
  name: string
  color?: keyof Theme
  isSelected: boolean
  isViewed: boolean
  isIdle: boolean
  onClick?: () => void
}

function AgentPill({
  name,
  color,
  isSelected,
  isViewed,
  isIdle,
  onClick,
}: AgentPillProps): React.ReactNode {
  const [hover, setHover] = useState(false)
  const highlighted = isSelected || hover

  let label: React.ReactNode
  if (highlighted) {
    label = color ? (
      <Text backgroundColor={color} color="inverseText" bold={isViewed}>
        @{name}
      </Text>
    ) : (
      <Text color="background" inverse bold={isViewed}>
        @{name}
      </Text>
    )
  } else if (isIdle) {
    label = (
      <Text dimColor bold={isViewed}>
        @{name}
      </Text>
    )
  } else if (isViewed) {
    label = (
      <Text color={color} bold>
        @{name}
      </Text>
    )
  } else {
    label = (
      <Text color={color} dimColor={!color}>
        @{name}
      </Text>
    )
  }

  if (!onClick) {
    return label
  }

  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </Box>
  )
}

function SummaryPill({
  selected,
  onClick,
  children,
  tone,
}: {
  selected: boolean
  onClick?: () => void
  children: React.ReactNode
  tone?: 'suggestion' | 'warning' | 'error' | 'success'
}): React.ReactNode {
  const [hover, setHover] = useState(false)
  const highlighted = selected || hover
  const label = (
    <Text color={tone ?? 'claude'} inverse={highlighted} bold={!highlighted}>
      {children}
    </Text>
  )

  if (!onClick) {
    return label
  }

  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </Box>
  )
}

function PressureSummaryText({
  summary,
}: {
  summary: {
    text: string
    tone?: 'suggestion' | 'warning' | 'error' | 'success'
  }
}): React.ReactNode {
  return (
    <Text color={summary.tone} dimColor={!summary.tone}>
      {' '}
      · {summary.text}
    </Text>
  )
}

function getAgentThemeColor(
  colorName: string | undefined,
): keyof Theme | undefined {
  if (!colorName) {
    return undefined
  }

  if (AGENT_COLORS.includes(colorName as AgentColorName)) {
    return AGENT_COLOR_TO_THEME_COLOR[colorName as AgentColorName]
  }

  return undefined
}
