# Contributing to OpenJaws

OpenJaws is a public MIT-licensed project. Contributions are welcome, but changes need to preserve the repo's operator focus, release hygiene, and fail-closed execution model.

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

## Security

If you find a vulnerability or secret exposure path, follow [SECURITY.md](SECURITY.md) instead of opening a public issue with exploit details.
