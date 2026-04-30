# Roadmap

## Near-Term

- real Immaculate-side worker assignment policy for named off-host executors
- remote result streaming or continuous reconciliation in the worker loop
- tighter public-release help and recovery clarity across remaining operator surfaces
- Harbor / Terminal-Bench agent adapter work for running OpenJaws or `Q` against external benchmark suites with real provenance
- JAWS live update pipeline hardening: deeper native updater telemetry, signed manifest receipts, and release-index-driven release promotion
- JAWS Agent Watch streaming: promote the current native `artifacts/q-runs` snapshot into a live event stream with backpressure, cursor replay, and worker heartbeat deltas
- JAWS compliance launch surface: keep in-app Terms, final-sale policy wording, security notes, and developer verification commands aligned with counsel-reviewed public pages
- JAWS multiplayer foundation: signed websocket rooms for Hold'em PvP, world chat, pet presence, and sandboxed community agents
- broader contribution templates and issue triage
- public wiki synchronization from repo docs

## Mid-Term

- stronger OpenCheek swarm planning and release strategy
- deeper Firecrawl-to-dataset labeling flows
- richer benchmark snapshot surfacing from OpenJaws surfaces
- broader Harbor trace import and SFT export loops for `Q` tuning
- more reproducible remote worker provisioning and registration
- broader harness-backed benchmark export from OpenJaws into public operator surfaces

## Long-Term

- larger-scale model routing and orchestration through Immaculate
- cleaner cross-machine training and evaluation loops
- more operator-visible intelligence topology inside the TUI

## Current Release Blockers vs Future Work

Release-critical:

- clean public branding on all user-facing surfaces
- green local `verify:release`
- green hosted GitHub workflows
- no leaked secrets, runtime state, or generated artifacts

Future-facing:

- richer remote worker fleets
- larger benchmark snapshot sync loops
- deeper training and evaluation automation
