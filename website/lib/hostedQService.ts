import { NextResponse } from 'next/server'

export type HostedQAction = 'signup' | 'checkout' | 'keys' | 'usage'

export type HostedQServiceConfig = {
  siteUrl: string
  auraGenesisUrl: string
  baseUrl: string | null
  serviceToken: string | null
}

export type HostedQServiceMode = 'proxy' | 'filesystem' | 'unconfigured'

const FORWARDED_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-q-plan',
  'x-q-credits-remaining',
  'x-q-credit-reset',
] as const

export function resolveHostedQServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): HostedQServiceConfig {
  return {
    siteUrl: env.NEXT_PUBLIC_SITE_URL ?? 'https://qline.site',
    auraGenesisUrl:
      env.NEXT_PUBLIC_AURA_GENESIS_URL ?? 'https://aura-genesis.org',
    baseUrl: env.Q_HOSTED_SERVICE_BASE_URL?.trim() || null,
    serviceToken: env.Q_HOSTED_SERVICE_TOKEN?.trim() || null,
  }
}

export function resolveHostedQServiceMode(
  env: NodeJS.ProcessEnv = process.env,
): HostedQServiceMode {
  const config = resolveHostedQServiceConfig(env)
  if (config.baseUrl) {
    return 'proxy'
  }

  if (
    env.Q_HOSTED_SERVICE_LOCAL_MODE === 'filesystem' ||
    env.NODE_ENV !== 'production'
  ) {
    return 'filesystem'
  }

  return 'unconfigured'
}

export function buildHostedQServiceTarget(
  config: HostedQServiceConfig,
  action: HostedQAction,
): string | null {
  if (!config.baseUrl) {
    return null
  }

  return `${config.baseUrl.replace(/\/$/, '')}/${action}`
}

export async function proxyHostedQServiceRequest(args: {
  action: HostedQAction
  request: Request
}): Promise<NextResponse> {
  const config = resolveHostedQServiceConfig()
  const target = buildHostedQServiceTarget(config, args.action)

  if (!target) {
    return NextResponse.json(
      {
        ok: false,
        code: 'backend_not_configured',
        message:
          'Hosted Q backend is not configured yet. Set Q_HOSTED_SERVICE_BASE_URL before enabling this route.',
        requiredEnv: ['Q_HOSTED_SERVICE_BASE_URL'],
      },
      { status: 503 },
    )
  }

  let body: unknown = null
  try {
    body = await args.request.json()
  } catch {
    body = null
  }

  const upstream = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-q-site-url': config.siteUrl,
      'x-q-aura-genesis-url': config.auraGenesisUrl,
      'x-q-website-action': args.action,
      ...(config.serviceToken
        ? {
            authorization: `Bearer ${config.serviceToken}`,
          }
        : {}),
    },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  })

  const responseHeaders = new Headers({
    'cache-control': 'no-store',
  })

  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) {
      responseHeaders.set(name, value)
    }
  }

  const contentType = upstream.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? await upstream.json()
    : {
        ok: upstream.ok,
        message: await upstream.text(),
      }

  return NextResponse.json(payload, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
