import {
  getDiscordRoundtableQueueStatePath,
  getDiscordRoundtableSessionStatePath,
  syncDiscordRoundtableRuntimeState,
  type DiscordRoundtableSyncResult,
} from './discordRoundtableRuntime.js'
import {
  planDiscordRoundtableFollowThrough,
  type DiscordRoundtablePlannerResult,
} from './discordRoundtablePlanner.js'

export type DiscordRoundtableSteadyStateResult = {
  queueStatePath: string
  sessionStatePath: string
  sync: DiscordRoundtableSyncResult
  planner: DiscordRoundtablePlannerResult
  status: string
  channelName: string | null
  turnCount: number | null
  lastSummary: string | null
}

export function runDiscordRoundtableSteadyStatePass(args: {
  root?: string
  allowedRoots: string[]
  now?: Date
}): DiscordRoundtableSteadyStateResult {
  const root = args.root ?? process.cwd()
  const sync = syncDiscordRoundtableRuntimeState(root)
  const planner = planDiscordRoundtableFollowThrough({
    root,
    allowedRoots: args.allowedRoots,
    now: args.now,
  })

  return {
    queueStatePath: getDiscordRoundtableQueueStatePath(root),
    sessionStatePath: getDiscordRoundtableSessionStatePath(root),
    sync,
    planner,
    status: sync.sessionState?.status ?? sync.state.status,
    channelName:
      sync.sessionState?.roundtableChannelName ?? sync.state.roundtableChannelName,
    turnCount: sync.sessionState?.turnCount ?? null,
    lastSummary: sync.sessionState?.lastSummary ?? sync.state.lastSummary,
  }
}
