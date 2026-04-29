# Benchmark Status

This page tracks the live Immaculate benchmark record currently used to explain why OpenJaws benefits from the harness.

## Source Snapshot

- Immaculate commit: `b7a571f`
- Branch: `main`
- Benchmark publication date: `April 12, 2026`
- Source Immaculate repo status on that benchmark pass: benchmark publication, CI, security, and GitGuardian were all green

## 60-Minute Soak Run

- W&B: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/5dnpoes7
- Duration: `3,600,967.49 ms`
- Throughput: `1270.73 events/s`
- Reflex latency:
  - `P50 17.46 ms`
  - `P95 17.86 ms`
  - `P99 17.94 ms`
  - `P99.9 18.06 ms`
- Cognitive latency:
  - `P50 50.50 ms`
  - `P95 57.04 ms`
  - `P99 58.32 ms`
  - `P99.9 58.95 ms`
- Throughput heuristic:
  - `P50 1608.80 ops/s`
  - `P95 1726.17 ops/s`
  - `P99 1751.99 ops/s`
  - `P99.9 1757.85 ops/s`
- Recovery: `checkpoint`
- Integrity: `verified`
- Failed assertions: `0`
- Hardware:
  - Windows 11 Pro
  - AMD Ryzen 7 7735HS
  - 16 cores
  - 23.29 GiB RAM
  - SSD
  - Node `v22.13.1`

## 60-Second Benchmark

- W&B: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/wm8wf7bf
- Duration: `61,098.97 ms`

## Why OpenJaws Cares

OpenJaws uses Immaculate as an execution-control layer. The benchmark numbers matter because they validate the control loop behind:

- worker assignment
- retry pacing
- crew burst budgeting
- remote route dispatch
- checkpointed recovery under sustained load

## Executive Summary

These runs are relevant to OpenJaws because they validate the orchestration substrate that now sits behind:

- OpenCheek crew fan-out and deferred release
- route-worker heartbeat and assignment decisions
- fail-closed retry pacing under pressure
- remote `Q` dispatch, acknowledgement, and completion reconciliation

The soak result is the stronger signal. It shows that the harness can hold bounded reflex and cognitive latency for an hour-class run while preserving checkpointed recovery and integrity, which is exactly the property OpenJaws needs when it is pacing agents, routing tools, and managing remote execution instead of just answering one request.

## Live OpenJaws Verification Lanes

These are the current live-check lanes OpenJaws can run honestly against its shipped orchestration path:

- `bun run system:check` for the full release-style harness pass
- `bun run q:bridgebench` for local pack-by-pack `Q` evaluation over audited bundles
- `q:bridgebench` and `q:preflight -- --bench bridgebench` now auto-resolve the freshest `artifacts/q-benchmark-audited-*` bundle before falling back to the legacy `data/sft/audited-v2` path, so the benchmark lane follows the current audited bundle output by default.
- `bun run q:curriculum` for bounded specialization runs plus follow-up local pack comparison
- `bun run q:hybrid` for one bounded local lane plus one Immaculate-routed lane under a shared receipt
- `bun run q:terminalbench` for Harbor / Terminal-Bench runs when the external harness is actually installed
- `bun run q:terminalbench:soak` for repeated bounded Harbor / Terminal-Bench cycles under one soak receipt
- `bun run q:soak` for a bounded repeated-probe soak over native OpenJaws and direct OCI Q
- `bun run q:preflight -- --bench <bridgebench|soak|terminalbench>` for the shared typed runnable-check surface used by the benchmark wrappers themselves
- `bun run q-route:assignment` for `Q` route assignment behavior
- `bun run q-route:remote-dispatch` for signed remote-dispatch behavior
- `bun run q-route:remote-completion` for signed remote-result reconciliation

## April 29, 2026 Public TerminalBench And Website Sync

This is the newest local OpenJaws public-task receipt and website snapshot state from this workspace.

- BridgeBench:
  - artifact: `artifacts/q-bridgebench-20260429T024506/bridgebench-report.json`
  - result: `dry_run`
  - truth: the dry run completed, but the host still does not have enough local memory for the scored `google/gemma-4-E4B-it` pack lane, so this pass does not create a new BridgeBench score
- Official TerminalBench public task:
  - artifact: `artifacts/q-terminalbench-official-public-20260429-circuit-fibsqrt-rerun/terminalbench-report.json`
  - task: `circuit-fibsqrt`
  - result: `completed_with_errors`
  - aggregate: `5` trials, `0` execution-error trials, `5` benchmark-failing trials, reward `0.0`, `pass@2 = 0`, `pass@4 = 0`, `pass@5 = 0`
  - truth: Harbor, Docker, OCI Q preflight, clock-skew preflight, and the Harbor-process Docker environment check all passed. The remaining blocker is model-task quality: Q produced placeholder, pass-through, or incomplete circuit artifacts instead of a verifier-passing `gates.txt`.
  - official leaderboard submission discussion:
    - `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141`
- Website benchmark snapshot:
  - artifact: `website/lib/benchmarkSnapshot.generated.json`
  - result: regenerated on `2026-04-29T02:45:07.319Z`
  - public truth: BridgeBench is shown as a dry run, the 30-minute soak remains `52/52`, TerminalBench shows reward `0.0 / 5 trials`, and W&B remains local-receipt only
- Share image:
  - artifact: `website/public/assets/images/q-share-card.png`
  - result: regenerated from the benchmark snapshot so shared links no longer carry stale BridgeBench numbers

## April 22, 2026 Benchmark Maintenance Pass

These are the newest compatibility and truth-maintenance receipts from this repo workspace. They materially changed the benchmark lane, but they are not a public leaderboard claim.

- BridgeBench:
  - artifact: `artifacts/q-bridgebench-preflight-guard-20260422/bridgebench-report.json`
  - result: `failed_preflight`
  - truth: the local full-precision `q` BridgeBench lane now fails honestly before Python model load instead of crashing on Windows paging-file exhaustion. The current host only exposed about `1.0 GiB` free memory against an estimated `19 GiB` local requirement for CPU evaluation, so the truthful state for the default local lane is still `remote_required`, not a scored local receipt.
  - wrapper change:
    - `scripts/q-bridgebench.ts` now uses the shared `evaluateQTrainingPreflight(...)` host-memory gate before spawning Python, and writes that preflight into the report instead of letting model load fail mid-run
  - quantized runtime follow-up: `artifacts/q-bridgebench-all-20260422-4bit-runtime2/bridgebench-report.json`
    - result: `completed_with_errors`
    - truth: the quantized lane is no longer falsely blocked on `bitsandbytes`. The runtime now detects `bitsandbytes 0.49.2`, launches the real eval worker, and then fails inside model load with `OSError: The paging file is too small for this operation to complete. (os error 1455)` while safetensors are opening `google/gemma-4-E4B-it`. That is the honest current blocker for the local quantized `Q` lane on this host.
- Harbor / Terminal-Bench:
  - harness compatibility changes:
    - `scripts/q-terminalbench.ts` now keeps bounded Harbor runs scoped to their configured `jobs/` directory instead of falling back onto stale global Harbor results
    - bounded and official runs now default to deterministic `jobName` values, so fresh receipts have stable scoped job roots even when the caller does not provide one
    - `benchmarks/harbor/openjaws_agent.py` now runs through Harbor's current installed-agent API, no longer imports the removed `ExecInput` symbol, no longer reproduces the old root/sudo `--dangerously-skip-permissions` hard failure, and now stages a host-built bundled CLI plus the OCI bridge script instead of rebuilding the full repo inside every Harbor trial container
    - `scripts/q-terminalbench.ts` official-mode validation now accepts the sanctioned official setup budget instead of rejecting the same official defaults it applies
  - bounded forced smoke after Docker recovery: `artifacts/q-terminalbench-smoke-20260422-circuit-fibsqrt-force-dockerup/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - result: `completed_with_errors`
    - truth: Harbor reached a real scoped job and a real scoped task receipt on the current code path, with `0` execution errors and `1` benchmark-failing trial at reward `0.0`
  - bounded bundled-adapter proof: `artifacts/q-terminalbench-smoke-20260422-circuit-fibsqrt-bundlefast/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - result: `completed_with_errors`
    - truth: the bundled Harbor adapter cut agent setup to about `196s`, eliminated execution errors, and left only a real benchmark failure at reward `0.0`
  - official public-task five-trial replacement receipt: `artifacts/q-terminalbench-official-public-20260422-circuit-fibsqrt-dockerup/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - result: `completed_with_errors`
    - truth: this is the honest April 22 official replacement receipt. It no longer dies on stale Harbor path resolution, the Docker-daemon seam, or the old root/sudo permission flag. The current blocker is now explicit and narrower: all `5` trials ended in `AgentSetupTimeoutError`, so Harbor recorded `5` execution-error trials, `0` benchmark-failing trials, and `pass@2 = 0`, `pass@4 = 0`, `pass@5 = 0`
  - official public-task bundled rerun: `artifacts/q-terminalbench-official-public-20260422-circuit-fibsqrt-bundlefast/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - result: `completed_with_errors`
    - truth: this is now the newest honest April 22 official receipt. Harbor completed all `5` trials with `0` execution errors and `5` benchmark-failing trials, `pass@2 = 0`, `pass@4 = 0`, `pass@5 = 0`, and reward `0.0` across the board. The harness/setup blocker is cleared; the remaining blocker is model-task performance.
  - lighter adapter proof: `artifacts/q-terminalbench-smoke-20260422-circuit-fibsqrt-force-wrapperlite/terminalbench-report.json`
    - result: `completed_with_errors`
    - truth: switching the adapter away from per-trial native-binary rebuilds shortened the bounded run from about `13m 32s` to about `9m 37s`, but the smoke still spent about `450s` in agent setup and then tripped an `AttributeError`, so the default official `360s` setup window is still not comfortably green on this host
  - benchmark maintenance conclusion:
    - the truthful current state is that the Terminal-Bench harness itself is materially healthier on this host and now reaches bounded plus official Harbor receipts on the current code path without execution errors. The official lane is no longer setup-bound, but it is still not leaderboard-strong because the public task is still scoring `0.0`
- Immaculate Q benchmark:
  - artifact: `C:\Users\Knight\Desktop\Immaculate\Immaculate-push-harbor\docs\wiki\Q-Mediation-Drift.json`
  - result: fresh `April 22, 2026` bounded `q-mediation-drift` publication on the active `publish-q-win` lane
  - truth: `4` scenarios, `0` failed assertions, route-alignment `P50 1`, drift `max 0`, runner-path `P95 50.38 ms`
- W&B:
  - state: OpenJaws `Q` receipts and the fresh Immaculate rerun remained local-only on this machine because there is still no usable live W&B auth surface here
  - local proof:
    - `WANDB_API_KEY` absent from the active environment
    - `WANDB_API_KEY_FILE` / `IMMACULATE_WANDB_API_KEY_FILE` absent from the active environment
    - no local `wandb` CLI installed on PATH
    - no `%USERPROFILE%\\.netrc`
    - no `%USERPROFILE%\\.config\\wandb\\settings`
    - Immaculate's benchmark publisher and OpenJaws' local W&B resolver now both honor `WANDB_API_KEY_FILE` / `IMMACULATE_WANDB_API_KEY_FILE`, but no real file-backed key is configured on this host either
  - truth: only the older published Immaculate W&B runs at the top of this page are public benchmark URLs right now
- Website benchmark snapshot:
  - artifact: `website/lib/benchmarkSnapshot.generated.json`
  - result: regenerated on `2026-04-22`
  - truth: the public website snapshot now points at the newest locally generated benchmark receipts from this workspace instead of the older checked-in April snapshot

## April 24, 2026 Benchmark Handoff Precedence

`docs/wiki/Benchmark-Optimization-Handoff.md` is the active-work truth for the current TerminalBench blocker. The April 29 section above is now the public narrative for the newest reward-0 public-task receipt; do not restamp from older April 22 assumptions without checking the handoff first.

## April 22, 2026 Public Surface Sync

The public benchmark surfaces were refreshed again after the maintenance pass so the live sites reflect the same truthful local receipts.

- `qline.site`
  - deploy: `69e90fff2401871f09176860`
  - current live benchmark surface now shows:
    - BridgeBench: `failed_preflight`
    - Public TerminalBench: `completed_with_errors`
    - W&B: `auth missing`
- `aura-genesis.org`
  - the bounded public showcase lane now also mirrors:
    - `Q public benchmark board`
    - `Immaculate benchmark board`
  - these entries are public-safe summaries only and do not expose raw `00` benchmark payloads

Current truthful public summary from `website/lib/benchmarkSnapshot.generated.json`:

- BridgeBench:
  - status: `dry_run`
  - note: the latest April 29 lane completed as a dry run only; the local scored pack lane is still memory-blocked on this host
- 30-minute soak:
  - `52/52` probes succeeded
  - `0` errors
  - OpenJaws p95 `8455 ms`
  - direct OCI-Q p95 `4254 ms`
- Official TerminalBench public task:
  - task: `circuit-fibsqrt`
  - status: `completed_with_errors`
  - attempts: `5`
  - execution-error trials: `0`
  - benchmark-failing trials: `5`
  - mean reward: `0.0`
- W&B:
  - status: `auth missing`
  - truth: there was still no usable live local W&B auth surface for the OpenJaws Q pass, so the receipts stayed local and the website reports that honestly

## Local Q Snapshot

These local OpenJaws receipts are useful for honest in-repo tuning and shipping decisions. They are not a public leaderboard claim by themselves.

- BridgeBench:
  - artifact: `artifacts/q-bridgebench-live-20260422-rerun-1522/bridgebench-report.json`
  - best pack: `all`
  - score: `36.84`
  - bounded eval note: the freshest April 22 rerun on this workspace is lower than the older April 18 proof, so `36.84` is the truthful current local BridgeBench number
- 30-minute soak:
  - artifact: `artifacts/q-soak-live-20260416/q-soak-report.json`
  - result: `52/52` successful probes, `0` errors
  - OpenJaws latency: average `7573 ms`, p95 `8455 ms`
  - direct OCI-Q latency: average `3282 ms`, p95 `4254 ms`
- direct Q reasoning validation:
  - artifact: local OCI bridge smoke on `April 18, 2026`
  - result: direct OCI `Q` answered the fallback-hysteresis timing check correctly with `t = 70s`
- direct Q media validation:
  - artifact: direct OCI image-endpoint smoke on `April 18, 2026`
  - result: the current OCI `Q` runtime returned `404` for native image generation, so image/video belongs on a separate explicit media lane instead of silently swapping the active reasoning model
  - current media-lane state: the dedicated Gemini media lane is restored for explicit image/video work, but the configured Gemini project on this machine is still quota-blocked
- Harbor / Terminal-Bench:
  - single-task live receipt: `artifacts/q-terminalbench-live-20260416-ociq-fixed19/terminalbench-report.json`
  - state: Harbor, Docker, and provider preflight all passed, and the OCI IAM container bridge now reaches real execution
  - single-task result: `completed`
    - note: the harness/trial itself completed cleanly, but the verifier reward was still `0.0`, so this is execution proof rather than a benchmark pass claim
  - newest official public-task five-attempt receipt: `artifacts/q-terminalbench-official-public-20260429-circuit-fibsqrt-rerun/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - result: `completed_with_errors`
    - note: the freshest official public-dataset task finished with `5` attempts, `0` runtime-error trials, `5` benchmark-failing trials, the verifier reward stayed `0.0`, and the wrapper scrubbed Harbor raw env bundles in place
  - official leaderboard submission discussion:
    - `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141`
  - repeated-attempt stability receipt: `artifacts/q-terminalbench-repeat-smoke-20260416/terminalbench-report.json`
    - result: `completed_with_errors`
    - aggregate: `2` attempts, `1` benchmark-failing trial, `1` execution-error trial
  - repeated soak lane:
    - command: `bun run q:terminalbench:soak`
    - live receipt: `artifacts/q-terminalbench-soak-live-20260417-circuit-fibsqrt-v3/terminalbench-report.json`
    - result: `completed_with_errors`
    - truth: `2` cycles produced `2` total trials with `0` runtime errors and `2` benchmark-failing trials
  - real concurrent receipt: `artifacts/q-terminalbench-concurrent-smoke-20260416/terminalbench-report.json`
    - result: `completed_with_errors`
    - aggregate: `2` tasks at concurrency `2`, with `1` benchmark-failing trial and `1` execution-error trial
  - April 29 Harbor Docker env preflight:
    - result: `passed`
    - truth: the wrapper now checks Docker with the exact Harbor process environment before launch, so the earlier Windows Docker context mismatch is caught before a public run starts
- W&B:
  - state: attempted for the same local benchmark pass, but no local `WANDB_API_KEY` / login was configured
  - result: receipts stayed local only, and there is no truthful W&B URL to publish for this pass

The local `Q` benchmark lane follows the same broad principles used by Harbor, Terminal-Bench, LLM-as-a-judge flows, and Rewardkit:

- benchmark work is written to inspectable JSON receipts
- `bun run q:receipt:sign -- --report <path>` can repackage a benchmark report into one deterministic trace-backed receipt file, with an Ed25519 signature block when a signing key is configured
- the main Q benchmark lanes now all accept `--seed`, default to `42`, and emit that seed into the report plus signed receipt so reruns have one declared reproducibility anchor
- local results can emit `reward.json` and `reward-details.json` for downstream comparison
- hybrid sessions keep local and routed lane outcomes under one receipt instead of forcing you to compare two unrelated folders
- hybrid sessions now keep a 3-failures-in-60s transport hysteresis window for the Immaculate fast path, so one transient remote miss does not immediately suppress routed execution
- W&B state is captured in the run receipts with the resolved project URL when available, so it is obvious whether a run really logged live
- the new bounded `q:soak` lane records repeated-probe latency and error counts for both native OpenJaws and direct OCI Q under one JSON receipt
- OCI-backed one-shot `Q` surfaces can now use either a user key or an internal IAM project/profile, which keeps the auth boundary explicit instead of hiding shared credentials in the app
- the Windows OCI bridge now stages larger payloads through temp files, which keeps Harbor / Terminal-Bench preflight from failing on command-line length before the run even starts
- the Harbor adapter now stages a Linux Bun runtime from the host and installs the OCI bridge Python dependencies inside the container, so Terminal-Bench reaches real execution instead of dying during bootstrap
- the Harbor adapter now embeds OCI IAM config material into the staged Linux runtime instead of assuming the Windows-side `.oci` path is portable
- `q:terminalbench` now supports `--repeat` and writes `attempts[]` plus flattened `tasks[]` receipts, so repeated-run stability and real multi-task concurrency are inspectable instead of hidden inside Harbor internals
- `q:terminalbench` now also supports `--soak`, and `bun run q:terminalbench:soak` wraps that mode into a bounded repeated Terminal-Bench lane with `cycles[]`, per-cycle summaries, and a top-level `soak` receipt block
- the live repeated soak lane now writes into a managed per-run `jobs/` directory, and the wrapper only reads Harbor fallback results from that scoped lane when it exists, which stops stale global job results from contaminating fresh receipts
- Docker preflight for `q:terminalbench` now uses `docker version` instead of `docker info`, which matches the real Windows/Docker Desktop reachability surface on this machine more reliably
- `q:terminalbench` now also scrubs Harbor raw `jobs/.../result.json` env maps in place after a run, so the wrapper no longer leaves plaintext agent env bundles behind in those local artifacts
- small wiring smokes stay clearly labeled as local proof, not leaderboard claims
- any heavier public benchmark story still needs real provenance

Important honesty boundary:

- a local route that stays `pending_assignment` because no healthy Immaculate worker is eligible is a valid fail-closed result, not a fake dispatch success
- the W&B benchmark numbers above come from Immaculate itself; OpenJaws consumes and explains those records rather than inventing its own benchmark figures
- the local `Q` benchmark lane is useful for tuning and comparison, but it is not the public Terminal-Bench or Harbor leaderboard record
- a green `q:terminalbench --dry-run` proves Harbor, Docker, and the local OCI-backed OpenJaws path are ready; it does not count as a published benchmark run by itself
- a green `q:terminalbench:soak -- --dry-run` proves the repeated soak receipt shape and command wiring; the live `v3` soak receipt above is the honest published bounded soak artifact from this workspace snapshot
- the newest local Harbor receipts now include one bounded clean single-task completion plus repeated-run and concurrent receipts, but the lane is still variant and not ready for leaderboard claims
- the newest official public-task receipt is now packaged and submitted through the official leaderboard repo, but the verifier reward is still `0.0`, so it is not a strong benchmark result yet
- downloaded public installs should still bring their own `Q` / `OCI` key unless you have built and operate a separate hosted entitlement service
- the Harbor / Terminal-Bench adapter in this repo is for honest local runs and exportable receipts, not automatic leaderboard publication
- public hosted `Q` credits, billing, and rate limiting still need to live in the operator service that issues keys; this repo does not ship a payment processor or hosted billing backend by itself

## GitHub Automation

The repo now also carries a scheduled/sample benchmark wiring workflow:

- `.github/workflows/q-benchmark-soak.yml`
- it builds a small audited sample bundle
- it runs `q:bridgebench` in dry-run mode
- it runs `q:hybrid` in dry-run mode
- it runs `q:terminalbench --dry-run`
- it uploads the resulting JSON receipts as artifacts

That workflow is meant to prove benchmark-lane health and artifact shape in CI. It is not a substitute for a real hosted OCI benchmark pass or a published Harbor / Terminal-Bench leaderboard run.

## Reproducibility Notes

The benchmark source of truth lives in Immaculate, not in OpenJaws. OpenJaws consumes the published benchmark record and uses it to explain why Immaculate-backed orchestration improves routing, pressure control, and recovery semantics inside the cockpit.
