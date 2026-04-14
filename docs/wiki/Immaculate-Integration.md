# Immaculate Integration

Immaculate is the orchestration layer inside OpenJaws. It is not treated as a sidecar feature.

## What It Does

- injects per-turn system checkpoints into the main loop
- informs tool orchestration and retry shaping
- influences OpenCheek agent spawn, resume, burst pacing, and deferred release
- tracks worker capabilities and route assignment for `Q` execution
- exposes topology, execution load, and control lanes to operators

## How It Improves OpenJaws

Immaculate improves OpenJaws by making execution decisions more explicit, more inspectable, and less heuristic.

- fewer silent fallbacks when a route, worker, or runtime is not actually available
- better load shaping when multiple OpenCheek agents are active at once
- cleaner remote execution policy for `Q` routes and worker assignment
- one orchestration vocabulary across `/immaculate`, `/status`, background task surfaces, and route state
- more useful operator receipts for installed users who need to know what the system is doing before they trust it

## Execution Model

1. OpenJaws resolves local config and live harness state.
2. Immaculate surfaces the current pressure, recommended layer, and worker pool.
3. Agent/tool/routing decisions use that live state instead of fixed heuristics.
4. Routed `Q` work is signed, queued, assigned, dispatched, and reconciled through the same control plane.

## What Installed Users See

OpenJaws surfaces Immaculate through public operator paths, not hidden internal controls.

- `/status` shows route queue state, worker health, runtime mode, and routed execution details
- flight-deck notices surface pending assignment and routed `Q` state
- background task surfaces reflect burst budgets, deferred launches, and crew pressure
- `/immaculate` exposes topology and control state directly for operators who want a deeper view

## Security and Reliability Posture

Immaculate is used to reduce hidden failure modes, not to bypass local operator control.

- permission prompts still belong to OpenJaws and the operator
- route assignment and worker capability checks are fail-closed
- signed route and result envelopes are used for remote `Q` execution
- worker heartbeat and assignment health are surfaced instead of silently ignored
- installed users should still verify provider/runtime state through `/status` after switching providers or updating builds

## Why It Matters

- fewer silent fallbacks
- more explicit operator visibility
- better pacing under concurrent load
- cleaner remote execution semantics
- one control language across TUI, workers, queue state, and status receipts

## Current Working Areas

- crew-pressure shaping
- remote worker capability registry
- signed `Q` route dispatch and completion
- fail-closed worker sync
- status and flight-deck visibility for pending assignment and route health
