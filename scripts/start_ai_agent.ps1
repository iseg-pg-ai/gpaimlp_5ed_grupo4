$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

$PythonExec = Join-Path $RootDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExec)) {
    $PythonExec = "python"
}

Write-Host "Starting BLU AI Agent Service on http://127.0.0.1:8000..." -ForegroundColor Cyan
$env:PYTHONPATH = "$RootDir\src;$env:PYTHONPATH"
& $PythonExec -m uvicorn blu_ai.api.server:app --host 127.0.0.1 --port 8000 --reload
