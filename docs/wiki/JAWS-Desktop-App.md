# JAWS Desktop App

JAWS is the native desktop wrapper for OpenJaws. The first desktop lane keeps the existing terminal backend intact and bundles it as a Tauri sidecar so the app can add native release/update behavior, a clean workspace shell, live agent visibility, enrollment, marketplace, studio, arcade, and co-work surfaces without destabilizing the TUI.

Brand line:

> Jaws IDE, the future wrapped with OpenJaws and comes default with Q and Immaculate.

## Current Surface

- Collapsible side menu for focused workspace viewing.
- Control dashboard for OpenJaws, Q, Q_agents, OpenCheek, Immaculate, Arobi, and security lanes.
- Agent Watch timeline for live orchestration events.
- Image Studio and Video Studio panels for provider-gated creative work.
- Arcade Bar with a tiny idle-safe retro runner.
- Arobi ledger and enrollment links.
- Shared workspace pairing lane for future exchange-code collaboration.
- Marketplace cards for skills, tools, workflows, games, and third-party integrations.
- Billing copy for a 14-day trial and flat `$12.99/mo` IDE subscription, with Q credits separate.
- Layout themes: default, spy, sci-fi, halloween, hacking, and coding.

## Release Boundary

The desktop app lives in `apps/jaws-desktop`. Its Tauri bundle includes `dist/openjaws` or `dist/openjaws.exe` as `src-tauri/binaries/openjaws-$TARGET_TRIPLE`.

Build prep:

```powershell
bun run build:native
bun run --cwd apps/jaws-desktop prepare:sidecar
```

Local UI verification:

```powershell
bun run jaws:ui:build
```

Full desktop verification:

```powershell
bun run jaws:verify
```

Desktop bundle:

```powershell
bun run jaws:build
```

## Update Pipeline

Tauri updater artifacts are signed. The public key belongs in `apps/jaws-desktop/src-tauri/tauri.conf.json`; the private key must only live in CI secrets.

Required GitHub secrets:

- `JAWS_TAURI_SIGNING_PRIVATE_KEY`
- `JAWS_TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only when the signing key was generated with a password

The release workflow is `.github/workflows/jaws-desktop.yml`. It builds OpenJaws, prepares the sidecar, builds the Tauri bundle, and uploads signed installer/update artifacts. Public download pages on `qline.site` and `iorch.net` should publish only artifacts from that workflow.

The updater public key is committed in `tauri.conf.json`, and the matching private key is stored in the repository secret `JAWS_TAURI_SIGNING_PRIVATE_KEY`. The private signing key must stay in CI secrets only. `bun run jaws:release:check` fails closed until the public key, HTTPS update endpoints, native icon, updater artifacts, and sidecar bundle config are all present.

The publish job also generates `latest.json` from the signed Tauri artifacts. That manifest is the update contract for the public download surfaces:

```powershell
bun run jaws:manifest:test
node apps/jaws-desktop/scripts/build-updater-manifest.mjs --bundle-root <bundle-dir> --base-url https://github.com/PossumXI/OpenJaws/releases/download/<tag> --out latest.json --version <semver>
```

The manifest is served through the dynamic updater endpoint implemented in the website app. It can pin `JAWS_UPDATER_MANIFEST_URL`, pin `JAWS_UPDATER_RELEASE_TAG`, or discover the latest public `jaws-v*` GitHub release in `JAWS_UPDATER_GITHUB_REPO`.

The endpoint returns `204 No Content` when the requesting install is current or no signed platform artifact exists. It returns the Tauri v2 dynamic payload only when the published `latest.json` contains a newer version, an HTTPS artifact URL, and a signature for the requested `{target}-{arch}`.

- `https://qline.site/api/jaws/{{target}}/{{arch}}/{{current_version}}`
- `https://iorch.net/api/jaws/{{target}}/{{arch}}/{{current_version}}`

Windows bundle smoke, run locally on 2026-04-29:

- `JAWS_0.1.0_x64_en-US.msi`
- `JAWS_0.1.0_x64_en-US.msi.sig`
- `JAWS_0.1.0_x64-setup.exe`
- `JAWS_0.1.0_x64-setup.exe.sig`

Implementation references:

- Tauri updater plugin: `https://v2.tauri.app/plugin/updater/`
- Tauri sidecar binaries: `https://v2.tauri.app/develop/sidecar/`
- Tauri GitHub release pipelines: `https://v2.tauri.app/distribute/pipelines/github/`

## Next Production Tasks

1. Deploy the new `/api/jaws/{target}/{arch}/{current_version}` endpoint on both `qline.site` and `iorch.net`.
2. Publish a signed `jaws-v*` GitHub release and promote it from draft only after installer smoke testing.
3. Replace the desktop timeline fixture with live event streaming from the OpenJaws route/runtime log bus.
4. Connect Arobi enrollment to the real account and ledger APIs.
5. Implement exchange-code collaboration with signed workspace invites, revocation, and explicit pooled-credit consent.
6. Add marketplace package signing, review states, sandbox scopes, and rollback metadata.
7. Publish first installer links after signed bundle verification passes in GitHub Actions.
