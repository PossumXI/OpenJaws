/**
 * Team Discovery - Utilities for discovering teams and teammate status
 *
 * Scans ~/.openjaws/teams/ to find teams where the current session is the leader.
 * Used by the Teams UI in the footer to show team status.
 */

import { isPaneBackend, type PaneBackendType } from './swarm/backends/types.js'
import {
  getActiveTeamPhaseId,
  getActiveTeamPhaseReceiptForAgent,
  getLatestTerminalContextForAgent,
  getLatestPhaseReceiptForAgent,
  getTeamPhaseRegistryPath,
  getTeamTerminalRegistryPath,
  readTeamFileSessionSnapshot,
} from './swarm/teamHelpers.js'

export type TeamSummary = {
  name: string
  memberCount: number
  runningCount: number
  idleCount: number
}

export type TeammateStatus = {
  name: string
  agentId: string
  agentType?: string
  model?: string
  prompt?: string
  status: 'running' | 'idle' | 'unknown'
  color?: string
  idleSince?: string // ISO timestamp from idle notification
  tmuxPaneId: string
  cwd: string
  worktreePath?: string
  isHidden?: boolean // Whether the pane is currently hidden from the swarm view
  backendType?: PaneBackendType // The backend type used for this teammate
  mode?: string // Current permission mode for this teammate
  terminalContextId?: string
  projectRoot?: string
  provider?: string
  qBaseUrl?: string | null
  immaculateHarnessUrl?: string | null
  teamMemoryPath?: string | null
  teamRegistryPath?: string | null
  activePhaseId?: string
  activePhaseLabel?: string
  activePhaseRequestSummary?: string
  activePhaseDeliverableSummary?: string
  phaseId?: string
  phaseLabel?: string
  phaseRequestSummary?: string
  phaseDeliverableSummary?: string
  phaseRegistryPath?: string | null
}

/**
 * Get detailed teammate statuses for a team
 * Reads isActive from config to determine status
 */
export function getTeammateStatuses(teamName: string): TeammateStatus[] {
  const teamFile = readTeamFileSessionSnapshot(teamName)
  if (!teamFile) {
    return []
  }

  const hiddenPaneIds = new Set(teamFile.hiddenPaneIds ?? [])
  const teamRegistryPath = getTeamTerminalRegistryPath(teamName)
  const phaseRegistryPath = getTeamPhaseRegistryPath(teamName)
  const statuses: TeammateStatus[] = []

  for (const member of teamFile.members) {
    // Exclude team-lead from the list
    if (member.name === 'team-lead') {
      continue
    }

    // Read isActive from config, defaulting to true (active) if undefined
    const isActive = member.isActive !== false
    const status: 'running' | 'idle' = isActive ? 'running' : 'idle'
    const terminalContext = getLatestTerminalContextForAgent(
      teamFile,
      member.agentId,
      member.terminalContextId,
    )
    const activePhaseId = getActiveTeamPhaseId(
      teamFile,
      member.agentId,
      member.terminalContextId,
    )
    const activePhaseReceipt = getActiveTeamPhaseReceiptForAgent(
      teamFile,
      member.agentId,
      member.terminalContextId,
    )
    const phaseReceipt = getLatestPhaseReceiptForAgent(teamFile, member.agentId)

    statuses.push({
      name: member.name,
      agentId: member.agentId,
      agentType: member.agentType,
      model: member.model,
      prompt: member.prompt,
      status,
      color: member.color,
      tmuxPaneId: member.tmuxPaneId,
      cwd: member.cwd,
      worktreePath: member.worktreePath,
      isHidden: hiddenPaneIds.has(member.tmuxPaneId),
      backendType:
        member.backendType && isPaneBackend(member.backendType)
          ? member.backendType
          : undefined,
      mode: member.mode,
      terminalContextId:
        member.terminalContextId ?? terminalContext?.terminalContextId,
      projectRoot: terminalContext?.projectRoot,
      provider: terminalContext?.provider,
      qBaseUrl: terminalContext?.qBaseUrl ?? null,
      immaculateHarnessUrl: terminalContext?.immaculateHarnessUrl ?? null,
      teamMemoryPath: terminalContext?.teamMemoryPath ?? null,
      teamRegistryPath,
      activePhaseId,
      activePhaseLabel: activePhaseReceipt?.label,
      activePhaseRequestSummary: activePhaseReceipt?.requestSummary,
      activePhaseDeliverableSummary: activePhaseReceipt?.lastDeliverableSummary,
      phaseId: phaseReceipt?.phaseId,
      phaseLabel: phaseReceipt?.label,
      phaseRequestSummary: phaseReceipt?.requestSummary,
      phaseDeliverableSummary: phaseReceipt?.lastDeliverableSummary,
      phaseRegistryPath,
    })
  }

  return statuses
}

// Note: For time formatting, use formatRelativeTimeAgo from '../utils/format.js'
