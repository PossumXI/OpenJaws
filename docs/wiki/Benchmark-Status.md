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

## April 22, 2026 Benchmark Maintenance Pass

These are the newest compatibility and truth-maintenance receipts from this repo workspace. They materially changed the benchmark lane, but they are not a public leaderboard claim.

- BridgeBench:
  - artifact: `artifacts/q-bridgebench-live-20260422-agentic-preflightfix/bridgebench-report.json`
  - result: `failed_preflight`
  - truth: the live local `Q` BridgeBench lane now fails closed on this Windows host before Python launches when the host memory budget is below the audited `gemma-4-E4B-it` requirement, so the benchmark no longer dies inside model-weight paging
  - current host budget proof: the fresh receipt recorded `available 1.4 GiB / total 23 GiB; need about 29 GiB available`
  - wrapper follow-up:
    - `q:bridgebench` and `q:preflight -- --bench bridgebench` still auto-resolve the freshest `artifacts/q-benchmark-audited-*` bundle instead of the stale legacy default
    - `scripts/q-bridgebench.ts` now guards import-time execution and records the benchmark host’s memory gate into the pack preflight section
    - the canonical Windows benchmark runtime is `D:\openjaws\OpenJaws\.venv-gemma4\Scripts\python.exe`
    - explicit quantized eval is available with `--load-in-4bit`; automatic 4-bit fallback stays opt-in via `OPENJAWS_BRIDGEBENCH_AUTO_4BIT=true` because this host still needs a deliberate operator choice before comparing quantized and non-quantized local receipts
- Harbor / Terminal-Bench:
  - harness compatibility changes:
    - `scripts/q-terminalbench.ts` now uses Harbor's current `--include-task-name` filter instead of the removed `--task-name` flag
    - `benchmarks/harbor/openjaws_agent.py` now loads against the current Harbor installed-agent API instead of importing the removed `ExecInput` symbol
    - `src/q/preflight.ts` now prefers the repo-local `scripts/harbor-cli.cmd` wrapper on Windows, so `q:preflight -- --bench terminalbench` resolves the actual Harbor command from this repo instead of requiring a global `harbor.exe`
    - `scripts/harbor-cli.cmd` now documents the canonical Windows Harbor entrypoint for this repo: `python -m harbor.cli.main`, optionally via `OPENJAWS_HARBOR_PYTHON`
    - `benchmarks/harbor/openjaws_agent.py` now omits `--dangerously-skip-permissions` when Harbor is executing the agent as root inside the container, which removes the April 22 root/sudo hard failure
  - one-attempt post-fix smoke: `artifacts/q-terminalbench-live-20260422-circuit-fibsqrt-force/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - result: `completed_with_errors`
    - truth: after the root/sudo permission fix, the Harbor lane reaches a real benchmark verdict again on the current code path; the task completed with reward `0.0`, `0` execution errors, and `1` benchmark-failing trial
  - official public-task five-attempt rerun: `artifacts/q-terminalbench-official-public-20260422-circuit-fibsqrt-v2/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - result: `failed`
    - truth: the official lane now reaches a real five-trial Harbor job on the current code path; `4` trials completed with reward `0.0`, `1` trial hit `AgentSetupTimeoutError`, and Harbor returned `pass@2 = 0`, `pass@4 = 0`, `pass@5 = 0`
  - transient runtime note:
    - `artifacts/q-terminalbench-official-public-20260422-circuit-fibsqrt-v1/terminalbench-report.json`
    - truth: the first official rerun on this date failed early with `Docker daemon is not running` even though bounded Harbor runs were already succeeding on the same host, so the Windows Harbor/Docker surface is still variant and should be treated as non-deterministic until that daemon flake is root-caused
  - benchmark maintenance conclusion:
    - the truthful current state is that the Terminal-Bench harness itself is materially healthier on this host and can now reach both bounded and official Harbor receipts on the current code path, but the model still scores `0.0` on the public task and the Windows Harbor/Docker runtime still shows occasional daemon/setup variance
- Website benchmark snapshot:
  - artifact: `website/lib/benchmarkSnapshot.generated.json`
  - result: regenerated on `2026-04-22`
  - truth: the public website snapshot now points at the newest locally generated benchmark receipts from this workspace instead of the older checked-in April snapshot

## April 18, 2026 Local Q Snapshot

These are the newest local OpenJaws receipts from this repo workspace. They are useful for honest in-repo tuning and shipping decisions. They are not a public leaderboard claim.

- BridgeBench:
  - artifact: `artifacts/q-bridgebench-live-20260418-proof/bridgebench-report.json`
  - best pack: `all`
  - score: `42.11`
  - bounded eval note: this fresh proof kept the same audited-pack score while moving onto the new typed trace + signed receipt lane
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
  - official public-task five-attempt receipt: `artifacts/q-terminalbench-official-public-20260416-circuit-fibsqrt-v2/terminalbench-report.json`
    - task: `circuit-fibsqrt`
    - result: `completed_with_errors`
    - note: the official public-dataset task finished with `5` attempts, `0` runtime errors, the verifier reward stayed `0.0`, and the wrapper scrubbed Harbor raw env bundles in place
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
  - fresh bounded wrapper proof: `artifacts/q-terminalbench-live-20260418-proof9/terminalbench-report.json`
    - result: `completed_with_errors`
    - truth: the current wrapper reached Harbor execution on the new code path, but the Windows Harbor/Docker environment still threw `NotImplementedError` during trial environment startup, so the official five-attempt public receipt above remains the truthful published TerminalBench record
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
