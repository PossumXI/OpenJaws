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
- [Install and Updates](docs/wiki/Install-and-Updates.md)
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
bun run build:native
```

Start from the cloned repo:

```powershell
.\openjaws.bat --help
```

```bash
./openjaws.sh
```

Release verification:

```powershell
bun run verify:release
```

Hosted GitHub verification:

```powershell
bun run verify:public
```

## Release Model

OpenJaws is currently a fast-moving public project with source builds and native local builds. Treat `main` as active development. If you want the newest work, pull from the official repository and rebuild locally. If you want a slower-moving install surface, prefer tagged releases when available.

Use only official sources:

- this repository
- tagged releases published from this repository
- documentation in `docs/wiki`

Do not install from reposted binaries, copy-pasted shell installers, or mirrors you cannot verify.

## Install and First Run

OpenJaws is currently distributed as source plus native local builds.

1. Install [Bun](https://bun.sh).
2. Clone this repo.
3. Run `bun install`.
4. Run `bun run build:native`.
5. Start the cockpit from the clone with `.\openjaws.bat` on Windows or `./openjaws.sh` on macOS/Linux.
6. Once you install a tagged release or set up your own PATH entry, use `openjaws`.

Useful first-run operator commands:

- `/login` to authenticate your selected provider or OpenJaws account flow
- `/provider` to choose provider/model wiring
- `/status` to inspect harness, route queue, worker health, and runtime wiring
- `/immaculate` to inspect live orchestration topology and control state
- `/chrome` and `/voice` to configure browser and speech surfaces when available

Fresh installs also get a first-run setup lane inside the TUI for provider/model selection, API-key wiring, and live Immaculate reachability checks before heavier work starts.

Recommended first-run checklist:

1. Start OpenJaws.
2. Run `/login` if your chosen provider requires account auth.
3. Run `/provider` and pick the provider/model you actually want to use.
4. Run `/status` and confirm runtime, sandbox, route queue, voice state, and provider wiring.
5. Run `/immaculate status` if you want to inspect orchestration state before heavy work.

## Provider Switching

OpenJaws is designed to make provider/model changes explicit instead of silently drifting between backends.

Safe operator flow:

1. Run `/provider`.
2. Select the provider and model you intend to use.
3. Run `/status`.
4. Confirm the active provider, model, runtime path, and any remote or routed execution state before starting work.

When switching execution strategy, use the matching controls:

- `/provider` for provider/model changes
- `/remote-env` for remote environment selection
- `/status` for final verification

## Safe Updates For Installed Users

If you are running from a cloned repository and tracking active development, update conservatively:

```powershell
git pull --ff-only
bun install
bun run build:native
openjaws --version
```

Then relaunch OpenJaws and verify the running session with `/status`.

If you are on a tagged native release, prefer the shipped updater path:

```powershell
openjaws update
```

or explicitly pin to the public stable lane:

```powershell
openjaws install stable
```

Additional guidance:

- close any running OpenJaws sessions before replacing binaries
- keep local secrets in your local config or secure storage, not in the repo
- review release notes or commit history before adopting fast-moving `main`
- public native updates are tag-gated and GitHub Release-backed so installed users do not get arbitrary `main` pushes
- current tagged native release assets are published for `win32-x64`, `linux-x64`, and `darwin-x64`; other platforms should build from source
- use `bun run verify:public` when you want the public-safe verification lane
- use `bun run verify:release` when preparing a release candidate or local ship pass

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
- `/status` and the flight-deck surfaces expose the same route and worker state to installed users, not just internal operators.

Details:

- [Wiki Home](docs/wiki/Home.md)
- [Install and Updates](docs/wiki/Install-and-Updates.md)
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
- benchmark source commit in Immaculate: `b7a571f`
- soak lane runtime: `April 12, 2026`, `3,600,967.49 ms`
- benchmark lane runtime: `April 12, 2026`, `61,098.97 ms`

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
- GitHub workflow scaffolding is provided for CI, hosted verification, CodeQL, dependency review, gitleaks, and optional GitGuardian scanning when configured with a repository secret.

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
