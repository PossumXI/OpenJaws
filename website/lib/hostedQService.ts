import { NextResponse } from 'next/server'

export type HostedQAction =
  | 'signup'
  | 'checkout'
  | 'keys'
  | 'usage'
  | 'stripe-webhook'

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

export function buildHostedQServiceUnavailableResponse(args: {
  action: HostedQAction
  mode?: HostedQServiceMode
}): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: 'hosted_q_backend_required',
      action: args.action,
      mode: args.mode ?? resolveHostedQServiceMode(),
      message:
        'Hosted Q access is not available on this site until the production hosted-Q backend is configured.',
      requiredEnv: ['Q_HOSTED_SERVICE_BASE_URL'],
    },
    {
      status: 503,
      headers: {
        'cache-control': 'no-store',
      },
    },
  )
}

export async function proxyHostedQServiceJsonPayload(args: {
  action: HostedQAction
  payload: unknown
  headers?: Record<string, string>
}): Promise<NextResponse> {
  const config = resolveHostedQServiceConfig()
  const target = buildHostedQServiceTarget(config, args.action)

  if (!target) {
    return buildHostedQServiceUnavailableResponse({
      action: args.action,
      mode: resolveHostedQServiceMode(),
    })
  }

  const upstream = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-q-site-url': config.siteUrl,
      'x-q-aura-genesis-url': config.auraGenesisUrl,
      'x-q-website-action': args.action,
      ...args.headers,
      ...(config.serviceToken
        ? {
            authorization: `Bearer ${config.serviceToken}`,
          }
        : {}),
    },
    body: JSON.stringify(args.payload ?? {}),
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

export async function proxyHostedQServiceRequest(args: {
  action: HostedQAction
  request: Request
}): Promise<NextResponse> {
  let body: unknown = null
  try {
    body = await args.request.json()
  } catch {
    body = null
  }

  return proxyHostedQServiceJsonPayload({
    action: args.action,
    payload: body ?? {},
  })
}
