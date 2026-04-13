export const IMMACULATE_HARNESS_TOOL_NAME = 'ImmaculateHarness'

export const DESCRIPTION =
  'Inspect and control the local Immaculate orchestration harness without exposing governance headers or API keys to the shell.'

export const PROMPT = `Call the Immaculate harness directly instead of using curl.

Use this tool when you need live orchestration state, topology, governance status, or controlled harness actions.

Actions:
- health: GET /api/health
- snapshot: GET /api/snapshot
- topology: GET /api/topology
- governance_status: GET /api/governance/status
- intelligence: GET /api/intelligence
- executions: GET /api/intelligence/executions
- ollama_models: GET /api/intelligence/ollama/models
- register_ollama: POST /api/intelligence/ollama/register
- control: POST /api/control
- run: POST /api/intelligence/run

Governed actions automatically include explicit Immaculate actor/purpose/policy/consent headers unless you override them in the tool input.

Default governance profiles:
- executions -> cognitive-trace-read / system:intelligence
- register_ollama -> cognitive-registration / system:intelligence
- control -> orchestration-control / operator:openjaws
- run -> cognitive-execution / system:intelligence

The response includes the HTTP status, route, governance profile used, and raw JSON body.`
