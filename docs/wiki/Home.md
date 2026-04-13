# OpenJaws Wiki

OpenJaws is a terminal-first coding cockpit with OpenCheek agents and Immaculate orchestration at the center of execution, routing, and operator visibility.

Built and maintained by [PossumX.dev](https://possumx.dev).

## Start Here

- [Install and Updates](Install-and-Updates.md)
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
- explicit provider and orchestration visibility for installed users

## Public Release Notes

- OpenJaws is public and MIT licensed, but the project is still moving quickly.
- Prefer official repository builds and published tags over third-party mirrors.
- Treat `/status` as the source of truth for what is actually active: provider, runtime, sandbox, routed work, and worker health.
- Use `/provider` and `/remote-env` deliberately. OpenJaws is designed to reduce silent fallbacks, not hide them.

## New User Path

1. Install dependencies with `bun install`.
2. Build the native launcher with `bun run build:native`.
3. Start OpenJaws from the clone with `.\openjaws.bat` on Windows or `./openjaws.sh` on macOS/Linux.
4. After a tagged install or PATH setup, use `openjaws`.
5. Run `/login` if your selected provider needs account auth.
6. Run `/provider` and choose your provider/model.
7. Run `/status` to confirm the active wiring.
8. Use `/immaculate` to inspect the orchestration layer behind routing, agents, and remote execution.

## Installed User Path

If you are following active development from source:

1. `git pull --ff-only`
2. `bun install`
3. `bun run build:native`
4. `.\openjaws.bat --version` on Windows or `./openjaws.sh --version` on macOS/Linux
5. Relaunch and verify with `/status`

See [Install and Updates](Install-and-Updates.md) for the safe update flow, first-run checklist, and provider switching guidance.
