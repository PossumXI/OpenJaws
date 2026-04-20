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
