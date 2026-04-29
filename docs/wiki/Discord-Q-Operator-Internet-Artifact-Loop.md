# Discord Q Operator Internet And Artifact Loop

Updated: 2026-04-27

This page documents the governed Discord/Q operator lane as implemented in the canonical `D:\openjaws\OpenJaws` runtime.

## Command Boundary

- Natural Discord commands should enter through `scripts/discord-q-agent.ts`, then through the deterministic parser in `src/utils/discordOperatorWork.ts`.
- Plain-English Immaculate bridge requests such as `immaculate search --max 3 current Q benchmark status` are routed to the governed OpenJaws lane with instructions to use `ImmaculateHarness` or `/immaculate`, not shell curl.
- Code and filesystem work must dispatch through the finite `runDiscordOperatorAction` path. That keeps the existing operator allow-list, approved-root resolution, isolated worktrees, verification, delivery artifacts, and pending-push approval.
- Do not add an LLM-decided arbitrary shell/action path in Discord. Add new actions as explicit parser outputs and explicit `DiscordQOperatorAction` handlers.
- Direct public ledger posting from Discord/OpenJaws remains disallowed. Runtime receipts flow through `syncOperatorReceipt`, then the sanitized public showcase overlay and the Asgard bridge.

## Internet Boundary

- Q/Discord web research is read-only context gathering. The Discord Q agent now enters Immaculate's governed tool loop before attaching internet evidence: it reads `/api/tools/capabilities`, uses `/api/tools/fetch` for explicit URLs, uses `/api/tools/search` only when Brave or Tavily is configured, and packages successful evidence through `/api/artifacts/package`.
- If search is not configured, Discord Q receives an explicit fail-closed context line and must not claim live search was performed. Fetch can still work for URLs because it is governed separately and leaves a receipt.
- OpenJaws now exposes Immaculate's governed tool bridge through `ImmaculateHarness` and `/immaculate`: `tool_capabilities`, `tool_fetch`, `tool_search`, `tool_receipts`, `tool_receipt`, and `artifact_package`. These call the live Immaculate endpoints with explicit governance headers and return receipt ids instead of leaking API keys or ad hoc curl commands into Discord jobs.
- Discord Q and voice prompts now include the live runtime date/time and the base Q freshness boundary: post-June-2024 or date-sensitive facts require local receipts, tool output, or governed web research. If verification is unavailable, Q must say what is missing instead of guessing.
- Scripted OpenJaws operator jobs now receive the same runtime date/time, June 2024 freshness boundary, and governed web-research rule in their prompt footer before the workspace context. This keeps Discord actions, artifact jobs, and repo edits grounded even when they run outside normal chat narration.
- OpenJaws `WebSearch` and `WebFetch` stay read-only and permissioned.
- Do not add a second Discord web-search or browser-automation lane. Extend `src/utils/discordGovernedWeb.ts`, permissioned OpenJaws web tools, or the governed Immaculate tool bridge instead.
- Internet context may inform an OpenJaws job, but it does not grant write authority. Write authority still comes only from approved roots and isolated worktrees.

## April 27, 2026 Runtime Wiring

- Added `src/utils/discordGovernedWeb.ts` as the reusable governed-web context builder for Discord Q and operator jobs.
- Removed the direct DuckDuckGo HTML scraper path from the local Discord Q script. The script now calls Immaculate for capabilities, fetch, search, and artifact packaging.
- Plain Discord messages containing `https://` URLs can now attach a bounded governed fetch receipt and a markdown artifact receipt to Q's prompt context.
- Plain Discord requests such as `look up current BridgeBench docs` now try governed search only when Immaculate reports search as available. With the current local config, this fails closed because no Brave/Tavily key is configured.
- Successful governed fetch/search context includes receipt IDs and receipt hashes so the answer can stay auditable.
- Verification:
  - `bun test src\utils\discordGovernedWeb.test.ts` passed.
  - `bun test src\utils\discordQAgent.test.ts` passed.
  - `bun test src\utils\immaculateHarness.test.ts` passed.
  - `bun run system:check:features` passed.
  - `bun build scripts\discord-q-agent.ts --target=bun --outdir %TEMP%\discord-q-agent-build-check` passed.
  - Live Immaculate probe fetched `https://example.com` and returned fetch receipt `fetch-fnv1a-95b165b5` plus artifact receipt `artifact-fnv1a-6fef2ee7`.
  - Live search probe returned the expected `search_provider_not_configured` fail-closed state.

## April 29, 2026 Preflight Hardening

- `bun run discord:auth:preflight` now checks both Discord bot identity and Immaculate governed tool readiness in one report.
- The preflight resolves the local Immaculate API key from process env, `IMMACULATE_ENV_FILE`, OpenJaws `.env`, or `%USERPROFILE%\Desktop\Immaculate\.env.local` without printing the key.
- The Immaculate lane calls `/api/health` and `/api/tools/capabilities` with governance headers, then reports fetch, search, artifact, and receipt status.
- Live preflight result:
  - Q token accepted and matched application id.
  - Blackbeak token accepted and matched application id.
  - Viola token rejected by Discord with HTTP `401`; rotate the local `DISCORD_BOT_TOKEN` before treating Viola voice as production-ready.
  - Immaculate API key is available from local env, harness is reachable at `http://127.0.0.1:8787`, fetch/artifacts/receipts are available, and search is available through Tavily.
- Verification:
  - `bun test scripts\discord-agent-auth-preflight.test.ts` passed.
  - `bun run discord:auth:preflight` passed with warning status for Viola token/search config.
  - `bun run system:check:features` passed.
- Release gate upgrade:
  - `bun run system:check:features` now includes `operator-release-surface` beside `direct-connect-feature-surface`.
  - The operator-release surface verifies that the Discord auth preflight, PersonaPlex probe, runtime coherence, governed web, Discord operator, roundtable, Immaculate harness, and ImmaculateHarness tool source files are present in the releasable tree.
  - Feature-surface reports now emit `mode: feature-surface` instead of the misleading `mode: full`.
  - Additional verification passed: `bun test scripts\system-check.test.ts scripts\discord-agent-auth-preflight.test.ts`, targeted Discord/Immaculate utility tests, `bun run build`, and `bun run system:check:features`.

## April 29, 2026 Tavily Production Enablement

- Immaculate governed search is now configured for Tavily in the local production harness.
- The Tavily credential is stored in an ignored runtime secret file and `.env.local` points to it through `IMMACULATE_TAVILY_API_KEY_FILE`; do not copy the raw key into tracked docs, tests, or Discord env files.
- Restarted the Immaculate harness on `http://127.0.0.1:8787`; live process after restart was PID `20052`.
- `/api/tools/capabilities` now reports:
  - fetch: `available`
  - search: `available`, provider `tavily`
  - artifacts: `available`
  - receipts: `available`
- Live governed search verification:
  - Direct Immaculate `/api/tools/search` query for Tavily docs returned receipt `search-fnv1a-80a1dd2c`.
  - OpenJaws `buildDiscordGovernedWebContext` returned live evidence with search receipt `search-fnv1a-4283765f` and artifact receipt `artifact-fnv1a-d5f52fc3`.
  - `bun run discord:auth:preflight` now reports Immaculate tools `ok`; the overall report is still `warning` only because the Viola Discord token returns HTTP `401`.
- Follow-up hardening:
  - `bun run discord:auth:preflight` now runs a bounded governed search smoke whenever Immaculate reports search as available.
  - Latest smoke receipt from the preflight path: `search-fnv1a-df89e87c`, result count `2`.
  - `scripts/system-check.ts` now uses an explicit hard timeout and Windows process-tree termination for child commands, after `bun run system:check:live` exposed a hang at `onboarding-walkthrough-live`.
  - Regression coverage verifies that a hanging command is terminated by the hard timeout.

## Permission Boundary

- `runScriptedOpenJawsOperatorJob` now inspects the approved local PowerShell runner before launch and refuses scripts that request `--allow-dangerously-skip-permissions`, `--dangerously-skip-permissions`, or `--permission-mode bypassPermissions`.
- The only bypass escape hatch is explicit supervised local maintenance: set `OPENJAWS_DISCORD_ALLOW_PERMISSION_BYPASS=1` or pass the internal `allowPermissionBypass` flag intentionally. Keep that off for normal Discord operator work.
- Q freshness SFT seeds now live in the tracked `training/q/seeds/q-freshness-tool-evidence.jsonl` file. `scripts/prepare-openjaws-sft.ts` merges those tracked seeds by default so generated training packs teach runtime-clock/date/current-fact behavior without relying on ignored `data/sft/` files.

## Artifact Delivery

Tracked TypeScript now has a reusable delivery renderer in `src/utils/discordOperatorExecution.ts`.

- Natural artifact requests such as `create a pdf report for apex-apps about tenant governance` now parse into the governed `ask-openjaws` action in `src/utils/discordOperatorWork.ts`.
- Direct Immaculate packaging is available as `/immaculate artifact <markdown|text|json|html|docx|pdf> <name> -- <content>` or the `artifact_package` `ImmaculateHarness` action. It leaves an Immaculate artifact receipt under the harness runtime before anything is handed back to Discord.
- Do not create a second PDF/report/artifact action path. Extend parser outputs and `src/utils/discordOperatorExecution.ts` delivery rendering only.
- The generated OpenJaws prompt tells the job to emit `delivery.json` and to include bounded markdown, text, HTML, DOCX, PPTX, XLSX, PDF, CSV, or workspace artifacts for Discord delivery.
- Artifact jobs must build only the smallest bounded local harness needed for validation, parsing, replay, or differential checks.
- `runScriptedOpenJawsOperatorJob` forwards `promptFooter` and approved additional directories to `local-command-station/run-openjaws-visible.ps1` through base64-encoded JSON, so Discord jobs receive the safety contract and canonical repo context even when paths contain spaces.
- Roundtable action jobs now receive the same current-date/freshness rule, scoped-code instruction, isolated branch metadata, and canonical git root context before OpenJaws starts.
- Generates `openjaws-output.md`, `openjaws-output.txt`, `openjaws-output.html`, a minimal `openjaws-output.docx`, a minimal `openjaws-output.pptx`, and a minimal `openjaws-output.xlsx` inside the operator output directory.
- Attempts `openjaws-output.pdf` only when an approved local Edge/Chrome executable is available.
- Collects only path-bounded output/workspace files before Discord upload.
- Delivery collection now rejects hidden/dotfile paths, unknown extensions, files larger than 8 MiB, more than 8 files, and more than 24 MiB total before Discord upload.
- When workspace artifacts are present, delivery collection reserves up to three attachment slots for those job-created files. Generated mirrors are prioritized as Markdown, DOCX, PPTX, XLSX, PDF, HTML, then TXT so low-value fallbacks do not displace bounded workspace deliverables.
- Text, code, JSON, CSV, SVG, and Office XML delivery artifacts are scanned for token-, key-, credential-, bearer-, JWT-, Discord-token-, GitHub-token-, and private-key-shaped content. Matching artifacts and malformed Office containers are omitted from Discord upload instead of being attached.
- Writes `delivery-artifacts.manifest.json` beside generated output. Delivered entries carry `name`, `mime`, `bytes`, `sha256`, `sourceReceipt`, and `publicSafe`; withheld entries carry only sanitized `name`, `kind`, public-safe `reason`, `sourceReceipt`, and `publicSafe: true`.
- A manifest is still written when every supplied artifact is withheld, so secret-gated or malformed delivery output leaves a local audit receipt without exposing artifact content.
- Roundtable receipts carry the manifest path as `deliveryArtifactManifestPath`, and Discord posts attach one manifest beside bounded artifact files when bot-token upload is available.
- Discord bot-token uploads re-check attachment size/count before creating upload blobs, so oversized generated DOCX/PDF/MD/PPTX/XLSX artifacts fail closed instead of exhausting memory or failing late at the Discord API.
- Falls back automatically if a scripted OpenJaws job produces `result.json` and `stdout.txt` but no `delivery.json`.
- Discord bot-token channel posts can attach files through multipart REST. Webhook fallback remains text-only.

The existing local PowerShell renderer in `local-command-station/render-openjaws-delivery.ps1` can still be used by visible local jobs, but it is no longer the only artifact-generation implementation.

## Runtime Ports

- Discord Q agent: `8788`, `GET /health`.
- Discord Viola agent: `8789`, receipt-backed health when system voice is active.
- Discord Blackbeak agent: `8790`, `GET /health`.
- Immaculate harness: `8787`, `GET /api/health`.
- Nysus fabric: `8080`, `GET /api/fabric/public-status`.
- PersonaPlex/Moshi bridge: expected `8998` by default; the staged readiness probe is WS `/api/chat?text_prompt=...&voice_prompt=...`. Use `bun run personaplex:probe` from `D:\openjaws\OpenJaws` to verify the live hello frame.
- Giru Jarvis: `7777` WebSocket backend, `7778` monitor WebSocket, `7779` REST API.

Observed on April 26, 2026 during the audit follow-up: direct Discord auth preflight accepts Q and Blackbeak, but rejects the configured Viola token with HTTP `401`. `bun scripts/personaplex-probe.ts --json` currently reports `ready:false` with a WebSocket error on `127.0.0.1:8998`, even though the stale runtime state still has an older healthy timestamp. Immaculate is reachable at `http://127.0.0.1:8787/api/health`, Q is connected to Discord through the receipt-backed probe, and `bun scripts/runtime-coherence.ts --json` is `warning` only because Viola and PersonaPlex are degraded.

OpenJaws does not copy Immaculate secrets into Discord env files. `src/utils/immaculateHarness.ts` now falls back to `IMMACULATE_ENV_FILE` or `%USERPROFILE%\Desktop\Immaculate\.env.local` for `IMMACULATE_API_KEY`, `IMMACULATE_HARNESS_URL`, `IMMACULATE_HOST`, and `IMMACULATE_PORT`, so `/immaculate`, Discord operator work, and `ImmaculateHarness` can call governed local endpoints without leaking the key into logs.

The Q supervisor is single-instance guarded by agent label and port. If `/health` is temporarily unavailable while the gateway receipt is still fresh and connected, `local-command-station/start-q-agent.ps1` trusts `updatedAt`, `gateway.lastHeartbeatAt`, or `gateway.readyAt` instead of restart-storming the connected Discord agent.

The Discord agent HTTP surface now uses the Node `http` adapter instead of `Bun.serve` for the local `/health` and Discord interaction endpoint. Under the full OpenJaws runtime graph on Windows, `Bun.serve` accepted TCP connections but did not answer direct GET health probes. The Node adapter explicitly drains non-POST requests before replying, and live checks now return `200` for Q on `8788` and Blackbeak on `8790`.

## Voice Boundary

Viola voice is implemented in `scripts/discord-q-agent.ts` with `@discordjs/voice`. `DISCORD_AGENT_PROFILE=viola` enables the auto-join default, and `DISCORD_AGENT_VOICE_CHANNEL` defaults to `viola-lounge`.

The Viola Discord bot token is read from `DISCORD_BOT_TOKEN`. Keep it only in an ignored local env file such as `.env.local` or in a secret manager. If a live Discord token is pasted into chat, docs, or logs, treat it as exposed and rotate it in the Discord Developer Portal before running the agent.

When `DISCORD_Q_VOICE_PROVIDER=personaplex`, the Discord agent now records two separate facts: PersonaPlex is the live voice bridge provider, and outbound Discord audio-file playback is currently rendered by the local system voice fallback. Receipts expose `voice.renderProvider`, `voice.renderSummary`, `voice.lastRenderProvider`, and `voice.lastRenderSummary` so status surfaces do not imply that a system-rendered WAV came from PersonaPlex.

Current PersonaPlex/Moshi state: the required check is still `bun run personaplex:probe`, but the April 26 probe is not passing. The launcher no longer treats a bare TCP listener as healthy; it writes `listeningAt` first and only writes `healthyAt` after the `/api/chat` WebSocket emits the expected hello frame. The remaining product gap is a true Discord-to-PersonaPlex duplex audio bridge; until the probe and Discord token are both green, Viola voice cannot be called production-ready.

## Public Website Roots

- `qline.site`: canonical deploy root is `D:\openjaws\q-s-unfolding-story`; Netlify site id `edde15e1-bf1f-4986-aef3-5803fdce7406`; site name `qline-site-20260415022202`. Do not deploy the legacy OpenJaws `website/` mirror.
- `iorch.net`: current publish-prep root is `D:\cleanlanes\immaculate-iorch-net-publish-prep-20260421`; dashboard app lives under `apps/dashboard` and publishes `apps/dashboard/out` after build.
- `aura-genesis.org`: canonical website root is `C:\Users\Knight\Desktop\cheeks\Asgard\Websites`; Netlify site id `adddc773-0212-4865-952c-957a200f5658`.

Marketing copy was refreshed on April 24, 2026 to be public-facing and simple while preserving benchmark truth boundaries. Do not update public benchmark claims unless fresh TerminalBench, BridgeBench, and W&B receipts exist.

## Benchmark Publication Gates

- Root `bun test` discovery is now guarded by `bunfig.toml` `test.pathIgnorePatterns`, so generated TerminalBench bundles, operator worktrees, runtime mirrors, and website build output cannot contaminate live-repo verification with stale copied tests.
- W&B publication is blocked until one of `WANDB_API_KEY`, `WANDB_API_KEY_FILE`, or `OPENJAWS_WANDB_SECRET_OCID` is configured along with `WANDB_ENTITY` and `WANDB_PROJECT`.
- BridgeBench on `google/gemma-4-E4B-it` is blocked locally by insufficient memory. The route queue can request Immaculate assignment, but public BridgeBench reruns need a real eligible remote worker registered through a verified remote control plane.
- A simulated or unverified localhost worker is allowed only as a negative-path check. It must remain out of public claims.
- Public benchmark surfaces should stay unchanged when the latest run is dry-run, local-only, pending assignment, or failed.

## Public Showcase Behavior

The public showcase writer now treats bounded roundtable `error` states as `warning` / `needs-review`, not as public network failure. The top-level `runtime_audit` entry ignores non-critical failures from public-safe mirrors such as roundtable, governed spend, and benchmark lanes. This keeps the public status honest without making a failed local Discord turn look like message bus or control-fabric downtime.

Aura Genesis public Discord status now includes a public-safe pressure-loop line when showcase telemetry reports subsystem counts. The line can show the 16-subsystem demo, public ledger proof count, public height, and result readiness while explicitly stating that private `00` payloads stay closed.

Critical runtime failures still surface as failed public activity entries.

## April 29, 2026 Live Gate And Artifact Runner Follow-Up

- `scripts/onboarding-setup-walkthrough.tsx` now bounds the final terminal exit wait and force-closes idle HTTP connections after the scripted walkthrough finishes. This resolves the live gate hang that previously left `system:check:live` stuck at `onboarding-walkthrough-live`.
- `scripts/deploy-qline-site.ts` now checks the current canonical `qline.site` headline marker, `Q // OpenJaws // Q_agents | qline.site`, instead of the stale legacy OpenJaws mirror copy. The canonical public root remains `D:\q-s-unfolding-story`; do not deploy the legacy `website/` mirror for qline.
- Discord natural artifact requests now recognize PPTX, PowerPoint, slides, XLSX, Excel, spreadsheets, workbooks, CSV, and JSON in addition to PDF, DOCX, Markdown, HTML, and text.
- `scripts/render-discord-operator-delivery.ts` is the tracked TypeScript CLI for producing Discord delivery bundles from OpenJaws output. The visible local runner tries this renderer first and falls back to the older PowerShell renderer if needed.
- The live Immaculate listener was left up on `http://127.0.0.1:8787`; the latest listener check showed PID `15296` bound to `127.0.0.1:8787`.
- Latest live gate run: `system-check-20260429T031120` completed with `19` passed, `0` failed, and `3` warnings.
- `system:check:live` remains the diagnostic live audit. `system:check:live:strict` is now the production green-state gate used by `verify:release`, so Viola auth warnings, PersonaPlex bridge warnings, and runtime-coherence warnings fail release verification until the live stack is actually green.
- Latest strict live gate run: `system-check-20260429T195447` completed with `19` passed, `0` failed, and `3` warnings, then exited `1` because strict mode now treats those warnings as release blockers.
- Latest live governed search smoke from the preflight path returned receipt `search-fnv1a-ccc6f6c2` with result count `2`.
- Remaining live warnings:
  - Viola Discord auth still fails with HTTP `401`; rotate/update the local Viola bot token before voice production use.
  - PersonaPlex probe still errors on `ws://127.0.0.1:8998/api/chat?...`; repair or restart the PersonaPlex/Moshi bridge before marking the voice bridge green.
  - Runtime coherence is warning because it aggregates the Viola and PersonaPlex degradations.
- CI check: latest visible OpenJaws and Immaculate GitHub workflows were green, and Asgard PR `#75` run `25088987255` completed successfully across frontend, Go, docs hygiene, security, and Docker checks.

Verification for this follow-up:

- `bun run onboarding:walkthrough`
- `bun test scripts\system-check.test.ts scripts\discord-agent-auth-preflight.test.ts src\utils\discordGovernedWeb.test.ts src\utils\immaculateHarness.test.ts`
- `bun test src\utils\discordOperatorWork.test.ts src\utils\discordOperatorExecution.test.ts`
- `bun run system:check:features`
- `bun run build`
- `bun run website:deploy:check`
- `bun run system:check:live`
