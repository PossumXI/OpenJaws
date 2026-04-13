/**
 * CoordinatorTaskPanel — Steerable list of background agents.
 *
 * Renders below the prompt input footer whenever local_agent tasks exist.
 * Visibility is driven by evictAfter: undefined (running/retained) shows
 * always; a timestamp shows until passed. Enter to inspect/steer, x to dismiss.
 */

import figures from 'figures'
import * as React from 'react'
import { BLACK_CIRCLE, PAUSE_ICON, PLAY_ICON } from '../constants/figures.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Box, Text, wrapText } from '../ink.js'
import { stringWidth } from '../ink/stringWidth.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import { enterTeammateView, exitTeammateView } from '../state/teammateViewHelpers.js'
import {
  type ToolActivity,
  isPanelAgentTask,
  type LocalAgentTaskState,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import { summarizeRecentActivities } from '../utils/collapseReadSearch.js'
import { formatDuration, formatNumber } from '../utils/format.js'
import {
  type ImmaculateCrewBurstBudget,
  type ImmaculateCrewWaveState,
  getImmaculateHarnessDeckReceipt,
  getImmaculateHarnessStatus,
  type ImmaculateHarnessDeckReceipt,
  type ImmaculateHarnessStatus,
} from '../utils/immaculateHarness.js'
import { countActiveDeferredTeammateLaunches } from '../utils/immaculateDeferredLaunches.js'
import { evictTerminalTask } from '../utils/task/framework.js'
import {
  getTaskStatusColor,
  getTaskStatusIcon,
  isTerminalStatus,
} from './tasks/taskStatusUtils.js'
import {
  getCoordinatorTaskCount,
  getVisibleAgentTasks,
} from './coordinatorTaskModel.js'
import { summarizeCoordinatorTasks } from './coordinatorTaskSummary.js'

const DETAIL_PREFIX_LAST = '   ⎿ '
const DETAIL_PREFIX_MIDDLE = '│  ⎿ '
const DETAIL_INDENT_LAST = '     '
const DETAIL_INDENT_MIDDLE = '│    '

export { getCoordinatorTaskCount, getVisibleAgentTasks } from './coordinatorTaskModel.js'

export function CoordinatorTaskPanel(): React.ReactNode {
  const tasks = useAppState(s => s.tasks)
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  const agentNameRegistry = useAppState(s => s.agentNameRegistry)
  const coordinatorTaskIndex = useAppState(s => s.coordinatorTaskIndex)
  const tasksSelected = useAppState(s => s.footerSelection === 'tasks')
  const selectedIndex = tasksSelected ? coordinatorTaskIndex : undefined
  const setAppState = useSetAppState()
  const immaculateCrewWave = useAppState(s => s.immaculateCrewWave)
  const immaculateCrewBurstBudget = useAppState(s => s.immaculateCrewBurstBudget)
  const deferredLaunchCount = useAppState(
    s => countActiveDeferredTeammateLaunches(s.immaculateDeferredTeammateLaunches),
  )
  const visibleTasks = getVisibleAgentTasks(tasks)
  const hasTasks = Object.values(tasks).some(isPanelAgentTask)
  const hasDeferredLaunches = deferredLaunchCount > 0
  const immaculate = useCoordinatorImmaculateSummary(
    visibleTasks.length > 0 || hasDeferredLaunches,
  )

  // 1s tick: re-render for elapsed time + evict tasks past their deadline.
  // The eviction deletes from prev.tasks, which keeps visible-count and row
  // state consistent without each consumer running its own timer.
  const tasksRef = React.useRef(tasks)
  tasksRef.current = tasks
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!hasTasks) {
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      for (const task of Object.values(tasksRef.current)) {
        if (
          isPanelAgentTask(task) &&
          (task.evictAfter ?? Number.POSITIVE_INFINITY) <= now
        ) {
          evictTerminalTask(task.id, setAppState)
        }
      }
      setTick(prev => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [hasTasks, setAppState])

  const nameByAgentId = React.useMemo(() => {
    const inverse = new Map<string, string>()
    for (const [agentName, agentId] of agentNameRegistry) {
      inverse.set(agentId, agentName)
    }
    return inverse
  }, [agentNameRegistry])

  if (visibleTasks.length === 0 && !hasDeferredLaunches) {
    return null
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <PanelHeader
        tasks={visibleTasks}
        immaculateHarnessStatus={immaculate.status}
        immaculateDeckReceipt={immaculate.deckReceipt}
        immaculateCrewWave={immaculateCrewWave}
        immaculateCrewBurstBudget={immaculateCrewBurstBudget}
        deferredLaunchCount={deferredLaunchCount}
      />
      {visibleTasks.length > 0 ? (
        <>
          <MainLine
            isSelected={selectedIndex === 0}
            isViewed={viewingAgentTaskId === undefined}
            onClick={() => exitTeammateView(setAppState)}
          />
          {visibleTasks.map((task, index) => (
            <AgentLine
              key={task.id}
              task={task}
              name={nameByAgentId.get(task.id)}
              isSelected={selectedIndex === index + 1}
              isViewed={viewingAgentTaskId === task.id}
              isLast={index === visibleTasks.length - 1}
              onClick={() => enterTeammateView(task.id, setAppState)}
            />
          ))}
        </>
      ) : null}
    </Box>
  )
}

function useCoordinatorImmaculateSummary(enabled: boolean): {
  status: ImmaculateHarnessStatus | null
  deckReceipt: ImmaculateHarnessDeckReceipt | null
} {
  const [summary, setSummary] = React.useState<{
    status: ImmaculateHarnessStatus | null
    deckReceipt: ImmaculateHarnessDeckReceipt | null
  }>({
    status: null,
    deckReceipt: null,
  })

  React.useEffect(() => {
    if (!enabled) {
      setSummary({
        status: null,
        deckReceipt: null,
      })
      return
    }

    let cancelled = false
    const refresh = async () => {
      const [status, deckReceipt] = await Promise.all([
        getImmaculateHarnessStatus().catch(() => null),
        getImmaculateHarnessDeckReceipt().catch(() => null),
      ])
      if (cancelled) {
        return
      }
      setSummary({
        status,
        deckReceipt,
      })
    }

    void refresh()
    const interval = setInterval(() => {
      void refresh()
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled])

  return summary
}

/**
 * Returns the number of visible coordinator tasks (for selection bounds).
 * Includes the "main bridge" row when any agent rows are visible.
 */
export function useCoordinatorTaskCount(): number {
  const tasks = useAppState(s => s.tasks)
  return React.useMemo(() => getCoordinatorTaskCount(tasks), [tasks])
}

function PanelHeader({
  tasks,
  immaculateHarnessStatus,
  immaculateDeckReceipt,
  immaculateCrewWave,
  immaculateCrewBurstBudget,
  deferredLaunchCount,
}: {
  tasks: readonly LocalAgentTaskState[]
  immaculateHarnessStatus: ImmaculateHarnessStatus | null
  immaculateDeckReceipt: ImmaculateHarnessDeckReceipt | null
  immaculateCrewWave?: ImmaculateCrewWaveState
  immaculateCrewBurstBudget?: ImmaculateCrewBurstBudget
  deferredLaunchCount: number
}): React.ReactNode {
  const summary = summarizeCoordinatorTasks(tasks, {
    status: immaculateHarnessStatus,
    deckReceipt: immaculateDeckReceipt,
    wave: immaculateCrewWave,
    burstBudget: immaculateCrewBurstBudget,
    deferredLaunchCount,
  })

  return (
    <Box flexDirection="column">
      <Text color={summary.tone} bold wrap="truncate">
        {summary.text}
      </Text>
      {summary.detail ? (
        <Text
          color={summary.tone === 'error' ? 'warning' : 'claude'}
          dimColor={summary.tone === 'claude'}
          wrap="truncate"
        >
          {summary.detail}
        </Text>
      ) : null}
    </Box>
  )
}

function MainLine({
  isSelected,
  isViewed,
  onClick,
}: {
  isSelected?: boolean
  isViewed?: boolean
  onClick: () => void
}): React.ReactNode {
  const [hover, setHover] = React.useState(false)
  const highlighted = Boolean(isSelected || hover)
  const dim = !highlighted && !isViewed
  const prefix = highlighted ? `${figures.pointer} ` : '  '
  const bullet = isViewed ? BLACK_CIRCLE : figures.circle

  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Text dimColor={dim} bold={isViewed}>
        {prefix}
        {bullet}{' '}
        <Text color={highlighted || isViewed ? 'claude' : undefined} bold>
          main bridge
        </Text>
      </Text>
    </Box>
  )
}

type AgentLineProps = {
  task: LocalAgentTaskState
  name?: string
  isSelected?: boolean
  isViewed?: boolean
  isLast: boolean
  onClick?: () => void
}

function AgentLine({
  task,
  name,
  isSelected,
  isViewed,
  isLast,
  onClick,
}: AgentLineProps): React.ReactNode {
  const { columns } = useTerminalSize()
  const [hover, setHover] = React.useState(false)
  const highlighted = Boolean(isSelected || hover)
  const dim = !highlighted && !isViewed
  const prefix = highlighted ? `${figures.pointer} ` : '  '
  const bullet = isViewed ? BLACK_CIRCLE : figures.circle
  const displayName = name ?? task.agentType
  const isRunning = !isTerminalStatus(task.status)
  const pausedMs = task.totalPausedMs ?? 0
  const elapsedMs = Math.max(
    0,
    isRunning
      ? Date.now() - task.startTime - pausedMs
      : (task.endTime ?? task.startTime) - task.startTime - pausedMs,
  )
  const elapsed = formatDuration(elapsedMs)
  const summary =
    normalizeInline(task.progress?.summary) ||
    normalizeInline(task.description) ||
    'working'
  const toolUseCount = task.progress?.toolUseCount ?? 0
  const tokenCount = task.progress?.tokenCount ?? 0
  const queuedCount = task.pendingMessages.length
  const statusLabel = getTaskStatusLabel(task)
  const statusIcon = getTaskStatusIcon(task.status, {
    hasError: Boolean(task.error),
  })
  const statusColor = getTaskStatusColor(task.status, {
    hasError: Boolean(task.error),
  })
  const stateIcon = isRunning ? PLAY_ICON : PAUSE_ICON
  const firstLine = buildPrimaryLine({
    prefix,
    bullet,
    displayName,
    summary,
    columns,
  })
  const metaLead = `${statusIcon} ${statusLabel}`
  const metaTail = buildMetaTail({
    elapsed,
    toolUseCount,
    tokenCount,
    queuedCount,
    isSelected: Boolean(isSelected),
    isViewed: Boolean(isViewed),
    isRunning,
  })
  const detailPrefix = isLast ? DETAIL_PREFIX_LAST : DETAIL_PREFIX_MIDDLE
  const detailIndent = isLast ? DETAIL_INDENT_LAST : DETAIL_INDENT_MIDDLE
  const metaTailWidth = Math.max(
    12,
    columns -
      stringWidth(detailPrefix) -
      stringWidth(metaLead) -
      stringWidth(` ${stateIcon}`) -
      6,
  )
  const truncatedMetaTail = wrapText(metaTail, metaTailWidth, 'truncate-end')
  const detail = getDetailLine({
    task,
    summary,
    showQueuedPreview: Boolean((isSelected || isViewed) && queuedCount > 0),
  })
  const detailBody = detail?.text
    ? wrapText(
        detail.text,
        Math.max(
          12,
          columns -
            stringWidth(detailIndent) -
            stringWidth(`${detail.label}: `) -
            4,
        ),
        'truncate-end',
      )
    : undefined

  const line = (
    <Box flexDirection="column">
      <Text dimColor={dim} bold={isViewed}>
        {firstLine.prefix}
        {firstLine.bullet}{' '}
        <Text color={highlighted || isViewed ? 'claude' : undefined} bold>
          {firstLine.displayName}
        </Text>
        <Text dimColor={dim}>: </Text>
        {firstLine.summary}
      </Text>
      <Box paddingLeft={3}>
        <Text dimColor={dim}>{detailPrefix}</Text>
        <Text color={statusColor}>
          {metaLead} {stateIcon}
        </Text>
        {truncatedMetaTail ? (
          <Text dimColor={dim}> · {truncatedMetaTail}</Text>
        ) : null}
      </Box>
      {detail && detailBody ? (
        <Box paddingLeft={3}>
          <Text dimColor={dim}>{detailIndent}</Text>
          <Text color={detail.color}>{detail.label}</Text>
          <Text dimColor={dim}>: {detailBody}</Text>
        </Box>
      ) : null}
    </Box>
  )

  if (!onClick) {
    return line
  }

  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      flexDirection="column"
    >
      {line}
    </Box>
  )
}

function buildPrimaryLine({
  prefix,
  bullet,
  displayName,
  summary,
  columns,
}: {
  prefix: string
  bullet: string
  displayName: string
  summary: string
  columns: number
}): {
  prefix: string
  bullet: string
  displayName: string
  summary: string
} {
  const availableSummaryWidth = Math.max(
    12,
    columns -
      stringWidth(prefix) -
      stringWidth(`${bullet} `) -
      stringWidth(`${displayName}: `) -
      2,
  )

  return {
    prefix,
    bullet,
    displayName,
    summary: wrapText(summary, availableSummaryWidth, 'truncate-end'),
  }
}

function buildMetaTail({
  elapsed,
  toolUseCount,
  tokenCount,
  queuedCount,
  isSelected,
  isViewed,
  isRunning,
}: {
  elapsed: string
  toolUseCount: number
  tokenCount: number
  queuedCount: number
  isSelected: boolean
  isViewed: boolean
  isRunning: boolean
}): string {
  const parts = [elapsed]

  if (toolUseCount > 0) {
    parts.push(
      `${toolUseCount} ${toolUseCount === 1 ? 'tool' : 'tools'}`,
    )
  }

  if (tokenCount > 0) {
    parts.push(`${formatNumber(tokenCount)} tok`)
  }

  if (queuedCount > 0) {
    parts.push(`${queuedCount} queued`)
  }

  if (isSelected && !isViewed) {
    parts.push(`x ${isRunning ? 'stop' : 'clear'}`)
  }

  return parts.join(' · ')
}

function getDetailLine({
  task,
  summary,
  showQueuedPreview,
}: {
  task: LocalAgentTaskState
  summary: string
  showQueuedPreview: boolean
}):
  | {
      label: string
      text: string
      color: 'claude' | 'warning' | 'error'
    }
  | undefined {
  if (task.status === 'failed' && task.error) {
    return {
      label: 'retry',
      text: normalizeInline(task.error),
      color: 'error',
    }
  }

  if (showQueuedPreview) {
    const queuedPreview = normalizeInline(
      task.pendingMessages[task.pendingMessages.length - 1],
    )
    if (queuedPreview) {
      return {
        label: 'queued note',
        text: queuedPreview,
        color: 'warning',
      }
    }
  }

  const activity = getActivityText(task.progress?.recentActivities, task.progress?.lastActivity)
  if (!activity || activity === summary) {
    return undefined
  }

  return {
    label: getActivityLabel(task.progress?.recentActivities, task.progress?.lastActivity),
    text: activity,
    color: 'claude',
  }
}

function getActivityText(
  recentActivities: readonly ToolActivity[] | undefined,
  lastActivity: ToolActivity | undefined,
): string | undefined {
  const summarized =
    recentActivities && recentActivities.length > 0
      ? summarizeRecentActivities(recentActivities)
      : undefined
  const described = lastActivity?.activityDescription
  const fallback = lastActivity?.toolName
    ? formatToolName(lastActivity.toolName)
    : undefined

  return normalizeInline(summarized) || normalizeInline(described) || fallback
}

function getActivityLabel(
  recentActivities: readonly ToolActivity[] | undefined,
  lastActivity: ToolActivity | undefined,
): string {
  if ((recentActivities?.length ?? 0) > 1) {
    return 'recent'
  }
  if (lastActivity?.isSearch) {
    return 'scan'
  }
  if (lastActivity?.isRead) {
    return 'read'
  }
  return 'activity'
}

function getTaskStatusLabel(task: LocalAgentTaskState): string {
  switch (task.status) {
    case 'completed':
      return 'done'
    case 'failed':
      return task.error ? 'retry' : 'failed'
    case 'killed':
      return 'stopped'
    default:
      return 'live'
  }
}

function normalizeInline(text: string | undefined): string | undefined {
  if (!text) {
    return undefined
  }

  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : undefined
}

function formatToolName(toolName: string): string {
  const baseName = toolName.includes(':')
    ? toolName.slice(toolName.lastIndexOf(':') + 1)
    : toolName

  return baseName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
