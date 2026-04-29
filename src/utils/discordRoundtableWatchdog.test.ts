import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_ROUNDTABLE_PROGRESS_LAUNCH_THROTTLE_MS,
  decideDiscordRoundtableProgressionLoopLaunch,
} from './discordRoundtableWatchdog.js'
import type { DiscordRoundtableSessionState } from './discordRoundtableRuntime.js'

function session(
  overrides: Partial<DiscordRoundtableSessionState> = {},
): DiscordRoundtableSessionState {
  return {
    version: 1,
    status: 'running',
    updatedAt: '2026-04-29T20:00:00.000Z',
    startedAt: '2026-04-29T20:00:00.000Z',
    endsAt: '2026-04-29T23:00:00.000Z',
    guildId: 'guild',
    roundtableChannelId: 'channel',
    roundtableChannelName: 'dev_support',
    generalChannelId: null,
    generalChannelName: null,
    violaVoiceChannelId: null,
    violaVoiceChannelName: null,
    turnCount: 3,
    nextPersona: 'q',
    lastSpeaker: 'viola',
    lastSummary: 'Viola posted turn 3',
    lastError: null,
    processedCommandMessageIds: [],
    ...overrides,
  }
}

describe('discordRoundtableWatchdog', () => {
  it('launches when no tracked session exists', () => {
    const decision = decideDiscordRoundtableProgressionLoopLaunch({
      session: null,
      now: new Date('2026-04-29T20:30:00.000Z'),
    })

    expect(decision).toEqual({
      shouldLaunch: true,
      reason: 'no tracked roundtable session',
    })
  })

  it('does not launch while the tracked session is actively running', () => {
    const decision = decideDiscordRoundtableProgressionLoopLaunch({
      session: session(),
      childRunning: true,
      now: new Date('2026-04-29T20:30:00.000Z'),
    })

    expect(decision.shouldLaunch).toBe(false)
    expect(decision.reason).toBe('tracked roundtable session is active')
  })

  it('launches when state looks active but the child process is absent', () => {
    const decision = decideDiscordRoundtableProgressionLoopLaunch({
      session: session(),
      childRunning: false,
      now: new Date('2026-04-29T20:30:00.000Z'),
    })

    expect(decision.shouldLaunch).toBe(true)
    expect(decision.reason).toBe('roundtable progression child is not running')
  })

  it('launches when the tracked session window has expired', () => {
    const decision = decideDiscordRoundtableProgressionLoopLaunch({
      session: session({
        status: 'running',
        endsAt: '2026-04-29T20:10:00.000Z',
      }),
      now: new Date('2026-04-29T20:30:00.000Z'),
    })

    expect(decision.shouldLaunch).toBe(true)
    expect(decision.reason).toBe('tracked roundtable session expired')
  })

  it('launches when sync already marked the session stale', () => {
    const decision = decideDiscordRoundtableProgressionLoopLaunch({
      session: session({ status: 'stale' }),
      now: new Date('2026-04-29T20:30:00.000Z'),
    })

    expect(decision.shouldLaunch).toBe(true)
    expect(decision.reason).toBe('tracked roundtable session is stale')
  })

  it('throttles repeated launch attempts', () => {
    const now = new Date('2026-04-29T20:30:00.000Z')
    const decision = decideDiscordRoundtableProgressionLoopLaunch({
      session: null,
      now,
      lastLaunchAtMs:
        now.getTime() - DEFAULT_ROUNDTABLE_PROGRESS_LAUNCH_THROTTLE_MS + 1,
    })

    expect(decision.shouldLaunch).toBe(false)
    expect(decision.reason).toBe('roundtable progression launch recently attempted')
  })
})
