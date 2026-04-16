import { NextResponse } from 'next/server'
import {
  proxyHostedQServiceRequest,
  resolveHostedQServiceMode,
} from '../../../lib/hostedQService'
import { readHostedQUsage } from '../../../lib/qHostedAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UsageRequest = {
  email?: string
}

export async function POST(request: Request): Promise<NextResponse> {
  if (resolveHostedQServiceMode() === 'proxy') {
    return proxyHostedQServiceRequest({
      action: 'usage',
      request,
    })
  }

  const body = (await request.json().catch(() => ({}))) as UsageRequest
  const result = await readHostedQUsage({
    email: typeof body.email === 'string' ? body.email : null,
  })

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  })
}
