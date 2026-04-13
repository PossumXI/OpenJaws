import { describe, expect, test } from 'bun:test'
import { summarizeBackgroundTaskDialog } from './backgroundTaskDialogSummary.js'

describe('backgroundTaskDialogSummary', () => {
  test('summarizes the active flight deck with crew, model spread, pressure, and ancillary work', () => {
    const summary = summarizeBackgroundTaskDialog({
      localAgents: [
        {
          model: 'openai:gpt-5.4',
          pendingMessages: ['note one', 'note two'],
          progress: { toolUseCount: 7, tokenCount: 12500 },
        },
      ],
      teammates: [
        {
          model: 'gemini:gemini-3.1-pro-preview',
          pendingUserMessages: ['watch retries'],
          progress: { toolUseCount: 4, tokenCount: 4500 },
        },
      ],
      remoteAgents: [{}],
      shellCount: 1,
      monitorCount: 0,
      workflowCount: 0,
      dreamCount: 0,
      width: 200,
    })

    expect(summary?.text).toBe(
      '2 crew · 2 models · 3 queued · 11 tools · 17k tok · 1 remote · 1 shell',
    )
    expect(summary?.tone).toBeUndefined()
  })

  test('compresses the summary deliberately on tighter widths', () => {
    const summary = summarizeBackgroundTaskDialog({
      localAgents: [
        {
          model: 'openai:gpt-5.4',
          pendingMessages: ['note one', 'note two'],
          progress: { toolUseCount: 7, tokenCount: 12500 },
        },
      ],
      teammates: [
        {
          model: 'gemini:gemini-3.1-pro-preview',
          pendingUserMessages: ['watch retries'],
          progress: { toolUseCount: 4, tokenCount: 4500 },
        },
      ],
      remoteAgents: [{}],
      shellCount: 1,
      monitorCount: 0,
      workflowCount: 0,
      dreamCount: 0,
      width: 28,
    })

    expect(summary?.text).toBe('2 crew · 2 models · 3q · 11t')
  })

  test('summarizes ancillary work even when no local crew is active', () => {
    const summary = summarizeBackgroundTaskDialog({
      localAgents: [],
      teammates: [],
      remoteAgents: [{}],
      shellCount: 2,
      monitorCount: 1,
      workflowCount: 0,
      dreamCount: 0,
      width: 200,
    })

    expect(summary?.text).toBe('1 remote · 2 shells · 1 monitor')
  })

  test('surfaces retry, approval, and remote input pressure ahead of queue load', () => {
    const summary = summarizeBackgroundTaskDialog({
      localAgents: [
        {
          model: 'openai:gpt-5.4',
          error: 'provider rejected tool round',
          pendingMessages: ['retry this'],
          progress: { toolUseCount: 9, tokenCount: 12500 },
        },
      ],
      teammates: [
        {
          model: 'openai:gpt-5.4',
          awaitingPlanApproval: true,
          pendingUserMessages: ['approve plan'],
          progress: { toolUseCount: 3, tokenCount: 4200 },
        },
      ],
      remoteAgents: [{ ultraplanPhase: 'needs_input' }],
      shellCount: 0,
      monitorCount: 0,
      workflowCount: 0,
      dreamCount: 0,
      width: 200,
    })

    expect(summary?.text).toBe(
      '2 crew · gpt-5.4 · 1 retry · 1 approval · 1 input · 2 queued · 12 tools · 16.7k tok · 1 remote',
    )
    expect(summary?.tone).toBe('error')
  })

  test('surfaces active crew wave pressure in the flight deck rollup', () => {
    const summary = summarizeBackgroundTaskDialog({
      localAgents: [
        {
          model: 'openai:gpt-5.4',
          pendingMessages: [],
          progress: { toolUseCount: 2, tokenCount: 1200 },
        },
      ],
      teammates: [],
      remoteAgents: [],
      shellCount: 0,
      monitorCount: 0,
      workflowCount: 0,
      dreamCount: 0,
      width: 200,
      immaculateCrewWave: {
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
      immaculateCrewBurstBudget: {
        teamName: 'shipyard',
        label: 'reroute',
        maxSpawns: 0,
        remainingSpawns: 0,
        detail: 'burst cap 0 · recommend router-core',
        updatedAt: Date.now(),
        holdUntil: Date.now() + 900,
        recommendedLayerId: 'router-core',
      },
    })

    expect(summary?.text).toBe(
      '1 crew · gpt-5.4 · wave reroute · launch window 900ms · pressure high · recommend router-core · burst reroute · burst cap 0 · recommend router-core · 2 tools · 1.2k tok',
    )
    expect(summary?.tone).toBe('error')
  })

  test('surfaces deferred launch count in the flight deck rollup', () => {
    const summary = summarizeBackgroundTaskDialog({
      localAgents: [
        {
          model: 'openai:gpt-5.4',
          pendingMessages: [],
          progress: { toolUseCount: 2, tokenCount: 1200 },
        },
      ],
      teammates: [],
      remoteAgents: [],
      shellCount: 0,
      monitorCount: 0,
      workflowCount: 0,
      dreamCount: 0,
      width: 200,
      deferredLaunchCount: 2,
    })

    expect(summary?.text).toBe(
      '1 crew · gpt-5.4 · 2 deferred · 2 tools · 1.2k tok',
    )
    expect(summary?.tone).toBe('warning')
  })

  test('summarizes deferred launches even when no active work is running yet', () => {
    const summary = summarizeBackgroundTaskDialog({
      localAgents: [],
      teammates: [],
      remoteAgents: [],
      shellCount: 0,
      monitorCount: 0,
      workflowCount: 0,
      dreamCount: 0,
      width: 200,
      deferredLaunchCount: 3,
    })

    expect(summary?.text).toBe('3 deferred')
    expect(summary?.tone).toBe('warning')
  })
})
