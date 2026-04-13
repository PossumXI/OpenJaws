import type { Command } from '../../types/command.js'

const statsCommand: Command = {
  type: 'local',
  name: 'stats',
  description: 'Stats are unavailable in this OpenJaws compatibility build.',
  isEnabled: () => false,
  supportsNonInteractive: true,
  async load() {
    return {
      async call() {
        return {
          type: 'text',
          value: 'Stats are unavailable in this OpenJaws compatibility build.',
        }
      },
    }
  },
}

export default statsCommand
