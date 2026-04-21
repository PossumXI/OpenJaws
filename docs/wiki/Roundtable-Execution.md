# Roundtable Execution

The Discord roundtable now has a tracked execution lane instead of stopping at planning text.

## What It Does

- Immaculate or an operator can stage governed handoff JSON files into `local-command-station/roundtable-runtime/handoffs/`.
- OpenJaws ingests those handoffs into a persisted queue at `local-command-station/roundtable-runtime/discord-roundtable-queue.state.json`.
- Malformed or non-JSON handoffs now fail closed into `local-command-station/roundtable-runtime/handoff-quarantine/` with a sidecar metadata receipt, so the runtime keeps processing later valid work instead of aborting the whole pass.
- Live roundtable session metadata now belongs in `local-command-station/roundtable-runtime/discord-roundtable.session.json` instead of being mixed into the tracked queue file.
- Each queued action runs through the same isolated worktree path as the direct Discord operator lane.
- Verified code-bearing branches move into the existing approval queue in `local-command-station/openjaws-operator-state.json`.
- Nothing is pushed automatically.

## Safety Rules

- Execution is limited to approved roots.
- Every job is materialized in an isolated worktree.
- Mixed code-plus-artifact output is held back and never promoted into the approval lane.
- Artifact-only output is held back and never promoted into the approval lane.
- Verification must pass before a branch is eligible for approval.
- Fallback root scoring, approval TTL resolution, and reply/PASS inspection live in tracked shared scheduler code so the private Discord loop does not have to carry its own drifting policy copy.
- Repo-root handoffs are narrowed onto a preferred code-bearing path such as `src`, `apps`, or `packages` before the tracked worktree lane materializes the job, so the queue stops defaulting to whole-repo no-diff audits when a planner only names the project root.

## Operator Commands

- Start the runtime once: `bun run roundtable:runtime -- --allow-root "C:\Users\Knight\Desktop\Immaculate" --allow-root "C:\Users\Knight\Desktop\cheeks\Asgard"`
- Run it continuously: `bun run roundtable:runtime -- --loop --allow-root "C:\Users\Knight\Desktop\Immaculate" --allow-root "C:\Users\Knight\Desktop\cheeks\Asgard"`
- Override the 4-hour window or approval TTL when you need a tighter operator pass: `bun run roundtable:runtime -- --duration-hours 2 --approval-ttl-hours 0.5`
- Inspect state: `bun run roundtable:runtime`
- Inspect state from Discord: `@Q operator roundtable-status`
- Approve a generated branch after review: `@Q operator confirm-push <job-id-or-branch>`

## Runtime Notes

- `src/utils/discordRoundtableScheduler.ts` is the tracked policy source for fallback root selection, approval TTL, and reply/PASS reduction heuristics.
- `scripts/roundtable-runtime.ts` is the tracked CLI wrapper around the shared runtime path.
- The tracked CLI now resolves the repo root from the script location instead of ambient `cwd`, so it stops writing queue/session state into accidental nested station directories.
- The tracked CLI now targets `local-command-station/run-openjaws-visible.ps1` for bounded prompt jobs; `launch-openjaws-visible.ps1` stays reserved for interactive visible shell launches.
- The tracked CLI hard-fails if the roundtable model is anything other than `oci:Q`, and it no longer falls back to a generic `Q_AGENT_MODEL` override.
- the CLI now prints both the tracked queue path and the live session path explicitly so operator reads do not silently point at the wrong file after the queue/session split.
- The live Discord runtime now posts roundtable transition receipts back into the configured `q-roundtable` lane, with a fallback to `openjaws-updates` if the dedicated roundtable channel is not present yet.
- The tracked runtime readers now reconcile both the live `discord-roundtable.log` and the split session metadata, so `@Q operator roundtable-status` and `bun run runtime:coherence` show the actual active lane such as `#dev_support` when older persisted files drift from the bound Discord channel.
- When the private lane falls back to `discord-roundtable.bundle.js`, the live session/log can land under `local-command-station/roundtable-runtime/roundtable-runtime/`; the tracked readers now treat that nested bundle output as an observed live session instead of trusting stale top-level files.
- Approval-ready transitions include the generated branch, verification summary, and attached `receipt.json` so operators can confirm from Discord without opening the local state file first.
- `runtime:coherence` now reads the tracked queue state plus the live session snapshot together, so it can warn when a roundtable window has expired or when the live session has stopped updating even if the queue file still says `running`.
- The queue is repo-scoped on purpose. It does not stack multiple active roundtable jobs onto the same project lane at once.
- Legacy mixed state files are still read as a fallback for live session metadata, but they no longer pollute the tracked queue schema on load.

## Discord Agent Pass

- Viola now recognizes `Viola`, the configured voice persona name, and legacy `Q`/`Q agent` address cues instead of only the older hardcoded wake words.
- When the latest utterance is mostly the bot name plus heavy background noise, Viola falls back to the last unresolved logical request instead of discarding the turn.
- Voice replies start speaking before the optional channel-text artifact is generated, so “say it and post it in chat” no longer blocks on the second text-generation pass.
- Blackbeak meme planning now keeps a short recent-topic memory, stays inside AI accountability / defense / aerospace / exploration / robotics themes, uses fresh web context, and falls back cleanly to text when Gemini media is blocked or fails.
