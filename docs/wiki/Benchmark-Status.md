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
- `bun run q:curriculum` for bounded specialization runs plus follow-up local pack comparison
- `bun run q:hybrid` for one bounded local lane plus one Immaculate-routed lane under a shared receipt
- `bun run q:terminalbench` for Harbor / Terminal-Bench runs when the external harness is actually installed
- `bun run q:soak` for a bounded repeated-probe soak over native OpenJaws and direct OCI Q
- `bun run q-route:assignment` for `Q` route assignment behavior
- `bun run q-route:remote-dispatch` for signed remote-dispatch behavior
- `bun run q-route:remote-completion` for signed remote-result reconciliation

## April 16, 2026 Local Q Snapshot

These are the newest local OpenJaws receipts from this repo workspace. They are useful for honest in-repo tuning and shipping decisions. They are not a public leaderboard claim.

- BridgeBench:
  - artifact: `artifacts/q-bridgebench-live-20260415-nowandb/bridgebench-report.json`
  - best pack: `all`
  - score: `42.11`
  - bounded eval note: `agentic` matched the same score on the same small audited smoke bundle
- 30-minute soak:
  - artifact: `artifacts/q-soak-live-20260416/q-soak-report.json`
  - result: `52/52` successful probes, `0` errors
  - OpenJaws latency: average `7573 ms`, p95 `8455 ms`
  - direct OCI-Q latency: average `3282 ms`, p95 `4254 ms`
- Harbor / Terminal-Bench:
  - artifact: `artifacts/q-terminalbench-live-20260416-ociq-fixed9/terminalbench-report.json`
  - state: Harbor, Docker, and provider preflight all passed
  - latest run: `completed_with_errors`
  - current blocker: the one-task Harbor run reached real execution, but it still ended with one runtime error because the OCI IAM config path is not yet portable end to end for the staged Linux runtime
- W&B:
  - state: attempted for the same local benchmark pass, but no local `WANDB_API_KEY` / login was configured
  - result: receipts stayed local only, and there is no truthful W&B URL to publish for this pass

The local `Q` benchmark lane follows the same broad principles used by Harbor, Terminal-Bench, LLM-as-a-judge flows, and Rewardkit:

- benchmark work is written to inspectable JSON receipts
- local results can emit `reward.json` and `reward-details.json` for downstream comparison
- hybrid sessions keep local and routed lane outcomes under one receipt instead of forcing you to compare two unrelated folders
- W&B state is captured in the run receipts with the resolved project URL when available, so it is obvious whether a run really logged live
- the new bounded `q:soak` lane records repeated-probe latency and error counts for both native OpenJaws and direct OCI Q under one JSON receipt
- OCI-backed one-shot `Q` surfaces can now use either a user key or an internal IAM project/profile, which keeps the auth boundary explicit instead of hiding shared credentials in the app
- the Windows OCI bridge now stages larger payloads through temp files, which keeps Harbor / Terminal-Bench preflight from failing on command-line length before the run even starts
- the Harbor adapter now stages a Linux Bun runtime from the host and installs the OCI bridge Python dependencies inside the container, so Terminal-Bench reaches real execution instead of dying during bootstrap
- small wiring smokes stay clearly labeled as local proof, not leaderboard claims
- any heavier public benchmark story still needs real provenance

Important honesty boundary:

- a local route that stays `pending_assignment` because no healthy Immaculate worker is eligible is a valid fail-closed result, not a fake dispatch success
- the W&B benchmark numbers above come from Immaculate itself; OpenJaws consumes and explains those records rather than inventing its own benchmark figures
- the local `Q` benchmark lane is useful for tuning and comparison, but it is not the public Terminal-Bench or Harbor leaderboard record
- a green `q:terminalbench --dry-run` proves Harbor, Docker, and the local OCI-backed OpenJaws path are ready; it does not count as a published benchmark run by itself
- the latest live Harbor run reached agent execution, but it did not complete the task successfully, so the public snapshot should describe it as an error-bearing run, not a success claim
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
