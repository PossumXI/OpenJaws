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

function splitSamples(
  samples: PreparedOpenJawsSftSample[],
): PreparedSampleSplitGroup {
  return {
    all: samples,
    train: samples.filter(sample => sample.split === 'train'),
    eval: samples.filter(sample => sample.split === 'eval'),
  }
}

export function groupPreparedSamplesByTag(
  samples: PreparedOpenJawsSftSample[],
): Record<OpenJawsSftTag, PreparedSampleSplitGroup> {
  return Object.fromEntries(
    OPENJAWS_SFT_TAGS.map(tag => [
      tag,
      splitSamples(samples.filter(sample => sample.tags.includes(tag))),
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
        samples.filter(sample => sample.languages.includes(language)),
      ),
    ]),
  ) as Record<OpenJawsSftLanguage, PreparedSampleSplitGroup>
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
  preparedManifest: OpenJawsSftPreparationManifest
  samples: PreparedOpenJawsSftSample[]
}): OpenJawsSftBundleManifest {
  const tags = groupPreparedSamplesByTag(samples)
  const languages = groupPreparedSamplesByLanguage(samples)

  return {
    bundleId,
    generatedAt: new Date().toISOString(),
    sourcePath,
    outDir,
    totalSamples: samples.length,
    splitCounts: preparedManifest.splitCounts,
    tagCounts: preparedManifest.tagCounts,
    languageCounts: preparedManifest.languageCounts,
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
