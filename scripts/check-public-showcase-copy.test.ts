import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  checkPublicShowcaseCopyText,
  runPublicShowcaseCopyCheck,
  type PublicShowcaseCopyCheckResult,
} from './check-public-showcase-copy.ts'

type TempPublicShowcaseFixture = {
  root: string
  env: NodeJS.ProcessEnv
  paths: {
    activity: string
    guard: string
    mirror: string
    snapshot: string
    status: string
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8')
}

function makeFixture(): TempPublicShowcaseFixture {
  const root = mkdtempSync(join(tmpdir(), 'public-showcase-copy-'))
  const home = join(root, 'home')
  const publicRoot = join(home, '.arobi-public')
  const activity = join(publicRoot, 'showcase-activity.json')
  const guard = join(publicRoot, 'showcase-guard.json')
  const status = join(publicRoot, 'showcase-status.json')
  const mirror = join(root, 'docs', 'wiki', 'Public-Showcase-Activity.json')
  const snapshot = join(root, 'publicShowcaseSnapshot.generated.ts')

  const env: NodeJS.ProcessEnv = {
    USERPROFILE: home,
    HOME: '',
    ASGARD_PUBLIC_SHOWCASE_ACTIVITY_FILE: activity,
    OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_MIRROR_FILE: mirror,
    ASGARD_PUBLIC_SHOWCASE_SNAPSHOT_FILE: snapshot,
  }

  return {
    root,
    env,
    paths: {
      activity,
      guard,
      mirror,
      snapshot,
      status,
    },
  }
}

function runFixtureCheck(fixture: TempPublicShowcaseFixture): PublicShowcaseCopyCheckResult {
  return runPublicShowcaseCopyCheck({
    root: fixture.root,
    env: fixture.env,
  })
}

describe('public showcase copy check', () => {
  test('passes when all public surfaces use clean marketing copy', () => {
    const fixture = makeFixture()
    try {
      writeJson(fixture.paths.status, {
        status: 'operational',
        privateLane: {
          auditAttested: true,
          disclosure: 'withheld',
        },
      })
      writeJson(fixture.paths.activity, {
        items: [
          {
            summary:
              'Q is online and posts only when a high-value public update is ready.',
          },
        ],
      })
      writeJson(fixture.paths.guard, {
        status: 'ok',
        source: 'public.showcase.guard',
        entryCount: 4,
      })
      writeJson(fixture.paths.mirror, {
        items: [
          {
            summary:
              'OpenJaws, Q, Immaculate, Apex, and Discord receipts are visible on the public proof loop without exposing private workspace details.',
          },
        ],
      })
      writeFileSync(
        fixture.paths.snapshot,
        'export const snapshot = {"copy":"Protected lane audit is attested and withheld."}',
        'utf8',
      )

      const result = runFixtureCheck(fixture)

      expect(result.ok).toBe(true)
      expect(result.missingRequired).toHaveLength(0)
      expect(result.violations).toHaveLength(0)
      expect(result.checked.map(target => target.label).sort()).toEqual([
        'arobi-public activity',
        'arobi-public guard',
        'arobi-public status',
        'openjaws public activity mirror',
        'websites bundled showcase snapshot',
      ])
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  test('flags stale internal copy before it reaches the public showcase', () => {
    const fixture = makeFixture()
    try {
      writeJson(fixture.paths.status, {
        status: 'degraded',
        note: 'Legacy lane is only for internal routing.',
      })
      writeJson(fixture.paths.activity, {
        items: [
          {
            summary:
              'TerminalBench completed with errors and no active bounded task. 1 item still needs review.',
          },
        ],
      })
      writeJson(fixture.paths.mirror, {
        items: [
          {
            summary:
              'The #dev_support roundtable pinged <#1490000000000000000> and @everyone while waiting on 2/3 bot receipts before final check.',
          },
        ],
      })
      writeFileSync(
        fixture.paths.snapshot,
        'export const snapshot = {"copy":"No bounded governed spend actions in current window.. Roundtable is under review."}',
        'utf8',
      )

      const result = runFixtureCheck(fixture)
      const snippets = result.violations.map(violation => violation.snippet)

      expect(result.ok).toBe(false)
      expect(result.missingRequired).toHaveLength(0)
      expect(snippets).toContain('"note": "Legacy lane is only for internal routing."')
      expect(snippets).toContain(
        '"summary": "TerminalBench completed with errors and no active bounded task. 1 item still needs review."',
      )
      expect(snippets).toContain(
        '"summary": "The #dev_support roundtable pinged <#1490000000000000000> and @everyone while waiting on 2/3 bot receipts before final check."',
      )
      expect(snippets).toContain(
        'export const snapshot = {"copy":"No bounded governed spend actions in current window.. Roundtable is under review."}',
      )
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  test('flags raw delivery manifest, job path, branch, and commit metadata', () => {
    const fixture = makeFixture()
    try {
      writeJson(fixture.paths.status, {
        status: 'operational',
        note: 'manifestPath=D:/openjaws/OpenJaws/delivery-artifacts.manifest.json',
      })
      writeJson(fixture.paths.activity, {
        items: [
          {
            summary:
              'latestJobBranchName=feature/private-ops latestJobCommitSha=0123456789abcdef0123456789abcdef01234567 queuePath=C:/Users/Knight/.openjaws/q',
          },
        ],
      })
      writeJson(fixture.paths.mirror, {
        items: [
          {
            summary:
              'deliveryArtifacts include route-request.json and result.json from D:/openjaws/OpenJaws/.openjaws/projects',
          },
        ],
      })
      writeFileSync(
        fixture.paths.snapshot,
        'export const snapshot = {"copy":"repoPath=D:/cheeks/Asgard runStatePath=/home/knight/.openjaws/run.json"}',
        'utf8',
      )

      const result = runFixtureCheck(fixture)
      const snippets = result.violations.map(violation => violation.snippet)

      expect(result.ok).toBe(false)
      expect(result.missingRequired).toHaveLength(0)
      expect(snippets).toContain(
        '"note": "manifestPath=D:/openjaws/OpenJaws/delivery-artifacts.manifest.json"',
      )
      expect(snippets).toContain(
        '"summary": "latestJobBranchName=feature/private-ops latestJobCommitSha=0123456789abcdef0123456789abcdef01234567 queuePath=C:/Users/Knight/.openjaws/q"',
      )
      expect(snippets).toContain(
        '"summary": "deliveryArtifacts include route-request.json and result.json from D:/openjaws/OpenJaws/.openjaws/projects"',
      )
      expect(snippets).toContain(
        'export const snapshot = {"copy":"repoPath=D:/cheeks/Asgard runStatePath=/home/knight/.openjaws/run.json"}',
      )
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  test('matches sensitive metadata keys directly without flagging benign root wording', () => {
    const target = {
      label: 'fixture',
      path: 'fixture.json',
      required: false,
    }
    const sensitiveLines = [
      'deliveryArtifactManifestPath=public-artifact',
      'latestJobBranchName=feature/private-ops',
      'latestJobCommitSha=0123456789abcdef0123456789abcdef01234567',
      'latestJobId=job-secret',
      'job_id=job-secret',
      'task_id=task-secret',
      'agent_id=agent-secret',
      'repoPath=workspace',
      'root=workspace',
      'queuePath=queued-job',
      'specPath=route-spec',
      'trainFile=q-train.jsonl',
      'evalFile=q-eval.jsonl',
      'runStatePath=state',
      'manifestVersion=private',
      'manifest_url=https://private.local/manifest.json',
      'metadata=private payload',
      'route-request.json',
    ]

    for (const line of sensitiveLines) {
      expect(checkPublicShowcaseCopyText(line, target), line).not.toHaveLength(0)
    }

    expect(
      checkPublicShowcaseCopyText(
        'The root cause summary and repo root guide are public-safe marketing copy.',
        target,
      ),
    ).toHaveLength(0)
  })

  test('fails when the required OpenJaws public activity mirror is missing', () => {
    const fixture = makeFixture()
    try {
      writeJson(fixture.paths.activity, { items: [] })
      writeFileSync(
        fixture.paths.snapshot,
        'export const snapshot = {"copy":"Public proof loop is clean."}',
        'utf8',
      )

      const result = runFixtureCheck(fixture)

      expect(result.ok).toBe(false)
      expect(result.violations).toHaveLength(0)
      expect(result.missingRequired).toEqual([
        {
          label: 'openjaws public activity mirror',
          path: fixture.paths.mirror,
          required: true,
        },
      ])
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})
