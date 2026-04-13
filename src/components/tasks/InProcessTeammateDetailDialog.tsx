import React, { useMemo } from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import { useElapsedTime } from '../../hooks/useElapsedTime.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text, useTheme } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import type { InProcessTeammateTaskState } from '../../tasks/InProcessTeammateTask/types.js'
import { getTools } from '../../tools.js'
import { formatNumber, truncateToWidth } from '../../utils/format.js'
import { toInkColor } from '../../utils/ink.js'
import { renderExternalModelName } from '../../utils/model/externalProviders.js'
import { renderModelName } from '../../utils/model/model.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import {
  TaskDetailSection,
  TaskReceiptList,
  type TaskReceiptItem,
} from './TaskDetailSection.js'
import { renderToolActivity } from './renderToolActivity.js'
import { describeTeammateActivity } from './taskStatusUtils.js'
import {
  formatPermissionModeLabel,
  summarizeQueuedMessages,
} from './taskDetailHelpers.js'

type Props = {
  teammate: DeepImmutable<InProcessTeammateTaskState>
  onDone: () => void
  onKill?: () => void
  onBack?: () => void
  onForeground?: () => void
}

export function InProcessTeammateDetailDialog({
  teammate,
  onDone,
  onKill,
  onBack,
  onForeground,
}: Props): React.ReactNode {
  const [theme] = useTheme()
  const tools = useMemo(
    () => getTools(getEmptyToolPermissionContext()),
    [],
  )

  const elapsedTime = useElapsedTime(
    teammate.startTime,
    teammate.status === 'running',
    1000,
    teammate.totalPausedMs ?? 0,
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

    if (event.key === 'x' && teammate.status === 'running' && onKill) {
      event.preventDefault()
      onKill()
      return
    }

    if (event.key === 'f' && teammate.status === 'running' && onForeground) {
      event.preventDefault()
      onForeground()
    }
  }

  const activity = describeTeammateActivity(teammate)
  const tokenCount =
    teammate.result?.totalTokens ?? teammate.progress?.tokenCount
  const toolUseCount =
    teammate.result?.totalToolUseCount ?? teammate.progress?.toolUseCount
  const displayPrompt = truncateToWidth(teammate.prompt, 300)
  const modelLabel = formatModelLabel(teammate.model)
  const permissionLabel = formatPermissionModeLabel(teammate.permissionMode)
  const queuedMessages = summarizeQueuedMessages(teammate.pendingUserMessages)
  const recentActivities = teammate.progress?.recentActivities ?? []

  const title = (
    <Text>
      <Text color={toInkColor(teammate.identity.color)}>
        @{teammate.identity.agentName}
      </Text>
      {activity ? <Text dimColor> ({activity})</Text> : null}
    </Text>
  )

  const subtitle = (
    <Text>
      {teammate.status !== 'running' ? (
        <Text
          color={
            teammate.status === 'completed'
              ? 'success'
              : teammate.status === 'killed'
                ? 'warning'
                : 'error'
          }
        >
          {teammate.status === 'completed'
            ? 'Completed'
            : teammate.status === 'failed'
              ? 'Failed'
              : 'Stopped'}{' '}
          ·{' '}
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
      label: 'team',
      value: teammate.identity.teamName,
    },
    {
      label: 'state',
      value: teammate.isIdle ? 'idle' : 'working',
    },
  ]
  if (modelLabel) {
    flightDeckItems.splice(1, 0, {
      label: 'model',
      value: modelLabel,
    })
  }
  if (permissionLabel) {
    flightDeckItems.push({
      label: 'mode',
      value: permissionLabel,
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
        color="openjawsOcean"
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
              {teammate.status === 'running' && onKill ? (
                <KeyboardShortcutHint shortcut="x" action="stop" />
              ) : null}
              {teammate.status === 'running' && onForeground ? (
                <KeyboardShortcutHint shortcut="f" action="foreground" />
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
              queued for the next teammate message boundary
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

        {teammate.status === 'running' && recentActivities.length > 0 ? (
          <TaskDetailSection title="Recent activity">
            <Box flexDirection="column">
              {recentActivities.map((recentActivity, index) => (
                <Text
                  key={index}
                  dimColor={index < recentActivities.length - 1}
                  wrap="truncate-end"
                >
                  {index === recentActivities.length - 1 ? '› ' : '· '}
                  {renderToolActivity(recentActivity, tools, theme)}
                </Text>
              ))}
            </Box>
          </TaskDetailSection>
        ) : null}

        <TaskDetailSection title="Prompt">
          <Text wrap="wrap">{displayPrompt}</Text>
        </TaskDetailSection>

        {teammate.status === 'failed' && teammate.error ? (
          <TaskDetailSection title="Error">
            <Text color="error" wrap="wrap">
              {teammate.error}
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
