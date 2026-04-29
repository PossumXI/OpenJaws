@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."

if defined OPENJAWS_HARBOR_PYTHON (
  set "HARBOR_PYTHON=%OPENJAWS_HARBOR_PYTHON%"
) else if exist "%ROOT_DIR%\.tools\harbor-venv\Scripts\python.exe" (
  set "HARBOR_PYTHON=%ROOT_DIR%\.tools\harbor-venv\Scripts\python.exe"
) else (
  set "HARBOR_PYTHON=python"
)

set "PYTHONPATH=%SCRIPT_DIR%;%PYTHONPATH%"
"%HARBOR_PYTHON%" "%SCRIPT_DIR%harbor_cli.py" %*
