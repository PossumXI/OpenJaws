import axios from 'axios'
import { createHash } from 'node:crypto'
import type { ReleaseChannel } from './config.js'
import { getOrCreateUserID } from './config.js'
import { logForDebugging } from './debug.js'
import {
  findGithubReleaseAsset,
  getGithubReleaseBinaryAssetName,
  getGithubReleaseByVersion,
  getGithubReleaseManifestAssetName,
  getPublicGithubReleaseRepo,
  normalizePublicReleaseVersion,
  type PublicGithubRelease,
} from './publicReleaseSource.js'

const DEFAULT_PUBLIC_RELEASE_POLICY_PATH = 'release-policy.json'
const DEFAULT_PUBLIC_RELEASE_POLICY_TIMEOUT_MS = 5000
const DEFAULT_PUBLIC_RELEASE_POLICY_SEED = 'openjaws-public-release'

export type PublicReleaseRolloutPolicy = {
  percentage?: number | null
  seed?: string | null
}

export type PublicReleaseChannelPolicy = {
  version?: string | null
  notes?: string | null
  rollout?: PublicReleaseRolloutPolicy | null
}

export type PublicReleasePolicy = {
  schemaVersion?: number | null
  updatedAt?: string | null
  repo?: string | null
  minimumSupportedVersion?: string | null
  blockedVersions?: string[] | null
  channels?: Partial<Record<ReleaseChannel, PublicReleaseChannelPolicy>> | null
}

export type PublicReleaseDecisionStatus =
  | 'eligible'
  | 'held_back'
  | 'missing_policy'
  | 'invalid_policy'
  | 'missing_release'
  | 'blocked'

export type PublicReleaseDecision = {
  status: PublicReleaseDecisionStatus
  channel: ReleaseChannel
  version: string | null
  summary: string
  source: 'policy' | 'none'
  rolloutPercentage: number | null
  bucket: number | null
  policyUrl: string
}

function getPublicReleasePolicyHeaders() {
  return {
    Accept: 'application/json',
    'User-Agent': 'OpenJaws/public-release-policy',
  }
}

export function getPublicReleasePolicyUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.OPENJAWS_PUBLIC_RELEASE_POLICY_URL?.trim() ||
    `https://raw.githubusercontent.com/${getPublicGithubReleaseRepo(env)}/main/${DEFAULT_PUBLIC_RELEASE_POLICY_PATH}`
  )
}

function normalizeRolloutPercentage(value: unknown): number | null {
  if (value === undefined || value === null) {
    return 100
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  if (value < 0 || value > 100) {
    return null
  }
  return Math.round(value * 100) / 100
}

function hasRequiredReleaseAssets(
  release: PublicGithubRelease,
  platform?: string,
): boolean {
  if (!platform) {
    return true
  }
  return (
    findGithubReleaseAsset(release, getGithubReleaseBinaryAssetName(platform)) !==
      null &&
    findGithubReleaseAsset(
      release,
      getGithubReleaseManifestAssetName(platform),
    ) !== null
  )
}

export function getPublicReleaseRolloutBucket(
  userID: string,
  channel: ReleaseChannel,
  seed: string = DEFAULT_PUBLIC_RELEASE_POLICY_SEED,
): number {
  const digest = createHash('sha256')
    .update(`${seed}:${channel}:${userID}`)
    .digest()
  const ratio = digest.readUInt32BE(0) / 0xffffffff
  return Math.round(ratio * 10000) / 100
}

export function evaluatePublicReleaseDecision(
  policy: PublicReleasePolicy | null | undefined,
  channel: ReleaseChannel,
  options: {
    userID: string
    currentVersion?: string | null
    policyUrl?: string
  },
): PublicReleaseDecision {
  const policyUrl =
    options.policyUrl || getPublicReleasePolicyUrl(process.env)

  if (!policy) {
    return {
      status: 'missing_policy',
      channel,
      version: null,
      summary:
        'OpenJaws could not load the public release policy. Public updates stay fail-closed until the official policy is reachable again.',
      source: 'none',
      rolloutPercentage: null,
      bucket: null,
      policyUrl,
    }
  }

  if (policy.schemaVersion !== 1) {
    return {
      status: 'invalid_policy',
      channel,
      version: null,
      summary:
        'OpenJaws found an unsupported public release policy schema. Public updates stay fail-closed until the policy is fixed.',
      source: 'none',
      rolloutPercentage: null,
      bucket: null,
      policyUrl,
    }
  }

  const channelPolicy = policy.channels?.[channel]
  const normalizedVersion = normalizePublicReleaseVersion(channelPolicy?.version)
  if (!channelPolicy || !normalizedVersion) {
    return {
      status: 'invalid_policy',
      channel,
      version: null,
      summary: `OpenJaws ${channel} does not have a valid target in the public release policy.`,
      source: 'none',
      rolloutPercentage: null,
      bucket: null,
      policyUrl,
    }
  }

  const blockedVersions = (policy.blockedVersions ?? [])
    .map(candidate => normalizePublicReleaseVersion(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))
  if (blockedVersions.includes(normalizedVersion)) {
    return {
      status: 'blocked',
      channel,
      version: normalizedVersion,
      summary: `OpenJaws ${channel} target ${normalizedVersion} is blocked in the public release policy. No update will be installed until the policy advances.`,
      source: 'policy',
      rolloutPercentage: null,
      bucket: null,
      policyUrl,
    }
  }

  const rolloutPercentage = normalizeRolloutPercentage(
    channelPolicy.rollout?.percentage,
  )
  if (rolloutPercentage === null) {
    return {
      status: 'invalid_policy',
      channel,
      version: normalizedVersion,
      summary: `OpenJaws ${channel} rollout percentage is invalid in the public release policy.`,
      source: 'none',
      rolloutPercentage: null,
      bucket: null,
      policyUrl,
    }
  }

  if (rolloutPercentage >= 100) {
    return {
      status: 'eligible',
      channel,
      version: normalizedVersion,
      summary: `OpenJaws ${channel} targets ${normalizedVersion} via the official public release policy.`,
      source: 'policy',
      rolloutPercentage,
      bucket: null,
      policyUrl,
    }
  }

  const bucket = getPublicReleaseRolloutBucket(
    options.userID,
    channel,
    channelPolicy.rollout?.seed?.trim() || DEFAULT_PUBLIC_RELEASE_POLICY_SEED,
  )
  if (bucket < rolloutPercentage) {
    return {
      status: 'eligible',
      channel,
      version: normalizedVersion,
      summary: `OpenJaws ${channel} rollout includes this install for ${normalizedVersion} (${rolloutPercentage}% public rollout, bucket ${bucket.toFixed(2)}).`,
      source: 'policy',
      rolloutPercentage,
      bucket,
      policyUrl,
    }
  }

  const currentVersion = options.currentVersion?.trim()
  const currentVersionSuffix = currentVersion
    ? ` This install stays on ${currentVersion} for now.`
    : ''
  return {
    status: 'held_back',
    channel,
    version: normalizedVersion,
    summary: `OpenJaws ${channel} is rolling out ${normalizedVersion} to ${rolloutPercentage}% of installs. This install is bucket ${bucket.toFixed(2)} and is not eligible yet.${currentVersionSuffix}`,
    source: 'policy',
    rolloutPercentage,
    bucket,
    policyUrl,
  }
}

async function fetchPublicReleasePolicy(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublicReleasePolicy | null> {
  const policyUrl = getPublicReleasePolicyUrl(env)
  try {
    const response = await axios.get(policyUrl, {
      headers: getPublicReleasePolicyHeaders(),
      responseType: 'json',
      timeout: DEFAULT_PUBLIC_RELEASE_POLICY_TIMEOUT_MS,
    })
    return response.data as PublicReleasePolicy
  } catch (error) {
    logForDebugging(
      `Failed to fetch public release policy from ${policyUrl}: ${error}`,
    )
    return null
  }
}

export async function getPublicReleaseDecision(
  channel: ReleaseChannel,
  options?: {
    currentVersion?: string | null
    platform?: string
    userID?: string
    env?: NodeJS.ProcessEnv
  },
): Promise<PublicReleaseDecision> {
  const env = options?.env ?? process.env
  const policyUrl = getPublicReleasePolicyUrl(env)
  const policy = await fetchPublicReleasePolicy(env)
  const decision = evaluatePublicReleaseDecision(policy, channel, {
    currentVersion: options?.currentVersion ?? null,
    policyUrl,
    userID: options?.userID ?? getOrCreateUserID(),
  })

  if (decision.status !== 'eligible' || !decision.version) {
    return decision
  }

  const expectedRepo = getPublicGithubReleaseRepo(env)
  const configuredRepo = policy?.repo?.trim()
  if (configuredRepo && configuredRepo !== expectedRepo) {
    return {
      ...decision,
      status: 'invalid_policy',
      summary: `OpenJaws public release policy points at ${configuredRepo}, but this install only trusts ${expectedRepo}.`,
    }
  }

  const release = await getGithubReleaseByVersion(decision.version, env)
  if (!release) {
    return {
      ...decision,
      status: 'missing_release',
      summary: `OpenJaws ${channel} policy points to ${decision.version}, but no matching GitHub Release is published yet.`,
    }
  }

  if (channel === 'stable' && release.prerelease) {
    return {
      ...decision,
      status: 'invalid_policy',
      summary: `OpenJaws stable policy points to prerelease ${decision.version}. Public stable updates stay fail-closed until the policy is corrected.`,
    }
  }

  if (!hasRequiredReleaseAssets(release, options?.platform)) {
    return {
      ...decision,
      status: 'missing_release',
      summary: `OpenJaws ${channel} policy points to ${decision.version}, but the published release is missing required assets for ${options?.platform ?? 'this platform'}.`,
    }
  }

  return decision
}
