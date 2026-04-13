import { describe, expect, test } from 'bun:test'
import {
  buildDeferredTeammateLaunchDetailItems,
  buildDeferredTeammateLaunchRowText,
  getDeferredTeammateLaunchEta,
  getDeferredTeammateLaunchStateLabel,
  getDeferredTeammateLaunchTone,
} from './deferredTeammateLaunchPresentation.js'

describe('deferred teammate launch presentation', () => {
  test('formats queued launches with eta and retries', () => {
    const now = 10_000
    const launch = {
      teamName: 'shipyard',
      agentName: 'deckhand-3',
      status: 'queued' as const,
      queuedAt: now - 2_000,
      releaseAt: now + 9_000,
      attempts: 2,
    }

    expect(getDeferredTeammateLaunchStateLabel(launch)).toBe('queued')
    expect(getDeferredTeammateLaunchTone(launch)).toBe('warning')
    expect(getDeferredTeammateLaunchEta(launch, now)).toBe('in 9s')
    expect(buildDeferredTeammateLaunchRowText(launch, now)).toBe(
      '@deckhand-3 · queued · in 9s · 2 retries',
    )
  })

  test('formats launching and failed launches distinctly', () => {
    const now = 10_000
    const launching = {
      teamName: 'shipyard',
      agentName: 'deckhand-4',
      status: 'launching' as const,
      queuedAt: now - 4_000,
      releaseAt: now,
      attempts: 1,
    }
    const failed = {
      teamName: 'shipyard',
      agentName: 'deckhand-5',
      status: 'failed' as const,
      queuedAt: now - 8_000,
      releaseAt: now - 2_000,
      attempts: 3,
      lastError: 'spawn failed',
    }

    expect(getDeferredTeammateLaunchTone(launching)).toBe('success')
    expect(getDeferredTeammateLaunchEta(launching, now)).toBe('releasing now')
    expect(buildDeferredTeammateLaunchRowText(launching, now)).toBe(
      '@deckhand-4 · launching · releasing now · 1 retry',
    )

    expect(getDeferredTeammateLaunchTone(failed)).toBe('error')
    expect(getDeferredTeammateLaunchEta(failed, now)).toBeNull()
    expect(buildDeferredTeammateLaunchRowText(failed, now)).toBe(
      '@deckhand-5 · failed · 3 retries · spawn failed',
    )
  })

  test('builds detail items with release and error fields', () => {
    const now = 10_000
    const queued = buildDeferredTeammateLaunchDetailItems(
      {
        teamName: 'shipyard',
        status: 'queued',
        queuedAt: now - 5_000,
        releaseAt: now + 12_000,
        attempts: 1,
      },
      now,
    )
    const failed = buildDeferredTeammateLaunchDetailItems(
      {
        teamName: 'shipyard',
        status: 'failed',
        queuedAt: now - 9_000,
        releaseAt: now - 1_000,
        attempts: 4,
        lastError: 'spawn failed',
      },
      now,
    )

    expect(queued).toEqual([
      { label: 'team', value: 'shipyard' },
      { label: 'state', value: 'queued', color: 'warning' },
      { label: 'queued', value: '5s ago' },
      { label: 'release', value: 'in 12s', color: 'warning' },
      { label: 'attempts', value: '1' },
    ])

    expect(failed).toEqual([
      { label: 'team', value: 'shipyard' },
      { label: 'state', value: 'failed', color: 'error' },
      { label: 'queued', value: '9s ago' },
      { label: 'attempts', value: '4' },
      { label: 'error', value: 'spawn failed', color: 'error' },
    ])
  })
})
