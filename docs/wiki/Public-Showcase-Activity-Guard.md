# Public Showcase Activity Guard

Updated: 2026-04-25

## Purpose

The public showcase activity feed is written by live Discord/OpenJaws agent
processes and consumed by the Websites status page. Some already-running agent
processes can still hold older formatter code in memory until they are
restarted. The guard keeps the public feed clean without stopping those agents.

## Files

- Source feed: `C:\Users\Knight\.arobi-public\showcase-activity.json`
- Source status snapshot: `C:\Users\Knight\.arobi-public\showcase-status.json`
- OpenJaws mirror: `D:\openjaws\OpenJaws\docs\wiki\Public-Showcase-Activity.json`
- Guard script: `D:\openjaws\OpenJaws\scripts\watch-public-showcase-activity.ts`
- Guard launcher: `D:\openjaws\OpenJaws\local-command-station\start-public-showcase-activity-guard.ps1`
- Guard heartbeat: `D:\openjaws\OpenJaws\local-command-station\public-showcase-activity-guard.json`
- Public-safe guard heartbeat: `C:\Users\Knight\.arobi-public\showcase-guard.json`
- Guard log: `D:\openjaws\OpenJaws\local-command-station\logs\public-showcase-activity-guard.out.log`
- Guard error log: `D:\openjaws\OpenJaws\local-command-station\logs\public-showcase-activity-guard.err.log`

## Commands

Run once:

```powershell
bun scripts/watch-public-showcase-activity.ts --once --json
```

Run continuously:

```powershell
bun run showcase:activity:guard
```

Run or adopt as a hidden local helper without creating duplicates:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\start-public-showcase-activity-guard.ps1
```

Current live helper was started hidden with:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File D:\openjaws\OpenJaws\local-command-station\start-public-showcase-activity-guard.ps1 -Force
```

## Behavior

The guard watches and polls the source feed, sanitizes it through
`sanitizePublicShowcaseActivityFeed`, and mirrors the sanitized result. It also
repairs the embedded `activityFeed` inside the status snapshot so the Websites
sync step does not inherit stale entries. It normalizes stale public wording such
as benchmark warning copy, `roundtable-error` IDs, `0 failed assertions`, raw
chain-of-thought wording, and warning/failed public statuses into public-safe
review or info language.

Every pass writes a heartbeat receipt with the guard PID, status, protected
paths, entry count, update time, and last repair time. The receipt is intentionally
local-only and exists so future operators do not duplicate the helper or mistake
it for an undocumented background process.

Every pass also writes a separate public-safe heartbeat under `.arobi-public`.
That file contains only the guard status, entry count, mirror sync flag, source
label, update time, and last repair time. It does not include local paths, PIDs,
Discord channel names, or private ledger details, so Websites can surface it as
a simple public status freshness signal.

The guard does not restart, kill, or mutate live Discord agents. It only repairs
the public-facing JSON file after an older live process writes stale copy.

As of 2026-04-25, the companion copy check also blocks raw delivery and job
metadata from public surfaces. Public copy must not include delivery manifest
paths, receipt filenames such as `route-request.json` or `result.json`,
branch/commit fields, queue/spec/train/eval/run-state paths, local Windows or
Unix paths, Discord private channel labels, or private route names.

## Verification

```powershell
bun test publicShowcaseActivity.test.ts
bun test scripts\check-public-showcase-copy.test.ts
```

The regression case is `repairs stale live public showcase files without
restarting agents`. The heartbeat case is `writes a guard heartbeat receipt for
the next operator`.
