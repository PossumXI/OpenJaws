export type StartupHarnessStatus = 'ready' | 'degraded' | 'blocked'

export type StartupHarnessIssueCode =
  | 'remote_control_startup'
  | 'provider_auth'
  | 'git_bash'
  | 'remote_environment'
  | 'ripgrep'

export type StartupHarnessIssue = {
  code: StartupHarnessIssueCode
  severity: Exclude<StartupHarnessStatus, 'ready'>
  title: string
  message: string
}

export type StartupHarnessInput = {
  platform: string
  remoteControlAtStartup: boolean
  remoteControlStartupIssue?: string | null
  externalModel:
    | {
        provider: string
        label: string
        apiKeySource: string | null
        authReady?: boolean
      }
    | null
  gitBashStatus:
    | {
        path: string | null
        error: string | null
      }
    | null
  ripgrepStatus: {
    mode: string
    path: string
    working: boolean | null
  }
  configuredDefaultEnvironmentId?: string | null
  missingConfiguredDefaultEnvironment: boolean
  suggestedEnvironmentLabel?: string | null
}

export type StartupHarnessEvaluation = {
  status: StartupHarnessStatus
  issues: StartupHarnessIssue[]
}

function normalizeInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function makeIssue(
  code: StartupHarnessIssueCode,
  severity: Exclude<StartupHarnessStatus, 'ready'>,
  title: string,
  message: string,
): StartupHarnessIssue {
  return {
    code,
    severity,
    title,
    message: normalizeInline(message),
  }
}

export function evaluateStartupHarness(
  input: StartupHarnessInput,
): StartupHarnessEvaluation {
  const issues: StartupHarnessIssue[] = []

  if (input.remoteControlAtStartup && input.remoteControlStartupIssue) {
    issues.push(
      makeIssue(
        'remote_control_startup',
        'blocked',
        'remote startup',
        `Remote Control startup blocked: ${input.remoteControlStartupIssue}`,
      ),
    )
  }

  if (
    input.externalModel &&
    input.externalModel.provider !== 'ollama' &&
    !input.externalModel.apiKeySource &&
    input.externalModel.authReady !== true
  ) {
    issues.push(
      makeIssue(
        'provider_auth',
        'blocked',
        'model auth',
        `${input.externalModel.label} is selected but no API key is configured.`,
      ),
    )
  }

  if (input.platform === 'windows' && input.gitBashStatus && !input.gitBashStatus.path) {
    issues.push(
      makeIssue(
        'git_bash',
        'blocked',
        'git-bash',
        input.gitBashStatus.error ??
          'OpenJaws on Windows requires git-bash.',
      ),
    )
  }

  if (
    input.missingConfiguredDefaultEnvironment &&
    input.configuredDefaultEnvironmentId
  ) {
    const severity: Exclude<StartupHarnessStatus, 'ready'> =
      input.remoteControlAtStartup ? 'blocked' : 'degraded'
    const suggestion = input.suggestedEnvironmentLabel
      ? ` Suggested environment: ${input.suggestedEnvironmentLabel}.`
      : ''
    issues.push(
      makeIssue(
        'remote_environment',
        severity,
        'remote env',
        `Configured remote environment ${input.configuredDefaultEnvironmentId} was not found.${suggestion}`,
      ),
    )
  }

  if (input.ripgrepStatus.working === false) {
    issues.push(
      makeIssue(
        'ripgrep',
        'degraded',
        'ripgrep',
        `ripgrep is configured via ${input.ripgrepStatus.mode} but failed verification.`,
      ),
    )
  }

  if (issues.some(issue => issue.severity === 'blocked')) {
    return {
      status: 'blocked',
      issues,
    }
  }

  if (issues.length > 0) {
    return {
      status: 'degraded',
      issues,
    }
  }

  return {
    status: 'ready',
    issues: [],
  }
}

export function summarizeStartupHarness(
  evaluation: StartupHarnessEvaluation,
): string {
  if (evaluation.status === 'ready') {
    return 'Ready'
  }

  const titles = evaluation.issues.map(issue => issue.title)
  const head = titles.slice(0, 2).join(', ')
  const remaining = titles.length - 2
  const prefix =
    evaluation.status === 'blocked' ? 'Blocked' : 'Degraded'

  return remaining > 0
    ? `${prefix} · ${head} +${remaining} more`
    : `${prefix} · ${head}`
}
