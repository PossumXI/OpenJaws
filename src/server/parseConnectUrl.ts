export type ParsedConnectUrl = {
  serverUrl: string
  authToken?: string
}

function readAuthToken(url: URL): string | undefined {
  const token =
    url.searchParams.get('token') ??
    url.searchParams.get('authToken') ??
    url.searchParams.get('auth_token') ??
    undefined
  if (token?.trim()) {
    return token
  }
  if (url.password) {
    return decodeURIComponent(url.password)
  }
  if (url.username) {
    return decodeURIComponent(url.username)
  }
  return undefined
}

export function parseConnectUrl(rawUrl: string): ParsedConnectUrl {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid Direct Connect URL: ${rawUrl}`)
  }

  if (url.protocol === 'cc+unix:') {
    throw new Error(
      'Direct Connect unix socket URLs are not supported by this build. Use cc://host:port instead.',
    )
  }

  if (url.protocol !== 'cc:') {
    throw new Error(
      `Unsupported Direct Connect URL protocol ${url.protocol || '(missing)'}`,
    )
  }
  if (!url.hostname) {
    throw new Error('Direct Connect URL is missing a host.')
  }

  const path = url.pathname && url.pathname !== '/' ? url.pathname : ''
  const httpUrl = new URL(`http://${url.host}${path}`)

  return {
    serverUrl: httpUrl.toString().replace(/\/$/, ''),
    authToken: readAuthToken(url),
  }
}
