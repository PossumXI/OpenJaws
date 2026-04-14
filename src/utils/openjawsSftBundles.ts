import {
  OPENJAWS_SFT_LANGUAGES,
  OPENJAWS_SFT_TAGS,
  type OpenJawsSftLanguage,
  type OpenJawsSftTag,
  type OpenJawsSftPreparationManifest,
  type PreparedOpenJawsSftSample,
} from './openjawsSftPreparation.js'

export type PreparedSampleSplitGroup = {
  all: PreparedOpenJawsSftSample[]
  train: PreparedOpenJawsSftSample[]
  eval: PreparedOpenJawsSftSample[]
}

export type OpenJawsSftBundleFiles = {
  all: string
  train: string
  eval: string
}

export type OpenJawsSftBundleLabelEntry = {
  count: number
  splitCounts: Record<'train' | 'eval', number>
  files: OpenJawsSftBundleFiles
}

export type OpenJawsSftBundleManifest = {
  bundleId: string
  generatedAt: string
  sourcePath: string
  outDir: string
  totalSamples: number
  splitCounts: Record<'train' | 'eval', number>
  tagCounts: Record<OpenJawsSftTag, number>
  languageCounts: Record<OpenJawsSftLanguage, number>
  files: {
    root: OpenJawsSftBundleFiles
    tags: Record<OpenJawsSftTag, OpenJawsSftBundleLabelEntry>
    languages: Record<OpenJawsSftLanguage, OpenJawsSftBundleLabelEntry>
  }
}

function createEmptyTagCounts(): Record<OpenJawsSftTag, number> {
  return {
    coding: 0,
    agentic: 0,
    security: 0,
    general: 0,
  }
}

function createEmptyLanguageCounts(): Record<OpenJawsSftLanguage, number> {
  return {
    typescript: 0,
    javascript: 0,
    python: 0,
    go: 0,
    rust: 0,
    java: 0,
    csharp: 0,
    cpp: 0,
    shell: 0,
    powershell: 0,
    json: 0,
    yaml: 0,
    sql: 0,
    html: 0,
    css: 0,
    unknown: 0,
  }
}

function splitSamples(
  samples: PreparedOpenJawsSftSample[],
): PreparedSampleSplitGroup {
  return {
    all: samples,
    train: samples.filter(sample => sample.split === 'train'),
    eval: samples.filter(sample => sample.split === 'eval'),
  }
}

function getSampleTags(sample: PreparedOpenJawsSftSample): OpenJawsSftTag[] {
  return Array.isArray(sample.tags) && sample.tags.length > 0
    ? sample.tags
    : ['general']
}

function getSampleLanguages(
  sample: PreparedOpenJawsSftSample,
): OpenJawsSftLanguage[] {
  return Array.isArray(sample.languages) && sample.languages.length > 0
    ? sample.languages
    : ['unknown']
}

export function groupPreparedSamplesByTag(
  samples: PreparedOpenJawsSftSample[],
): Record<OpenJawsSftTag, PreparedSampleSplitGroup> {
  return Object.fromEntries(
    OPENJAWS_SFT_TAGS.map(tag => [
      tag,
      splitSamples(samples.filter(sample => getSampleTags(sample).includes(tag))),
    ]),
  ) as Record<OpenJawsSftTag, PreparedSampleSplitGroup>
}

export function groupPreparedSamplesByLanguage(
  samples: PreparedOpenJawsSftSample[],
): Record<OpenJawsSftLanguage, PreparedSampleSplitGroup> {
  return Object.fromEntries(
    OPENJAWS_SFT_LANGUAGES.map(language => [
      language,
      splitSamples(
        samples.filter(sample => getSampleLanguages(sample).includes(language)),
      ),
    ]),
  ) as Record<OpenJawsSftLanguage, PreparedSampleSplitGroup>
}

export function summarizePreparedOpenJawsSftSamples(
  samples: PreparedOpenJawsSftSample[],
): OpenJawsSftPreparationManifest {
  const splitCounts: Record<'train' | 'eval', number> = {
    train: 0,
    eval: 0,
  }
  const tagCounts = createEmptyTagCounts()
  const languageCounts = createEmptyLanguageCounts()

  for (const sample of samples) {
    splitCounts[sample.split]++
    for (const tag of getSampleTags(sample)) {
      tagCounts[tag]++
    }
    for (const language of getSampleLanguages(sample)) {
      languageCounts[language]++
    }
  }

  return {
    totalInputSamples: samples.length,
    dedupedSamples: samples.length,
    droppedDuplicates: 0,
    splitCounts,
    tagCounts,
    languageCounts,
  }
}

function buildLabelEntry(
  kind: 'tags' | 'languages',
  label: string,
  group: PreparedSampleSplitGroup,
): OpenJawsSftBundleLabelEntry {
  return {
    count: group.all.length,
    splitCounts: {
      train: group.train.length,
      eval: group.eval.length,
    },
    files: {
      all: `${kind}/${label}/all.jsonl`,
      train: `${kind}/${label}/train.jsonl`,
      eval: `${kind}/${label}/eval.jsonl`,
    },
  }
}

export function buildOpenJawsSftBundleManifest({
  bundleId,
  sourcePath,
  outDir,
  preparedManifest,
  samples,
}: {
  bundleId: string
  sourcePath: string
  outDir: string
  preparedManifest?: OpenJawsSftPreparationManifest
  samples: PreparedOpenJawsSftSample[]
}): OpenJawsSftBundleManifest {
  const resolvedManifest =
    preparedManifest ?? summarizePreparedOpenJawsSftSamples(samples)
  const tags = groupPreparedSamplesByTag(samples)
  const languages = groupPreparedSamplesByLanguage(samples)

  return {
    bundleId,
    generatedAt: new Date().toISOString(),
    sourcePath,
    outDir,
    totalSamples: samples.length,
    splitCounts: resolvedManifest.splitCounts,
    tagCounts: resolvedManifest.tagCounts,
    languageCounts: resolvedManifest.languageCounts,
    files: {
      root: {
        all: 'all.jsonl',
        train: 'train.jsonl',
        eval: 'eval.jsonl',
      },
      tags: Object.fromEntries(
        OPENJAWS_SFT_TAGS.map(tag => [tag, buildLabelEntry('tags', tag, tags[tag])]),
      ) as Record<OpenJawsSftTag, OpenJawsSftBundleLabelEntry>,
      languages: Object.fromEntries(
        OPENJAWS_SFT_LANGUAGES.map(language => [
          language,
          buildLabelEntry('languages', language, languages[language]),
        ]),
      ) as Record<OpenJawsSftLanguage, OpenJawsSftBundleLabelEntry>,
    },
  }
}
