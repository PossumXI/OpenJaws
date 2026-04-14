# OpenJaws Wiki

OpenJaws is a terminal-first coding cockpit with OpenCheek agents and Immaculate orchestration at the center of execution, routing, and operator visibility.

Built and maintained by [PossumX.dev](https://possumx.dev).

```text
  ___   ___  ___ _  _
 / _ \ | _ \| __| \| |
| (_) ||  _/| _|| .` |
 \___/ |_|  |___|_|\_|
    _   ___ __      __ ___
   | | / / |\ \    / // __|
   | |/ /| | \ \/\/ / \__ \
   |___/ |_|  \_/\_/  |___/

OPENCHEEKS // FLIGHT DECK // IMMACULATE
   /VVV VVV\
  >|       |<
   \^^^ ^^^/
```

GitHub and the repo wiki render the banner as monochrome ASCII. The live OpenJaws TUI renders the same banner with ocean-blue gradient styling and darker deck trim.

OpenJaws ships as an ocean-deck terminal cockpit: blue-water TUI surfaces, OpenCheek agents, explicit operator receipts, and Immaculate orchestration at the center of routing and execution.

## Start Here

- [Install and Updates](Install-and-Updates.md)
- [Q and OCI Setup](Q-and-OCI-Setup.md)
- [Release and Update Policy](Release-and-Update-Policy.md)
- [Features and Capabilities](Features-and-Capabilities.md)
- [Immaculate Integration](Immaculate-Integration.md)
- [Benchmark Status](Benchmark-Status.md)
- [Release Notes](Release-Notes.md)
- [Roadmap](Roadmap.md)
- [Breakthrough Log](Breakthrough-Log.md)

## Glossary

- `OpenCheek agents`: OpenJaws background workers for research, implementation, verification, and queued teammate execution.
- `Immaculate`: the orchestration layer that shapes routing, pacing, retries, worker assignment, and remote execution policy.
- `Q routes`: signed training/execution bundles used to move `Q` fine-tune work through queue, worker assignment, remote dispatch, and result reconciliation.

## Current Release Themes

- branded flight-deck TUI
- OCI/Q as the public default runtime path
- inspectable background crews and deferred launch queueing
- fail-closed `Q` route assignment and remote dispatch
- worker capability registry and heartbeat-backed health
- public-release security and verification scaffolding
- explicit provider and orchestration visibility for installed users

## Live Benchmark Record

Immaculate is not an aspirational dependency here. The current public benchmark story is backed by live W&B runs and a repo-documented benchmark snapshot:

- 60-minute soak with verified integrity and checkpointed recovery
- 60-second benchmark snapshot from a live Immaculate run
- operator-facing explanation of how those numbers affect OpenJaws routing, pacing, retries, and remote execution

## Public Release Notes

- OpenJaws is public and MIT licensed, but the project is still moving quickly.
- Prefer official repository builds and published tags over third-party mirrors.
- Tagged installed releases advance from the official `release-policy.json`, not directly from every `main` push.
- Treat `/status` as the source of truth for what is actually active: provider, runtime, sandbox, routed work, and worker health.
- Use `/provider` and `/remote-env` deliberately. OpenJaws is designed to reduce silent fallbacks, not hide them.
- Fresh installs default to `OCI:Q`; use `/provider` when you want to rotate keys, change the base URL, or switch providers entirely.

## Install Paths

### Tagged Release Install

Use this path when you installed a published OpenJaws binary from GitHub Releases.

- update with `openjaws update`
- stay on the public stable lane with `openjaws install stable`
- verify the running binary with `openjaws --version`
- inspect the live runtime with `/status`

### Build From Source

1. Install dependencies with `bun install`.
2. Build the native launcher with `bun run build:native`.
3. Start OpenJaws from the clone with `.\openjaws.bat` on Windows or `./openjaws.sh` on macOS/Linux.
4. After a tagged install or PATH setup, use `openjaws`.
5. If you are staying on the default runtime, set your key with `/provider key oci <api-key>` or `Q_API_KEY`.
6. Run `/provider` if you want a different provider/model or need to rotate keys/base URL.
7. Run `/status` to confirm the active wiring.
8. Use `/immaculate` to inspect the orchestration layer behind routing, agents, and remote execution.

### Follow `main` / Contribute

Use this path when you intentionally track active development from the repo.

- `git pull --ff-only`
- `bun install`
- `bun run build:native`
- verify with `.\openjaws.bat --version` on Windows or `./openjaws.sh --version` on macOS/Linux

## Installed User Path

If you are following active development from source:

1. `git pull --ff-only`
2. `bun install`
3. `bun run build:native`
4. `.\openjaws.bat --version` on Windows or `./openjaws.sh --version` on macOS/Linux
5. Relaunch and verify with `/status`

See [Install and Updates](Install-and-Updates.md) for the safe update flow, first-run checklist, provider switching guidance, and recovery lane. See [Release and Update Policy](Release-and-Update-Policy.md) for the official public trust boundary.
