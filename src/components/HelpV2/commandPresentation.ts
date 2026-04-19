import {
  formatDescriptionWithSource,
  getCommandName,
  type Command,
} from '../../commands.js'

export const QUICK_START_COMMAND_NAMES = [
  'help',
  'config',
  'theme',
  'privacy-settings',
  'preview',
  'apex',
] as const

export function resolveQuickStartCommands(commands: Command[]): Command[] {
  const byName = new Map<string, Command>()

  for (const command of commands) {
    byName.set(command.name, command)
    byName.set(getCommandName(command), command)
    for (const alias of command.aliases ?? []) {
      byName.set(alias, command)
    }
  }

  const seen = new Set<string>()
  return QUICK_START_COMMAND_NAMES.map(name => byName.get(name))
    .filter((command): command is Command => command !== undefined)
    .filter(command => {
      const commandName = getCommandName(command)
      if (seen.has(commandName)) {
        return false
      }
      seen.add(commandName)
      return true
    })
}

export function formatCommandUsage(command: Command): string {
  const commandName = `/${getCommandName(command)}`
  const argumentHint = command.argumentHint?.trim()
  return argumentHint ? `${commandName} ${argumentHint}` : commandName
}

export function formatCommandAliases(command: Command): string | undefined {
  const seen = new Set([command.name, getCommandName(command)])
  const aliases = (command.aliases ?? []).filter(alias => {
    if (seen.has(alias)) {
      return false
    }
    seen.add(alias)
    return true
  })

  if (aliases.length === 0) {
    return undefined
  }

  return `Aliases: ${aliases.map(alias => `/${alias}`).join(', ')}`
}

export function formatCommandSummary(command: Command): string {
  const aliasText = formatCommandAliases(command)
  return aliasText
    ? `${formatDescriptionWithSource(command)}  ${aliasText}`
    : formatDescriptionWithSource(command)
}
