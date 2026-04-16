import { NextResponse } from 'next/server'
import {
  proxyHostedQServiceRequest,
  resolveHostedQServiceMode,
} from '../../../lib/hostedQService'
import { issueHostedQApiKey } from '../../../lib/qHostedAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type KeyRequest = {
  email?: string
  label?: string
}

export async function POST(request: Request): Promise<NextResponse> {
  if (resolveHostedQServiceMode() === 'proxy') {
    return proxyHostedQServiceRequest({
      action: 'keys',
      request,
    })
  }

  const body = (await request.json().catch(() => ({}))) as KeyRequest
  const result = await issueHostedQApiKey({
    email: typeof body.email === 'string' ? body.email : null,
    label: typeof body.label === 'string' ? body.label : null,
  })

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  })
}
