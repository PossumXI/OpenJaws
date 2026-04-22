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

## Setup

OpenJaws discovers Apex roots from these env vars:

- `OPENJAWS_APEX_ROOT`
- `OPENJAWS_APEX_ASGARD_ROOT`
- `OPENJAWS_APEX_NOTIFICATIONS_ROOT`
- `OPENJAWS_APEX_ARGUS_ROOT`
- `OPENJAWS_APEX_WORKSPACE_API_URL`

Typical local operator path:

1. set `OPENJAWS_APEX_ASGARD_ROOT` or `OPENJAWS_APEX_ROOT`
2. start OpenJaws
3. run `/apex`
4. launch `Workspace API`
5. optionally launch `Chrono Bridge`
6. use `/status` to confirm both bridges are visible

If you need deeper browser control, keep ownership with `/preview`.

`/apex` now shows the native Apex browser bridge and session truth, can record an accountable operator handoff into `/preview`, but it still does not try to become a second browser editor.

This lane assumes the external Apex checkout is present and that its `workspace_api` sidecar can build or already exists on the local machine. OpenJaws does not vendor the Apex Rust toolchain for you.

## What Fits Well Next

The high-value follow-up is not “embed every Rust app.”

The cleaner next steps are:

- richer `/status` fusion for `system_monitor` and `security_center`
- more bounded mail/chat/store operator actions over `workspace_api`
- launcher-backed security/vault actions with better receipts
- keep launcher-backed browser actions separate, and add stable bridge endpoints first whenever deeper OpenJaws browser control is needed
