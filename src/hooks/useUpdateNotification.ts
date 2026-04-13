import { useState } from 'react'
import { major, minor, patch, prerelease } from 'semver'

export function getVersionNotificationKey(version: string): string {
  const base = `${major(version, { loose: true })}.${minor(version, { loose: true })}.${patch(version, { loose: true })}`
  const prereleaseParts = prerelease(version, { loose: true })
  const prereleaseKey =
    prereleaseParts && prereleaseParts.length > 0
      ? `-${prereleaseParts.join('.')}`
      : ''
  const buildMetadata = version.includes('+')
    ? `+${version.split('+').slice(1).join('+')}`
    : ''
  return `${base}${prereleaseKey}${buildMetadata}`
}

export function shouldShowUpdateNotification(
  updatedVersion: string,
  lastNotifiedSemver: string | null,
): boolean {
  const updatedSemver = getVersionNotificationKey(updatedVersion)
  return updatedSemver !== lastNotifiedSemver
}

export function useUpdateNotification(
  updatedVersion: string | null | undefined,
  initialVersion: string = MACRO.VERSION,
): string | null {
  const [lastNotifiedSemver, setLastNotifiedSemver] = useState<string | null>(
    () => getVersionNotificationKey(initialVersion),
  )

  if (!updatedVersion) {
    return null
  }

  const updatedSemver = getVersionNotificationKey(updatedVersion)
  if (updatedSemver !== lastNotifiedSemver) {
    setLastNotifiedSemver(updatedSemver)
    return updatedSemver
  }
  return null
}
