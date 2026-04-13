import { describe, expect, test } from 'bun:test'
import { summarizeBackgroundTaskPressure } from './backgroundTaskPressureSummary.js'

describe('backgroundTaskPressureSummary', () => {
  test('surfaces retry, approval, and input pressure in priority order', () => {
    const summary = summarizeBackgroundTaskPressure(
      [
        {
          type: 'local_agent',
          status: 'running',
          error: 'provider rejected tool round',
        },
        {
          type: 'in_process_teammate',
          status: 'running',
          awaitingPlanApproval: true,
        },
        {
          type: 'remote_agent',
          status: 'running',
          ultraplanPhase: 'needs_input',
        },
      ] as never,
      200,
    )

    expect(summary).toEqual({
      text: '1 retry · 1 approval · 1 input',
      tone: 'error',
    })
  })

  test('compacts pressure summaries on tighter widths', () => {
    const summary = summarizeBackgroundTaskPressure(
      [
        {
          type: 'in_process_teammate',
          status: 'running',
          awaitingPlanApproval: true,
        },
        {
          type: 'remote_agent',
          status: 'running',
          ultraplanPhase: 'needs_input',
        },
      ] as never,
      12,
    )

    expect(summary).toEqual({
      text: '1ap · 1in',
      tone: 'warning',
    })
  })

  test('returns success tone for ready-only pressure', () => {
    const summary = summarizeBackgroundTaskPressure(
      [
        {
          type: 'remote_agent',
          status: 'running',
          ultraplanPhase: 'plan_ready',
        },
      ] as never,
      200,
    )

    expect(summary).toEqual({
      text: '1 ready',
      tone: 'success',
    })
  })
})
