# Immaculate Integration

Immaculate is the control layer inside OpenJaws.

In plain terms: it helps OpenJaws make smarter decisions about where work should run, when retries should happen, which worker is healthy, and whether the app should fail closed instead of pretending everything is fine.

## What It Does

- adds live checkpoints to the main loop
- helps shape tool routing and retries
- influences how OpenCheek agents start, resume, and pace themselves
- tracks which workers can handle `Q` jobs
- exposes system state so operators can see what is happening

## How It Improves OpenJaws

Immaculate improves OpenJaws by replacing guesswork with visible decisions.

- fewer silent fallbacks when a route, worker, or runtime is not really available
- better load handling when several OpenCheek agents are active at once
- clearer remote execution rules for `Q`
- one shared control language across `/immaculate`, `/status`, background tasks, and route state
- better receipts for users who want to know what the app is actually doing before they trust it

## Execution Model

1. OpenJaws resolves local config and live harness state.
2. Immaculate surfaces the current pressure, recommended layer, and worker pool.
3. Agent/tool/routing decisions use that live state instead of fixed heuristics.
4. Routed `Q` work is signed, queued, assigned, dispatched, and reconciled through the same control plane.

## What Installed Users See

OpenJaws shows Immaculate through normal operator paths, not hidden internal controls.

- `/status` shows route queue state, worker health, runtime mode, and routed execution details
- flight-deck notices surface pending assignment and routed `Q` state
- background task surfaces reflect burst budgets, deferred launches, and crew pressure
- `/immaculate` exposes topology and control state directly for operators who want a deeper view

## Security and Reliability Posture

Immaculate is there to reduce hidden failure modes, not to take control away from the local operator.

- permission prompts still belong to OpenJaws and the operator
- route assignment and worker capability checks are fail-closed
- signed route and result envelopes are used for remote `Q` execution
- worker heartbeat and assignment health are surfaced instead of silently ignored
- installed users should still verify provider/runtime state through `/status` after switching providers or updating builds

## Why It Matters

- fewer silent fallbacks
- clearer visibility
- steadier behavior under concurrent load
- safer remote execution
- one shared control language across the TUI, workers, queue state, and status receipts

## Current Working Areas

- crew-pressure shaping
- remote worker capability registry
- signed `Q` route dispatch and completion
- fail-closed worker sync
- status and flight-deck visibility for pending assignment and route health
