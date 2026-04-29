export type QFastPathPolicy = {
  failureThreshold: number
  windowMs: number
}

export type QRouteLeasePolicy = {
  claimTtlMs: number
  watchLeaseMultiplier: number
  minimumLeaseMs: number
}

export type ImmaculateCrewPolicy = {
  rerouteDelayMs: number
  holdDelayMs: number
  retentionMs: number
}

export const Q_FAST_PATH_POLICY: Readonly<QFastPathPolicy> = Object.freeze({
  failureThreshold: 3,
  windowMs: 60_000,
})

export const Q_ROUTE_LEASE_POLICY: Readonly<QRouteLeasePolicy> = Object.freeze({
  claimTtlMs: 45_000,
  watchLeaseMultiplier: 3,
  minimumLeaseMs: 5_000,
})

export const IMMACULATE_CREW_POLICY: Readonly<ImmaculateCrewPolicy> =
  Object.freeze({
    rerouteDelayMs: 900,
    holdDelayMs: 250,
    retentionMs: 15_000,
  })

export function resolveQFastPathPolicy(args: {
  threshold?: number | null
  windowMs?: number | null
} = {}): QFastPathPolicy {
  return {
    failureThreshold: args.threshold ?? Q_FAST_PATH_POLICY.failureThreshold,
    windowMs: args.windowMs ?? Q_FAST_PATH_POLICY.windowMs,
  }
}

export function resolveQRouteClaimTtlMs(claimTtlMs?: number | null): number {
  return claimTtlMs ?? Q_ROUTE_LEASE_POLICY.claimTtlMs
}

export function resolveQWorkerLeaseDurationMs(args: {
  claimTtlMs?: number | null
  watch: boolean
  pollMs: number
}): number {
  return Math.max(
    resolveQRouteClaimTtlMs(args.claimTtlMs),
    args.watch
      ? args.pollMs * Q_ROUTE_LEASE_POLICY.watchLeaseMultiplier
      : Q_ROUTE_LEASE_POLICY.minimumLeaseMs,
  )
}

export function resolveImmaculatePressureDelayMs(
  label: 'reroute' | 'hold' | 'clear' | 'expand',
): number {
  if (label === 'reroute') {
    return IMMACULATE_CREW_POLICY.rerouteDelayMs
  }
  if (label === 'hold') {
    return IMMACULATE_CREW_POLICY.holdDelayMs
  }
  return 0
}

export function isQTransportFastPathSuppressed(
  fallbackWindow: { active: boolean } | null | undefined,
): boolean {
  return fallbackWindow?.active ?? false
}

export function shouldRequestImmaculateQRoute(args: {
  preflightDecision: 'allow_local' | 'remote_required' | 'preflight_blocked'
  routeMode: 'auto' | 'local' | 'immaculate'
  forceLocalLaunch: boolean
  fallbackWindow: { active: boolean } | null | undefined
}): boolean {
  if (args.forceLocalLaunch || args.preflightDecision === 'preflight_blocked') {
    return false
  }
  if (args.routeMode === 'local') {
    return false
  }
  if (args.routeMode === 'immaculate') {
    return true
  }
  return (
    args.preflightDecision === 'remote_required' &&
    !isQTransportFastPathSuppressed(args.fallbackWindow)
  )
}

export function summarizeQFastPathSuppression(args: {
  recentTransportFailureCount: number
  windowMs: number
}): string {
  return `${args.recentTransportFailureCount} transport failures observed within ${Math.round(
    args.windowMs / 1000,
  )}s. The fast path resumes automatically after a clean routed success.`
}

export function resolveQRouteDispatchTransport(args: {
  remoteExecution: boolean
  executionEndpoint: string | null
  fallbackWindow: { active: boolean } | null | undefined
}): 'remote_http' | 'local_process' {
  return args.remoteExecution &&
    !isQTransportFastPathSuppressed(args.fallbackWindow) &&
    args.executionEndpoint
    ? 'remote_http'
    : 'local_process'
}
