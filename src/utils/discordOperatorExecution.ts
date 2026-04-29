import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { type DiscordOperatorRunContext } from './discordOperatorWork.js'

export type OperatorDeliveryBundle = {
  markdownPath: string | null
  textPath: string | null
  htmlPath: string | null
  docxPath: string | null
  pptxPath: string | null
  xlsxPath: string | null
  pdfPath: string | null
  workspaceFiles?: Array<{
    path: string
    name?: string | null
    relativePath?: string | null
  }> | null
}

export type DiscordOperatorDeliveryArtifactKind =
  | 'markdown'
  | 'text'
  | 'html'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'pdf'
  | 'workspace'

export type DiscordOperatorDeliveryArtifact = {
  kind: DiscordOperatorDeliveryArtifactKind
  path: string
  name: string
  relativePath?: string | null
}

export type DiscordOperatorDeliveryArtifactRejectionReason =
  | 'missing_or_outside_root'
  | 'disallowed_name_or_extension'
  | 'unreadable_or_too_large'
  | 'count_limit'
  | 'total_size_limit'
  | 'sensitive_content_or_invalid_container'
  | 'duplicate'

export type DiscordOperatorDeliveryArtifactRejection = {
  kind: DiscordOperatorDeliveryArtifactKind
  name: string
  relativePath?: string | null
  reason: DiscordOperatorDeliveryArtifactRejectionReason
}

export type DiscordOperatorDeliveryArtifactCollection = {
  artifacts: DiscordOperatorDeliveryArtifact[]
  rejectedArtifacts: DiscordOperatorDeliveryArtifactRejection[]
}

export type DiscordOperatorDeliveryArtifactManifestEntry = {
  name: string
  mime: string
  bytes: number
  sha256: string
  sourceReceipt: string
  publicSafe: boolean
}

export type DiscordOperatorDeliveryArtifactManifestRejection = {
  name: string
  kind: DiscordOperatorDeliveryArtifactKind
  reason: DiscordOperatorDeliveryArtifactRejectionReason
  sourceReceipt: string
  publicSafe: true
}

export type DiscordOperatorDeliveryArtifactManifest = {
  version: 1
  generatedAt: string
  sourceReceipt: string
  artifacts: DiscordOperatorDeliveryArtifactManifestEntry[]
  rejectedArtifacts: DiscordOperatorDeliveryArtifactManifestRejection[]
}

export type DiscordOperatorVerificationResult = {
  attempted: boolean
  passed: boolean
  summary: string
  command: string | null
  stdout: string | null
  stderr: string | null
}

export type DiscordOperatorApprovalCandidate = {
  id: string
  branchName: string
  worktreePath: string
  workspacePath: string
  changedFiles: string[]
  summary: string
  verificationSummary?: string | null
  commitSha?: string | null
}

export type DiscordOperatorExecutionResult = {
  runContext: DiscordOperatorRunContext
  outputDir: string
  result: {
    startedAt?: string
    completedAt?: string
    workspace?: string
    model?: string
    prompt?: string
    outputDir?: string
    stdoutPath?: string
    stderrPath?: string
    deliveryPath?: string
    exitCode?: number
  }
  delivery: OperatorDeliveryBundle | null
  deliveryArtifactManifestPath: string | null
  changedFiles: string[]
  verification: DiscordOperatorVerificationResult
  commitSha: string | null
}


const DELIVERY_WORKSPACE_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.csv',
  '.md',
  '.txt',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
])

const OPENJAWS_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DISCORD_OPERATOR_DELIVERY_ARTIFACT_MANIFEST_NAME =
  'delivery-artifacts.manifest.json'
const DISCORD_OPERATOR_PERMISSION_BYPASS_ENV =
  'OPENJAWS_DISCORD_ALLOW_PERMISSION_BYPASS'
const DISCORD_OPERATOR_PERMISSION_BYPASS_PATTERNS = [
  {
    label: '--allow-dangerously-skip-permissions',
    pattern: /--allow-dangerously-skip-permissions\b/i,
  },
  {
    label: '--dangerously-skip-permissions',
    pattern: /--dangerously-skip-permissions\b/i,
  },
  {
    label: '--permission-mode bypassPermissions',
    pattern: /--permission-mode\b[\s\S]{0,120}\bbypassPermissions\b/i,
  },
]

function realpathWithinRoot(root: string, candidate: string): boolean {
  try {
    let normalizedRoot = realpathSync.native(resolve(root))
    let normalizedCandidate = realpathSync.native(resolve(candidate))
    if (process.platform === 'win32') {
      normalizedRoot = normalizedRoot.toLowerCase()
      normalizedCandidate = normalizedCandidate.toLowerCase()
    }
    const relativePath = relative(normalizedRoot, normalizedCandidate)
    return (
      normalizedCandidate === normalizedRoot ||
      (Boolean(relativePath) &&
        !relativePath.startsWith('..') &&
        !isAbsolute(relativePath))
    )
  } catch {
    return false
  }
}

function resolveOperatorRunnerScript(args: {
  runnerScriptPath: string
  outputDir: string
}): string {
  const scriptPath = resolve(args.runnerScriptPath)
  const allowedRoots = [
    resolve(OPENJAWS_REPO_ROOT, 'local-command-station'),
    dirname(resolve(args.outputDir)),
  ]
  if (!existsSync(scriptPath) || !allowedRoots.some(root => realpathWithinRoot(root, scriptPath))) {
    throw new Error(
      `OpenJaws runner script is outside the approved local operator roots: ${allowedRoots.join(', ')}`,
    )
  }
  return scriptPath
}

export function findDiscordOperatorRunnerPermissionBypassFlags(
  scriptText: string,
): string[] {
  return DISCORD_OPERATOR_PERMISSION_BYPASS_PATTERNS
    .filter(({ pattern }) => pattern.test(scriptText))
    .map(({ label }) => label)
}

function envAllowsDiscordOperatorPermissionBypass(): boolean {
  return /^(?:1|true|yes)$/i.test(
    process.env[DISCORD_OPERATOR_PERMISSION_BYPASS_ENV]?.trim() ?? '',
  )
}

function assertDiscordOperatorRunnerPermissionPolicy(args: {
  runnerScriptPath: string
  allowPermissionBypass?: boolean
}) {
  const bypassFlags = findDiscordOperatorRunnerPermissionBypassFlags(
    readFileSync(args.runnerScriptPath, 'utf8'),
  )
  if (
    bypassFlags.length === 0 ||
    args.allowPermissionBypass === true ||
    (args.allowPermissionBypass !== false &&
      envAllowsDiscordOperatorPermissionBypass())
  ) {
    return
  }

  throw new Error(
    [
      'Refusing to run a Discord OpenJaws runner that requests permission bypass.',
      `Blocked flag(s): ${bypassFlags.join(', ')}.`,
      `Set ${DISCORD_OPERATOR_PERMISSION_BYPASS_ENV}=1 only for supervised local maintenance.`,
    ].join(' '),
  )
}

export const DISCORD_OPERATOR_DELIVERY_MAX_FILES = 8
export const DISCORD_OPERATOR_DELIVERY_MAX_FILE_BYTES = 8 * 1024 * 1024
export const DISCORD_OPERATOR_DELIVERY_MAX_TOTAL_BYTES = 24 * 1024 * 1024
const DISCORD_OPERATOR_DELIVERY_MAX_RESERVED_WORKSPACE_FILES = 3

const DEFAULT_BROWSER_PRINT_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

const DISCORD_OPERATOR_MIME_BY_EXT = new Map<string, string>([
  ['.csv', 'text/csv; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.jsx', 'text/javascript; charset=utf-8'],
  ['.ts', 'text/typescript; charset=utf-8'],
  ['.tsx', 'text/typescript; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.pdf', 'application/pdf'],
])
const DISCORD_OPERATOR_TEXT_SCAN_EXTENSIONS = new Set([
  '.css',
  '.csv',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
])
const DISCORD_OPERATOR_OFFICE_SCAN_EXTENSIONS = new Set(['.docx', '.pptx', '.xlsx'])
const DISCORD_OPERATOR_DELIVERY_SECRET_PATTERNS = [
  /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}\b/,
  /\b([A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|SESSION)[A-Z0-9_]*)\s*[:=]\s*["']?[^"',\s]{6,}/i,
  /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}\b/,
]

export type RenderDiscordOperatorDeliveryBundleArgs = {
  workspacePath: string
  prompt: string
  outputDir: string
  model: string
  outputTextPath?: string | null
  outputText?: string | null
  generatedAt?: string | null
  includePdf?: boolean
  browserCandidates?: string[] | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function readOperatorOutputText(args: RenderDiscordOperatorDeliveryBundleArgs): string {
  if (typeof args.outputText === 'string') {
    return args.outputText
  }
  const outputTextPath = args.outputTextPath?.trim()
  if (!outputTextPath) {
    throw new Error('Operator delivery rendering requires outputText or outputTextPath.')
  }
  const resolvedPath = resolve(outputTextPath)
  if (!existsSync(resolvedPath)) {
    throw new Error(`Operator output text path not found: ${resolvedPath}`)
  }
  return readFileSync(resolvedPath, 'utf8')
}

function buildOperatorOutputMarkdown(args: {
  generatedAt: string
  workspacePath: string
  model: string
  prompt: string
  outputText: string
}): string {
  return [
    '# OpenJaws Operator Output',
    '',
    `- generated_at: ${args.generatedAt}`,
    `- workspace: ${args.workspacePath}`,
    `- model: ${args.model}`,
    '',
    '## Prompt',
    '',
    args.prompt,
    '',
    '## Output',
    '',
    args.outputText.trimEnd(),
    '',
  ].join('\n')
}

function buildOperatorOutputHtml(args: {
  generatedAt: string
  workspacePath: string
  model: string
  prompt: string
  outputText: string
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>OpenJaws Operator Output</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 40px; color: #111827; }
    h1, h2 { margin-bottom: 12px; }
    .meta { margin-bottom: 24px; padding: 16px; border: 1px solid #d1d5db; border-radius: 12px; background: #f9fafb; }
    pre { white-space: pre-wrap; word-break: break-word; padding: 20px; border-radius: 12px; background: #0f172a; color: #e5e7eb; }
    code { font-family: Cascadia Code, Consolas, monospace; }
  </style>
</head>
<body>
  <h1>OpenJaws Operator Output</h1>
  <div class="meta">
    <div><strong>Generated:</strong> ${escapeHtml(args.generatedAt)}</div>
    <div><strong>Workspace:</strong> ${escapeHtml(args.workspacePath)}</div>
    <div><strong>Model:</strong> ${escapeHtml(args.model)}</div>
  </div>
  <h2>Prompt</h2>
  <pre><code>${escapeHtml(args.prompt)}</code></pre>
  <h2>Output</h2>
  <pre><code>${escapeHtml(args.outputText.trimEnd())}</code></pre>
</body>
</html>
`
}

function buildMinimalDocxBuffer(lines: string[]): Buffer {
  const paragraphs = lines.map(line => {
    if (!line.trim()) {
      return '<w:p/>'
    }
    return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
  }).join('\n    ')
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
`

  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
`),
    'word/document.xml': strToU8(documentXml),
  }, { level: 6 }))
}

function clampSpreadsheetCell(value: string): string {
  return value.length <= 32_767 ? value : `${value.slice(0, 32_764)}...`
}

function xlsxCellRef(columnIndex: number, rowIndex: number): string {
  let column = ''
  let index = columnIndex + 1
  while (index > 0) {
    const remainder = (index - 1) % 26
    column = String.fromCharCode(65 + remainder) + column
    index = Math.floor((index - 1) / 26)
  }
  return `${column}${rowIndex + 1}`
}

function buildMinimalXlsxBuffer(args: {
  generatedAt: string
  workspacePath: string
  model: string
  prompt: string
  outputText: string
}): Buffer {
  const rows = [
    ['field', 'value'],
    ['generated_at', args.generatedAt],
    ['workspace', args.workspacePath],
    ['model', args.model],
    ['prompt', args.prompt],
    ['output', args.outputText.trimEnd()],
  ]
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = xlsxCellRef(columnIndex, rowIndex)
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(clampSpreadsheetCell(cell))}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('\n      ')
  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="2" width="120" customWidth="1"/>
  </cols>
  <sheetData>
      ${sheetRows}
  </sheetData>
</worksheet>
`

  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>
`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Operator Output" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>
`),
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml),
  }, { level: 6 }))
}

function buildMinimalPptxBuffer(args: {
  generatedAt: string
  workspacePath: string
  model: string
  prompt: string
  outputText: string
}): Buffer {
  const title = 'OpenJaws Operator Output'
  const bullets = [
    `Generated: ${args.generatedAt}`,
    `Workspace: ${args.workspacePath}`,
    `Model: ${args.model}`,
    `Prompt: ${args.prompt}`,
    `Output: ${args.outputText.trimEnd()}`,
  ]
    .join('\n')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 18)
  const bodyParagraphs = bullets.map(line => `
        <a:p>
          <a:r>
            <a:rPr lang="en-US" sz="1800"/>
            <a:t>${escapeXml(line)}</a:t>
          </a:r>
          <a:endParaRPr lang="en-US" sz="1800"/>
        </a:p>`).join('')

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title"/>
          <p:cNvSpPr>
            <a:spLocks noGrp="1"/>
          </p:cNvSpPr>
          <p:nvPr>
            <p:ph type="title"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="3600" b="1"/>
              <a:t>${escapeXml(title)}</a:t>
            </a:r>
            <a:endParaRPr lang="en-US" sz="3600"/>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content"/>
          <p:cNvSpPr>
            <a:spLocks noGrp="1"/>
          </p:cNvSpPr>
          <p:nvPr>
            <p:ph type="body" idx="1"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr wrap="square"/>
          <a:lstStyle/>
          ${bodyParagraphs}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>
`

  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>
`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>
`),
    'ppt/presentation.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>
`),
    'ppt/_rels/presentation.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>
`),
    'ppt/slides/slide1.xml': strToU8(slideXml),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>
`),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleAndObj" preserve="1">
  <p:cSld name="Title and Content">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>
`),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>
`),
    'ppt/slideMasters/slideMaster1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle/><p:bodyStyle/><p:otherStyle/>
  </p:txStyles>
</p:sldMaster>
`),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>
`),
    'ppt/theme/theme1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="OpenJaws">
  <a:themeElements>
    <a:clrScheme name="OpenJaws">
      <a:dk1><a:srgbClr val="111827"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2937"/></a:dk2>
      <a:lt2><a:srgbClr val="F9FAFB"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1>
      <a:accent2><a:srgbClr val="059669"/></a:accent2>
      <a:accent3><a:srgbClr val="D97706"/></a:accent3>
      <a:accent4><a:srgbClr val="7C3AED"/></a:accent4>
      <a:accent5><a:srgbClr val="DC2626"/></a:accent5>
      <a:accent6><a:srgbClr val="0891B2"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="OpenJaws">
      <a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont>
      <a:minorFont><a:latin typeface="Aptos"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="OpenJaws">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>
`),
  }, { level: 6 }))
}

function collectTopLevelWorkspaceDeliveryFiles(workspacePath: string): OperatorDeliveryBundle['workspaceFiles'] {
  const workspaceRoot = resolve(workspacePath)
  if (!existsSync(workspaceRoot)) {
    return []
  }

  return readdirSync(workspaceRoot, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => resolve(workspaceRoot, entry.name))
    .filter(filePath => isPathWithinRoot(workspaceRoot, filePath))
    .filter(filePath => DELIVERY_WORKSPACE_EXTENSIONS.has(extname(filePath).toLowerCase()))
    .sort((left, right) => basename(left).localeCompare(basename(right)))
    .map(filePath => ({
      path: filePath,
      name: basename(filePath),
      relativePath: basename(filePath),
    }))
}

async function tryRenderPdfFromHtml(args: {
  htmlPath: string
  pdfPath: string
  browserCandidates?: string[] | null
}): Promise<string | null> {
  const browserPath = (args.browserCandidates ?? DEFAULT_BROWSER_PRINT_CANDIDATES)
    .map(candidate => candidate.trim())
    .find(candidate => candidate && existsSync(candidate))
  if (!browserPath) {
    return null
  }
  const result = await execa(
    browserPath,
    [
      '--headless',
      '--disable-gpu',
      `--print-to-pdf=${args.pdfPath}`,
      resolve(args.htmlPath),
    ],
    { reject: false, windowsHide: true, timeout: 30_000 },
  )
  if (result.exitCode !== 0 || !existsSync(args.pdfPath)) {
    return null
  }
  try {
    return statSync(args.pdfPath).isFile() && statSync(args.pdfPath).size > 0
      ? resolve(args.pdfPath)
      : null
  } catch {
    return null
  }
}

export async function renderDiscordOperatorDeliveryBundle(
  args: RenderDiscordOperatorDeliveryBundleArgs,
): Promise<OperatorDeliveryBundle> {
  const outputDir = resolve(args.outputDir)
  const workspacePath = resolve(args.workspacePath)
  mkdirSync(outputDir, { recursive: true })

  const generatedAt = args.generatedAt?.trim() || new Date().toISOString()
  const outputText = readOperatorOutputText(args)
  const markdownPath = join(outputDir, 'openjaws-output.md')
  const textPath = join(outputDir, 'openjaws-output.txt')
  const htmlPath = join(outputDir, 'openjaws-output.html')
  const docxPath = join(outputDir, 'openjaws-output.docx')
  const pptxPath = join(outputDir, 'openjaws-output.pptx')
  const xlsxPath = join(outputDir, 'openjaws-output.xlsx')
  const pdfPath = join(outputDir, 'openjaws-output.pdf')

  writeFileSync(markdownPath, buildOperatorOutputMarkdown({
    generatedAt,
    workspacePath,
    model: args.model,
    prompt: args.prompt,
    outputText,
  }), 'utf8')
  writeFileSync(textPath, outputText, 'utf8')
  writeFileSync(htmlPath, buildOperatorOutputHtml({
    generatedAt,
    workspacePath,
    model: args.model,
    prompt: args.prompt,
    outputText,
  }), 'utf8')
  writeFileSync(docxPath, buildMinimalDocxBuffer([
    'OpenJaws Operator Output',
    '',
    `Generated: ${generatedAt}`,
    `Workspace: ${workspacePath}`,
    `Model: ${args.model}`,
    '',
    'Prompt:',
    args.prompt,
    '',
    'Output:',
    outputText.trimEnd(),
  ].join('\n').split(/\r?\n/)))
  writeFileSync(pptxPath, buildMinimalPptxBuffer({
    generatedAt,
    workspacePath,
    model: args.model,
    prompt: args.prompt,
    outputText,
  }))
  writeFileSync(xlsxPath, buildMinimalXlsxBuffer({
    generatedAt,
    workspacePath,
    model: args.model,
    prompt: args.prompt,
    outputText,
  }))

  const renderedPdfPath = args.includePdf === false
    ? null
    : await tryRenderPdfFromHtml({
        htmlPath,
        pdfPath,
        browserCandidates: args.browserCandidates,
      })

  return {
    markdownPath: resolve(markdownPath),
    textPath: resolve(textPath),
    htmlPath: resolve(htmlPath),
    docxPath: existsSync(docxPath) ? resolve(docxPath) : null,
    pptxPath: existsSync(pptxPath) ? resolve(pptxPath) : null,
    xlsxPath: existsSync(xlsxPath) ? resolve(xlsxPath) : null,
    pdfPath: renderedPdfPath,
    workspaceFiles: collectTopLevelWorkspaceDeliveryFiles(workspacePath),
  }
}

export function summarizeChangedFiles(changedFiles: string[]): string {
  if (changedFiles.length === 0) {
    return 'No changed files were detected.'
  }
  if (changedFiles.length <= 6) {
    return changedFiles.join(', ')
  }
  return `${changedFiles.slice(0, 6).join(', ')} +${changedFiles.length - 6} more`
}

export function findApprovalCandidate<T extends { id: string; branchName: string }>(
  candidates: T[],
  target: string | null,
): T | null {
  const normalized = target?.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  if (normalized === 'latest') {
    return candidates.at(-1) ?? null
  }
  return (
    candidates.find(
      candidate =>
        candidate.id.toLowerCase() === normalized ||
        candidate.branchName.toLowerCase() === normalized,
    ) ?? null
  )
}

export function formatApprovalCandidateSummary(
  candidate: DiscordOperatorApprovalCandidate,
): string {
  return [
    `Job: ${candidate.id}`,
    `Branch: ${candidate.branchName}`,
    `Workspace: ${candidate.workspacePath}`,
    `Changed: ${summarizeChangedFiles(candidate.changedFiles)}`,
    `Tests: ${candidate.verificationSummary ?? 'not recorded'}`,
    `Summary: ${candidate.summary}`,
  ].join('\n')
}

export function collectDiscordOperatorDeliveryArtifacts(args: {
  delivery: OperatorDeliveryBundle | null
  outputDir: string
  workspacePath?: string | null
}): DiscordOperatorDeliveryArtifact[] {
  return collectDiscordOperatorDeliveryArtifactsWithRejections(args).artifacts
}

export function collectDiscordOperatorDeliveryArtifactsWithRejections(args: {
  delivery: OperatorDeliveryBundle | null
  outputDir: string
  workspacePath?: string | null
}): DiscordOperatorDeliveryArtifactCollection {
  const outputRoot = resolve(args.outputDir)
  const workspaceRoot = args.workspacePath ? resolve(args.workspacePath) : null
  const seen = new Set<string>()
  const artifacts: DiscordOperatorDeliveryArtifact[] = []
  const rejectedArtifacts: DiscordOperatorDeliveryArtifactRejection[] = []
  let totalBytes = 0
  const reservedWorkspaceSlots = Math.min(
    DISCORD_OPERATOR_DELIVERY_MAX_RESERVED_WORKSPACE_FILES,
    args.delivery?.workspaceFiles?.length ?? 0,
  )
  const canonicalArtifactLimit =
    DISCORD_OPERATOR_DELIVERY_MAX_FILES - reservedWorkspaceSlots
  const recordRejected = (
    kind: DiscordOperatorDeliveryArtifactKind,
    name: string,
    relativePath: string | null | undefined,
    reason: DiscordOperatorDeliveryArtifactRejectionReason,
  ) => {
    rejectedArtifacts.push({
      kind,
      name: sanitizeDiscordOperatorRejectedArtifactName(name, kind),
      relativePath: sanitizeDiscordOperatorRejectedArtifactRelativePath(relativePath),
      reason,
    })
  }

  const pushArtifact = (
    kind: DiscordOperatorDeliveryArtifactKind,
    rawPath: string | null | undefined,
    fallbackName: string,
    root: string | null,
    relativePath?: string | null,
    explicitName?: string | null,
    maxArtifacts = DISCORD_OPERATOR_DELIVERY_MAX_FILES,
  ) => {
    const artifactName = explicitName?.trim() || relativePath?.trim() || fallbackName
    if (!rawPath) {
      return
    }
    const normalizedPath = normalizeExistingFilePath(rawPath)
    if (!normalizedPath || !isPathWithinRoot(root, normalizedPath)) {
      recordRejected(kind, artifactName, relativePath, 'missing_or_outside_root')
      return
    }
    if (!isAllowedDiscordDeliveryName(artifactName)) {
      recordRejected(kind, artifactName, relativePath, 'disallowed_name_or_extension')
      return
    }
    const size = getFileSize(normalizedPath)
    if (size === null || size > DISCORD_OPERATOR_DELIVERY_MAX_FILE_BYTES) {
      recordRejected(kind, artifactName, relativePath, 'unreadable_or_too_large')
      return
    }
    if (artifacts.length >= maxArtifacts) {
      recordRejected(kind, artifactName, relativePath, 'count_limit')
      return
    }
    if (totalBytes + size > DISCORD_OPERATOR_DELIVERY_MAX_TOTAL_BYTES) {
      recordRejected(kind, artifactName, relativePath, 'total_size_limit')
      return
    }
    if (!isDiscordOperatorDeliveryArtifactSafeToUpload(normalizedPath, artifactName)) {
      recordRejected(
        kind,
        artifactName,
        relativePath,
        'sensitive_content_or_invalid_container',
      )
      return
    }
    const dedupeKey = normalizedPath.toLowerCase()
    if (seen.has(dedupeKey)) {
      recordRejected(kind, artifactName, relativePath, 'duplicate')
      return
    }
    seen.add(dedupeKey)
    totalBytes += size
    artifacts.push({
      kind,
      path: normalizedPath,
      name: artifactName,
      relativePath: relativePath?.trim() || null,
    })
  }

  pushArtifact(
    'markdown',
    args.delivery?.markdownPath,
    'openjaws-output.md',
    outputRoot,
    null,
    null,
    canonicalArtifactLimit,
  )
  pushArtifact(
    'docx',
    args.delivery?.docxPath,
    'openjaws-output.docx',
    outputRoot,
    null,
    null,
    canonicalArtifactLimit,
  )
  pushArtifact(
    'pptx',
    args.delivery?.pptxPath,
    'openjaws-output.pptx',
    outputRoot,
    null,
    null,
    canonicalArtifactLimit,
  )
  pushArtifact(
    'xlsx',
    args.delivery?.xlsxPath,
    'openjaws-output.xlsx',
    outputRoot,
    null,
    null,
    canonicalArtifactLimit,
  )
  pushArtifact(
    'pdf',
    args.delivery?.pdfPath,
    'openjaws-output.pdf',
    outputRoot,
    null,
    null,
    canonicalArtifactLimit,
  )
  pushArtifact(
    'html',
    args.delivery?.htmlPath,
    'openjaws-output.html',
    outputRoot,
    null,
    null,
    canonicalArtifactLimit,
  )
  pushArtifact(
    'text',
    args.delivery?.textPath,
    'openjaws-output.txt',
    outputRoot,
    null,
    null,
    canonicalArtifactLimit,
  )
  for (const file of args.delivery?.workspaceFiles ?? []) {
    pushArtifact(
      'workspace',
      file?.path,
      basename(file?.path ?? ''),
      workspaceRoot,
      file?.relativePath ?? null,
      file?.name ?? null,
    )
  }

  return {
    artifacts,
    rejectedArtifacts,
  }
}

export function resolveDiscordOperatorDeliveryArtifactMime(
  artifact: Pick<DiscordOperatorDeliveryArtifact, 'path' | 'name'>,
): string {
  const extension = extname(artifact.name || artifact.path).toLowerCase()
  return DISCORD_OPERATOR_MIME_BY_EXT.get(extension) ?? 'application/octet-stream'
}

export function buildDiscordOperatorDeliveryArtifactManifest(args: {
  artifacts: DiscordOperatorDeliveryArtifact[]
  rejectedArtifacts?: DiscordOperatorDeliveryArtifactRejection[] | null
  sourceReceipt: string
  publicSafe: boolean
  generatedAt?: string | null
}): DiscordOperatorDeliveryArtifactManifest {
  const sourceReceipt = args.sourceReceipt.trim() || 'result.json'
  return {
    version: 1,
    generatedAt: args.generatedAt?.trim() || new Date().toISOString(),
    sourceReceipt,
    artifacts: args.artifacts.map(artifact => {
      const bytes = statSync(artifact.path).size
      const sha256 = createHash('sha256')
        .update(readFileSync(artifact.path))
        .digest('hex')
      return {
        name: artifact.name,
        mime: resolveDiscordOperatorDeliveryArtifactMime(artifact),
        bytes,
        sha256,
        sourceReceipt,
        publicSafe: args.publicSafe,
      }
    }),
    rejectedArtifacts: (args.rejectedArtifacts ?? []).map(rejection => ({
      name: rejection.name,
      kind: rejection.kind,
      reason: rejection.reason,
      sourceReceipt,
      publicSafe: true,
    })),
  }
}

export function writeDiscordOperatorDeliveryArtifactManifest(args: {
  outputDir: string
  artifacts: DiscordOperatorDeliveryArtifact[]
  rejectedArtifacts?: DiscordOperatorDeliveryArtifactRejection[] | null
  sourceReceipt: string
  publicSafe: boolean
  generatedAt?: string | null
}): string | null {
  if (args.artifacts.length === 0 && (args.rejectedArtifacts?.length ?? 0) === 0) {
    return null
  }
  const manifest = buildDiscordOperatorDeliveryArtifactManifest(args)
  const manifestPath = join(
    resolve(args.outputDir),
    DISCORD_OPERATOR_DELIVERY_ARTIFACT_MANIFEST_NAME,
  )
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifestPath
}

export async function pushApprovalCandidateToOrigin(args: {
  branchName: string
  worktreePath: string
  commitSha?: string | null
}): Promise<string> {
  const branchName = args.branchName.trim()
  if (!/^discord-[A-Za-z0-9._/-]+$/.test(branchName)) {
    throw new Error(`Refusing to push non-Discord operator branch: ${args.branchName}`)
  }
  const currentBranch = readGitOutput(args.worktreePath, [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ])
  if (currentBranch !== branchName) {
    throw new Error(
      `Refusing to push ${branchName}: worktree is currently on ${currentBranch || 'unknown'}.`,
    )
  }
  const status = readGitOutput(args.worktreePath, ['status', '--porcelain'])
  if (status) {
    throw new Error(`Refusing to push ${branchName}: worktree has uncommitted changes.`)
  }
  const expectedCommitSha = args.commitSha?.trim()
  if (expectedCommitSha) {
    const headSha = readGitOutput(args.worktreePath, ['rev-parse', 'HEAD'])
    if (headSha !== expectedCommitSha) {
      throw new Error(
        `Refusing to push ${branchName}: approval commit ${expectedCommitSha} does not match HEAD ${headSha || 'unknown'}.`,
      )
    }
  }
  const result = await execa(
    'git',
    ['-C', args.worktreePath, 'push', '-u', 'origin', branchName],
    {
      reject: false,
      windowsHide: true,
      timeout: 5 * 60_000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
      },
    },
  )
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || `Push failed for ${branchName}.`,
    )
  }
  return `Pushed ${branchName} to origin.`
}

export async function runScriptedOpenJawsOperatorJob(args: {
  runContext: DiscordOperatorRunContext
  prompt: string
  runnerScriptPath: string
  model: string
  outputDir: string
  transientConfigDir?: string | null
  addDirs?: string[] | null
  promptFooter?: string | null
  includePdf?: boolean
  timeoutMs?: number
  allowPermissionBypass?: boolean
  commitAuthorName?: string
  commitAuthorEmail?: string
  commitMessage?: string
  commitWhen?: (args: {
    changedFiles: string[]
    verification: DiscordOperatorVerificationResult
  }) => boolean
}): Promise<DiscordOperatorExecutionResult> {
  mkdirSync(args.outputDir, { recursive: true })
  const transientConfigDir =
    args.transientConfigDir?.trim() || join(args.outputDir, '.openjaws-config')
  mkdirSync(transientConfigDir, { recursive: true })

  const addDirs = Array.from(
    new Set(
      (args.addDirs ?? [])
        .map(value => value?.trim())
        .filter((value): value is string => Boolean(value && existsSync(value))),
    ),
  )
  const promptFooter = args.promptFooter?.trim()
  const runnerScriptPath = resolveOperatorRunnerScript({
    runnerScriptPath: args.runnerScriptPath,
    outputDir: args.outputDir,
  })
  assertDiscordOperatorRunnerPermissionPolicy({
    runnerScriptPath,
    allowPermissionBypass: args.allowPermissionBypass,
  })
  const addDirsJsonBase64 =
    addDirs.length > 0
      ? Buffer.from(JSON.stringify(addDirs), 'utf8').toString('base64')
      : null
  const launchArgs = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    runnerScriptPath,
    '-Workspace',
    args.runContext.workspacePath,
    '-Prompt',
    args.prompt,
    '-OutputDir',
    args.outputDir,
    '-TransientConfigDir',
    transientConfigDir,
    '-Model',
    args.model,
    ...(promptFooter ? ['-PromptFooter', promptFooter] : []),
    ...(addDirsJsonBase64 ? ['-AddDirJsonBase64', addDirsJsonBase64] : []),
  ]

  const launch = await execa(
    'powershell',
    launchArgs,
    {
      reject: false,
      windowsHide: true,
      timeout: args.timeoutMs ?? 12 * 60_000,
    },
  )

  const resultPath = join(args.outputDir, 'result.json')
  const deliveryPath = join(args.outputDir, 'delivery.json')
  const result = readJsonFile<DiscordOperatorExecutionResult['result']>(resultPath)
  let delivery = readJsonFile<OperatorDeliveryBundle>(deliveryPath)

  if (!result) {
    const runnerOutput = (launch.stderr.trim() || launch.stdout.trim()).replace(/\s+/g, ' ')
    const exitSummary =
      typeof launch.exitCode === 'number' ? `exit code ${launch.exitCode}` : 'unknown exit code'
    throw new Error(
      [
        `OpenJaws scripted operator job did not produce a result receipt at ${resultPath}.`,
        `Runner finished with ${exitSummary}.`,
        runnerOutput ? `Last runner output: ${runnerOutput}` : null,
      ].filter(Boolean).join(' '),
    )
  }

  if (!delivery && result.stdoutPath && existsSync(resolve(result.stdoutPath))) {
    delivery = await renderDiscordOperatorDeliveryBundle({
      workspacePath: args.runContext.workspacePath,
      prompt: args.prompt,
      outputTextPath: result.stdoutPath,
      outputDir: args.outputDir,
      model: args.model,
      includePdf: args.includePdf,
    })
    writeFileSync(deliveryPath, `${JSON.stringify(delivery, null, 2)}\n`, 'utf8')
  }

  const changedFiles =
    args.runContext.worktreePath
      ? readGitChangedFiles(args.runContext.worktreePath)
      : []
  const verification =
    changedFiles.length > 0
      ? await verifyOperatorWorkspace(args.runContext.workspacePath)
      : {
          attempted: false,
          passed: true,
          summary: 'No file changes were detected, so no verification run was required.',
          command: null,
          stdout: null,
          stderr: null,
        }
  const deliveryArtifactCollection = collectDiscordOperatorDeliveryArtifactsWithRejections({
    delivery,
    outputDir: args.outputDir,
    workspacePath: args.runContext.workspacePath,
  })
  const deliveryArtifactManifestPath = writeDiscordOperatorDeliveryArtifactManifest({
    outputDir: args.outputDir,
    artifacts: deliveryArtifactCollection.artifacts,
    rejectedArtifacts: deliveryArtifactCollection.rejectedArtifacts,
    sourceReceipt: basename(resultPath),
    publicSafe: false,
  })
  const shouldCommit =
    changedFiles.length > 0 &&
    verification.passed &&
    (args.commitWhen
      ? args.commitWhen({
          changedFiles,
          verification,
        })
      : true)
  const commitSha =
    args.runContext.worktreePath && shouldCommit
      ? commitOperatorWorktree({
          worktreePath: args.runContext.worktreePath,
          prompt: args.prompt,
          authorName: args.commitAuthorName ?? 'Discord Q Agent',
          authorEmail: args.commitAuthorEmail ?? 'discord-q-agent@local.invalid',
          commitMessage: args.commitMessage ?? null,
        })
      : null

  return {
    runContext: args.runContext,
    outputDir: result.outputDir ?? args.outputDir,
    result,
    delivery,
    deliveryArtifactManifestPath,
    changedFiles,
    verification,
    commitSha,
  }
}

function resolveOperatorVerificationCommand(
  workspacePath: string,
): { cmd: string[]; summary: string } | null {
  const packageJsonPath = join(workspacePath, 'package.json')
  if (existsSync(packageJsonPath)) {
    let scripts: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        scripts?: Record<string, unknown>
      }
      scripts = parsed.scripts ?? {}
    } catch {
      scripts = {}
    }
    const preferredScript = ['verify:ci', 'test', 'build'].find(
      scriptName => typeof scripts[scriptName] === 'string',
    )
    if (!preferredScript) {
      return null
    }
    if (
      existsSync(join(workspacePath, 'bun.lock')) ||
      existsSync(join(workspacePath, 'bun.lockb'))
    ) {
      return {
        cmd: ['bun', 'run', preferredScript],
        summary: `bun run ${preferredScript}`,
      }
    }
    return {
      cmd: ['npm', 'run', preferredScript],
      summary: `npm run ${preferredScript}`,
    }
  }
  const cargoManifest = join(workspacePath, 'Cargo.toml')
  if (existsSync(cargoManifest)) {
    return {
      cmd: ['cargo', 'check', '--manifest-path', cargoManifest],
      summary: 'cargo check',
    }
  }
  return null
}

async function verifyOperatorWorkspace(
  workspacePath: string,
): Promise<DiscordOperatorVerificationResult> {
  const command = resolveOperatorVerificationCommand(workspacePath)
  if (!command) {
    return {
      attempted: false,
      passed: true,
      summary: 'No repo-specific verification command was detected for this workspace.',
      command: null,
      stdout: null,
      stderr: null,
    }
  }
  const result = await execa(command.cmd[0]!, command.cmd.slice(1), {
    cwd: workspacePath,
    reject: false,
    windowsHide: true,
    timeout: 15 * 60_000,
  })
  const stdout = result.stdout.trim() || null
  const stderr = result.stderr.trim() || null
  return {
    attempted: true,
    passed: result.exitCode === 0,
    summary:
      result.exitCode === 0
        ? `Verification passed: ${command.summary}`
        : `Verification failed: ${command.summary}`,
    command: command.summary,
    stdout,
    stderr,
  }
}

function readGitChangedFiles(worktreePath: string): string[] {
  const result = Bun.spawnSync({
    cmd: ['git', '-C', worktreePath, 'status', '--short'],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = new TextDecoder().decode(result.stdout).trim()
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[A-Z? ]+/, '').trim())
    .filter(Boolean)
}

function readGitOutput(worktreePath: string, args: string[]): string {
  const result = Bun.spawnSync({
    cmd: ['git', '-C', worktreePath, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
    },
  })
  if ((result.exitCode ?? 1) !== 0) {
    const stderr = new TextDecoder().decode(result.stderr).trim()
    const stdout = new TextDecoder().decode(result.stdout).trim()
    throw new Error(stderr || stdout || `Git command failed: git ${args.join(' ')}`)
  }
  return new TextDecoder().decode(result.stdout).trim()
}

function commitOperatorWorktree(args: {
  worktreePath: string
  prompt: string
  authorName: string
  authorEmail: string
  commitMessage: string | null
}): string | null {
  const addResult = Bun.spawnSync({
    cmd: ['git', '-C', args.worktreePath, 'add', '-A'],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if ((addResult.exitCode ?? 1) !== 0) {
    const stderr = new TextDecoder().decode(addResult.stderr).trim()
    const stdout = new TextDecoder().decode(addResult.stdout).trim()
    throw new Error(stderr || stdout || 'Failed to stage operator worktree changes.')
  }
  const commitResult = Bun.spawnSync({
    cmd: [
      'git',
      '-C',
      args.worktreePath,
      '-c',
      `user.name=${args.authorName}`,
      '-c',
      `user.email=${args.authorEmail}`,
      'commit',
      '-m',
      args.commitMessage ?? args.prompt.slice(0, 72),
    ],
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
    },
  })
  if ((commitResult.exitCode ?? 1) !== 0) {
    const stderr = new TextDecoder().decode(commitResult.stderr).trim()
    const stdout = new TextDecoder().decode(commitResult.stdout).trim()
    throw new Error(stderr || stdout || 'Failed to commit operator worktree changes.')
  }
  const shaResult = Bun.spawnSync({
    cmd: ['git', '-C', args.worktreePath, 'rev-parse', 'HEAD'],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const sha = new TextDecoder().decode(shaResult.stdout).trim()
  return sha || null
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function normalizeExistingFilePath(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }
  const resolvedPath = resolve(normalized)
  if (!existsSync(resolvedPath)) {
    return null
  }
  try {
    return statSync(resolvedPath).isFile() ? resolvedPath : null
  } catch {
    return null
  }
}

function isPathWithinRoot(root: string | null, candidate: string): boolean {
  if (!root) {
    return false
  }
  const normalizedRoot = resolve(root)
  const normalizedCandidate = resolve(candidate)
  const samePath =
    process.platform === 'win32'
      ? normalizedCandidate.toLowerCase() === normalizedRoot.toLowerCase()
      : normalizedCandidate === normalizedRoot
  if (samePath) {
    return true
  }
  const child = relative(normalizedRoot, normalizedCandidate)
  return Boolean(child) && !child.startsWith('..') && !isAbsolute(child)
}

function isAllowedDiscordDeliveryName(name: string): boolean {
  const normalized = name.replace(/\\/g, '/').trim()
  if (!normalized || normalized.split('/').some(segment => segment.startsWith('.'))) {
    return false
  }
  return DELIVERY_WORKSPACE_EXTENSIONS.has(extname(normalized).toLowerCase())
}

function sanitizeDiscordOperatorRejectedArtifactName(
  value: string | null | undefined,
  kind: DiscordOperatorDeliveryArtifactKind,
): string {
  const fallback = `${kind}-artifact`
  const normalized = (value ?? fallback).replace(/\\/g, '/').trim()
  const leaf = basename(normalized) || fallback
  const extension = extname(leaf).replace(/[^A-Za-z0-9.]/g, '').slice(0, 16)
  if (containsDiscordOperatorDeliverySecret(leaf)) {
    return `redacted-artifact${extension}`
  }
  return leaf.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 96) || fallback
}

function sanitizeDiscordOperatorRejectedArtifactRelativePath(
  value: string | null | undefined,
): string | null {
  const normalized = value?.replace(/\\/g, '/').trim()
  if (
    !normalized ||
    normalized.includes('..') ||
    containsDiscordOperatorDeliverySecret(normalized)
  ) {
    return null
  }
  return normalized
    .split('/')
    .filter(Boolean)
    .map(segment => segment.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 64))
    .join('/')
    .slice(0, 160) || null
}

function containsDiscordOperatorDeliverySecret(value: string): boolean {
  return DISCORD_OPERATOR_DELIVERY_SECRET_PATTERNS.some(pattern => pattern.test(value))
}

function isDiscordOperatorDeliveryArtifactSafeToUpload(
  path: string,
  name: string,
): boolean {
  const extension = extname(name || path).toLowerCase()
  try {
    if (DISCORD_OPERATOR_TEXT_SCAN_EXTENSIONS.has(extension)) {
      return !containsDiscordOperatorDeliverySecret(readFileSync(path, 'utf8'))
    }
    if (DISCORD_OPERATOR_OFFICE_SCAN_EXTENSIONS.has(extension)) {
      const entries = unzipSync(new Uint8Array(readFileSync(path)))
      return Object.entries(entries)
        .filter(([entryName]) => entryName.endsWith('.xml') || entryName.endsWith('.rels'))
        .every(([, bytes]) => {
          const text = new TextDecoder().decode(bytes)
          return !containsDiscordOperatorDeliverySecret(text)
        })
    }
    return true
  } catch {
    return false
  }
}

function getFileSize(path: string): number | null {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}
