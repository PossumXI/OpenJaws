import { describe, expect, it } from 'bun:test'
import {
  FIRECRAWL_DATASET_SKILL_FILES,
  FIRECRAWL_DATASET_SKILL_PROMPT,
} from './firecrawlDatasetContent.js'

describe('firecrawl dataset bundled skill', () => {
  it('defines a dataset-oriented prompt and file templates', () => {
    expect(FIRECRAWL_DATASET_SKILL_PROMPT).toContain('data/web-datasets/<slug>/')
    expect(FIRECRAWL_DATASET_SKILL_PROMPT).toContain('firecrawl_search')
    expect(FIRECRAWL_DATASET_SKILL_PROMPT).toContain('manifest counts match the JSONL row counts')
    expect(FIRECRAWL_DATASET_SKILL_FILES['README.md']).toContain('records.jsonl')
    expect(FIRECRAWL_DATASET_SKILL_FILES['schemas/record.schema.json']).toContain('"recordId"')
    expect(FIRECRAWL_DATASET_SKILL_FILES['schemas/source.schema.json']).toContain('"discoveryMethod"')
  })
})
