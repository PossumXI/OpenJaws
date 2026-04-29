# Benchmark Optimization Handoff

Updated: 2026-04-29

## Precedence

This handoff is the active benchmark-work truth as of April 29, 2026. `docs/wiki/Benchmark-Status.md` is the public narrative and may lag this file until a real scored receipt changes public surfaces. Do not rerun or restamp from older April 22 assumptions without checking this handoff first.

## 2026-04-29 Local Validation Pass

- `bun run q:terminalbench -- --dry-run` passed preflight as `q-terminalbench-20260429T022344`.
  - Harbor reachable.
  - Docker reachable.
  - OCI `Q` provider reachable through `/responses`.
  - Harbor Docker environment matched the process environment.
  - This was a preflight/dry-run only, not a scored public task run.
- `bun run q:bridgebench -- --dry-run` produced `q-bridgebench-20260429T024506`.
  - The dry run completed.
  - The actual local model packs were correctly blocked by host memory pressure: about 3.6 GiB available against roughly 29 GiB needed for `google/gemma-4-E4B-it`.
  - Do not convert this into a public score.
- `bun run website:snapshot:generate` refreshed `website/lib/benchmarkSnapshot.generated.json` at `2026-04-29T02:45:07.319Z`.
- `bun run website:snapshot:check` passed after regeneration.
- `bun run test` passed: 536 Bun tests plus the script test sweep of 100 tests, with 0 failures.

## 2026-04-29 Verifier Repair And Task Selection Pass

- New wrapper capability:
  - `--benchmark-repair-hint <text>` passes verifier-derived failure evidence into the Harbor OpenJaws agent as an explicit repair prompt.
  - failed task receipts now produce a top-level `repairPlan` with failed task names, reward state, verifier stdout/stderr availability, and a bounded hint preview.
  - `--task-selection-lane` plus repeated `--task-candidate-name` values tries public tasks sequentially and stops after the first passing task or `rewardTotal > 0`.
- Harbor environment repair:
  - `scripts/harbor-cli.cmd` now prefers `.tools/harbor-venv\Scripts\python.exe` when present and launches the repo-patched `scripts/harbor_cli.py`.
  - `.tools/` is gitignored so Harbor can use compatible isolated dependencies without breaking the global Python packages used by security tools and OCI CLI.
- Dry-run proof:
  - command: `bun run q:terminalbench -- --dry-run --task-selection-lane --task-candidate-name circuit-fibsqrt --task-candidate-name json-grep --benchmark-repair-hint "Verifier stdout: placeholder output did not satisfy sample." --out-dir artifacts\q-terminalbench-selector-dryrun-20260429-v2`
  - artifact: `artifacts/q-terminalbench-selector-dryrun-20260429-v2/terminalbench-report.json`
  - result: `dry_run`
  - checks: Harbor, Docker, OCI Q provider, clock skew, and Harbor Docker environment all passed.
  - truth: this is a launch-readiness proof for the repair/selection lane, not a scored public TerminalBench result.
- Q_agents orchestration:
  - `src/tools/shared/spawnMultiAgent.ts` now reuses one Immaculate deck receipt across crew launch pacing and crew handoff announcement.
  - This removes one duplicate live harness probe per teammate spawn while preserving the same health and pressure decision semantics.

## 2026-04-29 Official Public TerminalBench Rerun

- Command: `bun run q:terminalbench -- --official-submission --include-task-name circuit-fibsqrt --out-dir artifacts\q-terminalbench-official-public-20260429-circuit-fibsqrt-rerun`
- Artifact: `artifacts/q-terminalbench-official-public-20260429-circuit-fibsqrt-rerun/terminalbench-report.json`
- Result: `completed_with_errors`
- Aggregate: `5` trials, `0` execution-error trials, `5` benchmark-failing trials, reward `0.0`, `pass@2 = 0`, `pass@4 = 0`, `pass@5 = 0`
- Submission discussion: `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141`
- Truth: the current blocker is no longer Docker, Harbor bootstrapping, missing verifier outputs, or OpenJaws write permissions. The blocker is task quality: Q still creates placeholder, pass-through, or incomplete `gates.txt` artifacts for `circuit-fibsqrt`.
- Fix landed from this run: `q:terminalbench` now runs a `harbor-docker-env` preflight using the exact Harbor process environment so a Windows Docker Desktop context mismatch fails before an official run starts.
- Follow-up hardening: official Terminal-Bench mode now emits Harbor `--timeout-multiplier 1` and rejects any other timeout multiplier before launch, matching the public submission validator instead of wasting a run on a non-compliant job config.

## Current TerminalBench Lane

- Harbor adapter: `benchmarks/harbor/openjaws_agent.py`
- Model lane: `oci:Q`
- Default benchmark runtime: Harbor runtime CLI bundle
- Debug-only fallback: raw source-tree lane via `--source-tree-runtime`
- Workspace inside Harbor container: `/app`
- Source root staged into container: `/opt/openjaws-src`
- OpenJaws benchmark launcher inside container: `/usr/local/bin/openjaws`
- Workspace harness bootstrap seeded into each task workspace:
  - `/app/.openjaws_harness_bootstrap.py`
  - `/app/.openjaws_harness_notes.md`

## Current Known-Good Runtime Truth

- OCI provider preflight is healthy again through `/responses`.
- The benchmark launcher now defaults to the Harbor runtime CLI bundle. The raw source-tree lane is debug-only because the unbundled entrypoint path is not benchmark-safe.
- The Harbor agent now marks the benchmark container as sandboxed with `IS_SANDBOX=1` when permission bypass is enabled.
- The Harbor agent now forces `environment.task_env_config.workdir = /app` so task verifiers inherit the same workspace cwd as the agent.
- On Windows, the TerminalBench launcher now pins Harbor to Docker Desktop's `desktop-linux` context and `npipe:////./pipe/dockerDesktopLinuxEngine` host when Docker env vars are otherwise unset.
- The `circuit-fibsqrt` verifier now writes `reward.txt` and `test-stdout.txt`; the old `RewardFileNotFoundError` path is no longer the current blocker for the latest bounded smoke.
- TerminalBench task receipts now include verifier diagnostics and OpenJaws final-output summaries, including a `selfReportedIncomplete` signal for placeholder/infeasibility endings.

## Latest Bounded Public-Task Smokes

- `q-terminalbench-smoke-20260423-circuit-fibsqrt-harnessseed-sourcetree-rerun1`
  - raw source-tree lane produced an empty OpenJaws result
  - valid Harbor receipt, but no usable task artifact
- `q-terminalbench-smoke-20260423-circuit-fibsqrt-harnessseed-sourcetree-rerun2`
  - raw source-tree lane failed inside the CLI with `ReferenceError: MACRO is not defined`
  - confirms the unbundled source-tree path is benchmark-unsafe
- `q-terminalbench-smoke-20260424-circuit-fibsqrt-bundledefault-rerun1`
  - runtime-bundle lane restored
  - Q wrote only a trivial placeholder artifact
  - execution still showed permission denials while trying to write `/app/gates.txt`
- `q-terminalbench-smoke-20260424-circuit-fibsqrt-bundledefault-rerun2`
  - naive root bypass fix failed
  - OpenJaws rejected `--dangerously-skip-permissions` under root without sandbox marking
- `q-terminalbench-smoke-20260424-circuit-fibsqrt-bundledefault-rerun3`
  - root permission blocker cleared
  - `permissionMode=bypassPermissions` was active and `permission_denials=[]`
  - Q wrote `gates.txt` and compiled `sim.c`
  - Harbor still ended as `RewardFileNotFoundError`
- `q-terminalbench-smoke-20260424-circuit-fibsqrt-bundledefault-rerun4`
  - verifier cwd fix landed
  - agent setup time rose, but Harbor still ended as `RewardFileNotFoundError`
  - verifier directory still came back without `reward.txt`, `reward.json`, or `test-stdout.txt`
- `q-terminalbench-smoke-20260426-circuit-fibsqrt-dockerenv1`
  - Docker/Harbor daemon mismatch cleared by explicitly passing Docker Desktop env into the Harbor process
  - Harbor produced a real job result and verifier artifacts
  - verifier wrote `reward.txt` and `test-stdout.txt`
  - reward was `0.0`; `test_gates_file_exists` and `test_gates_file_size` passed, `test_sqrt_fib` failed
  - Q wrote a placeholder/pass-through style artifact and self-reported that it did not compute `fib(isqrt(N)) % 2^32`
- `q-terminalbench-smoke-20260426-circuit-fibsqrt-promptharden1`
  - adapter prompt was hardened against placeholder/scaffold-only endings and the Windows log alias escape warning was removed
  - Harbor again completed without execution errors and verifier artifacts were present
  - reward was still `0.0`; Q again stopped with feasibility analysis plus a placeholder/trivial-copy attempt
  - report now captures the self-reported incomplete final output in the task row

## Current Hard Blocker

- The model write-permission failure is no longer the active blocker.
- The scorer-side missing-reward blocker is cleared in the latest bounded smoke.
- The current blocker is agent/task quality: Q exits after feasibility analysis and a placeholder/trivial-copy `gates.txt` attempt instead of generating and iterating on a real circuit artifact.
- Latest `circuit-fibsqrt` receipts are honest scored reward-0 benchmark failures, not execution-error receipts.

## Current Optimization Knobs

- Benchmark contract is action-first:
  - requires a concrete workspace attempt before infeasibility language
  - requires verification against requested behavior instead of stopping at starter/example behavior
  - points the model at the workspace-local harness scaffold first for hard tasks
- Runtime bundle build is hard-bounded and fail-closed.
- OCI bridge parsing is hardened in `src/utils/ociQBridge.ts` so valid success JSON is not downgraded into false auth failures.

## Operator Guidance

- Do not restamp public benchmark surfaces from `rerun3` or `rerun4`; both are still execution-error receipts.
- If you rerun public-task TerminalBench next, stay on the default runtime-bundle lane. Only pass `--source-tree-runtime` when explicitly debugging the raw source-tree path.
- Next inspection targets are narrow:
  1. decide whether to invest in a task-specific circuit generator/search strategy for `circuit-fibsqrt`, or move to a less adversarial public task for a first nonzero receipt
  2. keep the verifier diagnostics in the report; they are now the fastest way to distinguish infra failure from reward-0 task failure
  3. do not restamp public benchmark surfaces from reward-0 receipts unless the copy explicitly says reward 0 and benchmark-failing
- If a future rerun produces a real scored receipt, regenerate these OpenJaws public surfaces:
  - `website/lib/benchmarkSnapshot.generated.json`
  - `docs/wiki/Benchmark-Status.md`
  - `docs/wiki/Public-Showcase-Activity.json`
  - `C:\Users\Knight\.arobi-public\showcase-activity.json`
- If you need a fresh truthful benchmark surface sequence in Immaculate after a real receipt changes, use:
  1. `npm run bridgebench`
  2. `npm run benchmark:terminalbench:public-task`
  3. `npm run benchmark:terminalbench:receipt`
  4. `npm run q:failure-corpus`
  5. `npm run q:benchmark:corpus`
  6. `npm run q:release-gate`
  7. `npm run release:surface`

## W&B Truth

- Offline/local publication may work through `WANDB_MODE=offline npm run benchmark:publish:wandb` if the Python `wandb` SDK is installed.
- `benchmark:export:wandb` still requires a real key through `WANDB_API_KEY`, `IMMACULATE_WANDB_API_KEY`, `WANDB_API_KEY_FILE`, or `IMMACULATE_WANDB_API_KEY_FILE`.
- On this host, process/user/machine scope currently has no `WANDB_API_KEY`, `IMMACULATE_WANDB_API_KEY`, `WANDB_API_KEY_FILE`, `IMMACULATE_WANDB_API_KEY_FILE`, `WANDB_ENTITY`, or `WANDB_PROJECT`. Do not publish W&B benchmark claims until a real key and target are injected.

## BridgeBench Remote Worker Truth

- `scripts/q-route-remote-dispatch-live.ts` now waits for a harness-visible worker before launching, so it no longer accepts a local route-worker file as proof of Immaculate enrollment.
- `src/q/routing.ts` now retries Immaculate assignment for pending Immaculate-owned queue entries after each successful worker heartbeat. This prevents routes from staying stuck forever if a real worker appears after launch.
- The latest live remote-dispatch smoke reached the correct fail-closed state: one remote worker was visible to Immaculate, but it was blocked as `unverified federation worker`, so no remote dispatch was sent.
- A direct BridgeBench run is still blocked on this host by memory/pagefile pressure for `google/gemma-4-E4B-it`; this must not be converted into a public score.
- Use `bun scripts/register-immaculate-federation-peer.ts --control-plane-url <remote-harness-url>` to enroll a real remote Immaculate peer. The script refuses to proceed without a real remote control-plane URL and reports imported/eligible worker counts without printing auth tokens.
