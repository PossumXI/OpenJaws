/**
 * Swarm Reconnection Module
 *
 * Handles initialization of swarm context for teammates.
 * - Fresh spawns: Initialize from CLI args (set in main.tsx via dynamicTeamContext)
 * - Resumed sessions: Initialize from teamName/agentName stored in the transcript
 */

import type { AppState } from '../../state/AppState.js'
import { logForDebugging } from '../debug.js'
import { logError } from '../log.js'
import { getDynamicTeamContext } from '../teammate.js'
import {
  getTeamFilePath,
  readTeamFile,
  type TeamFile,
} from './teamHelpers.js'

export function buildTeamContextTeammates(
  teamFile: TeamFile,
): NonNullable<AppState['teamContext']>['teammates'] {
  return Object.fromEntries(
    teamFile.members.map(member => [
      member.agentId,
      {
        name: member.name,
        agentType: member.agentType,
        color: member.color,
        tmuxSessionName: '',
        tmuxPaneId: member.tmuxPaneId,
        cwd: member.cwd,
        worktreePath: member.worktreePath,
        terminalContextId: member.terminalContextId,
        spawnedAt: member.joinedAt,
      },
    ]),
  )
}

/**
 * Computes the initial teamContext for AppState.
 *
 * This is called synchronously in main.tsx to compute the teamContext
 * BEFORE the first render, eliminating the need for useEffect workarounds.
 *
 * @returns The teamContext object to include in initialState, or undefined if not a teammate
 */
export function computeInitialTeamContext():
  | AppState['teamContext']
  | undefined {
  // dynamicTeamContext is set in main.tsx from CLI args
  const context = getDynamicTeamContext()

  if (!context?.teamName || !context?.agentName) {
    logForDebugging(
      '[Reconnection] computeInitialTeamContext: No teammate context set (not a teammate)',
    )
    return undefined
  }

  const { teamName, agentId, agentName } = context

  // Read team file to get lead agent ID
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    logError(
      new Error(
        `[computeInitialTeamContext] Could not read team file for ${teamName}`,
      ),
    )
    return undefined
  }

  const teamFilePath = getTeamFilePath(teamName)

  const isLeader = !agentId
  const teammates = buildTeamContextTeammates(teamFile)
  const selfMember = isLeader
    ? teamFile.members.find(member => member.agentId === teamFile.leadAgentId)
    : teamFile.members.find(
        member =>
          (agentId && member.agentId === agentId) || member.name === agentName,
      )

  logForDebugging(
    `[Reconnection] Computed initial team context for ${isLeader ? 'leader' : `teammate ${agentName}`} in team ${teamName}`,
  )

  return {
    teamName,
    teamFilePath,
    leadAgentId: teamFile.leadAgentId,
    leadTerminalContextId: teamFile.leadTerminalContextId,
    selfAgentId: agentId,
    selfAgentName: agentName,
    isLeader,
    selfAgentColor: selfMember?.color,
    teammates,
  }
}

/**
 * Initialize teammate context from a resumed session.
 *
 * This is called when resuming a session that has teamName/agentName stored
 * in the transcript. It sets up teamContext in AppState so that heartbeat
 * and other swarm features work correctly.
 */
export function initializeTeammateContextFromSession(
  setAppState: (updater: (prev: AppState) => AppState) => void,
  teamName: string,
  agentName: string,
): void {
  // Read team file to get lead agent ID
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    logError(
      new Error(
        `[initializeTeammateContextFromSession] Could not read team file for ${teamName} (agent: ${agentName})`,
      ),
    )
    return
  }

  // Find the member in the team file to get their agentId
  const member = teamFile.members.find(m => m.name === agentName)
  if (!member) {
    logForDebugging(
      `[Reconnection] Member ${agentName} not found in team ${teamName} - may have been removed`,
    )
  }
  const agentId = member?.agentId

  const teamFilePath = getTeamFilePath(teamName)
  const teammates = buildTeamContextTeammates(teamFile)

  // Set teamContext in AppState
  setAppState(prev => ({
    ...prev,
    teamContext: {
      teamName,
      teamFilePath,
      leadAgentId: teamFile.leadAgentId,
      leadTerminalContextId: teamFile.leadTerminalContextId,
      selfAgentId: agentId,
      selfAgentName: agentName,
      isLeader: false,
      selfAgentColor: member?.color,
      teammates,
    },
  }))

  logForDebugging(
    `[Reconnection] Initialized agent context from session for ${agentName} in team ${teamName}`,
  )
}
