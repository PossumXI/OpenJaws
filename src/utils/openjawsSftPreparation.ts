import type { OpenJawsSftSample } from './openjawsSftDataset.js'

export const OPENJAWS_SFT_TAGS = [
  'coding',
  'agentic',
  'security',
  'general',
] as const

export type OpenJawsSftTag = (typeof OPENJAWS_SFT_TAGS)[number]

export const OPENJAWS_SFT_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'csharp',
  'cpp',
  'shell',
  'powershell',
  'json',
  'yaml',
  'sql',
  'html',
  'css',
  'unknown',
] as const

export type OpenJawsSftLanguage =
  (typeof OPENJAWS_SFT_LANGUAGES)[number]

export type PreparedOpenJawsSftSample = OpenJawsSftSample & {
  tags: OpenJawsSftTag[]
  languages: OpenJawsSftLanguage[]
  split: 'train' | 'eval'
  signature: string
}

export type OpenJawsSftPreparationManifest = {
  totalInputSamples: number
  dedupedSamples: number
  droppedDuplicates: number
  splitCounts: Record<'train' | 'eval', number>
  tagCounts: Record<OpenJawsSftTag, number>
  languageCounts: Record<OpenJawsSftLanguage, number>
}

type PrepareOptions = {
  evalRatio?: number
}

const CODING_TERMS = [
  'bug',
  'build',
  'code',
  'compile',
  'diff',
  'edit',
  'error',
  'file',
  'fix',
  'function',
  'patch',
  'refactor',
  'repo',
  'script',
  'test',
  'typescript',
]

const AGENTIC_TERMS = [
  'agent',
  'bash',
  'command',
  'inspect',
  'opencheek',
  'openjaws',
  'provider',
  'read',
  'run',
  'shell',
  'spawn',
  'tool',
  'working directory',
  '/provider',
]

const SECURITY_TERMS = [
  'attack',
  'auth',
  'csrf',
  'credential',
  'exploit',
  'injection',
  'oauth',
  'permission',
  'rce',
  'secret',
  'security',
  'sql',
  'token',
  'vulnerability',
  'xss',
]

const LANGUAGE_PATTERNS: Record<Exclude<OpenJawsSftLanguage, 'unknown'>, RegExp[]> = {
  typescript: [
    /\btypescript\b/i,
    /```(?:ts|tsx)\b/i,
    /\.(?:ts|tsx)\b/i,
    /\binterface\s+\w+/,
    /\btype\s+\w+\s*=/,
  ],
  javascript: [
    /\bjavascript\b/i,
    /```(?:js|jsx)\b/i,
    /\.(?:js|jsx)\b/i,
    /\brequire\s*\(/,
    /\bmodule\.exports\b/,
  ],
  python: [
    /\bpython\b/i,
    /```python\b/i,
    /\.py\b/i,
    /\bdef\s+\w+\s*\(/,
    /\bimport\s+\w+/,
  ],
  go: [
    /\bgo\b/i,
    /```go\b/i,
    /\.go\b/i,
    /\bpackage\s+main\b/,
    /\bfunc\s+\w+\s*\(/,
  ],
  rust: [
    /\brust\b/i,
    /```rust\b/i,
    /\.rs\b/i,
    /\bcargo\b/i,
    /\bimpl\s+\w+/,
  ],
  java: [
    /\bjava\b/i,
    /```java\b/i,
    /\.java\b/i,
    /\bpublic\s+class\b/,
    /\bSystem\.out\./,
  ],
  csharp: [
    /\bc#\b/i,
    /\bcsharp\b/i,
    /```csharp\b/i,
    /\.cs\b/i,
    /\busing\s+System;/,
    /\bnamespace\s+\w+/,
  ],
  cpp: [
    /\bc\+\+\b/i,
    /```(?:cpp|c\+\+)\b/i,
    /\.(?:cpp|cc|cxx|hpp|h)\b/i,
    /#include\s+</,
    /\bstd::/,
  ],
  shell: [
    /\bbash\b/i,
    /```(?:bash|sh)\b/i,
    /\.sh\b/i,
    /#!\/bin\/(?:ba)?sh/,
    /\b(?:grep|sed|chmod|chmod|find)\b/,
  ],
  powershell: [
    /\bpowershell\b/i,
    /```powershell\b/i,
    /\.ps1\b/i,
    /\bGet-ChildItem\b/,
    /\bStart-Process\b/,
    /\$env:/,
  ],
  json: [
    /```json\b/i,
    /\bpackage\.json\b/i,
    /\btsconfig\.json\b/i,
    /"[^"]+"\s*:\s*[{["\d-]/,
  ],
  yaml: [
    /```ya?ml\b/i,
    /\.(?:yaml|yml)\b/i,
    /^\s*version:/m,
    /^\s*services:/m,
  ],
  sql: [
    /```sql\b/i,
    /\bselect\b[\s\S]{0,120}\bfrom\b/i,
    /\binsert\s+into\b/i,
    /\bupdate\b[\s\S]{0,80}\bset\b/i,
  ],
  html: [
    /```html\b/i,
    /<html\b/i,
    /<div\b/i,
    /<body\b/i,
  ],
  css: [
    /```css\b/i,
    /\bdisplay\s*:\s*(?:flex|grid)\b/i,
    /\bcolor\s*:/i,
    /\.[\w-]+\s*\{/,
  ],
}

function normalizeForMatching(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term))
}

function hasCodeShape(text: string): boolean {
  return (
    text.includes('```') ||
    /[A-Za-z0-9_-]+\.(ts|tsx|js|jsx|py|go|rs|java|json|yaml|yml|sh|ps1)\b/i.test(
      text,
    ) ||
    /\b(function|const|let|class|import|export|def|SELECT|FROM)\b/.test(text)
  )
}

function hashSignature(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function inferOpenJawsSftTags(
  sample: OpenJawsSftSample,
): OpenJawsSftTag[] {
  const combined = normalizeForMatching(
    `${sample.messages[0].content}\n${sample.messages[1].content}`,
  )
  const tags = new Set<OpenJawsSftTag>()

  if (containsAny(combined, CODING_TERMS) || hasCodeShape(combined)) {
    tags.add('coding')
  }
  if (containsAny(combined, AGENTIC_TERMS)) {
    tags.add('agentic')
  }
  if (containsAny(combined, SECURITY_TERMS)) {
    tags.add('security')
  }

  if (tags.size === 0) {
    tags.add('general')
  }

  return Array.from(tags)
}

export function inferOpenJawsSftLanguages(
  sample: OpenJawsSftSample,
): OpenJawsSftLanguage[] {
  const combined = `${sample.messages[0].content}\n${sample.messages[1].content}`
  const languages = new Set<OpenJawsSftLanguage>()

  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS) as Array<
    [Exclude<OpenJawsSftLanguage, 'unknown'>, RegExp[]]
  >) {
    if (patterns.some(pattern => pattern.test(combined))) {
      languages.add(language)
    }
  }

  if (languages.size === 0) {
    languages.add('unknown')
  }

  return Array.from(languages)
}

export function buildOpenJawsSftSignature(sample: OpenJawsSftSample): string {
  const user = sample.messages[0].content.trim()
  const assistant = sample.messages[1].content.trim()
  return hashSignature(`${user}\n---\n${assistant}`)
}

export function splitOpenJawsSftSample(
  sample: OpenJawsSftSample,
  evalRatio = 0.05,
): 'train' | 'eval' {
  const signature = buildOpenJawsSftSignature(sample)
  const bucket = Number.parseInt(signature.slice(0, 4), 16) / 0xffff
  return bucket < evalRatio ? 'eval' : 'train'
}

export function prepareOpenJawsSftDataset(
  samples: OpenJawsSftSample[],
  options: PrepareOptions = {},
): {
  samples: PreparedOpenJawsSftSample[]
  manifest: OpenJawsSftPreparationManifest
} {
  const evalRatio = options.evalRatio ?? 0.05
  const seen = new Set<string>()
  const prepared: PreparedOpenJawsSftSample[] = []
  const tagCounts: Record<OpenJawsSftTag, number> = {
    coding: 0,
    agentic: 0,
    security: 0,
    general: 0,
  }
  const languageCounts: Record<OpenJawsSftLanguage, number> = {
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
  const splitCounts: Record<'train' | 'eval', number> = {
    train: 0,
    eval: 0,
  }

  for (const sample of samples) {
    const signature = buildOpenJawsSftSignature(sample)
    if (seen.has(signature)) continue
    seen.add(signature)

    const tags = inferOpenJawsSftTags(sample)
    const languages = inferOpenJawsSftLanguages(sample)
    const split = splitOpenJawsSftSample(sample, evalRatio)
    splitCounts[split]++
    for (const tag of tags) {
      tagCounts[tag]++
    }
    for (const language of languages) {
      languageCounts[language]++
    }

    prepared.push({
      ...sample,
      tags,
      languages,
      split,
      signature,
    })
  }

  return {
    samples: prepared,
    manifest: {
      totalInputSamples: samples.length,
      dedupedSamples: prepared.length,
      droppedDuplicates: samples.length - prepared.length,
      splitCounts,
      tagCounts,
      languageCounts,
    },
  }
}
