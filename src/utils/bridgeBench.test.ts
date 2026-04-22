import { describe, expect, it } from 'bun:test'
import {
  computeQBridgeBenchScore,
  extractQBridgeBenchMetrics,
  getDefaultQBridgeBenchPacks,
  resolveDefaultQBridgeBenchBundleDir,
  resolveQBridgeBenchPack,
  summarizeQBridgeBenchOutcome,
  type QBridgeBenchResolvedPack,
} from './bridgeBench.js'
import type { OpenJawsSftBundleManifest } from './openjawsSftBundles.js'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const manifest: OpenJawsSftBundleManifest = {
  bundleId: 'bundle-demo',
  generatedAt: '2026-04-14T15:00:00.000Z',
  sourcePath: 'D:\\openjaws\\OpenJaws\\data\\sft\\openjaws-q.jsonl',
  outDir: 'D:\\openjaws\\OpenJaws\\data\\sft\\audited-demo',
  totalSamples: 6,
  splitCounts: {
    train: 4,
    eval: 2,
  },
  tagCounts: {
    coding: 3,
    agentic: 2,
    security: 2,
    general: 1,
  },
  languageCounts: {
    typescript: 2,
    javascript: 0,
    python: 2,
    go: 0,
    rust: 0,
    java: 0,
    csharp: 0,
    cpp: 0,
    shell: 1,
    powershell: 0,
    json: 0,
    yaml: 0,
    sql: 1,
    html: 0,
    css: 0,
    unknown: 0,
  },
  files: {
    root: {
      all: 'all.jsonl',
      train: 'train.jsonl',
      eval: 'eval.jsonl',
    },
    tags: {
      coding: {
        count: 3,
        splitCounts: { train: 2, eval: 1 },
        files: {
          all: 'tags/coding/all.jsonl',
          train: 'tags/coding/train.jsonl',
          eval: 'tags/coding/eval.jsonl',
        },
      },
      agentic: {
        count: 2,
        splitCounts: { train: 1, eval: 1 },
        files: {
          all: 'tags/agentic/all.jsonl',
          train: 'tags/agentic/train.jsonl',
          eval: 'tags/agentic/eval.jsonl',
        },
      },
      security: {
        count: 2,
        splitCounts: { train: 1, eval: 1 },
        files: {
          all: 'tags/security/all.jsonl',
          train: 'tags/security/train.jsonl',
          eval: 'tags/security/eval.jsonl',
        },
      },
      general: {
        count: 1,
        splitCounts: { train: 1, eval: 0 },
        files: {
          all: 'tags/general/all.jsonl',
          train: 'tags/general/train.jsonl',
          eval: 'tags/general/eval.jsonl',
        },
      },
    },
    languages: {
      typescript: {
        count: 2,
        splitCounts: { train: 1, eval: 1 },
        files: {
          all: 'languages/typescript/all.jsonl',
          train: 'languages/typescript/train.jsonl',
          eval: 'languages/typescript/eval.jsonl',
        },
      },
      javascript: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/javascript/all.jsonl',
          train: 'languages/javascript/train.jsonl',
          eval: 'languages/javascript/eval.jsonl',
        },
      },
      python: {
        count: 2,
        splitCounts: { train: 1, eval: 1 },
        files: {
          all: 'languages/python/all.jsonl',
          train: 'languages/python/train.jsonl',
          eval: 'languages/python/eval.jsonl',
        },
      },
      go: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/go/all.jsonl',
          train: 'languages/go/train.jsonl',
          eval: 'languages/go/eval.jsonl',
        },
      },
      rust: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/rust/all.jsonl',
          train: 'languages/rust/train.jsonl',
          eval: 'languages/rust/eval.jsonl',
        },
      },
      java: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/java/all.jsonl',
          train: 'languages/java/train.jsonl',
          eval: 'languages/java/eval.jsonl',
        },
      },
      csharp: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/csharp/all.jsonl',
          train: 'languages/csharp/train.jsonl',
          eval: 'languages/csharp/eval.jsonl',
        },
      },
      cpp: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/cpp/all.jsonl',
          train: 'languages/cpp/train.jsonl',
          eval: 'languages/cpp/eval.jsonl',
        },
      },
      shell: {
        count: 1,
        splitCounts: { train: 1, eval: 0 },
        files: {
          all: 'languages/shell/all.jsonl',
          train: 'languages/shell/train.jsonl',
          eval: 'languages/shell/eval.jsonl',
        },
      },
      powershell: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/powershell/all.jsonl',
          train: 'languages/powershell/train.jsonl',
          eval: 'languages/powershell/eval.jsonl',
        },
      },
      json: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/json/all.jsonl',
          train: 'languages/json/train.jsonl',
          eval: 'languages/json/eval.jsonl',
        },
      },
      yaml: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/yaml/all.jsonl',
          train: 'languages/yaml/train.jsonl',
          eval: 'languages/yaml/eval.jsonl',
        },
      },
      sql: {
        count: 1,
        splitCounts: { train: 1, eval: 0 },
        files: {
          all: 'languages/sql/all.jsonl',
          train: 'languages/sql/train.jsonl',
          eval: 'languages/sql/eval.jsonl',
        },
      },
      html: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/html/all.jsonl',
          train: 'languages/html/train.jsonl',
          eval: 'languages/html/eval.jsonl',
        },
      },
      css: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/css/all.jsonl',
          train: 'languages/css/train.jsonl',
          eval: 'languages/css/eval.jsonl',
        },
      },
      unknown: {
        count: 0,
        splitCounts: { train: 0, eval: 0 },
        files: {
          all: 'languages/unknown/all.jsonl',
          train: 'languages/unknown/train.jsonl',
          eval: 'languages/unknown/eval.jsonl',
        },
      },
    },
  },
}

describe('bridgeBench', () => {
  it('returns the default benchmark packs in stable order', () => {
    expect(getDefaultQBridgeBenchPacks()).toEqual([
      'all',
      'coding',
      'agentic',
      'security',
    ])
  })

  it('resolves root and tag-backed benchmark packs from the bundle manifest', () => {
    const rootPack = resolveQBridgeBenchPack({
      bundleDir: 'D:\\openjaws\\OpenJaws\\data\\sft\\audited-demo',
      manifest,
      pack: 'all',
    })
    const codingPack = resolveQBridgeBenchPack({
      bundleDir: 'D:\\openjaws\\OpenJaws\\data\\sft\\audited-demo',
      manifest,
      pack: 'coding',
    })

    expect(rootPack.evalFile).toBe(
      'D:\\openjaws\\OpenJaws\\data\\sft\\audited-demo\\eval.jsonl',
    )
    expect(rootPack.splitCounts.eval).toBe(2)
    expect(codingPack.evalFile).toBe(
      'D:\\openjaws\\OpenJaws\\data\\sft\\audited-demo\\tags\\coding\\eval.jsonl',
    )
    expect(codingPack.splitCounts.eval).toBe(1)
  })

  it('extracts benchmark metrics and derives a readable accuracy score', () => {
    const metrics = extractQBridgeBenchMetrics({
      latest_train_metrics: {
        train_loss: 2.5,
        train_runtime: 120.5,
      },
      latest_eval_metrics: {
        eval_loss: 1.25,
        eval_mean_token_accuracy: 0.8125,
        eval_entropy: 0.33,
        eval_runtime: 5.2,
      },
    })

    expect(metrics).toEqual({
      evalLoss: 1.25,
      evalMeanTokenAccuracy: 0.8125,
      evalEntropy: 0.33,
      evalRuntimeSeconds: 5.2,
      trainLoss: 2.5,
      trainRuntimeSeconds: 120.5,
    })
    expect(computeQBridgeBenchScore(metrics)).toBe(81.25)
  })

  it('builds a readable benchmark outcome summary', () => {
    const pack: QBridgeBenchResolvedPack = resolveQBridgeBenchPack({
      bundleDir: 'D:\\openjaws\\OpenJaws\\data\\sft\\audited-demo',
      manifest,
      pack: 'security',
    })

    expect(
      summarizeQBridgeBenchOutcome({
        pack,
        metrics: {
          evalLoss: 0.9,
          evalMeanTokenAccuracy: 0.74,
          evalEntropy: 0.31,
          evalRuntimeSeconds: 2.2,
          trainLoss: null,
          trainRuntimeSeconds: null,
        },
        score: 74,
      }),
    ).toBe(
      'Security pack · 74.00% mean token accuracy · score 74.00 · 1 eval sample',
    )
  })

  it('prefers the freshest audited artifact bundle when the legacy default is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-bridgebench-bundle-'))
    try {
      const older = join(root, 'artifacts', 'q-benchmark-audited-20260421')
      const newer = join(root, 'artifacts', 'q-benchmark-audited-20260422')
      mkdirSync(older, { recursive: true })
      mkdirSync(newer, { recursive: true })
      writeFileSync(join(older, 'bundle-manifest.json'), '{}', 'utf8')
      writeFileSync(join(newer, 'bundle-manifest.json'), '{}', 'utf8')

      expect(resolveDefaultQBridgeBenchBundleDir(root)).toBe(newer)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
