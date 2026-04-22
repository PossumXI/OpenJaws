# Changelog

## 2.1.86 - 2026-04-21

- Preserved the authoritative live roundtable channel across sync passes, so stale caller or stored aliases no longer overwrite the bound Discord lane in tracked queue/session state.
- Quarantine malformed roundtable handoffs fail-closed into `local-command-station/roundtable-runtime/handoff-quarantine/` without aborting later valid governed work.
- Tightened roundtable holdback classification so no-diff outcomes are marked `skipped`, not `completed`, and recent weak outcomes keep contribution forcing active longer.
- Hardened the tracked Discord roundtable/runtime surfaces so approval-ready, skipped, and rejected autonomous jobs are visible from shared operator state instead of only private logs.
- Tightened autonomous branch mergeability gates so mixed code-plus-artifact outputs fail closed before they reach approval.
- Added live runtime coherence auditing across Immaculate, Q, Discord receipts, and roundtable state.
- Taught the tracked roundtable/runtime readers to reconcile the live Discord log when the persisted session file drifts, so `runtime:coherence` and `roundtable-status` reflect the actual bound channel and latest approval summary.
- Replaced the Windows-fragile Bun glob scan in the Q trace reader with a fail-closed filesystem walk, so `runtime:coherence` can read nested benchmark traces without crashing on bad artifact paths.
- Kept the public benchmark and release surfaces aligned with real receipts, typed traces, and signed benchmark artifacts.
