# Immaculate Integration

Immaculate is the orchestration layer inside OpenJaws. It is not treated as a sidecar feature.

## What It Does

- injects per-turn system checkpoints into the main loop
- informs tool orchestration and retry shaping
- influences OpenCheek agent spawn, resume, burst pacing, and deferred release
- tracks worker capabilities and route assignment for Gemma execution
- exposes topology, execution load, and control lanes to operators

## Execution Model

1. OpenJaws resolves local config and live harness state.
2. Immaculate surfaces the current pressure, recommended layer, and worker pool.
3. Agent/tool/routing decisions use that live state instead of fixed heuristics.
4. Routed Gemma work is signed, queued, assigned, dispatched, and reconciled through the same control plane.

## Why It Matters

- fewer silent fallbacks
- more explicit operator visibility
- better pacing under concurrent load
- cleaner remote execution semantics
- one control language across TUI, workers, queue state, and status receipts

## Current Working Areas

- crew-pressure shaping
- remote worker capability registry
- signed Gemma route dispatch and completion
- fail-closed worker sync
- status and flight-deck visibility for pending assignment and route health
