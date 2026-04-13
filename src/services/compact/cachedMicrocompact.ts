export type CachedMCConfig = {
  triggerThreshold: number
  keepRecent: number
}

export type CacheEditsBlock = {
  type: 'cache_edits'
  edits: { type: 'delete'; cache_reference: string }[]
}

export type PinnedCacheEdits = {
  userMessageIndex: number
  block: CacheEditsBlock
}

export type CachedMCState = {
  registeredTools: Set<string>
  toolOrder: string[]
  deletedRefs: Set<string>
  pinnedEdits: PinnedCacheEdits[]
}

const DEFAULT_CONFIG: CachedMCConfig = {
  triggerThreshold: 999_999,
  keepRecent: 0,
}

export function createCachedMCState(): CachedMCState {
  return {
    registeredTools: new Set(),
    toolOrder: [],
    deletedRefs: new Set(),
    pinnedEdits: [],
  }
}

export function isModelSupportedForCacheEditing(_model: string): boolean {
  return false
}

export function getCachedMCConfig(): CachedMCConfig {
  return DEFAULT_CONFIG
}

export function registerToolResult(state: CachedMCState, toolId: string): void {
  if (state.registeredTools.has(toolId)) {
    return
  }
  state.registeredTools.add(toolId)
  state.toolOrder.push(toolId)
}

export function registerToolMessage(
  _state: CachedMCState,
  _groupIds: string[],
): void {}

export function getToolResultsToDelete(_state: CachedMCState): string[] {
  return []
}

export function createCacheEditsBlock(
  _state: CachedMCState,
  toolsToDelete: string[],
): CacheEditsBlock | null {
  if (toolsToDelete.length === 0) {
    return null
  }
  return {
    type: 'cache_edits',
    edits: toolsToDelete.map(toolId => ({
      type: 'delete',
      cache_reference: toolId,
    })),
  }
}

export function markToolsSentToAPI(_state: CachedMCState): void {}

export function resetCachedMCState(state: CachedMCState): void {
  state.registeredTools.clear()
  state.toolOrder = []
  state.deletedRefs.clear()
  state.pinnedEdits = []
}
