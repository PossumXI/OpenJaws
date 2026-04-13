import chalk from 'chalk'
import * as React from 'react'
import { getUserContext } from '../../context.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { appendMessageToLocalAgent, isLocalAgentTask, queuePendingMessage } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import {
  getAllInProcessTeammateTasks,
  injectUserMessageToTeammate,
} from '../../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import type {
  CommandResultDisplay,
  LocalJSXCommandCall,
} from '../../types/command.js'
import { formatRelativeTimeAgo } from '../../utils/format.js'
import { createUserMessage } from '../../utils/messages.js'
import {
  addNoteDeckEntry,
  clearNoteDeck,
  getNoteDeckEntries,
  loadNoteDeckStatus,
  summarizeNoteText,
  type NoteDeckEntry,
} from '../../utils/noteDeck.js'
import { TEAM_LEAD_NAME } from '../../utils/swarm/constants.js'
import { readTeamFileAsync } from '../../utils/swarm/teamHelpers.js'
import { getAgentName, getTeamName } from '../../utils/teammate.js'
import { writeToMailbox } from '../../utils/teammateMailbox.js'

const HELP_ARGS = new Set(['help', '-h', '--help'])
const SHOW_ARGS = new Set(['', 'show', 'list', 'status'])

function formatHelp(): string {
  return [
    'Usage: /note [show|clear|<text>]',
    '',
    'Examples:',
    '- /note check migration progress before editing auth',
    '- /note clear',
    '- /note show',
    '',
    'Notes:',
    '- Notes are injected into future session context and newly spawned openckeek agents.',
    '- Running agents receive the note through their next idle/message boundary when possible.',
    '- Adding a note does not interrupt the current run.',
  ].join('\n')
}

async function syncNoteDeckState(
  context: LocalJSXCommandContext,
): Promise<Awaited<ReturnType<typeof loadNoteDeckStatus>>> {
  const status = await loadNoteDeckStatus()
  context.setAppState(prev =>
    prev.noteDeckCount === status.count &&
    prev.noteDeckLatestSummary === status.latestSummary
      ? prev
      : {
          ...prev,
          noteDeckCount: status.count,
          noteDeckLatestSummary: status.latestSummary,
        },
  )
  getUserContext.cache.clear?.()
  return status
}

function formatDeliveredNoteMessage(noteText: string): string {
  return [
    'User supervision note from the shared note deck:',
    noteText,
    '',
    'Treat this as steering for your next step. Do not interrupt any tool call already in progress; apply it when you reach the next idle boundary or prompt.',
  ].join('\n')
}

function queueNoteForRunningLocalAgents(
  context: LocalJSXCommandContext,
  deliveredNoteMessage: string,
): number {
  let delivered = 0

  for (const task of Object.values(context.getAppState().tasks)) {
    if (!isLocalAgentTask(task) || task.status !== 'running') {
      continue
    }

    queuePendingMessage(task.id, deliveredNoteMessage, context.setAppState)
    appendMessageToLocalAgent(
      task.id,
      createUserMessage({ content: deliveredNoteMessage }),
      context.setAppState,
    )
    delivered++
  }

  return delivered
}

function queueNoteForRunningInProcessTeammates(
  context: LocalJSXCommandContext,
  deliveredNoteMessage: string,
): number {
  let delivered = 0

  for (const task of getAllInProcessTeammateTasks(context.getAppState().tasks)) {
    if (task.status !== 'running') {
      continue
    }

    injectUserMessageToTeammate(
      task.id,
      deliveredNoteMessage,
      context.setAppState,
    )
    delivered++
  }

  return delivered
}

async function queueNoteForPaneTeammates(
  context: LocalJSXCommandContext,
  noteText: string,
  deliveredNoteMessage: string,
): Promise<number> {
  const appState = context.getAppState()
  const teamName = getTeamName(appState.teamContext)
  if (!teamName) {
    return 0
  }

  const teamFile = await readTeamFileAsync(teamName)
  if (!teamFile) {
    return 0
  }

  const senderName = getAgentName() || TEAM_LEAD_NAME
  const summary = `note: ${summarizeNoteText(noteText, 48)}`
  const recipients = teamFile.members.filter(
    member =>
      member.name !== senderName &&
      member.backendType !== 'in-process' &&
      member.isActive !== false,
  )

  for (const recipient of recipients) {
    await writeToMailbox(
      recipient.name,
      {
        from: senderName,
        text: deliveredNoteMessage,
        summary,
        timestamp: new Date().toISOString(),
      },
      teamName,
    )
  }

  return recipients.length
}

async function propagateNoteToActiveWorkers(
  context: LocalJSXCommandContext,
  noteText: string,
): Promise<{
  localAgentCount: number
  inProcessTeammateCount: number
  paneTeammateCount: number
}> {
  const deliveredNoteMessage = formatDeliveredNoteMessage(noteText)
  const localAgentCount = queueNoteForRunningLocalAgents(
    context,
    deliveredNoteMessage,
  )
  const inProcessTeammateCount = queueNoteForRunningInProcessTeammates(
    context,
    deliveredNoteMessage,
  )
  const paneTeammateCount = await queueNoteForPaneTeammates(
    context,
    noteText,
    deliveredNoteMessage,
  )

  return {
    localAgentCount,
    inProcessTeammateCount,
    paneTeammateCount,
  }
}

function formatPropagationSummary(counts: {
  localAgentCount: number
  inProcessTeammateCount: number
  paneTeammateCount: number
}): string {
  const parts: string[] = []

  if (counts.localAgentCount > 0) {
    parts.push(
      `${counts.localAgentCount} background agent${counts.localAgentCount === 1 ? '' : 's'}`,
    )
  }
  if (counts.inProcessTeammateCount > 0) {
    parts.push(
      `${counts.inProcessTeammateCount} in-process teammate${counts.inProcessTeammateCount === 1 ? '' : 's'}`,
    )
  }
  if (counts.paneTeammateCount > 0) {
    parts.push(
      `${counts.paneTeammateCount} pane teammate${counts.paneTeammateCount === 1 ? '' : 's'}`,
    )
  }

  if (parts.length === 0) {
    return ''
  }

  return ` Queued for ${parts.join(', ')}.`
}

function NoteDeckDialog({
  entries,
  onDone,
}: {
  entries: NoteDeckEntry[]
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}): React.ReactNode {
  const close = React.useCallback(() => {
    onDone(undefined, { display: 'skip' })
  }, [onDone])

  useKeybinding('confirm:yes', close, {
    context: 'Confirmation',
    isActive: true,
  })

  return (
    <Dialog
      title="Note Deck"
      subtitle="Session supervision notes used for future turns, active workers, and new openckeek agents."
      onCancel={close}
      color="remember"
    >
      <Box flexDirection="column">
        {entries.length === 0 ? (
          <Text dimColor>
            No notes yet. Use `/note your instruction here` while OpenJaws is
            working to steer what happens next without interrupting the current
            run.
          </Text>
        ) : (
          <>
            {entries.slice(0, 8).map(entry => (
              <Box key={entry.id} flexDirection="column" marginBottom={1}>
                <Text dimColor>
                  {formatRelativeTimeAgo(new Date(entry.createdAt))}
                </Text>
                <Text wrap="wrap">{entry.text}</Text>
              </Box>
            ))}
            {entries.length > 8 ? (
              <Text dimColor>{entries.length - 8} older note(s) hidden</Text>
            ) : null}
          </>
        )}
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>/note &lt;text&gt; adds a note</Text>
          <Text dimColor>/note clear resets the deck</Text>
        </Box>
      </Box>
    </Dialog>
  )
}

export const call: LocalJSXCommandCall = async (
  onDone,
  context: LocalJSXCommandContext,
  rawArgs,
) => {
  const args = rawArgs?.trim() ?? ''
  const lowered = args.toLowerCase()

  if (HELP_ARGS.has(lowered)) {
    onDone(formatHelp(), { display: 'system' })
    return null
  }

  if (SHOW_ARGS.has(lowered)) {
    await syncNoteDeckState(context)
    const entries = await getNoteDeckEntries()
    return <NoteDeckDialog entries={entries} onDone={onDone} />
  }

  if (lowered === 'clear') {
    await clearNoteDeck()
    await syncNoteDeckState(context)
    onDone('Cleared the session note deck.', { display: 'system' })
    return null
  }

  const noteText =
    lowered.startsWith('add ') ? args.slice(4).trim() : args.trim()

  if (!noteText) {
    onDone('Usage: /note [show|clear|<text>]', { display: 'system' })
    return null
  }

  const entry = await addNoteDeckEntry(noteText)
  const propagation = await propagateNoteToActiveWorkers(context, entry.text)
  const status = await syncNoteDeckState(context)
  onDone(
    `Added note ${chalk.bold(`#${status.count}`)}: ${summarizeNoteText(entry.text, 96)}.${formatPropagationSummary(propagation)}`,
    { display: 'system' },
  )
  return null
}
