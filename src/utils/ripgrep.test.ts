import { describe, expect, it } from 'bun:test'
import { selectRipgrepConfig } from './ripgrep.js'

describe('selectRipgrepConfig', () => {
  it('prefers a working system rg over a missing builtin binary', () => {
    const config = selectRipgrepConfig({
      forceBuiltinRipgrep: false,
      forceSystemRipgrep: false,
      systemConfig: {
        mode: 'system',
        command: 'rg',
        args: [],
      },
      bundledOrBuiltinConfig: {
        mode: 'builtin',
        command: 'D:\\missing\\rg.exe',
        args: [],
      },
      builtinBinaryExists: false,
    })

    expect(config).toEqual({
      mode: 'system',
      command: 'rg',
      args: [],
    })
  })

  it('keeps embedded ripgrep as the first choice in bundled mode', () => {
    const config = selectRipgrepConfig({
      forceBuiltinRipgrep: false,
      forceSystemRipgrep: false,
      systemConfig: {
        mode: 'system',
        command: 'rg',
        args: [],
      },
      bundledOrBuiltinConfig: {
        mode: 'embedded',
        command: 'C:\\OpenJaws\\openjaws.exe',
        args: ['--no-config'],
        argv0: 'rg',
      },
      builtinBinaryExists: true,
    })

    expect(config).toEqual({
      mode: 'embedded',
      command: 'C:\\OpenJaws\\openjaws.exe',
      args: ['--no-config'],
      argv0: 'rg',
    })
  })

  it('honors explicit builtin preference even when the system rg exists', () => {
    const config = selectRipgrepConfig({
      forceBuiltinRipgrep: true,
      forceSystemRipgrep: false,
      systemConfig: {
        mode: 'system',
        command: 'rg',
        args: [],
      },
      bundledOrBuiltinConfig: {
        mode: 'builtin',
        command: 'D:\\openjaws\\vendor\\rg.exe',
        args: [],
      },
      builtinBinaryExists: true,
    })

    expect(config).toEqual({
      mode: 'builtin',
      command: 'D:\\openjaws\\vendor\\rg.exe',
      args: [],
    })
  })
})
