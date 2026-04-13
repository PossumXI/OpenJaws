import React, { useMemo, useState } from 'react'
import type { SDKMessage } from 'src/entrypoints/agentSdkTypes.js'
import type { ToolUseContext } from 'src/Tool.js'
import type { DeepImmutable } from 'src/types/utils.js'
import type { CommandResultDisplay } from '../../commands.js'
import { DIAMOND_FILLED, DIAMOND_OPEN } from '../../constants/figures.js'
import { useElapsedTime } from '../../hooks/useElapsedTime.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Link, Text } from '../../ink.js'
import type { RemoteAgentTaskState } from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { getRemoteTaskSessionUrl } from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import {
  AGENT_TOOL_NAME,
  LEGACY_AGENT_TOOL_NAME,
} from '../../tools/AgentTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../tools/AskUserQuestionTool/prompt.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../../tools/ExitPlanModeTool/constants.js'
import { openBrowser } from '../../utils/browser.js'
import { errorMessage } from '../../utils/errors.js'
import { formatDuration, truncateToWidth } from '../../utils/format.js'
import { toInternalMessages } from '../../utils/messages/mappers.js'
import { EMPTY_LOOKUPS, normalizeMessages } from '../../utils/messages.js'
import { plural } from '../../utils/stringUtils.js'
import { teleportResumeCodeSession } from '../../utils/teleport.js'
import { Select } from '../CustomSelect/select.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { Message } from '../Message.js'
import {
  formatReviewStageCounts,
  RemoteSessionProgress,
} from './RemoteSessionProgress.js'
import {
  TaskDetailSection,
  TaskReceiptList,
  type TaskReceiptItem,
} from './TaskDetailSection.js'

type Props = {
  session: DeepImmutable<RemoteAgentTaskState>
  toolUseContext: ToolUseContext
  onDone: (
    result?: string,
    options?: {
      display?: CommandResultDisplay
    },
  ) => void
  onBack?: () => void
  onKill?: () => void
}

type UltraplanMenuAction = 'open' | 'stop' | 'back'
type ReviewMenuAction = 'open' | 'stop' | 'back' | 'dismiss'

const PHASE_LABEL = {
  needs_input: 'input required',
  plan_ready: 'ready',
} as const

const AGENT_VERB = {
  needs_input: 'waiting',
  plan_ready: 'done',
} as const

const STAGES = ['finding', 'verifying', 'synthesizing'] as const

const STAGE_LABELS: Record<(typeof STAGES)[number], string> = {
  finding: 'Find',
  verifying: 'Verify',
  synthesizing: 'Dedupe',
}

export function formatToolUseSummary(name: string, input: unknown): string {
  if (name === EXIT_PLAN_MODE_V2_TOOL_NAME) {
    return 'Review the plan in OpenJaws on the web'
  }

  if (!input || typeof input !== 'object') {
    return name
  }

  if (name === ASK_USER_QUESTION_TOOL_NAME && 'questions' in input) {
    const qs = input.questions
    if (Array.isArray(qs) && qs[0] && typeof qs[0] === 'object') {
      const q =
        'question' in qs[0] &&
        typeof qs[0].question === 'string' &&
        qs[0].question
          ? qs[0].question
          : 'header' in qs[0] && typeof qs[0].header === 'string'
            ? qs[0].header
            : null

      if (q) {
        const oneLine = q.replace(/\s+/g, ' ').trim()
        return `Answer in browser: ${truncateToWidth(oneLine, 50)}`
      }
    }
  }

  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim()) {
      const oneLine = value.replace(/\s+/g, ' ').trim()
      return `${name} ${truncateToWidth(oneLine, 60)}`
    }
  }

  return name
}

function getDismissHandler(
  onDone: Props['onDone'],
  message = 'Remote session details dismissed',
): () => void {
  return () => onDone(message, { display: 'system' })
}

function getStatusColor(
  status: string,
): 'openjawsOcean' | 'success' | 'warning' | 'error' {
  if (status === 'running' || status === 'starting' || status === 'ready') {
    return 'openjawsOcean'
  }

  if (status === 'completed') {
    return 'success'
  }

  if (status === 'killed') {
    return 'warning'
  }

  return 'error'
}

function renderSelectGuide(
  exitState: { pending: boolean; keyName: string | null },
  canGoBack: boolean,
): React.ReactNode {
  if (exitState.pending) {
    return <Text>Press {exitState.keyName} again to exit</Text>
  }

  return (
    <Byline>
      <KeyboardShortcutHint shortcut="Enter" action="select" />
      <KeyboardShortcutHint
        shortcut="Esc"
        action={canGoBack ? 'go back' : 'close'}
      />
    </Byline>
  )
}

function SessionLinkRow({
  sessionUrl,
}: {
  sessionUrl: string
}): React.ReactNode {
  return (
    <Box marginTop={1}>
      <Text color="openjawsOcean" bold>
        session
      </Text>
      <Text color="inactive"> · </Text>
      <Link url={sessionUrl}>
        <Text dimColor>{sessionUrl}</Text>
      </Link>
    </Box>
  )
}

function StagePipeline({
  stage,
  completed,
  hasProgress,
}: {
  stage: 'finding' | 'verifying' | 'synthesizing' | undefined
  completed: boolean
  hasProgress: boolean
}): React.ReactNode {
  const currentIdx = stage ? STAGES.indexOf(stage) : -1
  const inSetup = !completed && !hasProgress

  return (
    <Text>
      {inSetup ? (
        <Text color="openjawsOcean">Setup</Text>
      ) : (
        <Text dimColor>Setup</Text>
      )}
      <Text dimColor> → </Text>
      {STAGES.map((step, index) => {
        const isCurrent = !completed && !inSetup && index === currentIdx
        return (
          <React.Fragment key={step}>
            {index > 0 ? <Text dimColor> → </Text> : null}
            {isCurrent ? (
              <Text color="openjawsOcean">{STAGE_LABELS[step]}</Text>
            ) : (
              <Text dimColor>{STAGE_LABELS[step]}</Text>
            )}
          </React.Fragment>
        )
      })}
      {completed ? <Text color="success"> ✓</Text> : null}
    </Text>
  )
}

function reviewCountsLine(session: DeepImmutable<RemoteAgentTaskState>): string {
  const progress = session.reviewProgress

  if (!progress) {
    return session.status === 'completed' ? 'done' : 'setting up'
  }

  const verified = progress.bugsVerified
  const refuted = progress.bugsRefuted ?? 0

  if (session.status === 'completed') {
    const parts = [`${verified} ${plural(verified, 'finding')}`]
    if (refuted > 0) {
      parts.push(`${refuted} refuted`)
    }
    return parts.join(' · ')
  }

  return formatReviewStageCounts(
    progress.stage,
    progress.bugsFound,
    verified,
    refuted,
  )
}

function UltraplanSessionDetail({
  session,
  onDone,
  onBack,
  onKill,
}: Omit<Props, 'toolUseContext'>): React.ReactNode {
  const running = session.status === 'running' || session.status === 'pending'
  const phase = session.ultraplanPhase
  const statusText = running
    ? phase
      ? PHASE_LABEL[phase]
      : 'running'
    : session.status
  const elapsedTime = useElapsedTime(
    session.startTime,
    running,
    1000,
    0,
    session.endTime,
  )
  const [confirmingStop, setConfirmingStop] = useState(false)

  const summary = useMemo(() => {
    let spawns = 0
    let calls = 0
    let lastBlock: { name: string; input: unknown } | null = null

    for (const msg of session.log) {
      if (msg.type !== 'assistant') {
        continue
      }
      for (const block of msg.message.content) {
        if (block.type !== 'tool_use') {
          continue
        }
        calls += 1
        lastBlock = block
        if (
          block.name === AGENT_TOOL_NAME ||
          block.name === LEGACY_AGENT_TOOL_NAME
        ) {
          spawns += 1
        }
      }
    }

    return {
      agentsWorking: 1 + spawns,
      toolCalls: calls,
      lastToolCall: lastBlock
        ? formatToolUseSummary(lastBlock.name, lastBlock.input)
        : null,
    }
  }, [session.log])

  const sessionUrl = getRemoteTaskSessionUrl(session.sessionId)
  const goBackOrClose = onBack ?? getDismissHandler(onDone)

  if (confirmingStop) {
    return (
      <Dialog
        title="Stop ultraplan?"
        onCancel={() => setConfirmingStop(false)}
        color="openjawsOcean"
      >
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            This will terminate the OpenJaws on the web session.
          </Text>
          <Select
            options={[
              {
                label: 'Terminate session',
                value: 'stop' as const,
              },
              {
                label: 'Back',
                value: 'back' as const,
              },
            ]}
            onChange={value => {
              if (value === 'stop') {
                onKill?.()
                goBackOrClose()
                return
              }

              setConfirmingStop(false)
            }}
          />
        </Box>
      </Dialog>
    )
  }

  const title = (
    <Text>
      <Text color="openjawsOcean">
        {phase === 'plan_ready' ? DIAMOND_FILLED : DIAMOND_OPEN}{' '}
      </Text>
      <Text bold>ultraplan</Text>
      <Text dimColor>
        {' · '}
        {elapsedTime}
        {' · '}
        {statusText}
      </Text>
    </Text>
  )

  const flightDeckItems: TaskReceiptItem[] = [
    {
      label: 'phase',
      value: statusText,
      color: phase === 'plan_ready' ? 'success' : 'openjawsOcean',
    },
    {
      label: 'crew',
      value: `${summary.agentsWorking} ${plural(
        summary.agentsWorking,
        'agent',
      )} ${phase ? AGENT_VERB[phase] : 'working'}`,
    },
    {
      label: 'tooling',
      value: `${summary.toolCalls} tool ${plural(summary.toolCalls, 'call')}`,
    },
  ]

  const options: ReadonlyArray<{
    label: string
    value: UltraplanMenuAction
  }> = [
    {
      label: 'Review in OpenJaws on the web',
      value: 'open',
    },
    ...(onKill && running
      ? [
          {
            label: 'Stop ultraplan',
            value: 'stop' as const,
          },
        ]
      : []),
    {
      label: 'Back',
      value: 'back',
    },
  ]

  return (
    <Dialog
      title={title}
      onCancel={goBackOrClose}
      color="openjawsOcean"
      inputGuide={exitState => renderSelectGuide(exitState, !!onBack)}
    >
      <TaskDetailSection title="Flight deck" marginTop={0}>
        <TaskReceiptList items={flightDeckItems} />
        <SessionLinkRow sessionUrl={sessionUrl} />
      </TaskDetailSection>

      {summary.lastToolCall ? (
        <TaskDetailSection title="Latest call">
          <Text wrap="wrap">{summary.lastToolCall}</Text>
        </TaskDetailSection>
      ) : null}

      <TaskDetailSection title="Next move">
        <Select
          options={options}
          onChange={value => {
            switch (value) {
              case 'open':
                openBrowser(sessionUrl)
                onDone()
                return
              case 'stop':
                setConfirmingStop(true)
                return
              case 'back':
                goBackOrClose()
                return
            }
          }}
        />
      </TaskDetailSection>
    </Dialog>
  )
}

function ReviewSessionDetail({
  session,
  onDone,
  onBack,
  onKill,
}: Omit<Props, 'toolUseContext'>): React.ReactNode {
  const completed = session.status === 'completed'
  const running = session.status === 'running' || session.status === 'pending'
  const [confirmingStop, setConfirmingStop] = useState(false)
  const elapsedTime = useElapsedTime(
    session.startTime,
    running,
    1000,
    0,
    session.endTime,
  )

  const handleClose = getDismissHandler(onDone)
  const goBackOrClose = onBack ?? handleClose
  const sessionUrl = getRemoteTaskSessionUrl(session.sessionId)
  const statusLabel = completed ? 'ready' : running ? 'running' : session.status

  if (confirmingStop) {
    return (
      <Dialog
        title="Stop ultrareview?"
        onCancel={() => setConfirmingStop(false)}
        color="openjawsOcean"
      >
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            This archives the remote session and stops local tracking. The
            review will not complete and any findings so far are discarded.
          </Text>
          <Select
            options={[
              {
                label: 'Stop ultrareview',
                value: 'stop' as const,
              },
              {
                label: 'Back',
                value: 'back' as const,
              },
            ]}
            onChange={value => {
              if (value === 'stop') {
                onKill?.()
                goBackOrClose()
                return
              }

              setConfirmingStop(false)
            }}
          />
        </Box>
      </Dialog>
    )
  }

  const title = (
    <Text>
      <Text color="openjawsOcean">
        {completed ? DIAMOND_FILLED : DIAMOND_OPEN}{' '}
      </Text>
      <Text bold>ultrareview</Text>
      <Text dimColor>
        {' · '}
        {elapsedTime}
        {' · '}
        {statusLabel}
      </Text>
    </Text>
  )

  const options: ReadonlyArray<{
    label: string
    value: ReviewMenuAction
  }> = completed
    ? [
        {
          label: 'Open in OpenJaws on the web',
          value: 'open',
        },
        {
          label: 'Dismiss',
          value: 'dismiss',
        },
      ]
    : [
        {
          label: 'Open in OpenJaws on the web',
          value: 'open',
        },
        ...(onKill && running
          ? [
              {
                label: 'Stop ultrareview',
                value: 'stop' as const,
              },
            ]
          : []),
        {
          label: 'Back',
          value: 'back',
        },
      ]

  const flightDeckItems: TaskReceiptItem[] = [
    {
      label: 'status',
      value: statusLabel,
      color: getStatusColor(statusLabel),
    },
    {
      label: 'runtime',
      value: elapsedTime,
    },
    {
      label: 'findings',
      value: reviewCountsLine(session),
    },
  ]

  return (
    <Dialog
      title={title}
      onCancel={goBackOrClose}
      color="openjawsOcean"
      inputGuide={exitState => renderSelectGuide(exitState, !!onBack)}
    >
      <TaskDetailSection title="Flight deck" marginTop={0}>
        <TaskReceiptList items={flightDeckItems} />
        <SessionLinkRow sessionUrl={sessionUrl} />
      </TaskDetailSection>

      <TaskDetailSection title="Review pipeline">
        <StagePipeline
          stage={session.reviewProgress?.stage}
          completed={completed}
          hasProgress={!!session.reviewProgress}
        />
      </TaskDetailSection>

      <TaskDetailSection title="Next move">
        <Select
          options={options}
          onChange={action => {
            switch (action) {
              case 'open':
                openBrowser(sessionUrl)
                onDone()
                return
              case 'stop':
                setConfirmingStop(true)
                return
              case 'back':
                goBackOrClose()
                return
              case 'dismiss':
                handleClose()
                return
            }
          }}
        />
      </TaskDetailSection>
    </Dialog>
  )
}

export function RemoteSessionDetailDialog({
  session,
  toolUseContext,
  onDone,
  onBack,
  onKill,
}: Props): React.ReactNode {
  const [isTeleporting, setIsTeleporting] = useState(false)
  const [teleportError, setTeleportError] = useState<string | null>(null)

  const lastMessages = useMemo(() => {
    if (session.isUltraplan || session.isRemoteReview) {
      return []
    }

    return normalizeMessages(toInternalMessages(session.log as SDKMessage[]))
      .filter(message => message.type !== 'progress')
      .slice(-3)
  }, [session])

  if (session.isUltraplan) {
    return (
      <UltraplanSessionDetail
        session={session}
        onDone={onDone}
        onBack={onBack}
        onKill={onKill}
      />
    )
  }

  if (session.isRemoteReview) {
    return (
      <ReviewSessionDetail
        session={session}
        onDone={onDone}
        onBack={onBack}
        onKill={onKill}
      />
    )
  }

  const handleClose = getDismissHandler(onDone)

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      event.preventDefault()
      handleClose()
      return
    }

    if (event.key === 'left' && onBack) {
      event.preventDefault()
      onBack()
      return
    }

    if (event.key === 't' && !isTeleporting) {
      event.preventDefault()
      void handleTeleport()
      return
    }

    if (event.key === 'return') {
      event.preventDefault()
      handleClose()
    }
  }

  async function handleTeleport(): Promise<void> {
    setIsTeleporting(true)
    setTeleportError(null)

    try {
      await teleportResumeCodeSession(session.sessionId)
    } catch (err) {
      setTeleportError(errorMessage(err))
    } finally {
      setIsTeleporting(false)
    }
  }

  const displayTitle = truncateToWidth(session.title, 50)
  const sessionUrl = getRemoteTaskSessionUrl(session.sessionId)
  const runtime = formatDuration((session.endTime ?? Date.now()) - session.startTime)
  const displayStatus =
    session.status === 'pending' ? 'starting' : session.status
  const statusColor = getStatusColor(displayStatus)

  const flightDeckItems: TaskReceiptItem[] = [
    {
      label: 'status',
      value: <Text color={statusColor}>{displayStatus}</Text>,
      color: statusColor,
    },
    {
      label: 'runtime',
      value: runtime,
    },
    {
      label: 'title',
      value: displayTitle,
    },
    {
      label: 'progress',
      value: <RemoteSessionProgress session={session} />,
    },
  ]

  return (
    <Box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      <Dialog
        title="Remote session details"
        onCancel={handleClose}
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
              {!isTeleporting ? (
                <KeyboardShortcutHint shortcut="t" action="teleport" />
              ) : null}
            </Byline>
          )
        }
      >
        <TaskDetailSection title="Flight deck" marginTop={0}>
          <TaskReceiptList items={flightDeckItems} />
          <SessionLinkRow sessionUrl={sessionUrl} />
        </TaskDetailSection>

        {lastMessages.length > 0 ? (
          <TaskDetailSection title="Recent messages">
            <Box flexDirection="column" height={10} overflowY="hidden">
              {lastMessages.map((message, index) => (
                <Message
                  key={index}
                  message={message}
                  lookups={EMPTY_LOOKUPS}
                  addMargin={index > 0}
                  tools={toolUseContext.options.tools}
                  commands={toolUseContext.options.commands}
                  verbose={toolUseContext.options.verbose}
                  inProgressToolUseIDs={new Set()}
                  progressMessagesForMessage={[]}
                  shouldAnimate={false}
                  shouldShowDot={false}
                  style="condensed"
                  isTranscriptMode={false}
                  isStatic={true}
                />
              ))}
            </Box>
            <Box marginTop={1}>
              <Text color="inactive" italic>
                Showing last {lastMessages.length} of {session.log.length}{' '}
                messages
              </Text>
            </Box>
          </TaskDetailSection>
        ) : null}

        {teleportError || isTeleporting ? (
          <TaskDetailSection title="Session handoff">
            {teleportError ? (
              <Text color="error" wrap="wrap">
                Teleport failed: {teleportError}
              </Text>
            ) : null}
            {isTeleporting ? (
              <Text color="openjawsOcean">Teleporting to session…</Text>
            ) : null}
          </TaskDetailSection>
        ) : null}
      </Dialog>
    </Box>
  )
}
