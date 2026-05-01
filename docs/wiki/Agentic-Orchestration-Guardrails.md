# Agentic Orchestration Guardrails

This page captures the safe operating principles OpenJaws applies from recent system-card review and the Symphony orchestration model. The goal is faster Q, Q_agents, OpenCheek, Immaculate, and JAWS coordination without weakening context boundaries, user trust, or public release safety.

## Public Release Gate

`bun scripts/agentic-orchestration-guardrails.ts --json` is a lightweight public release gate. It checks that the current repo still carries the core guardrail surfaces for context trust, signed Q routing, worker health, live runtime coherence, TerminalBench receipts, PersonaPlex redaction, public copy safety, and JAWS mirror health.

`bun run system:check` runs the same audit as part of the release-style harness. If a future optimization removes one of these surfaces, the release check should fail until the replacement is deliberate and documented.

## Context Trust

JAWS Context Brain must use a trust-tiered context envelope:

- `user_instruction`: direct user requests and explicit approvals
- `trusted_repo_state`: file names, hashes, counts, and aggregate workspace facts
- `tool_result`: command output and runtime probes
- `external_web`: browser/page/search material
- `worker_summary`: outputs from Q_agents, OpenCheek, or Immaculate workers
- `untrusted_artifact`: PDFs, downloaded files, Discord logs, screenshots, and generated receipts

Only `user_instruction` and coordinator-approved `trusted_repo_state` can steer tools directly. Tool results, PDFs, browser pages, Discord logs, and worker summaries are evidence, not instructions. Context Brain stays aggregate-only by default and must not display raw source, secrets, env files, private prompts, or token-shaped values.

## Worker Receipts

Implementation workers should produce structured worker receipts instead of free-form "done" claims. A receipt should include:

- `claim`
- `evidence_paths`
- `commands_run`
- `files_changed`
- `verification_status`
- `risk_flags`
- `open_questions`

Coordinator synthesis should aggregate evidence, not votes. Disagreements between workers are useful signal and must not be hidden by a majority summary.

## Health-Gated Dispatch

Q route and Immaculate dispatch must remain health-gated dispatch:

- exact `lineageId` and `phaseId` carry intent across Q, Immaculate, BridgeBench, TerminalBench, and roundtable receipts
- route manifests and terminal results remain signed
- stale, faulted, unverified, or unassigned workers stay fail-closed in `pending_assignment` or `blocked`
- worker heartbeat, lease, and assignment state are preferred over stale completed receipts
- route smoke fixtures are resolved from the explicit repo root and carry a fixture integrity marker, so CI/live checks do not accidentally reuse stale bundles from a different working directory

No route should silently fall back to a local or remote process when the selected worker is not eligible.

## Cognitive Runtime Admission

OpenJaws now treats risky agent work as a governed runtime admission problem before dispatch. The core backend model lives in `src/utils/cognitiveRuntime.ts` and gives Q, Q_agents, OpenCheek, Immaculate, and JAWS shared primitives instead of one-off checks:

- persistent memory layers: working, episodic, semantic, and procedural
- explicit goal objects with owner, constraints, authority scope, success criteria, rollback plan, and audit requirements
- planner, executor, critic, governor, and recorder role separation
- risk-tiered tool registry from Tier 0 read-only work through Tier 5 infrastructure or regulated actions
- rate limiting and pacing by agent, tenant, workspace, mission, tool, risk tier, confidence, and recent failures
- scorecards for accuracy, latency, tool correctness, policy compliance, hallucination risk, cost, reversibility, security posture, and human escalation rate
- causal trace graph from goal to plan, step, tool call, output, assessment, ledger record, and final decision

The first production wire point is Q route admission in `src/q/routing.ts`. Before dispatch, OpenJaws creates a `q.route.dispatch` goal, verifies role separation, checks signed route evidence, evaluates risk tier, records cognitive admission on the queue claim, and rejects the dispatch when the governor decision is not allowed. This is the closed loop we want: governed action, measured result, retained lesson, validated improvement, and policy-adjusted future behavior. It is not an uncontrolled self-modifying loop.

JAWS Desktop surfaces this same admission data through Agent Watch. The native `agent_runtime_snapshot` command reads the route queue claim, extracts `cognitiveAdmission`, and renders the memory layers, scorecard, policy hints, and causal trace in the desktop app. Do not replace that with static UI copy; the desktop trust surface must come from the route files or clearly say that no admission has been recorded yet.

## Prompt-Injection Boundaries

Prompt-injection boundaries apply to browser previews, MCP output, Discord handoffs, PDFs, downloaded assets, and benchmark artifacts. These sources can be summarized and cited, but they cannot request shell commands, credential movement, repository mutation, browser mutation, or worker routing unless the coordinator explicitly promotes the instruction after review.

Destructive or irreversible work still requires a separate preflight: resolved absolute target path, approved root, intent classification, and explicit user or coordinator authorization.

## Benchmarks And Public Proof

TerminalBench, BridgeBench, Q soak, and release proof lanes must stay machine-parseable. Reports should preserve raw logs plus parsed summaries, scrub local env bundles, record seed/provenance, and sign receipts when a signing key is configured. Public leaderboard claims must come from official-compatible runs, not private fixture packs.

## Do Not Add

Avoid optimizations that add unsafe surface:

- broad autonomous browser mutation
- durable cron defaults without operator approval
- broad plugin auto-install
- unsandboxed remote shell
- silent permission inheritance
- public copy that exposes local paths, raw receipts, branch names, commit SHAs, or token-shaped fixtures
