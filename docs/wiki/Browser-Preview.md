# Accountable Browser Preview

OpenJaws now has a bounded `/preview` command for native in-TUI app preview, research, and supervised chill/watch sessions.

This is the current contract:

- `/preview` uses the dedicated Apex browser bridge and keeps the session inside the OpenJaws cockpit.
- It does **not** hand normal preview work to Chrome or a third-party browser.
- `/preview` is the preferred native lane; `/apex launch browser` remains the explicit out-of-process fallback when you need the external Flowspace window.
- User browsing history stays out of persistent receipts by default.
- Q or agent-led browsing on the user’s behalf is the only lane that lands in accountable receipts.
- private-network and localhost targets are reserved for explicit `preview` sessions, so the general `browse`, `watch`, and `music` lanes stay on public URLs instead of quietly hitting internal hosts.
- shared status surfaces now redact private user session titles and URLs unless the session is an accountable Q or agent handoff.
- agent-side navigate and close operations now fail closed against private or unknown user sessions, so only accountable browser sessions can be mutated on the operator’s behalf.

## What `/preview` does

- opens `http://` or `https://` URLs through the native OpenJaws browser lane
- keeps local app previews on the `preview` intent and blocks private-network browsing for the non-preview leisure lanes
- can write and run a reusable Playwright demo harness for the current URL so users can capture desktop/mobile screenshots, traces, video-on-failure, and a JSON demo summary without hand-building Playwright setup
- records:
  - intent (`preview`, `research`, `browse`, `watch`, `music`)
  - rationale (`why this session exists`)
  - requester (`user` or `agent`)
  - handler (`openjaws-browser`)
- surfaces the active in-TUI browser bridge session plus the latest accountable receipt back into `/status`, with the live bridge taking priority

## Why this design

The Apex browser under `ignite/apex-os-project/apps/browser` is now bridged into OpenJaws through a narrow localhost runtime instead of being treated like a launcher-only shell. That keeps preview inside the TUI while still respecting a bounded trust surface.

For OpenJaws, the production seam is now:

- OpenJaws TUI command for accountable launches
- Apex browser bridge for page load, metadata, link capture, and excerpt rendering
- persistent receipts only when Q or an agent is acting on the user’s behalf
- launcher-backed desktop browser targets stay separate from `/preview`; the preview runtime is the bridge-backed in-TUI lane

## Accountability

Each accountable `/preview` launch keeps a receipt under the OpenJaws config home so operators can answer:

- why did an agent open the browser
- what kind of session was it
- which runtime handled it
- what page was rendered

That keeps supervised preview and accountable agent browsing on the same visible contract without storing private user browsing history.

## Web app demo harness

The `/preview` Controls tab now has `Write Playwright demo harness`.

It generates a bounded package under the OpenJaws config home:

- `README.md`
- `package.json`
- `playwright.config.ts`
- `tests/demo.spec.ts`
- `openjaws-preview-demo.receipt.json`

The generated spec opens the target URL in desktop and mobile Chromium, waits for visible body content, captures a full-page screenshot, records a JSON summary, keeps Playwright traces/videos on failure, and fails on page runtime errors. This gives builders a repeatable way to make product, service, website, and game demos from OpenJaws instead of relying on one-off manual screenshots.

The JAWS Desktop Preview tab exposes the same lane through `Write Demo`. The native backend writes a workspace-local package under:

```text
<workspace>/.openjaws/browser-preview/demos/<demo-slug>
```

That keeps desktop-generated demo artifacts beside the project they verify, while the TUI command can still create config-home demo harnesses for command-only sessions.

Typical flow:

```text
/preview http://127.0.0.1:5173/
```

Then choose `Write Playwright demo harness`, or `Run Playwright demo` to capture evidence directly through OpenJaws. The backend writes `openjaws-preview-demo-run.receipt.json` beside the generated harness so agents, Discord bridges, and operators can audit which command ran and where the evidence landed.

Use `demo_package` when the evidence needs to move through Discord, Direct Connect, or a delivery pipeline. It writes:

- `openjaws-preview-demo-artifacts.zip`
- `openjaws-preview-demo-artifacts.manifest.json`
- `openjaws-preview-demo-package.receipt.json`

The manifest records each packaged file path, byte count, and SHA-256 hash. The package receipt records the zip byte count and zip SHA-256 so an operator can verify that a delivered demo bundle matches the local evidence.

## Direct Connect and agent tool surface

The same browser preview lane is now exposed as a structured backend contract for agents, Discord/OpenJaws bridges, and Direct Connect clients.

Authenticated Direct Connect routes:

- `GET /browser/capabilities`
- `GET /browser/runtime`
- `GET /browser/receipts`
- `POST /browser/open`
- `POST /browser/navigate`
- `POST /browser/close`
- `POST /browser/launch`
- `POST /browser/handoff`
- `POST /browser/demo-harness`
- `POST /browser/demo-run`
- `POST /browser/demo-package`

The existing `WEB_BROWSER_TOOL` feature gate now resolves to the `BrowserPreview` tool instead of a missing module. The tool uses the same shared API runner as Direct Connect, so TUI commands, backend calls, and agent tool use all enforce the same URL policy, accountable requester model, receipt behavior, Playwright harness writer, and Playwright demo runner.

`demo_run` accepts either a `url` to create a new harness or an `outputDir` pointing at an existing harness receipt. It returns the command, exit code, stdout/stderr tails, artifact paths, and a run receipt path. Set `installBrowsers=true` when Chromium has not been installed yet; set `headed=true` for supervised visual runs.

`demo_package` accepts either a `url` to create a new harness or an `outputDir` pointing at an existing harness receipt. It returns the zip path, manifest path, receipt path, packaged file list, and package hash.
