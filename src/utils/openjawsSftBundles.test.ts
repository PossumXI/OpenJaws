import { describe, expect, it } from 'bun:test'
import {
  buildOpenJawsSftBundleManifest,
  groupPreparedSamplesByLanguage,
  groupPreparedSamplesByTag,
  summarizePreparedOpenJawsSftSamples,
} from './openjawsSftBundles.js'
import type { PreparedOpenJawsSftSample } from './openjawsSftPreparation.js'

function sample(
  tags: PreparedOpenJawsSftSample['tags'],
  languages: PreparedOpenJawsSftSample['languages'],
  split: PreparedOpenJawsSftSample['split'],
): PreparedOpenJawsSftSample {
  return {
    messages: [
      { role: 'user', content: 'inspect' },
      { role: 'assistant', content: 'patched' },
    ],
    metadata: {
      sessionId: 'session-1',
      cwd: 'D:\\openjaws\\OpenJaws',
      transcriptPath: 'D:\\sessions\\demo.jsonl',
      userTimestamp: null,
      assistantTimestamp: null,
      assistantModel: 'q',
      isSidechain: false,
    },
    tags,
    languages,
    split,
    signature: `${tags.join('-')}-${languages.join('-')}-${split}`,
  }
}

describe('openjaws SFT bundles', () => {
  const samples = [
    sample(['coding', 'agentic'], ['typescript', 'shell'], 'train'),
    sample(['coding', 'security'], ['python'], 'eval'),
    sample(['general'], ['unknown'], 'train'),
  ]

  it('groups samples by tag and split', () => {
    const groups = groupPreparedSamplesByTag(samples)
    expect(groups.coding.all).toHaveLength(2)
    expect(groups.coding.train).toHaveLength(1)
    expect(groups.coding.eval).toHaveLength(1)
    expect(groups.general.all).toHaveLength(1)
  })

  it('groups samples by language and split', () => {
    const groups = groupPreparedSamplesByLanguage(samples)
    expect(groups.typescript.all).toHaveLength(1)
    expect(groups.shell.all).toHaveLength(1)
    expect(groups.python.eval).toHaveLength(1)
    expect(groups.unknown.train).toHaveLength(1)
  })

  it('builds a bundle manifest with root and label file mappings', () => {
    const manifest = buildOpenJawsSftBundleManifest({
      bundleId: 'bundle-demo',
      sourcePath: 'D:\\openjaws\\OpenJaws\\data\\sft\\openjaws-q.jsonl',
      outDir: 'D:\\openjaws\\OpenJaws\\data\\sft\\prepared-demo',
      samples,
      preparedManifest: {
        totalInputSamples: 3,
        dedupedSamples: 3,
        droppedDuplicates: 0,
        splitCounts: {
          train: 2,
          eval: 1,
        },
        tagCounts: {
          coding: 2,
          agentic: 1,
          security: 1,
          general: 1,
        },
        languageCounts: {
          typescript: 1,
          javascript: 0,
          python: 1,
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
      },
    })

    expect(manifest.files.root.train).toBe('train.jsonl')
    expect(manifest.files.tags.coding.files.all).toBe('tags/coding/all.jsonl')
    expect(manifest.files.languages.python.files.eval).toBe(
      'languages/python/eval.jsonl',
    )
  })

  it('can summarize prepared samples without a separate preparation manifest', () => {
    const manifest = summarizePreparedOpenJawsSftSamples(samples)

    expect(manifest).toEqual({
      totalInputSamples: 3,
      dedupedSamples: 3,
      droppedDuplicates: 0,
      splitCounts: {
        train: 2,
        eval: 1,
      },
      tagCounts: {
        coding: 2,
        agentic: 1,
        security: 1,
        general: 1,
      },
      languageCounts: {
        typescript: 1,
        javascript: 0,
        python: 1,
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

  it('builds a bundle manifest from samples alone when no preparation manifest is passed', () => {
    const manifest = buildOpenJawsSftBundleManifest({
      bundleId: 'bundle-derived',
      sourcePath: 'D:\\openjaws\\OpenJaws\\data\\sft\\openjaws-q.jsonl',
      outDir: 'D:\\openjaws\\OpenJaws\\data\\sft\\audited-demo',
      samples,
    })

    expect(manifest.splitCounts).toEqual({
      train: 2,
      eval: 1,
    })
    expect(manifest.tagCounts.coding).toBe(2)
    expect(manifest.languageCounts.python).toBe(1)
  })
})
