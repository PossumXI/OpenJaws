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
- guarded launchers for:
  - `workspace_api`
  - `browser`
  - `aegis_mail`
  - `security_center`
  - `shadow_chat`
  - `system_monitor`
  - `vault`
  - `chrono`
  - source roots for `kernel`, `Notifications`, and `argus`
- Aegis Mail compose through the bridge

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
- OpenJaws trusts the Apex bridge only when:
  - it launched that bridge itself, or
  - the operator explicitly sets `OPENJAWS_APEX_TRUST_LOCALHOST=1`
- the launched bridge gets a per-run token
- mail compose is bounded with recipient and size caps before it leaves OpenJaws

This is still a local advanced-operator lane, not a public remote service surface.

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
5. use `/status` to confirm the bridge is visible

This lane assumes the external Apex checkout is present and that its `workspace_api` sidecar can build or already exists on the local machine. OpenJaws does not vendor the Apex Rust toolchain for you.

## What Fits Well Next

The high-value follow-up is not “embed every Rust app.”

The cleaner next steps are:

- richer `/status` fusion for `system_monitor` and `security_center`
- a tighter mail/chat operator lane over `workspace_api`
- launcher-backed browser/security/vault actions with better receipts
- TUI panels around the bridge summaries instead of pretending the external GUI is native Ink UI
