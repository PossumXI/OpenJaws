# Public Showcase Activity

OpenJaws now emits a sanitized public activity overlay to `.arobi-public/showcase-activity.json`.

The explicit sync command also mirrors the same sanitized feed into the repo at `docs/wiki/Public-Showcase-Activity.json` so Immaculate and other local agents can consume a documented snapshot without the live runtime constantly dirtying the working tree.

Asgard merges that overlay into the existing `fabric.showcase.activityFeed` lane on the public status surface. It does not replace or modify the raw public ledger feed.

The same normalized operator-action contract now also feeds the OpenJaws TUI:

- `/apex` renders the top governed operator actions from the tenant-governance lane
- `/status` renders the same lane as an `Apex governance` property block
- the public showcase overlay and the protected tenant-governance lane should stay aligned on `operator_actions`
- bounded Nysus coordinator activity is mirrored from `.arobi-public/nysus-agent-events.json` and folded into the same public-safe feed instead of creating a second live fetch path

As of 2026-04-21, Asgard can also publish selected bounded entries from this overlay into the public Arobi audit lane through:

- `C:\Users\Knight\Desktop\cheeks\Asgard\scripts\sync-public-showcase-ledger.mjs`

## Safe Content

- bounded Discord/Q operator activity
- roundtable runtime state
- sanitized Immaculate and Q trace summaries
- aggregate subsystem and artifact labels that are already public-safe

## Unsafe Content

- raw prompts or trace payloads
- private endpoints or filesystem paths
- branch/worktree metadata
- operator-only receipts
- raw ledger events or sealed-lane data
- raw Discord channel, user, role, `@here`, or `@everyone` mentions

## Sync Command

Run the sync from the OpenJaws repo root:

```powershell
bun run showcase:activity:sync
```

That command writes:

- `.arobi-public/showcase-activity.json`
- `docs/wiki/Public-Showcase-Activity.json`

Both files carry the same sanitized contract using the latest bounded runtime receipts and trace summaries available on disk.

The Nysus mirror is intentionally bounded:

- the public entry uses `operator_actions` as the visible action lane
- governance signals remain available as tags, not as public action badges
- raw payloads, internal task payload keys, and private control-plane details stay out of the overlay

The shared overlay reader now aggregates persona receipts from `local-command-station/bots/*/discord-agent-receipt.json`, so Q, Viola, and Blackbeak can appear on the same bounded public-safe feed.

The same overlay also reads the mirrored Apex governance summary from `docs/wiki/Apex-Tenant-Governance.json`, so the public-safe `tenant_governance` entry stays aligned with `/apex` and `/status` without adding a second live tenant-analytics fetch path.

The live `scripts/discord-q-agent.ts` runtime now also queues background overlay refreshes automatically whenever a persona receipt changes, so the sanctioned public showcase lane keeps filling without a separate manual status-file splice. Those automatic refreshes update the public `.arobi-public` overlay and ledger sync lane, but they no longer rewrite the tracked repo mirror on every patrol cycle.

If the Nysus activity entry falls back to older lifecycle badges after a code update, the usual cause is a long-lived bun process that loaded the older overlay builder before the patch. Force-bounce the supervised writers from the canonical `D:\openjaws\OpenJaws` root:

```powershell
powershell -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\repair-q-agent.ps1
powershell -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\repair-viola.ps1
powershell -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\repair-blackbeak.ps1
powershell -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\start-discord-roundtable.ps1
bun run showcase:activity:sync
```

That restart path keeps the correct persona env, health checks, and roundtable child wiring while reloading the updated overlay builder.

To publish new bounded entries into the public Arobi ledger after the overlay is refreshed:

```powershell
node C:\Users\Knight\Desktop\cheeks\Asgard\scripts\sync-public-showcase-ledger.mjs --json
```

Auto publication is now available too, but only through the hardened Asgard bridge in `--auto` mode:

- set `ASGARD_PUBLIC_SHOWCASE_LEDGER_SYNC_ENABLED=1`
- let OpenJaws refresh the overlay normally
- the Asgard bridge enforces single-flight locking, cooldown, and per-entry checkpoint writes before it posts anything
- direct per-turn posting from Discord/OpenJaws into the public ledger is still not allowed

That publication step stays bounded:

- only sanitized overlay entries are published
- dedupe is enforced via `.arobi-public/showcase-ledger-state.json`
- `--auto` runs are also gated by the Asgard lockfile and cooldown state before any network write happens
- raw `00` traces, local paths, branch/worktree data, and operator-only receipts still do not cross into the public lane
- the ledger sync remains a governed bridge, not an unbounded side effect of every TUI refresh
