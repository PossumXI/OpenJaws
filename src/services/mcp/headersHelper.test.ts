import { describe, expect, test } from 'bun:test'
import { parseHeadersHelperCommand } from './headersHelper.ts'

describe('parseHeadersHelperCommand', () => {
  test('parses literal helper commands without invoking shell semantics', () => {
    expect(
      parseHeadersHelperCommand('node scripts/headers-helper.js --server q'),
    ).toEqual({
      file: 'node',
      args: ['scripts/headers-helper.js', '--server', 'q'],
    })
  })

  test('preserves unquoted Windows paths instead of POSIX backslash parsing', () => {
    expect(
      parseHeadersHelperCommand('powershell -File C:\\tmp\\helper.ps1'),
    ).toEqual({
      file: 'powershell',
      args: ['-File', 'C:\\tmp\\helper.ps1'],
    })
  })

  test('preserves quoted Windows paths with spaces', () => {
    expect(
      parseHeadersHelperCommand(
        '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -File "C:\\tmp path\\helper.ps1"',
      ),
    ).toEqual({
      file: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      args: ['-File', 'C:\\tmp path\\helper.ps1'],
    })
  })

  test('rejects shell expansion instead of silently rewriting tokens', () => {
    expect(() =>
      parseHeadersHelperCommand('echo "{\"Authorization\":\"Bearer $TOKEN\"}"'),
    ).toThrow('shell expansion')
  })

  test('rejects shell operators and environment assignments', () => {
    expect(() => parseHeadersHelperCommand('node helper.js | cat')).toThrow(
      'shell expansion',
    )
    expect(() => parseHeadersHelperCommand('TOKEN=abc node helper.js')).toThrow(
      'environment assignment',
    )
  })

  test('rejects Windows shell environment expansion', () => {
    expect(() =>
      parseHeadersHelperCommand('powershell -File %USERPROFILE%\\helper.ps1'),
    ).toThrow('shell expansion')
  })
})
