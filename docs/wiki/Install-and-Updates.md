# Install and Updates

This page is the public operator path for installing OpenJaws, updating it safely, and verifying that the running build is wired the way you expect.

## Release Model

OpenJaws currently ships as a public source repository with native local builds and fast-moving development on `main`.

Practical guidance:

- if you want the newest work, build from the official repository
- if you want a slower-moving install surface, prefer tagged releases when available
- tagged native releases are the public update feed for installed users
- do not use reposted binaries, unknown mirrors, or copy-pasted installer scripts from third parties

## First Install

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

## First-Run Checklist

After the first launch:

1. Use the built-in first-run setup lane to choose provider/model and wire your key or auth path.
2. Run `/login` if your selected provider still requires account auth.
3. Run `/provider` if you want to change the provider/model chosen during first-run setup.
4. Run `/status` and verify:
   - active provider and model
   - runtime mode
   - sandbox state
   - routed work or worker state, if present
5. Run `/immaculate status` if you want to inspect orchestration pressure and worker health before heavier work.

## Provider Switching

OpenJaws supports switching providers and models from the terminal, but the safe path is explicit:

1. Run `/provider`.
2. Select the provider and model.
3. If you are changing execution location, also run `/remote-env` when needed.
4. Run `/status` and confirm the active wiring before continuing.

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

OpenJaws now defaults the public auto-update lane to `stable`. Public native updates are GitHub Release-backed and tag-gated so installed users do not silently jump to arbitrary `main` builds.

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

## Why Immaculate Matters Here

Immaculate improves the install and update experience by making OpenJaws more explicit about what is actually active:

- route and worker state are visible instead of hidden behind silent fallbacks
- provider and execution changes can be confirmed through `/status`
- routed Gemma execution surfaces assignment, dispatch, and completion state
- worker health and orchestration pressure are visible to installed users, not just internal developers
