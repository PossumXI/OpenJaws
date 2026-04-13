export const FIRECRAWL_DATASET_SKILL_FILES = {
  'README.md': `# Firecrawl Dataset Skill

This skill turns Firecrawl web discovery/crawl output into a labeled dataset.

Default output layout:

- data/web-datasets/<slug>/records.jsonl
- data/web-datasets/<slug>/sources.jsonl
- data/web-datasets/<slug>/manifest.json
- data/web-datasets/<slug>/dataset-card.md

Use the schema files in ./schemas/ for field expectations.
`,
  'schemas/record.schema.json': `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OpenJaws Firecrawl Record",
  "type": "object",
  "required": [
    "datasetId",
    "recordId",
    "sourceUrl",
    "canonicalUrl",
    "title",
    "sourceType",
    "category",
    "topicLabels",
    "language",
    "fetchedAt",
    "summary"
  ],
  "properties": {
    "datasetId": { "type": "string" },
    "recordId": { "type": "string" },
    "sourceUrl": { "type": "string" },
    "canonicalUrl": { "type": "string" },
    "title": { "type": "string" },
    "sourceType": { "type": "string" },
    "category": { "type": "string" },
    "topicLabels": {
      "type": "array",
      "items": { "type": "string" }
    },
    "language": { "type": "string" },
    "fetchedAt": { "type": "string" },
    "summary": { "type": "string" },
    "markdown": { "type": "string" },
    "text": { "type": "string" },
    "author": { "type": "string" },
    "publishedAt": { "type": "string" },
    "domain": { "type": "string" }
  }
}
`,
  'schemas/source.schema.json': `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OpenJaws Firecrawl Source",
  "type": "object",
  "required": [
    "datasetId",
    "url",
    "canonicalUrl",
    "domain",
    "discoveryMethod",
    "status"
  ],
  "properties": {
    "datasetId": { "type": "string" },
    "url": { "type": "string" },
    "canonicalUrl": { "type": "string" },
    "domain": { "type": "string" },
    "discoveryMethod": { "type": "string" },
    "status": { "type": "string" },
    "contentType": { "type": "string" },
    "fetchedAt": { "type": "string" },
    "notes": { "type": "string" }
  }
}
`,
  'templates/manifest.example.json': `{
  "datasetId": "web-<slug>",
  "createdAt": "2026-04-11T00:00:00.000Z",
  "query": "example topic or URL list",
  "recordCount": 0,
  "sourceCount": 0,
  "categories": {},
  "languages": {},
  "domains": {},
  "files": {
    "records": "records.jsonl",
    "sources": "sources.jsonl",
    "card": "dataset-card.md"
  }
}
`,
} as const

export const FIRECRAWL_DATASET_SKILL_PROMPT = `# Firecrawl Dataset Builder

## Goal
Use the available Firecrawl MCP tools to collect web data, then organize it into a durable dataset instead of leaving the result as one-off crawl output.

## Default behavior
Unless the user explicitly asks for a different location, write the dataset to:

\`data/web-datasets/<slug>/\`

with these files:

- \`records.jsonl\` — one normalized content record per row
- \`sources.jsonl\` — one source/provenance row per crawled URL
- \`manifest.json\` — dataset metadata, counts, labels, domains, files
- \`dataset-card.md\` — concise description of scope, collection method, and caveats

If that directory already exists and is for a different crawl, create a timestamped sibling directory instead of overwriting unrelated data.

## Required workflow
1. Clarify scope from the user request: topic, domains, URLs, freshness, and stop condition.
2. Discover candidate sources with \`firecrawl_search\` unless the user already supplied URLs.
3. Expand within chosen domains with \`firecrawl_map\` or \`firecrawl_crawl\` when deeper coverage is needed.
4. Pull page content with \`firecrawl_scrape\` or \`firecrawl_extract\`.
5. If a crawl is asynchronous, poll with \`firecrawl_check_crawl_status\` until the result is ready or clearly failed.
6. Deduplicate aggressively by canonical URL and skip obvious low-value duplicates.
7. Label every record by category, topic labels, language, and source type.
8. Write the dataset files to disk and verify that the manifest counts match the JSONL row counts.

## Normalization rules
- Keep provenance. Every record must map back to a source row.
- Prefer canonical URLs.
- Store concise summaries in addition to raw text/markdown when available.
- Use stable ids when practical: dataset slug + sequence or URL-derived hash.
- Separate source metadata from extracted content.
- Keep category labels concrete and reviewable, not vague.

## Minimum output fields
For \`records.jsonl\`, include:
- \`datasetId\`
- \`recordId\`
- \`sourceUrl\`
- \`canonicalUrl\`
- \`title\`
- \`sourceType\`
- \`category\`
- \`topicLabels\`
- \`language\`
- \`fetchedAt\`
- \`summary\`

For \`sources.jsonl\`, include:
- \`datasetId\`
- \`url\`
- \`canonicalUrl\`
- \`domain\`
- \`discoveryMethod\`
- \`status\`

## Completion criteria
Do not stop at “crawl succeeded.” Finish only after the dataset files exist on disk, counts reconcile, and the final response tells the user where the dataset was written and what it contains.
`
