import { describe, expect, test } from 'bun:test'
import { getDefaultAppState, type AppState } from '../../state/AppState.js'
import { createStore } from '../../state/store.js'
import type { ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'
import type { ImmaculateDeferredTeammateLaunch } from '../../utils/immaculateDeferredLaunches.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import {
  cancelDeferredTeammateLaunch,
  prioritizeDeferredTeammateLaunch,
  releaseDeferredTeammateLaunchNow,
  setDeferredTeammateLaunchRuntimeOverrides,
} from './deferredTeammateLaunchQueue.js'

function createLaunch(
  id: string,
  status: ImmaculateDeferredTeammateLaunch['status'],
  options?: {
    agentName?: string
    queuedAt?: number
    releaseAt?: number
  },
): ImmaculateDeferredTeammateLaunch {
  return {
    id,
    teamName: 'shipyard',
    agentName: options?.agentName ?? 'deckhand-1',
    queuedAt: options?.queuedAt ?? 10,
    releaseAt: options?.releaseAt ?? 100,
    attempts: status === 'queued' ? 0 : 1,
    status,
    ...(status === 'failed' ? { lastError: 'provider rejected tool round' } : {}),
  }
}

function createHarness(
  launches: ImmaculateDeferredTeammateLaunch[],
): {
  context: ToolUseContext
  getLaunches: () => readonly ImmaculateDeferredTeammateLaunch[]
  systemMessages: string[]
} {
  const store = createStore<AppState>({
    ...getDefaultAppState(),
    immaculateDeferredTeammateLaunches: launches,
  })
  const systemMessages: string[] = []
  const thinkingConfig: ThinkingConfig = { type: 'disabled' }

  const context = {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'openai:gpt-5.4',
      tools: [],
      verbose: false,
      thinkingConfig,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { activeAgents: [], allAgents: [] },
    },
    abortController: new AbortController(),
    readFileState: {} as FileStateCache,
    getAppState: () => store.getState(),
    setAppState: store.setState,
    appendSystemMessage: message => {
      systemMessages.push(message.content)
    },
    nestedMemoryAttachmentTriggers: new Set<string>(),
    loadedNestedMemoryPaths: new Set<string>(),
    dynamicSkillDirTriggers: new Set<string>(),
    discoveredSkillNames: new Set<string>(),
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [] as Message[],
  } as ToolUseContext

  return {
    context,
    getLaunches: () => store.getState().immaculateDeferredTeammateLaunches,
    systemMessages,
  }
}

describe('deferredTeammateLaunchQueue', () => {
  test('cancels queued launches and emits a queue receipt', () => {
    const harness = createHarness([createLaunch('queued-launch', 'queued')])

    expect(cancelDeferredTeammateLaunch(harness.context, 'queued-launch')).toBe(
      true,
    )
    expect(harness.getLaunches()).toHaveLength(0)
    expect(harness.systemMessages).toEqual([
      'Immaculate queue: cancelled deckhand-1 · shipyard',
    ])
  })

  test('prioritizes queued launches without waking the processor when autoplay is disabled', () => {
    const harness = createHarness([
      createLaunch('queued-launch-1', 'queued', {
        agentName: 'deckhand-1',
        queuedAt: 10,
        releaseAt: 120,
      }),
      createLaunch('queued-launch-2', 'queued', {
        agentName: 'deckhand-2',
        queuedAt: 20,
        releaseAt: 240,
      }),
    ])
    setDeferredTeammateLaunchRuntimeOverrides(harness.context, {
      autoProcess: false,
    })

    try {
      expect(
        prioritizeDeferredTeammateLaunch(harness.context, 'queued-launch-2'),
      ).toBe(true)

      const launches = harness.getLaunches()
      const prioritized = launches.find(launch => launch.id === 'queued-launch-2')
      const leading = launches
        .filter(launch => launch.status === 'queued')
        .sort((left, right) =>
          left.releaseAt === right.releaseAt
            ? left.queuedAt - right.queuedAt
            : left.releaseAt - right.releaseAt,
        )[0]

      expect(prioritized?.releaseAt).toBe(120)
      expect(prioritized?.queuedAt).toBe(9)
      expect(leading?.id).toBe('queued-launch-2')
      expect(harness.systemMessages).toEqual([
        'Immaculate queue: prioritized deckhand-2 · shipyard',
      ])
    } finally {
      setDeferredTeammateLaunchRuntimeOverrides(harness.context, null)
    }
  })

  test('releases queued launches immediately without mutating them into a live spawn when autoplay is disabled', () => {
    const harness = createHarness([
      createLaunch('queued-launch-1', 'queued', {
        agentName: 'deckhand-1',
        queuedAt: 10,
        releaseAt: 120,
      }),
      createLaunch('queued-launch-2', 'queued', {
        agentName: 'deckhand-2',
        queuedAt: 20,
        releaseAt: 240,
      }),
    ])
    setDeferredTeammateLaunchRuntimeOverrides(harness.context, {
      autoProcess: false,
    })

    try {
      const before = Date.now()
      expect(
        releaseDeferredTeammateLaunchNow(harness.context, 'queued-launch-2'),
      ).toBe(true)
      const after = Date.now()
      const released = harness
        .getLaunches()
        .find(launch => launch.id === 'queued-launch-2')

      expect(released?.status).toBe('queued')
      expect(released?.releaseAt).toBeGreaterThanOrEqual(before)
      expect(released?.releaseAt).toBeLessThanOrEqual(after)
      expect(released?.queuedAt).toBe(9)
      expect(harness.systemMessages).toEqual([
        'Immaculate queue: release requested for deckhand-2 · shipyard',
      ])
    } finally {
      setDeferredTeammateLaunchRuntimeOverrides(harness.context, null)
    }
  })

  test('does not mutate launching launches through queue controls', () => {
    const harness = createHarness([
      createLaunch('launching-launch', 'launching'),
    ])
    const before = JSON.stringify(harness.getLaunches())

    expect(
      cancelDeferredTeammateLaunch(harness.context, 'launching-launch'),
    ).toBe(false)
    expect(
      prioritizeDeferredTeammateLaunch(harness.context, 'launching-launch'),
    ).toBe(false)
    expect(
      releaseDeferredTeammateLaunchNow(harness.context, 'launching-launch'),
    ).toBe(false)

    expect(JSON.stringify(harness.getLaunches())).toBe(before)
    expect(harness.systemMessages).toHaveLength(0)
  })

  test('does not mutate failed launches through queue controls', () => {
    const harness = createHarness([createLaunch('failed-launch', 'failed')])
    const before = JSON.stringify(harness.getLaunches())

    expect(
      cancelDeferredTeammateLaunch(harness.context, 'failed-launch'),
    ).toBe(false)
    expect(
      prioritizeDeferredTeammateLaunch(harness.context, 'failed-launch'),
    ).toBe(false)
    expect(
      releaseDeferredTeammateLaunchNow(harness.context, 'failed-launch'),
    ).toBe(false)

    expect(JSON.stringify(harness.getLaunches())).toBe(before)
    expect(harness.systemMessages).toHaveLength(0)
  })
})
