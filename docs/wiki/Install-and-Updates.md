# Install and Updates

This page is the public operator path for installing OpenJaws, updating it safely, and verifying that the running build is wired the way you expect.

## Release Model

OpenJaws currently ships as a public source repository with native local builds and fast-moving development on `main`.

Practical guidance:

- if you want the newest work, build from the official repository
- if you want a slower-moving install surface, prefer tagged releases when available
- tagged native releases are the public update feed for installed users
- installed public updates advance through [`release-policy.json`](../../release-policy.json), not directly from every `main` push
- do not use reposted binaries, unknown mirrors, or copy-pasted installer scripts from third parties

## Tagged Release Install

Use the tagged-release lane when you install a published OpenJaws binary from GitHub Releases.

Basic checks:

```powershell
openjaws --version
openjaws update
```

To stay on the public stable lane explicitly:

```powershell
openjaws install stable
```

Public native updates are GitHub Release-backed, tag-gated, and policy-gated. A shipped install only moves when:

1. a tagged GitHub Release exists for the target version
2. [`release-policy.json`](../../release-policy.json) advances that channel to the target version
3. the published signed manifest and platform asset checks pass

## Build From Source

```powershell
bun install
bun run build:native
```

Windows launcher:

```powershell
.\openjaws.bat
```

macOS/Linux launcher from the cloned repo:

```bash
./openjaws.sh
```

## Trust Boundary

Official public update inputs are:

- this repository
- tagged GitHub Releases from this repository
- [`release-policy.json`](../../release-policy.json)
- the per-platform signed release manifest with SHA-256 checksum data

OpenJaws does not treat arbitrary `main` pushes, mirrors, or copied installer snippets as an official update source.

## First-Run Checklist

After the first launch:

1. Use the built-in first-run setup lane to choose provider/model and wire your key or auth path.
2. Fresh public installs default to `OCI:Q`; if you are keeping that path, store your key with `/provider key oci <api-key>` or set `Q_API_KEY`, `OCI_API_KEY`, or `OCI_GENAI_API_KEY`.
3. Let the first-run lane complete its live provider check, or run `/provider test oci Q`.
4. Run `/login` if your selected provider still requires account auth.
5. Run `/provider` if you want to change the provider/model chosen during first-run setup.
6. Run `/status` and verify:
   - active provider and model
   - latest provider reachability receipt
   - runtime mode
   - sandbox state
   - routed work or worker state, if present
7. Run `/immaculate status` if you want to inspect orchestration pressure and worker health before heavier work.

## Provider Switching

OpenJaws supports switching providers and models from the terminal, but the safe path is explicit:

1. Run `/provider`.
2. Select the provider and model.
3. Run `/provider test <provider> <model>`.
4. If you are changing execution location, also run `/remote-env` when needed.
5. Run `/status` and confirm the active wiring before continuing.

Common OCI/Q controls:

- `/provider use oci Q`
- `/provider key oci <api-key>`
- `/provider test oci Q`
- `/provider base-url oci <url>`

See [Q and OCI Setup](Q-and-OCI-Setup.md) for the canonical shipped-runtime setup flow.

Do not assume the visible model name alone tells the whole story. Check the runtime and route state as well.

## Safe Updates For Installed Users

If you are following active development from source:

```powershell
git pull --ff-only
bun install
bun run build:native
```

Use `.\openjaws.bat --version` on Windows or `./openjaws.sh --version` on macOS/Linux from the cloned repo.

Then restart OpenJaws and verify the live session with `/status`.

Recommended update discipline:

- close running OpenJaws sessions before replacing binaries
- update from the official repository only
- review release notes or recent commits before pulling fast-moving `main`
- rebuild locally instead of swapping in untrusted binaries
- verify the running version and provider/runtime state after restart
- current tagged native release assets are published for `win32-x64`, `linux-x64`, and `darwin-x64`; other platforms should build from source

If you are on a tagged native release, use the shipped updater instead of manually swapping binaries:

```powershell
openjaws update
```

To stay on the public stable lane explicitly:

```powershell
openjaws install stable
```

OpenJaws now defaults the public auto-update lane to `stable`. Public native updates are GitHub Release-backed, tag-gated, and checked against [`release-policy.json`](../../release-policy.json) so installed users do not silently jump to arbitrary `main` builds.

## Staged Rollout Behavior

The public release policy can hold a tagged version behind a staged rollout percentage. OpenJaws uses the local install ID already stored in global config to bucket the install deterministically.

What that means:

- if this install is inside the rollout bucket, the updater sees the tagged target version
- if this install is outside the rollout bucket, OpenJaws stays on the current installed release
- if the policy or published assets are unhealthy, public updates fail closed instead of guessing

Manual override still exists if you intentionally need a specific published tag:

```powershell
openjaws install <version>
```

## Verification Lanes

Use the public-safe verification path when you want a release-oriented check:

```powershell
bun run verify:public
```

Use the fuller release pass when preparing a local ship candidate:

```powershell
bun run verify:release
```

## Security Notes

- keep secrets in your local config or secure storage, not in the repository
- review workflow or plugin changes before enabling them on a real system
- use `/status` after switching provider, runtime, or remote execution mode
- treat Immaculate, route workers, and remote execution as visible operator systems, not invisible background magic

## If Update Fails

Shortest recovery path:

```powershell
openjaws --version
openjaws doctor
```

Then relaunch and verify:

- `/status` for provider, runtime, sandbox, route queue, and worker state
- `/immaculate status` for orchestration and worker health

If the updater says you are current but the live runtime still looks wrong:

1. close all running OpenJaws sessions
2. relaunch the official installed binary and re-check `openjaws --version`
3. if you are on a source clone, rebuild with `bun install && bun run build:native`
4. if you are on a tagged release, reinstall from the official tagged release or run `openjaws install stable`
5. if both a source clone and an installed binary exist, use `openjaws doctor` to confirm which one is actually running

## Why Immaculate Matters Here

Immaculate improves the install and update experience by making OpenJaws more explicit about what is actually active:

- route and worker state are visible instead of hidden behind silent fallbacks
- provider and execution changes can be confirmed through `/status`
- routed `Q` execution surfaces assignment, dispatch, and completion state
- worker health and orchestration pressure are visible to installed users, not just internal developers
