import type { Message } from '../../types/message.js'
import type { QuerySource } from '../../constants/querySource.js'
import type { ToolUseContext } from '../../Tool.js'

type ContextCollapseStats = {
  collapsedSpans: number
  collapsedMessages: number
  stagedSpans: number
  health: {
    totalErrors: number
    totalSpawns: number
    totalEmptySpawns: number
    emptySpawnWarningEmitted: boolean
    lastError?: string
  }
}

const DEFAULT_STATS: ContextCollapseStats = {
  collapsedSpans: 0,
  collapsedMessages: 0,
  stagedSpans: 0,
  health: {
    totalErrors: 0,
    totalSpawns: 0,
    totalEmptySpawns: 0,
    emptySpawnWarningEmitted: false,
  },
}

let stats: ContextCollapseStats = {
  ...DEFAULT_STATS,
  health: { ...DEFAULT_STATS.health },
}

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function initContextCollapse(): void {
  resetContextCollapse()
}

export function isContextCollapseEnabled(): boolean {
  return false
}

export function getStats(): ContextCollapseStats {
  return stats
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function applyCollapsesIfNeeded(
  messages: Message[],
  _toolUseContext: ToolUseContext,
  _querySource?: QuerySource,
): Promise<{ messages: Message[] }> {
  return { messages }
}

export function isWithheldPromptTooLong(_message: Message | undefined): boolean {
  return false
}

export function recoverFromOverflow(
  messages: Message[],
  _querySource?: QuerySource,
): { messages: Message[]; committed: number } {
  return { messages, committed: 0 }
}

export function resetContextCollapse(): void {
  stats = {
    ...DEFAULT_STATS,
    health: { ...DEFAULT_STATS.health },
  }
  emit()
}
