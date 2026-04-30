import { NextResponse } from 'next/server'
import { resolveJawsUpdaterResult } from '../../../../../../lib/jawsUpdater'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    target: string
    arch: string
    current_version: string
  }>
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const params = await context.params
  const result = await resolveJawsUpdaterResult(params)

  if (result.status === 204) {
    return new NextResponse(null, {
      status: 204,
      headers: result.headers,
    })
  }

  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  })
}
