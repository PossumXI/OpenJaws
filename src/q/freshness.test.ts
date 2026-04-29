import { describe, expect, test } from 'bun:test'
import {
  Q_BASE_KNOWLEDGE_CUTOFF,
  appendQRuntimeFreshnessBlock,
  buildQRuntimeFreshnessBlock,
  isQModelId,
  requestNeedsFreshContext,
} from './freshness.js'

describe('Q freshness prompt helpers', () => {
  test('identifies Q model aliases', () => {
    expect(isQModelId('q')).toBe(true)
    expect(isQModelId('oci:Q')).toBe(true)
    expect(isQModelId('ollama:q:latest')).toBe(true)
    expect(isQModelId('q-lite')).toBe(true)
    expect(isQModelId('claude-opus-4-6')).toBe(false)
  })

  test('builds a runtime freshness block with the cutoff', () => {
    const block = buildQRuntimeFreshnessBlock({
      now: new Date('2026-04-24T12:30:00.000Z'),
      webResearchAvailable: true,
    })

    expect(block).toContain('# Q Freshness')
    expect(block).toContain(Q_BASE_KNOWLEDGE_CUTOFF)
    expect(block).toContain('Current runtime date/time: 2026-04-24T12:30:00.000Z UTC')
    expect(block).toContain('local runtime clock:')
    expect(block).toContain('answer date questions from this runtime clock')
    expect(block).toContain('Live web verification is available')
    expect(block).toContain('attached governed web context')
    expect(block).toContain('Local receipts')
  })

  test('makes unavailable web tools explicit', () => {
    const block = buildQRuntimeFreshnessBlock({
      now: new Date('2026-04-24T12:30:00.000Z'),
      webResearchAvailable: false,
    })

    expect(block).toContain('No live web research output or browser tool is available')
    expect(block).toContain('mark current/latest claims as unverified')
  })

  test('detects requests that need fresh context', () => {
    expect(
      requestNeedsFreshContext('What is the latest TerminalBench leaderboard today?'),
    ).toBe(true)
    expect(requestNeedsFreshContext('Check the official docs for the new API')).toBe(true)
    expect(requestNeedsFreshContext('Write a small hello world example')).toBe(false)
  })

  test('appends the freshness block once', () => {
    const first = appendQRuntimeFreshnessBlock('Reply briefly.')
    const second = appendQRuntimeFreshnessBlock(first)

    expect(first).toContain('Reply briefly.')
    expect(first).toContain('# Q Freshness')
    expect(second).toBe(first)
  })
})
