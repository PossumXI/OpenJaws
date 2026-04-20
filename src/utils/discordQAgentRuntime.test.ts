import { describe, expect, it } from 'bun:test'
import {
  createDiscordQAgentReceipt,
  getDiscordQAgentRoutePolicies,
  recordDiscordQAgentEvent,
  upsertDiscordQAgentRouteState,
} from './discordQAgentRuntime.js'

describe('discordQAgentRuntime', () => {
  it('creates a receipt with the expanded gateway and voice defaults', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend: oci:Q via OCI IAM',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: true,
      voiceReady: false,
      voiceProvider: 'system',
      voiceId: 'zira',
      voiceIdSource: 'DISCORD_SYSTEM_VOICE_NAME',
      voiceModelId: 'system',
    })

    expect(receipt.status).toBe('starting')
    expect(receipt.gateway).toEqual({
      connected: false,
      userId: null,
      guildCount: 0,
      lastSequence: null,
    })
    expect(receipt.voice).toMatchObject({
      enabled: true,
      provider: 'system',
      ready: false,
      stagedProvider: null,
      stagedReady: false,
      stagedSummary: null,
      runtimeUrl: null,
      connected: false,
      voiceId: 'zira',
      voiceIdSource: 'DISCORD_SYSTEM_VOICE_NAME',
      modelId: 'system',
      guildId: null,
      channelId: null,
      channelName: null,
      joinedAt: null,
      lastChannelName: null,
      lastHeardUserId: null,
      lastHeardAt: null,
      lastTranscriptSummary: null,
      lastError: null,
    })
    expect(receipt.routing.channels).toEqual(
      getDiscordQAgentRoutePolicies().map(policy => ({ ...policy })),
    )
  })

  it('caps recorded events at the newest 25 items', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: false,
      voiceReady: false,
    })

    for (let index = 0; index < 30; index += 1) {
      recordDiscordQAgentEvent(receipt, {
        at: `2026-04-20T00:00:${index.toString().padStart(2, '0')}.000Z`,
        status: `event-${index}`,
        summary: `summary-${index}`,
      })
    }

    expect(receipt.events).toHaveLength(25)
    expect(receipt.events[0]).toMatchObject({
      status: 'event-29',
      summary: 'summary-29',
    })
    expect(receipt.events.at(-1)).toMatchObject({
      status: 'event-5',
      summary: 'summary-5',
    })
    expect(receipt.updatedAt).toBe('2026-04-20T00:00:29.000Z')
  })

  it('updates only the targeted route state', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: true,
      voiceReady: true,
    })

    upsertDiscordQAgentRouteState(receipt, 'command_station', {
      lastSummary: 'posted a digest',
      lastPostedAt: '2026-04-20T00:10:00.000Z',
    })

    const commandStation = receipt.routing.channels.find(
      route => route.id === 'command_station',
    )
    const updates = receipt.routing.channels.find(route => route.id === 'updates')

    expect(commandStation).toMatchObject({
      id: 'command_station',
      lastSummary: 'posted a digest',
      lastPostedAt: '2026-04-20T00:10:00.000Z',
    })
    expect(updates?.id).toBe('updates')
    expect(updates?.lastSummary).toBeUndefined()
    expect(updates?.lastPostedAt).toBeUndefined()
  })
})
