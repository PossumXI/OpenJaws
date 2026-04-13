#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$DistDir = Join-Path $RepoRoot "dist"
$InstallDir = Join-Path $env:USERPROFILE ".local\bin"
$InstallBinaryTarget = Join-Path $InstallDir "openjaws-real.exe"
$InstallLauncherTarget = Join-Path $InstallDir "openjaws.cmd"
$LegacyExeTarget = Join-Path $InstallDir "openjaws.exe"
$ConfigDir = Join-Path $env:USERPROFILE ".openjaws"
$BuildLog = Join-Path $DistDir "build-native.log"

$buildSource = $null
$bun = Get-Command bun -ErrorAction SilentlyContinue
if ($bun) {
    Write-Host "Reconstructing native OpenJaws binary with Bun..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    Push-Location $RepoRoot
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $bun.Source run build:native 2>&1 | Out-File -LiteralPath $BuildLog -Encoding utf8
        $buildExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Pop-Location
    }

    if ($buildExit -eq 0) {
        foreach ($candidate in @(
            (Join-Path $DistDir "openjaws.exe"),
            (Join-Path $DistDir "openjaws")
        )) {
            if (Test-Path $candidate) {
                $buildSource = $candidate
                break
            }
        }
    } else {
        Write-Warning "Native build failed. See $BuildLog. Falling back to the latest working workspace binary."
    }
} else {
    Write-Warning "Bun is not available. Falling back to the latest working workspace binary."
}

$source = $buildSource
if (-not $source) {
    foreach ($fallback in @(
        (Join-Path $RepoRoot "openjaws_patched.exe"),
        (Join-Path $RepoRoot "openjaws_test.exe"),
        (Join-Path $RepoRoot "openjaws_test2.exe")
    )) {
        if (Test-Path $fallback) {
            $source = $fallback
            break
        }
    }
}

if (-not $source) {
    Write-Error "No OpenJaws binary candidate found. Run 'bun run build:native' from the repo root or add a working binary artifact."
    exit 1
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null

Copy-Item -Path $source -Destination $InstallBinaryTarget -Force

if (Test-Path $LegacyExeTarget) {
    Remove-Item -LiteralPath $LegacyExeTarget -Force
}

$launcher = @'
@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "CONFIG_DIR=%USERPROFILE%\.openjaws"
set "REPO_BUILD=%~dp0dist\openjaws.exe"
set "REPO_FALLBACK_1=%~dp0openjaws_patched.exe"
set "REPO_FALLBACK_2=%~dp0openjaws_test.exe"
set "REPO_FALLBACK_3=%~dp0openjaws_test2.exe"
set "TARGET=%SCRIPT_DIR%\openjaws-real.exe"

if not exist "%TARGET%" (
    if exist "%REPO_BUILD%" set "TARGET=%REPO_BUILD%"
)

if not exist "%TARGET%" (
    if exist "%REPO_FALLBACK_1%" set "TARGET=%REPO_FALLBACK_1%"
)

if not exist "%TARGET%" (
    if exist "%REPO_FALLBACK_2%" set "TARGET=%REPO_FALLBACK_2%"
)

if not exist "%TARGET%" (
    if exist "%REPO_FALLBACK_3%" set "TARGET=%REPO_FALLBACK_3%"
)

if exist "%TARGET%" (
    "%TARGET%" --version >nul 2>nul
    if errorlevel 1 (
        if exist "%REPO_BUILD%" set "TARGET=%REPO_BUILD%"
        if exist "%TARGET%" (
            "%TARGET%" --version >nul 2>nul
        )
        if errorlevel 1 if exist "%REPO_FALLBACK_1%" set "TARGET=%REPO_FALLBACK_1%"
        if exist "%TARGET%" (
            "%TARGET%" --version >nul 2>nul
        )
        if errorlevel 1 if exist "%REPO_FALLBACK_2%" set "TARGET=%REPO_FALLBACK_2%"
        if exist "%TARGET%" (
            "%TARGET%" --version >nul 2>nul
        )
        if errorlevel 1 if exist "%REPO_FALLBACK_3%" set "TARGET=%REPO_FALLBACK_3%"
    )
)

if not exist "%TARGET%" (
    echo Error: OpenJaws binary not found.>&2
    exit /b 1
)

set "DISABLE_TELEMETRY=1"
set "OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC=1"
set "OPENJAWS_CONFIG_DIR=%CONFIG_DIR%"
set "CLAUDE_CONFIG_DIR=%CONFIG_DIR%"

if "%~1"=="-v" goto show_version
if "%~1"=="-V" goto show_version
if "%~1"=="--version" goto show_version
if "%~1"=="-h" goto show_help
if "%~1"=="--help" goto show_help

if "%~1"=="" goto launch_interactive

"%TARGET%" %*
exit /b %errorlevel%

:launch_interactive
set "OPENJAWS_FORCE_INTERACTIVE=1"
"%TARGET%"
exit /b %errorlevel%

:show_version
powershell -NoProfile -Command "& '%TARGET%' --version | ForEach-Object { $_ -replace 'Claude Code', 'OpenJaws' }"
exit /b 0

:show_help
powershell -NoProfile -Command "& '%TARGET%' --help | ForEach-Object { $_ -replace '^Usage: claude', 'Usage: openjaws' -replace 'claude auth login', 'openjaws auth login' -replace 'claude setup-token', 'openjaws setup-token' -replace 'claude update', 'openjaws update' -replace 'claude --chrome', 'openjaws --chrome' -replace 'claude --no-chrome', 'openjaws --no-chrome' -replace 'Claude in Chrome', 'OpenJaws in Chrome' }"
exit /b 0
'@

Set-Content -LiteralPath $InstallLauncherTarget -Value $launcher -Encoding ASCII

Write-Host ""
Write-Host "OpenJaws is ready!" -ForegroundColor Green
Write-Host "Launcher:         $InstallLauncherTarget" -ForegroundColor Green
Write-Host "Installed binary: $InstallBinaryTarget" -ForegroundColor Green
Write-Host "Source artifact:  $source" -ForegroundColor Gray
Write-Host "Config directory: $ConfigDir" -ForegroundColor Gray
