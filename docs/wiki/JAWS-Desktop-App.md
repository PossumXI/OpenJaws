# JAWS Desktop App

JAWS is the native desktop wrapper for OpenJaws. The first desktop lane keeps the existing terminal backend intact and bundles it as a Tauri sidecar so the app can add native release/update behavior, a clean workspace shell, live agent visibility, enrollment, marketplace, studio, arcade, and co-work surfaces without destabilizing the TUI.

Brand line:

> Jaws IDE, the future wrapped with OpenJaws and comes default with Q and Immaculate.

## Current Surface

- Collapsible side menu for focused workspace viewing.
- Control dashboard for OpenJaws, Q, Q_agents, OpenCheek, Immaculate, Arobi, and security lanes.
- Chat window for command entry, live agent/work transcript, per-message shark-jaw activity markers, Q thinking animation, command starter tools, project-scoped chat windows, minimize/expand/collapse controls, a real desktop-to-OpenJaws command bridge, review-first or fast mode, notification state, and optional change comparison.
- Terminal workspace tab that can open a native folder picker, validates the selected project folder, stores the workspace locally, shows the exact OpenJaws TUI launch command, and can run the bundled OpenJaws sidecar from that folder.
- Browser Preview tab for embedded local/web preview, `.openjaws/launch.json` authoring, preview history, native Playwright website-test generation, and browser-control task staging that stops for explicit approval before forms, email, purchases, account changes, or other irreversible actions.
- Context tab for a visible, aggregate-only project scan. It shows workspace coverage, priority files, skipped sensitive/generated paths, estimated context weight, and which Q/Q_agent/OpenCheek/Immaculate lanes receive the scan without exposing raw file contents. Non-desktop preview mode no longer displays fake file counts; it reports that a desktop scan is required.
- Agent Watch timeline and activity board for live queue/worker events, so users can see what agent lanes are doing instead of trusting static copy.
- Image Studio and Video Studio panels for provider-gated creative work.
- Arcade Bar with `Slow Guy`, a scored runner with lane controls, jump/duck/dash mechanics, lives, shield recovery, level speed, stamina, code-token collection, objective state, best-score persistence, and Cyber Frog rewards.
- Texas Hold'em Dealer Roundtable foundation with deterministic local dealing, hold/check/pass/bet/raise controls, table-token accounting, profile code-token prizes, Q/OpenCheek seats, showdown evaluation, secure scope chips, and multiplayer room metadata ready for a signed websocket transport.
- 3D Sandbox foundation tab for user, pet, Q, agent forge, and PvP-table presence, with capability-manifest and workspace-scope review gates for future community agent release.
- Animated Cyber Frog companion with code-token rewards, feeding, training, gear, decorations, egg progress, naming, and profile persistence.
- User profile and agent profile surfaces for workspace identity, profile-linked code-token wallet state, marketing follow-up consent, agent lane status, and pet/code-token state.
- Arobi ledger and enrollment links.
- Q_agents Co-work controls for stacked/paired/solo modes, worker-lane toggles, shared notes, explicit pooled-credit consent, OpenCheek handoff state, and Immaculate pacing.
- Marketplace cards for skills, tools, workflows, games, and third-party integrations.
- Billing copy for a 14-day trial and flat `$12.99/mo` IDE subscription, with Q credits separate.
- Docs page with in-app Terms, final-sale billing policy qualified by applicable law, security/privacy notes, community content rules, AI output notice, developer verification commands, and release links.
- Settings page with release status, safe update checks, install action, download-source checks, durable in-app notification history, unread/dismiss/clear controls, testable fireworks/sound alerts, appearance mode, and theme controls. The native app also performs a startup update check and shows an Install Now / Later prompt when a signed release is available.
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

0.1.5 release-candidate mirrors for the next public update:

- `https://qline.site/downloads/jaws`
- `https://iorch.net/downloads/jaws`
- `https://github.com/PossumXI/OpenJaws/releases/tag/jaws-v0.1.5`

Both public web mirrors expose branded installer pages plus redirect routes for Windows setup, Windows MSI, macOS DMG, Linux DEB, Linux RPM, and `latest.json`. The mirrors route downloads back to the signed GitHub release assets instead of rehosting untracked binaries. Both `qline.site` and `iorch.net` also expose `/api/jaws/<target>/<arch>/<current_version>` so existing tester installs can discover the signed 0.1.5 update through the Tauri updater endpoint after the tag workflow publishes artifacts.

Mirror health gate:

```powershell
bun run jaws:mirror:check --json --out .tmp-jaws-release-mirror-health.json
```

The gate checks both public mirror pages, every public mirror redirect, the GitHub `jaws-v0.1.5` release asset list, and the signed updater manifest entries for Windows and macOS. When `OPENJAWS_RELEASE_HEALTH_PRIVATE_KEY` or `OPENJAWS_RELEASE_MANIFEST_PRIVATE_KEY` is present, the receipt is signed with the existing Ed25519 release-manifest signature format.

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

Native capability integration pass, run on 2026-04-30:

- Preview is now a first-class desktop section, not a hidden TUI-only capability.
- The native bridge exposes `browser_preview_snapshot`, `write_browser_preview_launch_config`, `write_browser_preview_demo_harness`, and `q_agents_cowork_plan`.
- JAWS reads OpenJaws browser-preview receipts from the local OpenJaws config home and writes workspace launch config to `.openjaws/launch.json`.
- The Preview tab stages `/preview`, `bunx playwright codegen`, and `bunx playwright test` workflows, and `Write Demo` creates `<workspace>/.openjaws/browser-preview/demos/<demo-slug>` with Playwright config, spec, README, and a receipt.
- The Co-work tab exposes Q planner, Q_agent implementer, Q_agent verifier, and co-work room controls with explicit pooled-credit consent.
- Slow Guy now has lives, shield frames, level progression, and token tracking so the game loop has recoverability and objectives instead of one-hit failure.

Context trust and notification pass, run on 2026-04-30:

- Added the JAWS Context Brain tab and native `project_context_snapshot` command.
- The context snapshot scans the selected workspace into aggregate metadata only: category coverage, priority file names, estimated token weight, skipped reason groups, and route-lane receipts.
- Secret-like files, generated folders, binary assets, symlinks, oversized files, and unreadable paths are summarized as counts/examples instead of content.
- Chat now includes a context trust chip, labeled command input, disabled empty-send state, and an `aria-live` transcript.
- Settings now includes a notification center with history and a test button.
- Agent completion, human-input-required, and update-prep events trigger an in-app fireworks toast and generated audio cue when notifications are armed.

Native notification and cognitive runtime pass, run on 2026-05-01:

- Added the Tauri notification plugin and `notification:default` capability so the existing JAWS bell center can also send real desktop notifications after OS permission is granted.
- Notification permission is checked on native startup, requested only when a user arms notifications, and kept separate from the in-app bell history so denied OS permission cannot hide in-app alerts.
- The Agent Watch bridge now includes a `cognitive` snapshot derived from real `artifacts/q-runs/route-queue.json`, `route-workers.json`, and `route-worker-runtime.json` data.
- Cognitive Runtime shows governed route decisions, memory layers, scorecards, policy hints, and a causal trace from goal to decision to ledger record instead of a static explanation panel.
- Root cause for the prior trust gap: JAWS could show route/worker events, but it did not expose the admission record created by `src/q/routing.ts`, so users could not see the planner/executor/critic/governor/recorder loop from the desktop app.
- Verification: `bun test src`, `bun run build`, `bun run verify`, `cargo test --manifest-path apps/jaws-desktop/src-tauri/Cargo.toml`, `cargo check --manifest-path apps/jaws-desktop/src-tauri/Cargo.toml`, `bun test src/utils/cognitiveRuntime.test.ts src/q/routing.test.ts`, and `bun run jaws:release:check`.
- TerminalBench preflight repair: Docker Desktop was stopped on this host and Harbor was missing. Docker was started, Harbor was installed into the repo-local `.tools/harbor-venv`, and `bun run q:preflight` now passes Harbor, Docker, and clock checks while still warning on the provider preflight.

Inference customization pass, run on 2026-05-01:

- Settings now has an `Inference` panel for provider, model, base URL, route policy, temperature, max-output-token tuning, native route checks, live route probes, and staged provider commands.
- OpenJaws now has a direct `openjaws provider ...` CLI route for provider status/test commands, so desktop Settings does not send provider diagnostics through the long-running chat/model turn path.
- The native Tauri bridge exposes `openjaws_inference_status`, calls the bundled sidecar as `openjaws provider status` or `openjaws provider test <provider> <model>`, caps execution at 45 seconds, redacts token-shaped output, and falls back to a local environment preflight if the sidecar is unavailable.
- Root cause for the JAWS inference hang: diagnostics were being routed through the normal chat/runtime startup path. The direct `openjaws provider ...` route now skips full session bootstrap and returns a bounded route receipt for native Settings checks.
- The operator-facing root cause is documented here: `/provider status` should not be routed through `openjaws --print` from the desktop bridge because that path can wait on a full model turn and leave Settings looking hung.

Chat session lifecycle pass, run on 2026-05-01:

- Chat windows now have an explicit Close control that removes stale project chats from the active workspace strip without deleting the transcript.
- Closed chats move to a bounded local resume archive stored separately from active chats, preserving workspace path, title, messages, and close time.
- The Chat side tools now include a Chat Sessions panel so operators can resume active or archived project chats from the same control surface used for folder, TUI, compare, fast queue, and notifications.
- Root cause for the missing resume/close workflow: project chats were only selectable while open; closing semantics were absent, so users had no safe way to declutter active workspaces while retaining context.

Notification durability pass, run on 2026-05-01:

- Notification state now hydrates from `localStorage` instead of resetting to the seed update notice on every app load.
- The bell tray and Settings notification center share one bounded notification lifecycle with unread counts, mark-read, dismiss, clear, test, sound, and fireworks behavior.
- Stored notification payloads are normalized on read, so malformed or older local entries cannot break the tray and the app falls back to the durable seed notice when history is missing.
- Root cause for the bell appearing empty or stale after interaction: notification entries were owned directly by the React session state, so reloads and malformed local state had no durable normalization layer.

0.1.4 release and update-pipeline pass, prepared on 2026-04-30:

- Desktop package, Tauri app config, Cargo metadata, Cargo lockfile package entry, and generated release index now align on `0.1.4`.
- The `jaws-v0.1.4` GitHub release workflow is the source for signed Windows, macOS, Linux, and updater manifest assets.
- `qline.site` and `iorch.net` redirects are prepared to route every public JAWS download route to the 0.1.4 signed GitHub assets.
- Both live updater endpoints should return a signed 0.1.4 Windows update for `0.1.3` testers and `204 No Content` for already-current `0.1.4` installs after release publication.
- `bun run jaws:mirror:check` remains the release gate for the published 0.1.4 release assets.
- Native Playwright demo harness receipts now include a deterministic `fnv1a64` receipt hash covering the generated README, package, config, spec, and pre-hash receipt body.
- The Preview tab surfaces that receipt hash beside the generated harness/spec/receipt paths for release evidence.

0.1.5 release workflow hardening pass, prepared on 2026-04-30:

- Desktop package, Tauri app config, Cargo metadata, Cargo lockfile package entry, and generated release index align on `0.1.5`.
- Public route probes now derive current and previous tester versions from `apps/jaws-desktop/src/release-index.json` instead of hardcoded `0.1.4` URLs.
- The native startup updater workflow is covered by focused tests for startup/manual checks, Install Now visibility, Later deferral, and preview-mode diagnostics.
- The JAWS desktop tag workflow publishes the signed GitHub release after artifact upload, so a new `jaws-v*` tag can become visible to tester installs without a separate manual draft-publish step.

Implementation references:

- Tauri updater plugin: `https://v2.tauri.app/plugin/updater/`
- Tauri sidecar binaries: `https://v2.tauri.app/develop/sidecar/`
- Tauri GitHub release pipelines: `https://v2.tauri.app/distribute/pipelines/github/`

## Next Production Tasks

1. Upgrade Agent Watch and Preview receipts into one continuous OpenJaws event stream with cursor replay and worker-heartbeat deltas.
2. Add the secure websocket room service for Hold'em PvP, world chat, pet presence, and signed agent sandbox presence.
3. Replace Q_agents co-work plan stubs with real route runtime controls, signed exchange-code invites, revocation, and explicit pooled-credit consent.
4. Connect Arobi enrollment to the real account and ledger APIs.
5. Add marketplace package signing, review states, sandbox scopes, and rollback metadata.
6. Surface the latest Playwright screenshot/video artifact set in the Preview tab after test execution.
7. Add a release smoke that opens the installed Windows app, triggers Settings update check, and records the Tauri updater response for the published tester build.
