# Features and Capabilities

## Core Operator Surfaces

- flight-deck TUI with compact receipts, status pills, and background task inspection
- `/status` with startup harness, route queue, worker health, and voice/runtime wiring
- `/immaculate` for live topology, execution load, control pulses, and worker visibility
- `/provider`, `/theme`, `/voice`, `/remote-env`, `/caveman`, and `/power` configuration paths
- `/preview` for native in-TUI browser preview, `/chrome` for optional Chrome automation, and `/mcp` for server inventory and auth state
- explicit runtime receipts so installed users can verify what is really active instead of relying on hidden fallbacks

## OpenCheek Agents

- multi-agent teammate launch
- Immaculate-paced burst budgeting
- deferred teammate launch queue with inspectable rows and detail dialogs
- crew pressure summaries in coordinator, footer, and background task surfaces
- note-deck / queued supervision support

## Tools and Execution

- Bash and PowerShell execution
- file read/write/edit and notebook edit tools
- web fetch and Firecrawl dataset generation
- MCP server integration
- native in-TUI browser preview through the Apex browser bridge
- optional OpenJaws in Chrome browser automation when the Chrome bridge is installed
- permission prompts and allow-session shaping
- local and remote execution paths

## Provider and Runtime Control

- `Q` as the public default picker option for fresh installs, backed by `oci:Q`
- provider/model switching through `/provider`
- provider key rotation and base-URL override through `/provider key` and `/provider base-url`
- remote environment selection through `/remote-env`
- live runtime verification through `/status`
- fail-closed route and worker reporting when remote execution is required
- compatibility with local, hosted, and routed execution paths without hiding the current execution mode

## Q and Training

- transcript export to SFT JSONL
- audited dataset preparation with tags and splits
- local LoRA trainer scaffold
- signed route manifests for remote_required launches
- queue assignment, worker capabilities, remote HTTP dispatch, and signed terminal result reconciliation

## Installed User Operations

- source build flow for dynamic releases
- native launcher rebuild path for Windows and local installs
- public-safe verification lane with `bun run verify:public`
- release verification lane with `bun run verify:release`
- update flow built around explicit rebuild and post-update verification instead of blind in-place patching

## Voice

- speech/recording harness detection
- ElevenLabs summary playback wiring
- status reporting for speech input/output availability

## Release and Verification

- unit and harness verification
- native build path
- scripted settings walkthrough
- deferred launch walkthrough
- remote route dispatch and completion smokes

## How Users Discover These Capabilities

- start with `/status` for live wiring, harness state, and queue visibility
- use `/immaculate` when you need orchestration topology, control pulses, or worker health
- use `/provider` and `/remote-env` when switching execution strategy
- use `/preview` for in-TUI browsing, `/chrome` for optional Chrome automation, and `/voice` for speech surfaces
- open the background task dialog to inspect crews, deferred launches, and route pressure
- use the safe install/update guidance in `Install and Updates` before replacing binaries or moving to a newer dynamic release
