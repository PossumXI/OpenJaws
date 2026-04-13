# Contributing to OpenJaws

OpenJaws is a public MIT-licensed project. Contributions are welcome, but changes need to preserve the repo's operator focus, release hygiene, and fail-closed execution model.

Maintainer and project home: [PossumX.dev](https://possumx.dev)

## Local Setup

```powershell
bun install
bun test
bun run build
bun run build:native
```

Recommended full verification before opening a PR:

```powershell
bun run verify:release
```

Hosted-runner baseline used by GitHub Actions:

```powershell
bun run verify:public
```

## Contribution Rules

- Do not commit secrets, tokens, env files, runtime logs, or generated artifacts.
- Keep user-facing copy branded as OpenJaws and OpenCheeks, not inherited product names.
- Prefer fail-closed behavior over silent fallbacks.
- Add or update tests when you change queueing, orchestration, permissions, routing, or status surfaces.
- If you touch worker/routing logic, run the full harness checks, not just unit tests.

## High-Value Areas

- TUI clarity and reviewability
- OpenCheek agent orchestration
- Immaculate integration and route assignment
- Tool calling correctness and retry shaping
- Gemma dataset/training flows
- Security hardening and public-release hygiene
- Documentation and wiki accuracy

## Pull Request Checklist

- `bun test` passes
- `bun run build` passes
- `bun run build:native` passes
- `bun run system:check` passes
- docs updated if user-visible behavior changed
- no secrets or local artifacts added

## Community Workflow

- File bugs and feature requests through GitHub Issues.
- Keep pull requests focused; smaller changes are easier to verify and review.
- Link relevant docs/wiki updates when a change affects commands, routing, orchestration, or operator surfaces.
- Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for project conduct expectations.

## Security

If you find a vulnerability or secret exposure path, follow [SECURITY.md](SECURITY.md) instead of opening a public issue with exploit details.
