import { describe, expect, test } from 'bun:test'
import {
  summarizeLocalAgentSection,
  summarizeRemoteAgentSection,
  summarizeTeammateSection,
} from './backgroundTaskSectionSummary.js'

describe('backgroundTaskSectionSummary', () => {
  test('summarizes a single-model local-agent section with queued load and tool pressure', () => {
    const summary = summarizeLocalAgentSection(
      [
        {
          model: 'openai:gpt-5.4',
          pendingMessages: ['one', 'two'],
          progress: { toolUseCount: 7, tokenCount: 12500 },
        },
      ],
      200,
    )

    expect(summary?.text).toBe('gpt-5.4 · 2 queued · 7 tools · 12.5k tok')
    expect(summary?.tone).toBeUndefined()
  })

  test('compresses multi-model summaries on tighter widths', () => {
    const summary = summarizeLocalAgentSection(
      [
        {
          model: 'openai:gpt-5.4',
          pendingMessages: ['one'],
          progress: { toolUseCount: 7, tokenCount: 12500 },
        },
        {
          model: 'gemini:gemini-3.1-pro-preview',
          pendingMessages: ['two', 'three'],
          progress: { toolUseCount: 2, tokenCount: 3000 },
        },
      ],
      28,
    )

    expect(summary?.text).toBe('2 models · 3 queued · 9t')
    expect(summary?.tone).toBeUndefined()
  })

  test('summarizes teammate sections from live queue and token totals', () => {
    const summary = summarizeTeammateSection(
      [
        {
          model: 'openai:gpt-5.4',
          pendingUserMessages: ['watch this'],
          progress: { toolUseCount: 3, tokenCount: 4200 },
        },
        {
          model: 'openai:gpt-5.4',
          pendingUserMessages: [],
          progress: { toolUseCount: 1, tokenCount: 800 },
        },
      ],
      200,
    )

    expect(summary?.text).toBe('gpt-5.4 · 1 queued · 4 tools · 5k tok')
    expect(summary?.tone).toBeUndefined()
  })

  test('surfaces approval pressure in teammate section summaries', () => {
    const summary = summarizeTeammateSection(
      [
        {
          model: 'openai:gpt-5.4',
          awaitingPlanApproval: true,
          pendingUserMessages: ['watch this'],
          progress: { toolUseCount: 3, tokenCount: 4200 },
        },
      ],
      200,
    )

    expect(summary?.text).toBe(
      'gpt-5.4 · 1 approval · 1 queued · 3 tools · 4.2k tok',
    )
    expect(summary?.tone).toBe('warning')
  })

  test('summarizes remote input and ready pressure', () => {
    const summary = summarizeRemoteAgentSection(
      [
        { ultraplanPhase: 'needs_input' },
        { ultraplanPhase: 'plan_ready' },
      ],
      200,
    )

    expect(summary?.text).toBe('1 input · 1 ready')
    expect(summary?.tone).toBe('warning')
  })
})
