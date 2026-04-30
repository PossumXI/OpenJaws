# JAWS Desktop App

JAWS is the native desktop wrapper for OpenJaws. The first desktop lane keeps the existing terminal backend intact and bundles it as a Tauri sidecar so the app can add native release/update behavior, a clean workspace shell, live agent visibility, enrollment, marketplace, studio, arcade, and co-work surfaces without destabilizing the TUI.

Brand line:

> Jaws IDE, the future wrapped with OpenJaws and comes default with Q and Immaculate.

## Current Surface

- Collapsible side menu for focused workspace viewing.
- Control dashboard for OpenJaws, Q, Q_agents, OpenCheek, Immaculate, Arobi, and security lanes.
- Chat window for command entry, live agent/work transcript, per-message shark-jaw activity markers, Q thinking animation, command starter tools, a real Tauri-to-OpenJaws sidecar command bridge, review-first or fast audited queue mode, notification state, and optional change comparison.
- Terminal workspace tab that can open a native folder picker, validates the selected project folder, stores the workspace locally, shows the exact OpenJaws TUI launch command, and can run the bundled OpenJaws sidecar from that folder.
- Agent Watch timeline for live orchestration events.
- Image Studio and Video Studio panels for provider-gated creative work.
- Arcade Bar with `Slow Guy`, a scored runner with lane controls, jump/duck/dash mechanics, stamina, code-token collection, objective state, best-score persistence, and Cyber Frog rewards.
- Texas Hold'em Dealer Roundtable foundation with deterministic local dealing, table chat, Q/OpenCheek seats, showdown evaluation, secure scope chips, and multiplayer room metadata ready for a signed websocket transport.
- 3D Sandbox foundation tab for user, pet, Q, agent forge, and PvP-table presence, with capability-manifest and workspace-scope review gates for future community agent release.
- Animated Cyber Frog companion with code-token rewards, feeding, training, gear, decorations, egg progress, naming, and profile persistence.
- User profile and agent profile surfaces for workspace identity, agent lane status, and pet/code-token state.
- Arobi ledger and enrollment links.
- Shared workspace pairing lane for future exchange-code collaboration.
- Marketplace cards for skills, tools, workflows, games, and third-party integrations.
- Billing copy for a 14-day trial and flat `$12.99/mo` IDE subscription, with Q credits separate.
- Docs page with in-app Terms, final-sale billing policy qualified by applicable law, security/privacy notes, community content rules, AI output notice, developer verification commands, and release links.
- Settings page with release status, signed update checks, install action, native mirror/update-pipeline diagnostics, appearance mode, and theme controls.
- Layout themes: default, spy, sci-fi, halloween, hacking, and coding, now with stronger palettes, descriptions, and visible accent swatches.

## Release Boundary

The desktop app lives in `apps/jaws-desktop`. Its Tauri bundle includes `dist/openjaws` or `dist/openjaws.exe` as `src-tauri/binaries/openjaws-$TARGET_TRIPLE`.

Installer attribution:

> Built by AROBI TECHNOLOGY ALLIANCE A OPAL MAR GROUP CORPORATION NJ USA.

The Tauri bundle publisher is pinned to that string, and `bun run jaws:release:check` fails if the installer metadata drifts.

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

The desktop verification gate now runs Bun UI/helper tests before sidecar prep, TypeScript/Vite build, and Tauri `cargo check`.

Workspace selection uses the Tauri native dialog plugin. Users should open a project folder from the desktop picker, and JAWS stores that selection as the active Chat and TUI workspace. Manual path entry remains available for diagnostics and scripted paths.

Local founder admin session:

```powershell
bun run jaws:admin:bootstrap
bun run jaws:local:admin:seed
```

The bootstrap command creates the ignored local founder-admin receipt in `website/.data`. The seed command copies only a sanitized desktop session into the JAWS app config directory so the native shell can show the enrolled account without exposing the bootstrap password or local receipt path.

Desktop bundle:

```powershell
bun run jaws:build
```

`jaws:build` performs a signed-release preflight before preparing the sidecar or compiling the native bundle. It requires `TAURI_SIGNING_PRIVATE_KEY` locally, or `JAWS_TAURI_SIGNING_PRIVATE_KEY` in CI where the workflow maps the secret into Tauri's expected environment. This prevents a long installer build from reaching the final updater-signing step and failing after the artifacts are already created.

## Update Pipeline

Tauri updater artifacts are signed. The public key belongs in `apps/jaws-desktop/src-tauri/tauri.conf.json`; the private key must only live in CI secrets.

Required GitHub secrets:

- `JAWS_TAURI_SIGNING_PRIVATE_KEY`
- `JAWS_TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only when the signing key was generated with a password

The release workflow is `.github/workflows/jaws-desktop.yml`. It builds OpenJaws, prepares the sidecar, builds the Tauri bundle, and uploads signed installer/update artifacts. Public download pages on `qline.site` and `iorch.net` publish only artifacts from that workflow or from the verified GitHub release assets produced by that workflow.

The updater public key is committed in `tauri.conf.json`, and the matching private key is stored in the repository secret `JAWS_TAURI_SIGNING_PRIVATE_KEY`. The private signing key must stay in CI secrets only. `bun run jaws:release:check` fails closed until the public key, HTTPS update endpoints, native icon, updater artifacts, and sidecar bundle config are all present.

The publish job also generates `latest.json` from the signed Tauri artifacts. That manifest is the update contract for the public download surfaces:

```powershell
bun run --cwd apps/jaws-desktop release:index
bun run jaws:manifest:test
node apps/jaws-desktop/scripts/build-updater-manifest.mjs --bundle-root <bundle-dir> --base-url https://github.com/PossumXI/OpenJaws/releases/download/<tag> --out latest.json --version <semver>
```

`apps/jaws-desktop/src/release-index.json` is generated from the desktop package version by `apps/jaws-desktop/scripts/build-release-index.mjs`. The desktop Settings screen, the native Tauri release probe, and the repository mirror-health gate all read that same index so the public mirrors, GitHub release tag, expected asset names, and updater platform entries do not drift across files.

The manifest is served through the dynamic updater endpoint implemented in the website app. It can pin `JAWS_UPDATER_MANIFEST_URL`, pin `JAWS_UPDATER_RELEASE_TAG`, or discover the latest public `jaws-v*` GitHub release in `JAWS_UPDATER_GITHUB_REPO`.

The endpoint returns `204 No Content` when the requesting install is current or no signed platform artifact exists. It returns the Tauri v2 dynamic payload only when the published `latest.json` contains a newer version, an HTTPS artifact URL, and a signature for the requested `{target}-{arch}`.

- `https://qline.site/api/jaws/{{target}}/{{arch}}/{{current_version}}`
- `https://iorch.net/api/jaws/{{target}}/{{arch}}/{{current_version}}`

Windows bundle smoke, run locally on 2026-04-29:

- `JAWS_0.1.0_x64_en-US.msi`
- `JAWS_0.1.0_x64_en-US.msi.sig`
- `JAWS_0.1.0_x64-setup.exe`
- `JAWS_0.1.0_x64-setup.exe.sig`

0.1.2 local release verification, run on 2026-04-29:

- `bun run jaws:verify`
- `bun run jaws:release:check`
- `bun run build`
- `bun run test`
- `bun run showcase:copy:check`

0.1.2 adds the native Settings page, keeps update checks available from Settings, replaces the in-app image logo with a CSS/React JAWS mark so the shell cannot render a broken image, keeps regenerated native installer icons, upgrades Chat into a slimmer animated workstream with per-message activity markers and a bounded `openjaws --print` sidecar bridge, adds the animated Cyber Frog pet loop, adds user and agent profile areas, adds native Open Folder workspace selection, renames the arcade runner to Slow Guy, and keeps the desktop release version aligned across `package.json`, `tauri.conf.json`, `Cargo.toml`, and `Cargo.lock`.

0.1.2 public release mirrors, deployed and live-checked on 2026-04-30:

- `https://qline.site/downloads/jaws`
- `https://iorch.net/downloads/jaws`
- `https://github.com/PossumXI/OpenJaws/releases/tag/jaws-v0.1.2`

Both public web mirrors expose branded installer pages plus redirect routes for Windows setup, Windows MSI, macOS DMG, Linux DEB, Linux RPM, and `latest.json`. The mirrors route downloads back to the signed GitHub release assets instead of rehosting untracked binaries.

Mirror health gate:

```powershell
bun run jaws:mirror:check --json --out .tmp-jaws-release-mirror-health.json
```

The gate checks both public mirror pages, every public mirror redirect, the GitHub `jaws-v0.1.2` release asset list, and the signed updater manifest entries for Windows and macOS. When `OPENJAWS_RELEASE_HEALTH_PRIVATE_KEY` or `OPENJAWS_RELEASE_MANIFEST_PRIVATE_KEY` is present, the receipt is signed with the existing Ed25519 release-manifest signature format.

Arcade and update-pipeline local verification, run on 2026-04-30:

- `bun test src/games.test.ts`
- `bun run test`
- `bun run build`
- `bun run verify`

This pass adds the verifier-backed `Slow Guy` mechanics, Hold'em roundtable game state, `pokersolver` showdown scoring, Settings update-pipeline diagnostics, stronger layout themes, and the first secure multiplayer/sandbox UI foundation for chat rooms, PvP tables, pets, and community agent profiles.

Native release-probe pass, run on 2026-04-30:

- generated `apps/jaws-desktop/src/release-index.json` from `apps/jaws-desktop/package.json`
- wired the desktop Settings panel to `probe_release_update_pipeline`
- moved the mirror-health gate to the generated release index
- verified `bun run release:index -- --check`, `bun test scripts/jaws-release-mirror-health.test.ts`, desktop tests, desktop build, and Tauri `cargo check`

Runtime visibility and compliance pass, run on 2026-04-30:

- Agent Watch now calls the native `agent_runtime_snapshot` command inside Tauri instead of relying only on fixture events.
- The snapshot reads bounded fixed files from `artifacts/q-runs`: `route-queue.json`, `route-workers.json`, and `route-worker-runtime.json`.
- Workspace selection is honored first, then current/executable repo ancestors are checked, so a selected OpenJaws workspace can surface real Q route and worker state.
- The desktop app now includes an in-app Docs and Legal surface plus the wiki page `JAWS-Legal-Compliance.md`.
- The desktop bundle publisher is pinned to `AROBI TECHNOLOGY ALLIANCE A OPAL MAR GROUP CORPORATION NJ USA`.
- `bun run jaws:soak -- --duration-ms 300000 --users 5000` is the five-minute desktop durability lane for logo, docs/legal, release metadata, updater security, Agent Watch bridge, Slow Guy, Hold'em, and synthetic user-presence scaling.

Implementation references:

- Tauri updater plugin: `https://v2.tauri.app/plugin/updater/`
- Tauri sidecar binaries: `https://v2.tauri.app/develop/sidecar/`
- Tauri GitHub release pipelines: `https://v2.tauri.app/distribute/pipelines/github/`

## Next Production Tasks

1. Implement the dynamic `/api/jaws/{target}/{arch}/{current_version}` updater endpoint on `iorch.net`; `qline.site` already has the release mirror and updater manifest redirect live.
2. Upgrade the Agent Watch snapshot into continuous event streaming from the OpenJaws route/runtime log bus.
3. Add the secure websocket room service for Hold'em PvP, world chat, pet presence, and signed agent sandbox presence.
4. Connect Arobi enrollment to the real account and ledger APIs.
5. Implement exchange-code collaboration with signed workspace invites, revocation, and explicit pooled-credit consent.
6. Add marketplace package signing, review states, sandbox scopes, and rollback metadata.
7. Replace remaining prose-only `jaws-v0.1.2` references in user docs when the next generated release train is cut.
