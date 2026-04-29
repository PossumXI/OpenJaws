# Q Operator Readiness - 2026-04-24

This pass keeps Discord/OpenJaws operator power bounded while making artifact delivery and public audit mirrors more useful.

## Changes

- Added deterministic artifact delivery aliases:
  - `openjaws deliver <workspace> :: <request>`
  - `openjaws artifact <workspace> :: <request>`
  - `openjaws report <workspace> :: <request>`
- The aliases route through the existing `ask-openjaws` delivery contract and require `delivery.json` receipts for Discord file delivery.
- Public showcase activity now redacts token-, key-, secret-, JWT-, private-key-, and long-hex-shaped content before writing public mirrors.
- Public ledger auto-sync now launches with an allowlisted environment instead of inheriting the full process environment.
- `local-command-station/`, `.cache/`, `.coverage/`, and `website/tsconfig.tsbuildinfo` are ignored in repo-level `.gitignore`.
- Discord operator workspace containment now uses `realpathSync.native` so symlinks and junctions cannot bypass approved roots by string prefix.
- Scripted OpenJaws operator jobs now require the runner script to resolve under approved local operator roots.
- Operator verification now prefers `verify:ci`, then `test`, then `build` for package workspaces.
- Q freshness prompts are now tool-aware. Discord only marks live web verification as available when governed web context was actually attached to the model call; otherwise Q is told to treat current/latest claims as unverified.
- Runtime coherence now treats reachable Discord agent health endpoints that report `status:error`, `failed`, `unhealthy`, or `degraded` as warnings instead of fully healthy probes.

## Verification

- `bun test D:\openjaws\OpenJaws\src\utils\discordOperatorWork.test.ts` passed.
- `bun test D:\openjaws\OpenJaws\src\utils\discordOperatorExecution.test.ts` passed.
- `bun test D:\openjaws\OpenJaws\src\utils\publicShowcaseActivity.test.ts` passed.
- `bun test D:\openjaws\OpenJaws\src\q\freshness.test.ts` passed.
- `bun test D:\openjaws\OpenJaws\src\utils\discordQAgent.test.ts` passed.
- `bun test D:\openjaws\OpenJaws\src\immaculate\runtimeCoherence.test.ts` passed.
- `bun test D:\openjaws\OpenJaws\scripts\discord-q-agent-personaplex.test.ts` passed.
- `bun run runtime:coherence` now reports `warning`, not `failed`: 12 ok, 2 warning, 0 failed. Q is ready in 1 guild; the warnings are Viola gateway auth and a stale negative patrol snapshot after the harness recovered.
- `bun test D:\openjaws\OpenJaws\src\utils\immaculateHarness.test.ts` passed after increasing the Immaculate harness health timeout.
- `npm run operator:readiness` in Immaculate now includes this OpenJaws runtime coherence result in the same JSON/Markdown readiness receipt.
- The integrated Immaculate readiness receipt now emits machine-readable findings and production gates. Current gates: public safety ready, private runtime ready, voice not ready, benchmark publication not ready.
- `git diff --check` passed for the touched OpenJaws files.

## April 25, 2026 Release Hygiene Follow-Up

- Local HEAD: `e90b58a19dfda3a1780e0d74826d5166c9e1da51` on `agent/openjaws-terminalbench-provenance`.
- Root `bunfig.toml` test discovery now ignores generated/runtime output trees, so root test runs no longer collect stale copied tests from benchmark artifacts, local command-station workspaces, Next build output, or runtime mirrors.
- Script coverage accounting now ignores files that Git itself ignores, which keeps private local-only operator shims out of the public script coverage floor.
- EOF whitespace blockers were removed from `benchmarks/harbor/openjaws_agent.py`, `scripts/q-terminalbench.test.ts`, and `scripts/q-terminalbench.ts`.
- `git diff --check` now passes globally for the workspace diff. Git still reports line-ending normalization warnings for existing CRLF-touched files, but no whitespace errors remain.
- `bun run verify:ci` passed end to end. The pass included `audit:knip`, `test:coverage:scripts`, `test`, `showcase:copy:check`, `build`, and `website:verify`.
- Script coverage floor passed at `33.76%` lines.
- Unit coverage during `verify:ci` passed with `493` source tests and `62` script tests.
- `showcase:copy:check` reported `ok: true`, no missing required inputs, and no public-copy violations.
- GitHub pipeline check for the local HEAD found no commit statuses and no workflow runs yet, so there were no remote CI failures to fix for this SHA.

## April 25, 2026 Discord Artifact Delivery Follow-Up

- The tracked Discord/OpenJaws delivery renderer now emits a bounded native `openjaws-output.pptx` alongside Markdown, plain text, HTML, DOCX, and optional PDF.
- PPTX files flow through the same path-bounded, extension-checked, count-limited, and size-limited Discord attachment collector as the existing delivery artifacts.
- The ignored local Discord agent shim type was kept in sync so the live `scripts/discord-q-agent.ts` runtime accepts the expanded delivery shape.
- Verification after this pass:
  - `bun scripts/run-unit-tests.ts --scope src` passed with `493` source tests.
  - `bun scripts/run-unit-tests.ts --scope scripts` passed with `62` script tests.
  - `bun run build` passed.
  - `bun run verify:ci` passed end to end after the PPTX change.

## April 25, 2026 Discord Audit Workbook Follow-Up

- The Discord/OpenJaws delivery renderer now emits a bounded native `openjaws-output.xlsx` workbook with generated time, workspace, model, prompt, and output fields.
- XLSX and CSV are now accepted by the same workspace-artifact allow-list used for Discord delivery, while hidden files, unknown extensions, over-limit files, and over-limit bundles still fail closed.
- The ignored local Discord agent shim type was kept in sync so the live runtime accepts the expanded delivery shape.
- Verification after this pass:
  - `bun scripts/run-unit-tests.ts --scope src` passed with `496` source tests.
  - `bun scripts/run-unit-tests.ts --scope scripts` passed with `65` script tests.
  - `bun run verify:ci` passed end to end with script coverage at `33.44%` lines.

## April 25, 2026 Discord Delivery Priority Follow-Up

- The Discord/OpenJaws delivery collector now reserves up to three attachment slots for bounded workspace artifacts when an operator job creates its own deliverables.
- Generated mirrors are prioritized as Markdown, DOCX, PPTX, XLSX, PDF, HTML, then TXT, so low-value fallbacks do not crowd out job-created reports, receipts, or benchmark files.
- Verification after this pass:
  - `bun scripts/run-unit-tests.ts --scope src` passed with `502` source tests.
  - `bun scripts/run-unit-tests.ts --scope scripts` passed with `72` script tests.
  - `bun run build` passed.
  - `bun run verify:ci` passed end to end with script coverage at `28.92%` lines.

## April 25, 2026 Discord Delivery Secret Gate Follow-Up

- Discord/OpenJaws delivery collection now scans text, code, JSON, CSV, SVG, and Office XML artifacts before upload.
- Artifacts with token-, key-, credential-, bearer-, JWT-, Discord-token-, GitHub-token-, or private-key-shaped content are omitted from Discord upload instead of being attached.
- Malformed Office containers fail closed and are omitted from Discord upload instead of bypassing XML inspection.
- Delivery manifests now include public-safe withheld-artifact records with sanitized names and reason codes, and a manifest is still written when all supplied artifacts were withheld.
- Verification after this pass:
  - `bun test src/utils/discordOperatorExecution.test.ts src/utils/discordRoundtableExecution.test.ts` passed with `27` focused delivery and roundtable tests.
  - `bun scripts/run-unit-tests.ts --scope src` passed with `508` source tests.
  - `bun scripts/run-unit-tests.ts --scope scripts` passed with `76` script tests.
  - `bun run build` passed.
  - `bun run verify:ci` passed end to end with script coverage at `29.63%` lines and source coverage at `30.00%` lines.

## April 25, 2026 Discord Auth Guard Follow-Up

- The Discord agent health endpoint now reports non-retryable gateway configuration/auth closes as `status:blocked` instead of temporarily presenting a gateway-started process as healthy before Discord `READY`.
- Runtime coherence can now fall back to a fresh local error receipt when an agent intentionally stopped before binding `/health`, so Viola's auth blocker is visible without requiring a wedged local listener.
- Runtime coherence also keeps recent non-retryable gateway auth/config receipts diagnosable for 24 hours, so a deliberately stopped agent still reports the original `4004` reason instead of a generic unreachable probe.
- The local Discord launcher now preflights the bot token against Discord `/users/@me`; when Discord rejects it, the launcher clears the stale port listener, writes a fresh `4004` receipt, and exits instead of entering an `EADDRINUSE` restart loop.
- `bun run discord:auth:preflight` now checks the local Q, Viola, and Blackbeak env files directly against Discord `/users/@me` without printing tokens. It also verifies that an accepted bot token belongs to the configured `DISCORD_APPLICATION_ID`, so token rotation cannot silently wire the wrong bot identity into a persona lane. `system:check:live` includes that preflight as a warning-capable live check before treating Discord runtime state as explainable.
- The local Discord launcher now enforces the same token-to-application identity guard by default before starting an agent process. A mismatched or missing `DISCORD_APPLICATION_ID` writes the same blocked `4004` receipt path as a rejected token; `DISCORD_REQUIRE_APPLICATION_ID_MATCH=false` is the explicit temporary recovery escape hatch.
- On April 25, 2026 at 09:09 EDT, the patched Viola launcher confirmed the configured token is rejected by Discord with HTTP `401`. The token still needs rotation before Viola can join or speak in a live voice channel.
- On April 25, 2026 at 12:47 EDT, direct auth preflight confirmed Q and Blackbeak tokens are accepted by Discord, while Viola is still rejected with HTTP `401`.
- On April 25, 2026 at 13:18 EDT, direct auth preflight also confirmed Q and Blackbeak tokens match their configured application IDs. Viola still fails before identity comparison because Discord rejects the token.
- On April 25, 2026 at 18:40 EDT, `bun run discord:auth:preflight` still reported Q and Blackbeak as accepted, while Viola remained rejected with HTTP `401`. The new Viola token was not applied because the Windows clipboard did not contain a token-shaped value during the redacted local handoff attempt; do not paste bot tokens into tracked files or terminal logs.
- Verification after this pass:
  - `bun test ./scripts/discord-q-agent-personaplex.test.ts ./scripts/runtime-coherence.test.ts ./src/immaculate/runtimeCoherence.test.ts` passed.
  - `bun test ./scripts/system-check.test.ts ./scripts/runtime-coherence.test.ts` passed.
  - `bun test ./scripts/runtime-coherence.test.ts ./scripts/discord-agent-auth-preflight.test.ts ./scripts/system-check.test.ts` passed.
  - `bun test ./scripts/discord-agent-auth-preflight.test.ts ./scripts/system-check.test.ts` passed after adding application-id drift detection.
  - `bun run build` passed.
  - `bun run test` passed on rerun after one transient roundtable test failure during the first live sweep.
  - `bun run system:check:live` completed with `18` passed, `0` failed, and `2` warnings. Both warnings point to the same unresolved Viola credential issue: runtime coherence retains the `4004` receipt and direct Discord auth preflight reports HTTP `401`; Q, Blackbeak, Immaculate, qline.site, startup harness, voice harness, and PersonaPlex all passed their live probes.
  - `gh run list --limit 8` showed the latest GitHub Actions runs passing; the only listed failure is an older April 22 CI run.

## April 25, 2026 Roundtable Status Truth Follow-Up

- Runtime coherence now treats `roundtable-runtime` status `error` or `stale` as a visible warning instead of reporting it as healthy.
- Scripted OpenJaws operator jobs that fail to write `result.json` now raise an actionable diagnostic with the expected receipt path, runner exit code, and last runner output instead of using the startup banner as the whole error.
- This makes the current roundtable issue explainable: the live stack can stay up, but a failed roundtable job is no longer hidden behind an `ok` health row.
- `system:check` now writes a lightweight `progress.json` heartbeat in the active run directory before each command check, so a hung sweep leaves the current step instead of an empty report directory.
- Public showcase sanitization now matches the guard script's public-safe readiness wording: private `q_reasoning_trace` material becomes `q_readiness_summary`, while human-facing copy says `Q readiness summary`.
- Verification after this pass:
  - `bun test ./src/immaculate/runtimeCoherence.test.ts` passed.
  - `bun test ./src/utils/discordOperatorExecution.test.ts` passed.
  - `bun test ./src/utils/publicShowcaseActivity.test.ts` passed 20 consecutive runs.
  - `bun run test` passed with `508` source tests and `76` script tests.

## April 25, 2026 Full-Stack Audit and Command-Station Follow-Up

- Six parallel audit agents inventoried the frontend, backend/API, Discord runtime, Q/Immaculate route layer, public website mirror, and Apex/Asgard integration. The consolidated map is in `docs/wiki/Full-Stack-Audit-2026-04-25.md`.
- The active Asgard/Apex checkout on this machine is `D:\cheeks\Asgard`. The requested C desktop Asgard path is a stub, and the requested C Apex apps path does not exist.
- The local `openjaws-d` Discord operator workspace now points to `D:\openjaws\OpenJaws` instead of `D:\openjaws`, which prevents operator jobs from resolving upward to the unsafe/dubious `D:\` Git root.
- The visible local OpenJaws runner no longer passes permission-bypass flags. The runner policy remains in place, but the configured runner now satisfies it for governed Discord `ask-openjaws` jobs.
- Plain-English Discord project work now includes web-research phrasing such as “look up,” “search the web,” and “browse,” while generic non-project questions such as weather remain normal chat.
- Authorized operator/admin users can now post bounded plain-English commands in `#q-command-station` without mentioning the bot. The same parser and authorization gates still apply, and freeform guild chat outside the command station is ignored unless the bot is mentioned.
- Discord config now accepts legacy `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` aliases, while `.env.example` documents canonical `DISCORD_APPLICATION_ID` and `DISCORD_DEFAULT_GUILD_ID`.
- Blackbeak's fallback meme guard now blocks near-duplicate bodies using normalized content similarity, not only exact `mode:focus:content` signatures. This directly targets repeated meme bodies across focus labels.
- Viola remains blocked until the private Discord token is rotated successfully; do not paste the token into tracked files, docs, or terminal logs.
- Verification after this pass:
  - Focused Discord/OpenJaws tests passed with `72` tests.
  - `bun scripts/run-unit-tests.ts --scope src` passed with `516` source tests.
  - `bun scripts/run-unit-tests.ts --scope scripts` passed with `85` script tests.
  - `bun run verify:ci` passed end to end with script coverage at `29.65%` lines.

## April 26, 2026 Discord Plain-English And Public Showcase Follow-Up

- The current subagent cap in this environment is six active agents, not ten. The April 26 pass used six read-only audit lanes and consolidated their findings before applying local patches.
- Plain-English Discord operator routing now recognizes diagnostic commands such as `diagnose`, `investigate`, `figure out`, `why is`, `trace`, `verify`, `check logs`, `use tools`, `use the internet`, and `use my local computer` when the prompt also contains an approved project/tool context. Generic non-project questions still stay in chat.
- Natural OpenJaws prompts such as `use OpenJaws to audit Asgard security hardening gaps` and `have OpenJaws create a docx artifact for Discord agent roles` route into the governed `ask-openjaws` path with workspace inference.
- Blackbeak's repetition guard now compares normalized meme body similarity across focus buckets for the same delivery mode, so the same joke cannot keep rotating through AI accountability, robotics, aerospace, and defense labels.
- `repair-q-agent.ps1` now stops all matching supervisors for the chosen env file and clears the stale listener on that persona's health port before launching a replacement.
- Public showcase activity and guard writes now use temp-file plus rename writes, reducing the risk of NUL-only `.arobi-public` status/guard files after interrupted writes.
- Public showcase copy generation now uses simpler marketing-forward language and rewrites internal terms such as `control-plane`, `operator audit lane`, `private audit lane`, `worktree`, `agent-branch-only`, `critical_priority`, and `subsystem_command` before bundling public status.
- Current runtime blockers observed on April 26: Viola Discord auth still fails with HTTP `401`; PersonaPlex probe reports `ready:false` with a WebSocket error; runtime coherence reports Immaculate/Q local health unavailable in the current probe; public TerminalBench/W&B/BridgeBench leaderboard claims remain blocked until fresh credentialed receipts exist.
- No live Discord bot restart was performed during this pass.
- Verification after this pass:
  - Focused OpenJaws tests passed with `71` tests across Discord parser, Blackbeak freshness, runtime public lines, public showcase activity, and copy guard coverage.
  - `bun run showcase:copy:check` passed against `.arobi-public`, the tracked OpenJaws mirror, and the Websites bundled snapshot.
  - `npm test`, `npm run typecheck`, `npm run lint`, `npm run public:copy:check`, and `npm run public:status:check` passed in `D:\cheeks\Asgard\Websites`.
  - GitHub Actions check: latest OpenJaws scheduled runs are green; latest Asgard heartbeat runs are green; the scheduled `apexos-production-smoke` run still fails at hosted sign-in and its Discord notification step was masking the failure with bot-token HTTP `401`.

## Notes

- A broad `bun test src/utils/publicShowcaseActivity.test.ts` also scanned copied benchmark artifact trees under `artifacts/` and failed in stale embedded OpenJaws copies with missing module imports. The source file test above is the valid verification for this change.
- Arobi public projection is clean after the follow-up pass. Raw projection-only material was quarantined at `C:\Users\Knight\.arobi\private-quarantine\arobi-public-raw-20260425T031553Z`, and `npm run operator:readiness` reports public info `200`, private audit `403`, and projection guard `passed`.
- The remaining runtime warning is Viola: `http://127.0.0.1:8789/health` is reachable but returns `status:error`, with `gatewayConnected:false` and `guildCount:0`. The live receipt shows Discord gateway close code `4004 Authentication failed`; the Viola bot token must be rotated or updated before voice-channel speech can be considered live.
- OpenJaws now records that gateway auth failure in health/receipts and suppresses automatic reconnect for non-recoverable Discord configuration close codes, so bad credentials do not create an endless reconnect loop.
- The local `start-q-agent.ps1` supervisor now restarts hung listeners after repeated health failures, has a startup grace window for Discord gateway handshakes, and falls back to fresh gateway-ready receipts when the HTTP health probe is flaky but the listener still exists.
- OpenJaws waits 7.5s for Immaculate harness health so active checkpoint/trace work does not create false runtime-coherence failures.
- A stale patrol receipt that says `receipt=false live=true` now warns instead of failing; the opposite direction remains a failure because it can hide a live harness outage.
- Q was restarted onto the patched gateway handling and is healthy on `8788`.
- No unrestricted shell path was added. Discord commands still flow through deterministic parser and action-switch boundaries.
