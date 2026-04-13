import type { OpenJawsSftSample } from './openjawsSftDataset.js'
import type { PreparedOpenJawsSftSample } from './openjawsSftPreparation.js'

export type OpenJawsSftQualityIssueCode =
  | 'exact_literal_mismatch'
  | 'literal_prompt_identity_leak'

export type OpenJawsSftQualityIssue = {
  code: OpenJawsSftQualityIssueCode
  severity: 'drop' | 'warning'
  message: string
}

export type OpenJawsSftAuditSummary = {
  totalSamples: number
  samplesWithIssues: number
  droppedSamples: number
  issueCounts: Record<OpenJawsSftQualityIssueCode, number>
}

const IDENTITY_LEAK_PATTERNS = [
  "i'm openjaws",
  'command-line interface',
  'how can i assist you today',
]

function normalizeLoose(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeExact(text: string): string {
  return text.replace(/\r\n/g, '\n').trim()
}

function isQuotedLiteral(rawTarget: string): boolean {
  return /^["'`].+["'`]$/.test(rawTarget.trim())
}

function isTokenLikeLiteral(target: string): boolean {
  return /^[A-Z0-9_./:\\-]+$/.test(target)
}

function extractExactLiteralTarget(prompt: string): string | null {
  const exactMatch = prompt.match(
    /\b(?:reply|respond|return|answer)\s+with\s+exactly\s+(.+?)\s+and\s+nothing\s+else\b/i,
  )
  if (!exactMatch?.[1]) {
    return null
  }

  const rawTarget = exactMatch[1].trim()
  const normalizedTarget = rawTarget.replace(/^["'`]+|["'`]+$/g, '')

  if (isQuotedLiteral(rawTarget) || isTokenLikeLiteral(normalizedTarget)) {
    return normalizedTarget
  }

  return null
}

export function detectOpenJawsSftQualityIssues(
  sample: OpenJawsSftSample,
): OpenJawsSftQualityIssue[] {
  const prompt = normalizeExact(sample.messages[0].content)
  const assistant = normalizeExact(sample.messages[1].content)
  const assistantLoose = normalizeLoose(assistant)
  const issues: OpenJawsSftQualityIssue[] = []

  const exactLiteral = extractExactLiteralTarget(prompt)
  if (exactLiteral !== null && assistant !== exactLiteral) {
    issues.push({
      code: 'exact_literal_mismatch',
      severity: 'drop',
      message: `Expected exact literal "${exactLiteral}" but got "${assistant}"`,
    })
  }

  if (
    exactLiteral !== null &&
    IDENTITY_LEAK_PATTERNS.some(pattern => assistantLoose.includes(pattern))
  ) {
    issues.push({
      code: 'literal_prompt_identity_leak',
      severity: 'warning',
      message: 'Literal-response prompt drifted into assistant self-introduction text.',
    })
  }

  return issues
}

export function auditOpenJawsSftSamples(
  samples: OpenJawsSftSample[],
): {
  summary: OpenJawsSftAuditSummary
  results: Array<{
    sample: OpenJawsSftSample
    issues: OpenJawsSftQualityIssue[]
  }>
} {
  const issueCounts: Record<OpenJawsSftQualityIssueCode, number> = {
    exact_literal_mismatch: 0,
    literal_prompt_identity_leak: 0,
  }
  let samplesWithIssues = 0
  let droppedSamples = 0

  const results = samples.map(sample => {
    const issues = detectOpenJawsSftQualityIssues(sample)
    if (issues.length > 0) {
      samplesWithIssues++
    }
    if (issues.some(issue => issue.severity === 'drop')) {
      droppedSamples++
    }
    for (const issue of issues) {
      issueCounts[issue.code]++
    }
    return { sample, issues }
  })

  return {
    summary: {
      totalSamples: samples.length,
      samplesWithIssues,
      droppedSamples,
      issueCounts,
    },
    results,
  }
}

export function filterCleanPreparedOpenJawsSftSamples(
  samples: PreparedOpenJawsSftSample[],
): PreparedOpenJawsSftSample[] {
  return samples.filter(
    sample =>
      !detectOpenJawsSftQualityIssues(sample).some(
        issue => issue.severity === 'drop',
      ),
  )
}
