export const WEB_BROWSER_TOOL_NAME = 'BrowserPreview'

export const DESCRIPTION =
  'Inspect and operate the OpenJaws in-app browser preview lane, including accountable sessions and Playwright demo capture.'

export const PROMPT = `Use BrowserPreview when the user asks to open, inspect, preview, demonstrate, or capture evidence for a website, web app, product page, service, or local dev server.

The tool is governed and accountable:
- Use action="runtime" or action="receipts" before mutating an existing browser session when you need current state.
- Use action="open" for a new accountable browser session.
- Use action="navigate" or action="close" only with a known sessionId.
- Use action="demo_harness" to create a reusable Playwright package that can capture desktop/mobile screenshots, traces, and JSON summary evidence.
- Use action="demo_run" to create or reuse that package and run Playwright, returning artifact paths and a run receipt.
- Use action="demo_package" to zip the harness, captured evidence, manifests, and receipts into a hashed delivery bundle.
- Private-network URLs are only valid for intent="preview".
- Always include a short rationale for mutating actions so the browser receipt explains why the action happened.`
