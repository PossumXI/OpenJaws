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

- current public mainline

## Hard Requirements

- no credentials, API keys, OAuth tokens, or local `.env` files in git
- no local runtime state, debug logs, or generated benchmark artifacts in git
- fail-closed behavior for remote execution and worker assignment
- public workflows must keep least-privilege permissions

## Verification Before Release

```powershell
bun run verify:release
```

This should cover tests, build, native build, and the live system harness.
