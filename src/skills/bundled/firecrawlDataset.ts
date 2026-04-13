import { registerBundledSkill } from '../bundledSkills.js'
import {
  FIRECRAWL_DATASET_SKILL_FILES,
  FIRECRAWL_DATASET_SKILL_PROMPT,
} from './firecrawlDatasetContent.js'

export function registerFirecrawlDatasetSkill(): void {
  registerBundledSkill({
    name: 'firecrawl-dataset',
    description:
      'Collect web data with Firecrawl MCP tools and write it as a labeled dataset with records, sources, and a manifest.',
    whenToUse:
      'Use when the user wants web research turned into a reusable dataset instead of a one-off summary or scrape.',
    argumentHint: '<topic, query, URLs, or domain scope>',
    userInvocable: true,
    files: FIRECRAWL_DATASET_SKILL_FILES,
    allowedTools: [
      'firecrawl_search',
      'firecrawl_scrape',
      'firecrawl_map',
      'firecrawl_crawl',
      'firecrawl_check_crawl_status',
      'firecrawl_extract',
      'Read',
      'Write',
      'Edit',
      'MultiEdit',
      'Glob',
      'Grep',
      'Bash',
    ],
    async getPromptForCommand(args) {
      const parts = [FIRECRAWL_DATASET_SKILL_PROMPT]
      if (args.trim()) {
        parts.push(`## User request\n\n${args.trim()}`)
      }
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  })
}
