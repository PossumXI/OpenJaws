const RELEASE_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function normalizeReleaseVersion(version: string): string {
  const trimmed = version.trim()
  const normalized = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed
  if (!RELEASE_VERSION_PATTERN.test(normalized)) {
    throw new Error(`Invalid OpenJaws release version: ${version}`)
  }
  return normalized
}

function stripBuildMetadata(version: string): string {
  return version.split('+', 1)[0]!
}

function sanitizeBuildMetadata(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^0-9A-Za-z.-]+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-+|-+$/g, '')
  if (!normalized) {
    throw new Error(`Invalid OpenJaws build metadata: ${value}`)
  }
  return normalized
}

function shouldUseGitTagForOpenJawsVersion(tagName: string | undefined): tagName is string {
  if (!tagName) {
    return false
  }
  return !tagName.trim().toLowerCase().startsWith('jaws-v')
}

export function getOpenJawsReleaseVersion(options: {
  packageVersion: string
  env?: NodeJS.ProcessEnv
}): string {
  const env = options.env ?? process.env
  const packageVersion = normalizeReleaseVersion(options.packageVersion)
  const packageSemver = stripBuildMetadata(packageVersion)

  const explicitVersion = env.OPENJAWS_RELEASE_VERSION
    ? normalizeReleaseVersion(env.OPENJAWS_RELEASE_VERSION)
    : null
  const tagVersion =
    env.GITHUB_REF_TYPE === 'tag' &&
    shouldUseGitTagForOpenJawsVersion(env.GITHUB_REF_NAME)
      ? normalizeReleaseVersion(env.GITHUB_REF_NAME)
      : null

  if (explicitVersion && tagVersion && explicitVersion !== tagVersion) {
    throw new Error(
      `OPENJAWS_RELEASE_VERSION (${explicitVersion}) does not match tag ${tagVersion}`,
    )
  }

  const releaseVersion = explicitVersion ?? tagVersion ?? packageVersion
  const releaseSemver = stripBuildMetadata(releaseVersion)
  const allowMismatch = env.OPENJAWS_ALLOW_VERSION_MISMATCH === 'true'

  if (tagVersion && releaseSemver !== packageSemver && !allowMismatch) {
    throw new Error(
      `Tag version ${releaseVersion} does not match package.json version ${packageVersion}`,
    )
  }

  const buildMetadata = env.OPENJAWS_BUILD_METADATA
    ? sanitizeBuildMetadata(env.OPENJAWS_BUILD_METADATA)
    : !explicitVersion && !tagVersion && env.CI && env.GITHUB_SHA
      ? sanitizeBuildMetadata(`sha.${env.GITHUB_SHA.slice(0, 7)}`)
      : null

  if (!buildMetadata || releaseVersion.includes('+')) {
    return releaseVersion
  }

  return `${releaseVersion}+${buildMetadata}`
}
