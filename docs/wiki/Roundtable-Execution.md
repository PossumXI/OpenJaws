# Roundtable Execution

The Discord roundtable now has a tracked execution lane instead of stopping at planning text.

## What It Does

- Immaculate or an operator can stage governed handoff JSON files into `local-command-station/roundtable-runtime/handoffs/`.
- OpenJaws ingests those handoffs into a persisted queue at `local-command-station/roundtable-runtime/discord-roundtable.state.json`.
- Each queued action runs through the same isolated worktree path as the direct Discord operator lane.
- Verified code-bearing branches move into the existing approval queue in `local-command-station/openjaws-operator-state.json`.
- Nothing is pushed automatically.

## Safety Rules

- Execution is limited to approved roots.
- Every job is materialized in an isolated worktree.
- Malformed governed handoffs fail closed into `local-command-station/roundtable-runtime/handoff-quarantine/` instead of aborting the runtime.
- Mixed code-plus-artifact output is held back and never promoted into the approval lane.
- Artifact-only output is held back and never promoted into the approval lane.
- No-diff output is marked `skipped` and kept out of the approval lane.
- Verification must pass before a branch is eligible for approval.
- Fallback root scoring, approval TTL resolution, and reply/PASS inspection live in tracked shared scheduler code so the private Discord loop does not have to carry its own drifting policy copy.
- Recent weak outcomes keep contribution forcing active, so one early diff-bearing action does not immediately let the loop relax back into PASS turns.

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
- The live Discord runtime now posts roundtable transition receipts back into the configured `q-roundtable` lane, with a fallback to `openjaws-updates` if the dedicated roundtable channel is not present yet.
- The tracked runtime readers now also reconcile the live `discord-roundtable.log`, and sync passes preserve the authoritative bound session channel, so `@Q operator roundtable-status` and `bun run runtime:coherence` keep reporting the actual active lane such as `#dev_support` instead of a stale preferred-channel alias.
- Approval-ready transitions include the generated branch, verification summary, and attached `receipt.json` so operators can confirm from Discord without opening the local state file first.
- `runtime:coherence` reads the roundtable state file directly, so coherence checks can see whether the lane is idle, queued, running, or waiting for approval.
- The queue is repo-scoped on purpose. It does not stack multiple active roundtable jobs onto the same project lane at once.

## Discord Agent Pass

- Viola now recognizes `Viola`, the configured voice persona name, and legacy `Q`/`Q agent` address cues instead of only the older hardcoded wake words.
- When the latest utterance is mostly the bot name plus heavy background noise, Viola falls back to the last unresolved logical request instead of discarding the turn.
- Voice replies start speaking before the optional channel-text artifact is generated, so “say it and post it in chat” no longer blocks on the second text-generation pass.
- Blackbeak meme planning now keeps a short recent-topic memory, stays inside AI accountability / defense / aerospace / exploration / robotics themes, uses fresh web context, and falls back cleanly to text when Gemini media is blocked or fails.
