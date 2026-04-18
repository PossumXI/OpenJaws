# Accountable Browser Preview

OpenJaws now has a bounded `/preview` command for browser-backed app preview, research, and supervised chill/watch sessions.

This is the honest contract:

- OpenJaws does **not** claim to embed the external Apex browser engine directly into the TUI.
- The fast real seam is a launcher-backed browser lane with accountability receipts.
- Chrome-compatible launches are preferred when available.
- The Apex browser app remains an external desktop shell that OpenJaws can launch on purpose.

## What `/preview` does

- opens `http://` or `https://` URLs through a real browser path
- records:
  - intent (`preview`, `research`, `browse`, `watch`, `music`)
  - rationale (`why this session exists`)
  - requester (`user` or `agent`)
  - handler (`chrome`, `system`, or `apex-browser`)
- surfaces the latest receipt back into `/status`

## Why this design

The external Apex browser under `ignite/apex-os-project/apps/browser` is a native Rust GUI app with its own event loop and platform webview stack. That makes it a good launcher target, but not a clean TUI-embedded surface.

For OpenJaws, the best bounded production seam is:

- OpenJaws TUI command for accountable launches
- existing Chrome/browser utilities for live preview
- external Apex browser shell when an operator explicitly wants that desktop app

## Accountability

Each `/preview` launch keeps a receipt under the OpenJaws config home so operators can answer:

- why did this agent open the browser
- what kind of session was it
- which runtime handled it
- did it actually open

That keeps supervised preview and unsupervised browsing on the same visible contract.
