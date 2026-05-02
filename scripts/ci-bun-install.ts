#!/usr/bin/env bun

const rawArgs = process.argv.slice(2)
let maxAttempts = Number.parseInt(process.env.OPENJAWS_CI_INSTALL_ATTEMPTS ?? '3', 10)
let retryDelayMs = Number.parseInt(process.env.OPENJAWS_CI_INSTALL_RETRY_DELAY_MS ?? '10000', 10)
const installArgs: string[] = []

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index]
  if (arg === '--max-attempts') {
    const value = rawArgs[index + 1]
    index += 1
    maxAttempts = Number.parseInt(value ?? '', 10)
    continue
  }
  if (arg === '--retry-delay-ms') {
    const value = rawArgs[index + 1]
    index += 1
    retryDelayMs = Number.parseInt(value ?? '', 10)
    continue
  }
  installArgs.push(arg)
}

if (!Number.isFinite(maxAttempts) || maxAttempts < 1) {
  maxAttempts = 3
}
if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
  retryDelayMs = 10000
}

const bunExecutable = process.execPath || 'bun'
const command = [bunExecutable, 'install', ...installArgs]
const commandLabel = ['bun', 'install', ...installArgs].join(' ')

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`[ci-bun-install] attempt ${attempt}/${maxAttempts}: ${commandLabel}`)
  const processResult = Bun.spawn(command, {
    env: process.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await processResult.exited
  if (exitCode === 0) {
    process.exit(0)
  }

  if (attempt === maxAttempts) {
    console.error(`[ci-bun-install] failed after ${maxAttempts} attempts`)
    process.exit(exitCode)
  }

  console.warn(`[ci-bun-install] install exited with ${exitCode}; retrying after ${retryDelayMs}ms`)
  await new Promise(resolve => setTimeout(resolve, retryDelayMs))
}
