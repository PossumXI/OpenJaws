import type { ServerConfig } from './types.js'

function displayHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1'
  }
  return host
}

export function buildConnectUrl(
  config: Pick<ServerConfig, 'host' | 'unix'>,
  authToken: string,
  actualPort: number,
): string {
  if (config.unix) {
    return `cc+unix://${encodeURIComponent(config.unix)}?token=${encodeURIComponent(authToken)}`
  }
  return `cc://${displayHost(config.host)}:${actualPort}?token=${encodeURIComponent(authToken)}`
}

export function printBanner(
  config: ServerConfig,
  authToken: string,
  actualPort: number,
): void {
  const connectUrl = buildConnectUrl(config, authToken, actualPort)
  process.stderr.write(
    [
      'OpenJaws Direct Connect server is running.',
      'OpenJaws site: https://qline.site',
      `HTTP: ${config.unix ? `unix:${config.unix}` : `http://${displayHost(config.host)}:${actualPort}`}`,
      `Connect: ${connectUrl}`,
      '',
    ].join('\n'),
  )
}
