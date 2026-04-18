# Release Notes

## Current Public Ship Surface

This page summarizes the current public OpenJaws surface that is already working in the repository and shipped build.

## TUI and Branding

- FIGlet-style `OPENJAWS` banner now uses a six-row ANSI-shadow treatment with the `OPENCHEEKS // ANSI-SHADOW FLIGHT DECK // IMMACULATE` deck line across the startup TUI
- ocean-blue flight-deck styling is used across the cockpit, footer, task surfaces, and wiki/repo entry pages
- shark mascot animation now breaches through the waterline instead of acting as a static icon
- public docs and wiki now mirror the same branded banner treatment

## OpenCheek Agents and Task Deck

- multi-agent crew fan-out with Immaculate-paced burst budgeting
- deferred teammate launch queue with inspectable rows, detail dialogs, and operator controls
- coordinator, footer, and background-task surfaces now share one pressure vocabulary
- queued launches, retry pressure, approval pressure, and routed work are visible before they fail

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
- browser, security center, vault, and related Apex desktop apps stay launcher-backed and out of process instead of being hard-embedded into the TUI
- Apex launches now use a reduced allowlisted environment, and the bridge is only trusted when OpenJaws launched it itself unless the operator explicitly opts into trusting a pre-existing localhost listener

## Accountable Browser Preview

- `/preview` now opens browser-backed app previews and supervised browse/watch/music sessions under one explicit receipt
- each session keeps intent, rationale, requester, and runtime handler visible instead of letting agents browse without an explanation trail
- the preview lane prefers the existing Chrome-compatible path when available and treats the external Apex browser honestly as a launcher-backed desktop shell
- `/status` now surfaces the latest accountable preview session

## Immaculate Integration

- Immaculate is now part of the default OpenJaws runtime context
- per-turn checkpoints are injected into the main loop, tool rounds, and agent spawn/resume paths
- crew launch pacing, retry windows, route assignment, and worker health all use the same orchestration layer
- routed `Q` execution now uses signed manifests, worker assignment, remote dispatch, and signed result reconciliation
- the Immaculate integration notes now carry the verified hybrid-session, OCI-training, W&B, and benchmark publication contracts that OpenJaws is aligning against
- the tracing lane now has a typed `src/immaculate/events.ts` schema plus structured session-trace writing, and benchmark lanes now emit deterministic trace-backed receipt files with signature blocks when a signing key is configured
- `/status` and `/immaculate` now read the latest typed trace summary directly, and `/status` now also reads the latest Q benchmark trace summary, so route flow and p95 latency are visible in operator surfaces instead of only inside artifact folders

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

This is useful for tuning and honest before/after comparison. It is not a replacement for the public Immaculate benchmark source or a fake Harbor / Terminal-Bench leaderboard claim.

Current April 16, 2026 local snapshot:

- BridgeBench best pack: `all` at `42.11`
- 30-minute soak: `52/52` successful probes, `0` errors
- local W&B lane: attempted, but no local auth was configured so the run stayed receipt-only
- April 18 direct OCI `Q` reasoning validation answered the fallback-hysteresis check correctly with `t = 70s`
- April 18 direct OCI `Q` media validation returned `404` on the native image endpoint, so image/video stays on a separate explicit media lane instead of silently replacing `Q` as the session mind
- the dedicated Gemini media lane is restored for explicit image/video work, but the configured Gemini project on this machine is still quota-blocked
- local Harbor / Terminal-Bench lane:
  - single-task live receipt now reaches clean Harbor completion under OCI `Q`
  - official public-task five-attempt receipt now exists for `circuit-fibsqrt`, with `0` runtime errors, reward `0.0`, and Harbor raw env bundles scrubbed in place
  - that same receipt is now packaged and submitted through the official leaderboard discussion flow:
    - `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141`
  - repeated-attempt stability receipt captured `1` benchmark-failing trial plus `1` execution-error trial across `2` attempts
  - repeated soak live receipt now exists at `artifacts/q-terminalbench-soak-live-20260417-circuit-fibsqrt-v3/terminalbench-report.json`
    - result: `completed_with_errors`
    - truth: `2` cycles produced `2` total trials, `0` runtime errors, and `2` benchmark-failing trials
  - real concurrent receipt captured `2` live tasks at concurrency `2`
  - a fresh bounded April 18 wrapper proof now reaches Harbor execution on the current code path, but the Windows Harbor/Docker environment still throws `NotImplementedError` during trial environment startup, so the official five-attempt public receipt above remains the truthful published TerminalBench record
  - task outcomes are still variant, so the lane is not ready for strong leaderboard positioning

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

## What Is Planned Next

- deeper off-host worker execution through Immaculate-visible capability assignment
- more release-safe installed-user update paths without breaking local source workflows
- broader live walkthrough coverage for operator surfaces beyond settings and deferred launch controls
- continued tightening of compatibility shims where it is safe and does not break provider contracts
