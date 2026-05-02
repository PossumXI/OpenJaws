# Changelog

## 2.1.88 - 2026-04-22

- Runtime source-drift checks now count tracked file changes without scanning untracked dependency/build trees, keeping the coherence probe responsive on Windows worktrees with large ignored directories.
- JAWS Desktop now runs provider checks from the selected workspace or a writable JAWS runtime directory instead of inheriting `C:\WINDOWS\system32`, preventing `EPERM` failures when OpenJaws writes session traces and artifacts.
- JAWS Desktop broad workspace-analysis prompts now use a bounded native context and ledger scan, so "analyze the workspace" returns file coverage, priority files, skips, and audit state instead of waiting on a long model turn until the 120-second chat timeout.
- JAWS Desktop Browser Preview now treats local apps as embedded targets and opens external frame-blocked sites in a dedicated native preview window with a browser receipt, so public sites like Google do not look like a broken renderer.
- JAWS Desktop Ledger now reads real local Q route, browser-preview, website-test, account, and credit receipts from the selected workspace and OpenJaws config home, with an explicit local-only warning when no AROBI LAAS route/token is configured.
- Prepared JAWS Desktop 0.1.7 as the next signed update lane for the runtime blocker repair pass, because the already-published 0.1.6 updater lane correctly returns current/no-update to 0.1.6 installs.
- Roundtable execution reconciliation now expires stale running leases into visible error receipts and refreshes the status summary, so operators can see which autonomous job stalled instead of repeatedly seeing an old executing line.
- Runtime coherence Discord agent probes now honor the JSON health status instead of treating any HTTP 200 as healthy, so reconnecting or degraded gateway states show up as actionable warnings.
- Real-world Discord/OpenJaws engagement requests now choose the highest-risk matching lane, so browser tasks involving forms, resumes, checkout, billing, purchases, account changes, uploads, bookings, or message sending stay in supervised approval mode instead of being treated as ordinary preview work.
- Prepared JAWS Desktop 0.1.6 as the next signed update lane so the merged real-world Discord workspace default and desktop release artifact guard can ship through the tag workflow instead of staying only on `main`.
- Added a JAWS desktop artifact guard to the tagged update pipeline so signed installers, required signatures, `latest.json`, and updater platform URLs are verified against `release-index.json` before a GitHub release is promoted publicly.
- Explicit `ask-openjaws` Discord prompts now reuse the real-world engagement classifier after workspace resolution, keeping browser previews, live research, mail/LinkedIn drafts, chrono plans, and artifact-delivery work inside the same approval and receipt boundary as plain-English requests.
- Added a plain-English real-world engagement behavior entry to the public showcase feed so the public surface can say whether live use is active, warming up, blocked, or waiting without exposing private receipts.
- Tightened the public engagement behavior pass so stale historical activity no longer counts as live use, generated showcase copy uses user-facing language, and public summaries scrub channel names, session IDs, receipt wording, and operator-lane phrasing before publication.
- Extended the public showcase sanitizer to the array fields that Discord and website render directly, so actions, artifacts, tags, kinds, and subsystem labels use user-facing terms instead of operator/receipt/lane internals.
- Runtime coherence now warns when an active Discord roundtable's latest governed action was held back, no-diff, artifact-only, mixed-output, or unknown-action, so release checks no longer call the lane healthy when it is not producing code-bearing progress.
- Tightened runtime coherence for the Discord roundtable so active sessions with a dead launch PID or any live roundtable error report warnings instead of a false green status.
- Runtime coherence now reads PowerShell BOM-prefixed roundtable launch files before checking the launcher PID, so the Discord roundtable health gate no longer mistakes a real launch receipt for missing state.
- The OCI Q bridge now resolves provider-prefixed `oci:Q` model aliases to the configured upstream OCI model before calling the Responses API, which prevents Discord roundtable personas from sending the public alias as the raw OCI model id.
- Runtime coherence now reports OpenJaws source checkout drift, including non-main branches, ahead/behind upstream state, and dirty files, so live roundtable failures can be tied back to the exact unreproducible runtime tree.
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
- The tracked roundtable sync sidecar now stages one scoped synthetic follow-through handoff when the live Discord window is still running but the tracked queue is idle and the conversation has degraded into PASS/no-diff drift, which keeps the governed execution lane moving without reopening broad repo-root audits.
