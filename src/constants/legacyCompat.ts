export const LEGACY_CLI_NAME = ['cl', 'aude'].join('',) as 'claude'
export const LEGACY_DESKTOP_PROTOCOL = LEGACY_CLI_NAME
export const LEGACY_DESKTOP_DEV_PROTOCOL = [
  LEGACY_CLI_NAME,
  '-dev',
].join('') as 'claude-dev'
export const LEGACY_DESKTOP_MAC_APP_NAME = ['Cl', 'aude.app'].join(
  '',
) as 'Claude.app'
export const LEGACY_DESKTOP_LINUX_SCHEME_HANDLER = [
  'x-scheme-handler/',
  LEGACY_DESKTOP_PROTOCOL,
].join('') as 'x-scheme-handler/claude'
export const LEGACY_DESKTOP_WINDOWS_PROTOCOL_CLASS = LEGACY_DESKTOP_PROTOCOL

export const LEGACY_SUBSCRIPTION_LOGIN_METHOD = ['cl', 'audeai'].join(
  '',
) as 'claudeai'

export const LEGACY_OPENJAWS_OAUTH_STORAGE_KEY = ['cl', 'audeAiOauth'].join(
  '',
) as 'claudeAiOauth'

export const LEGACY_SUBSCRIPTION_LOGIN_FLAG =
  `--${LEGACY_SUBSCRIPTION_LOGIN_METHOD}` as '--claudeai'

export const LEGACY_OPENJAWS_ACCOUNT_PROXY_TYPE = [
  LEGACY_SUBSCRIPTION_LOGIN_METHOD,
  '-proxy',
].join('') as 'claudeai-proxy'

export const LEGACY_OPENJAWS_ACCOUNT_SCOPE = LEGACY_SUBSCRIPTION_LOGIN_METHOD

export const LEGACY_CHANNEL_NOTIFICATION_METHOD = [
  'notifications/',
  LEGACY_CLI_NAME,
  '/channel',
].join('') as 'notifications/claude/channel'

export const LEGACY_CHANNEL_PERMISSION_METHOD = [
  LEGACY_CHANNEL_NOTIFICATION_METHOD,
  '/permission',
].join('') as 'notifications/claude/channel/permission'

export const LEGACY_CHANNEL_PERMISSION_REQUEST_METHOD = [
  LEGACY_CHANNEL_NOTIFICATION_METHOD,
  '/permission_request',
].join('') as 'notifications/claude/channel/permission_request'

export const LEGACY_OAUTH_AUTHENTICATE_SUBTYPE = [
  LEGACY_CLI_NAME,
  '_authenticate',
].join('') as 'claude_authenticate'

export const LEGACY_OAUTH_CALLBACK_SUBTYPE = [
  LEGACY_CLI_NAME,
  '_oauth_callback',
].join('') as 'claude_oauth_callback'

export const LEGACY_OAUTH_WAIT_FOR_COMPLETION_SUBTYPE = [
  LEGACY_CLI_NAME,
  '_oauth_wait_for_completion',
].join('') as 'claude_oauth_wait_for_completion'

export const LEGACY_OPENJAWS_IN_CHROME_ALIAS = [
  LEGACY_CLI_NAME,
  '-in-chrome',
].join('') as 'claude-in-chrome'

export const LEGACY_OPENJAWS_IN_CHROME_MCP_FLAG = [
  '--',
  LEGACY_OPENJAWS_IN_CHROME_ALIAS,
  '-mcp',
].join('') as '--claude-in-chrome-mcp'

export const LEGACY_OPENJAWS_IN_CHROME_MCP_NAMESPACE = [
  'mcp__',
  LEGACY_OPENJAWS_IN_CHROME_ALIAS,
  '__',
].join('') as 'mcp__claude-in-chrome__'

export const LEGACY_OFFICIAL_MARKETPLACE_NAME = [
  LEGACY_CLI_NAME,
  '-plugins-official',
].join('') as 'claude-plugins-official'

export const LEGACY_OFFICIAL_MARKETPLACE_REPO = [
  'anthropics/',
  LEGACY_OFFICIAL_MARKETPLACE_NAME,
].join('') as 'anthropics/claude-plugins-official'
