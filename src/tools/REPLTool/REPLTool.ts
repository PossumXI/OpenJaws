import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { REPL_TOOL_NAME } from './constants.js'

const inputSchema = z.object({})

export const REPLTool = buildTool({
  name: REPL_TOOL_NAME,
  maxResultSizeChars: 4_096,
  get inputSchema() {
    return inputSchema
  },
  async description() {
    return 'Unavailable in this OpenJaws compatibility build.'
  },
  async prompt() {
    return 'Unavailable in this OpenJaws compatibility build.'
  },
  async call() {
    return {
      data: {
        message: 'REPL mode is unavailable in this OpenJaws compatibility build.',
      },
    }
  },
  isEnabled() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
})
