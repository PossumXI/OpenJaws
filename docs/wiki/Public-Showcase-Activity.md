# Public Showcase Activity

OpenJaws now emits a sanitized public activity overlay to `C:\Users\Knight\.arobi-public\showcase-activity.json` by default. Env overrides may point elsewhere, but do not assume a repo-local `.arobi-public` directory.

The explicit sync command also mirrors the same sanitized feed into the repo at `docs/wiki/Public-Showcase-Activity.json` so Immaculate and other local agents can consume a documented snapshot without the live runtime constantly dirtying the working tree.

The tracked wiki JSON is a snapshot mirror and may intentionally lag the live home overlay. Do not restamp it unless source receipts changed or a manual sync was requested.

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

## Public Audit Loop Checklist

1. Read current state first with `bun run runtime:coherence`.
2. Confirm source receipts changed: Discord persona receipts, roundtable state, Immaculate traces, Apex governance mirror, or benchmark snapshots.
3. Run `syncPublicShowcaseActivityFromRoot` via `bun run showcase:activity:sync` to refresh the home overlay.
4. Treat `docs/wiki/Public-Showcase-Activity.json` as the optional tracked mirror for handoff/review.
5. Let the Asgard bridge publish only sanitized overlay entries when ledger posting is explicitly enabled.
6. Keep raw `00` traces, private ledger payloads, local paths, branch/worktree data, and operator-only receipts out of the public lane.
## Sync Command

Run the sync from the OpenJaws repo root:

```powershell
bun run showcase:activity:sync
```

That command writes:

- `.arobi-public/showcase-activity.json`
- `docs/wiki/Public-Showcase-Activity.json`

Both files carry the same sanitized contract using the latest bounded runtime receipts and trace summaries available on disk.

## Copy Hygiene Gate

As of 2026-04-25, the public showcase lane has an executable copy guard:

```powershell
bun run showcase:copy:check
```

The guard scans the public status file, public activity overlay, tracked OpenJaws mirror, and the Websites bundled showcase snapshot when present. It fails on stale/internal public copy such as old Discord channel references, bounded-action receipt wording, legacy lane labels, old TerminalBench error phrasing, raw delivery manifest paths, route/result receipt filenames, branch/commit metadata, job queue paths, train/eval files, run-state paths, and local path forms using either `C:\...` or `D:/...`.

Run the guard after `bun run showcase:activity:sync` and after the Asgard Websites `npm run showcase:sync` step. It is also wired into `verify:ci` and `verify:public`, so stale internal phrases should fail before a public bundle is promoted.

As of 2026-04-26, the activity writer and guard write JSON through temp-file plus rename writes. If `showcase-status.json` is corrupt or NUL-only, the guard repairs it with a safe fallback window that keeps the ASGARD Core 16 showcase count visible, marks results as not ready, and preserves the public/private boundary. The Websites bundler also keeps a safe fallback bundle when status state is missing but sanitized activity exists.

The Nysus mirror is intentionally bounded:

- the public entry uses `operator_actions` as the visible action lane
- governance signals remain available as tags, not as public action badges
- raw payloads, internal task payload keys, and private control-plane details stay out of the overlay

The shared overlay reader now aggregates persona receipts from `local-command-station/bots/*/discord-agent-receipt.json`, so Q, Viola, and Blackbeak can appear on the same bounded public-safe feed.

The same overlay also reads the mirrored Apex governance summary from `docs/wiki/Apex-Tenant-Governance.json`, so the public-safe `tenant_governance` entry stays aligned with `/apex` and `/status` without adding a second live tenant-analytics fetch path.

The bounded public spend lane now behaves the same way:

- if governed spend actions were published, the overlay emits an `Apex governed spend lane` entry with aggregate spend labels only
- if no governed spend actions were published in the current window, the overlay still emits a truthful zero-state `Apex governed spend lane` entry so the public lane does not disappear between bounded spend events
- raw order ids, payment payloads, wallet data, and any `00` settlement internals still stay out of the overlay

The benchmark lane now behaves the same way:

- the live overlay emits an `Immaculate benchmark board` entry from the latest public-safe Immaculate benchmark report
- the live overlay emits a `Q public benchmark board` entry from `website/lib/benchmarkSnapshot.generated.json`
- as of April 29, 2026, that Q entry reports the dry-run BridgeBench state, the public TerminalBench `circuit-fibsqrt` reward-0 receipt with `0` execution errors and `5` benchmark failures, and the local-receipt-only W&B state
- those entries are bounded summaries only; raw benchmark ledgers and per-trial payloads stay out of the public overlay
- the benchmark entries are also published into the public Arobi ledger through the Asgard bridge, not directly from Discord/OpenJaws
- the live Immaculate benchmark board currently reads from `C:\Users\Knight\Desktop\Immaculate\benchmarks\latest.json`, while the longer-lived public publication summary stays in `C:\Users\Knight\Desktop\Immaculate\docs\wiki\Benchmark-Status.md`

The live `scripts/discord-q-agent.ts` runtime now also queues background overlay refreshes automatically whenever a persona receipt changes, so the sanctioned public showcase lane keeps filling without a separate manual status-file splice. Those automatic refreshes update the public `.arobi-public` overlay and ledger sync lane, but they no longer rewrite the tracked repo mirror on every patrol cycle.

As of April 22, 2026, the remaining autonomous writer seam is closed in the canonical `D:\openjaws\OpenJaws` runtime:

- `src/utils/publicShowcaseActivity.ts` now builds the feed from the repo-rooted public-safe sources instead of depending on `process.cwd()`
- the autonomous Discord/roundtable writers now preserve the governance mirror context instead of regenerating `showcase-activity.json` back to runtime-only state
- if the live feed ever falls back to older lifecycle-style activity labels again, it usually means one of the long-lived Bun writers is still running the pre-patch code in memory and must be restarted

If the Nysus activity entry falls back to older lifecycle badges after a code update, the usual cause is a long-lived bun process that loaded the older overlay builder before the patch. Force-bounce the supervised writers from the canonical `D:\openjaws\OpenJaws` root:

```powershell
powershell -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\repair-q-agent.ps1
powershell -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\repair-viola.ps1
powershell -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\repair-blackbeak.ps1
powershell -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\start-discord-roundtable.ps1
bun run showcase:activity:sync
```

That restart path keeps the correct persona env, health checks, and roundtable child wiring while reloading the updated overlay builder.

The current public-safe feed on `aura-genesis.org` should include all of these bounded entries at once:

- `Apex governed spend lane`
- `Immaculate benchmark board`
- `Q public benchmark board`
- patrol, roundtable, and trace summaries

If one of those disappears while the others remain, the writer seam is the first place to inspect.

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
