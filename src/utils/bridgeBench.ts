import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { resolve } from 'path'
import type {
  OpenJawsSftBundleLabelEntry,
  OpenJawsSftBundleManifest,
} from './openjawsSftBundles.js'
import type { OpenJawsSftTag } from './openjawsSftPreparation.js'

export const Q_BRIDGEBENCH_PACKS = [
  'all',
  'coding',
  'agentic',
  'security',
  'general',
] as const

export type QBridgeBenchPack = (typeof Q_BRIDGEBENCH_PACKS)[number]

export type QBridgeBenchPackDefinition = {
  pack: QBridgeBenchPack
  label: string
  description: string
  tag: OpenJawsSftTag | null
}

export type QBridgeBenchResolvedPack = {
  pack: QBridgeBenchPack
  label: string
  description: string
  trainFile: string
  evalFile: string
  allFile: string
  count: number
  splitCounts: Record<'train' | 'eval', number>
}

export type QBridgeBenchMetrics = {
  evalLoss: number | null
  evalMeanTokenAccuracy: number | null
  evalEntropy: number | null
  evalRuntimeSeconds: number | null
  trainLoss: number | null
  trainRuntimeSeconds: number | null
}

const PACK_DEFINITIONS: ReadonlyArray<QBridgeBenchPackDefinition> = [
  {
    pack: 'all',
    label: 'All',
    description: 'All audited Q samples combined into one local benchmark pack.',
    tag: null,
  },
  {
    pack: 'coding',
    label: 'Coding',
    description: 'Audited coding-heavy Q samples.',
    tag: 'coding',
  },
  {
    pack: 'agentic',
    label: 'Agentic',
    description: 'Audited agentic tool- and orchestration-heavy Q samples.',
    tag: 'agentic',
  },
  {
    pack: 'security',
    label: 'Security',
    description: 'Audited security review and hardening Q samples.',
    tag: 'security',
  },
  {
    pack: 'general',
    label: 'General',
    description: 'Audited general-purpose Q samples outside the stronger specializations.',
    tag: 'general',
  },
] as const

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resolvePackEntry(
  manifest: OpenJawsSftBundleManifest,
  pack: QBridgeBenchPack,
): OpenJawsSftBundleLabelEntry | { files: OpenJawsSftBundleManifest['files']['root']; count: number; splitCounts: Record<'train' | 'eval', number> } {
  if (pack === 'all') {
    return {
      files: manifest.files.root,
      count: manifest.totalSamples,
      splitCounts: manifest.splitCounts,
    }
  }

  return manifest.files.tags[pack]
}

export function getQBridgeBenchPackDefinitions(): readonly QBridgeBenchPackDefinition[] {
  return PACK_DEFINITIONS
}

export function getDefaultQBridgeBenchPacks(): QBridgeBenchPack[] {
  return ['all', 'coding', 'agentic', 'security']
}

export function resolveDefaultQBridgeBenchBundleDir(root = process.cwd()): string {
  const explicitDefault = resolve(root, 'data', 'sft', 'audited-v2')
  if (existsSync(resolve(explicitDefault, 'bundle-manifest.json'))) {
    return explicitDefault
  }

  const auditedArtifactsRoot = resolve(root, 'artifacts')
  try {
    const candidates = readdirSync(auditedArtifactsRoot, { withFileTypes: true })
      .filter(
        entry =>
          entry.isDirectory() &&
          /^q-benchmark-audited-/i.test(entry.name) &&
          existsSync(resolve(auditedArtifactsRoot, entry.name, 'bundle-manifest.json')),
      )
      .map(entry => {
        const fullPath = resolve(auditedArtifactsRoot, entry.name)
        let mtimeMs = 0
        try {
          mtimeMs = statSync(resolve(fullPath, 'bundle-manifest.json')).mtimeMs
        } catch {
          mtimeMs = 0
        }
        return {
          fullPath,
          mtimeMs,
        }
      })
      .sort(
        (left, right) =>
          right.mtimeMs - left.mtimeMs || right.fullPath.localeCompare(left.fullPath),
      )

    if (candidates[0]?.fullPath) {
      return candidates[0].fullPath
    }
  } catch {
    // fall through to stable legacy path
  }

  return explicitDefault
}

export function loadQBridgeBenchBundleManifest(
  bundleDir: string,
): OpenJawsSftBundleManifest {
  const manifestPath = resolve(bundleDir, 'bundle-manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Bundle manifest not found at ${manifestPath}. Re-run bun run prepare:sft or bun run audit:sft first.`,
    )
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as OpenJawsSftBundleManifest
}

export function resolveQBridgeBenchPack(args: {
  bundleDir: string
  manifest: OpenJawsSftBundleManifest
  pack: QBridgeBenchPack
}): QBridgeBenchResolvedPack {
  const definition = PACK_DEFINITIONS.find(entry => entry.pack === args.pack)
  if (!definition) {
    throw new Error(`Unknown Q BridgeBench pack "${args.pack}".`)
  }

  const entry = resolvePackEntry(args.manifest, args.pack)
  return {
    pack: definition.pack,
    label: definition.label,
    description: definition.description,
    allFile: resolve(args.bundleDir, entry.files.all),
    trainFile: resolve(args.bundleDir, entry.files.train),
    evalFile: resolve(args.bundleDir, entry.files.eval),
    count: entry.count,
    splitCounts: entry.splitCounts,
  }
}

export function extractQBridgeBenchMetrics(
  metricsSummary: Record<string, unknown> | null | undefined,
): QBridgeBenchMetrics {
  const latestTrainMetrics = isObjectRecord(metricsSummary?.latest_train_metrics)
    ? metricsSummary.latest_train_metrics
    : null
  const latestEvalMetrics = isObjectRecord(metricsSummary?.latest_eval_metrics)
    ? metricsSummary.latest_eval_metrics
    : null

  return {
    evalLoss: latestEvalMetrics ? readOptionalNumber(latestEvalMetrics, 'eval_loss') : null,
    evalMeanTokenAccuracy: latestEvalMetrics
      ? readOptionalNumber(latestEvalMetrics, 'eval_mean_token_accuracy')
      : null,
    evalEntropy: latestEvalMetrics
      ? readOptionalNumber(latestEvalMetrics, 'eval_entropy')
      : null,
    evalRuntimeSeconds: latestEvalMetrics
      ? readOptionalNumber(latestEvalMetrics, 'eval_runtime')
      : null,
    trainLoss: latestTrainMetrics ? readOptionalNumber(latestTrainMetrics, 'train_loss') : null,
    trainRuntimeSeconds: latestTrainMetrics
      ? readOptionalNumber(latestTrainMetrics, 'train_runtime')
      : null,
  }
}

export function computeQBridgeBenchScore(
  metrics: QBridgeBenchMetrics,
): number | null {
  if (metrics.evalMeanTokenAccuracy === null) {
    return null
  }
  return Math.round(metrics.evalMeanTokenAccuracy * 10_000) / 100
}

export function summarizeQBridgeBenchOutcome(args: {
  pack: QBridgeBenchResolvedPack
  metrics: QBridgeBenchMetrics
  score: number | null
}): string {
  const accuracy =
    args.metrics.evalMeanTokenAccuracy !== null
      ? `${(args.metrics.evalMeanTokenAccuracy * 100).toFixed(2)}% mean token accuracy`
      : null
  const loss =
    args.metrics.evalLoss !== null
      ? `eval loss ${args.metrics.evalLoss.toFixed(4)}`
      : null
  const primary = accuracy ?? loss ?? 'metrics unavailable'
  const score =
    args.score !== null ? `score ${args.score.toFixed(2)}` : null
  return [
    `${args.pack.label} pack`,
    primary,
    score,
    `${args.pack.splitCounts.eval} eval sample${args.pack.splitCounts.eval === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')
}
