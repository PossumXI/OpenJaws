import { describe, expect, it } from 'bun:test'
import {
  classifyDiscordProjectTargets,
  filterDiscordWritableProjectTargets,
  isDiscordProjectWritableTarget,
} from './discordProjectTargets.js'

describe('discordProjectTargets', () => {
  it('classifies git-backed roots as writable branch/worktree targets', () => {
    const targets = classifyDiscordProjectTargets(
      [
        {
          label: 'OpenJaws',
          path: 'D:\\openjaws\\OpenJaws',
          aliases: ['openjaws'],
        },
        {
          label: 'SEALED',
          path: 'C:\\Users\\Knight\\Desktop\\SEALED',
          aliases: ['sealed'],
        },
      ],
      {
        findGitRoot: path =>
          path === 'D:\\openjaws\\OpenJaws' ? 'D:\\openjaws\\OpenJaws' : null,
      },
    )

    expect(targets[0]?.capability).toBe('branch_worktree')
    expect(targets[0]?.gitRoot).toBe('D:\\openjaws\\OpenJaws')
    expect(isDiscordProjectWritableTarget(targets[0]!)).toBe(true)

    expect(targets[1]?.capability).toBe('read_only')
    expect(targets[1]?.gitRoot).toBeNull()
    expect(targets[1]?.capabilityReason).toContain('no git repository detected')
    expect(isDiscordProjectWritableTarget(targets[1]!)).toBe(false)
  })

  it('filters writable targets for isolated execution lanes', () => {
    const writable = filterDiscordWritableProjectTargets(
      classifyDiscordProjectTargets(
        [
          {
            label: 'OpenJaws',
            path: 'D:\\openjaws\\OpenJaws',
            aliases: ['openjaws'],
          },
          {
            label: 'Immaculate',
            path: 'C:\\Users\\Knight\\Desktop\\Immaculate',
            aliases: ['immaculate'],
          },
          {
            label: 'SEALED',
            path: 'C:\\Users\\Knight\\Desktop\\SEALED',
            aliases: ['sealed'],
          },
        ],
        {
          findGitRoot: path =>
            path === 'C:\\Users\\Knight\\Desktop\\SEALED' ? null : path,
        },
      ),
    )

    expect(writable.map(target => target.label)).toEqual([
      'OpenJaws',
      'Immaculate',
    ])
  })
})
