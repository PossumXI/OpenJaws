import { describe, expect, test } from 'bun:test'
import {
  evaluatePublicReleaseDecision,
  getPublicReleaseRolloutBucket,
  type PublicReleasePolicy,
} from './publicReleasePolicy.js'

const basePolicy: PublicReleasePolicy = {
  schemaVersion: 1,
  channels: {
    stable: {
      version: '2.1.86',
      rollout: {
        percentage: 100,
      },
    },
    latest: {
      version: '2.1.87-beta.1',
      rollout: {
        percentage: 50,
        seed: 'latest-seed',
      },
    },
  },
}

describe('publicReleasePolicy', () => {
  test('computes a deterministic rollout bucket', () => {
    const first = getPublicReleaseRolloutBucket('user-a', 'stable', 'seed-a')
    const second = getPublicReleaseRolloutBucket('user-a', 'stable', 'seed-a')
    expect(first).toBe(second)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThanOrEqual(100)
  })

  test('marks 100 percent rollout targets as eligible', () => {
    const decision = evaluatePublicReleaseDecision(basePolicy, 'stable', {
      userID: 'user-a',
    })
    expect(decision.status).toBe('eligible')
    expect(decision.version).toBe('2.1.86')
    expect(decision.rolloutPercentage).toBe(100)
  })

  test('holds back installs outside the rollout bucket', () => {
    const decision = evaluatePublicReleaseDecision(
      {
        schemaVersion: 1,
        channels: {
          stable: {
            version: '2.1.90',
            rollout: {
              percentage: 0,
            },
          },
        },
      },
      'stable',
      {
        currentVersion: '2.1.86',
        userID: 'user-a',
      },
    )
    expect(decision.status).toBe('held_back')
    expect(decision.version).toBe('2.1.90')
    expect(decision.summary).toContain('2.1.86')
  })

  test('blocks versions explicitly blocked by policy', () => {
    const decision = evaluatePublicReleaseDecision(
      {
        schemaVersion: 1,
        blockedVersions: ['2.1.86'],
        channels: {
          stable: {
            version: '2.1.86',
          },
        },
      },
      'stable',
      {
        userID: 'user-a',
      },
    )
    expect(decision.status).toBe('blocked')
  })

  test('rejects invalid policy targets', () => {
    const decision = evaluatePublicReleaseDecision(
      {
        schemaVersion: 1,
        channels: {
          stable: {
            version: 'release-now',
          },
        },
      },
      'stable',
      {
        userID: 'user-a',
      },
    )
    expect(decision.status).toBe('invalid_policy')
  })

  test('repo release-policy.json stays structurally valid', async () => {
    const policy = (await Bun.file(
      new URL('../../release-policy.json', import.meta.url),
    ).json()) as PublicReleasePolicy
    const stable = evaluatePublicReleaseDecision(policy, 'stable', {
      userID: 'user-a',
    })
    const latest = evaluatePublicReleaseDecision(policy, 'latest', {
      userID: 'user-a',
    })
    expect(['eligible', 'held_back']).toContain(stable.status)
    expect(['eligible', 'held_back']).toContain(latest.status)
  })
})
