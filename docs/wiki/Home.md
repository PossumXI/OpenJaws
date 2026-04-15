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

## Live Benchmark Record

Immaculate is not just a future idea in this project. The current benchmark story is backed by live W&B runs and a repo-documented benchmark snapshot:

- 60-minute soak with verified integrity and checkpointed recovery
- 60-second benchmark snapshot from a live Immaculate run
- a plain explanation of why those numbers matter for OpenJaws routing, pacing, retries, and remote execution

OpenJaws now also has a local `Q` comparison lane for day-to-day model work:

- `bun run q:bridgebench` evaluates audited packs like `all`, `coding`, `agentic`, and `security`
- `bun run q:curriculum` runs bounded specialization passes and benchmarks the resulting adapters back against those packs
- the local lane writes `reward.json` and `reward-details.json` so the results are easy to compare with Rewardkit-style tooling
- the local Discord `Q_agent` lane now writes patrol/routing/voice receipts that `/status` can read from the same machine

Honest boundary:

- the local `Q` lane is for in-repo evaluation and tuning
- the public benchmark source of truth still lives in Immaculate
- OpenJaws is not yet pretending to be a full Harbor / Terminal-Bench agent adapter
- the Discord station currently uses scheduled text-channel patrols and optional speech attachments, not full voice-channel presence

For who should bring their own key, what can stay free, and where credits/rate limits actually belong, see [Q Access and Limits](Q-Access-and-Limits.md).

OpenJaws now also carries a Netlify-ready Next.js surface for public `Q` access under [`website/`](../../website/README.md). It can run a local filesystem demo lane for signup, Stripe checkout, API key issuance, and usage receipts during development, while still failing closed in production unless you attach a real hosted-Q backend.

The intended public hosted-Q surface is `https://qline.site`. `https://aura-genesis.org` remains the broader company path.
`https://qline.site` now resolves over valid HTTPS and is the canonical public shell for hosted-Q signup and checkout.

## Public Release Notes

- OpenJaws is public and MIT licensed, but it is still changing quickly.
- Stick to the official repo and official tagged releases.
- Tagged installs update from the official release policy, not from every `main` push.
- Use `/status` when you want the plain truth about what is active: provider, runtime, sandbox, routed work, and worker health.
- Use `/provider` and `/remote-env` on purpose. OpenJaws is built to show setup changes, not hide them.
- Fresh installs start on `OCI:Q`; use `/provider` when you want to rotate keys, change the base URL, or switch providers.
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
