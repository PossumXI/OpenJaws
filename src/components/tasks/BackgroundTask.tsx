import React from 'react'
import { Text } from 'src/ink.js'
import type { BackgroundTaskState } from 'src/tasks/types.js'
import type { DeepImmutable } from 'src/types/utils.js'
import { truncate } from 'src/utils/format.js'
import { toInkColor } from 'src/utils/ink.js'
import { plural } from 'src/utils/stringUtils.js'
import { DIAMOND_FILLED, DIAMOND_OPEN } from '../../constants/figures.js'
import {
  buildLocalAgentReceipt,
  buildTeammateReceipt,
} from './backgroundTaskReceipts.js'
import {
  getBackgroundTaskAttention,
  hasQueuedBadge,
  hasToolBadge,
  type TaskAttentionBadge,
} from './backgroundTaskAttention.js'
import { RemoteSessionProgress } from './RemoteSessionProgress.js'
import { ShellProgress, TaskStatusText } from './ShellProgress.js'
import { describeTeammateActivity } from './taskStatusUtils.js'

type Props = {
  task: DeepImmutable<BackgroundTaskState>
  maxActivityWidth?: number
  isSelected?: boolean
}

export function BackgroundTask({
  task,
  maxActivityWidth,
  isSelected = false,
}: Props): React.ReactNode {
  const activityLimit = maxActivityWidth ?? 40
  const receiptLimit = Math.max(30, activityLimit + 14)
  const attention = getBackgroundTaskAttention(task)

  switch (task.type) {
    case 'local_bash':
      return (
        <Text>
          <TaskBadges badges={attention.badges} />
          <TaskLead tone={attention.leadTone}>
            {truncate(
              task.kind === 'monitor' ? task.description : task.command,
              activityLimit,
              true,
            )}
          </TaskLead>{' '}
          {task.status !== 'running' ? <ShellProgress shell={task} /> : null}
        </Text>
      )

    case 'remote_agent': {
      if (task.isRemoteReview) {
        return (
          <Text>
            <RemoteSessionProgress session={task} />
          </Text>
        )
      }

      const running =
        task.status === 'running' || task.status === 'pending'

      return (
        <Text>
          <TaskBadges badges={attention.badges} />
          <Text dimColor>{running ? DIAMOND_OPEN : DIAMOND_FILLED} </Text>
          <TaskLead tone={attention.leadTone}>
            {truncate(task.title, activityLimit, true)}
          </TaskLead>
          <Text dimColor> · </Text>
          <RemoteSessionProgress session={task} />
        </Text>
      )
    }

    case 'local_agent': {
      const statusLabel =
        task.status === 'completed'
          ? 'done'
          : task.status === 'pending'
            ? 'staging'
            : undefined
      const statusSuffix =
        task.status === 'completed' && !task.notified ? ', unread' : undefined
      const receipt = buildLocalAgentReceipt(task, receiptLimit, {
        hideQueuedCount: hasQueuedBadge(attention),
        hideToolCount: hasToolBadge(attention),
        order: isSelected ? 'selected' : 'default',
      })

      return (
        <Text>
          <TaskBadges badges={attention.badges} />
          <TaskLead tone={attention.leadTone}>
            {truncate(task.description, activityLimit, true)}
          </TaskLead>
          {task.status !== 'running' ? (
            <>
              {' '}
              <TaskStatusText
                status={task.status}
                label={statusLabel}
                suffix={statusSuffix}
              />
            </>
          ) : null}
          <TaskReceiptLine
            receipt={receipt}
            emphasizeLead={isSelected}
            leadTone={attention.leadTone}
          />
        </Text>
      )
    }

    case 'in_process_teammate': {
      const activity = truncate(
        describeTeammateActivity(task),
        activityLimit,
        true,
      )
      const receipt = buildTeammateReceipt(task, receiptLimit, {
        hideQueuedCount: hasQueuedBadge(attention),
        hideToolCount: hasToolBadge(attention),
        order: isSelected ? 'selected' : 'default',
      })

      return (
        <Text>
          <TaskBadges badges={attention.badges} />
          <Text color={attention.leadTone ?? toInkColor(task.identity.color)}>
            @{task.identity.agentName}
          </Text>
          {!attention.collapseActivityText ? (
            <Text dimColor>: {activity}</Text>
          ) : null}
          <TaskReceiptLine
            receipt={receipt}
            emphasizeLead={isSelected}
            leadTone={attention.leadTone}
          />
        </Text>
      )
    }

    case 'local_workflow': {
      const label =
        task.workflowName ?? task.summary ?? task.description
      const statusLabel =
        task.status === 'running'
          ? `${task.agentCount} ${plural(task.agentCount, 'agent')}`
          : task.status === 'completed'
            ? 'done'
            : undefined
      const statusSuffix =
        task.status === 'completed' && !task.notified ? ', unread' : undefined

      return (
        <Text>
          <TaskBadges badges={attention.badges} />
          <TaskLead tone={attention.leadTone}>
            {truncate(label, activityLimit, true)}
          </TaskLead>{' '}
          <TaskStatusText
            status={task.status}
            label={statusLabel}
            suffix={statusSuffix}
          />
        </Text>
      )
    }

    case 'monitor_mcp': {
      const statusLabel = task.status === 'completed' ? 'done' : undefined
      const statusSuffix =
        task.status === 'completed' && !task.notified ? ', unread' : undefined

      return (
        <Text>
          <TaskBadges badges={attention.badges} />
          <TaskLead tone={attention.leadTone}>
            {truncate(task.description, activityLimit, true)}
          </TaskLead>{' '}
          {task.status !== 'running' ? (
            <TaskStatusText
              status={task.status}
              label={statusLabel}
              suffix={statusSuffix}
            />
          ) : null}
        </Text>
      )
    }

    case 'dream': {
      const detail =
        task.phase === 'updating' && task.filesTouched.length > 0
          ? `${task.filesTouched.length} ${plural(task.filesTouched.length, 'file')}`
          : `${task.sessionsReviewing} ${plural(task.sessionsReviewing, 'session')}`
      const showDreamPhase =
        !attention.badges.some(badge => badge.kind === 'dream')
      const statusLabel = task.status === 'completed' ? 'done' : undefined
      const statusSuffix =
        task.status === 'completed' && !task.notified ? ', unread' : undefined

      return (
        <Text>
          <TaskBadges badges={attention.badges} />
          <TaskLead tone={attention.leadTone}>{task.description}</TaskLead>{' '}
          <Text dimColor>
            · {showDreamPhase ? `${task.phase} · ` : ''}{detail}
          </Text>{' '}
          {task.status !== 'running' ? (
            <TaskStatusText
              status={task.status}
              label={statusLabel}
              suffix={statusSuffix}
            />
          ) : null}
        </Text>
      )
    }
  }
}

function TaskReceiptLine({
  receipt,
  emphasizeLead,
  leadTone,
}: {
  receipt: string | null
  emphasizeLead: boolean
  leadTone?: 'warning' | 'error' | 'success'
}): React.ReactNode {
  if (!receipt) {
    return null
  }

  if (!emphasizeLead) {
    return <Text dimColor>{`\n· ${receipt}`}</Text>
  }

  const [lead, ...rest] = receipt.split(' · ')
  const trailing = rest.join(' · ')

  return (
    <Text>
      {'\n'}
      <Text dimColor>· </Text>
      <Text bold color={leadTone}>{lead}</Text>
      {trailing ? <Text dimColor>{` · ${trailing}`}</Text> : null}
    </Text>
  )
}

function TaskLead({
  tone,
  children,
}: {
  tone?: 'warning' | 'error' | 'success'
  children: React.ReactNode
}): React.ReactNode {
  if (!tone) {
    return <>{children}</>
  }

  return <Text color={tone}>{children}</Text>
}

function TaskBadges({
  badges,
}: {
  badges: readonly TaskAttentionBadge[]
}): React.ReactNode {
  if (badges.length === 0) {
    return null
  }

  return (
    <>
      {badges.map((badge, index) => (
        <React.Fragment key={`${badge.kind}-${badge.label}`}>
          {index > 0 ? ' ' : null}
          <Text
            color={badge.tone === 'background' ? undefined : badge.tone}
            dimColor={badge.tone === 'background'}
          >
            [{badge.label}]
          </Text>
        </React.Fragment>
      ))}{' '}
    </>
  )
}
