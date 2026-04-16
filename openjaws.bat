@echo off
setlocal

set "CONFIG_DIR=%USERPROFILE%\.openjaws"
set "REPO_FALLBACK_1=%~dp0dist\openjaws.exe"
set "REPO_FALLBACK_2=%~dp0openjaws_test.exe"
set "REPO_FALLBACK_3=%~dp0openjaws_test2.exe"
call :resolve_repo_build
goto main

:resolve_repo_build
set "TARGET="
for /f "delims=" %%I in ('dir /b /a-d /o-d "%~dp0openjaws_patched*.exe" 2^>nul') do (
    if not defined TARGET set "TARGET=%~dp0%%I"
)
if not defined TARGET set "TARGET=%~dp0openjaws_patched.exe"
exit /b 0

:resolve_default_model
set "OPENJAWS_DEFAULT_MODEL="

if defined Q_API_KEY (
    set "OPENJAWS_DEFAULT_MODEL=oci:Q"
    goto :eof
)

if defined OCI_API_KEY (
    set "OPENJAWS_DEFAULT_MODEL=oci:Q"
    goto :eof
)

if defined OCI_GENAI_API_KEY (
    set "OPENJAWS_DEFAULT_MODEL=oci:Q"
    goto :eof
)

if defined OCI_CONFIG_FILE (
    if defined OCI_COMPARTMENT_ID (
        if defined OCI_GENAI_PROJECT_ID (
            set "OPENJAWS_DEFAULT_MODEL=oci:Q"
            goto :eof
        )
    )
)

if defined OPENAI_API_KEY (
    if defined OPENAI_MODEL (
        set "OPENJAWS_DEFAULT_MODEL=openai:%OPENAI_MODEL%"
    ) else (
        set "OPENJAWS_DEFAULT_MODEL=openai:gpt-5.4"
    )
    goto :eof
)

if defined GEMINI_API_KEY (
    if defined GEMINI_MODEL (
        set "OPENJAWS_DEFAULT_MODEL=gemini:%GEMINI_MODEL%"
    ) else (
        set "OPENJAWS_DEFAULT_MODEL=gemini:gemini-3-flash-preview"
    )
    goto :eof
)

if defined GOOGLE_API_KEY (
    if defined GEMINI_MODEL (
        set "OPENJAWS_DEFAULT_MODEL=gemini:%GEMINI_MODEL%"
    ) else (
        set "OPENJAWS_DEFAULT_MODEL=gemini:gemini-3-flash-preview"
    )
    goto :eof
)

if defined MINI_MAX_API_KEY (
    if defined MINI_MAX_MODEL (
        set "OPENJAWS_DEFAULT_MODEL=minimax:%MINI_MAX_MODEL%"
        goto :eof
    )
)

if defined MINIMAX_API_KEY (
    if defined MINIMAX_MODEL (
        set "OPENJAWS_DEFAULT_MODEL=minimax:%MINIMAX_MODEL%"
        goto :eof
    )
)

if defined GROQ_API_KEY (
    if defined GROQ_MODEL (
        set "OPENJAWS_DEFAULT_MODEL=groq:%GROQ_MODEL%"
        goto :eof
    )
)

if defined KIMI_API_KEY (
    if defined KIMI_MODEL (
        set "OPENJAWS_DEFAULT_MODEL=kimi:%KIMI_MODEL%"
        goto :eof
    )
)

if defined MOONSHOT_API_KEY (
    if defined KIMI_MODEL (
        set "OPENJAWS_DEFAULT_MODEL=kimi:%KIMI_MODEL%"
        goto :eof
    )
)

if defined OLLAMA_MODEL (
    set "OPENJAWS_DEFAULT_MODEL=ollama:%OLLAMA_MODEL%"
)
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

if exist "%TARGET%" (
    "%TARGET%" --version >nul 2>nul
    if errorlevel 1 (
        if exist "%USERPROFILE%\.local\bin\openjaws-real.exe" set "TARGET=%USERPROFILE%\.local\bin\openjaws-real.exe"
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
powershell -NoProfile -Command "& '%TARGET%' --version | ForEach-Object { $_ -replace 'Claude Code', 'OpenJaws' }"
exit /b 0

:show_help
powershell -NoProfile -Command "& '%TARGET%' --help | ForEach-Object { $_ -replace '^Usage: claude', 'Usage: openjaws' -replace 'claude auth login', 'openjaws auth login' -replace 'claude setup-token', 'openjaws setup-token' -replace 'claude update', 'openjaws update' -replace 'claude --chrome', 'openjaws --chrome' -replace 'claude --no-chrome', 'openjaws --no-chrome' -replace 'claude assistant', 'openjaws assistant' -replace 'claude ssh', 'openjaws ssh' -replace 'claude --resume', 'openjaws --resume' -replace '# claude up', '# openjaws up' -replace 'claude rollback', 'openjaws rollback' -replace 'claude-sonnet-4-6', 'gpt-5.4' -replace 'Claude in Chrome', 'OpenJaws in Chrome' }"
exit /b 0
