# Roundtable Execution

The Discord roundtable now has a tracked execution lane instead of stopping at planning text.

## What It Does

- Immaculate or an operator can stage governed handoff JSON files into `local-command-station/roundtable-runtime/handoffs/`.
- OpenJaws ingests those handoffs into a persisted queue at `local-command-station/roundtable-runtime/discord-roundtable-queue.state.json`, with a compatibility mirror in `discord-roundtable.state.json` so older local tooling does not lose the queue on upgrade.
- Malformed or non-JSON handoffs now fail closed into `local-command-station/roundtable-runtime/handoff-quarantine/` with a sidecar metadata receipt, so the runtime keeps processing later valid work instead of aborting the whole pass.
- Live roundtable session metadata now belongs in `local-command-station/roundtable-runtime/discord-roundtable.session.json` instead of being mixed into the tracked queue file.
- The live receipt/state writers now also keep a bounded public showcase overlay current in `.arobi-public/showcase-activity.json`, with a mirrored copy in `docs/wiki/Public-Showcase-Activity.json`.
- Each queued action runs through the same isolated worktree path as the direct Discord operator lane.
- Verified code-bearing branches move into the existing approval queue in `local-command-station/openjaws-operator-state.json`.
- Nothing is pushed automatically.

## Safety Rules

- Execution is limited to approved roots.
- Read-only context can widen beyond the write roots for operator awareness, but autonomous writes stay constrained to git-backed approved roots and isolated worktrees only.
- Every job is materialized in an isolated worktree.
- Malformed governed handoffs fail closed into `local-command-station/roundtable-runtime/handoff-quarantine/` instead of aborting the runtime.
- Mixed code-plus-artifact output is held back and never promoted into the approval lane.
- Artifact-only output is held back and never promoted into the approval lane.
- No-diff output is marked `skipped` and kept out of the approval lane.
- Verification must pass before a branch is eligible for approval.
- Fallback root scoring, approval TTL resolution, and reply/PASS inspection live in tracked shared scheduler code so the private Discord loop does not have to carry its own drifting policy copy.
- The fallback planner only selects roots that can materialize an isolated git worktree inside the approved root. If an approved path resolves to an ancestor checkout outside that path, the planner skips it instead of staging a handoff that the governed worktree lane will reject.
- Repo-root handoffs are narrowed onto a preferred code-bearing path such as `src/utils`, `src/commands`, `apps/harness/src`, or `apps/dashboard/app` before the tracked worktree lane materializes the job, so the queue stops defaulting to whole-repo no-diff audits when a planner only names the project root.
- Recent weak outcomes keep contribution forcing active, so one early diff-bearing action does not immediately let the loop relax back into PASS turns.

## Operator Commands

- Start the runtime once: `bun run roundtable:runtime -- --allow-root "C:\Users\Knight\Desktop\Immaculate" --allow-root "C:\Users\Knight\Desktop\cheeks\Asgard"`
- Run it continuously: `bun run roundtable:runtime -- --loop --allow-root "C:\Users\Knight\Desktop\Immaculate" --allow-root "C:\Users\Knight\Desktop\cheeks\Asgard"`
- Override the 4-hour window or approval TTL when you need a tighter operator pass: `bun run roundtable:runtime -- --duration-hours 2 --approval-ttl-hours 0.5`
- Reset the live Discord session cleanly before a bundled/private restart: `bun scripts/roundtable-bootstrap.ts --channel dev_support --duration-hours 4`
- Keep the tracked queue/session truth synchronized with the bundled private lane: `bun scripts/roundtable-sync.ts --follow --interval-seconds 15`
- Inspect state: `bun run roundtable:runtime`
- Inspect state from Discord: `@Q operator roundtable-status`
- Approve a generated branch after review: `@Q operator confirm-push <job-id>`

## Runtime Notes

- `src/utils/discordRoundtableScheduler.ts` is the tracked policy source for fallback root selection, approval TTL, and reply/PASS reduction heuristics.
- On 2026-04-30, the live Asgard parent path `D:\cheeks\Asgard` resolved to the ancestor Git root `D:\` because `D:\cheeks\Asgard\.git` was absent and `D:\.git` existed. Keep Asgard available as read/knowledge context, but autonomous roundtable writes must target a specific git-backed Asgard child checkout or another approved root whose Git root is inside the approved path.
- `scripts/roundtable-runtime.ts` is the tracked CLI wrapper around the shared runtime path.
- The tracked CLI now resolves the repo root from the script location instead of ambient `cwd`, so it stops writing queue/session state into accidental nested station directories.
- The tracked CLI now targets `local-command-station/run-openjaws-visible.ps1` for bounded prompt jobs; `launch-openjaws-visible.ps1` stays reserved for interactive visible shell launches.
- The tracked CLI hard-fails if the roundtable model is anything other than `oci:Q`, and it no longer falls back to a generic `Q_AGENT_MODEL` override.
- `scripts/roundtable-bootstrap.ts` now owns the live session reset contract, so a private restart rebuilds `discord-roundtable.session.json` from the tracked queue/session model, rotates stale nested bundle logs, and rewrites the bundled fallback state under `roundtable-runtime/roundtable-runtime/` before the child starts posting again.
- The active private repo now carries that same tracked bootstrap script locally, and the child launcher resolves it explicitly before startup so restart paths do not silently break when the private lane drifts behind `origin/main`.
- `scripts/roundtable-sync.ts` is now the tracked steady-state sidecar for the bundled private lane; it mirrors the nested live bundle session back into `discord-roundtable-queue.state.json` and `discord-roundtable.session.json` every cycle so status, approvals, and coherence stop drifting after startup.
- `src/utils/discordRoundtableSteadyState.ts` now owns that shared steady-state pass, so the tracked sync CLI and any future private launcher can reuse one queue/session/planner projection instead of growing a second script-local logic copy.
- That tracked sync sidecar now also stages one scoped synthetic follow-through handoff when the live roundtable is still running but the tracked queue is idle and recent turns have collapsed into `PASS`, so the governed execution lane can recover into a bounded code-bearing action without reopening broad repo-root audits.
- The tracked `src/utils/publicShowcaseActivity.ts` module now turns bounded Discord persona receipts, roundtable state, actionability summaries, and trace summaries into a public-safe showcase feed, so the public Arobi status lane can demonstrate supervised operator activity without exposing private control routes.
- the CLI now prints both the tracked queue path and the live session path explicitly so operator reads do not silently point at the wrong file after the queue/session split.
- The live Discord runtime now posts roundtable transition receipts back into the configured `q-roundtable` lane, with a fallback to `openjaws-updates` if the dedicated roundtable channel is not present yet.
- The tracked runtime readers now reconcile both the live `discord-roundtable.log` and the split session metadata, so `@Q operator roundtable-status` and `bun run runtime:coherence` show the actual active lane such as `#dev_support` when older persisted files drift from the bound Discord channel.
- When the private lane falls back to `discord-roundtable.bundle.js`, the live session/log can land under `local-command-station/roundtable-runtime/roundtable-runtime/`; the tracked readers now treat that nested bundle output as an observed live session instead of trusting stale top-level files.
- When multiple live log candidates exist, the tracked readers rank `discord-roundtable-*.stdout.log` files by the embedded UTC stamp first, then filesystem `mtime`, before falling back to the top-level `discord-roundtable.log`; that keeps CI/filesystem timestamp ties from reviving a stale alias lane.
- Fresh sessions now keep forcing contribution until the recent queue history contains a diff-bearing completed commit, so no-diff or rejected audit receipts no longer let the planner relax into idle `PASS` turns too early.
- Sync passes now preserve the authoritative bound session channel, so `@Q operator roundtable-status` and `bun run runtime:coherence` keep reporting the actual active lane such as `#dev_support` instead of a stale preferred-channel alias.
- Approval-ready transitions include the exact `jobId`, generated branch, verification summary, and attached `receipt.json` so operators can confirm from Discord without guessing which pending branch is newest.
- `runtime:coherence` now reads the tracked queue state plus the live session snapshot together, so it can warn when a roundtable window has expired or when the live session has stopped updating even if the queue file still says `running`.
- The queue is repo-scoped on purpose. It does not stack multiple active roundtable jobs onto the same project lane at once.
- Queue keys are path-scoped on purpose as well, so agents working the same repo do not duplicate the same `src`/`apps` lane while another approval or execution is already active there.
- Legacy mixed state files are still read as a fallback for live session metadata, but they no longer pollute the tracked queue schema on load.

## Discord Agent Pass

- Viola now recognizes `Viola`, the configured voice persona name, and legacy `Q`/`Q agent` address cues instead of only the older hardcoded wake words.
- When the latest utterance is mostly the bot name plus heavy background noise, Viola falls back to the last unresolved logical request instead of discarding the turn.
- Voice replies start speaking before the optional channel-text artifact is generated, so “say it and post it in chat” no longer blocks on the second text-generation pass.
- Blackbeak meme planning now keeps a short recent-topic memory, stays inside AI accountability / defense / aerospace / exploration / robotics themes, uses fresh web context, and falls back cleanly to text when Gemini media is blocked or fails.
