import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  BROWSER_PREVIEW_API_ACTIONS,
  BROWSER_PREVIEW_API_INTENTS,
  BROWSER_PREVIEW_API_REQUESTERS,
  isBrowserPreviewApiReadOnly,
  runBrowserPreviewApiAction,
  type BrowserPreviewApiInput,
  type BrowserPreviewApiOutput,
} from '../../utils/browserPreviewApi.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { DESCRIPTION, PROMPT, WEB_BROWSER_TOOL_NAME } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(BROWSER_PREVIEW_API_ACTIONS),
    url: z
      .string()
      .optional()
      .describe('URL to open, navigate to, or use as the Playwright demo target'),
    sessionId: z
      .string()
      .optional()
      .describe('Browser session id for navigate, close, or handoff actions'),
    intent: z
      .enum(BROWSER_PREVIEW_API_INTENTS)
      .optional()
      .describe('Preview intent. Use preview for local/private-network apps.'),
    rationale: z
      .string()
      .optional()
      .describe('Short accountable reason for mutating browser actions'),
    requestedBy: z
      .enum(BROWSER_PREVIEW_API_REQUESTERS)
      .optional()
      .describe('Actor recorded on accountable browser receipts'),
    name: z
      .string()
      .optional()
      .describe('Human-friendly demo name for action="demo_harness"'),
    outputDir: z
      .string()
      .optional()
      .describe(
        'Optional output directory for action="demo_harness", action="demo_run", or action="demo_package"',
      ),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Optional timeout for action="demo_run" in milliseconds'),
    headed: z
      .boolean()
      .optional()
      .describe('Run action="demo_run" in headed Chromium mode'),
    installBrowsers: z
      .boolean()
      .optional()
      .describe('Run "playwright install chromium" before action="demo_run"'),
    dryRun: z
      .boolean()
      .optional()
      .describe('Validate action="demo_run" without launching Playwright'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type BrowserPreviewToolInput = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    ok: z.boolean(),
    action: z.enum(BROWSER_PREVIEW_API_ACTIONS),
    summary: z.string(),
    message: z.string(),
    data: z.unknown(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type BrowserPreviewToolOutput = z.infer<OutputSchema>

export const WebBrowserTool = buildTool({
  name: WEB_BROWSER_TOOL_NAME,
  searchHint: 'open browser previews and generate Playwright demo harnesses',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  userFacingName() {
    return 'BrowserPreview'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly(input: BrowserPreviewToolInput) {
    return isBrowserPreviewApiReadOnly(input.action)
  },
  toAutoClassifierInput(input: BrowserPreviewToolInput) {
    return `BrowserPreview ${input.action}${input.url ? ` ${input.url}` : ''}${input.sessionId ? ` ${input.sessionId}` : ''}`
  },
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  async call(input: BrowserPreviewApiInput) {
    const result = await runBrowserPreviewApiAction(input)
    return {
      data: result,
    }
  },
  mapToolResultToToolResultBlockParam(
    output: BrowserPreviewApiOutput,
    toolUseID,
  ) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `${output.ok ? 'OK' : 'BLOCKED'} ${output.action}\n${output.summary}\n${output.message}\n${JSON.stringify(output.data, null, 2)}`,
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, BrowserPreviewToolOutput>)
