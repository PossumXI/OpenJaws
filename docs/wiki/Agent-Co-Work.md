# Agent Co-Work

`Agent Co-Work` is the shared-workbench layer for OpenJaws crews.

It gives each active teammate terminal a unique `terminal_context_id`, keeps one shared registry for same-owner terminals on the same machine, and now keeps an explicit phase ledger so agents can continue the right work thread on purpose instead of guessing from the latest similar receipt.

## Explicit Phase Selection

Use an explicit phase when you want a teammate to continue an existing project thread:

```text
@scout [phase:phase-abc12345] continue the OCI bridge audit
```

Tool-driven teammate messages can do the same thing through `phase_id`:

```json
{
  "to": "scout",
  "phase_id": "phase-abc12345",
  "summary": "continue bridge phase",
  "message": "pick up the OCI route work from that same phase"
}
```

When `phase_id` is supplied, OpenJaws now fails closed if that exact phase does not exist. It does not silently fall back to the latest matching receipt.

## Cross-Terminal Phase Reuse

Phase receipts can now span multiple teammate terminals deliberately:

- one agent can open the phase
- a second agent can reuse that same phase from another project root
- the shared ledger records the new terminal context, request, handoff, and deliverable under the same phase

That keeps the request thread, project roots, and delivered output attached to the same work phase even when the work moves between terminals.

## Q Training Lineage

The Q training and benchmark lanes now support a separate `lineage_id` plus an optional `phase_id`.

Use that when you want local training, Immaculate-routed training, and follow-up BridgeBench receipts to stay tied to the same project thread:

```powershell
bun scripts/run-q-hybrid-session.ts `
  --bundle-dir data/sft/audited `
  --tag agentic `
  --allow-host-risk `
  --lineage-id bridge-pass-01 `
  --phase-id phase-abc12345
```

```powershell
bun scripts/run-q-curriculum.ts `
  --bundle-dir data/sft/audited `
  --profile agentic `
  --benchmark-pack all `
  --lineage-id bridge-pass-01 `
  --phase-id phase-abc12345
```

Those IDs are now preserved in:

- `run-state.json`
- `run-summary.json`
- `metrics-summary.json`
- `hybrid-session-report.json`
- routed `route-request.json`
- BridgeBench reports and Rewardkit-style receipts

## Boundary

- This is same-owner, same-machine coordination.
- The terminal registry is for workspace, runtime, orchestration, and receipt facts.
- It is not a secret dump and should not be used to store credentials.
