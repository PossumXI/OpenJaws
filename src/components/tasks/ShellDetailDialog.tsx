import React, {
  Suspense,
  use,
  useDeferredValue,
  useEffect,
  useState,
} from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import type { CommandResultDisplay } from '../../commands.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import type { LocalShellTaskState } from '../../tasks/LocalShellTask/guards.js'
import {
  formatDuration,
  formatFileSize,
  truncateToWidth,
} from '../../utils/format.js'
import { tailFile } from '../../utils/fsOperations.js'
import { getTaskOutputPath } from '../../utils/task/diskOutput.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import ThemedBox from '../design-system/ThemedBox.js'
import {
  TaskDetailSection,
  TaskReceiptList,
  type TaskReceiptItem,
} from './TaskDetailSection.js'

type Props = {
  shell: DeepImmutable<LocalShellTaskState>
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  onKillShell?: () => void
  onBack?: () => void
}

const SHELL_DETAIL_TAIL_BYTES = 8192

type TaskOutputResult = {
  content: string
  bytesTotal: number
}

async function getTaskOutput(
  shell: DeepImmutable<LocalShellTaskState>,
): Promise<TaskOutputResult> {
  const path = getTaskOutputPath(shell.id)

  try {
    const result = await tailFile(path, SHELL_DETAIL_TAIL_BYTES)
    return { content: result.content, bytesTotal: result.bytesTotal }
  } catch {
    return { content: '', bytesTotal: 0 }
  }
}

export function ShellDetailDialog({
  shell,
  onDone,
  onKillShell,
  onBack,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()

  const [outputPromise, setOutputPromise] = useState<Promise<TaskOutputResult>>(
    () => getTaskOutput(shell),
  )
  const deferredOutputPromise = useDeferredValue(outputPromise)

  useEffect(() => {
    if (shell.status !== 'running') {
      return
    }

    const timer = setInterval(() => {
      setOutputPromise(getTaskOutput(shell))
    }, 1000)

    return () => clearInterval(timer)
  }, [shell.id, shell.status])

  const handleClose = () =>
    onDone('Shell details dismissed', { display: 'system' })

  useKeybindings(
    {
      'confirm:yes': handleClose,
    },
    { context: 'Confirmation' },
  )

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

    if (event.key === 'x' && shell.status === 'running' && onKillShell) {
      event.preventDefault()
      onKillShell()
    }
  }

  const isMonitor = shell.kind === 'monitor'
  const displayCommand = truncateToWidth(shell.command, 280)
  const runtime = formatDuration((shell.endTime ?? Date.now()) - shell.startTime)
  const statusReceipt = getShellStatusReceipt(shell)
  const title = isMonitor ? 'Monitor details' : 'Shell details'
  const subtitle = (
    <Text>
      <Text color={statusReceipt.color}>{statusReceipt.label}</Text>
      <Text dimColor>{` · ${runtime}`}</Text>
    </Text>
  )

  const flightDeckItems: TaskReceiptItem[] = [
    {
      label: 'kind',
      value: isMonitor ? 'monitor' : 'shell',
    },
    {
      label: 'status',
      value: <Text color={statusReceipt.color}>{statusReceipt.label}</Text>,
      color: statusReceipt.color,
    },
    {
      label: 'runtime',
      value: runtime,
    },
  ]

  if (shell.result?.code !== undefined) {
    flightDeckItems.push({
      label: 'exit',
      value: `code ${shell.result.code}`,
      color: shell.result.code === 0 ? 'success' : 'warning',
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
              {shell.status === 'running' && onKillShell ? (
                <KeyboardShortcutHint shortcut="x" action="stop" />
              ) : null}
            </Byline>
          )
        }
      >
        <TaskDetailSection title="Flight deck" marginTop={0}>
          <TaskReceiptList items={flightDeckItems} />
        </TaskDetailSection>

        <TaskDetailSection title={isMonitor ? 'Script' : 'Command'}>
          <Text wrap="wrap">{displayCommand}</Text>
        </TaskDetailSection>

        <TaskDetailSection title="Output">
          <Suspense fallback={<Text color="inactive">Loading output…</Text>}>
            <ShellOutputContent
              outputPromise={deferredOutputPromise}
              columns={columns}
            />
          </Suspense>
        </TaskDetailSection>
      </Dialog>
    </Box>
  )
}

type ShellOutputContentProps = {
  outputPromise: Promise<TaskOutputResult>
  columns: number
}

function ShellOutputContent({
  outputPromise,
  columns,
}: ShellOutputContentProps): React.ReactNode {
  const { content, bytesTotal } = use(outputPromise)

  if (!content) {
    return <Text color="inactive">No output available</Text>
  }

  const starts: number[] = []
  let pos = content.length
  for (let i = 0; i < 10 && pos > 0; i++) {
    const prev = content.lastIndexOf('\n', pos - 1)
    starts.push(prev + 1)
    pos = prev
  }
  starts.reverse()

  const isIncomplete = bytesTotal > content.length
  const rendered: string[] = []
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!
    const end =
      i < starts.length - 1 ? starts[i + 1]! - 1 : content.length
    const line = content.slice(start, end)
    if (line) {
      rendered.push(line)
    }
  }

  return (
    <Box flexDirection="column">
      <ThemedBox
        borderStyle="round"
        borderColor="promptBorder"
        backgroundColor="bashMessageBackgroundColor"
        paddingX={1}
        flexDirection="column"
        height={12}
        maxWidth={Math.max(columns - 6, 24)}
      >
        {rendered.map((line, i) => (
          <Text key={i} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </ThemedBox>
      <Text color="inactive" italic>
        {`Showing ${rendered.length} lines`}
        {isIncomplete ? ` of ${formatFileSize(bytesTotal)}` : ''}
      </Text>
    </Box>
  )
}

function getShellStatusReceipt(
  shell: DeepImmutable<LocalShellTaskState>,
): {
  label: string
  color: 'openjawsOcean' | 'success' | 'error'
} {
  const suffix =
    shell.result?.code !== undefined ? ` (exit ${shell.result.code})` : ''

  if (shell.status === 'running') {
    return {
      label: `running${suffix}`,
      color: 'openjawsOcean',
    }
  }

  if (shell.status === 'completed') {
    return {
      label: `completed${suffix}`,
      color: 'success',
    }
  }

  return {
    label: `${shell.status}${suffix}`,
    color: 'error',
  }
}
