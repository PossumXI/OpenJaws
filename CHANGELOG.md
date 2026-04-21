# Changelog

## 2.1.86 - 2026-04-21

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
- Aged completed Immaculate and Q traces into `stale` after a freshness window, and taught `runtime:coherence` to warn on stale Discord receipts, stale patrol cadence, and expired roundtable windows instead of treating them as current by default.
- Sanitized the public benchmark snapshot source line so release surfaces stop leaking local absolute receipt paths while still documenting that BridgeBench, soak, TerminalBench, and W&B receipts back the published claims.
- Kept the public benchmark and release surfaces aligned with real receipts, typed traces, and signed benchmark artifacts.
