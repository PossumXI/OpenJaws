# Changelog

## 2.1.86 - 2026-04-21

- Hardened the tracked Discord roundtable/runtime surfaces so approval-ready, skipped, and rejected autonomous jobs are visible from shared operator state instead of only private logs.
- Tightened autonomous branch mergeability gates so mixed code-plus-artifact outputs fail closed before they reach approval.
- Added live runtime coherence auditing across Immaculate, Q, Discord receipts, and roundtable state.
- Taught the tracked roundtable/runtime readers to reconcile the live Discord log when the persisted session file drifts, so `runtime:coherence` and `roundtable-status` reflect the actual bound channel and latest approval summary.
- Replaced the Windows-fragile Bun glob scan in the Q trace reader with a fail-closed filesystem walk, so `runtime:coherence` can read nested benchmark traces without crashing on bad artifact paths.
- Split tracked roundtable queue state from live roundtable session metadata, with a legacy fallback reader so mixed old session files stop polluting the tracked queue contract.
- Aged completed Immaculate and Q traces into `stale` after a freshness window, and taught `runtime:coherence` to warn on stale Discord receipts, stale patrol cadence, and expired roundtable windows instead of treating them as current by default.
- Sanitized the public benchmark snapshot source line so release surfaces stop leaking local absolute receipt paths while still documenting that BridgeBench, soak, TerminalBench, and W&B receipts back the published claims.
- Kept the public benchmark and release surfaces aligned with real receipts, typed traces, and signed benchmark artifacts.
