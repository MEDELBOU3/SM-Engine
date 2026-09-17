$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$runtimeMethods = "['cwrap','HEAPF64','HEAPU8']"
$exports = (@(
    '_water_reset', '_water_set_time', '_water_step',
    '_water_upsert_body', '_water_remove_body',
    '_water_sample', '_water_sample_body', '_water_add_ripple',
    '_water_get_body_count', '_water_get_time',
    '_malloc', '_free'
) | ForEach-Object { "'$_'" }) -join ','

$emccArgs = @(
    'engine/native/water/src/SMWaterCore.cpp',
    'engine/native/water/src/SMWaterWasmApi.cpp',
    '-Iengine/native/water/include',
    '-O2', '-std=c++20',
    '-s', 'WASM=1',
    # Embed the small WaterWorld binary so Electron file:// pages do not rely
    # on Chromium fetch support for local .wasm URLs.
    '-s', 'SINGLE_FILE=1',
    '-s', 'MODULARIZE=1',
    '-s', 'EXPORT_NAME=SMWaterCoreWASM',
    '-s', 'ENVIRONMENT=web,node',
    '-s', 'ALLOW_MEMORY_GROWTH=1',
    '-s', 'INITIAL_MEMORY=16777216',
    '-s', 'MAXIMUM_MEMORY=268435456',
    '-s', "EXPORTED_RUNTIME_METHODS=$runtimeMethods",
    '-s', "EXPORTED_FUNCTIONS=[$exports]",
    '-o', 'engine/native/water/sm_water_core.js'
)

Write-Host '[SM Engine] Building native WaterWorld WASM (O2)...'
& emcc @emccArgs
if ($LASTEXITCODE -ne 0) {
    throw "emcc failed with exit code $LASTEXITCODE"
}

# Some elevated Windows toolchains create the output with an ACL that only
# grants Administrators/System access. Keep the generated module readable by
# the normal Electron/Node user as well; this is still scoped to one build
# artifact, never the repository.
$outputPath = Join-Path $repoRoot 'engine/native/water/sm_water_core.js'
if ((Test-Path -LiteralPath $outputPath) -and (Get-Command icacls.exe -ErrorAction SilentlyContinue)) {
    & icacls.exe $outputPath /grant "${env:USERNAME}:(R)" | Out-Null
}
Write-Host '[SM Engine] Water WASM build complete: engine/native/water/sm_water_core.js (single-file module)'
