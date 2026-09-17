$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$runtimeMethods = "['ccall','cwrap','HEAPF32','HEAPU32','HEAP32','HEAPU8','getValue','setValue']"
$exports = (@(
    '_wasm_alloc', '_wasm_free', '_get_abi_version',
    '_get_mesh_vertex_count', '_get_mesh_triangle_count', '_clear_mesh_state',
    '_set_mesh', '_get_dirty_range', '_build_adjacency', '_build_bvh',
    '_rebuild_bvh', '_refit_bvh', '_query_radius', '_compute_normals',
    '_sync_mask', '_sync_normals', '_sculpt_clay', '_sculpt_inflate',
    '_sculpt_flatten', '_sculpt_smooth', '_sculpt_pinch', '_sculpt_crease',
    '_sculpt_draw', '_sculpt_layer', '_sculpt_topology',
    '_sculpt_surface_offset', '_sculpt_directional_smooth', '_sculpt_grab',
    '_global_smooth', '_hardness_contrast', '_angle_preserving_smooth',
    '_smooth_standalone', '_terrain_bind', '_terrain_sync',
    '_terrain_clear_state', '_terrain_get_dirty_rect', '_terrain_apply_brush',
    '_render_analyze_luminance', '_render_select_lights'
) | ForEach-Object { "'$_'" }) -join ','

$emccArgs = @(
    'sculpting/wasm/sculpt_engine.cpp',
    'sculpting/wasm/terrain/terrain_sculpt_engine.cpp',
    'rendering/wasm/render_accel_engine.cpp',
    '-O2', '-msimd128',
    '-s', 'WASM=1',
    '-s', 'MODULARIZE=1',
    '-s', 'EXPORT_NAME=SculptEngineWASM',
    '-s', 'ALLOW_MEMORY_GROWTH=1',
    '-s', 'INITIAL_MEMORY=67108864',
    '-s', 'MAXIMUM_MEMORY=1073741824',
    '-s', "EXPORTED_RUNTIME_METHODS=$runtimeMethods",
    '-s', "EXPORTED_FUNCTIONS=[$exports]",
    '-o', 'sculpting/wasm/sculpt_engine.js'
)

Write-Host '[SM Engine] Building sculpt + terrain + render WASM (O2)...'
& emcc @emccArgs
if ($LASTEXITCODE -ne 0) {
    throw "emcc failed with exit code $LASTEXITCODE"
}
Write-Host '[SM Engine] WASM build complete: sculpting/wasm/sculpt_engine.js + .wasm'
