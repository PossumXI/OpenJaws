# OpenJaws Wiki

OpenJaws is a terminal-first coding cockpit with OpenCheek agents and Immaculate orchestration at the center of execution, routing, and operator visibility.

Built and maintained by [PossumX.dev](https://possumx.dev).

## Start Here

- [Features and Capabilities](Features-and-Capabilities.md)
- [Immaculate Integration](Immaculate-Integration.md)
- [Benchmark Status](Benchmark-Status.md)
- [Roadmap](Roadmap.md)
- [Breakthrough Log](Breakthrough-Log.md)

## Glossary

- `OpenCheek agents`: OpenJaws background workers for research, implementation, verification, and queued teammate execution.
- `Immaculate`: the orchestration layer that shapes routing, pacing, retries, worker assignment, and remote execution policy.
- `Gemma routes`: signed training/execution bundles used to move Gemma fine-tune work through queue, worker assignment, remote dispatch, and result reconciliation.

## Current Release Themes

- branded flight-deck TUI
- inspectable background crews and deferred launch queueing
- fail-closed Gemma route assignment and remote dispatch
- worker capability registry and heartbeat-backed health
- public-release security and verification scaffolding

## New User Path

1. Install dependencies with `bun install`.
2. Build the native launcher with `bun run build:native`.
3. Start OpenJaws with `openjaws` or `.\openjaws.bat`.
4. Run `/login`, `/provider`, and `/status`.
5. Use `/immaculate` to inspect the live orchestration layer behind routing, agents, and remote execution.
