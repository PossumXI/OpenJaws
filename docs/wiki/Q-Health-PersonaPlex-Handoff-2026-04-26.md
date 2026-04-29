# Q Health And PersonaPlex Handoff - 2026-04-26

## Scope

This pass removed a Q Discord health-loop blocker and tightened PersonaPlex probe cleanup.

## Changes

- Deferred public showcase activity syncs in `src/utils/publicShowcaseActivity.ts` with a 30 second default delay and a 5 minute minimum interval.
- Moved Q Discord public showcase sync scheduling out of the hot receipt-save path and onto runtime events in `scripts/discord-q-agent.ts`.
- Added earlier timer rescheduling so tests and urgent callers can shorten an already pending showcase sync.
- Added a Q supervisor fallback in `local-command-station/start-q-agent.ps1` so fresh receipts with known non-retryable Discord gateway close codes do not restart-storm.
- Added graceful PersonaPlex WebSocket close handling in `scripts/personaplex-probe.ts` and the Discord Q PersonaPlex probe path.

## Verification

- `bun test src\utils\publicShowcaseActivity.test.ts scripts\personaplex-probe.test.ts scripts\discord-q-agent-personaplex.test.ts src\utils\discordQAgentRuntime.test.ts`
- Isolated Q health probe on port `8898`: `/health` returned HTTP 200 in 338 ms after startup.
- `bun run runtime:coherence`: warning only, `13 ok, 2 warning, 0 failed`.
- `bun run verify:ci`: passed.
- GitHub status for `e90b58a19dfda3a1780e0d74826d5166c9e1da51`: no status checks or workflow runs attached.
- `bun run verify:release`: passed; built `dist/openjaws.exe` version `2.1.86`.
- Release asset smoke: `artifacts\release-smoke\openjaws-win32-x64.exe`, version `2.1.86`, SHA-256 `d4115426b53b786f96d488daefb0fdd9f94a05f4f8de53d06d4ec0eafacc1c40`.
- Direct Connect restoration check: `bun run system:check:live` run `system-check-20260426T233313` reported `direct-connect-feature-surface` passed with `missingCount: 0`.
- Qline release check: `bun run verify:release` rebuilt the qline site, passed `qline.site` live checks, rebuilt the native binary, and passed CLI version/help smoke for `dist\openjaws.exe` version `2.1.86`.
- GitHub status for `e90b58a19dfda3a1780e0d74826d5166c9e1da51`: no workflow runs or commit statuses attached to `PossumXI/OpenJaws`; local branch is aligned with `origin/agent/openjaws-terminalbench-provenance`.
- GitHub pipeline audit: installed `actionlint` v1.7.12 locally through Go, linted all `.github/workflows`, and fixed the release matrix by moving the `darwin-x64` asset job from the retired `macos-13` runner label to `macos-15-intel`.
- CI guard hardening: added `bun run system:check:features`, wired it into `verify:ci` and `verify:public`, and renamed the GitHub System Check step to show it now covers feature-gated source surfaces. This makes the Direct Connect missing-module condition fail CI instead of staying a local warning.
- Latest remote workflow state checked with `gh run list`: latest CI, System Check, Security, and Q Benchmark Soak runs on `main` are successful; Release has no recent run because no `v*` tag triggered it.
- Post-pipeline validation: `actionlint`, `bun run verify:ci`, `bun run verify:public`, and `bun run verify:release` all passed after the workflow and guard changes. The final release sweep used `system-check-20260426T234646`, with Direct Connect passed and `missingCount: 0`.

## Remaining Warnings

- Viola is reachable but its Discord token is rejected by `/users/@me` with HTTP 401. Rotate the token before restart.
- PersonaPlex still reports WebSocket error at `ws://127.0.0.1:8998/api/chat?...`; the probe now closes cleanly, but the runtime bridge itself is not ready.
- Direct Connect no longer reports missing feature-gated source modules. The restored source surface includes `parseConnectUrl`, `server`, `sessionManager`, `dangerousBackend`, `serverBanner`, `serverLog`, `lockfile`, and `connectHeadless`; the live health surface identifies OpenJaws and points to `https://qline.site`.
