# OpenJaws - Project Instructions

OpenJaws is a privacy-focused, open-source terminal coding cockpit with a branded flight-deck TUI,
OpenCheek agents, and Immaculate-backed orchestration.

## What is OpenJaws?

OpenJaws runs directly in your terminal. It understands your codebase, edits files, executes tools,
handles git workflows, coordinates background agents, and exposes operator surfaces such as `/status`,
`/immaculate`, `/provider`, `/voice`, and background task inspection.

## Privacy First

This build removes telemetry and non-essential traffic by default:

- **No analytics or event logging** — nothing is sent to third-party analytics services
- **No external feature-flag dependency for safe defaults** — critical behavior has local fallbacks
- **No file operation tracking** — file changes are not reported externally
- **No cost telemetry uploads** — usage stays local unless you explicitly route it elsewhere
- **No background performance reporting** — no FPS or similar passive metrics are emitted

To verify telemetry is disabled, check your environment:

```bash
echo $DISABLE_TELEMETRY
echo $OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC
```

## Usage

```bash
openjaws --help
openjaws
openjaws "fix the login bug"
openjaws --version
```

## Key Commands

- `/help` — Show available commands
- `/login` — Authenticate with API key or web login
- `/provider` — Switch providers and models
- `/skills` — Manage skills and plugins
- `/hooks` — Configure hook behavior
- `/mcp` — Manage MCP servers
- `/context` — Manage memory and context
- `/theme` — Change terminal color theme
- `/status` — Show live execution wiring and harness state
- `/exit` — Exit the session

## Configuration

OpenJaws reads settings from `~/.openjaws/settings.json`. Common keys:

- `apiKey` — Your direct provider API key when using API-key auth
- `model` — Default model
- `additionalDirectories` — Extra directories to include
- `permissionMode` — Default permission behavior

## Authentication

OpenJaws supports both API-key and web-account flows depending on provider and feature:

- Environment variable: provider-specific key such as `OPENAI_API_KEY` or your selected provider's API key variable
- `/login` command: `openjaws /login`
- Settings file: `~/.openjaws/settings.json`

## Keyboard Shortcuts

- `Ctrl+C` — Interrupt the current operation
- `Ctrl+D` — Exit OpenJaws
- `Ctrl+L` — Clear the screen
- `Ctrl+R` — Search command history

## Tips

- Be specific in your requests
- Use `/context` to add relevant files or docs
- Use `/skills` to extend OpenJaws with project-specific workflows
- Use `/hooks` to automate repeatable steps
