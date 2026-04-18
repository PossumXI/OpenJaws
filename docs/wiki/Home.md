# OpenJaws Wiki

OpenJaws is a coding workspace for the terminal.

In plain terms: it gives you a command center for coding, running tools, using helper agents, and checking what model, provider, and control layer are actually active.

Built and maintained by [PossumX.dev](https://possumx.dev).

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

GitHub and the repo wiki render the banner as monochrome FIGlet art. The live OpenJaws TUI renders the same banner with a six-stop gold-to-deep-ocean truecolor gradient and darker deck trim.

```text
   ___  
  / _ \ 
 | (_) |
  \__\_\

Q // OPENCHEEK COMMAND MARK
```

The Q mark above is sourced from `src/components/LogoV2/qMarkData.ts` and can be re-exported with `bun run qmark:export`.

OpenJaws is meant to feel like a real control deck, not a blind text box. You can see what is running, what is queued, what provider is active, and whether the orchestration layer is healthy before you trust the result.

## Start Here

- [Install and Updates](Install-and-Updates.md)
- [Q and OCI Setup](Q-and-OCI-Setup.md)
- [Q Access and Limits](Q-Access-and-Limits.md)
- [Release and Update Policy](Release-and-Update-Policy.md)
- [Features and Capabilities](Features-and-Capabilities.md)
- [Apex Workspace Bridge](Apex-Workspace.md)
- [Accountable Browser Preview](Browser-Preview.md)
- [Immaculate Integration](Immaculate-Integration.md)
- [Benchmark Status](Benchmark-Status.md)
- [Release Notes](Release-Notes.md)
- [Roadmap](Roadmap.md)
- [Breakthrough Log](Breakthrough-Log.md)

## Glossary

- `OpenCheek agents`: background helpers that can research, code, verify, or work on queued tasks while you keep moving.
- `Immaculate`: the control layer that helps OpenJaws decide how to route work, pace retries, use workers, and handle remote execution.
- `Q routes`: signed bundles that let `Q` training or execution jobs move safely through queueing, assignment, dispatch, and result reporting.

## Current Release Themes

- a clearer TUI with stronger OpenJaws branding
- `Q` on `OCI` as the default public starting point
- helper-agent crews you can inspect instead of hidden background work
- safer routed `Q` execution with signed requests and explicit assignment
- worker health checks instead of silent failures
- safer public update and release verification
- clearer status for everyday installed users

## Agent Co-Work

`Agent Co-Work` turns OpenJaws into a shared workbench where multiple helper agents can stay coordinated across active projects without repeating the same setup work. The crew now keeps a shared terminal registry with unique context IDs so related terminals can reuse known workspace, runtime, and orchestration facts instead of guessing again.

- multiple agents can work in parallel while the operator stays in the loop
- terminal context IDs keep sibling project work tied to the same machine-owner trust boundary
- OCI `Q`, Immaculate, workspace roots, and active project paths stay reusable without dumping secrets into shared notes
- the crew dialog and `/status` now show the live co-work map instead of hiding it in team files
- resumed teammate sessions keep their saved terminal context IDs so handoffs stay intact after reloads
- co-work now keeps a shared phase memory too, so the crew can reopen the request/deliverable thread for a project phase instead of restating the same work every time
- agents can now continue an exact saved phase on purpose with `phase_id` or direct-message syntax like `@scout [phase:phase-abc12345] keep going`, which avoids accidental fallback to the latest similar receipt
- the live co-work path now keeps an indexed in-memory team view during a session, which cuts repeated team-file rereads and rescans out of helper handoffs while keeping the file-backed receipts as the durable record
- the first shared `src/q/*` library layer is now in place too, and the routed launch / dispatch / worker / poll / hybrid helpers now sit there as well, so provider preflight, route dispatch, worker processing, poll/reconcile, and hybrid receipt math stop drifting across standalone `q-*` scripts

## Apex Workspace Bridge

OpenJaws now has a bounded local `/apex` lane for an external Apex workspace.

- `workspace_api` is the live bridge for mail, chat, store, system, and security summaries
- `/apex` can now send Aegis Mail drafts, seal messages into Shadow Chat sessions, and install Store apps through that trusted bridge
- browser, security center, vault, and the rest of the Apex Rust desktop apps stay launcher-backed and out of process
- `/apex` now exposes dedicated `Mail`, `Chat`, `Store`, `System`, and `Security` tabs instead of flattening everything into one generic overview
- `browser` and `chrono` remain honest launcher-only tools today; OpenJaws does not fake an embedded browser or backup pane that does not exist
- `/status` now surfaces the Apex bridge directly when the Apex roots are configured
- the bridge now uses a reduced env plus a trusted-launch contract instead of blindly trusting any localhost listener

See [Apex Workspace Bridge](Apex-Workspace.md) for the full setup and trust boundary.

## Accountable Browser Preview

OpenJaws now has a bounded `/preview` lane for browser-backed app preview and supervised browsing.

- the TUI now records why a user or agent opened a browser session
- Chrome-compatible preview is preferred when available
- the external Apex browser is treated honestly as a launcher-backed desktop shell
- `/status` now surfaces the latest preview receipt

See [Accountable Browser Preview](Browser-Preview.md) for the exact boundary.

## Live Benchmark Record

Immaculate is not just a future idea in this project. The current benchmark story is backed by live W&B runs and a repo-documented benchmark snapshot:

- 60-minute soak with verified integrity and checkpointed recovery
- 60-second benchmark snapshot from a live Immaculate run
- a plain explanation of why those numbers matter for OpenJaws routing, pacing, retries, and remote execution

OpenJaws now also has a local `Q` comparison lane for day-to-day model work:

- `bun run q:bridgebench` evaluates audited packs like `all`, `coding`, `agentic`, and `security`
- `bun run q:curriculum` runs bounded specialization passes and benchmarks the resulting adapters back against those packs
- `bun run q:soak` runs a bounded repeated-probe soak over native OpenJaws and direct OCI Q under one receipt
- `bun run q:terminalbench:soak` runs a bounded repeated Harbor / Terminal-Bench soak lane with live `cycles[]` receipts
- `bun run q:hybrid` keeps one bounded local lane and one Immaculate-routed lane under one explicit receipt
- `bun run q:preflight -- --bench <bridgebench|soak|terminalbench>` runs the same typed runnable-check surface the benchmark wrappers now use
- the direct soak lane and the Harbor-backed lane now share the same OCI/Q provider probe surface before launch, so blocked vs. forceable preflight behavior stays consistent
- the main Q benchmark lanes now all accept `--seed`, default to `42`, and emit that seed into their reports plus signed receipts
- direct April 18 validation confirmed OCI `Q` handles reasoning on the current runtime, but does not expose native image/video generation on this surface, so media stays on a separate explicit lane instead of silently replacing `Q`; that dedicated Gemini media lane is restored, but the current Gemini project here is still quota-blocked
- the local lane writes `reward.json` and `reward-details.json` so the results are easy to compare with Rewardkit-style tooling
- `--lineage-id` and optional `--phase-id` now let the local, routed, and follow-up benchmark receipts stay attached to the same intentional work thread
- hybrid sessions now keep a rolling 3-failures-in-60s transport hysteresis window for the Immaculate fast path, so one transient route miss does not instantly suppress routed execution
- the local Discord `Q_agent` lane now writes patrol/routing/voice/knowledge/operator receipts that `/status` can read from the same machine

Honest boundary:

- the local `Q` lane is for in-repo evaluation and tuning
- the public benchmark source of truth still lives in Immaculate
- OpenJaws is not yet pretending to be a full Harbor / Terminal-Bench agent adapter
- the newest official Terminal-Bench public-task receipt is now submitted through the official leaderboard repo discussion flow, but the verifier reward stayed `0.0`, so it is execution proof rather than a strong leaderboard result
- the newest local repeated Terminal-Bench soak receipt is useful for stability tuning, not a public leaderboard claim
- the Immaculate trace lane now uses a typed event union under `src/immaculate/events.ts`, and benchmark lanes now emit deterministic trace-backed receipts with signature blocks when a signing key is configured
- `/status` and `/immaculate` now read the latest typed Immaculate trace summary directly, and `/status` now also surfaces the latest Q benchmark trace summary, so live route flow and p95 latency stay visible outside raw artifact folders
- the Discord station currently uses scheduled text-channel patrols and optional speech attachments, not full voice-channel presence
- the private Discord station can search a secret-safe local corpus and run explicit operator-only OpenJaws workflows, but it is not a hidden shell surface

For who should bring their own key, what can stay free, and where credits/rate limits actually belong, see [Q Access and Limits](Q-Access-and-Limits.md).

OpenJaws now also carries a Netlify-ready Next.js surface for public `Q` access under [`website/`](../../website/README.md). It can run a local filesystem demo lane for signup, Stripe checkout, API key issuance, and usage receipts during development, while still failing closed in production unless you attach a real hosted-Q backend.

The intended public hosted-Q surface is `https://qline.site`. `https://aura-genesis.org` remains the broader company path.
`https://qline.site` now resolves over valid HTTPS and is the canonical public shell for hosted-Q signup and checkout.
`https://qline.site` now also foregrounds OpenJaws, Q_agents, Agent Co-Work, the public GitHub repo, and the latest verified benchmark snapshot instead of looking like a billing-only landing page.
That public benchmark snapshot is now generated from checked-in benchmark receipts and validated during CI instead of being left as hand-maintained copy.
The local release sweep now also includes a live same-site `qline.site` smoke, so the published Netlify handler/runtime/content state is checked alongside the repo build before a local ship pass is called clean.
The release sweep now also fails closed on real `system:check` failures, and the unit-test lane is scoped to the live repo `src/` and `scripts/` trees so mirrored benchmark artifacts cannot quietly contaminate a public ship pass.
The CI lane now also enforces a bounded Phase 0 hygiene gate: a `scripts/` dead-file scan via `knip` plus a `15%` non-test scripts coverage floor before the main verify sweep runs.

## Public Release Notes

- OpenJaws is public and MIT licensed, but it is still changing quickly.
- Stick to the official repo and official tagged releases.
- Tagged installs update from the official release policy, not from every `main` push.
- Use `/status` when you want the plain truth about what is active: provider, runtime, sandbox, routed work, and worker health.
- Use `/provider` and `/remote-env` on purpose. OpenJaws is built to show setup changes, not hide them.
- Fresh installs start on `Q` in the picker, which maps to `oci:Q`; use `/provider` when you want to rotate keys, change the base URL, or switch providers.
- Public installs should bring their own `OCI` / `Q` key. Internal operator surfaces can use OCI IAM with a local project/profile when that is the intended trust boundary.

## Install Paths

### Tagged Release Install

Use this path when you installed a published OpenJaws binary from GitHub Releases.

- update with `openjaws update`
- stay on the public stable lane with `openjaws install stable`
- verify the running binary with `openjaws --version`
- inspect the live runtime with `/status`

### Build From Source

1. Install dependencies with `bun install`.
2. Build the native launcher with `bun run build:native`.
3. Start OpenJaws from the clone with `.\openjaws.bat` on Windows or `./openjaws.sh` on macOS/Linux.
4. After a tagged install or PATH setup, use `openjaws`.
5. If you are staying on the default runtime, set your key with `/provider key oci <api-key>` or `Q_API_KEY`.
6. Run `/provider` if you want a different provider/model or need to rotate keys/base URL.
7. Run `/status` to confirm the active wiring.
8. Use `/immaculate` to inspect the orchestration layer behind routing, agents, and remote execution.

### Follow `main` / Contribute

Use this path when you intentionally track active development from the repo.

- `git pull --ff-only`
- `bun install`
- `bun run build:native`
- verify with `.\openjaws.bat --version` on Windows or `./openjaws.sh --version` on macOS/Linux

## Installed User Path

If you are following active development from source:

1. `git pull --ff-only`
2. `bun install`
3. `bun run build:native`
4. `.\openjaws.bat --version` on Windows or `./openjaws.sh --version` on macOS/Linux
5. Relaunch and verify with `/status`

See [Install and Updates](Install-and-Updates.md) for the safe update flow, first-run checklist, provider switching guidance, and recovery lane. See [Release and Update Policy](Release-and-Update-Policy.md) for the official public trust boundary.
