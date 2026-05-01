# Release Notes

This is the long-form release surface. The updater-facing changelog that `/release-notes` fetches lives at [../../CHANGELOG.md](../../CHANGELOG.md).

## Current Public Ship Surface

This page summarizes the current public OpenJaws surface that is already working in the repository and shipped build.

## Publishing Guardrail

- the OpenJaws repo is no longer allowed to publish the live `qline.site` production site
- the canonical live website repo is now `https://github.com/PossumXI/q-s-unfolding-story`
- the legacy deploy helper in OpenJaws now fails closed unless `OPENJAWS_ALLOW_LEGACY_QLINE_DEPLOY=1` is set explicitly for an emergency override
- this guardrail exists because the old OpenJaws website copy drifted from the new live website codebase and should not be treated as the production source of truth anymore

## TUI and Branding

- JAWS Desktop is now scaffolded as the native Tauri app lane for OpenJaws, with the OpenJaws backend bundled as a sidecar, signed updater artifact wiring, a collapsible workspace shell, Q/Q_agents/OpenCheek/Immaculate surfaces, Arobi enrollment, co-work pairing, marketplace, studio, arcade, billing, layout themes, an original blue shark-jaws logo asset, and the Settings/update page plus bundled Cyber Frog companion asset.
- JAWS Desktop 0.1.5 is the next release lane for the merged Context Brain, notification, preview hardening, shell quoting hardening, CodeQL-clean JAWS desktop app, project-scoped chat windows, token/profile economy, dynamic context fallback, and Hold'em control pass.
- JAWS Desktop 0.1.5 is prepared for GitHub release and mirrored through `qline.site/downloads/jaws` and `iorch.net/downloads/jaws`; both route installer and updater-manifest downloads back to the signed `jaws-v0.1.5` GitHub release assets.
- The live qline.site and iorch.net updater endpoints should return a signed `0.1.5` update payload for `0.1.4` tester installs and `204 No Content` for current `0.1.5` installs once the tag workflow publishes the assets.
- JAWS Desktop 0.1.5 keeps native Playwright demo harness receipt integrity hashes and keeps the generated `release-index.json` aligned with the published `jaws-v0.1.5` asset set.
- JAWS Desktop release probes now derive current/previous update-test versions from the generated release index, and the tag workflow publishes the signed release after artifact upload so tester installs can see the update prompt without a manual draft-publish step.
- `bun run jaws:mirror:check` now verifies the qline mirror, iorch mirror, GitHub release asset list, and signed updater manifest before a release pass can be called complete.
- JAWS Desktop arcade now has real gameplay foundations: `Slow Guy` has scored lane controls, jump/duck/dash mechanics, hazards, token pickup, stamina, best-score persistence, and Cyber Frog reward hooks; the new Texas Hold'em Dealer Roundtable uses deterministic local dealing, `pokersolver` showdown scoring, table chat, Q/OpenCheek seats, and secure multiplayer metadata for the future PvP websocket room.
- JAWS Desktop Settings now exposes update-pipeline diagnostics for the Tauri updater, qline mirror, iorch mirror, and GitHub release lane; layout themes now include richer palette tints, descriptive cards, and accent swatches.
- JAWS Desktop now generates `src/release-index.json` from the desktop package version and uses it as the shared release contract for Settings, the native Tauri mirror probe, and `bun run jaws:mirror:check`.
- JAWS Desktop Agent Watch now reads a native bounded snapshot from `artifacts/q-runs` route queue, route workers, and worker runtime files, with static events retained only as non-Tauri fallback.
- JAWS Desktop now exposes the OpenJaws browser-preview capability as a native Preview tab with embedded web view, `.openjaws/launch.json` authoring, `/preview` sidecar routing, receipt inspection, and Playwright codegen/test workflow staging.
- JAWS Desktop now stages supervised browser-control tasks from Preview into Chat, with explicit approval language before forms, resumes/applications, emails, purchases, account changes, or other irreversible browser actions.
- JAWS Desktop now exposes Q_agents co-work as real native controls for stacked/paired/solo routing, Q planner, Q_agent implementer, Q_agent verifier, shared phase memory, co-work room status, and explicit pooled-credit consent.
- JAWS Desktop Chat now supports project-scoped chat windows with minimize, expand, side-tool collapse, close-to-archive, and Chat Sessions resume controls, so multiple project folders can keep separate workstreams without losing or cluttering the native workspace path.
- JAWS Desktop now includes Context Brain, a privacy-preserving project-context receipt that shows what the app scanned, which priority files shape the agent context, what was skipped for safety or generated/binary reasons, estimated context weight, and the Q/Q_agents/OpenCheek/Immaculate lanes that receive the context pack. Preview mode no longer displays hardcoded context counts; it reports native scan required.
- JAWS Desktop Agent Watch now includes a dynamic orchestration board generated from runtime events so users can see where Q/Q_agents/OpenCheek/Immaculate lanes are and what they are doing.
- JAWS Desktop now checks the signed updater on native startup and shows a topbar Install Now / Later prompt when a release is available; Settings keeps the manual update check and install path. The notification history is now persisted locally, normalized on read, and shared between the topbar bell tray and Settings with unread, mark-read, dismiss, clear, fireworks, and generated sound cues for update-prep, agent-complete, and human-input-required events.
- JAWS Desktop Settings now exposes a real Inference panel for provider/model/base-URL tuning, route policy, native route status, live provider probe, and staged provider commands; the native bridge uses direct `openjaws provider ...` commands instead of routing diagnostics through the long-running chat turn path or full CLI session bootstrap.
- Slow Guy now has recoverable lives, shield frames, level progression, and in-game token tracking on top of its existing lane, hazard, stamina, and best-score loop.
- Texas Hold'em now has hold/check/pass/bet/raise controls, table-chip accounting, Q/OpenCheek responses, fold wins, showdown pot settlement, and profile code-token prizes.
- JAWS Desktop now has an in-app Docs and Legal page with Terms, final-sale billing policy qualified by applicable law, security/privacy notes, community content rules, AI output notice, developer verification commands, and public release links.
- The native installer publisher is pinned to `AROBI TECHNOLOGY ALLIANCE A OPAL MAR GROUP CORPORATION NJ USA`; the release config gate now fails if that attribution drifts.
- `bun run jaws:soak -- --duration-ms 300000 --users 5000` adds a five-minute durability lane for logo rendering, docs/legal presence, release metadata, updater security, Agent Watch bridge wiring, Slow Guy, Hold'em, and synthetic user-presence scaling.
- Website checkout and billing coverage now tests Stripe readiness, checkout route fail-closed cases, hosted billing proxy mode, local entitlement activation from `checkout.session.completed`, cancellation from `customer.subscription.deleted`, usage receipts, key blocking before checkout, and webhook signature verification.
- Stripe webhook verification now uses the SDK async verifier so the Next/Bun route can validate signed Stripe webhooks without failing on the SDK SubtleCrypto provider.
- `bun run service:routes` now audits qline/iorch public routes, JAWS updater endpoints, local Immaculate/Q/Apex admin routes, and required production config classes for OCI, Cloudflare, database, mail, hosted-Q, and AROBI LAAS without printing secrets.
- `services/cloudflare-hosted-q` now provides the repo-owned Cloudflare Worker/D1 backend package for hosted-Q signup, Stripe checkout/webhook entitlement sync, key issuance, usage, JAWS profile fields, code-token wallets/ledger events, promotion campaign/contact capture, Resend notifications, and AROBI LAAS ledger events, with tests and service-route health recognition.
- `bun run service:routes` now separates backend package presence from real provisioning, so hosted-Q, production database, Cloudflare/D1, Stripe billing, mail, and AROBI LAAS stay `not_configured` until concrete non-placeholder bindings or live routes exist.
- `bun run services:backend:preflight` now gives operators a no-secret hosted-Q deploy gate for Cloudflare auth, concrete D1 ids, route patterns, worker secret key presence, and qline/iorch proxy env before remote migration/deploy commands run.
- `bun run apex:bridges` and `bun run apex:bridges:start` now give operators a direct local repair lane for Apex workspace, Chrono, and browser bridge health instead of leaving 8798/8799 warnings without a bounded launch command.
- `bun run runtime:coherence` now includes Apex workspace, Chrono, and browser bridge probes too, so browser preview and Playwright demo readiness are visible in the same release audit as Immaculate, Q, Discord agents, roundtable, and PersonaPlex.
- FIGlet-style `OPENJAWS` banner now uses a six-row ANSI-shadow treatment with the `OPENCHEEKS // ANSI-SHADOW FLIGHT DECK // IMMACULATE` deck line across the startup TUI
- ocean-blue flight-deck styling is used across the cockpit, footer, task surfaces, and wiki/repo entry pages
- shark mascot animation now breaches through the waterline instead of acting as a static icon
- public docs and wiki now mirror the same branded banner treatment
- Settings now expose dedicated `Appearance` and `Privacy` tabs instead of leaving theme/privacy controls mixed into one generic list
- the local Settings deck now includes a Privacy mode for telemetry/nonessential-traffic policy and clearer `auto` / `dark` / `light` theme behavior so installed users can tell what the app will actually render
- command rediscovery is clearer too: `/help`, `/config`, `/theme`, and `/privacy-settings` now form the obvious public-safe entry points for operator setup
- `/help` now pulls its quick-start section from the real command registry and shows aliases plus argument hints in the command browser instead of a static bare-name list

## OpenCheek Agents and Task Deck

- multi-agent crew fan-out with Immaculate-paced burst budgeting
- deferred teammate launch queue with inspectable rows, detail dialogs, and operator controls
- coordinator, footer, and background-task surfaces now share one pressure vocabulary
- queued launches, retry pressure, approval pressure, and routed work are visible before they fail
- task, tool, co-work, and delivery surfaces now share one compact output vocabulary too, so completed / waiting / retry states and handoff summaries stop drifting between different parts of the app
- the Gemini media helper now exposes a direct probe plus structured quota/auth/model classification, so Discord media bots can fall back cleanly when Google blocks media generation upstream
- the Discord mention help, locked operator manual, and per-bot command surface now come from one shared capability-aware command catalog instead of drifting across separate help copies
- the tracked Discord operator modules now own the shared parser, worktree creation, verification, commit, and approval-push helpers that both the private operator lane and the roundtable lane consume, which removes one of the last big local-only execution drifts
- the new tracked Discord execution queue and roundtable executor modules now also own shared lease, dedupe, approval-target, and bounded roundtable job execution semantics, so direct operator runs and roundtable runs stop diverging at the approval checkpoint
- the tracked roundtable scheduler policy now owns fallback root scoring, approval TTL resolution, and reply/PASS inspection as well, which gives the private Discord loop a tested way to prefer repo-grounded progress over idle `PASS` turns
- the shared roundtable execution classifier now fails mixed code-plus-artifact outputs closed, so only verified code-bearing branches without generated audit or artifact spillover reach the approval checkpoint
- tracked sync passes now preserve the authoritative live roundtable channel, quarantine malformed handoffs instead of aborting the runtime, and mark no-diff results as `skipped` so weak outcomes stay out of the approval lane

## Agent Co-Work

- each active crew terminal now gets a unique `terminal_context_id`
- team files now keep a shared terminal registry so sibling agents can reuse known workspace, model, routed-Q, and Immaculate facts across related projects on the same machine
- spawned teammates now inherit OCI `Q` and Immaculate env wiring explicitly instead of rediscovering provider state in a fresh shell
- in-process teammates now honor their requested working directory too, so cross-project help stays aligned with the actual project being worked
- the team dialog and `/status` now surface the shared co-work registry, so operators can inspect terminal IDs, project roots, and registry receipts without opening raw config files
- resumed teammate sessions now rehydrate their saved terminal context IDs, which keeps co-work handoffs intact after reconnects or reloads
- co-work now writes a phase ledger too, so request summaries, teammate handoffs, and delivered outputs stay attached to the same work phase instead of disappearing between turns
- agents can now bind new work to an exact saved phase instead of guessing, including direct teammate syntax like `@scout [phase:phase-abc12345] continue`
- the shared registry is designed for same-owner co-work and path/runtime facts only; it is not a secret dump and does not write credentials into team memory
- the co-work hot path now keeps an indexed in-memory team view during a live session, so helper handoffs stop rereading and rescanning the same team file on every cross-terminal step
- the first Phase 1 `src/q/*` split is now live, and the routed launch / dispatch / worker / poll / hybrid helpers now sit there too, so shared provider preflight, route dispatch, route processing, result reconcile, and TerminalBench receipt math stop drifting across separate `q-*` scripts

## Apex Workspace Bridge

- `/apex` now gives OpenJaws a bounded local command-center lane for an external Apex workspace
- the typed `workspace_api` bridge can surface mail, chat, store, system, and security summaries directly into OpenJaws
- the new dedicated `chrono-bridge` wraps `apps/chrono/src/lib.rs` into a bounded localhost backup surface instead of pretending the desktop GUI is native TUI UI
- the `/apex` deck now exposes those bridge-backed surfaces through dedicated `Mail`, `Chat`, `Store`, `Settings`, `System`, `Chrono`, and `Security` tabs
- `/status` now also surfaces bounded Apex governance recommendations, so the shared tenant-governance lane can point operators toward `Mail`, `Security`, `System`, or `Store` follow-up work without widening the bridge contract
- `/apex` can now send Aegis Mail drafts, move/delete/flag selected mail items, create Shadow Chat sessions, post into those sessions, and install Store apps with a structured receipt through the same trusted bridge contract
- `/apex` can now read Apex system settings and toggle telemetry, privacy mode, firewall, realtime monitoring, and hardware acceleration through the trusted `workspace_api` settings contract, with reset and receipt logging included
- browser, security center, vault, and related Apex desktop apps stay launcher-backed and out of process instead of being hard-embedded into the TUI
- the browser now has a dedicated bridge-backed preview lane inside OpenJaws; launcher-only desktop apps remain outside the TUI
- Apex launches now use a reduced allowlisted environment, and the bridge is only trusted when OpenJaws launched it itself unless the operator explicitly opts into trusting a pre-existing localhost listener
- the workspace bridge launcher now auto-discovers a local `libclang` runtime on Windows when the upstream Apex workspace needs it to compile
- the bounded runtime contract is now documented explicitly too: `8797` for `workspace_api`, `8798` for `chrono-bridge`, `8799` for the browser bridge, `%TEMP%\openjaws-apex\*` for the runtime logs/state files, and `x-openjaws-apex-token` as the default trust header for launched bridges
- the settings lane is now bridged over `workspace_api`; `vault` remains launcher-backed until it has its own narrower trust contract
- `Notifications` and `argus` remain intentionally outside agent control until they have their own narrow localhost bridges plus confirmation and audit ladders

## Accountable Browser Preview

- `/preview` now opens native in-TUI app previews and supervised browse/watch/music sessions under one explicit receipt
- each session keeps intent, rationale, requester, and runtime handler visible instead of letting agents browse without an explanation trail
- the JAWS Desktop Preview tab now writes a workspace-local Playwright demo harness with README, config, test spec, receipt, and deterministic receipt hash, so users can make repeatable demos from the embedded browser lane
- the preview lane now uses the dedicated Apex browser bridge instead of preferring Chrome-compatible preview for normal session rendering
- user browsing history stays private by default; only Q or agent-led browsing is persisted for accountability
- localhost/private-network targets are now reserved for explicit `preview` sessions so the general browse/watch/music lanes stay on public URLs
- private user sessions are now redacted from shared `/status` surfaces unless the session is an accountable Q or agent handoff
- agent navigate/close actions now fail closed when they target a private or unknown user browser session, so the native preview lane cannot mutate unsupervised user browsing state by accident
- `/status` now reports the live bridge-backed preview session first and only uses the last accountable receipt as fallback context

## Immaculate Integration

- Immaculate is now part of the default OpenJaws runtime context
- per-turn checkpoints are injected into the main loop, tool rounds, and agent spawn/resume paths
- crew launch pacing, retry windows, route assignment, and worker health all use the same orchestration layer
- routed `Q` execution now uses signed manifests, worker assignment, remote dispatch, and signed result reconciliation
- the Immaculate integration notes now carry the verified hybrid-session, OCI-training, W&B, and benchmark publication contracts that OpenJaws is aligning against
- the tracing lane now has a typed `src/immaculate/events.ts` schema plus structured session-trace writing, and benchmark lanes now emit deterministic trace-backed receipt files with signature blocks when a signing key is configured
- `/status` and `/immaculate` now prefer the active typed trace for the run in flight, and `/status` applies the same active-run-first selection to Q benchmark traces before falling back to the newest completed receipt
- routed `Q` fallback thresholds, route lease timing, worker lease duration, and Immaculate crew pressure delays now come from one shared policy layer instead of drifting across launch, routing, and worker helpers
- `bun run runtime:coherence` now audits live harness reachability against Discord receipts, route queue depth, trace summaries, roundtable state, local bot health, PersonaPlex voice readiness, and Apex bridge readiness
- `system:check` now includes that live runtime coherence pass as an allow-failure audit instead of leaving the live-control surface unverified
- `bun run personaplex:probe` is now a tracked release command, and runtime coherence includes PersonaPlex WebSocket readiness with a non-secret local repair hint for the voice launcher
- Discord runtime receipts now normalize older payloads on read so `/status` can keep rendering a stable gateway/voice view across older local receipt files
- `bun run orchestration:guardrails` now turns the safe parts of the system-card and Symphony review into a release gate for aggregate-only Context Brain, signed Q routing, health-gated workers, honest TerminalBench receipts, PersonaPlex redaction, runtime coherence, public copy safety, and JAWS mirror health

## Provider and First-Run Setup

- fresh public installs now default to `Q` in the picker, backed by `oci:Q`
- first-run setup lane lets shipped users choose provider/model, wire keys, and check Immaculate reachability without slash-command knowledge
- `/provider key` and `/provider base-url` make OCI/Q key rotation and endpoint changes explicit
- `/status` surfaces provider, model, runtime, sandbox, routed work, worker health, and recovery guidance
- `/provider` and `/remote-env` are treated as explicit operator controls rather than silent fallback mechanisms

## Security and Release Posture

- MIT licensed public repository
- public updater is GitHub Release-backed, tag-gated, and controlled by `release-policy.json`
- rollout stays fail-closed when policy, manifest, or published assets are unhealthy
- remote `Q` execution uses signed request and signed terminal result envelopes
- worker registration, worker heartbeat, and route assignment now fail closed instead of degrading silently
- shared process execution now validates the executable field as one executable name/path and forces no-shell argv execution, closing the CodeQL #10 root cause where a dynamic executable string could look like a shell command line even though arguments were already passed separately

## Live Benchmark Story

The public benchmark narrative now comes from live Immaculate runs, not placeholders.

- 60-minute soak run recorded in the live Immaculate benchmark source
- 60-second benchmark run recorded in the live Immaculate benchmark source
- the source Immaculate benchmark pass reported benchmark publication, CI, security, and GitGuardian green

See [Benchmark Status](Benchmark-Status.md) for the currently published benchmark record and why it improves OpenJaws.

OpenJaws now also has a local `Q` comparison lane for real repo work:

- audited bundles now emit pack-ready `bundle-manifest.json` data for `all`, `coding`, `agentic`, `security`, and `general`
- `bun run q:bridgebench` runs eval-only local pack checks and writes Rewardkit-style `reward.json` receipts
- `bun run q:curriculum` runs bounded specialization passes and benchmarks those adapters back against the audited packs
- `bun run q:hybrid` coordinates one bounded local lane and one Immaculate-routed lane under one receipt
- `bun run q:terminalbench` adds a Harbor / Terminal-Bench adapter lane for external terminal-task evaluation
- `bun run q:terminalbench:soak` adds a bounded repeated Terminal-Bench soak lane above the per-run verification surface
- `bun run q:soak` adds a 30-minute bounded repeated-probe soak lane for native OpenJaws plus direct OCI Q
- `q:terminalbench` now supports `--repeat` and writes `attempts[]` plus flattened `tasks[]` receipts, so repeated-run stability and real multi-task concurrency are visible in one JSON artifact
- `q:terminalbench` now also supports `--soak`, which writes `cycles[]`, a top-level `soak` block, and still keeps flattened `attempts[]` / `tasks[]` receipts for compatibility
- `q:terminalbench` now supports verifier-driven repair and first-nonzero task selection: failed receipts can emit a `repairPlan`, `--benchmark-repair-hint` feeds prior verifier output back into the Harbor agent, and `--task-selection-lane` can rotate through candidate public tasks before the next official attempt
- the Windows Harbor wrapper now prefers an isolated `.tools/harbor-venv` plus the repo-patched launcher, avoiding global Python dependency conflicts during TerminalBench preflight
- Q_agents crew launch orchestration now reuses one Immaculate deck receipt for pacing and handoff, reducing duplicate live probes while keeping launch pressure decisions consistent
- routed Q dispatch now fails closed when an assigned worker is marked `stale` or `faulted`, and the queue rejection carries that health reason before any local process or remote HTTP dispatch is attempted
- `verify:release` now uses `system:check:live:strict`, so live warnings from Viola auth, PersonaPlex, or runtime coherence fail the production release gate instead of passing as diagnostic-only output
- PersonaPlex probe failures now include runtime-state context such as mode, PID, and last healthy age, making stale Moshi bridge receipts faster to diagnose without exposing secrets
- official Terminal-Bench mode now emits the public-leaderboard-compatible Harbor timeout multiplier (`1`) and fails validation if an official run tries to modify that timeout
- the direct `q:soak` lane and the Harbor-backed `q:terminalbench` lane now share the same OCI/Q provider probe surface before launch, so the direct and Harbor receipts agree on when the provider path is healthy, failed, or merely forceable
- the benchmark wrappers now also share one typed `q:preflight` checklist surface, so Harbor, Docker, Python, bundle, provider, and clock checks all come from one source of truth instead of separate script-local logic
- `q:bridgebench`, `q:soak`, and `q:terminalbench` now all accept `--seed`, default to `42`, and emit that seed into their reports plus signed receipts
- benchmark receipt signing now uses canonical JSON plus Ed25519, which keeps signature verification stable across reserialization
- `q:terminalbench` now scrubs Harbor raw `jobs/.../result.json` env maps in place after a run so the wrapper does not leave plaintext agent env bundles behind in those local artifacts
- hybrid `Q` sessions now keep a rolling 3-failures-in-60s transport hysteresis window for the Immaculate fast path, so a single transient route miss no longer flips the whole hybrid lane into fallback behavior
- the release CI lane now restores the REPL bridge active export, filters invalid Windows glob scan artifacts out of website snapshot generation, and builds the soak sample fixture inside the workflow instead of depending on an untracked local dataset
- the website snapshot generator now resolves receipt globs through a safe Node glob path, respects live-over-generic receipt priority, and is covered by dedicated script tests so the Windows hosted verification and scripts coverage gates stay honest
- hybrid, curriculum, benchmark, and routed launch receipts can now carry a shared `lineage_id` plus optional `phase_id`, so the local lane, routed lane, and follow-up benchmark reports stay attached to the same intentional work thread
- `Q` training and benchmark receipts now record W&B readiness so live logging state is visible instead of guessed
- the Windows OCI bridge now stages larger payloads through temp files so `q:terminalbench --dry-run` can prove Harbor, Docker, and the local OCI-backed OpenJaws lane are actually ready instead of dying on argv length
- the Harbor adapter now stages a Linux Bun runtime plus OCI bridge Python dependencies inside the container and embeds OCI IAM config material into the staged Linux runtime, which moved the live Terminal-Bench lane from setup failure into real execution
- the repo now carries a scheduled `Q Benchmark Soak` GitHub workflow that emits sample benchmark, hybrid, and Terminal-Bench dry-run receipts as artifacts
- the local Discord `Q_agent` station now runs scheduled Immaculate-aware patrols, controlled room routing, and first-phase ElevenLabs speech attachments, with one shared receipt file surfaced back into `/status`
- that same private Discord lane now keeps a secret-safe local knowledge index and explicit operator-only OpenJaws actions under the same receipt, so operators can see both what Q knows locally and what it touched
- the private Discord operator lane can now launch bounded OpenJaws runs inside disposable git worktrees and per-job branches, report changed files plus verification results back into Discord, and hold pushes behind explicit approval checkpoints instead of auto-pushing code upstream
- that same operator surface now exposes `workspaces`, `openjaws-status`, `start-openjaws`, `ask-openjaws`, `github-status`, `ask-github-openjaws`, `pending-pushes`, `confirm-push`, and `stop-openjaws` behind the same approved-root and operator/trainer gate instead of a hidden shell
- that same operator lane can now hand off a bounded request to the hosted `@openjaws` GitHub App by opening a prepared issue against the target repo, which lets supervised work continue remotely when the local machine goes offline
- the private roundtable lane now deduplicates work by canonical project scope and uses a queued lease ledger plus approval checkpoints, so multi-agent 4-hour sessions keep taking bounded actions without piling duplicate work onto the same repo path
- the tracked roundtable runtime now emits explicit transition receipts and `roundtable-status` summaries, so approval-ready branches, skipped jobs, and rejected jobs are visible from the shared operator surface instead of only in local runtime logs
- the tracked roundtable/runtime readers now reconcile the live Discord log when the persisted session file drifts, so runtime coherence and operator status surfaces report the actual active channel plus freshest approval summary instead of a stale preferred-channel alias
- the Q trace reader now uses a fail-closed filesystem walk instead of a Bun glob scan, so nested benchmark traces still resolve on Windows even when the local artifacts tree contains bad path entries
- the private roundtable lane now also rolls forward in continuous 4-hour windows, accepts direct project commands like `start an openjaws session for project openjaws|immaculate|asgard|sealed and ...`, keeps `SEALED` in its shared project knowledge scope, and limits autonomous branch/worktree execution to git-backed roots so manual-only folders do not clog the queue
- that same approval path now supports clean rejection of unsafe note-only or artifact-mixed autonomous branches, which frees the per-project lease for the next bounded pass instead of silently blocking new work
- the `Security` GitHub workflow now fetches full repository history before gitleaks runs, which fixes the shallow-range failure that was leaving the release branch red without an actual secret finding
- the private Discord voice lane now supports live voice-channel presence for the internal station, but it remains a local/private experimental operator feature rather than a public hosted promise

This is useful for tuning and honest before/after comparison. It is not a replacement for the public Immaculate benchmark source or a fake Harbor / Terminal-Bench leaderboard claim.

Current April 29, 2026 local snapshot:

- BridgeBench latest lane: `q-bridgebench-20260429T024506` dry-run completed; the local scored pack lane is still blocked by host memory pressure, so no new public score is claimed from this pass
- historical local BridgeBench score retained for comparison: best pack `all` at `36.84`
- 30-minute soak: `52/52` successful probes, `0` errors
- local W&B lane: attempted, but no local auth was configured so the run stayed receipt-only
- April 29 official TerminalBench rerun for `circuit-fibsqrt`: `5` trials with `0` execution-error trials, `5` benchmark-failing trials, reward `0.0`, and `0` benchmark passes
- April 18 direct OCI `Q` reasoning validation answered the fallback-hysteresis check correctly with `t = 70s`
- April 18 direct OCI `Q` media validation returned `404` on the native image endpoint, so image/video stays on a separate explicit media lane instead of silently replacing `Q` as the session mind
- the dedicated Gemini media lane is restored for explicit image/video work, but the configured Gemini project on this machine is still quota-blocked
- local Harbor / Terminal-Bench lane:
  - single-task live receipt now reaches clean Harbor completion under OCI `Q`
  - official public-task five-attempt receipt now exists at `artifacts/q-terminalbench-official-public-20260429-circuit-fibsqrt-rerun/terminalbench-report.json`, with `0` runtime errors, `5` benchmark failures, reward `0.0`, and Harbor raw env bundles scrubbed in place
  - that same receipt is now packaged and submitted through the official leaderboard discussion flow:
    - `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141`
  - repeated-attempt stability receipt captured `1` benchmark-failing trial plus `1` execution-error trial across `2` attempts
  - repeated soak live receipt now exists at `artifacts/q-terminalbench-soak-live-20260417-circuit-fibsqrt-v3/terminalbench-report.json`
    - result: `completed_with_errors`
    - truth: `2` cycles produced `2` total trials, `0` runtime errors, and `2` benchmark-failing trials
  - real concurrent receipt captured `2` live tasks at concurrency `2`
  - the earlier Windows Docker context mismatch is now covered by a Harbor-process Docker preflight check before public runs
  - task outcomes are still reward-0, so the lane is credible for public execution proof but not ready for strong leaderboard positioning

This pass also tightens the public `Q` runtime story:

- OCI-backed `Q` one-shot surfaces now share a single OCI bridge path for both bearer-key and internal IAM auth
- `/provider test oci Q` now targets the OCI responses lane instead of pretending OCI is a generic `/models` endpoint
- the docs now separate downloaded public installs, internal IAM operator surfaces, and any future hosted paid-`Q` service boundary more explicitly
- the repo now includes a Netlify-ready Next.js `website/` surface for public Q signup, plans, Stripe checkout, API keys, credits, and usage UI
- that website lane can exercise a local filesystem-backed hosted-Q demo flow during development while still failing closed in production when no real backend is attached
- `https://qline.site` is now the canonical public hosted-Q domain and serves valid HTTPS, with Stripe webhook traffic intended for `/api/webhooks/stripe`
- `https://qline.site` now foregrounds OpenJaws, Q_agents, Agent Co-Work, the public GitHub repo, and the latest verified benchmark snapshot, and the shared-link preview now uses a dedicated Q/OpenJaws share card instead of the old static poster
- the public website benchmark snapshot is now generated from checked-in receipts and checked in CI so release copy cannot drift silently away from the real artifacts
- the local release sweep now also includes a live same-site `qline.site` smoke so the published Netlify handler/runtime/content state is checked alongside the repo build before a ship pass is called clean
- the guarded `qline.site` deploy helper now also falls back to the authenticated Windows Netlify CLI config when the repo-local CLI config is missing, so same-site redeploys stay anchored to the real project auth on this machine
- the public website build lane now uses a Node-driven Next production build wrapper on Windows, which avoids the Bun-vs-Next manifest/diagnostics flake that was poisoning local release verification
- `system:check` now exits nonzero on real failures, and the unit-test lane is scoped to the live repo `src/` and `scripts/` trees so mirrored benchmark artifacts cannot fake-break or fake-green a release pass
- the CI lane now adds a bounded Phase 0 hygiene gate too: `scripts/` dead-file scan via `knip` plus a `15%` non-test scripts coverage floor before the main verify sweep runs
- the website snapshot checker now fails closed on local drift while still falling back to the committed generated snapshot on runners that do not have private live benchmark receipts checked out, and the typed trace-summary tests now isolate their temp output so parallel CI runs do not collide
- the Windows website build wrapper now provisions `website/` dependencies on demand when CI runners do not have a prebuilt nested `node_modules` tree, so `verify:ci` and `verify:public` no longer depend on local install layout quirks
- routed Q dispatch now rejects insecure public `http://` execution endpoints unless the target is trusted local infrastructure or the operator explicitly accepts host risk

## What Is Planned Next

- deeper off-host worker execution through Immaculate-visible capability assignment
- more release-safe installed-user update paths without breaking local source workflows
- broader live walkthrough coverage for operator surfaces beyond settings and deferred launch controls
- continued tightening of compatibility shims where it is safe and does not break provider contracts
