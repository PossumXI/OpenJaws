import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ModelUsage } from 'src/entrypoints/agentSdkTypes.js'
import type { FpsMetrics } from './utils/fpsTracker.js'
import {
  addToTotalCostState,
  addToTotalLinesChanged as addToTotalLinesChangedState,
  getModelUsage,
  getSessionId,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  getTotalCostUSD,
  getTotalDuration,
  getTotalInputTokens,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalOutputTokens,
  getTotalToolDuration,
  resetCostState as resetBootstrapCostState,
  setCostStateForRestore,
} from './bootstrap/state.js'

type StoredSessionCosts = {
  totalCostUSD: number
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  lastDuration?: number
  modelUsage?: Record<string, ModelUsage>
  fpsMetrics?: FpsMetrics
  savedAt: string
}

const CACHE_DIR = join(homedir(), '.openjaws', 'cache')
const SESSION_COSTS_FILE = join(CACHE_DIR, 'session-costs.json')

function ensureCacheDir(): void {
  mkdirSync(CACHE_DIR, { recursive: true })
}

function readStoredCosts(): Record<string, StoredSessionCosts> {
  try {
    return JSON.parse(readFileSync(SESSION_COSTS_FILE, 'utf8')) as Record<
      string,
      StoredSessionCosts
    >
  } catch {
    return {}
  }
}

function writeStoredCosts(costs: Record<string, StoredSessionCosts>): void {
  ensureCacheDir()
  writeFileSync(SESSION_COSTS_FILE, JSON.stringify(costs, null, 2), 'utf8')
}

function mergeModelUsage(
  existing: ModelUsage | undefined,
  incoming: ModelUsage,
): ModelUsage {
  return {
    inputTokens: (existing?.inputTokens ?? 0) + (incoming.inputTokens ?? 0),
    outputTokens: (existing?.outputTokens ?? 0) + (incoming.outputTokens ?? 0),
    cacheReadInputTokens:
      (existing?.cacheReadInputTokens ?? 0) +
      (incoming.cacheReadInputTokens ?? 0),
    cacheCreationInputTokens:
      (existing?.cacheCreationInputTokens ?? 0) +
      (incoming.cacheCreationInputTokens ?? 0),
    webSearchRequests:
      (existing?.webSearchRequests ?? 0) + (incoming.webSearchRequests ?? 0),
    costUSD: (existing?.costUSD ?? 0) + (incoming.costUSD ?? 0),
    contextWindow: incoming.contextWindow ?? existing?.contextWindow ?? 0,
    maxOutputTokens:
      incoming.maxOutputTokens ?? existing?.maxOutputTokens ?? 0,
  }
}

export function formatCost(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) {
    return '$0.00'
  }
  return `$${value.toFixed(decimals)}`
}

export function formatTotalCost(): string {
  return [
    `Cost: ${formatCost(getTotalCost())}`,
    `Input: ${getTotalInputTokens().toLocaleString()} tokens`,
    `Output: ${getTotalOutputTokens().toLocaleString()} tokens`,
    `Diff: +${getTotalLinesAdded().toLocaleString()} / -${getTotalLinesRemoved().toLocaleString()}`,
  ].join(' | ')
}

export function getTotalCost(): number {
  return getTotalCostUSD()
}

export function addToTotalSessionCost(
  cost: number,
  modelUsage: ModelUsage,
  model: string,
): number {
  const mergedUsage = mergeModelUsage(getModelUsage()[model], modelUsage)
  addToTotalCostState(cost, mergedUsage, model)
  return cost
}

export function addToTotalLinesChanged(added: number, removed: number): void {
  addToTotalLinesChangedState(added, removed)
}

export function saveCurrentSessionCosts(fpsMetrics?: FpsMetrics): void {
  const sessionId = String(getSessionId())
  const storedCosts = readStoredCosts()
  storedCosts[sessionId] = {
    totalCostUSD: getTotalCost(),
    totalAPIDuration: getTotalAPIDuration(),
    totalAPIDurationWithoutRetries: getTotalAPIDurationWithoutRetries(),
    totalToolDuration: getTotalToolDuration(),
    totalLinesAdded: getTotalLinesAdded(),
    totalLinesRemoved: getTotalLinesRemoved(),
    lastDuration: getTotalDuration(),
    modelUsage: { ...getModelUsage() },
    fpsMetrics,
    savedAt: new Date().toISOString(),
  }
  writeStoredCosts(storedCosts)
}

export function getStoredSessionCosts(
  sessionId: string,
): StoredSessionCosts | undefined {
  return readStoredCosts()[sessionId]
}

export function restoreCostStateForSession(sessionId: string): void {
  const stored = getStoredSessionCosts(sessionId)
  if (!stored) {
    resetBootstrapCostState()
    return
  }
  setCostStateForRestore({
    totalCostUSD: stored.totalCostUSD,
    totalAPIDuration: stored.totalAPIDuration,
    totalAPIDurationWithoutRetries: stored.totalAPIDurationWithoutRetries,
    totalToolDuration: stored.totalToolDuration,
    totalLinesAdded: stored.totalLinesAdded,
    totalLinesRemoved: stored.totalLinesRemoved,
    lastDuration: stored.lastDuration,
    modelUsage: stored.modelUsage,
  })
}

export function resetCostState(): void {
  resetBootstrapCostState()
}

export {
  getModelUsage,
  getTotalAPIDuration,
  getTotalDuration,
  getTotalInputTokens,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalOutputTokens,
}
