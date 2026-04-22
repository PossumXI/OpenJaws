# Changelog

## 2.1.88 - 2026-04-22

- The bounded public showcase feed now aggregates `Q`, `Viola`, `Blackbeak`, roundtable runtime, sanitized Immaculate actionability summaries, and typed trace summaries into one mirrored overlay, which gives the Arobi public showcase lane a current operator/activity snapshot without exposing private control receipts.
- OpenJaws now mirrors that bounded overlay into `docs/wiki/Public-Showcase-Activity.json`, so other repos and public surfaces can consume the same public-safe snapshot without scraping local runtime files directly.
- `/apex` and `/status` now consume the shared Apex tenant-governance summary through session-ingress auth, which keeps governed operator action visibility aligned across the TUI and the protected Apex operator surfaces.

## 2.1.87 - 2026-04-22

- Roundtable repo-root jobs now narrow onto deeper code-bearing paths like `src/utils`, `src/commands`, and `apps/harness/src` before they enter the autonomous worktree lane, which reduces broad repo passes and improves mergeability.
- The active private roundtable lane now carries the tracked bootstrap script locally and the child launcher resolves it explicitly, so Discord roundtable restarts stop failing when the private repo drifts behind `origin/main`.

## 2.1.86 - 2026-04-21

- Added a tracked public showcase activity feed builder plus `showcase:activity:sync`, so bounded Q/Discord/roundtable/runtime snippets can be projected onto the public Arobi showcase lane without exposing raw 00 traces or private control routes.
- Taught the tracked Discord Q receipt and roundtable runtime writers to emit sanitized public-safe operator/runtime activity entries, which keeps the Aura Genesis showcase aligned with the real supervised OpenJaws lane instead of a hand-maintained summary.
- `/status` now surfaces the same bounded operator line the public showcase uses, so local operators and the public-safe audit lane stop drifting on what Q is actually doing.
- Preserved the authoritative live roundtable channel across sync passes, so stale caller or stored aliases no longer overwrite the bound Discord lane in tracked queue/session state.
- Quarantine malformed roundtable handoffs fail-closed into `local-command-station/roundtable-runtime/handoff-quarantine/` without aborting later valid governed work.
- Tightened roundtable holdback classification so no-diff outcomes are marked `skipped`, not `completed`, and recent weak outcomes keep contribution forcing active longer.
- Hardened the tracked Discord roundtable/runtime surfaces so approval-ready, skipped, and rejected autonomous jobs are visible from shared operator state instead of only private logs.
- Tightened autonomous branch mergeability gates so mixed code-plus-artifact outputs fail closed before they reach approval.
- Added live runtime coherence auditing across Immaculate, Q, Discord receipts, and roundtable state.
- Taught the tracked roundtable/runtime readers to reconcile the live Discord log when the persisted session file drifts, so `runtime:coherence` and `roundtable-status` reflect the actual bound channel and latest approval summary.
- Replaced the Windows-fragile Bun glob scan in the Q trace reader with a fail-closed filesystem walk, so `runtime:coherence` can read nested benchmark traces without crashing on bad artifact paths.
- Split tracked roundtable queue state from live roundtable session metadata, with a legacy fallback reader so mixed old session files stop polluting the tracked queue contract.
- Fixed the live roundtable log classifier so `executing queued action` now stays `running` instead of being misread as merely `queued`, which keeps the governed session snapshot honest during active autonomous work.
- Hardened TerminalBench and repeated TerminalBench snapshot selection so newer partial artifacts no longer override older complete public receipts in the generated website benchmark data.
- Taught the tracked roundtable readers to detect the nested `roundtable-runtime/roundtable-runtime` bundle fallback output, so runtime/coherence/status surfaces keep following the live Discord lane instead of stale top-level session files.
- Re-rooted the tracked roundtable CLI on the repo path, pointed it at the bounded `run-openjaws-visible.ps1` prompt runner, and hard-failed standalone launches that drift off the required `oci:Q` model pin.
- Repo-root roundtable handoffs now narrow themselves onto a concrete code path before they enter the tracked worktree/approval lane, and the tracked CLI no longer honors a generic `Q_AGENT_MODEL` fallback that could drift the roundtable off the Discord Q pin.
- Malformed roundtable handoffs now fail closed into `local-command-station/roundtable-runtime/handoff-quarantine/` with a metadata receipt, so one bad non-JSON payload no longer aborts the entire tracked runtime pass.
- Added a tracked `roundtable-bootstrap` lane that rewrites fresh live session metadata from the canonical queue/session model before the private bundled runtime starts, clears stale nested bundle logs/state, and stops the Discord loop from reusing an already-completed window on restart.
- Added a tracked `roundtable-sync` sidecar that mirrors the bundled private live session back into the canonical queue/session files every cycle, so `roundtable-status`, approvals, and runtime coherence stay aligned with the actual `#dev_support` lane after startup.
- Tightened roundtable contribution forcing so recent no-diff, mixed-output, or receipt-only runs no longer count as real progress; the scheduler now keeps pushing toward a scoped code-bearing commit before it relaxes into `PASS`.
- The `dce-require-paths` release-gate test now uses a git-backed grep on Windows instead of a slower scan path that could time out under scripts coverage.
- Aged completed Immaculate and Q traces into `stale` after a freshness window, and taught `runtime:coherence` to warn on stale Discord receipts, stale patrol cadence, and expired roundtable windows instead of treating them as current by default.
- Sanitized the public benchmark snapshot source line so release surfaces stop leaking local absolute receipt paths while still documenting that BridgeBench, soak, TerminalBench, and W&B receipts back the published claims.
- Kept the public benchmark and release surfaces aligned with real receipts, typed traces, and signed benchmark artifacts.
