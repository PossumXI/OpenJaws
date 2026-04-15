# Release Notes

## Current Public Ship Surface

This page summarizes the current public OpenJaws surface that is already working in the repository and shipped build.

## TUI and Branding

- FIGlet-style `OPENJAWS` banner now uses a six-row ANSI-shadow treatment with the `OPENCHEEKS // ANSI-SHADOW FLIGHT DECK // IMMACULATE` deck line across the startup TUI
- ocean-blue flight-deck styling is used across the cockpit, footer, task surfaces, and wiki/repo entry pages
- shark mascot animation now breaches through the waterline instead of acting as a static icon
- public docs and wiki now mirror the same branded banner treatment

## OpenCheek Agents and Task Deck

- multi-agent crew fan-out with Immaculate-paced burst budgeting
- deferred teammate launch queue with inspectable rows, detail dialogs, and operator controls
- coordinator, footer, and background-task surfaces now share one pressure vocabulary
- queued launches, retry pressure, approval pressure, and routed work are visible before they fail

## Agent Co-Work

- each active crew terminal now gets a unique `terminal_context_id`
- team files now keep a shared terminal registry so sibling agents can reuse known workspace, model, routed-Q, and Immaculate facts across related projects on the same machine
- spawned teammates now inherit OCI `Q` and Immaculate env wiring explicitly instead of rediscovering provider state in a fresh shell
- in-process teammates now honor their requested working directory too, so cross-project help stays aligned with the actual project being worked
- the team dialog and `/status` now surface the shared co-work registry, so operators can inspect terminal IDs, project roots, and registry receipts without opening raw config files
- resumed teammate sessions now rehydrate their saved terminal context IDs, which keeps co-work handoffs intact after reconnects or reloads
- co-work now writes a phase ledger too, so request summaries, teammate handoffs, and delivered outputs stay attached to the same work phase instead of disappearing between turns
- the shared registry is designed for same-owner co-work and path/runtime facts only; it is not a secret dump and does not write credentials into team memory

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

OpenJaws now also has a local `Q` comparison lane for real repo work:

- audited bundles now emit pack-ready `bundle-manifest.json` data for `all`, `coding`, `agentic`, `security`, and `general`
- `bun run q:bridgebench` runs eval-only local pack checks and writes Rewardkit-style `reward.json` receipts
- `bun run q:curriculum` runs bounded specialization passes and benchmarks those adapters back against the audited packs
- `bun run q:hybrid` coordinates one bounded local lane and one Immaculate-routed lane under one receipt
- `bun run q:terminalbench` adds a Harbor / Terminal-Bench adapter lane for external terminal-task evaluation
- `Q` training and benchmark receipts now record W&B readiness so live logging state is visible instead of guessed
- the Windows OCI bridge now stages larger payloads through temp files so `q:terminalbench --dry-run` can prove Harbor, Docker, and the local OCI-backed OpenJaws lane are actually ready instead of dying on argv length
- the repo now carries a scheduled `Q Benchmark Soak` GitHub workflow that emits sample benchmark, hybrid, and Terminal-Bench dry-run receipts as artifacts
- the local Discord `Q_agent` station now runs scheduled Immaculate-aware patrols, controlled room routing, and first-phase ElevenLabs speech attachments, with one shared receipt file surfaced back into `/status`
- that same private Discord lane now keeps a secret-safe local knowledge index and explicit operator-only OpenJaws actions under the same receipt, so operators can see both what Q knows locally and what it touched

This is useful for tuning and honest before/after comparison. It is not a replacement for the public Immaculate benchmark source or a fake Harbor / Terminal-Bench leaderboard claim.

This pass also tightens the public `Q` runtime story:

- OCI-backed `Q` one-shot surfaces now share a single OCI bridge path for both bearer-key and internal IAM auth
- `/provider test oci Q` now targets the OCI responses lane instead of pretending OCI is a generic `/models` endpoint
- the docs now separate downloaded public installs, internal IAM operator surfaces, and any future hosted paid-`Q` service boundary more explicitly
- the repo now includes a Netlify-ready Next.js `website/` surface for public Q signup, plans, Stripe checkout, API keys, credits, and usage UI
- that website lane can exercise a local filesystem-backed hosted-Q demo flow during development while still failing closed in production when no real backend is attached
- `https://qline.site` is now the canonical public hosted-Q domain and serves valid HTTPS, with Stripe webhook traffic intended for `/api/webhooks/stripe`

## What Is Planned Next

- deeper off-host worker execution through Immaculate-visible capability assignment
- more release-safe installed-user update paths without breaking local source workflows
- broader live walkthrough coverage for operator surfaces beyond settings and deferred launch controls
- continued tightening of compatibility shims where it is safe and does not break provider contracts
