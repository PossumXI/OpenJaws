import { describe, expect, test } from 'bun:test'
import {
  IMMACULATE_CREW_POLICY,
  Q_FAST_PATH_POLICY,
  Q_ROUTE_LEASE_POLICY,
  isQTransportFastPathSuppressed,
  resolveImmaculatePressureDelayMs,
  resolveQFastPathPolicy,
  resolveQRouteDispatchTransport,
  resolveQRouteClaimTtlMs,
  resolveQWorkerLeaseDurationMs,
  shouldRequestImmaculateQRoute,
  summarizeQFastPathSuppression,
} from './policies.js'

describe('immaculate policies', () => {
  test('keeps Q fast-path defaults in one place', () => {
    expect(resolveQFastPathPolicy()).toEqual(Q_FAST_PATH_POLICY)
    expect(
      resolveQFastPathPolicy({
        threshold: 5,
        windowMs: 90_000,
      }),
    ).toEqual({
      failureThreshold: 5,
      windowMs: 90_000,
    })
  })

  test('resolves route claim ttl and lease duration deterministically', () => {
    expect(resolveQRouteClaimTtlMs()).toBe(Q_ROUTE_LEASE_POLICY.claimTtlMs)
    expect(resolveQRouteClaimTtlMs(12_000)).toBe(12_000)

    expect(
      resolveQWorkerLeaseDurationMs({
        claimTtlMs: 10_000,
        watch: true,
        pollMs: 8_000,
      }),
    ).toBe(24_000)

    expect(
      resolveQWorkerLeaseDurationMs({
        claimTtlMs: null,
        watch: false,
        pollMs: 500,
      }),
    ).toBe(Q_ROUTE_LEASE_POLICY.claimTtlMs)
  })

  test('maps Immaculate pressure labels to the shared delay policy', () => {
    expect(resolveImmaculatePressureDelayMs('reroute')).toBe(
      IMMACULATE_CREW_POLICY.rerouteDelayMs,
    )
    expect(resolveImmaculatePressureDelayMs('hold')).toBe(
      IMMACULATE_CREW_POLICY.holdDelayMs,
    )
    expect(resolveImmaculatePressureDelayMs('clear')).toBe(0)
    expect(resolveImmaculatePressureDelayMs('expand')).toBe(0)
  })

  test('keeps routed Q transport decisions on one policy path', () => {
    expect(
      shouldRequestImmaculateQRoute({
        preflightDecision: 'remote_required',
        routeMode: 'auto',
        forceLocalLaunch: false,
        fallbackWindow: { active: false },
      }),
    ).toBe(true)
    expect(
      shouldRequestImmaculateQRoute({
        preflightDecision: 'remote_required',
        routeMode: 'immaculate',
        forceLocalLaunch: false,
        fallbackWindow: { active: true },
      }),
    ).toBe(false)
    expect(isQTransportFastPathSuppressed({ active: true })).toBe(true)
    expect(isQTransportFastPathSuppressed({ active: false })).toBe(false)
    expect(
      resolveQRouteDispatchTransport({
        remoteExecution: true,
        executionEndpoint: 'https://gpu.example/execute',
        fallbackWindow: { active: false },
      }),
    ).toBe('remote_http')
    expect(
      resolveQRouteDispatchTransport({
        remoteExecution: true,
        executionEndpoint: 'https://gpu.example/execute',
        fallbackWindow: { active: true },
      }),
    ).toBe('local_process')
    expect(
      summarizeQFastPathSuppression({
        recentTransportFailureCount: 3,
        windowMs: 60_000,
      }),
    ).toContain('3 transport failures observed within 60s')
  })
})
