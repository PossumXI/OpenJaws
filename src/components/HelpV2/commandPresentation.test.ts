import { describe, expect, test } from 'bun:test'
import type { Command } from '../../types/command.js'
import {
  formatCommandAliases,
  formatCommandSummary,
  formatCommandUsage,
  resolveQuickStartCommands,
} from './commandPresentation.js'

function createPromptCommand(
  name: string,
  description: string,
  overrides: Partial<Command> = {},
): Command {
  return {
    type: 'prompt',
    name,
    description,
    progressMessage: 'working',
    contentLength: 0,
    source: 'builtin',
    async getPromptForCommand() {
      return []
    },
    ...overrides,
  } as Command
}

describe('commandPresentation', () => {
  test('formats command usage with argument hints', () => {
    const command = createPromptCommand('preview', 'Preview a web app', {
      argumentHint: '[url]',
    })

    expect(formatCommandUsage(command)).toBe('/preview [url]')
  })

  test('formats aliases without repeating canonical names', () => {
    const command = createPromptCommand('config', 'Open settings', {
      aliases: ['settings', 'config'],
    })

    expect(formatCommandAliases(command)).toBe('Aliases: /settings')
  })

  test('includes aliases in the summarized command description', () => {
    const command = createPromptCommand('provider', 'Manage provider settings', {
      aliases: ['providers', 'apikey'],
    })

    expect(formatCommandSummary(command)).toBe(
      'Manage provider settings  Aliases: /providers, /apikey',
    )
  })

  test('resolves quick start commands in the intended order', () => {
    const commands = [
      createPromptCommand('preview', 'Preview a web app', {
        aliases: ['browse'],
      }),
      createPromptCommand('theme', 'Adjust the theme'),
      createPromptCommand('help', 'Show help'),
      createPromptCommand('apex', 'Open the command center'),
      createPromptCommand('privacy-settings', 'Adjust privacy controls'),
      createPromptCommand('config', 'Open settings', {
        aliases: ['settings'],
      }),
      createPromptCommand('status', 'Show runtime status'),
    ]

    expect(
      resolveQuickStartCommands(commands).map(command => command.name),
    ).toEqual(
      ['help', 'config', 'theme', 'privacy-settings', 'preview', 'apex'],
    )
  })
})
