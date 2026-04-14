# Release Notes

## Current Public Ship Surface

This page summarizes the current public OpenJaws surface that is already working in the repository and shipped build.

## TUI and Branding

- FIGlet-style ASCII/ANSI-inspired `OPENJAWS` banner with the `OPENCHEEKS // FLIGHT DECK // IMMACULATE` deck line now anchors the startup TUI
- ocean-blue flight-deck styling is used across the cockpit, footer, task surfaces, and wiki/repo entry pages
- shark mascot animation now breaches through the waterline instead of acting as a static icon
- public docs and wiki now mirror the same branded banner treatment

## OpenCheek Agents and Task Deck

- multi-agent crew fan-out with Immaculate-paced burst budgeting
- deferred teammate launch queue with inspectable rows, detail dialogs, and operator controls
- coordinator, footer, and background-task surfaces now share one pressure vocabulary
- queued launches, retry pressure, approval pressure, and routed work are visible before they fail

## Immaculate Integration

- Immaculate is now part of the default OpenJaws runtime context
- per-turn checkpoints are injected into the main loop, tool rounds, and agent spawn/resume paths
- crew launch pacing, retry windows, route assignment, and worker health all use the same orchestration layer
- routed `Q` execution now uses signed manifests, worker assignment, remote dispatch, and signed result reconciliation

## Provider and First-Run Setup

- fresh public installs now default to `OCI:Q`
- first-run setup lane lets shipped users choose provider/model, wire keys, and check Immaculate reachability without slash-command knowledge
- `/provider key` and `/provider base-url` make OCI/Q key rotation and endpoint changes explicit
- `/status` surfaces provider, model, runtime, sandbox, routed work, worker health, and recovery guidance
- `/provider` and `/remote-env` are treated as explicit operator controls rather than silent fallback mechanisms

## Security and Release Posture

- MIT licensed public repository
- public updater is GitHub Release-backed, tag-gated, and controlled by `release-policy.json`
- rollout stays fail-closed when policy, manifest, or published assets are unhealthy
- remote `Q` execution uses signed request and signed terminal result envelopes
- worker registration, worker heartbeat, and route assignment now fail closed instead of degrading silently

## Live Benchmark Story

The public benchmark narrative now comes from live Immaculate runs, not placeholders.

- 60-minute soak run recorded in the live Immaculate benchmark source
- 60-second benchmark run recorded in the live Immaculate benchmark source
- the source Immaculate benchmark pass reported benchmark publication, CI, security, and GitGuardian green

See [Benchmark Status](Benchmark-Status.md) for the currently published benchmark record and why it improves OpenJaws.

## What Is Planned Next

- deeper off-host worker execution through Immaculate-visible capability assignment
- more release-safe installed-user update paths without breaking local source workflows
- broader live walkthrough coverage for operator surfaces beyond settings and deferred launch controls
- continued tightening of compatibility shims where it is safe and does not break provider contracts
