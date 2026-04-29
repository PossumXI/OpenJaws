@echo off
setlocal

set "CONFIG_DIR=%USERPROFILE%\.openjaws"
set "REPO_FALLBACK_1=%~dp0dist\openjaws.exe"
set "REPO_FALLBACK_2=%~dp0openjaws_test.exe"
set "REPO_FALLBACK_3=%~dp0openjaws_test2.exe"
call :resolve_repo_build
goto main

:resolve_repo_build
set "TARGET=%REPO_FALLBACK_1%"
if exist "%TARGET%" exit /b 0
set "TARGET=%USERPROFILE%\.local\bin\openjaws-real.exe"
if exist "%TARGET%" exit /b 0
set "TARGET="
for /f "delims=" %%I in ('dir /b /a-d /o-d "%~dp0openjaws_patched*.exe" 2^>nul') do (
    if not defined TARGET set "TARGET=%~dp0%%I"
)
if not defined TARGET set "TARGET=%~dp0openjaws_patched.exe"
exit /b 0

:resolve_default_model
set "OPENJAWS_DEFAULT_MODEL=oci:Q"
goto :eof

:main

if not exist "%TARGET%" (
    set "TARGET=%USERPROFILE%\.local\bin\openjaws-real.exe"
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

if not exist "%TARGET%" (
    echo Error: OpenJaws binary not found.>&2
    exit /b 1
)

set "DISABLE_TELEMETRY=1"
set "OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC=1"
set "OPENJAWS_CONFIG_DIR=%CONFIG_DIR%"
set "CLAUDE_CONFIG_DIR=%CONFIG_DIR%"
set "OPENJAWS_OCI_BRIDGE_SCRIPT=%~dp0scripts\oci-q-response.py"
set "OPENJAWS_CUSTOM_OAUTH_URL=https://qline.site"
call :resolve_default_model

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
if defined OPENJAWS_DEFAULT_MODEL (
    "%TARGET%" --model "%OPENJAWS_DEFAULT_MODEL%"
) else (
    "%TARGET%"
)
exit /b %errorlevel%

:show_version
"%TARGET%" --version
exit /b %errorlevel%

:show_help
"%TARGET%" --help
exit /b %errorlevel%
