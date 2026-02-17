Write-Host "Running QA smoke via scripts/smoke-test.js (Bearer token flow)..." -ForegroundColor Cyan
node (Join-Path $PSScriptRoot "smoke-test.js")
if ($LASTEXITCODE -ne 0) {
    Write-Host "QA smoke failed." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "QA smoke passed." -ForegroundColor Green
