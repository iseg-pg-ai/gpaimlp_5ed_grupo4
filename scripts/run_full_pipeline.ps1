<#
.SYNOPSIS
Bootstraps the local environment and executes the full BLU data pipeline.

.DESCRIPTION
The script installs pinned dependencies, runs ETL (including validation, KPIs, and
analytical models), runs the integration test, and stops on the first failure.
#>
[CmdletBinding()]
param(
    # The directory containing raw Excel and PDF source files.
    [string]$DataDirectory = "data",
    # The directory recreated by the ETL for warehouse deliveries.
    [string]$OutputDirectory = "warehouse",
    # Skip dependency installation when the virtual environment is already current.
    [switch]$SkipInstall
)

# Resolve all paths relative to the repository root, not the caller's location.
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepositoryRoot ".venv\Scripts\python.exe"
$Requirements = Join-Path $RepositoryRoot "requirements.txt"

Set-Location $RepositoryRoot
$ErrorActionPreference = "Stop"

# Bootstrap the project-local virtual environment on a new checkout.
if (-not (Test-Path -LiteralPath $Python)) {
    Write-Host "Creating .venv..."
    # Install virtualenv with the system interpreter because some Windows Python
    # distributions do not bundle ensurepip, which `python -m venv` requires.
    python -m pip install virtualenv
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
    python -m virtualenv .venv
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

# Install exact dashboard and ETL dependencies unless explicitly skipped.
if (-not $SkipInstall) {
    Write-Host "Installing dependencies..."
    & $Python -m pip install -r $Requirements
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

# Verify source availability before clearing/rebuilding the output warehouse.
if (-not (Test-Path -LiteralPath $DataDirectory)) {
    throw "Data directory not found: $DataDirectory"
}

# Run the ordered data workflow: extraction, validation, KPIs, and scoring models.
Write-Host "Running ETL, validation, KPIs, and analytical models..."
& $Python -m etl.pipeline --data-dir $DataDirectory --output-dir $OutputDirectory
if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }

# Enforce the validation report as a release gate for generated warehouse data.
$ValidationReport = Join-Path $OutputDirectory "validation_report.json"
$Validation = Get-Content -LiteralPath $ValidationReport -Raw | ConvertFrom-Json
if ($Validation.status -ne "passed") {
    throw "Warehouse validation did not pass. See $ValidationReport."
}

# Compile application code and run the end-to-end regression test.
Write-Host "Running application checks..."
& $Python -m py_compile etl\pipeline.py etl\validation.py etl\analytics.py dashboard\app.py
if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
& $Python -m unittest tests.test_etl_pipeline tests.test_structured_dataset tests.test_local_source -v
if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }

Write-Host "Pipeline completed successfully. DMC Workspace: http://localhost:3001 (start separately)."
