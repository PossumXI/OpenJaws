import type { AppState } from '../state/AppState.js'
import {
  getTeamPhaseReceiptById,
  readTeamFileAsync,
  recordMailboxPhaseMemory,
} from './swarm/teamHelpers.js'

/**
 * Parse `@agent-name message` syntax for direct team member messaging.
 */
export function parseDirectMemberMessage(input: string): {
  recipientName: string
  message: string
  phaseId?: string
} | null {
  const match = input.match(/^@([\w-]+)(?:\s+\[phase:(phase-[\w-]+)\])?\s+(.+)$/s)
  if (!match) return null

  const [, recipientName, phaseId, message] = match
  if (!recipientName || !message) return null

  const trimmedMessage = message.trim()
  if (!trimmedMessage) return null

  return { recipientName, message: trimmedMessage, phaseId }
}

export type DirectMessageResult =
  | { success: true; recipientName: string }
  | {
      success: false
      error: 'no_team_context' | 'unknown_recipient' | 'unknown_phase'
      recipientName?: string
      phaseId?: string
    }

type WriteToMailboxFn = (
  recipientName: string,
  message: { from: string; text: string; timestamp: string; summary?: string },
  teamName: string,
) => Promise<void>

/**
 * Send a direct message to a team member, bypassing the model.
 */
export async function sendDirectMemberMessage(
  recipientName: string,
  message: string,
  teamContext: AppState['teamContext'],
  phaseId: string | undefined,
  writeToMailbox?: WriteToMailboxFn,
): Promise<DirectMessageResult> {
  if (!teamContext || !writeToMailbox) {
    return { success: false, error: 'no_team_context' }
  }

  // Find team member by name
  const member = Object.values(teamContext.teammates ?? {}).find(
    t => t.name === recipientName,
  )

  if (!member) {
    return { success: false, error: 'unknown_recipient', recipientName }
  }
  if (phaseId) {
    const teamFile = await readTeamFileAsync(teamContext.teamName)
    if (!teamFile || !getTeamPhaseReceiptById(teamFile, phaseId)) {
      return {
        success: false,
        error: 'unknown_phase',
        recipientName,
        phaseId,
      }
    }
  }

  await writeToMailbox(
    recipientName,
    {
      from: 'user',
      text: message,
      timestamp: new Date().toISOString(),
      summary: message,
    },
    teamContext.teamName,
  )
  await recordMailboxPhaseMemory(teamContext.teamName, {
    fromName: 'user',
    toNames: [recipientName],
    phaseId,
    summary: message,
    text: message,
  })

  return { success: true, recipientName }
}
