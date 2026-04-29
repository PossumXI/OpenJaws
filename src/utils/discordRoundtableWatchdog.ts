import type { DiscordRoundtableSessionState } from './discordRoundtableRuntime.js'

export type DiscordRoundtableProgressionLoopDecision = {
  shouldLaunch: boolean
  reason: string
}

export const DEFAULT_ROUNDTABLE_PROGRESS_LAUNCH_THROTTLE_MS = 5 * 60 * 1000

function parseIsoTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isActiveRoundtableStatus(
  status: DiscordRoundtableSessionState['status'],
): boolean {
  return status === 'running' || status === 'queued' || status === 'awaiting_approval'
}

export function decideDiscordRoundtableProgressionLoopLaunch(args: {
  session: DiscordRoundtableSessionState | null | undefined
  childRunning?: boolean | null
  enabled?: boolean
  now?: Date
  lastLaunchAtMs?: number | null
  throttleMs?: number
}): DiscordRoundtableProgressionLoopDecision {
  if (args.enabled === false) {
    return {
      shouldLaunch: false,
      reason: 'roundtable progression autostart disabled',
    }
  }

  const nowMs = (args.now ?? new Date()).getTime()
  const throttleMs =
    args.throttleMs ?? DEFAULT_ROUNDTABLE_PROGRESS_LAUNCH_THROTTLE_MS
  if (
    args.lastLaunchAtMs !== null &&
    args.lastLaunchAtMs !== undefined &&
    nowMs - args.lastLaunchAtMs < throttleMs
  ) {
    return {
      shouldLaunch: false,
      reason: 'roundtable progression launch recently attempted',
    }
  }

  if (args.childRunning === false) {
    return {
      shouldLaunch: true,
      reason: 'roundtable progression child is not running',
    }
  }

  const session = args.session ?? null
  if (!session) {
    return {
      shouldLaunch: true,
      reason: 'no tracked roundtable session',
    }
  }

  const endsAtMs = parseIsoTimestampMs(session.endsAt)
  if (endsAtMs !== null && endsAtMs <= nowMs) {
    return {
      shouldLaunch: true,
      reason: 'tracked roundtable session expired',
    }
  }

  if (session.status === 'stale') {
    return {
      shouldLaunch: true,
      reason: 'tracked roundtable session is stale',
    }
  }

  if (session.status === 'expired') {
    return {
      shouldLaunch: true,
      reason: 'tracked roundtable session is expired',
    }
  }

  if (session.status === 'idle' || session.status === 'completed') {
    return {
      shouldLaunch: true,
      reason: `tracked roundtable session is ${session.status}`,
    }
  }

  if (session.status === 'error') {
    return {
      shouldLaunch: true,
      reason: 'tracked roundtable session is in error',
    }
  }

  if (isActiveRoundtableStatus(session.status)) {
    return {
      shouldLaunch: false,
      reason: 'tracked roundtable session is active',
    }
  }

  return {
    shouldLaunch: true,
    reason: `tracked roundtable session is ${session.status}`,
  }
}
