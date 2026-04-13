#!/usr/bin/env pwsh

$RepoRoot = $PSScriptRoot
$ConfigDir = Join-Path $env:USERPROFILE ".openjaws"

function Resolve-OpenJawsBinary {
    $candidates = @()
    if ($env:OPENJAWS_BINARY) {
        $candidates += $env:OPENJAWS_BINARY
    }
    $candidates += Get-ChildItem -Path $RepoRoot -Filter 'openjaws_patched*.exe' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object FullName
    $candidates += @(
        (Join-Path $RepoRoot "dist\openjaws.exe"),
        (Join-Path $RepoRoot "dist\openjaws"),
        (Join-Path $env:USERPROFILE ".local\bin\openjaws-real.exe"),
        (Join-Path $env:USERPROFILE ".local\bin\openjaws.exe")
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return $null
}

function Resolve-OpenJawsDefaultModel {
    if ($env:OPENAI_API_KEY) {
        if ($env:OPENAI_MODEL) {
            return "openai:$($env:OPENAI_MODEL)"
        }
        return 'openai:gpt-5.4'
    }

    if ($env:GEMINI_API_KEY -or $env:GOOGLE_API_KEY) {
        if ($env:GEMINI_MODEL) {
            return "gemini:$($env:GEMINI_MODEL)"
        }
        return 'gemini:gemini-3-flash-preview'
    }

    if ($env:MINI_MAX_API_KEY -and $env:MINI_MAX_MODEL) {
        return "minimax:$($env:MINI_MAX_MODEL)"
    }

    if ($env:MINIMAX_API_KEY -and $env:MINIMAX_MODEL) {
        return "minimax:$($env:MINIMAX_MODEL)"
    }

    if ($env:GROQ_API_KEY -and $env:GROQ_MODEL) {
        return "groq:$($env:GROQ_MODEL)"
    }

    if ($env:KIMI_API_KEY -and $env:KIMI_MODEL) {
        return "kimi:$($env:KIMI_MODEL)"
    }

    if ($env:MOONSHOT_API_KEY -and $env:KIMI_MODEL) {
        return "kimi:$($env:KIMI_MODEL)"
    }

    if ($env:OLLAMA_MODEL) {
        return "ollama:$($env:OLLAMA_MODEL)"
    }

    return $null
}

$Target = Resolve-OpenJawsBinary
if (-not $Target) {
    Write-Host "OpenJaws binary not found. Running setup first..." -ForegroundColor Yellow
    & (Join-Path $RepoRoot "setup.ps1")
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    $Target = Resolve-OpenJawsBinary
}

if (-not $Target) {
    foreach ($fallback in @(
        (Join-Path $RepoRoot "openjaws_test.exe"),
        (Join-Path $RepoRoot "openjaws_test2.exe")
    )) {
        if (Test-Path $fallback) {
            $Target = $fallback
            break
        }
    }
}

if (-not $Target) {
    Write-Error "Failed to locate an OpenJaws binary."
    exit 1
}

$env:DISABLE_TELEMETRY = "1"
$env:OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC = "1"
$env:OPENJAWS_CONFIG_DIR = $ConfigDir
$env:CLAUDE_CONFIG_DIR = $ConfigDir

if ($args.Count -gt 0 -and $args[0] -in @('-v', '-V', '--version')) {
    & $Target --version | ForEach-Object {
        $_ -replace 'Claude Code', 'OpenJaws'
    }
    exit 0
}

if ($args.Count -gt 0 -and $args[0] -in @('-h', '--help')) {
    & $Target --help | ForEach-Object {
        $_ `
            -replace '^Usage: claude', 'Usage: openjaws' `
            -replace 'claude auth login', 'openjaws auth login' `
            -replace 'claude setup-token', 'openjaws setup-token' `
            -replace 'claude update', 'openjaws update' `
            -replace 'claude --chrome', 'openjaws --chrome' `
            -replace 'claude --no-chrome', 'openjaws --no-chrome' `
            -replace 'claude assistant', 'openjaws assistant' `
            -replace 'claude ssh', 'openjaws ssh' `
            -replace 'claude --resume', 'openjaws --resume' `
            -replace '# claude up', '# openjaws up' `
            -replace 'claude rollback', 'openjaws rollback' `
            -replace 'claude-sonnet-4-6', 'gpt-5.4' `
            -replace 'Claude in Chrome', 'OpenJaws in Chrome'
    }
    exit 0
}

if ($args.Count -eq 0) {
    $env:OPENJAWS_FORCE_INTERACTIVE = "1"
    $defaultModel = Resolve-OpenJawsDefaultModel
    if ($defaultModel) {
        & $Target --model $defaultModel
    } else {
        & $Target
    }
    exit $LASTEXITCODE
}

& $Target @args
exit $LASTEXITCODE
