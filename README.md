# OpenJaws

OpenJaws is an open-source coding workspace that runs in your terminal.

In plain terms: it gives you one place to code, run tools, manage background helper agents, switch AI providers, and see what the system is actually doing instead of guessing.

Built and attributed to [PossumX.dev](https://possumx.dev).

```text
 ██████╗ ██████╗ ███████╗███╗   ██╗     ██╗ █████╗ ██╗    ██╗███████╗
██╔═══██╗██╔══██╗██╔════╝████╗  ██║     ██║██╔══██╗██║    ██║██╔════╝
██║   ██║██████╔╝█████╗  ██╔██╗ ██║     ██║███████║██║ █╗ ██║███████╗
██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██   ██║██╔══██║██║███╗██║╚════██║
╚██████╔╝██║     ███████╗██║ ╚████║╚█████╔╝██║  ██║╚███╔███╔╝███████║
 ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚════╝ ╚═╝  ╚═╝ ╚══╝╚══╝ ╚══════╝

OPENCHEEKS // ANSI-SHADOW FLIGHT DECK // IMMACULATE
   /VVV VVV\
  >|       |<
   \^^^ ^^^/
OCEAN-BLUE SHELL // OPENCHEEK CREW // ROUTED TOOLS
```

GitHub renders the banner monochrome. The live TUI renders the same banner with a six-stop gold-to-deep-ocean truecolor gradient, darker deck trim, and shark-stage shading.

```text
   ___  
  / _ \ 
 | (_) |
  \__\_\

Q // OPENCHEEK COMMAND MARK
```

The Q mark above is sourced from `src/components/LogoV2/qMarkData.ts` and can be re-exported with `bun run qmark:export`.

## Start Here

- [Wiki Home](docs/wiki/Home.md)
- [Install and Updates](docs/wiki/Install-and-Updates.md)
- [Q and OCI Setup](docs/wiki/Q-and-OCI-Setup.md)
- [Q Access and Limits](docs/wiki/Q-Access-and-Limits.md)
- [website/README.md](website/README.md) - legacy mirror only; live `qline.site` publishing moved to `q-s-unfolding-story`
- [Release and Update Policy](docs/wiki/Release-and-Update-Policy.md)
- [Features and Capabilities](docs/wiki/Features-and-Capabilities.md)
- [JAWS Desktop App](docs/wiki/JAWS-Desktop-App.md)
- [Apex Workspace Bridge](docs/wiki/Apex-Workspace.md)
- [Accountable Browser Preview](docs/wiki/Browser-Preview.md)
- [Immaculate Integration](docs/wiki/Immaculate-Integration.md)
- [Roundtable Execution](docs/wiki/Roundtable-Execution.md)
- [Benchmark Status](docs/wiki/Benchmark-Status.md)
- [Release Notes](docs/wiki/Release-Notes.md)
- [Roadmap](docs/wiki/Roadmap.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)

## What OpenJaws Does

- Lets you work in the terminal with a real app surface instead of a bare chat box.
- Gives you OpenCheek helper agents that can do research, coding, checking, and background tasks in parallel.
- Keeps provider, model, routing, and remote-worker state visible so the app does not quietly drift into a different setup.
- Starts new public installs on `Q` with `OCI`, but still lets you switch providers and models on purpose.
- Supports both local and remote execution, including signed `Q` training routes and worker assignment.
- Keeps routed `Q` fallback thresholds, route lease timing, worker lease duration, and Immaculate crew pacing on one shared policy path instead of duplicating those numbers across launch, routing, and worker code.
- Gives you practical controls like `/help`, `/config`, `/theme`, `/privacy-settings`, `/status`, `/immaculate`, `/provider`, `/voice`, and `/remote-env`.
- Makes `/help` more useful on first run by surfacing real quick-start commands, aliases, and argument hints instead of a bare static list.
- Keeps Settings readable with dedicated `Appearance` and `Privacy` tabs, including a local Privacy mode for telemetry/nonessential-traffic policy and clearer `auto` / `dark` / `light` theme behavior.
- Adds a bounded `/apex` command center for trusted local mail, chat, store, system, security, and browser-preview lanes without pretending external Rust GUIs are native Ink views.
- Normalizes task, tool, co-work, and delivery summaries so final handoffs read the same way across the TUI instead of drifting between different vocabularies.
- Probes Gemini media lanes explicitly so Discord media bots can tell the difference between a listed model and a Google-side quota block, then fall back cleanly instead of stalling.
- Adds a read-only runtime coherence audit so operators can reconcile live Immaculate reachability, Discord receipts, route queue depth, and active traces before trusting the current state.
- Includes built-in dataset and training tools for improving `Q` over time.

## Live Immaculate Benchmarks

These are real benchmark records from live Immaculate runs, not placeholder numbers and not marketing copy.

- 60-minute soak: `1270.73 events/s`, reflex `P50 17.46 ms`, cognitive `P50 50.50 ms`
- 60-second benchmark: green in the live Immaculate source run
- source of truth: [Benchmark Status](docs/wiki/Benchmark-Status.md)

They matter because OpenJaws uses Immaculate for real decisions: picking routes, pacing retries, tracking workers, controlling agent bursts, and handling routed `Q` execution.

## Install Paths

### Tagged Release Install

- Official source of truth:
  - this repository
  - tagged GitHub Releases from this repository
  - [`release-policy.json`](release-policy.json)
- Installed native releases update from the public `stable` or `latest` lane, not from arbitrary `main` commits.
- Public native assets are currently published for `win32-x64`, `linux-x64`, and `darwin-x64`.

JAWS Desktop is the native app lane for OpenJaws. It bundles the OpenJaws backend as a Tauri sidecar and adds desktop workspace controls, agent visibility, Arobi enrollment, co-work, marketplace, studio, arcade, billing, and signed update release wiring. See [JAWS Desktop App](docs/wiki/JAWS-Desktop-App.md).

Use the shipped binary/update path when you install from a published tag:

```powershell
openjaws --version
openjaws update
```

### Build From Source

```powershell
bun install
bun run build:native
```

Start from the cloned repo:

```powershell
.\openjaws.bat --help
```

```bash
./openjaws.sh
```

Release verification:

```powershell
bun run verify:release
```

Runtime coherence audit:

```powershell
bun run runtime:coherence
```

That audit command is read-only. It reports when the live harness, Discord receipts, queue depth, and active traces disagree; it does not try to repair them for you.
For production release gates, `bun run verify:release` uses the strict live health gate and fails on any warning. Use `bun run system:check:live` only for diagnostic audits where warning output is expected.

Hosted GitHub verification:

```powershell
bun run verify:public
```

### Follow `main` / Contribute

If you are following active development or contributing, treat the cloned repo as your install surface:

```powershell
git pull --ff-only
bun install
bun run build:native
.\openjaws.bat --version
```

## Release Model

OpenJaws is moving quickly. Treat `main` as the bleeding edge. If you want the newest work, pull from the official repo and rebuild locally. If you want the safer path, use tagged releases.

Use only official sources:

- this repository
- tagged releases published from this repository
- [`release-policy.json`](release-policy.json)
- documentation in `docs/wiki`

Do not install from reposted binaries, copy-pasted shell installers, or mirrors you cannot verify.

## Official Update Trust Boundary

The shipped public updater is deliberately narrow:

- update discovery is controlled by the official [`release-policy.json`](release-policy.json)
- native binaries come from tagged GitHub Releases for this repository
- each published platform asset has a companion signed manifest with SHA-256 checksum data
- installs outside the current rollout bucket stay on their existing release instead of silently jumping forward
- if the policy or tagged assets are unhealthy, public updates fail closed

Main-branch pushes do not directly advance installed public binaries. Installed users move when both of these are true:

1. a tagged GitHub Release exists for the target version
2. the public release policy advances that channel to the target version

## Install and First Run

OpenJaws currently ships as source plus native local builds.

1. Install [Bun](https://bun.sh).
2. Clone this repo.
3. Run `bun install`.
4. Run `bun run build:native`.
5. Start the cockpit from the clone with `.\openjaws.bat` on Windows or `./openjaws.sh` on macOS/Linux.
6. Once you install a tagged release or set up your own PATH entry, use `openjaws`.

Useful first-run operator commands:

- `/help` to rediscover the public command surface without guessing
- type `/` in the prompt to search commands live when you do not remember the exact name
- `/config` to open the main Settings deck with dedicated `Appearance` and `Privacy` tabs
- `/theme` to change theme mode directly when you already know you want `auto`, `dark`, or `light`
- `/privacy-settings` to jump straight to the local privacy controls
- `/login` to use the built-in browser login for the managed Anthropic/OpenJaws account lane
- `/provider` to choose provider/model wiring or rotate keys later
- `/provider connect oci` or `/provider connect openai` to open the provider key/setup page in your browser
- `/provider test [provider] [model]` to prove the selected provider path is reachable
- `/status` to inspect harness, route queue, worker health, and runtime wiring
- `/immaculate` to inspect live orchestration topology and control state
- `/chrome` and `/voice` to configure browser and speech surfaces when available
- `/preview` to keep local app previews inside the native OpenJaws browser lane, with private-network URLs reserved for explicit preview work instead of the general browse/watch/music paths

Fresh installs also get a first-run setup flow inside the TUI. It helps you pick a provider, store a key, test that the provider is actually reachable, and confirm Immaculate is online before you start heavier work.

Recommended first-run checklist:

1. Start OpenJaws.
2. If you are staying on the public default runtime, keep `Q` selected in the model picker. It maps to `oci:Q` under the hood.
3. Bring your own `OCI` Generative AI key with `/provider key oci <api-key>` or set `Q_API_KEY`, `OCI_API_KEY`, or `OCI_GENAI_API_KEY`.
4. If you need a key first, run `/provider connect oci` to open the hosted Q/OCI setup page in your browser.
5. If you want the managed Anthropic/OpenJaws browser-login lane instead, run `/login`.
6. Run `/provider test oci Q` to confirm the selected `Q on OCI` path is reachable.
7. Run `/provider` if you want to switch away from `Q on OCI`, rotate keys, or override the base URL.
8. Run `/status` and confirm runtime, sandbox, route queue, voice state, provider wiring, and the latest reachability receipt.
9. Run `/immaculate status` if you want to inspect orchestration state before heavy work.
10. If you are running an internal operator surface, you can also use OCI IAM by setting `OCI_CONFIG_FILE`, `OCI_PROFILE`, `OCI_COMPARTMENT_ID`, `OCI_GENAI_PROJECT_ID`, and an upstream `Q_MODEL`.

## Provider Switching

OpenJaws is built to make provider and model changes obvious instead of silently bouncing between backends.

Safe operator flow:

1. Run `/provider`.
2. Select the provider and model you intend to use.
3. Run `/provider test <provider> <model>` to confirm the live endpoint before heavier work.
4. Run `/status`.
5. Confirm the active provider, model, runtime path, and any remote or routed execution state before starting work.

Common OCI/Q controls:

- `/provider use oci Q`
- `/provider key oci <api-key>`
- `/provider test oci Q`
- `/provider base-url oci <url>`

Practical auth split:

- public installed users should generate and use their own `OCI` / `Q` key
- internal operator surfaces can use OCI IAM plus a local project/profile
- OpenJaws should not silently borrow a shared internal Discord entitlement for downloaded public installs
- if you run a hosted `Q` service later, credits, billing, and hard rate limits still belong in that service layer

When switching execution strategy, use the matching controls:

- `/provider` for provider/model changes
- `/remote-env` for remote environment selection
- `/status` for final verification

## Safe Updates For Installed Users

If you are running from a cloned repository and tracking active development, update conservatively:

```powershell
git pull --ff-only
bun install
bun run build:native
openjaws --version
```

Then relaunch OpenJaws and verify the running session with `/status`.

If you are on a tagged native release, prefer the shipped updater path:

```powershell
openjaws update
```

or explicitly pin to the public stable lane:

```powershell
openjaws install stable
```

Additional guidance:

- close any running OpenJaws sessions before replacing binaries
- keep local secrets in your local config or secure storage, not in the repo
- review release notes or commit history before adopting fast-moving `main`
- public native updates are tag-gated and GitHub Release-backed so installed users do not get arbitrary `main` pushes
- staged public rollout is controlled by [`release-policy.json`](release-policy.json) using the local OpenJaws install ID already stored in global config
- current tagged native release assets are published for `win32-x64`, `linux-x64`, and `darwin-x64`; other platforms should build from source
- use `bun run verify:public` when you want the public-safe verification lane
- use `bun run verify:release` when preparing a release candidate or local ship pass

## If Update Fails Or Looks Wrong

Use the shortest recovery lane first:

```powershell
openjaws --version
openjaws doctor
```

Then relaunch OpenJaws and check:

- `/status` for provider, runtime, sandbox, route queue, and worker state
- `/immaculate status` for orchestration and routed-worker health

If the updater says you are current but the runtime still looks wrong:

1. close all running OpenJaws sessions
2. relaunch the official installed binary and re-check `openjaws --version`
3. if you run from source, rebuild locally with `bun install && bun run build:native`
4. if you run a tagged release, reinstall from the official GitHub Release or run `openjaws install stable`

If you have both a clone and an installed binary on the same machine, use `openjaws doctor` and the PATH/runtime warnings to confirm which one is actually running.

## Core Capabilities

- Flight-deck TUI with compact receipts, task inspection, and crew-pressure summaries.
- OpenCheek agent orchestration with deferred launch queueing, burst budgets, and Immaculate pacing.
- Agent Co-Work terminal registry so active crew terminals can reuse workspace, runtime, and routed-Q context across sibling projects on the same machine.
- A guarded Apex workspace bridge for local mail, chat, store, system, and security summaries plus launcher-backed desktop tools.
- Tool execution across local shells, PowerShell, files, web fetch, MCP, skills, and remote workers.
- `Q` local and routed training harness with signed manifests, queue state, remote dispatch, and completion reconciliation.
- Native `Q` benchmark and curriculum lanes over audited packs so coding, agentic, and security slices can be compared in-repo.
- A Netlify-ready Next.js landing site for public `Q` access, plans, Stripe checkout, API keys, credits, and usage under `website/`.
- Voice surfaces for speech input/output wiring, including ElevenLabs summary playback configuration.
- A local Discord station can now derive per-bot mention help, locked manuals, and capability-filtered command surfaces from one shared command registry instead of drifting across separate help copies.
- That same private Discord lane can now stage isolated OpenJaws runs in disposable git worktrees and per-job branches, run verification before any publish step, and hold pushes behind explicit approval checkpoints instead of auto-pushing code upstream.
- The private Discord operator surface now has explicit commands for `workspaces`, `openjaws-status`, `start-openjaws`, `ask-openjaws`, `github-status`, `ask-github-openjaws`, `pending-pushes`, `confirm-push`, and `stop-openjaws`, all behind the same approved-root and operator/trainer gate instead of a hidden shell.
- The private roundtable lane now uses a queued action ledger with per-project leases, so Q, Viola, and Blackbeak can take bounded repo actions without piling duplicate work onto the same project scope.
- The tracked roundtable scheduler policy now owns fallback root scoring, approval TTL resolution, and reply/PASS inspection, so the private Discord loop can reduce empty turns without reintroducing policy drift.
- The tracked roundtable runtime now emits queue transition receipts and `roundtable-status` summaries, so approval-ready branches, skipped jobs, and rejected jobs are visible to operators without scraping local runtime logs.
- The tracked roundtable/runtime readers now reconcile the live Discord log too, so `roundtable-status` and `runtime:coherence` show the actual active channel and freshest approval summary when the persisted session file drifts.
- Sync passes now preserve the authoritative live roundtable channel, quarantine malformed handoffs instead of aborting the loop, and keep no-diff outcomes out of the approval lane as explicit `skipped` work.
- That same roundtable lane now rolls forward in continuous 4-hour windows, understands direct project requests like `start an openjaws session for project sealed and ...`, keeps `SEALED` in its shared codebase knowledge scope, and limits autonomous branch/worktree execution to git-backed roots so manual-only demo folders do not poison the queue.
- Firecrawl dataset skill for crawl/search -> structured dataset pipelines.
- Remote Control, environment validation, startup harness receipts, and fail-closed configuration checks.

## Agent Co-Work

`Agent Co-Work` turns an OpenJaws crew into a shared workbench instead of a pile of isolated helper sessions. Each active teammate terminal now gets its own `terminal_context_id`, and the team keeps one shared registry so sibling agents can reuse known workspace, runtime, and orchestration facts instead of rediscovering them from scratch.

- active crew terminals keep unique IDs linked to a shared registry for same-owner, same-machine handoffs
- OCI `Q`, Immaculate, workspace roots, and active project paths stay visible for related terminals without copying secrets into memory files
- in-process teammates now honor their requested working directory too, so cross-project co-work stays aligned with the actual project they were asked to touch
- the team dialog and `/status` now surface the co-work registry directly, including `terminal_context_id`, project roots, and the shared registry receipt path
- resumed teammate sessions now rehydrate their saved terminal context IDs instead of coming back as context-blind shells
- co-work now also keeps a phase ledger so the team can preserve what was asked, what got handed off, and what was delivered across sibling terminals and project roots
- agents can now target an exact saved phase on purpose with `phase_id` or direct-message syntax like `@scout [phase:phase-abc12345] continue the bridge work`, so new work can reuse the right project thread instead of falling back to the latest matching receipt
- the live co-work hot path now keeps an indexed in-memory team view during a session, which cuts repeated team-file rereads and rescans out of cross-terminal handoffs while keeping the file-backed receipts as the durable source of truth
- the first Phase 1 runtime split is now in `src/q/*`, and the routed launch / dispatch / worker / poll / hybrid entrypoints now sit behind shared library surfaces too, so `launch-q-train`, `dispatch-q-route`, `process-q-routes`, `poll-q-route-result`, and `run-q-hybrid-session` stop drifting as standalone logic copies

## Apex Workspace Bridge

OpenJaws now has a bounded `/apex` command for a local Apex sidecar and launcher lane.

- `workspace_api` is the typed bridge, not a hidden shell
- `chrono-bridge` is now a dedicated backup sidecar around `apps/chrono/src/lib.rs`, not a fake embedded backup pane
- browser, security center, vault, mail, and related Rust UIs stay out of process
- `/apex` now has live `Overview`, `Launch`, `Mail`, `Chat`, `Store`, `Settings`, `System`, `Chrono`, and `Security` tabs over the bridge-backed workspace summary
- `/status` now also surfaces bounded Apex governance recommendations, so the same tenant-governance lane can point operators toward `Mail`, `Security`, `System`, or `Store` follow-up work without widening the bridge contract
- `/status` now surfaces Apex bridge health, workspace summary, and Chrono bridge state when the local Apex roots are configured
- Aegis Mail now has bounded move / delete / flag actions over the trusted bridge
- Shadow Chat can now create bridged sessions in addition to sending into existing ones
- Store installs now return a structured install receipt instead of a bare success string
- Settings now use `workspace_api` for bounded telemetry, privacy, firewall, realtime monitoring, hardware acceleration, refresh, and reset controls, with operator activity receipts for audit
- Apex launches now use a reduced allowlisted environment instead of inheriting the full OpenJaws secret surface
- the workspace bridge launcher now auto-discovers a local `libclang` runtime when the upstream Rust workspace needs it on Windows
- the bridge is only trusted when OpenJaws launched it itself, unless the operator explicitly sets `OPENJAWS_APEX_TRUST_LOCALHOST=1`
- the default bridge/runtime contract is:
  - `OPENJAWS_APEX_WORKSPACE_API_URL=http://127.0.0.1:8797`
  - `OPENJAWS_APEX_CHRONO_API_URL=http://127.0.0.1:8798`
  - `OPENJAWS_APEX_BROWSER_API_URL=http://127.0.0.1:8799`
  - `OPENJAWS_APEX_TENANT_GOVERNANCE_API_URL=http://127.0.0.1:3000`
- Apex bridge logs and state files live under `%TEMP%\openjaws-apex\`:
  - `workspace-api.log`
  - `workspace-api-state.json`
  - `chrono-bridge.log`
  - `chrono-bridge-state.json`
  - `browser-bridge.log`
  - `browser-bridge-state.json`
- the settings lane is now bridged over `workspace_api` (`/api/v1/settings/summary`, `/api/v1/settings/update`, `/api/v1/settings/reset`); `vault` remains launcher-backed until it gets a narrower trust contract
- `Notifications` and `argus` still stay out of agent control until they have their own narrow localhost bridges plus explicit confirmation and audit ladders

See [Apex Workspace Bridge](docs/wiki/Apex-Workspace.md) for setup, trust boundaries, and the current “bridge not kernel embed” contract.

## Accountable Browser Preview

OpenJaws now has a bounded `/preview` lane for native in-TUI app preview, research, and supervised watch/music sessions.

- browser launches keep an accountability receipt with intent, rationale, requester, and runtime handler
- the browser bridge renders through the OpenJaws browser lane instead of handing preview work to Chrome
- `/preview` is the native in-TUI path; `/apex launch browser` stays an explicit out-of-process fallback when you need the external Flowspace window
- user browsing history stays private by default; only Q or agent-led browsing is persisted as an accountable handoff
- agent navigate/close actions now fail closed if they target a private or unknown user session, so the native preview lane cannot quietly mutate unsupervised browsing state
- `/status` now surfaces the live in-TUI browser bridge session first and the latest accountable browser handoff only as fallback context

See [Accountable Browser Preview](docs/wiki/Browser-Preview.md) for the exact contract.

## Immaculate Integration

OpenJaws treats Immaculate as the orchestration core rather than an optional add-on.

- Per-turn checkpoints are injected into query context.
- Agent spawn, resume, burst pacing, and deferred release decisions are shaped by live Immaculate state.
- `Q` route assignment, worker capability registry, remote dispatch, and result reconciliation are all surfaced through the same harness.
- `/immaculate` exposes live topology, control pulses, execution pressure, and worker health.
- `/status` and the flight-deck surfaces expose the same route and worker state to installed users, not just internal operators.
- the tracing lane now has a typed `src/immaculate/events.ts` contract plus structured session-trace writing, and benchmark lanes now emit deterministic trace-backed receipt files with signature blocks when a signing key is configured
- `/status` and `/immaculate` now prefer the active typed Immaculate trace for the run in flight, and `/status` applies the same active-run-first selection to Q benchmark traces before falling back to the newest completed receipt

Details:

- [Wiki Home](docs/wiki/Home.md)
- [Install and Updates](docs/wiki/Install-and-Updates.md)
- [Release and Update Policy](docs/wiki/Release-and-Update-Policy.md)
- [Immaculate Integration](docs/wiki/Immaculate-Integration.md)
- [Features and Capabilities](docs/wiki/Features-and-Capabilities.md)
- [Benchmark Status](docs/wiki/Benchmark-Status.md)
- [Roadmap](docs/wiki/Roadmap.md)
- [Breakthrough Log](docs/wiki/Breakthrough-Log.md)

## Benchmark Snapshot

The current benchmark story is grounded in live Immaculate runs, not placeholder targets.

- 60-minute soak run:
  https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/5dnpoes7
- 60-second benchmark run:
  https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/wm8wf7bf
- benchmark source commit in Immaculate: `b7a571f`
- soak lane runtime: `April 12, 2026`, `3,600,967.49 ms`
- benchmark lane runtime: `April 12, 2026`, `61,098.97 ms`

Headline soak metrics from commit `b7a571f` in Immaculate:

- Throughput: `1270.73 events/s`
- Reflex latency: `P50 17.46 ms`, `P95 17.86 ms`, `P99 17.94 ms`
- Cognitive latency: `P50 50.50 ms`, `P95 57.04 ms`, `P99 58.32 ms`
- Recovery: `checkpoint`
- Integrity: `verified`
- Failed assertions: `0`

OpenJaws also has a local `Q` evaluation lane for honest in-repo comparison:

- `bun run q:bridgebench` runs eval-only pack checks over audited `Q` bundles
- `bun run q:curriculum` trains bounded specialization adapters and benchmarks them back against those same packs
- `bun run q:hybrid` coordinates one bounded local `Q` lane plus one Immaculate-routed lane under a shared receipt
- `bun run q:soak` runs a bounded repeated-probe soak over native OpenJaws plus direct OCI Q
- `bun run q:terminalbench` wraps Harbor / Terminal-Bench for external terminal-task evaluation when Harbor and Docker are available
- `bun run q:preflight -- --bench <bridgebench|soak|terminalbench>` now runs the same typed checklist the live benchmark wrappers use, so Harbor, Docker, Python, bundle, provider, and clock checks stop drifting between lanes
- `q:soak` and `q:terminalbench` now share the same OCI/Q provider probe surface before launch, so preflight receipts stop drifting across the direct soak lane and the Harbor-backed lane
- the main benchmark lanes now all accept `--seed`, default to `42`, and emit that seed into their signed receipts so local reruns are reproducible instead of implied
- benchmark receipt signing now uses canonical JSON plus Ed25519, which removes the old re-serialize-and-break verification footgun
- `q:terminalbench` now supports `--repeat` and writes `attempts[]` plus flattened `tasks[]` receipts so repeated-run stability and real multi-task concurrency are visible in one artifact
- `q:terminalbench` now also supports `--soak`, and `bun run q:terminalbench:soak` wraps that into repeated live cycles with `cycles[]`, per-cycle aggregates, and one managed jobs lane per run
- `q:terminalbench` now has a verifier-driven repair lane: failed task receipts emit a `repairPlan`, `--benchmark-repair-hint` injects prior verifier stdout/stderr into the Harbor agent prompt, and `--task-selection-lane` tries candidate public tasks until the first nonzero reward instead of hammering one known-hard task
- the Windows Harbor wrapper now prefers an isolated `.tools/harbor-venv` and the repo's patched `scripts/harbor_cli.py`, so TerminalBench preflight no longer depends on the globally conflicted Python package set
- benchmark artifacts now write `bridgebench-report.json` plus `reward.json` and `reward-details.json` in a Rewardkit-style shape so the results are easy to inspect or reuse
- training and benchmark receipts also record whether W&B logging was enabled, incomplete, or disabled, including the resolved project URL when that lane is actually configured
- hybrid Q sessions now keep a rolling 3-failures-in-60s transport hysteresis window for the Immaculate fast path, so one transient network miss no longer knocks the whole hybrid lane off course
- `q:bridgebench`, `q:curriculum`, `q:hybrid`, and routed `launch:q` runs can now carry both `--lineage-id` and optional `--phase-id`, so local, routed, and follow-up benchmark receipts stay attached to one intentional work thread
- the local Discord `Q_agent` lane now writes a shared receipt file that `/status` can read, so patrol cadence, routing decisions, Discord voice readiness, local knowledge readiness, and the last operator action stay visible to operators
- the private Discord operator lane can now launch bounded OpenJaws jobs into isolated worktrees and per-job branches, report changed files plus verification results back into Discord, and hold upstream pushes behind explicit approval checkpoints
- the tracked `src/utils/discordOperatorWork.ts` plus `src/utils/discordOperatorExecution.ts` modules now own the shared parser, worktree, verification, commit, and approval-push helpers that both the Discord operator lane and the private roundtable lane consume, so those two execution paths stop drifting
- the tracked `src/utils/discordExecutionQueue.ts` plus `src/utils/discordRoundtableExecution.ts` modules now own the shared lease, dedupe, approval-target, and roundtable-executor semantics too, so direct operator jobs and roundtable jobs stop diverging at the approval boundary
- the tracked roundtable runtime now also formats queue transition receipts directly, so `roundtable-status` can surface the same branch, receipt, verification, and `confirm-push` path the live operator queue uses
- Q_agents crew launches now reuse the same Immaculate deck receipt for launch pacing and crew handoff, cutting duplicate live harness probes while keeping both decisions on one health snapshot
- routed Q dispatch now blocks stale or faulted assigned workers before launch and records the worker-health reason on the queue claim, so an expired Q_agent / Immaculate assignment fails closed instead of pretending to dispatch
- that shared roundtable execution classifier now fails mixed code-plus-artifact outputs closed, so only verified code-bearing branches without generated audit or artifact spillover reach the approval lane
- that same operator lane now also supports `github-status` plus `ask-github-openjaws`, which opens a prepared `@openjaws` GitHub issue against the target repo so bounded work can continue remotely when the local machine goes offline
- the roundtable lane now deduplicates work by canonical project scope and uses a queued lease ledger, so the bots can keep taking bounded 4-hour actions without piling multiple helpers onto the same repo path at once
- stale or unsafe autonomous branches can now be rejected cleanly without leaving the per-project lease occupied, which keeps the next bounded pass eligible for execution instead of being blocked by an old approval hold

Current local benchmark snapshot from this workspace:

- BridgeBench latest lane: `q-bridgebench-20260429T024506` dry-run completed; the local scored pack lane is still blocked by host memory pressure, so no new public score is claimed from this pass
- historical local BridgeBench score retained for comparison: best pack `all` at `36.84`
- 30-minute soak: `52/52` successful probes with `0` errors
- local W&B lane: attempted, but no local auth was configured so the pass stayed receipt-only
- April 29, 2026 official TerminalBench public-task rerun:
  - artifact: `artifacts/q-terminalbench-official-public-20260429-circuit-fibsqrt-rerun/terminalbench-report.json`
  - `circuit-fibsqrt` finished `5` trials with `0` execution-error trials, `5` benchmark-failing trials, reward `0.0`, and `0` benchmark passes
- April 18, 2026 direct Q reasoning validation:
  - direct OCI `Q` answered the fallback-hysteresis check correctly: `t = 70s`
- April 18, 2026 direct Q media validation:
  - the current OCI `Q` runtime does not expose native image/video generation on this surface (`404` on the direct image endpoint)
  - explicit image/video requests should stay on a separate media lane instead of silently replacing `Q` as the active mind
  - the dedicated Gemini media lane is restored for that purpose, but the current Gemini project on this machine is still quota-blocked
- local Harbor / Terminal-Bench lane:
  - the preflight now checks Docker with the exact Harbor process environment before a run, which caught the earlier Windows Docker Desktop context mismatch
  - latest selector dry-run receipt: `artifacts/q-terminalbench-selector-dryrun-20260429-v2/terminalbench-report.json`
    - result: `dry_run`
    - truth: Harbor, Docker, OCI Q, clock-skew, and Harbor-process Docker checks all passed; candidate commands were emitted for `circuit-fibsqrt` and `json-grep`, with repair hints redacted from public receipts
  - single-task live receipt reaches clean Harbor completion under OCI `Q`
  - official public-task five-attempt receipt now exists at `artifacts/q-terminalbench-official-public-20260429-circuit-fibsqrt-rerun/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - harness result: `completed_with_errors`
    - truth: the official task completed with `5` attempts, `0` runtime errors, `5` verifier failures, reward `0.0`, and Harbor raw env bundles scrubbed in place
  - official leaderboard submission discussion: `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141`
  - repeated-attempt stability receipt captured `1` benchmark-failing trial plus `1` execution-error trial across `2` attempts
  - repeated soak live receipt now exists at `artifacts/q-terminalbench-soak-live-20260417-circuit-fibsqrt-v3/terminalbench-report.json`
    - result: `completed_with_errors`
    - truth: `2` cycles produced `2` total trials, `0` runtime errors, and `2` benchmark-failing trials under one managed jobs lane
  - real concurrent receipt captured `2` live tasks at concurrency `2`
  - latest blocker: infrastructure and verifier receipt capture are working; Q still needs task-quality improvement because the public task attempts produced placeholder, pass-through, or incomplete `gates.txt` artifacts

Important boundary:

- these local `Q` receipts are for comparing training and evaluation runs inside OpenJaws
- they do not replace the public Immaculate benchmark record
- the Harbor / Terminal-Bench path is an in-repo adapter lane, not a public leaderboard claim by itself
- the newest official Terminal-Bench submission is real and public, but the verifier reward stayed `0.0`, so it is credibility-proofed execution rather than a strong benchmark result
- the private Discord station now supports live voice-channel presence for the internal lane, but that voice path is still local/private and should be treated as an experimental operator surface rather than a public hosted feature
- the private Discord station now supports secret-safe local corpus retrieval and explicit operator-only OpenJaws workflows, not an unrestricted remote shell
- the private Discord operator lane can now hand off bounded work to the hosted `@openjaws` GitHub App for remote execution, but that GitHub worker is still a private/internal operator surface rather than a public consumer feature

Public hosted-Q website target:

- `https://qline.site` is the public shell for signup, checkout, hosted key issuance, and usage receipts once the operator backend and billing secrets are configured
- `https://qline.site` now serves valid HTTPS on the live Netlify surface and should be treated as the canonical public signup and checkout domain
- `https://qline.site` now also surfaces OpenJaws, Q_agents, Agent Co-Work, the public GitHub repo, and the latest verified benchmark snapshot instead of acting like a billing-only landing page
- the public `qline.site` benchmark block is now generated from checked-in benchmark receipts and fails CI if it drifts from those artifacts
- the local release sweep now also includes a live same-site `qline.site` smoke, so the published Netlify handler/runtime/content state is checked alongside the repo build before a local ship pass is called clean
- the release sweep now fails closed on real `system:check` failures, and the unit-test lane is scoped to the live repo `src/` and `scripts/` trees so mirrored benchmark artifacts cannot poison a ship pass
- the CI lane now enforces a bounded Phase 0 hygiene gate too: `scripts/` dead-file scan via `knip` plus a `15%` non-test line-coverage floor for `scripts/` before the main verify sweep runs
- the `Security` workflow now fetches full git history before gitleaks runs, which fixes the shallow-checkout commit-range failure that was leaving `main` red without an actual secret finding
- Stripe webhook target for that hosted lane is `https://qline.site/api/webhooks/stripe`
- `https://aura-genesis.org` stays the company path, not the hosted-Q checkout surface
- the live `qline.site` source of truth is no longer this OpenJaws repo; production publishing now belongs to `https://github.com/PossumXI/q-s-unfolding-story`
- the guarded deploy script in this repo now fails closed unless `OPENJAWS_ALLOW_LEGACY_QLINE_DEPLOY=1` is set deliberately for a one-off emergency override

See [Benchmark Status](docs/wiki/Benchmark-Status.md) for the detailed record and why those numbers matter to OpenJaws.

For public access policy, usage limits, and the Discord exception boundary, see [Q Access and Limits](docs/wiki/Q-Access-and-Limits.md).

The `website/` lane now supports two honest modes:

- local filesystem demo mode for signup, checkout, key issuance, and usage receipts during development
- proxy mode for a real hosted-Q operator backend in production

That means the repo can exercise the hosted-Q flow end to end without pretending the demo ledger is a production billing service.

## Security and Release Hygiene

- MIT licensed.
- Public-release docs and contribution policy are included in this repo.
- Generated artifacts, logs, local runtime state, datasets, and env files are excluded from version control.
- GitHub workflow scaffolding is provided for CI, hosted verification, CodeQL, dependency review, gitleaks, and optional GitGuardian scanning when configured with a repository secret.
- The release-facing CI lane now fails closed on a scoped dead-file scan and a scripts-only coverage floor before it moves on to build and website verification.

Start here:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)

## Project Status

This repo is being prepared as a clean public release with no private history, no telemetry defaults, and no embedded secrets. The current working direction is:

- stronger operator-visible orchestration
- cleaner public documentation
- fail-closed remote execution
- reproducible verification before release and before every tagged build
