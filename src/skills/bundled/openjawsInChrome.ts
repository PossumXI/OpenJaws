import { BASE_CHROME_PROMPT } from '../../utils/openjawsInChrome/prompt.js'
import { shouldAutoEnableOpenJawsInChrome } from '../../utils/openjawsInChrome/setup.js'
import { CHROME_TOOL_NAMES } from '../../utils/openjawsInChrome/toolNames.js'
import {
  LEGACY_OPENJAWS_IN_CHROME_ALIAS,
  LEGACY_OPENJAWS_IN_CHROME_MCP_NAMESPACE,
} from '../../constants/legacyCompat.js'
import { registerBundledSkill } from '../bundledSkills.js'

const OPENJAWS_IN_CHROME_MCP_TOOLS = CHROME_TOOL_NAMES.map(
  toolName => `${LEGACY_OPENJAWS_IN_CHROME_MCP_NAMESPACE}${toolName}`,
)

const SKILL_ACTIVATION_MESSAGE = `
Now that this skill is invoked, you have access to Chrome browser automation tools. You can now use the legacy Chrome MCP tools to interact with web pages.

IMPORTANT: Start by calling ${LEGACY_OPENJAWS_IN_CHROME_MCP_NAMESPACE}tabs_context_mcp to get information about the user's current browser tabs.
`

export function registerOpenJawsInChromeSkill(): void {
  registerBundledSkill({
    name: 'openjaws-in-chrome',
    aliases: [LEGACY_OPENJAWS_IN_CHROME_ALIAS],
    description:
      'Automates your Chrome browser to interact with web pages - clicking elements, filling forms, capturing screenshots, reading console logs, and navigating sites. Opens pages in new tabs within your existing Chrome session. Requires site-level permissions before executing (configured in the extension).',
    whenToUse:
      'When the user wants to interact with web pages, automate browser tasks, capture screenshots, read console logs, or perform any browser-based actions. Always invoke BEFORE attempting to use the browser MCP tools.',
    allowedTools: OPENJAWS_IN_CHROME_MCP_TOOLS,
    userInvocable: true,
    isEnabled: () => shouldAutoEnableOpenJawsInChrome(),
    async getPromptForCommand(args) {
      let prompt = `${BASE_CHROME_PROMPT}\n${SKILL_ACTIVATION_MESSAGE}`
      if (args) {
        prompt += `\n## Task\n\n${args}`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
