# Roundtable Dynamic Runtime Handoff - 2026-05-02

## Root Cause

The tracked roundtable planner could already recover from live Discord rounds that drifted into `PASS`, weak outcomes, or idle discussion by staging a scoped governed handoff. The production executor command did not call that planner. If only `bun run roundtable:runtime -- --loop` was running, the queue could stay synchronized and healthy while no new follow-through work was staged.

## Change

`scripts/roundtable-runtime.ts` now runs `runDiscordRoundtableSteadyStatePass` before each executable iteration. That pass synchronizes queue/session truth, asks the shared planner whether a follow-through handoff is needed, then lets the existing governed executor ingest and run the staged handoff in the same loop.

## Safety Boundary

- `--status-only` and `--max-actions 0` do not stage planner handoffs.
- Explicit `--handoff` execution does not mix with synthetic planner handoffs.
- `--no-dynamic-planner` disables the planner for debugging or manual drain passes.
- The planner still refuses active queues, pending inbox handoffs, recent governed actions, and roots that cannot materialize an isolated worktree inside the approved root.

## Verification

Run the focused checks after editing this path:

```powershell
bun test scripts/roundtable-runtime.test.ts src/utils/discordRoundtableSteadyState.test.ts src/utils/discordRoundtablePlanner.test.ts
bun run build
```
