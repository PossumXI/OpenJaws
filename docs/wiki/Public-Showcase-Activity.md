# Public Showcase Activity

OpenJaws emits a sanitized public activity overlay to `.arobi-public/showcase-activity.json`.

Asgard merges that overlay into the existing `fabric.showcase.activityFeed` lane on the public status surface. It does not replace or modify the raw public ledger feed.

The same normalized operator-action contract now also feeds the OpenJaws TUI:

- `/status` renders the bounded Q operator line and the Apex governance summary from the same live inputs
- the public showcase overlay aggregates `Q`, `Viola`, `Blackbeak`, roundtable runtime, and trace summaries into one bounded feed
- the protected tenant-governance lane and the public showcase overlay should stay aligned on `operator_actions`

As of 2026-04-22, OpenJaws also mirrors the sanitized feed into `docs/wiki/Public-Showcase-Activity.json` so other repos and public surfaces can inspect the same bounded snapshot without reading local private receipts directly.

## Safe Content

- bounded Discord/Q operator activity
- bounded Discord persona patrol and operator receipts
- roundtable runtime state
- sanitized Immaculate actionability summaries
- sanitized Immaculate and Q trace summaries
- aggregate subsystem and artifact labels that are already public-safe

## Unsafe Content

- raw prompts or trace payloads
- private endpoints or filesystem paths
- branch/worktree metadata
- operator-only receipts
- raw ledger events or sealed-lane data

## Sync Command

Run the sync from the OpenJaws repo root:

```powershell
bun run showcase:activity:sync
```

That command writes `.arobi-public/showcase-activity.json` and the mirrored `docs/wiki/Public-Showcase-Activity.json` using the latest bounded runtime receipts and trace summaries available on disk.

The shared overlay reader aggregates persona receipts from `local-command-station/bots/*/discord-agent-receipt.json`, so Q, Viola, and Blackbeak can appear on the same bounded public-safe feed.

The live receipt/state writers now queue background overlay refreshes automatically whenever a Discord persona, Q, or the roundtable moves, so the sanctioned public showcase lane keeps filling without a separate manual status-file splice.
