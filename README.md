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
- [website/README.md](website/README.md)
- [Release and Update Policy](docs/wiki/Release-and-Update-Policy.md)
- [Features and Capabilities](docs/wiki/Features-and-Capabilities.md)
- [Immaculate Integration](docs/wiki/Immaculate-Integration.md)
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
- Gives you practical controls like `/status`, `/immaculate`, `/provider`, `/voice`, and `/remote-env`.
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

- `/login` to use the built-in browser login for the managed Anthropic/OpenJaws account lane
- `/provider` to choose provider/model wiring or rotate keys later
- `/provider connect oci` or `/provider connect openai` to open the provider key/setup page in your browser
- `/provider test [provider] [model]` to prove the selected provider path is reachable
- `/status` to inspect harness, route queue, worker health, and runtime wiring
- `/immaculate` to inspect live orchestration topology and control state
- `/chrome` and `/voice` to configure browser and speech surfaces when available

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
- Tool execution across local shells, PowerShell, files, web fetch, MCP, skills, and remote workers.
- `Q` local and routed training harness with signed manifests, queue state, remote dispatch, and completion reconciliation.
- Native `Q` benchmark and curriculum lanes over audited packs so coding, agentic, and security slices can be compared in-repo.
- A Netlify-ready Next.js landing site for public `Q` access, plans, Stripe checkout, API keys, credits, and usage under `website/`.
- Voice surfaces for speech input/output wiring, including ElevenLabs summary playback configuration.
- A local Discord `Q_agent` station can now run scheduled Immaculate-driven patrol receipts, controlled channel routing, and first-phase ElevenLabs speech attachments when operators wire their own private secrets.
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

## Immaculate Integration

OpenJaws treats Immaculate as the orchestration core rather than an optional add-on.

- Per-turn checkpoints are injected into query context.
- Agent spawn, resume, burst pacing, and deferred release decisions are shaped by live Immaculate state.
- `Q` route assignment, worker capability registry, remote dispatch, and result reconciliation are all surfaced through the same harness.
- `/immaculate` exposes live topology, control pulses, execution pressure, and worker health.
- `/status` and the flight-deck surfaces expose the same route and worker state to installed users, not just internal operators.

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
- `q:soak` and `q:terminalbench` now share the same OCI/Q provider probe surface before launch, so preflight receipts stop drifting across the direct soak lane and the Harbor-backed lane
- `q:terminalbench` now supports `--repeat` and writes `attempts[]` plus flattened `tasks[]` receipts so repeated-run stability and real multi-task concurrency are visible in one artifact
- `q:terminalbench` now also supports `--soak`, and `bun run q:terminalbench:soak` wraps that into repeated live cycles with `cycles[]`, per-cycle aggregates, and one managed jobs lane per run
- benchmark artifacts now write `bridgebench-report.json` plus `reward.json` and `reward-details.json` in a Rewardkit-style shape so the results are easy to inspect or reuse
- training and benchmark receipts also record whether W&B logging was enabled, incomplete, or disabled, including the resolved project URL when that lane is actually configured
- `q:bridgebench`, `q:curriculum`, `q:hybrid`, and routed `launch:q` runs can now carry both `--lineage-id` and optional `--phase-id`, so local, routed, and follow-up benchmark receipts stay attached to one intentional work thread
- the local Discord `Q_agent` lane now writes a shared receipt file that `/status` can read, so patrol cadence, routing decisions, Discord voice readiness, local knowledge readiness, and the last operator action stay visible to operators

Current local benchmark snapshot from this workspace:

- BridgeBench best pack: `all` at `42.11`
- 30-minute soak: `52/52` successful probes with `0` errors
- local W&B lane: attempted, but no local auth was configured so the pass stayed receipt-only
- local Harbor / Terminal-Bench lane:
  - single-task live receipt now reaches clean Harbor completion under OCI `Q`
  - official public-task five-attempt receipt now exists at `artifacts/q-terminalbench-official-public-20260416-circuit-fibsqrt-v2/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - harness result: `completed_with_errors`
    - truth: the official task completed with `5` attempts, `0` runtime errors, reward `0.0`, and Harbor raw env bundles scrubbed in place
  - official leaderboard submission discussion: `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141`
  - repeated-attempt stability receipt captured `1` benchmark-failing trial plus `1` execution-error trial across `2` attempts
  - repeated soak live receipt now exists at `artifacts/q-terminalbench-soak-live-20260417-circuit-fibsqrt-v3/terminalbench-report.json`
    - result: `completed_with_errors`
    - truth: `2` cycles produced `2` total trials, `0` runtime errors, and `2` benchmark-failing trials under one managed jobs lane
  - real concurrent receipt captured `2` live tasks at concurrency `2`

Important boundary:

- these local `Q` receipts are for comparing training and evaluation runs inside OpenJaws
- they do not replace the public Immaculate benchmark record
- the Harbor / Terminal-Bench path is an in-repo adapter lane, not a public leaderboard claim by itself
- the newest official Terminal-Bench submission is real and public, but the verifier reward stayed `0.0`, so it is credibility-proofed execution rather than a strong benchmark result
- the Discord station currently speaks through text-channel `.wav` attachments, not live voice-channel participation
- the private Discord station now supports secret-safe local corpus retrieval and explicit operator-only OpenJaws workflows, not an unrestricted remote shell

Public hosted-Q website target:

- `https://qline.site` is the public shell for signup, checkout, hosted key issuance, and usage receipts once the operator backend and billing secrets are configured
- `https://qline.site` now serves valid HTTPS on the live Netlify surface and should be treated as the canonical public signup and checkout domain
- `https://qline.site` now also surfaces OpenJaws, Q_agents, Agent Co-Work, the public GitHub repo, and the latest verified benchmark snapshot instead of acting like a billing-only landing page
- the public `qline.site` benchmark block is now generated from checked-in benchmark receipts and fails CI if it drifts from those artifacts
- the local release sweep now also includes a live same-site `qline.site` smoke, so the published Netlify handler/runtime/content state is checked alongside the repo build before a local ship pass is called clean
- the release sweep now fails closed on real `system:check` failures, and the unit-test lane is scoped to the live repo `src/` and `scripts/` trees so mirrored benchmark artifacts cannot poison a ship pass
- the CI lane now enforces a bounded Phase 0 hygiene gate too: `scripts/` dead-file scan via `knip` plus a `15%` non-test line-coverage floor for `scripts/` before the main verify sweep runs
- Stripe webhook target for that hosted lane is `https://qline.site/api/webhooks/stripe`
- `https://aura-genesis.org` stays the company path, not the hosted-Q checkout surface

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
