export const IMMACULATE_HARNESS_TOOL_NAME = 'ImmaculateHarness'

export const DESCRIPTION =
  'Inspect and control the local Immaculate orchestration harness without exposing governance headers or API keys to the shell.'

export const PROMPT = `Call the Immaculate harness directly instead of using curl.

Use this tool when you need live orchestration state, topology, governance status, controlled harness actions, governed internet fetch/search, tool receipts, or packaged artifacts.

Actions:
- health: GET /api/health
- snapshot: GET /api/snapshot
- topology: GET /api/topology
- governance_status: GET /api/governance/status
- intelligence: GET /api/intelligence
- executions: GET /api/intelligence/executions
- ollama_models: GET /api/intelligence/ollama/models
- tool_capabilities: GET /api/tools/capabilities
- tool_receipts: GET /api/tools/receipts
- tool_receipt: GET /api/tools/receipts/:kind/:receiptId
- tool_fetch: POST /api/tools/fetch
- tool_search: POST /api/tools/search
- artifact_package: POST /api/artifacts/package
- register_ollama: POST /api/intelligence/ollama/register
- control: POST /api/control
- run: POST /api/intelligence/run

Governed actions automatically include explicit Immaculate actor/purpose/policy/consent headers unless you override them in the tool input.

Default governance profiles:
- executions -> cognitive-trace-read / system:intelligence
- tool_capabilities -> cognitive-trace-read / system:intelligence
- tool_receipts/tool_receipt -> event-read / system:audit
- tool_fetch -> internet-fetch / system:research
- tool_search -> internet-search / system:research
- artifact_package -> artifact-delivery / system:delivery
- register_ollama -> cognitive-registration / system:intelligence
- control -> orchestration-control / operator:openjaws
- run -> cognitive-execution / system:intelligence

Use tool_fetch/tool_search instead of shell curl when Discord or Q needs current web evidence. Use artifact_package when a Discord/operator result needs a governed Markdown, text, JSON, HTML, DOCX, or PDF artifact receipt.

The response includes the HTTP status, route, governance profile used, and raw JSON body.`
