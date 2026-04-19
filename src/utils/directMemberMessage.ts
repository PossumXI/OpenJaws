import type { AppState } from '../state/AppState.js'
import { summarizeOutputText } from './outputPresentation.js'
import {
  getActiveTeamPhaseId,
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

function getSourceTerminalContextId(
  teamContext: NonNullable<AppState['teamContext']>,
): string | null {
  if (teamContext.selfAgentId) {
    return teamContext.teammates?.[teamContext.selfAgentId]?.terminalContextId ?? null
  }
  return teamContext.leadTerminalContextId ?? null
}

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

  const teamFile = await readTeamFileAsync(teamContext.teamName)
  if (!teamFile) {
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
    if (!getTeamPhaseReceiptById(teamFile, phaseId)) {
      return {
        success: false,
        error: 'unknown_phase',
        recipientName,
        phaseId,
      }
    }
  }
  const sourceAgentId = teamContext.selfAgentId ?? teamContext.leadAgentId
  const sourceTerminalContextId = getSourceTerminalContextId(teamContext)
  const effectivePhaseId =
    phaseId ??
    getActiveTeamPhaseId(teamFile, sourceAgentId, sourceTerminalContextId)

  await writeToMailbox(
    recipientName,
    {
      from: 'user',
      text: message,
      timestamp: new Date().toISOString(),
      summary: summarizeOutputText(message, 96, 'Direct handoff ready'),
    },
    teamContext.teamName,
  )
  await recordMailboxPhaseMemory(teamContext.teamName, {
    fromName: 'user',
    toNames: [recipientName],
    phaseId: effectivePhaseId ?? undefined,
    summary: summarizeOutputText(message, 96, 'Direct handoff ready'),
    text: message,
    sourceTerminalContextId,
  })

  return { success: true, recipientName }
}
