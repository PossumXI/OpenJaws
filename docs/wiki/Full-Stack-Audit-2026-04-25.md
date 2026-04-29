# Full-Stack Audit - 2026-04-25

## Scope

This audit covers the active OpenJaws checkout at `D:\openjaws\OpenJaws`, the qline.site Next app under `website`, Discord operator surfaces under `scripts` and `src/utils/discord*`, Q and Immaculate runtime modules, the Apex bridge under `src/utils/apexWorkspace.ts`, and local operator configuration under `local-command-station`.

Generated artifacts and local Discord operator fork worktrees under `local-command-station/openjaws-operator-worktrees` are not treated as source of truth. They are runtime outputs and should be ignored by future audits unless the task is specifically about delivered Discord artifacts.

Path correction: the requested `C:\Users\Knight\Desktop\cheeks\Asgard` tree is effectively a stub on this host. The active Asgard/Apex checkout found during audit is `D:\cheeks\Asgard`, with Apex apps at `D:\cheeks\Asgard\ignite\apex-os-project\apps`.

Public site correction: the checked-in `website` app is a legacy mirror for qline.site, not the live deploy source. `website/README.md` says production deploys must happen from `q-s-unfolding-story`, and `scripts/deploy-qline-site.ts` blocks legacy promotion unless an override is set. Fixes in this repo can improve the mirror and tests, but live `qline.site` copy must be changed in the deploying repository too.

## Frontend Inventory

Website pages:

- `website/app/page.tsx`: Qline landing page, hero, plan cards, OpenJaws feature sections, benchmark snapshot, hosted access console.
- `website/app/success/page.tsx`: Stripe checkout success landing.
- `website/app/cancel/page.tsx`: Stripe checkout cancellation landing.
- `website/app/terms/page.tsx`: public terms.
- `website/app/privacy/page.tsx`: public privacy.
- `website/app/layout.tsx`: Next layout, metadata, global shell.

Website UI components:

- `website/components/QLandingConsole.tsx`: client console for signup, checkout, API key issue, and usage lookup.
- `website/components/QHeroModel.tsx`: public hero model/visual.
- `website/components/BenchmarkSnapshot.tsx`: public benchmark snapshot renderer.

TUI command routes:

- Core app/control: `assistant`, `help`, `exit`, `clear`, `status`, `config`, `reload-plugins`, `theme`, `color`, `model`, `provider`, `usage`, `upgrade`, `login`, `logout`, `oauth-refresh`.
- Agent and memory: `agents`, `agents-platform`, `memory`, `note`, `summary`, `compact`, `context`, `ctx_viz`, `thinkback`, `thinkback-play`, `tasks`.
- Tooling and review: `review`, `autofix-pr`, `bughunter`, `diff`, `pr_comments`, `issue`, `hooks`, `mcp`, `plugin`, `skills`, `permissions`, `sandbox-toggle`.
- Runtime and orchestration: `immaculate`, `apex`, `bridge`, `preview`, `voice`, `desktop`, `mobile`, `remote-setup`, `remote-env`, `teleport`, `session`, `resume`, `branch`.
- Diagnostics and release: `doctor`, `env`, `stats`, `perf-issue`, `heapdump`, `debug-tool-call`, `jaws-trace`, `release-notes`, `output-style`.
- Compatibility and utilities: `add-dir`, `backfill-sessions`, `break-cache`, `btw`, `caveman`, `chrome`, `copy`, `cost`, `effort`, `export`, `extra-usage`, `fast`, `feedback`, `files`, `good-openjaws`, `ide`, `install-github-app`, `install-slack-app`, `keybindings`, `mock-limits`, `onboarding`, `passes`, `plan`, `power`, `privacy-settings`, `rate-limit-options`, `rename`, `reset-limits`, `rewind`, `share`, `stickers`, `tag`, `terminalSetup`, `vim`.

TUI component feature groups:

- Agent management: `AgentDetail`, `AgentEditor`, `AgentsList`, `AgentsMenu`, `CreateAgentWizard`, wizard steps, tool/model/color selectors, agent validation, auto memory availability.
- Core shell: `App`, `Messages`, `MessageRow`, `PromptInput`, `StatusLine`, `LogoV2`, `WelcomeV2`, `ThemePicker`, `QuickOpenDialog`, `HistorySearchDialog`.
- Permissions and governance: permission request components for bash, PowerShell, files, filesystem, notebook, MCP, skills, web fetch, sandbox, plan mode, computer use, rules, and workspace directories.
- Tasks and agents: background task dialogs, deferred teammate launch rows, task detail panels, remote session progress, task receipts, teammate headers and status.
- Settings and integrations: settings pages, MCP settings, hooks settings, sandbox settings, managed settings dialogs, IDE onboarding/status, desktop handoff.
- Rendering and developer UX: markdown, code highlighting, structured diff, file edit diffs, shell output rendering, context suggestions, context visualization, feedback survey.

## Backend and Service Inventory

Next API endpoints:

- `POST /api/signup`: website signup. Calls hosted-Q proxy when configured, local filesystem demo in non-production, and now fails closed in production when unconfigured.
- `POST /api/checkout`: Stripe checkout creation. Calls `createCheckoutSession`.
- `POST /api/keys`: hosted-Q key issue. Calls hosted-Q proxy when configured, local filesystem demo in non-production, and now fails closed in production when unconfigured.
- `POST /api/usage`: hosted-Q usage lookup. Calls hosted-Q proxy when configured, local filesystem demo in non-production, and now fails closed in production when unconfigured.
- `POST /api/webhooks/stripe`: verifies Stripe signature, applies local filesystem event in local mode, proxies verified event JSON to hosted-Q backend in proxy mode, and fails closed when production is unconfigured.

Direct Connect and remote service surfaces:

- `DIRECT_CONNECT` fast path in `src/main.tsx` now resolves its gated source modules from `src/server`: URL parsing, HTTP/WebSocket server, session manager, dangerous local backend, banner/logging, lockfile, and headless connect runner. System check run `system-check-20260426T233313` reported `missingCount: 0`.
- `src/bridge/*`, `src/cli/transports/*`, and session ingress APIs implement remote-control, CCR, SSE, WebSocket, work-secret, and session delivery helpers. These are real backend surfaces, but they are high-risk because they cross local/remote trust boundaries.

Website service functions:

- `website/lib/hostedQService.ts`: `resolveHostedQServiceConfig`, `resolveHostedQServiceMode`, `buildHostedQServiceTarget`, `buildHostedQServiceUnavailableResponse`, `proxyHostedQServiceJsonPayload`, `proxyHostedQServiceRequest`.
- `website/lib/qHostedAccess.ts`: `resolveHostedQLocalMode`, `signupHostedQUser`, `issueHostedQApiKey`, `readHostedQUsage`, `applyHostedQStripeEvent`.
- `website/lib/stripe.ts`: `resolveStripeRuntimeConfig`, `stripeCheckoutReady`, `resolveStripePlan`, `createStripeClient`, `createCheckoutSession`.
- `website/lib/pricing.ts`: `Q_PLAN_DEFINITIONS`, `findQPlan`.
- `website/lib/benchmarkSnapshot.ts`: benchmark snapshot export for public site rendering.

Q runtime and benchmark functions:

- `src/q/freshness.ts`: Q knowledge cutoff, model detection, request freshness detection, runtime date/fresh-context prompt block.
- `src/q/runtime.ts`: provider detection and OpenJaws provider preflight checks.
- `src/q/preflight.ts`: deterministic benchmark seed handling and benchmark preflight requirements.
- `src/q/routing.ts`: route dispatch, worker registration, remote dispatch, lease/status writes, result reconciliation.
- `src/q/hybrid.ts`: Q hybrid lane dispatch and fallback history.
- `src/q/trainLaunch.ts`: Q training launch, Immaculate route target, route failure, Python train args.
- `src/q/terminalBench.ts`: TerminalBench receipt summaries, aggregate summaries, soak cycle receipts.
- `src/q/soak.ts`: Q soak summary.
- `src/q/traceSummary.ts`: Q trace discovery and preferred trace summary.

Immaculate functions:

- `src/immaculate/events.ts`: event schema and stable event creation/serialization.
- `src/immaculate/policies.ts`: fast-path suppression, route lease TTLs, pressure delay, dispatch transport policy.
- `src/immaculate/runtimeCoherence.ts`: runtime coherence report builder across roundtable, Q route, and runtime probes.
- `src/immaculate/benchmarkTrace.ts`: benchmark trace writer lifecycle.
- `src/immaculate/traceSummary.ts`: trace file discovery, classification, summary selection.

Apex bridge functions:

- Root discovery and availability: `resolveApexAsgardRoot`, `resolveApexProjectRoot`, `getApexLaunchTargets`, `getApexLaunchTarget`, `getApexWorkspaceAvailability`.
- Read paths: `getApexWorkspaceHealth`, `getApexWorkspaceSummary`, `getApexSettingsSummary`, `getApexTenantGovernanceSummary`, `getApexChronoHealth`, `getApexChronoSummary`, `getApexBrowserHealth`, `getApexBrowserSummary`.
- Workspace actions: `composeApexMail`, `sendApexChatMessage`, `moveApexMailMessage`, `deleteApexMailMessage`, `flagApexMailMessage`, `createApexChatSession`.
- Store and settings: `installApexStoreApp`, `installApexStoreAppWithReceipt`, `updateApexSettings`, `resetApexSettings`.
- Browser and Chrono: `openApexBrowserSession`, `navigateApexBrowserSession`, `closeApexBrowserSession`, `createApexChronoJob`, `startApexChronoJob`, `restoreApexChronoJob`, `deleteApexChronoJob`, `cleanupApexChronoBackups`.
- Sidecars: `startApexWorkspaceApi`, `startApexChronoBridge`, `startApexBrowserBridge`, `buildWindowsApexLaunchCommand`, `runApexAction`.
- Public summaries: `summarizeApexWorkspace`, `summarizeApexSettings`, `summarizeApexTenantGovernance`, `summarizeApexGovernedSpend`, `buildApexGovernanceRecommendations`, `summarizePublicApexTenantGovernance`, `summarizePublicApexGovernedSpend`, `summarizeApexChrono`, `summarizeApexBrowser`.

Discord operator functions and services:

- `scripts/discord-q-agent.ts`: Discord gateway loop, interaction HTTP endpoint, persona configuration, voice state, PersonaPlex/system/ElevenLabs rendering, OpenJaws operator actions, channel setup actions, file/artifact delivery, public ledger sync, Blackbeak meme fallback.
- `src/utils/discordOperatorWork.ts`: plain-English operator classifier, workspace alias resolution, command parsing, project target inference.
- `src/utils/discordOperatorExecution.ts`: scripted OpenJaws job execution, worktree setup, artifact bundle creation, optional branch/push approval candidates.
- `src/utils/discordExecutionQueue.ts`: serialized Discord operator execution queue.
- `src/utils/discordPublicLedger.ts`: public-safe action ledger state.
- `src/utils/discordQAgentRuntime.ts`: Discord runtime receipt and state summary.
- `src/utils/discordRoundtable*`: roundtable planning, runtime, scheduler, execution, steady-state, and status truth helpers.
- `src/utils/discordOperatorArtifactPrompt.ts`: artifact creation prompt surface.
- `src/utils/discordProjectTargets.ts`: project target catalog and workspace matching.

Voice and internet/tooling services:

- `src/services/voice.ts`: local microphone capture.
- `src/services/voiceStreamSTT.ts`: OpenJaws Team voice_stream WebSocket STT client.
- `src/services/voiceOutput.ts`: ElevenLabs text-to-speech output renderer.
- `scripts/personaplex-probe.ts`: PersonaPlex runtime probe and WebSocket URL builder.
- Web access is currently split between OpenJaws built-in web tools, Discord governed snippet/search helpers, and Apex browser bridge. The Discord agent does not yet run a full browser/tool loop from plain English.

Database and persistence inventory:

- No Prisma, Drizzle, Supabase, Postgres, MySQL, or SQLite application database was found in the active OpenJaws source tree.
- Hosted-Q local mode persists JSON to `.data/q-hosted-access.json` or temp storage on Netlify. This is explicitly dev/demo storage and must not be the production account system.
- Discord runtime state persists JSON/NDJSON files in `local-command-station`, including receipts, operator state, public ledger state, meme state, and delivered artifact bundles.
- Q and Immaculate persist JSON route manifests, worker runtime files, trace summaries, benchmark receipts, and benchmark snapshots under repo-local runtime/artifact paths.
- Apex bridge reads from sidecar APIs and mirrors tenant governance into `docs/wiki/Apex-Tenant-Governance.json` when available.

## UI to Backend Map

- `QLandingConsole` `Sign Up` button calls `POST /api/signup`, which maps to hosted-Q proxy or `signupHostedQUser`.
- `QLandingConsole` `Checkout` button calls `POST /api/checkout`, which maps to `createCheckoutSession`.
- `QLandingConsole` `Generate API Key` button calls `POST /api/keys`, which maps to hosted-Q proxy or `issueHostedQApiKey`.
- `QLandingConsole` `View Usage` button calls `POST /api/usage`, which maps to hosted-Q proxy or `readHostedQUsage`.
- Stripe sends `POST /api/webhooks/stripe`, which maps to `applyHostedQStripeEvent` in local mode or a hosted-Q backend `stripe-webhook` action in proxy mode.
- `/apex` TUI command maps to `src/utils/apexWorkspace.ts` action and summary functions.
- `/preview` TUI command maps to browser preview utilities and, for Apex surfaces, the Apex browser bridge functions.
- `/voice` TUI command maps to `src/services/voice.ts`, `voiceStreamSTT.ts`, and `voiceOutput.ts`.
- Discord mention or interaction routes map through `scripts/discord-q-agent.ts`, then `parseDiscordOperatorWorkRequest`, then `runDiscordOperatorAction`, then `runScriptedOpenJawsOperatorJob` for OpenJaws work.
- Discord file delivery maps to OpenJaws operator artifacts in `.md`, `.txt`, `.html`, `.docx`, and `.pdf`, then posts bundles into the private OpenJaws work channel when Discord auth is healthy.
- Q benchmark scripts map to `src/q/preflight.ts`, `src/q/terminalBench.ts`, `src/q/soak.ts`, `src/utils/wandb.ts`, and benchmark receipt generators.

Dead or disabled TUI routes:

- Disabled compatibility commands: `agents-platform`, `assistant`, `proactive`.
- Stub command modules: `autofix-pr`, `backfill-sessions`, `break-cache`, `bughunter`, `ctx_viz`, `debug-tool-call`, `env`, `good-openjaws`, `issue`, `jaws-trace`, `mock-limits`, `oauth-refresh`, `onboarding`, `perf-issue`, `share`, `summary`, `teleport`, and `reset-limits`.
- `stats` is disabled and its component returns `null`.

## Orphaned, Dead, or Incomplete Surfaces

- Hosted-Q production verifier is missing in this repo. The site can issue local demo `qk_` keys, but there is no production key validation/usage decrement endpoint here.
- `Q_HOSTED_SERVICE_BASE_URL` proxy support exists, but the actual hosted-Q backend service implementation is outside this repo or not yet present.
- `HostedQAction` includes `checkout`, but `POST /api/checkout` bypasses the hosted-Q proxy and uses local Stripe config directly.
- `STRIPE_PORTAL_RETURN_URL` is documented/configured but unused by the current website Stripe helper.
- `installApexStoreApp` and `installApexStoreAppWithReceipt` exist, but no primary TUI flow currently exposes store installation end-to-end.
- Apex `app_store` is not a real installer yet: app IDs are generated on process start and `install_app` records in-memory state without downloading/verifying a runnable binary.
- Apex Vault/security app routes exist in the requested Apex project scope but are not bridged into OpenJaws with policy-grade actions.
- Apex Vault boundary is inconsistent: OpenJaws UI language says Vault is launcher-only, but `workspace_api` exposes Vault summary/add/extract/delete routes.
- Apex `app_store`, `system_settings`, and `enrollment` exist as apps but are not exposed as native OpenJaws launch targets. `enrollment` is effectively invisible.
- Discord agent plain-English routing now catches project work better and #q-command-station can process bounded unmentioned operator/admin commands, but there is still no dedicated slash command like `/q-openjaws` with explicit options, permissions, and audit labels.
- Discord web is not a full tool-call browser loop. It can provide governed snippets/context and OpenJaws prompts, but it still needs a real fetch/browser tool executor with allowlists, receipts, and human approval.
- Blackbeak meme repetition was caused by comparing `mode:focus:content` signatures instead of content similarity. This pass added normalized near-duplicate detection, but live variety still depends on upstream model behavior and state persistence.
- Viola voice remains blocked if the Discord token is invalid. PersonaPlex can be probed locally, but the bot cannot join/speak in voice when Discord auth returns 401.
- Q freshness is runtime prompt/RAG/tooling work, not model weights. `src/q/freshness.ts` can inject the current date and require fresh evidence for current-fact questions, but Q is not truly retrained past June 2024 by this repo alone.
- TerminalBench public leaderboard runs are not proven live on this Windows host. Scripts and receipts exist, but the host still needs the benchmark environment, credentials, and stable runner.
- W&B exists as a utility surface, but TerminalBench-to-W&B publication is not fully wired as a release gate.
- Explicit `--route immaculate` is not guaranteed to route remotely because current policy allows local lanes to win unless preflight says `remote_required`.
- Remote Q dispatch can accept `stateUrl: null`, but pending remote reconciliation requires a state URL; that can strand routes as dispatched.
- Remote Q route result reconciliation fetches remote result envelopes and still needs stricter state/result URL allowlists and replay protections.
- Q trace summary misses the default TerminalBench output tree because it only descends into `artifacts/q-*`, while TerminalBench defaults under `artifacts/terminalbench`.
- Q trainer dependency readiness is not included in Q preflight even though the Python trainer imports `datasets`, `peft`, `torch`, `transformers`, and `trl` at module import.
- OCI Q bridge still has risk where API-key material can appear in CLI/process contexts if not routed through env/stdin-only paths.
- Immaculate tests and coherence probes exist, but not every high-risk path is enforced in CI. Loopback auth, websocket sample caps, BIDS scan caps, and arbitrary actuation endpoints need hardening.
- Public site copy has improved but still needs a final marketing pass across qline.site, iorch.net, and aura-genesis.org from the source repositories that actually deploy those domains. The current copy guard does not scan the full `website` app or most wiki docs.
- Benchmark truth is inconsistent across public surfaces: the website generated snapshot, Benchmark wiki, BridgeBench dry-run state, TerminalBench failure counts, and W&B auth/publication state need a single receipt source before marketing publication.
- `knip.json` and dead-code audit coverage are too narrow for the current feature surface.
- Generated `.next`, `.tmp-*`, `__pycache__`, and operator output artifacts are still present locally and must stay out of commits/releases.

## Production Readiness Matrix

- Green: core OpenJaws TUI shell, command registration, message rendering, permission dialogs, settings surfaces. These are broad and battle-tested, though not all custom Arobi/Q additions are equally mature.
- Green: website static public pages and benchmark snapshot rendering. They build from local source and have straightforward failure modes.
- Yellow: qline.site hosted access APIs. This pass fixed the dangerous production fallback by failing closed when the hosted backend is not configured, but production still needs the real hosted-Q service and key verifier.
- Yellow: Stripe checkout. Checkout creation and webhook verification exist, but subscription-to-entitlement sync is only local or proxied to a backend not present here.
- Yellow: Discord artifact delivery. OpenJaws can create `.md`, `.txt`, `.html`, `.docx`, and `.pdf` bundles, but live Discord delivery depends on valid Discord auth and channel permissions.
- Yellow: Discord plain-English OpenJaws commands. This pass added project-work intent detection, web-research project phrasing, Asgard/Apex aliases, #q-command-station unmentioned command handling, and local runner/workspace fixes. A dedicated command schema and role allowlist are still needed.
- Yellow: Blackbeak meme channel. Repetition protection improved in code and tests, but live behavior needs runtime state observation.
- Red: Viola live voice if the configured Discord token is invalid. Voice cannot be considered production-ready until auth is rotated and the bot can connect to Gateway/voice successfully.
- Yellow: PersonaPlex voice route. Probe and routing exist, but full Discord voice playback remains dependent on Discord auth and host audio/voice bridge stability.
- Yellow: Q freshness. Current-date prompt injection exists, but current knowledge must come from tools, web/RAG, and receipts, not claims that weights were retrained.
- Yellow: Q benchmarks. BridgeBench, TerminalBench, soak, preflight, and W&B utilities exist, but public leaderboard submission needs stable host setup and CI wiring.
- Yellow: Apex integration. Workspace, Chrono, browser, settings, mail, chat, and store bridges exist, and this pass fixed active-root discovery. Vault/security and end-user TUI flows are incomplete.
- Yellow: Asgard/Arobi cross-project consistency. Active source is on `D:\cheeks\Asgard` while some docs and user expectations still point at the C desktop stub. This pass fixed OpenJaws local operator roots and `.env.example`, but external deploy configs still need a sweep.
- Yellow: Immaculate orchestration. Runtime coherence, trace, policy, and routing helpers exist, but security and CI hardening are not complete.
- Red: public 00/showcase opening if exposed without strong guards. Any temporary public line for demonstration must be feature-flagged, non-sensitive, audited, time-boxed, and closed after the showcase.

## Surgical Fix Plan

- Validate current patches with focused tests, full build, website build, diff whitespace checks, and CI status.
- Add a dedicated Discord `/q-openjaws` command with explicit project, action, visibility, artifact, and approval options.
- Add Discord role/user allowlists for OpenJaws, channel management, invite creation, file delivery, voice movement, and branch/push approvals.
- Add startup/preflight health that marks Discord operator execution blocked when the configured OpenJaws runner contains permission-bypass flags.
- Replace Discord snippet-only internet behavior with a governed browser/fetch executor that records URL, requester, reason, result hash, artifacts, and human approval state.
- Make OpenJaws command-station handling configurable by channel ID/name and add regression tests for unmentioned plain-English commands in #q-command-station.
- Move OCI API-key usage to env/stdin-only execution paths and add tests that assert secrets do not appear in command args, logs, receipts, or process titles.
- Make explicit `--route immaculate` force remote route selection, require non-null remote `stateUrl`, and clean up worker state when harness registration fails.
- Add remote Q route replay/freshness validation, state URL allowlists, result envelope signatures, and stale-result rejection.
- Promote Q freshness behavior from prompt-only to a required runtime policy for current-fact questions, with explicit evidence citations in receipts.
- Wire TerminalBench, BridgeBench, soak, and W&B publication into a single benchmark gate that can run dry-run locally and live in CI.
- Expand Q trace discovery to include TerminalBench's default artifact tree.
- Harden Immaculate loopback auth, websocket event caps, BIDS scan caps, and actuation endpoint allowlists.
- Bridge Apex Vault/security actions into OpenJaws with narrow policies before exposing broader Apex app actions in Discord, or remove the Vault API surface from the sidecar until policy is ready.
- Replace Apex App Store's in-memory install record with stable app IDs, signed manifest verification, and real binary/package placement before treating installs as production.
- Finish public copy cleanup in the repositories that deploy `qline.site`, `iorch.net`, and `aura-genesis.org`; remove internal asides, future-dated claims, and footnote-style language.
- Expand dead-code tooling beyond scripts, ignore generated artifacts, and add release checks for generated worktree leakage.

## Completed in This Pass

- Hosted-Q site APIs now fail closed in production when no hosted backend is configured.
- Stripe webhook can proxy verified event JSON to a hosted-Q backend action.
- Discord plain-English project requests now route to OpenJaws more reliably.
- Discord plain-English web research plus project work now routes to OpenJaws, while generic current-fact questions still stay in chat.
- The local visible OpenJaws runner no longer requests permission-bypass flags, so it satisfies the Discord operator runner policy instead of being blocked by it.
- The local `openjaws-d` operator workspace now points to `D:\openjaws\OpenJaws`, not the parent `D:\openjaws` directory that resolves to the dubious `D:\` Git root on this host.
- Discord config now accepts legacy `DISCORD_CLIENT_ID`/`DISCORD_GUILD_ID` aliases while documenting the canonical `DISCORD_APPLICATION_ID`/`DISCORD_DEFAULT_GUILD_ID` names.
- Guild messages in #q-command-station, or the configured default channel, can now process bounded unmentioned operator/admin commands after the same authorization checks.
- OpenJaws operator workspace aliases now include active `D:\cheeks\Asgard` and Apex apps paths.
- Apex root discovery now prefers the active D checkout when the C desktop stub is absent.
- Blackbeak meme fallback rotation now blocks near-duplicate content with normalized content similarity instead of exact signature only.

## Validation Snapshot

- Focused Discord/OpenJaws tests passed: `bun test src/utils/discordOperatorWork.test.ts scripts/discord-q-agent-personaplex.test.ts src/utils/discordQAgent.test.ts scripts/discord-agent-auth-preflight.test.ts src/utils/discordOperatorExecution.test.ts` reported `72` pass, `0` fail.
- `bun scripts/run-unit-tests.ts --scope src` passed with `516` source tests.
- `bun scripts/run-unit-tests.ts --scope scripts` passed with `85` script tests.
- `bun run verify:ci` passed end to end. The pass included `audit:knip`, script coverage, source tests, public showcase copy check, TUI build, benchmark snapshot check, and Next production website build.
- Script coverage during `verify:ci` passed at `29.65%` lines against the 15% gate.
- Website production build passed. Generated routes include `/`, `/success`, `/cancel`, `/terms`, `/privacy`, `/robots.txt`, `/sitemap.xml`, and all hosted-Q API routes.
- `showcase:copy:check` reported `ok: true`, no missing required public mirror, and no public-copy violations across its configured targets.
- `git diff --check` passed with only existing CRLF normalization warnings.
