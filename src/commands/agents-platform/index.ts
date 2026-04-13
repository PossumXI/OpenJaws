import type { Command } from '../../types/command.js'

const agentsPlatform: Command = {
  type: 'local',
  name: 'agents-platform',
  description:
    'Agents platform tools are unavailable in this OpenJaws compatibility build.',
  isEnabled: () => false,
  supportsNonInteractive: true,
  async load() {
    return {
      async call() {
        return {
          type: 'text',
          value:
            'Agents platform tools are unavailable in this OpenJaws compatibility build.',
        }
      },
    }
  },
}

export default agentsPlatform
