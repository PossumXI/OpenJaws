import React, { useMemo } from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import { useElapsedTime } from '../../hooks/useElapsedTime.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text, useTheme } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { getTools } from '../../tools.js'
import { formatNumber } from '../../utils/format.js'
import { extractTag } from '../../utils/messages.js'
import { renderExternalModelName } from '../../utils/model/externalProviders.js'
import { renderModelName } from '../../utils/model/model.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { UserPlanMessage } from '../messages/UserPlanMessage.js'
import {
  TaskDetailSection,
  TaskReceiptList,
  type TaskReceiptItem,
} from './TaskDetailSection.js'
import { renderToolActivity } from './renderToolActivity.js'
import { getTaskStatusColor, getTaskStatusIcon } from './taskStatusUtils.js'
import { summarizeQueuedMessages } from './taskDetailHelpers.js'

type Props = {
  agent: DeepImmutable<LocalAgentTaskState>
  onDone: () => void
  onKillAgent?: () => void
  onBack?: () => void
}

export function AsyncAgentDetailDialog({
  agent,
  onDone,
  onKillAgent,
  onBack,
}: Props): React.ReactNode {
  const [theme] = useTheme()
  const tools = useMemo(
    () => getTools(getEmptyToolPermissionContext()),
    [],
  )

  const elapsedTime = useElapsedTime(
    agent.startTime,
    agent.status === 'running',
    1000,
    agent.totalPausedMs ?? 0,
  )

  useKeybindings(
    {
      'confirm:yes': onDone,
    },
    { context: 'Confirmation' },
  )

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      event.preventDefault()
      onDone()
      return
    }

    if (event.key === 'left' && onBack) {
      event.preventDefault()
      onBack()
      return
    }

    if (event.key === 'x' && agent.status === 'running' && onKillAgent) {
      event.preventDefault()
      onKillAgent()
    }
  }

  const planContent = extractTag(agent.prompt, 'plan')
  const displayPrompt =
    agent.prompt.length > 300
      ? `${agent.prompt.substring(0, 297)}…`
      : agent.prompt

  const tokenCount = agent.result?.totalTokens ?? agent.progress?.tokenCount
  const toolUseCount =
    agent.result?.totalToolUseCount ?? agent.progress?.toolUseCount
  const queuedMessages = summarizeQueuedMessages(agent.pendingMessages)
  const modelLabel = formatModelLabel(agent.model)
  const focusText = agent.progress?.summary || agent.description || 'working'
  const recentActivities = agent.progress?.recentActivities ?? []
  const statusLabel = getAgentStatusLabel(agent.status)

  const title = (
    <Text>
      {agent.selectedAgent?.agentType ?? agent.agentType ?? 'agent'} ›{' '}
      {agent.description || 'Async agent'}
    </Text>
  )

  const subtitle = (
    <Text>
      {agent.status !== 'running' ? (
        <Text color={getTaskStatusColor(agent.status)}>
          {getTaskStatusIcon(agent.status)} {statusLabel} ·{' '}
        </Text>
      ) : null}
      <Text dimColor>
        {elapsedTime}
        {tokenCount !== undefined && tokenCount > 0 ? (
          <> · {formatNumber(tokenCount)} tokens</>
        ) : null}
        {toolUseCount !== undefined && toolUseCount > 0 ? (
          <>
            {' '}
            · {toolUseCount} {toolUseCount === 1 ? 'tool' : 'tools'}
          </>
        ) : null}
      </Text>
    </Text>
  )

  const flightDeckItems: TaskReceiptItem[] = [
    {
      label: 'kind',
      value: agent.selectedAgent?.agentType ?? agent.agentType ?? 'agent',
    },
    {
      label: 'focus',
      value: focusText,
    },
  ]
  if (modelLabel) {
    flightDeckItems.splice(1, 0, {
      label: 'model',
      value: modelLabel,
    })
  }
  if (queuedMessages) {
    flightDeckItems.push({
      label: 'queue',
      value: `${queuedMessages.count} queued ${
        queuedMessages.count === 1 ? 'note' : 'notes'
      }`,
      color: 'warning',
    })
  }

  return (
    <Box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      <Dialog
        title={title}
        subtitle={subtitle}
        onCancel={onDone}
        color="claude"
        inputGuide={exitState =>
          exitState.pending ? (
            <Text>Press {exitState.keyName} again to exit</Text>
          ) : (
            <Byline>
              {onBack ? (
                <KeyboardShortcutHint shortcut="←" action="go back" />
              ) : null}
              <KeyboardShortcutHint
                shortcut="Esc/Enter/Space"
                action="close"
              />
              {agent.status === 'running' && onKillAgent ? (
                <KeyboardShortcutHint shortcut="x" action="stop" />
              ) : null}
            </Byline>
          )
        }
      >
        <TaskDetailSection title="Flight deck" marginTop={0}>
          <TaskReceiptList items={flightDeckItems} />
        </TaskDetailSection>

        {queuedMessages ? (
          <TaskDetailSection title="Note deck">
            <Text dimColor>
              queued for the next idle or tool boundary
            </Text>
            <Box flexDirection="column">
              {queuedMessages.previews.map((preview, index) => (
                <Text key={`${index}:${preview}`} wrap="wrap">
                  {index === queuedMessages.previews.length - 1 ? '› ' : '· '}
                  {preview}
                </Text>
              ))}
            </Box>
          </TaskDetailSection>
        ) : null}

        {agent.status === 'running' && recentActivities.length > 0 ? (
          <TaskDetailSection title="Recent activity">
            <Box flexDirection="column">
              {recentActivities.map((activity, index) => (
                <Text
                  key={index}
                  dimColor={index < recentActivities.length - 1}
                  wrap="truncate-end"
                >
                  {index === recentActivities.length - 1 ? '› ' : '· '}
                  {renderToolActivity(activity, tools, theme)}
                </Text>
              ))}
            </Box>
          </TaskDetailSection>
        ) : null}

        {planContent ? (
          <TaskDetailSection title="Plan">
            <UserPlanMessage addMargin={false} planContent={planContent} />
          </TaskDetailSection>
        ) : (
          <TaskDetailSection title="Prompt">
            <Text wrap="wrap">{displayPrompt}</Text>
          </TaskDetailSection>
        )}

        {agent.status === 'failed' && agent.error ? (
          <TaskDetailSection title="Error">
            <Text color="error" wrap="wrap">
              {agent.error}
            </Text>
          </TaskDetailSection>
        ) : null}
      </Dialog>
    </Box>
  )
}

function formatModelLabel(model: string | undefined): string | null {
  if (!model?.trim()) {
    return null
  }

  return renderExternalModelName(model) ?? renderModelName(model)
}

function getAgentStatusLabel(status: LocalAgentTaskState['status']): string {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'killed':
      return 'Stopped'
    default:
      return 'Running'
  }
}
