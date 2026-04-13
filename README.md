# OpenJaws

OpenJaws is an open-source terminal coding cockpit with a branded flight-deck TUI, OpenCheek agents, routed tool orchestration, and Immaculate-backed control loops for local and remote execution.

Built and attributed to [PossumX.dev](https://possumx.dev).

```text
OPENJAWS // OPENCHEEKS // FLIGHT DECK
   /VVV VVV\
  >|       |<
   \^^^ ^^^/
```

## Start Here

- [Wiki Home](docs/wiki/Home.md)
- [Features and Capabilities](docs/wiki/Features-and-Capabilities.md)
- [Immaculate Integration](docs/wiki/Immaculate-Integration.md)
- [Benchmark Status](docs/wiki/Benchmark-Status.md)
- [Roadmap](docs/wiki/Roadmap.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)

## What OpenJaws Does

- Runs coding sessions directly in the terminal with a modern TUI and persistent status surfaces.
- Uses OpenCheek agents for parallel background work, queued supervision, and inspectable crew coordination.
- Routes models, tools, retries, and remote worker decisions through the Immaculate orchestration layer.
- Supports local and remote model execution, including signed Gemma 4 training routes and worker assignment.
- Exposes practical operator surfaces: `/status`, `/immaculate`, `/provider`, `/voice`, `/remote-env`, and background task inspection.
- Includes built-in skills and dataset flows such as Firecrawl web dataset generation and Gemma SFT export/prep/training harnesses.

## Quick Start

```powershell
bun install
bun test
bun run build
bun run build:native
openjaws
```

Windows launcher:

```powershell
.\openjaws.bat --help
```

Release verification:

```powershell
bun run verify:release
```

## Core Capabilities

- Flight-deck TUI with compact receipts, task inspection, and crew-pressure summaries.
- OpenCheek agent orchestration with deferred launch queueing, burst budgets, and Immaculate pacing.
- Tool execution across local shells, PowerShell, files, web fetch, MCP, skills, and remote workers.
- Gemma 4 local and routed training harness with signed manifests, queue state, remote dispatch, and completion reconciliation.
- Voice surfaces for speech input/output wiring, including ElevenLabs summary playback configuration.
- Firecrawl dataset skill for crawl/search -> structured dataset pipelines.
- Remote Control, environment validation, startup harness receipts, and fail-closed configuration checks.

## Immaculate Integration

OpenJaws treats Immaculate as the orchestration core rather than an optional add-on.

- Per-turn checkpoints are injected into query context.
- Agent spawn, resume, burst pacing, and deferred release decisions are shaped by live Immaculate state.
- Gemma route assignment, worker capability registry, remote dispatch, and result reconciliation are all surfaced through the same harness.
- `/immaculate` exposes live topology, control pulses, execution pressure, and worker health.

Details:

- [Wiki Home](docs/wiki/Home.md)
- [Immaculate Integration](docs/wiki/Immaculate-Integration.md)
- [Features and Capabilities](docs/wiki/Features-and-Capabilities.md)
- [Benchmark Status](docs/wiki/Benchmark-Status.md)
- [Roadmap](docs/wiki/Roadmap.md)
- [Breakthrough Log](docs/wiki/Breakthrough-Log.md)

## Benchmark Snapshot

The current benchmark story is grounded in live Immaculate runs, not placeholder targets.

- 60-minute soak run:
  https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/5dnpoes7
- 60-second benchmark run:
  https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/wm8wf7bf

Headline soak metrics from commit `b7a571f` in Immaculate:

- Throughput: `1270.73 events/s`
- Reflex latency: `P50 17.46 ms`, `P95 17.86 ms`, `P99 17.94 ms`
- Cognitive latency: `P50 50.50 ms`, `P95 57.04 ms`, `P99 58.32 ms`
- Recovery: `checkpoint`
- Integrity: `verified`
- Failed assertions: `0`

See [Benchmark Status](docs/wiki/Benchmark-Status.md) for the detailed record and why those numbers matter to OpenJaws.

## Security and Release Hygiene

- MIT licensed.
- Public-release docs and contribution policy are included in this repo.
- Generated artifacts, logs, local runtime state, datasets, and env files are excluded from version control.
- GitHub workflow scaffolding is provided for CI, system verification, CodeQL, dependency review, and optional GitGuardian scanning when configured.

Start here:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)

## Project Status

This repo is being prepared as a clean public release with no private history, no telemetry defaults, and no embedded secrets. The current working direction is:

- stronger operator-visible orchestration
- cleaner public documentation
- fail-closed remote execution
- reproducible verification before release and before every tagged build
