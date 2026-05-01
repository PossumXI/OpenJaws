# Apex Workspace Bridge

OpenJaws can now surface a bounded local bridge into an external Apex workspace.

This is not a kernel embed and it is not a hidden shell backdoor. The current integration is intentionally surgical:

- `workspace_api` is the typed localhost bridge
- the Rust desktop apps stay out of process
- the OpenJaws side only launches allowlisted Apex targets
- `/apex` and `/status` surface the bridge directly

## What Ships Today

The current OpenJaws side exposes:

- `/apex` for a compact command-center view
- bridge health and summary in `/status`
- trusted Aegis Mail compose from inside `/apex`
- trusted Aegis Mail move / delete / flag actions from inside `/apex`
- trusted Shadow Chat send plus chat-session creation from inside `/apex`
- trusted Store install with structured install receipts from inside `/apex`
- dedicated `chrono-bridge` health, summary, and bounded backup actions from inside `/apex`
- browser bridge health plus native session summary inside `/apex`
- bounded operator handoff receipts from `/apex` Browser into accountable `/preview`
- bounded recent operator receipts from `/apex` mail/chat/store/chrono/browser actions, surfaced in `/status`, Overview, and the shared public-safe showcase feed
- `/status` now surfaces Apex browser bridge truth separately from the general browser preview receipt
- `/status` now fuses Apex system and security posture instead of only showing bridge reachability
- guarded launchers for:
  - `workspace_api`
  - `chrono-bridge`
  - `browser`
  - `aegis_mail`
  - `security_center`
  - `shadow_chat`
  - `system_monitor`
  - `vault`
  - `chrono`
  - source roots for `kernel`, `Notifications`, and `argus`

The important boundary is: OpenJaws does not attempt to embed the Rust Apex GUIs directly into the TUI process.

## Why Not Embed The Kernel

The current Apex kernel tree is a Rust workspace, not a stable embeddable library surface.

The clean seam today is `apps/workspace_api`, not an in-process microkernel import.

That means:

- browser, security center, mail, and monitor stay launcher-first
- summary/state flows come through the typed bridge
- the kernel source is opened as code, not injected into the OpenJaws runtime

## Security Boundary

The bridge now fails more safely than the first exploratory slice:

- Apex launches do **not** inherit the full OpenJaws environment anymore
- only a reduced allowlisted env reaches Apex processes
- the workspace bridge launcher now auto-discovers a local `libclang` runtime on Windows when the upstream Rust workspace needs it to compile
- OpenJaws trusts the Apex bridge only when:
  - it launched that bridge itself, or
  - the operator explicitly sets `OPENJAWS_APEX_TRUST_LOCALHOST=1`
- the launched bridge gets a per-run token
- mail compose is bounded with recipient and size caps before it leaves OpenJaws

This is still a local advanced-operator lane, not a public remote service surface.

Two source trees remain deliberately excluded from generic agent control:

- `Notifications`
- `argus`

They stay source-root-only until they each have their own narrow localhost bridge plus explicit confirmation and audit ladders.

## Runtime Ports

The live bridge ports are part of the bounded operator contract and should not be redefined ad hoc in other docs or scripts:

- `OPENJAWS_APEX_WORKSPACE_API_URL`
  - defaults to `http://127.0.0.1:8797`
  - typed Apex workspace + governance bridge used by `/apex`, `/status`, and the public-safe Apex governance mirror
- `OPENJAWS_APEX_CHRONO_API_URL`
  - defaults to `http://127.0.0.1:8798`
  - bounded backup/restore bridge for Chrono jobs
- `OPENJAWS_APEX_BROWSER_API_URL`
  - defaults to `http://127.0.0.1:8799`
  - native browser bridge for the Apex browser lane and accountable `/preview` handoff

Trust/config boundary:

- keep the bridges on loopback unless you are intentionally changing the operator boundary
- `OPENJAWS_APEX_TRUST_LOCALHOST=1` is the explicit override that tells OpenJaws to trust an already-running localhost bridge it did not launch itself
- the per-run `x-openjaws-apex-token` contract remains the default trust path for launched bridges

## Setup

OpenJaws discovers Apex roots from these env vars:

- `OPENJAWS_APEX_ROOT`
- `OPENJAWS_APEX_ASGARD_ROOT`
- `OPENJAWS_APEX_NOTIFICATIONS_ROOT`
- `OPENJAWS_APEX_ARGUS_ROOT`
- `OPENJAWS_APEX_WORKSPACE_API_URL`
- `OPENJAWS_APEX_CHRONO_API_URL`
- `OPENJAWS_APEX_BROWSER_API_URL`
- `OPENJAWS_APEX_TENANT_GOVERNANCE_API_URL`
- `OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE`
- `OPENJAWS_APEX_TRUST_LOCALHOST`

Typical local operator path:

1. set `OPENJAWS_APEX_ASGARD_ROOT` or `OPENJAWS_APEX_ROOT`
2. start OpenJaws
3. run `/apex`
4. launch `Workspace API`
5. optionally launch `Chrono Bridge`

For release checks and local repair, use:

```powershell
bun run apex:bridges
bun run apex:bridges:start
```

The first command only reports the three local bridge health states. The second
uses the existing guarded launchers for missing bridges and reports whether the
ports recovered.
If a port answers but was not launched by the current OpenJaws session, the
health report calls it out as an untrusted local listener instead of treating it
as a missing bridge. Stop that listener or set `OPENJAWS_APEX_TRUST_LOCALHOST=1`
only when you intentionally want to trust an already-running local bridge.
6. use `bun run runtime:coherence` to confirm the same three bridges are part of the full Immaculate/Q/operator readiness audit
7. use `/status` to confirm both bridges are visible

If you need deeper browser control, keep ownership with `/preview`.

`/apex` now shows the native Apex browser bridge and session truth, can record an accountable operator handoff into `/preview`, but it still does not try to become a second browser editor.

This lane assumes the external Apex checkout is present and that its `workspace_api` sidecar can build or already exists on the local machine. OpenJaws does not vendor the Apex Rust toolchain for you.

## Runtime Files

The live bridge runtime files live under `%TEMP%\openjaws-apex\`:

- `workspace-api.log`
- `workspace-api-state.json`
- `chrono-bridge.log`
- `chrono-bridge-state.json`
- `browser-bridge.log`
- `browser-bridge-state.json`

Those files are the source of truth for launcher ownership, health snapshots, and bounded operator status receipts. Do not invent a second path in ad hoc scripts.

## What Fits Well Next

The high-value follow-up is not “embed every Rust app.”

The cleaner next steps are:

- richer `/status` fusion for `system_monitor` and `security_center`
- a bounded `Settings` lane over the existing `workspace_api` endpoints:
  - `GET /api/v1/settings/summary`
  - `POST /api/v1/settings/update`
  - `POST /api/v1/settings/reset`
- more bounded mail/chat/store operator actions over `workspace_api`
- launcher-backed security/vault actions with better receipts while `vault` stays out of the typed TUI lane
- keep launcher-backed browser actions separate, and add stable bridge endpoints first whenever deeper OpenJaws browser control is needed

## Tenant Governance Parity

As of 2026-04-21, `/apex` now consumes the same tenant-governance summary lane that ApexOS and the Websites dashboard use.

Current contract:

- `src/utils/apexWorkspace.ts`
  - prefers `GET /api/v1/governance/summary` from `workspace_api` as the operator-local governance bridge
  - uses `GET /api/v1/tenant/analytics` through session-ingress auth only as a secondary enrichment fallback
  - falls back to the mirrored summary when session-ingress auth is temporarily unavailable
  - normalizes the result into `ApexTenantGovernanceSummary`
  - mirrors the normalized summary into the repo-root `docs/wiki/Apex-Tenant-Governance.json` path for other bounded local consumers unless an explicit mirror override is set
  - derives bounded governance recommendations from the same summary so `/apex` can jump operators into the right tab without widening the contract
- `src/commands/apex/apex.tsx`
  - renders the governed tenant lane in the Overview tab
  - shows governance pressure in the TUI banner instead of a binary ready/offline label
  - now renders `Recommended next steps` from the same bounded governance lane and wires them into Mail, Security, System, and Store tabs
  - now renders an `Operator actions` section from the same tenant-governance summary
  - keeps browser and Chrono bridge surfaces intact
- `src/components/Settings/Status.tsx`
  - now pulls the same tenant-governance summary into `/status`
- `src/utils/status.tsx`
  - now surfaces an `Apex governance` property block in the shared status panel when the tenant lane is available

Important boundary:

- the TUI should consume the shared tenant-governance summary, not re-invent a second analytics shape
- the public showcase overlay should read the mirrored sanitized governance summary, not issue a second live tenant-analytics fetch
- forward-looking producers should seed `analytics_dimensions.operator_actions`
- the TUI keeps `governedActionBreakdown` as a fallback only for older data already in the lane
- recent `/apex` operator actions now land in a separate bounded local receipt so public-safe activity can prove real mail/chat/store/chrono/browser work without leaking payload bodies or private browser history
