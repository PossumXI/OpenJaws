# Security Policy

OpenJaws is intended to be public, auditable, and contribution-friendly without leaking operator data, local runtime state, or credentials.

## Report a Vulnerability

Do not post exploit details or live secrets in a public issue.

Preferred path:

- open a private security advisory on GitHub once the public repo is live
- or contact the maintainer through https://possumx.dev

Include:

- affected version or commit
- impact
- reproduction steps
- whether the issue can leak secrets, run commands, or bypass permission checks

## Supported Branch

- latest tagged public release
- current public mainline
- current public `stable` / `latest` update lanes as defined by `release-policy.json`

## Hard Requirements

- no credentials, API keys, OAuth tokens, or local `.env` files in git
- no local runtime state, debug logs, or generated benchmark artifacts in git
- fail-closed behavior for remote execution and worker assignment
- fail-closed behavior for public update policy, staged rollout, and tagged release selection
- public workflows must keep least-privilege permissions

## Public Release and Update Issues

Include these details when reporting release/update problems:

- install path: tagged release, package manager, or source clone
- current `openjaws --version`
- whether `openjaws doctor` or `/status` reported runtime or PATH drift
- whether the issue affects release policy lookup, manifest verification, or asset download
- whether the failure can bypass rollout policy, install the wrong version, or trust an unofficial source

## Verification Before Release

```powershell
bun run verify:release
```

This should cover tests, build, native build, and the live system harness.

For public release/update changes, `bun run verify:public` must also stay green on hosted CI.
