# Immaculate Integration

Immaculate is the control layer inside OpenJaws.

In plain terms: it helps OpenJaws make smarter decisions about where work should run, when retries should happen, which worker is healthy, and whether the app should fail closed instead of pretending everything is fine.

## What It Does

- adds live checkpoints to the main loop
- helps shape tool routing and retries
- influences how OpenCheek agents start, resume, and pace themselves
- tracks which workers can handle `Q` jobs
- exposes system state so operators can see what is happening

## How It Improves OpenJaws

Immaculate improves OpenJaws by replacing guesswork with visible decisions.

- fewer silent fallbacks when a route, worker, or runtime is not really available
- better load handling when several OpenCheek agents are active at once
- clearer remote execution rules for `Q`
- one shared control language across `/immaculate`, `/status`, background tasks, and route state
- better receipts for users who want to know what the app is actually doing before they trust it

## Execution Model

1. OpenJaws resolves local config and live harness state.
2. Immaculate surfaces the current pressure, recommended layer, and worker pool.
3. Agent/tool/routing decisions use that live state instead of fixed heuristics.
4. Routed `Q` work is signed, queued, assigned, dispatched, and reconciled through the same control plane.

## What Installed Users See

OpenJaws shows Immaculate through normal operator paths, not hidden internal controls.

- `/status` shows route queue state, worker health, runtime mode, routed execution details, and the active Immaculate trace when a run is in flight
- flight-deck notices surface pending assignment and routed `Q` state
- background task surfaces reflect burst budgets, deferred launches, and crew pressure
- `/immaculate` exposes topology and control state directly for operators who want a deeper view
- `/status` and `/immaculate` prefer the current active Immaculate trace, and `/status` applies the same active-run-first selection to Q benchmark traces before falling back to the newest completed receipt

## Shared Policy Layer

OpenJaws now keeps the most important routed-`Q` and Immaculate timing rules in one shared module instead of letting the same numbers drift across launch helpers, routing code, and worker surfaces.

- fast-path suppression window and failure threshold for routed `Q`
- route-claim TTL and worker lease duration defaults
- Immaculate crew hold/retry delays under pressure

That keeps the decision surface easier to audit and reduces the chance that launch, routing, and worker code quietly diverge.

## Runtime Coherence Audit

OpenJaws now has a read-only runtime coherence check that compares the current live state instead of trusting one receipt in isolation.

- live Immaculate reachability
- Discord `Q` runtime receipt state
- patrol snapshot vs. live harness reachability
- route queue depth
- latest Immaculate and Q trace summaries
- roundtable runtime state
- loopback health for `Q`, `Viola`, and `Blackbeak`

Current fail-closed posture:

- harness down plus no active trace is a warning, not a fake green
- active-trace/live-harness disagreement is a failure
- Discord patrol and queue-depth drift are surfaced as mismatches instead of being silently ignored

Use:

```powershell
bun run runtime:coherence
```

That command is an audit surface, not a repair action.

## Security and Reliability Posture

Immaculate is there to reduce hidden failure modes, not to take control away from the local operator.

- permission prompts still belong to OpenJaws and the operator
- route assignment and worker capability checks are fail-closed
- signed route and result envelopes are used for remote `Q` execution
- worker heartbeat and assignment health are surfaced instead of silently ignored
- installed users should still verify provider/runtime state through `/status` after switching providers or updating builds

## Why It Matters

- fewer silent fallbacks
- clearer visibility
- steadier behavior under concurrent load
- safer remote execution
- one shared control language across the TUI, workers, queue state, and status receipts

## Current Working Areas

- crew-pressure shaping
- remote worker capability registry
- signed `Q` route dispatch and completion
- fail-closed worker sync
- status and flight-deck visibility for pending assignment and route health

## Verified Q Training Contract

The current highest-signal Immaculate tree for OpenJaws integration work is:

- `C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway-push-q-soak`

The older:

- `C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway-push-oci-advisor`

still matters for Cloudflare and Colab references, but it is not the main current source of truth for OCI and benchmark flow.

The bounded hybrid session contract lives in:

- `training/q/README.md`
- `training/q/hybrid_training_session.example.json`
- `training/q/run_q_training_session.py`
- `docs/wiki/Q-Hybrid-Training.md`

The important manifest keys OpenJaws should stay compatible with are:

- `sessionId`
- `q.trainingLockPath`
- `q.configPath`
- `q.mixManifestPath`
- `q.curationRunPath`
- `q.benchmarkCorpusPath`
- `q.benchmarkCorpusJsonlPath`
- `q.failureCorpusPath`
- `immaculate.bundleOutputPath`
- `local.{enabled,python,mode}`
- `cloud.{enabled,provider,mode,requiredEnv,optionalEnv,envFilePath,inlineEnv,launchCommand,notes}`
- `artifacts.{sessionRoot,wikiJsonPath,wikiMarkdownPath}`
- `policy.{buildImmaculateBundle,allowCloudLaunchWhenDoctorFails}`

## Verified OCI Q Training Lane

The OCI training controller and node contract lives in:

- `deploy/oci-training/env/immaculate-q-training.env.example`
- `deploy/oci-training/cloud-init/immaculate-q-training.cloud-init.yaml`
- `deploy/oci-training/scripts/run-immaculate-q-training.sh`
- `deploy/oci-training/scripts/launch-oci-q-training.sh`
- `deploy/oci-training/scripts/fetch-oci-training-secrets.sh`
- `docs/wiki/OCI-Q-Training.md`

The important split is:

- the controller side uses OCI CLI auth and launch metadata
- the launched training node uses `instance_principal`

The current required launch inputs are:

- `OCI_COMPARTMENT_OCID`
- `OCI_SUBNET_OCID`
- `OCI_AVAILABILITY_DOMAIN`
- `OCI_IMAGE_OCID`
- `OCI_SHAPE`
- `OCI_OBJECT_STORAGE_NAMESPACE`
- `OCI_OBJECT_STORAGE_BUCKET`

The current secret and runtime filesystem contract is:

- `OCI_Q_TRAINING_HF_TOKEN_SECRET_OCID`
- `OCI_Q_TRAINING_WANDB_API_KEY_SECRET_OCID`
- `HF_TOKEN_FILE`
- `WANDB_API_KEY_FILE`
- `HF_HOME`
- `TRANSFORMERS_CACHE`
- `WANDB_DIR`

## Verified W&B Contract

The working W&B source files in Immaculate are:

- `scripts/bootstrap-wandb.ps1`
- `scripts/bootstrap-wandb.mjs`
- `scripts/bootstrap-wandb.sh`
- `apps/harness/src/wandb.ts`
- `apps/harness/src/wandb-publish-cli.ts`
- `apps/harness/scripts/publish_wandb.py`
- `apps/harness/scripts/export_wandb_benchmarks.py`

The current env contract is:

- `IMMACULATE_WANDB_ENTITY` or `WANDB_ENTITY`
- `IMMACULATE_WANDB_PROJECT` or `WANDB_PROJECT`
- `IMMACULATE_WANDB_MODE` or `WANDB_MODE`
- `IMMACULATE_WANDB_API_KEY` or `WANDB_API_KEY`
- `IMMACULATE_WANDB_PYTHON`
- `IMMACULATE_WANDB_PUBLISH_TIMEOUT_MS`

The actual behavior is:

- `offline` mode only needs the SDK
- `online` mode needs the SDK plus a real API key
- the bootstrap scripts install `wandb` into `.tools/wandb-venv`; they do not magically log you in

In the current OpenJaws shell, the Immaculate-local W&B venv is present but not logged in. That means OpenJaws can report W&B readiness truthfully, but it should not claim a fresh live W&B publish until a real key or Vault-backed secret is active.

## Verified Benchmark Flow

The current benchmark and promotion flow is defined in:

- `apps/harness/src/benchmark-cli.ts`
- `apps/harness/src/benchmark-gate-cli.ts`
- `apps/harness/src/q-benchmark-sweep-report.ts`
- `docs/wiki/Q-Benchmark-Sweep-60m.md`
- `docs/wiki/Q-Benchmark-Promotion.md`

The operational sequence is:

1. `npm run benchmark[:pack]`
2. `npm run benchmark:gate[:all]`
3. `npm run benchmark:publish:wandb`
4. `npm run benchmark:export:wandb`
5. `npm run benchmark:soak:60m`
6. `npm run benchmark:temporal`
7. wiki export/publication

That matters to OpenJaws because the public benchmark story still belongs to Immaculate. OpenJaws should keep consuming that published record honestly instead of inventing parallel leaderboard claims.

## Cloudflare and Colab References

The Cloudflare and Colab helper path still exists in the older OCI-advisor tree:

- `training/q/launch_cloudflare_q_inference.py`
- `training/q/export_cloudflare_adapter.py`
- `training/q/export_colab_free_training.py`
- `training/q/build_q_colab_micro_config.py`
- `docs/wiki/Cloudflare-Q-Inference.md`
- `docs/wiki/Colab-Free-Training.md`

The important current boundary is:

- those files are still useful reference material
- they are not the main current OCI benchmark/training source of truth

## OpenJaws Truth Boundary

OpenJaws now has a working Harbor / Terminal-Bench OCI bridge path for `Q`, but the honest state today is:

- the old OCI config portability failure is fixed
- Harbor setup now needs an explicit setup-timeout multiplier for the OpenJaws adapter
- bounded Harbor runs can now reach real execution
- task outcomes are still variant and should be reported as local receipts until the lane is more stable
- W&B publication is still blocked locally until a real key or Vault-fed secret is present
