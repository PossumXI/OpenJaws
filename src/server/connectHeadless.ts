import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { DirectConnectConfig } from './directConnectManager.js'
import { jsonStringify } from '../utils/slowOperations.js'

function buildUserMessage(prompt: string): string {
  return `${jsonStringify({
    type: 'user',
    session_id: '',
    message: {
      role: 'user',
      content: prompt,
    },
    parent_tool_use_id: null,
  })}\n`
}

function extractText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join('')
  }
  if (typeof value === 'object' && value !== null) {
    if ('text' in value) {
      return extractText(value.text)
    }
    if ('content' in value) {
      return extractText(value.content)
    }
  }
  return ''
}

function renderTextMessage(message: SDKMessage): string | null {
  if (message.type === 'assistant') {
    return extractText(message.message?.content ?? null)
  }
  if (message.type === 'result') {
    return message.result ?? null
  }
  return null
}

function normalizeWsLine(line: string): string {
  return line.endsWith('\n') ? line : `${line}\n`
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return ''
  }
  process.stdin.setEncoding('utf8')
  let data = ''
  for await (const chunk of process.stdin) {
    data += chunk
  }
  return data
}

export async function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat: string,
  interactive: boolean,
): Promise<void> {
  const resolvedPrompt = prompt || (interactive ? await readStdin() : '')
  const headers: Record<string, string> = {}
  if (config.authToken) {
    headers.authorization = `Bearer ${config.authToken}`
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let textOutput = ''
    let resultMessage: SDKMessage | null = null
    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      if (error) {
        reject(error)
      } else {
        if (outputFormat === 'json') {
          process.stdout.write(`${jsonStringify(resultMessage ?? {})}\n`)
        } else if (outputFormat !== 'stream-json' && textOutput.trim()) {
          process.stdout.write(`${textOutput.trimEnd()}\n`)
        }
        resolve()
      }
    }

    const ws = new WebSocket(config.wsUrl, {
      headers,
    } as unknown as string[])
    const timeout = setTimeout(() => {
      try {
        ws.close()
      } catch {}
      finish(new Error(`Timed out connecting to OpenJaws Direct Connect at ${config.wsUrl}`))
    }, 30_000)
    timeout.unref?.()

    ws.addEventListener('open', () => {
      clearTimeout(timeout)
      if (resolvedPrompt.trim()) {
        ws.send(buildUserMessage(resolvedPrompt))
      } else {
        try {
          ws.close()
        } catch {}
        finish(new Error('OpenJaws Direct Connect headless mode requires a prompt or stdin.'))
      }
    })

    ws.addEventListener('message', event => {
      const payload =
        typeof event.data === 'string' ? event.data : String(event.data)
      for (const line of payload.split(/\r?\n/).filter(Boolean)) {
        if (outputFormat === 'stream-json') {
          process.stdout.write(normalizeWsLine(line))
          continue
        }
        let message: SDKMessage
        try {
          message = JSON.parse(line) as SDKMessage
        } catch {
          continue
        }
        const rendered = renderTextMessage(message)
        if (rendered) {
          textOutput += rendered
        }
        if (message.type === 'result') {
          resultMessage = message
          if (message.is_error) {
            process.exitCode = 1
          }
          try {
            ws.close()
          } catch {}
          finish()
        }
      }
    })

    ws.addEventListener('error', () => {
      clearTimeout(timeout)
      finish(new Error(`OpenJaws Direct Connect WebSocket error at ${config.wsUrl}`))
    })

    ws.addEventListener('close', () => {
      clearTimeout(timeout)
      finish()
    })
  })
}
