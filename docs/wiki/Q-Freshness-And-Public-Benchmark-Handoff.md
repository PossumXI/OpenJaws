# Q Freshness And Public Benchmark Handoff - 2026-04-24

This pass makes Q runtime prompts date-aware and cleans the public benchmark copy before it reaches Qline/OpenJaws surfaces.

## Changes

- Added `src/q/freshness.ts` and tests for Q runtime context injection.
- Q model aliases now receive:
  - the current UTC runtime timestamp plus the local runtime clock and timezone;
  - Q's base knowledge cutoff of June 2024;
  - instructions to use live web/tool research for current facts.
- Q freshness now exposes `requestNeedsFreshContext(...)` so Discord and other Q lanes share one current/latest/live fact detector instead of carrying separate regexes.
- Direct OCI Q calls append the same freshness block so command-line, Discord, and bridge routes do not bypass date context.
- Discord Q search routing now uses the shared Q freshness detector for current-fact prompts.
- The website benchmark snapshot generator no longer publishes local absolute receipt paths or W&B credential-missing language.
- The checked-in website benchmark snapshot was regenerated from local receipts on April 24, 2026, and `bun run website:snapshot:check` now passes.
- The public benchmark component now uses simpler marketing copy focused on receipts, repeatable runs, and inspectable proof.
- The OpenJaws qline live guard now checks the canonical `qline.site` copy from `PossumXI/q-s-unfolding-story` (`Q // OpenJaws // Q_agents | qline.site`) plus the simple product claim `Q is the AI operator for OpenJaws`.

## Verification

- `bun test ./src/q/freshness.test.ts ./src/utils/discordQAgent.test.ts ./src/utils/discordOperatorExecution.test.ts ./src/utils/apexWorkspace.test.ts ./src/utils/browserPreview.test.ts ./scripts/discord-q-agent-personaplex.test.ts`
- `bun run build`
- `bun run website:snapshot:check`
- `bun run website:build`
- `bun run website:deploy:check`

## Notes

- Broad Bun discovery can still find copied test files under artifact/worktree snapshots. Use the root-targeted command above for this slice.
