import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveWandbConfig } from './wandb.js'

const cleanupDirs: string[] = []

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('wandb', () => {
  it('uses explicit CLI values ahead of env values', () => {
    expect(
      resolveWandbConfig(
        {
          project: 'cli-project',
          entity: 'cli-entity',
        },
        {
          WANDB_PROJECT: 'env-project',
          WANDB_ENTITY: 'env-entity',
          WANDB_API_KEY: 'secret',
        },
      ),
    ).toEqual({
      project: 'cli-project',
      entity: 'cli-entity',
      enabled: true,
      status: 'enabled',
      source: 'mixed',
      missing: [],
      apiKeyPresent: true,
      url: 'https://wandb.ai/cli-entity/cli-project',
      summary:
        'enabled via mixed for cli-entity/cli-project (https://wandb.ai/cli-entity/cli-project)',
    })
  })

  it('falls back to env values when CLI values are missing', () => {
    expect(
      resolveWandbConfig(
        {
          project: null,
          entity: null,
        },
        {
          IMMACULATE_WANDB_PROJECT: 'env-project',
          IMMACULATE_WANDB_ENTITY: 'env-entity',
        },
      ),
    ).toEqual({
      project: 'env-project',
      entity: 'env-entity',
      enabled: true,
      status: 'enabled',
      source: 'env',
      missing: [],
      apiKeyPresent: false,
      url: 'https://wandb.ai/env-entity/env-project',
      summary:
        'enabled via env for env-entity/env-project (https://wandb.ai/env-entity/env-project)',
    })
  })

  it('treats file-backed API keys as present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openjaws-wandb-'))
    cleanupDirs.push(dir)
    const apiKeyPath = join(dir, 'wandb.key')
    writeFileSync(apiKeyPath, 'secret-from-file\n', 'utf8')

    expect(
      resolveWandbConfig(
        {
          project: null,
          entity: null,
        },
        {
          WANDB_PROJECT: 'env-project',
          WANDB_ENTITY: 'env-entity',
          WANDB_API_KEY_FILE: apiKeyPath,
        },
      ),
    ).toEqual({
      project: 'env-project',
      entity: 'env-entity',
      enabled: true,
      status: 'enabled',
      source: 'env',
      missing: [],
      apiKeyPresent: true,
      url: 'https://wandb.ai/env-entity/env-project',
      summary:
        'enabled via env for env-entity/env-project (https://wandb.ai/env-entity/env-project)',
    })
  })

  it('prefers immaculate env and file-backed auth when present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openjaws-wandb-immaculate-'))
    cleanupDirs.push(dir)
    const apiKeyPath = join(dir, 'immaculate-wandb.key')
    writeFileSync(apiKeyPath, 'immaculate-secret\n', 'utf8')

    expect(
      resolveWandbConfig(
        {
          project: null,
          entity: null,
        },
        {
          IMMACULATE_WANDB_PROJECT: 'immaculate-project',
          IMMACULATE_WANDB_ENTITY: 'immaculate-entity',
          WANDB_PROJECT: 'fallback-project',
          WANDB_ENTITY: 'fallback-entity',
          IMMACULATE_WANDB_API_KEY_FILE: apiKeyPath,
        },
      ),
    ).toEqual({
      project: 'immaculate-project',
      entity: 'immaculate-entity',
      enabled: true,
      status: 'enabled',
      source: 'env',
      missing: [],
      apiKeyPresent: true,
      url: 'https://wandb.ai/immaculate-entity/immaculate-project',
      summary:
        'enabled via env for immaculate-entity/immaculate-project (https://wandb.ai/immaculate-entity/immaculate-project)',
    })
  })

  it('marks partially configured W&B state as incomplete', () => {
    expect(
      resolveWandbConfig(
        {
          project: 'cli-project',
          entity: null,
        },
        {
          WANDB_PROJECT: '',
          WANDB_ENTITY: '',
        },
      ),
    ).toEqual({
      project: 'cli-project',
      entity: null,
      enabled: false,
      status: 'incomplete',
      source: 'cli',
      missing: ['entity'],
      apiKeyPresent: false,
      url: null,
      summary: 'incomplete via cli; missing entity',
    })
  })
})
