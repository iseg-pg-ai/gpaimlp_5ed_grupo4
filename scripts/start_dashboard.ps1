<#
.SYNOPSIS
Starts the local Streamlit dashboard after confirming a warehouse exists.
#>
[CmdletBinding()]
param([int]$Port = 8501)

# Locate the project-local interpreter and its dashboard source reliably.
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepositoryRoot ".venv\Scripts\python.exe"
$Application = Join-Path $RepositoryRoot "dashboard\app.py"
$Warehouse = Join-Path $RepositoryRoot "warehouse\blu_etl.sqlite"

Set-Location $RepositoryRoot
$ErrorActionPreference = "Stop"

# A dashboard without a warehouse would only show an error state.
if (-not (Test-Path -LiteralPath $Warehouse)) {
    throw "Warehouse missing. Run .\scripts\run_full_pipeline.ps1 first."
}

# Start Streamlit in the foreground so the operator sees logs and can stop it with Ctrl+C.
& $Python -m streamlit run $Application --server.headless true --server.port $Port
