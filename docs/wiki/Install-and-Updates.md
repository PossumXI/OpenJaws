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
- official JAWS desktop mirror pages on `https://qline.site/downloads/jaws` and `https://iorch.net/downloads/jaws`, which redirect back to signed GitHub release assets

OpenJaws does not treat arbitrary `main` pushes, mirrors, or copied installer snippets as an official update source.

## JAWS Desktop Mirrors

JAWS Desktop 0.1.9 is the next mirrored public desktop release for users who want a native installer instead of a source checkout:

- qline.site: `https://qline.site/downloads/jaws`
- iorch.net: `https://iorch.net/downloads/jaws`
- GitHub release: `https://github.com/PossumXI/OpenJaws/releases/tag/jaws-v0.1.9`

The mirror download routes are Netlify redirects to the GitHub release assets:

- `/downloads/jaws/windows`
- `/downloads/jaws/windows-msi`
- `/downloads/jaws/macos`
- `/downloads/jaws/linux-deb`
- `/downloads/jaws/linux-rpm`
- `/downloads/jaws/latest.json`

Both mirrors keep those redirects in repo-owned files checked by `scripts/jaws-release-public-surface.test.ts`, so a release version bump must update the public download routes before the mirror health check can pass.

Use the mirror pages for the branded public install flow. Use the GitHub release page when you want to inspect every artifact and signature directly.

The live updater endpoints are:

- `https://qline.site/api/jaws/{{target}}/{{arch}}/{{current_version}}`
- `https://iorch.net/api/jaws/{{target}}/{{arch}}/{{current_version}}`

For a Windows x64 tester on `0.1.8`, both endpoints return a signed `0.1.9` update payload after the tag workflow publishes the assets. For an already-current `0.1.9` install, both endpoints return `204 No Content`.

The 0.1.8 tag lane remains the published browser-work lane. The 0.1.9 workflow keeps the signed app updater artifact path and creates the public DMG with a direct `hdiutil` package step to reduce release risk in the macOS packaging stage.

Installer publisher:

> Built by AROBI TECHNOLOGY ALLIANCE A OPAL MAR GROUP CORPORATION NJ USA.

The expected tag, mirror URLs, asset filenames, and updater platform entries now come from the generated desktop release index at [`apps/jaws-desktop/src/release-index.json`](../../apps/jaws-desktop/src/release-index.json). Regenerate and check it before cutting a new JAWS desktop tag:

```powershell
bun run --cwd apps/jaws-desktop release:index
bun run --cwd apps/jaws-desktop release:index -- --check
```

Release operators should verify the mirrors before announcing or re-announcing a desktop release:

```powershell
bun run jaws:mirror:check --json --out .tmp-jaws-release-mirror-health.json
```

The check fails closed when a public route points at the wrong asset, when a required GitHub release asset or signature is missing, or when the updater manifest loses a required signed platform entry.

## First-Run Checklist

After the first launch:

1. Use the built-in first-run setup lane to choose provider/model and wire your key or auth path.
2. Fresh public installs default to `Q` in the picker, which maps to `oci:Q` under the hood.
3. If you are keeping that path, store your key with `/provider key oci <api-key>` or set `Q_API_KEY`, `OCI_API_KEY`, or `OCI_GENAI_API_KEY`.
4. If you need the key first, run `/provider connect oci` to open the browser setup page.
5. Let the first-run lane complete its live provider check, or run `/provider test oci Q`.
6. Run `/login` only when you want the managed Anthropic/OpenJaws browser-login lane.
7. Run `/provider` if you want to change the provider/model chosen during first-run setup.
8. Run `/status` and verify:
   - active provider and model
   - latest provider reachability receipt
   - runtime mode
   - sandbox state
   - routed work or worker state, if present
9. Run `/immaculate status` if you want to inspect orchestration pressure and worker health before heavier work.

If you later issue hosted `Q` keys through the website lane, the OpenJaws-side
step is still explicit:

- generate the key through the hosted `Q` service at `https://qline.site`
- store it locally with `/provider key oci <generated-q-key>`
- or open the browser setup lane directly with `/provider connect oci`
- run `/provider test oci Q`
- verify the active runtime and provider receipt with `/status`

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
See [Q Access and Limits](Q-Access-and-Limits.md) for the public key, credits, and rate-limit boundary.

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

For the 0.1.9 lane, `verify:release` includes `bun run jaws:release:ready`.
That gate is intentionally stricter than normal route health: it blocks updater
promotion when the `jaws-v0.1.9` GitHub release is not published, when
production hosted-Q/D1/Stripe price/service-token configuration is incomplete,
when a fresh release-audit Q trace is missing, or when local Apex listeners are
present without explicit `OPENJAWS_APEX_TRUST_LOCALHOST=1` operator trust.

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
