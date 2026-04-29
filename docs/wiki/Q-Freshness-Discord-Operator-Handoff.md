# Q Freshness Discord Operator Handoff - 2026-04-24

This pass mirrors Q freshness and public benchmark cleanup into the D: OpenJaws runtime and adds an append-only Discord operator action receipt.

## Changes

- Added `src/q/freshness.ts` and tests for Q runtime context injection.
- Discord Q runtime prompt lines now use the same Q freshness helper as the rest of OpenJaws.
- Direct OCI Q calls append Q's runtime date, timezone, and June 2024 base cutoff context.
- `scripts/discord-q-agent.ts` now writes operator action updates to `discord-operator-audit.ndjson` under the Discord agent runtime directory.
- The website benchmark snapshot generator and benchmark component now avoid local absolute paths and credential-missing copy.

## Verification

- `bun test ./scripts/generate-website-benchmark-snapshot.test.ts ./src/q/freshness.test.ts`
- `bun run website:snapshot:check`

## Notes

- The append-only Discord operator audit log is local runtime evidence. It does not publish private action detail to the public showcase by itself.
