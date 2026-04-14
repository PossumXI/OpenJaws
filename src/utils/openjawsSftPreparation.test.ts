import { describe, expect, it } from 'bun:test'
import {
  buildOpenJawsSftSignature,
  inferOpenJawsSftLanguages,
  inferOpenJawsSftTags,
  prepareOpenJawsSftDataset,
  splitOpenJawsSftSample,
} from './openjawsSftPreparation.js'
import type { OpenJawsSftSample } from './openjawsSftDataset.js'

function sample(
  user: string,
  assistant: string,
  cwd = 'D:\\openjaws\\OpenJaws',
): OpenJawsSftSample {
  return {
    messages: [
      { role: 'user', content: user },
      { role: 'assistant', content: assistant },
    ],
    metadata: {
      sessionId: 'session-1',
      cwd,
      transcriptPath: 'D:\\sessions\\demo.jsonl',
      userTimestamp: null,
      assistantTimestamp: null,
      assistantModel: 'q',
      isSidechain: false,
    },
  }
}

describe('inferOpenJawsSftTags', () => {
  it('tags coding and agentic tool-use samples', () => {
    expect(
      inferOpenJawsSftTags(
        sample(
          'Use Bash to inspect src/auth.ts and fix the bug.',
          'I used Bash, found the auth bug, and patched auth.ts.',
        ),
      ),
    ).toEqual(['coding', 'agentic', 'security'])
  })

  it('tags security-focused samples', () => {
    expect(
      inferOpenJawsSftTags(
        sample(
          'Review this token validation path for security bugs.',
          'The auth token check is vulnerable to replay and secret leakage.',
        ),
      ),
    ).toEqual(['coding', 'security'])
  })

  it('falls back to general when no stronger class applies', () => {
    expect(
      inferOpenJawsSftTags(sample('Summarize the plan.', 'Three next steps.')),
    ).toEqual(['general'])
  })
})

describe('inferOpenJawsSftLanguages', () => {
  it('detects multiple languages when the sample spans code and shell work', () => {
    expect(
      inferOpenJawsSftLanguages(
        sample(
          'Use Bash to run npm test and patch src/app.ts.',
          '```ts\nexport const value: string = "ok"\n```\n```bash\nnpm test\n```',
        ),
      ),
    ).toEqual(['typescript', 'shell'])
  })

  it('detects python samples from fenced code and file hints', () => {
    expect(
      inferOpenJawsSftLanguages(
        sample(
          'Review the parser in parser.py.',
          '```python\ndef parse_value(raw: str) -> str:\n    return raw.strip()\n```',
        ),
      ),
    ).toEqual(['python'])
  })
})

describe('prepareOpenJawsSftDataset', () => {
  it('dedupes identical pairs and records split/tag counts', () => {
    const coding = sample(
      'Use Bash to inspect src/auth.ts and fix the bug.',
      'I used Bash and fixed src/auth.ts.',
    )
    const general = sample('Summarize the plan.', 'Three next steps.')
    const { samples, manifest } = prepareOpenJawsSftDataset([
      coding,
      coding,
      general,
    ])

    expect(samples).toHaveLength(2)
    expect(manifest).toEqual({
      totalInputSamples: 3,
      dedupedSamples: 2,
      droppedDuplicates: 1,
      splitCounts: {
        train: samples.filter(sample => sample.split === 'train').length,
        eval: samples.filter(sample => sample.split === 'eval').length,
      },
      tagCounts: {
        coding: 1,
        agentic: 1,
        security: 1,
        general: 1,
      },
      languageCounts: {
        typescript: 1,
        javascript: 0,
        python: 0,
        go: 0,
        rust: 0,
        java: 0,
        csharp: 0,
        cpp: 0,
        shell: 1,
        powershell: 0,
        json: 0,
        yaml: 0,
        sql: 0,
        html: 0,
        css: 0,
        unknown: 1,
      },
    })
  })

  it('builds stable signatures and splits', () => {
    const first = sample('Review security/auth path.', 'Found token bug.')
    const second = sample('Review security/auth path.', 'Found token bug.')

    expect(buildOpenJawsSftSignature(first)).toBe(
      buildOpenJawsSftSignature(second),
    )
    expect(splitOpenJawsSftSample(first, 0.2)).toBe(
      splitOpenJawsSftSample(second, 0.2),
    )
  })
})
