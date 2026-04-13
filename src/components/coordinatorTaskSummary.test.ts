import { describe, expect, it } from 'bun:test'
import { summarizeCoordinatorTasks } from './coordinatorTaskSummary.js'

function makeLocalAgentTask({
  id,
  status = 'running',
  error,
  pendingMessages = [],
}: {
  id: string
  status?: 'running' | 'completed' | 'failed' | 'killed'
  error?: string
  pendingMessages?: string[]
}) {
  return {
    id,
    type: 'local_agent' as const,
    agentId: id,
    prompt: '',
    agentType: 'worker',
    status,
    description: id,
    startTime: 1,
    outputFile: '',
    outputOffset: 0,
    notified: false,
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages,
    retain: false,
    diskLoaded: false,
    ...(error ? { error } : {}),
  }
}

describe('summarizeCoordinatorTasks', () => {
  it('surfaces retry pressure ahead of queued work', () => {
    const summary = summarizeCoordinatorTasks([
      makeLocalAgentTask({
        id: 'a',
        pendingMessages: ['check the retry path'],
      }),
      makeLocalAgentTask({
        id: 'b',
        status: 'failed',
        error: 'network timeout',
        pendingMessages: ['retry this'],
      }),
      makeLocalAgentTask({
        id: 'c',
        status: 'completed',
      }),
    ] as never)

    expect(summary).toEqual({
      text: 'flight deck roster · 3 agents · 1 live · 1 retry · 2 queued',
      tone: 'error',
    })
  })

  it('uses warning tone for queued-only pressure', () => {
    const summary = summarizeCoordinatorTasks([
      makeLocalAgentTask({
        id: 'solo',
        pendingMessages: ['keep going'],
      }),
    ] as never)

    expect(summary).toEqual({
      text: 'flight deck roster · 1 agent · 1 live · 1 queued',
      tone: 'warning',
    })
  })

  it('adds immaculate deck detail and warning tone when the harness is offline', () => {
    const summary = summarizeCoordinatorTasks(
      [
        makeLocalAgentTask({
          id: 'solo',
          status: 'completed',
        }),
      ] as never,
      {
        status: {
          enabled: true,
          mode: 'balanced',
          harnessUrl: 'http://127.0.0.1:8787',
          actor: 'openjaws',
          loopback: true,
          reachable: false,
          error: 'connect ECONNREFUSED',
        },
        deckReceipt: null,
      },
    )

    expect(summary).toEqual({
      text: 'flight deck roster · 1 agent · 0 live',
      tone: 'warning',
      detail: 'immaculate offline · connect ECONNREFUSED',
    })
  })

  it('shows live immaculate recommendation alongside crew pressure', () => {
    const summary = summarizeCoordinatorTasks(
      [
        makeLocalAgentTask({
          id: 'a',
        }),
        makeLocalAgentTask({
          id: 'b',
          pendingMessages: ['keep going'],
        }),
      ] as never,
      {
        status: {
          enabled: true,
          mode: 'balanced',
          harnessUrl: 'http://127.0.0.1:8787',
          actor: 'openjaws',
          loopback: true,
          reachable: true,
        },
        deckReceipt: {
          profile: 'human-connectome-harness',
          layerCount: 4,
          executionCount: 6,
          recommendedLayerId: 'router-core',
        },
      },
    )

    expect(summary).toEqual({
      text: 'flight deck roster · 2 agents · 2 live · 1 queued',
      tone: 'warning',
      detail: 'immaculate online · human-connectome-harness · 6 exec · recommend router-core',
    })
  })

  it('surfaces live crew wave pressure alongside immaculate deck detail', () => {
    const summary = summarizeCoordinatorTasks(
      [
        makeLocalAgentTask({
          id: 'a',
        }),
      ] as never,
      {
        status: {
          enabled: true,
          mode: 'balanced',
          harnessUrl: 'http://127.0.0.1:8787',
          actor: 'openjaws',
          loopback: true,
          reachable: true,
        },
        deckReceipt: {
          layerCount: 4,
          executionCount: 6,
        },
        wave: {
          teamName: 'shipyard',
          crewSize: 5,
          label: 'reroute',
          detail: 'launch window 900ms · pressure high · recommend router-core',
          delayMs: 900,
          updatedAt: Date.now(),
          holdUntil: Date.now() + 900,
          executionCount: 6,
          recommendedLayerId: 'router-core',
        },
        burstBudget: {
          teamName: 'shipyard',
          label: 'reroute',
          maxSpawns: 0,
          remainingSpawns: 0,
          detail: 'burst cap 0 · recommend router-core',
          updatedAt: Date.now(),
          holdUntil: Date.now() + 900,
          recommendedLayerId: 'router-core',
        },
      },
    )

    expect(summary).toEqual({
      text: 'flight deck roster · 1 agent · 1 live',
      tone: 'error',
      detail:
        'immaculate online · 6 exec · wave reroute · launch window 900ms · pressure high · recommend router-core · burst reroute · burst cap 0 · recommend router-core',
    })
  })

  it('shows deferred launch count on the top-line roster summary', () => {
    const summary = summarizeCoordinatorTasks(
      [
        makeLocalAgentTask({
          id: 'a',
        }),
      ] as never,
      {
        status: {
          enabled: true,
          mode: 'balanced',
          harnessUrl: 'http://127.0.0.1:8787',
          actor: 'openjaws',
          loopback: true,
          reachable: true,
        },
        deckReceipt: null,
        deferredLaunchCount: 2,
      },
    )

    expect(summary).toEqual({
      text: 'flight deck roster · 1 agent · 1 live · 2 deferred',
      tone: 'warning',
      detail: 'immaculate online',
    })
  })

  it('keeps the flight deck summary visible when only deferred launches remain', () => {
    const summary = summarizeCoordinatorTasks([] as never, {
      status: {
        enabled: true,
        mode: 'balanced',
        harnessUrl: 'http://127.0.0.1:8787',
        actor: 'openjaws',
        loopback: true,
        reachable: true,
      },
      deckReceipt: null,
      deferredLaunchCount: 2,
    })

    expect(summary).toEqual({
      text: 'flight deck roster · 0 agents · 0 live · 2 deferred',
      tone: 'warning',
      detail: 'immaculate online',
    })
  })
})
