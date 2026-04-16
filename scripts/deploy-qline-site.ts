import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { execa } from 'execa'

const EXPECTED_SITE_ID = 'edde15e1-bf1f-4986-aef3-5803fdce7406'
const EXPECTED_SITE_NAME = 'qline-site-20260415022202'
const EXPECTED_DOMAIN = 'qline.site'
const REQUIRED_CONTENT_CHECKS = [
  'Agent Co-Work',
  'official public TerminalBench',
  'circuit-fibsqrt',
  'OpenJaws on GitHub',
] as const

type CliOptions = {
  checkLive: boolean
  promote: boolean
  siteId: string
}

type NetlifyFunction = {
  name?: string
  display_name?: string
  dn?: string
  generator?: string
  g?: string
  invocation_mode?: string
  im?: string
  runtime?: string
  r?: string
}

type NetlifyDeploy = {
  id: string
  state?: string
  url?: string
  ssl_url?: string
  deploy_ssl_url?: string
  summary?: string
  available_functions?: NetlifyFunction[]
}

type NetlifySite = {
  id: string
  name?: string
  custom_domain?: string | null
  published_deploy?: { id?: string } | null
  published_deploy_id?: string | null
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    checkLive: false,
    promote: false,
    siteId: EXPECTED_SITE_ID,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check-live') {
      options.checkLive = true
      continue
    }
    if (arg === '--promote') {
      options.promote = true
      continue
    }
    if (arg === '--site-id' && argv[i + 1]) {
      options.siteId = argv[++i]!
      continue
    }
  }

  if (!options.checkLive && !options.promote) {
    options.checkLive = true
  }

  return options
}

function readNetlifyAuthToken(repoRoot: string): string {
  const directToken = process.env.NETLIFY_AUTH_TOKEN?.trim()
  if (directToken) {
    return directToken
  }

  const configPath = resolve(repoRoot, 'website', '.netlify-cli-config', 'config.json')
  if (!existsSync(configPath)) {
    throw new Error(
      'No Netlify auth token found. Set NETLIFY_AUTH_TOKEN or log in through website/.netlify-cli-config/config.json.',
    )
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    users?: Record<string, { auth?: { token?: string } }>
  }
  const firstUser = config.users ? Object.values(config.users)[0] : null
  const token = firstUser?.auth?.token?.trim()
  if (!token) {
    throw new Error(
      'Netlify auth config exists, but no user auth token was found in website/.netlify-cli-config/config.json.',
    )
  }
  return token
}

async function netlifyApi<T>(token: string, path: string): Promise<T> {
  let lastStatus = 0
  let lastStatusText = 'Unknown'
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'openjaws-qline-deployer/1.0',
        Accept: 'application/json',
      },
    })
    if (response.ok) {
      return (await response.json()) as T
    }
    lastStatus = response.status
    lastStatusText = response.statusText
    if (response.status !== 429 || attempt === 5) {
      break
    }
    await Bun.sleep(2000 * (attempt + 1))
  }
  throw new Error(`Netlify API ${path} failed: ${lastStatus} ${lastStatusText}`)
}

function assertSiteIdentity(site: NetlifySite, siteId: string): void {
  if (site.id !== siteId) {
    throw new Error(`Resolved the wrong Netlify site: expected ${siteId}, got ${site.id}.`)
  }
  if (site.name !== EXPECTED_SITE_NAME) {
    throw new Error(
      `Resolved the wrong Netlify site name: expected ${EXPECTED_SITE_NAME}, got ${site.name ?? 'unknown'}.`,
    )
  }
  if (site.custom_domain !== EXPECTED_DOMAIN) {
    throw new Error(
      `Resolved the wrong custom domain: expected ${EXPECTED_DOMAIN}, got ${site.custom_domain ?? 'none'}.`,
    )
  }
}

function assertNextRuntime(deploy: NetlifyDeploy): {
  functionName: string
  runtime: string
  generator: string
  invocationMode: string
  deployUrl: string
} {
  const deployUrl = deploy.deploy_ssl_url ?? deploy.ssl_url ?? deploy.url
  if (!deployUrl) {
    throw new Error(`Deploy ${deploy.id} did not expose a usable deploy URL.`)
  }

  const functions = deploy.available_functions ?? []
  if (functions.length === 0 || deploy.summary === 'No functions deployed') {
    throw new Error(
      `Deploy ${deploy.id} is invalid for qline.site because it has no functions deployed.`,
    )
  }

  const serverHandler =
    functions.find(fn => fn.name === '___netlify-server-handler') ??
    functions.find(fn => fn.display_name === 'Next.js Server Handler') ??
    functions.find(fn => fn.dn === 'Next.js Server Handler')

  if (!serverHandler) {
    throw new Error(`Deploy ${deploy.id} is missing the Next.js server handler.`)
  }

  const generator = serverHandler.g ?? serverHandler.generator ?? ''
  const invocationMode = serverHandler.im ?? serverHandler.invocation_mode ?? ''
  const runtime = serverHandler.r ?? serverHandler.runtime ?? ''
  const displayName = serverHandler.dn ?? serverHandler.display_name ?? serverHandler.name ?? 'unknown'

  if (!generator.includes('@netlify/plugin-nextjs')) {
    throw new Error(
      `Deploy ${deploy.id} has the wrong function generator (${generator || 'none'}) for the Next handler.`,
    )
  }
  if (displayName !== 'Next.js Server Handler') {
    throw new Error(`Deploy ${deploy.id} has the wrong server handler display name: ${displayName}.`)
  }
  if (invocationMode !== 'stream') {
    throw new Error(
      `Deploy ${deploy.id} has the wrong invocation mode for the Next handler: ${invocationMode || 'none'}.`,
    )
  }
  if (!runtime.startsWith('nodejs')) {
    throw new Error(`Deploy ${deploy.id} has the wrong runtime for the Next handler: ${runtime}.`)
  }

  return {
    functionName: displayName,
    runtime,
    generator,
    invocationMode,
    deployUrl,
  }
}

async function fetchTextWithRetries(url: string, retries = 8, delayMs = 2500): Promise<string> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'openjaws-qline-deployer/1.0' },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.text()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      await Bun.sleep(delayMs)
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`)
}

function assertContent(content: string, label: string): string[] {
  const missing = REQUIRED_CONTENT_CHECKS.filter(check => !content.includes(check))
  if (missing.length > 0) {
    throw new Error(`${label} is missing required content checks: ${missing.join(', ')}.`)
  }
  return [...REQUIRED_CONTENT_CHECKS]
}

function toWslPath(windowsPath: string): string {
  const normalized = windowsPath.replace(/\\/g, '/')
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/)
  if (!match) {
    throw new Error(`Cannot convert path to WSL form: ${windowsPath}`)
  }
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!}`
}

function extractTrailingJsonObject(stdout: string): string | null {
  const cleaned = stdout
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[\u200b-\u200d\uFEFF]/g, '')
    .trim()
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null
  }
  return cleaned.slice(firstBrace, lastBrace + 1)
}

async function runWslCommand(command: string, env: Record<string, string>): Promise<string> {
  const passthroughKeys = Object.keys(env)
  const existingWslEnv = process.env.WSLENV?.trim()
  const wslEnvEntries = existingWslEnv ? existingWslEnv.split(':').filter(Boolean) : []
  for (const key of passthroughKeys) {
    const marker = `${key}/u`
    if (!wslEnvEntries.includes(marker)) {
      wslEnvEntries.push(marker)
    }
  }
  const result = await execa(
    'wsl.exe',
    ['bash', '-lc', command],
    {
      cwd: process.cwd(),
      env: {
        ...env,
        WSLENV: wslEnvEntries.join(':'),
      },
      timeout: 30 * 60 * 1000,
      windowsHide: true,
    },
  )
  return result.stdout
}

async function createDraftDeploy(repoRoot: string, siteId: string, token: string): Promise<string> {
  const websiteDir = toWslPath(resolve(repoRoot, 'website'))
  const command = [
    'set -euo pipefail',
    'if [ -n "${QLINE_WSL_NODE_BIN:-}" ]; then export PATH="${QLINE_WSL_NODE_BIN}:$PATH"; fi',
    'if [ -d "$HOME/.local/node-v22.22.2-linux-x64/bin" ]; then export PATH="$HOME/.local/node-v22.22.2-linux-x64/bin:$PATH"; fi',
    'cd ' + JSON.stringify(websiteDir),
    'npx -y netlify build --context production',
    `npx -y netlify deploy --no-build --site ${JSON.stringify(siteId)} --dir .netlify/static --functions .netlify/functions-internal --json`,
  ].join(' && ')

  const stdout = await runWslCommand(command, { NETLIFY_AUTH_TOKEN: token })
  const deployJson = extractTrailingJsonObject(stdout)
  if (!deployJson) {
    throw new Error('Netlify deploy command did not return a parseable JSON line.')
  }
  const deploy = JSON.parse(deployJson) as { deploy_id?: string; id?: string }
  const deployId = deploy.deploy_id ?? deploy.id
  if (!deployId) {
    throw new Error('Netlify deploy command did not return a deploy id.')
  }
  return deployId
}

async function promoteDeploy(siteId: string, deployId: string, token: string): Promise<void> {
  const data = JSON.stringify({ site_id: siteId, deploy_id: deployId }).replace(/"/g, '\\"')
  const command = [
    'set -euo pipefail',
    'if [ -n "${QLINE_WSL_NODE_BIN:-}" ]; then export PATH="${QLINE_WSL_NODE_BIN}:$PATH"; fi',
    'if [ -d "$HOME/.local/node-v22.22.2-linux-x64/bin" ]; then export PATH="$HOME/.local/node-v22.22.2-linux-x64/bin:$PATH"; fi',
    `npx -y netlify api restoreSiteDeploy --data "${data}"`,
  ].join(' && ')
  await runWslCommand(command, { NETLIFY_AUTH_TOKEN: token })
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const repoRoot = resolve(process.cwd())
  const token = readNetlifyAuthToken(repoRoot)

  const site = await netlifyApi<NetlifySite>(token, `/sites/${options.siteId}`)
  assertSiteIdentity(site, options.siteId)

  let promotedDeployId = site.published_deploy_id ?? site.published_deploy?.id ?? null
  let draftDeployId: string | null = null

  if (options.promote) {
    draftDeployId = await createDraftDeploy(repoRoot, options.siteId, token)
    const draftDeploy = await netlifyApi<NetlifyDeploy>(token, `/deploys/${draftDeployId}`)
    const draftRuntime = assertNextRuntime(draftDeploy)
    const draftContent = await fetchTextWithRetries(draftRuntime.deployUrl)
    assertContent(draftContent, `Draft deploy ${draftDeployId}`)
    await promoteDeploy(options.siteId, draftDeployId, token)
    promotedDeployId = draftDeployId
  }

  if (!promotedDeployId) {
    throw new Error(`Site ${options.siteId} does not have a published deploy id.`)
  }

  const liveDeploy = await netlifyApi<NetlifyDeploy>(token, `/deploys/${promotedDeployId}`)
  const liveRuntime = assertNextRuntime(liveDeploy)
  const apexContent = await fetchTextWithRetries(`https://${EXPECTED_DOMAIN}`)
  const termsContent = await fetchTextWithRetries(`https://${EXPECTED_DOMAIN}/terms`)
  const checks = assertContent(apexContent, `https://${EXPECTED_DOMAIN}`)

  if (!termsContent.toLowerCase().includes('<html')) {
    throw new Error(`https://${EXPECTED_DOMAIN}/terms did not return a valid HTML document.`)
  }

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        mode: options.promote ? 'promote' : 'check-live',
        siteId: options.siteId,
        siteName: site.name,
        customDomain: site.custom_domain,
        publishedDeployId: promotedDeployId,
        draftDeployId,
        nextHandler: {
          name: liveRuntime.functionName,
          runtime: liveRuntime.runtime,
          generator: liveRuntime.generator,
          invocationMode: liveRuntime.invocationMode,
        },
        checks: {
          uniqueDeployUrl: liveRuntime.deployUrl,
          apexUrl: `https://${EXPECTED_DOMAIN}`,
          apexStatus: 200,
          termsStatus: 200,
          content: checks,
        },
      },
      null,
      2,
    ),
  )
}

await main()
