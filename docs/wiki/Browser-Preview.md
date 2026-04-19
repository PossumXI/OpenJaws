# Accountable Browser Preview

OpenJaws now has a bounded `/preview` command for native in-TUI app preview, research, and supervised chill/watch sessions.

This is the current contract:

- `/preview` uses the dedicated Apex browser bridge and keeps the session inside the OpenJaws cockpit.
- It does **not** hand normal preview work to Chrome or a third-party browser.
- User browsing history stays out of persistent receipts by default.
- Q or agent-led browsing on the user’s behalf is the only lane that lands in accountable receipts.

## What `/preview` does

- opens `http://` or `https://` URLs through the native OpenJaws browser lane
- records:
  - intent (`preview`, `research`, `browse`, `watch`, `music`)
  - rationale (`why this session exists`)
  - requester (`user` or `agent`)
  - handler (`openjaws-browser`)
- surfaces the live browser runtime plus the latest accountable receipt back into `/status`

## Why this design

The Apex browser under `ignite/apex-os-project/apps/browser` is now bridged into OpenJaws through a narrow localhost runtime instead of being treated like a launcher-only shell. That keeps preview inside the TUI while still respecting a bounded trust surface.

For OpenJaws, the production seam is now:

- OpenJaws TUI command for accountable launches
- Apex browser bridge for page load, metadata, link capture, and excerpt rendering
- persistent receipts only when Q or an agent is acting on the user’s behalf

## Accountability

Each accountable `/preview` launch keeps a receipt under the OpenJaws config home so operators can answer:

- why did an agent open the browser
- what kind of session was it
- which runtime handled it
- what page was rendered

That keeps supervised preview and accountable agent browsing on the same visible contract without storing private user browsing history.
