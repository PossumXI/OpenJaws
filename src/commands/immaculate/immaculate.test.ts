import { describe, expect, test } from 'bun:test'
import {
  formatImmaculateStatusMessage,
  parseImmaculateCommand,
} from './immaculate.js'

describe('/immaculate command parsing', () => {
  test('defaults to status with empty args', () => {
    expect(parseImmaculateCommand('')).toEqual({ type: 'status' })
  })

  test('parses direct control actions with target and value', () => {
    expect(parseImmaculateCommand('boost router-core 0.7')).toEqual({
      type: 'control',
      action: 'boost',
      target: 'router-core',
      value: 0.7,
    })
  })

  test('parses run with optional layer flag', () => {
    expect(
      parseImmaculateCommand('run --layer ollama-mid-gemma4-e4b tighten routing'),
    ).toEqual({
      type: 'run',
      layerId: 'ollama-mid-gemma4-e4b',
      objective: 'tighten routing',
    })
  })

  test('rejects unknown register roles', () => {
    expect(parseImmaculateCommand('register captain')).toEqual({
      type: 'error',
      message:
        'Unknown Immaculate Ollama role "captain". Valid roles: soul, mid, reasoner, guard',
    })
  })
})

describe('/immaculate status formatting', () => {
  test('formats live status with deck receipt', () => {
    expect(
      formatImmaculateStatusMessage(
        {
          enabled: true,
          mode: 'balanced',
          harnessUrl: 'http://127.0.0.1:8787',
          actor: 'openjaws',
          loopback: true,
          reachable: true,
          status: 200,
          service: 'immaculate-harness',
          clients: 0,
        },
        {
          profile: 'human-connectome-harness',
          cycle: 1032,
          nodes: 11,
          edges: 16,
          layerCount: 1,
          executionCount: 0,
          recommendedLayerId: 'ollama-mid-gemma4-e4b',
        },
      ),
    ).toContain(
      'Deck: human-connectome-harness · cycle 1032 · 11 nodes · 16 edges',
    )
  })
})
