import { describe, expect, it } from 'bun:test'
import { resolveWandbConfig } from './wandb.js'

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
          WANDB_PROJECT: 'env-project',
          WANDB_ENTITY: 'env-entity',
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
