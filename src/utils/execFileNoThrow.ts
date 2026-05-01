// This file represents useful wrappers over node:child_process
// These wrappers ease error handling and cross-platform compatbility
// By using execa, Windows automatically gets shell escaping + BAT / CMD handling

import { type ExecaError, execa } from 'execa'
import { basename } from 'path'
import { getCwd } from '../utils/cwd.js'
import { logError } from './log.js'

export { execSyncWithDefaults_DEPRECATED } from './execFileNoThrowPortable.js'

const MS_IN_SECOND = 1000
const SECONDS_IN_MINUTE = 60
const MACOS_LSREGISTER_EXECUTABLE =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

const KNOWN_EXECUTABLE_FILES = [
  MACOS_LSREGISTER_EXECUTABLE,
  '/usr/libexec/PlistBuddy',
  'apk',
  'brave',
  'brave-browser',
  'bun',
  'chrome',
  'chromium',
  'chromium-browser',
  'clip',
  'cmd',
  'cmd.exe',
  'code',
  'codesign',
  'coder',
  'cursor',
  'defaults',
  'dpkg',
  'explorer',
  'firefox',
  'firefox-developer-edition',
  'gh',
  'git',
  'google-chrome',
  'google-chrome-stable',
  'it2',
  'killall',
  'ls',
  'mdfind',
  'microsoft-edge',
  'microsoft-edge-stable',
  'node',
  'npm',
  'open',
  'openjaws',
  'opera',
  'osascript',
  'pacman',
  'pbcopy',
  'pbpaste',
  'pdfinfo',
  'pdftoppm',
  'powershell.exe',
  'reg',
  'rg',
  'rpm',
  'rundll32',
  'scp',
  'security',
  'ssh',
  'test',
  'tmux',
  'vivaldi',
  'vivaldi-stable',
  'which',
  'windsurf',
  'wl-copy',
  'wsl',
  'xattr',
  'xclip',
  'xdg-mime',
  'xdg-open',
  'xsel',
] as const

type KnownExecutableFile = (typeof KNOWN_EXECUTABLE_FILES)[number]

const KNOWN_EXECUTABLE_FILE_SET = new Set<string>(KNOWN_EXECUTABLE_FILES)

type ExecFileOptions = {
  abortSignal?: AbortSignal
  timeout?: number
  preserveOutputOnError?: boolean
  // Setting useCwd=false avoids circular dependencies during initialization
  // getCwd() -> PersistentShell -> logEvent() -> execFileNoThrow
  useCwd?: boolean
  env?: NodeJS.ProcessEnv
  stdin?: 'ignore' | 'inherit' | 'pipe'
  input?: string
}

export function execFileNoThrow(
  file: string,
  args: string[],
  options: ExecFileOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    useCwd: true,
  },
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return execFileNoThrowWithCwd(file, args, {
    abortSignal: options.abortSignal,
    timeout: options.timeout,
    preserveOutputOnError: options.preserveOutputOnError,
    cwd: options.useCwd ? getCwd() : undefined,
    env: options.env,
    stdin: options.stdin,
    input: options.input,
  })
}

type ExecFileWithCwdOptions = {
  abortSignal?: AbortSignal
  timeout?: number
  preserveOutputOnError?: boolean
  maxBuffer?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: 'ignore' | 'inherit' | 'pipe'
  input?: string
}

type ExecaExecutionOptions = {
  maxBuffer?: number
  signal?: AbortSignal
  timeout?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: 'ignore' | 'inherit' | 'pipe'
  input?: string
  shell: false
  reject: false
}

type ExecaLauncher = (
  args: string[],
  options: ExecaExecutionOptions,
) => ReturnType<typeof execa>

type ExecaResultWithError = {
  shortMessage?: string
  signal?: string
}

type ExecFileResult = {
  stdout: string
  stderr: string
  code: number
  error?: string
}

/**
 * Extracts a human-readable error message from an execa result.
 *
 * Priority order:
 * 1. shortMessage - execa's human-readable error (e.g., "Command failed with exit code 1: ...")
 *    This is preferred because it already includes signal info when a process is killed,
 *    making it more informative than just the signal name.
 * 2. signal - the signal that killed the process (e.g., "SIGTERM")
 * 3. errorCode - fallback to just the numeric exit code
 */
function getErrorMessage(
  result: ExecaResultWithError,
  errorCode: number,
): string {
  if (result.shortMessage) {
    return result.shortMessage
  }
  if (typeof result.signal === 'string') {
    return result.signal
  }
  return String(errorCode)
}

function assertNoNulByte(value: string, label: string): void {
  if (value.includes('\0')) {
    throw new Error(`${label} must not contain NUL bytes`)
  }
}

function toKnownExecutableFile(file: string): KnownExecutableFile | null {
  return KNOWN_EXECUTABLE_FILE_SET.has(file)
    ? (file as KnownExecutableFile)
    : null
}

function validateArgs(args: string[]): string | null {
  try {
    for (const [index, arg] of args.entries()) {
      assertNoNulByte(arg, `Argument ${index}`)
    }
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid command arguments'
  }
}

/**
 * execFile, but always resolves (never throws)
 */
export function execFileNoThrowWithCwd(
  file: string,
  args: string[],
  options: ExecFileWithCwdOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    maxBuffer: 1_000_000,
  },
): Promise<ExecFileResult> {
  const knownFile = toKnownExecutableFile(file)
  if (!knownFile) {
    const message = `Unsupported executable "${file}". Use a known executable name or a trusted resolved executable helper.`
    return Promise.resolve({ stdout: '', stderr: message, code: 1, error: message })
  }
  return execKnownFileNoThrow(knownFile, args, options)
}

export function execOpenJawsSelfNoThrow(
  args: string[],
  options: ExecFileOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    useCwd: true,
  },
): Promise<ExecFileResult> {
  const entrypoint = process.argv[1]
  const runtimeName = basename(process.execPath).toLowerCase()
  const execOptions = {
    abortSignal: options.abortSignal,
    timeout: options.timeout,
    preserveOutputOnError: options.preserveOutputOnError,
    cwd: options.useCwd ? getCwd() : undefined,
    env: options.env,
    stdin: options.stdin,
    input: options.input,
  }

  if (runtimeName === 'bun' || runtimeName === 'bun.exe') {
    return execKnownFileNoThrow(
      'bun',
      entrypoint ? [entrypoint, ...args] : args,
      execOptions,
    )
  }
  if (runtimeName === 'node' || runtimeName === 'node.exe') {
    return execKnownFileNoThrow(
      'node',
      entrypoint ? [entrypoint, ...args] : args,
      execOptions,
    )
  }
  return execKnownFileNoThrow('openjaws', args, execOptions)
}

const KNOWN_EXECUTABLE_LAUNCHERS: Record<KnownExecutableFile, ExecaLauncher> = {
  [MACOS_LSREGISTER_EXECUTABLE]: (args, options) =>
    execa(MACOS_LSREGISTER_EXECUTABLE, args, options),
  '/usr/libexec/PlistBuddy': (args, options) =>
    execa('/usr/libexec/PlistBuddy', args, options),
  apk: (args, options) => execa('apk', args, options),
  brave: (args, options) => execa('brave', args, options),
  'brave-browser': (args, options) => execa('brave-browser', args, options),
  bun: (args, options) => execa('bun', args, options),
  chrome: (args, options) => execa('chrome', args, options),
  chromium: (args, options) => execa('chromium', args, options),
  'chromium-browser': (args, options) =>
    execa('chromium-browser', args, options),
  clip: (args, options) => execa('clip', args, options),
  cmd: (args, options) => execa('cmd', args, options),
  'cmd.exe': (args, options) => execa('cmd.exe', args, options),
  code: (args, options) => execa('code', args, options),
  codesign: (args, options) => execa('codesign', args, options),
  coder: (args, options) => execa('coder', args, options),
  cursor: (args, options) => execa('cursor', args, options),
  defaults: (args, options) => execa('defaults', args, options),
  dpkg: (args, options) => execa('dpkg', args, options),
  explorer: (args, options) => execa('explorer', args, options),
  firefox: (args, options) => execa('firefox', args, options),
  'firefox-developer-edition': (args, options) =>
    execa('firefox-developer-edition', args, options),
  gh: (args, options) => execa('gh', args, options),
  git: (args, options) => execa('git', args, options),
  'google-chrome': (args, options) => execa('google-chrome', args, options),
  'google-chrome-stable': (args, options) =>
    execa('google-chrome-stable', args, options),
  it2: (args, options) => execa('it2', args, options),
  killall: (args, options) => execa('killall', args, options),
  ls: (args, options) => execa('ls', args, options),
  mdfind: (args, options) => execa('mdfind', args, options),
  'microsoft-edge': (args, options) => execa('microsoft-edge', args, options),
  'microsoft-edge-stable': (args, options) =>
    execa('microsoft-edge-stable', args, options),
  node: (args, options) => execa('node', args, options),
  npm: (args, options) => execa('npm', args, options),
  open: (args, options) => execa('open', args, options),
  openjaws: (args, options) => execa('openjaws', args, options),
  opera: (args, options) => execa('opera', args, options),
  osascript: (args, options) => execa('osascript', args, options),
  pacman: (args, options) => execa('pacman', args, options),
  pbcopy: (args, options) => execa('pbcopy', args, options),
  pbpaste: (args, options) => execa('pbpaste', args, options),
  pdfinfo: (args, options) => execa('pdfinfo', args, options),
  pdftoppm: (args, options) => execa('pdftoppm', args, options),
  'powershell.exe': (args, options) =>
    execa('powershell.exe', args, options),
  reg: (args, options) => execa('reg', args, options),
  rg: (args, options) => execa('rg', args, options),
  rpm: (args, options) => execa('rpm', args, options),
  rundll32: (args, options) => execa('rundll32', args, options),
  scp: (args, options) => execa('scp', args, options),
  security: (args, options) => execa('security', args, options),
  ssh: (args, options) => execa('ssh', args, options),
  test: (args, options) => execa('test', args, options),
  tmux: (args, options) => execa('tmux', args, options),
  vivaldi: (args, options) => execa('vivaldi', args, options),
  'vivaldi-stable': (args, options) => execa('vivaldi-stable', args, options),
  which: (args, options) => execa('which', args, options),
  windsurf: (args, options) => execa('windsurf', args, options),
  'wl-copy': (args, options) => execa('wl-copy', args, options),
  wsl: (args, options) => execa('wsl', args, options),
  xattr: (args, options) => execa('xattr', args, options),
  xclip: (args, options) => execa('xclip', args, options),
  'xdg-mime': (args, options) => execa('xdg-mime', args, options),
  'xdg-open': (args, options) => execa('xdg-open', args, options),
  xsel: (args, options) => execa('xsel', args, options),
}

function execKnownFileNoThrow(
  file: KnownExecutableFile,
  args: string[],
  options: ExecFileWithCwdOptions,
): Promise<ExecFileResult> {
  return runExecaNoThrow(args, options, KNOWN_EXECUTABLE_LAUNCHERS[file])
}

function runExecaNoThrow(
  args: string[],
  {
    abortSignal,
    timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: finalPreserveOutput = true,
    cwd: finalCwd,
    env: finalEnv,
    maxBuffer,
    stdin: finalStdin,
    input: finalInput,
  }: ExecFileWithCwdOptions,
  launch: ExecaLauncher,
): Promise<ExecFileResult> {
  return new Promise(resolve => {
    const argError = validateArgs(args)
    if (argError) {
      void resolve({ stdout: '', stderr: argError, code: 1, error: argError })
      return
    }

    // Use execa for cross-platform .bat/.cmd compatibility on Windows.
    // The shared wrapper intentionally uses argv execution without a shell; callers
    // that accept command strings must parse them before reaching this boundary.
    launch(args, {
      maxBuffer,
      signal: abortSignal,
      timeout: finalTimeout,
      cwd: finalCwd,
      env: finalEnv,
      stdin: finalStdin,
      input: finalInput,
      shell: false,
      reject: false, // Don't throw on non-zero exit codes
    })
      .then(result => {
        if (result.failed) {
          if (finalPreserveOutput) {
            const errorCode = result.exitCode ?? 1
            void resolve({
              stdout: result.stdout || '',
              stderr: result.stderr || '',
              code: errorCode,
              error: getErrorMessage(
                result as unknown as ExecaResultWithError,
                errorCode,
              ),
            })
          } else {
            void resolve({ stdout: '', stderr: '', code: result.exitCode ?? 1 })
          }
        } else {
          void resolve({
            stdout: result.stdout,
            stderr: result.stderr,
            code: 0,
          })
        }
      })
      .catch((error: ExecaError) => {
        logError(error)
        void resolve({ stdout: '', stderr: '', code: 1 })
      })
  })
}
