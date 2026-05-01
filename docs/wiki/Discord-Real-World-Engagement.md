# Discord Real-World Engagement

This note documents the Discord operator handoff added on 2026-05-01.

## Root Cause

Q could already run governed OpenJaws operator jobs, and OpenJaws already had Apex browser, mail, chrono, and artifact guardrails. The missing link was intent recognition. Plain-English Discord requests such as "use the browser to make a demo" or "draft LinkedIn outreach" were not promoted into the bounded OpenJaws work lane unless they used narrow OpenJaws command phrasing.

## Current Contract

`src/utils/discordOperatorWork.ts` now classifies plain-English real-world requests into safe lanes:

- `browser_preview`: Apex browser, `/preview`, and Playwright demo work
- `web_research`: live research with citations and prompt-injection boundaries
- `external_communication_draft`: email, LinkedIn, and marketing drafts only
- `chrono_planning`: schedule, reminder, and cron planning drafts
- `document_delivery`: PDF, DOCX, Markdown, and artifact-package delivery
- `apex_workspace`: bounded Apex bridge and workspace actions

Every classified request becomes an `ask-openjaws` operator job with a guardrail prefix. The prefix tells the worker which tools to prefer, requires receipts, and fails closed when a bridge or service is missing.

If the request does not name a project or path, the parser routes it to the approved `OpenJaws` workspace alias. This avoids a brittle `cwd: null` operator job while still going through the same workspace allowlist used by explicit operator commands. Operators should keep an `OpenJaws ...` workspace label in `openjaws-operator-workspaces.json`.

## Side-Effect Boundary

External communication, scheduling mutation, forms, purchases, account changes, publishing, infrastructure mutation, and money movement require a separate explicit operator approval command after the agent provides:

- a draft or proposed action
- a receipt summary
- a verification or rollback plan

This keeps Discord natural-language control useful without turning it into an unreviewed external-action surface.

## Verification

Run the focused parser tests after editing this lane:

```powershell
bun test src/utils/discordOperatorWork.test.ts
```

Run the broader OpenJaws gates before release:

```powershell
bun run audit:knip
bun run test
bun run build
```
