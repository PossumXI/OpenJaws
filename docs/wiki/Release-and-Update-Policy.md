# Release and Update Policy

This page defines the public trust boundary for shipped OpenJaws installs.

## Official Sources

Official public release inputs are:

- this repository
- tagged GitHub Releases from this repository
- [`release-policy.json`](../../release-policy.json)
- the published per-platform signed manifest asset with SHA-256 checksum data

Everything else is outside the supported public trust boundary.

## What Moves Installed Users

Installed public binaries do not move on every push to `main`.

A shipped install advances only when:

1. a tagged GitHub Release exists for the target version
2. the tag publishes the expected platform binary and manifest assets
3. [`release-policy.json`](../../release-policy.json) advances the chosen channel to that version
4. the updater verifies the published manifest signature and binary checksum path for the current platform

This keeps public installs on an explicit release lane instead of treating the source tree as a live update feed.

## Channels

- `stable`: public default lane for installed users
- `latest`: faster-moving public lane for tagged releases and prerelease validation

Source clones that track `main` are not a release channel. They are development installs.

## Staged Rollout

`release-policy.json` can stage a tagged version gradually.

OpenJaws uses the local install ID already stored in global config to bucket each install deterministically. That means:

- the same install stays in the same rollout bucket across restarts
- rollout decisions are deterministic without requiring a user account
- installs outside the active percentage stay on their current tagged release

If the release policy is missing or invalid, OpenJaws keeps public updates fail-closed.

## Recovery

If update behavior looks wrong:

```powershell
openjaws --version
openjaws doctor
```

Then relaunch and verify:

- `/status`
- `/immaculate status`

If necessary:

- source clone: `bun install && bun run build:native`
- tagged install: `openjaws install stable` or reinstall from the official tagged GitHub Release

## Maintainer Rules

When release/update semantics change:

- update this page
- update [Install and Updates](Install-and-Updates.md)
- update [README.md](../../README.md)
- keep `release-policy.json` valid
- keep public verification green before merge or tag publication
