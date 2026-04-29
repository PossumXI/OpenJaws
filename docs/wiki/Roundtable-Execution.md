# Roundtable Execution

The Discord roundtable now has a tracked execution lane instead of stopping at planning text.

## What It Does

- Immaculate or an operator can stage governed handoff JSON files into `local-command-station/roundtable-runtime/handoffs/`.
- The `handoffs/*.json` files are source inputs, not a pending-work list. Check `discord-roundtable-queue.state.json`, `@Q operator roundtable-status`, or `bun run runtime:coherence` before acting on old handoff files.
- OpenJaws ingests those handoffs into a persisted queue at `local-command-station/roundtable-runtime/discord-roundtable-queue.state.json`, with a compatibility mirror in `discord-roundtable.state.json`.
- The live Discord/Q runtime now also writes a sanitized public activity overlay to `.arobi-public/showcase-activity.json`; the shared reader aggregates bounded persona receipts from `local-command-station/bots/*/discord-agent-receipt.json`, and Asgard merges that into `fabric.showcase.activityFeed` instead of the raw public ledger panel.
- Each queued action runs through the same isolated worktree path as the direct Discord operator lane.
- Verified code-bearing branches move into the existing approval queue in `local-command-station/openjaws-operator-state.json`.
- If `local-command-station/openjaws-operator-state.json` is absent, treat it as an empty approval queue unless `pending-pushes` reports otherwise. Do not recreate it just because it is missing.
- Nothing is pushed automatically.

## Safety Rules

- Execution is limited to approved roots.
- Every job is materialized in an isolated worktree.
- Malformed governed handoffs fail closed into `local-command-station/roundtable-runtime/handoff-quarantine/` instead of aborting the runtime.
- Mixed code-plus-artifact output is held back and never promoted into the approval lane.
- Artifact-only output is held back and never promoted into the approval lane.
- No-diff output is marked `skipped` and kept out of the approval lane.
- The public showcase overlay stays redacted; raw ledger events, private paths, branch/worktree data, and operator-only receipts never cross into `.arobi-public/showcase-activity.json`.
- Verification must pass before a branch is eligible for approval.
- Fallback root scoring, approval TTL resolution, and reply/PASS inspection live in tracked shared scheduler code so the private Discord loop does not have to carry its own drifting policy copy.
- Recent weak outcomes keep contribution forcing active, so one early diff-bearing action does not immediately let the loop relax back into PASS turns.

## Operator Commands

- Start the runtime once: `bun run roundtable:runtime -- --allow-root "D:\openjaws\OpenJaws" --allow-root "C:\Users\Knight\Desktop\Immaculate" --allow-root "C:\Users\Knight\Desktop\cheeks\Asgard"`
- Start with the historical two-root example only when OpenJaws itself is not an approved target: `bun run roundtable:runtime -- --allow-root "C:\Users\Knight\Desktop\Immaculate" --allow-root "C:\Users\Knight\Desktop\cheeks\Asgard"`
- Run it continuously: `bun run roundtable:runtime -- --loop --allow-root "C:\Users\Knight\Desktop\Immaculate" --allow-root "C:\Users\Knight\Desktop\cheeks\Asgard"`
- The continuous runtime includes the steady-state planner by default, so an active Discord roundtable can create the next scoped follow-through handoff when the queue is idle. Use `--no-steady-state` only when you want to drain already-staged work without creating new work. For a one-shot planner pass, add `--steady-state`.
- Override the 4-hour window or approval TTL when you need a tighter operator pass: `bun run roundtable:runtime -- --duration-hours 2 --approval-ttl-hours 0.5`
- Inspect state: `bun run roundtable:runtime`
- Inspect state from Discord: `@Q operator roundtable-status`
- Approve a generated branch after review: `@Q operator confirm-push <job-id>`
- Manually refresh the public showcase overlay: `bun run showcase:activity:sync`

## Runtime Notes

- `src/utils/discordRoundtableScheduler.ts` is the tracked policy source for fallback root selection, approval TTL, and reply/PASS reduction heuristics.
- `scripts/roundtable-runtime.ts` is the tracked CLI wrapper around the shared runtime path.
- Runtime output now includes the progression bootstrap reason and the steady-state planner reason. If the loop does not create a new handoff, the reason will say whether it was blocked by active governed work, pending inbox work, cooldown, or low planner pressure; stale and expired sessions are reopened before planning.
- On Windows the runtime defaults isolated worktrees to a short root such as `D:\ojwt` so long vendor paths do not break governed checkout. Override with `DISCORD_OPERATOR_WORKTREE_ROOT` only when the replacement path is also short enough for deep repository trees.
- The live Discord runtime now posts roundtable transition receipts back into the configured `q-roundtable` lane, with a fallback to `openjaws-updates` if the dedicated roundtable channel is not present yet.
- The live Discord loop records planner outcomes into the operator receipt. Set `DISCORD_ROUNDTABLE_TRACE_PLANNER=1` to keep idle planner reasons in the local receipt without posting extra channel noise.
- The tracked runtime readers now also reconcile the live `discord-roundtable.log`, and sync passes preserve the authoritative bound session channel, so `@Q operator roundtable-status` and `bun run runtime:coherence` keep reporting the actual active lane such as `#dev_support` instead of a stale preferred-channel alias.
- Approval-ready transitions include the generated branch, verification summary, and attached `receipt.json` so operators can confirm from Discord without opening the local state file first.
- `runtime:coherence` reads the roundtable state file directly, so coherence checks can see whether the lane is idle, queued, running, or waiting for approval.
- `src/utils/publicShowcaseActivity.ts` is the shared bounded writer for the public showcase overlay. The live receipt/state writers and `scripts/discord-q-agent.ts` now queue background syncs there whenever a Discord persona, Q, or the roundtable moves.
- If `ASGARD_PUBLIC_SHOWCASE_LEDGER_SYNC_ENABLED=1` is set, the OpenJaws overlay writer can also call the hardened Asgard ledger bridge in `--auto` mode after the overlay write completes. That bridge is lock/cooldown/checkpoint-gated; direct raw Discord receipt posts are still disallowed.
- The queue is repo-scoped on purpose. It does not stack multiple active roundtable jobs onto the same project lane at once.

## Discord Agent Pass

- Viola now recognizes `Viola`, the configured voice persona name, and legacy `Q`/`Q agent` address cues instead of only the older hardcoded wake words.
- When the latest utterance is mostly the bot name plus heavy background noise, Viola falls back to the last unresolved logical request instead of discarding the turn.
- Voice replies start speaking before the optional channel-text artifact is generated, so “say it and post it in chat” no longer blocks on the second text-generation pass.
- Blackbeak meme planning now keeps a short recent-topic memory, stays inside AI accountability / defense / aerospace / exploration / robotics themes, uses fresh web context, and falls back cleanly to text when Gemini media is blocked or fails.
