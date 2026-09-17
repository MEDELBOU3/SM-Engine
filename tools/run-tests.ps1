$ErrorActionPreference = 'Stop'

$tests = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\tests') -Filter '*.test.js' -File | Sort-Object Name
$failures = @()

foreach ($test in $tests) {
    Write-Host "`n[SM Engine tests] $($test.Name)"
    & node $test.FullName
    if ($LASTEXITCODE -ne 0) {
        $failures += $test.Name
    }
}

if ($failures.Count -gt 0) {
    Write-Error "Failed tests: $($failures -join ', ')"
    exit 1
}

Write-Host "`n[SM Engine tests] $($tests.Count) test files passed."
