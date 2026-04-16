import { NextResponse } from 'next/server'
import {
  proxyHostedQServiceRequest,
  resolveHostedQServiceMode,
} from '../../../lib/hostedQService'
import { signupHostedQUser } from '../../../lib/qHostedAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SignupRequest = {
  email?: string
  plan?: string
}

export async function POST(request: Request): Promise<NextResponse> {
  if (resolveHostedQServiceMode() === 'proxy') {
    return proxyHostedQServiceRequest({
      action: 'signup',
      request,
    })
  }

  const body = (await request.json().catch(() => ({}))) as SignupRequest
  const result = await signupHostedQUser({
    email: typeof body.email === 'string' ? body.email : null,
    plan: typeof body.plan === 'string' ? body.plan : null,
  })

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  })
}
