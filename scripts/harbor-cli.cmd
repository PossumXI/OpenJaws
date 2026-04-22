@echo off
setlocal

if defined OPENJAWS_HARBOR_PYTHON (
  "%OPENJAWS_HARBOR_PYTHON%" -m harbor.cli.main %*
) else (
  python -m harbor.cli.main %*
)
