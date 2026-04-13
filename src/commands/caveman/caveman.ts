import type { LocalCommandCall } from '../../types/command.js'
import { DEFAULT_OUTPUT_STYLE_NAME } from '../../constants/outputStyles.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

type CavemanStyle = 'Caveman Lite' | 'Caveman' | 'Caveman Ultra'

const CAVEMAN_STYLES: readonly CavemanStyle[] = [
  'Caveman Lite',
  'Caveman',
  'Caveman Ultra',
]

function getCurrentOutputStyle(): string {
  return getInitialSettings().outputStyle ?? DEFAULT_OUTPUT_STYLE_NAME
}

function isCavemanStyle(style: string): style is CavemanStyle {
  return (CAVEMAN_STYLES as readonly string[]).includes(style)
}

function normalizeRequestedStyle(
  rawArgs: string,
): CavemanStyle | 'off' | 'status' | 'help' | 'toggle' | null {
  switch (rawArgs.trim().toLowerCase()) {
    case '':
    case 'toggle':
      return 'toggle'
    case 'on':
    case 'full':
      return 'Caveman'
    case 'lite':
      return 'Caveman Lite'
    case 'ultra':
      return 'Caveman Ultra'
    case 'off':
    case 'normal':
    case 'default':
      return 'off'
    case 'status':
      return 'status'
    case 'help':
    case '-h':
    case '--help':
      return 'help'
    default:
      return null
  }
}

function setOutputStyle(style: string): { type: 'text'; value: string } {
  const result = updateSettingsForSource('userSettings', {
    outputStyle: style,
  })

  if (result.error) {
    return {
      type: 'text' as const,
      value:
        'Failed to update output style. Check your settings file for syntax errors.',
    }
  }

  settingsChangeDetector.notifyChange('userSettings')
  return {
    type: 'text' as const,
    value:
      style === DEFAULT_OUTPUT_STYLE_NAME
        ? 'Caveman off. Future responses use the default style.'
        : `${style} on. Future responses use compressed output.`,
  }
}

function getStatusMessage(): string {
  const currentStyle = getCurrentOutputStyle()
  if (isCavemanStyle(currentStyle)) {
    return `Caveman status: ${currentStyle.toLowerCase()}`
  }
  return `Caveman status: off (current style: ${currentStyle})`
}

function getHelpMessage(): string {
  return [
    '/caveman',
    '/caveman on',
    '/caveman lite',
    '/caveman full',
    '/caveman ultra',
    '/caveman off',
    '/caveman status',
    '',
    'Turns on terse output styles to reduce filler and token spend.',
  ].join('\n')
}

export const call: LocalCommandCall = async args => {
  const action = normalizeRequestedStyle(args ?? '')
  if (action === null) {
    return {
      type: 'text' as const,
      value: getHelpMessage(),
    }
  }

  if (action === 'help') {
    return {
      type: 'text' as const,
      value: getHelpMessage(),
    }
  }

  if (action === 'status') {
    return {
      type: 'text' as const,
      value: getStatusMessage(),
    }
  }

  if (action === 'toggle') {
    return isCavemanStyle(getCurrentOutputStyle())
      ? setOutputStyle(DEFAULT_OUTPUT_STYLE_NAME)
      : setOutputStyle('Caveman')
  }

  if (action === 'off') {
    return setOutputStyle(DEFAULT_OUTPUT_STYLE_NAME)
  }

  return setOutputStyle(action)
}
