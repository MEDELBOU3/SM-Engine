/**
 * sculpt_wasm_bridge.js
 * ═══════════════════════════════════════════════════════════════════════════
 * SM Engine — WASM Bridge (mesh + terrain compute)

 * HOW IT WORKS (per-stroke):
 *   1. character-tools.js runs its JS spatial-grid query → gets hitResults[]
 *   2. Bridge uploads hitResults into WASM heap (int32 + float32 arrays)
 *   3. Bridge calls the matching C++ kernel (sculpt_clay, sculpt_smooth…)
 *   4. C++ writes directly into the WASM copy of positions
 *   5. Bridge reads only the dirty slice back into the Three.js Float32Array
 *   6. GPU upload happens via attr.updateRange (partial — same as JS path)
 *
 * TERRAIN: TerrainData heightfields use the same module through
 * applyTerrainTool(). The bridge copies only the dirty rectangle back to JS.
 *
 * FALLBACK: If WASM fails to load, every public function returns `null`
 * and the existing pure-JS terrain/mesh implementations remain active.
 * The user sees zero difference.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SculptWASM = (() => {
    'use strict';

    const EXPECTED_ABI_VERSION = 4;

    /* ── State ──────────────────────────────────────────────────────────── */
    let M       = null;    // Emscripten module instance
    let ready   = false;
    let failed  = false;
    let initPr  = null;

    /* Persistent WASM heap pointers (one per mesh, freed on deactivate) */
    let P = {
        pos  : 0,   // float*   positions
        norm : 0,   // float*   normals
        mask : 0,   // float*   mask
        idx  : 0,   // uint32*  index buffer (triangle list)
        adjF : 0,   // uint32*  adjacency flat array
        adjO : 0,   // uint32*  adjacency offsets
        adjC : 0,   // uint32*  adjacency counts
    };

    /* Per-call hit buffers — reused every stroke, never reallocated */
    const MAX_HITS = 65536;
    let P_hitIdx  = 0;    // int*
    let P_hitDist = 0;    // float*

    /* Temp output buffers for get_dirty_range */
    let P_dmin = 0, P_dmax = 0;

    let g_verts = 0;
    let g_mesh  = null;   // current THREE.Mesh

    /* Persistent heightfield binding shared by all terrain brush stamps. */
    const T = {
        data: null,
        buffer: null,
        ptr: 0,
        width: 0,
        height: 0,
        stepX: 1,
        stepZ: 1,
        version: -1
    };

    /* Terrain dirty rectangle output pointers. */
    let P_tminX = 0, P_tmaxX = 0, P_tminZ = 0, P_tmaxZ = 0;

    /* Reused buffers for native render preparation. */
    const R = {
        pixels: 0,
        pixelsBytes: 0,
        stats: 0,
        samples: 0,
        lightInput: 0,
        lightInputBytes: 0,
        lightVisible: 0,
        lightVisibleBytes: 0,
        lightScores: 0,
        lightScoresBytes: 0
    };

    /* Cached cwrap'd functions */
    const fn = {};

    /* ── Init ───────────────────────────────────────────────────────────── */

    async function init() {
        if (initPr) return initPr;
        initPr = _load();
        return initPr;
    }

    async function _load() {
        try {
            /*
             * The generated Emscripten wrapper is optional at source/runtime
             * level. Load it lazily so a normal JS-only checkout does not
             * produce a broken loader entry, while a built package still gets
             * the C++ accelerator before the first sculpt operation.
             */
            if (typeof SculptEngineWASM === 'undefined') {
                await _loadGeneratedModule();
            }

            /* SculptEngineWASM is set by the EXPORT_NAME emcc flag */
            if (typeof SculptEngineWASM === 'undefined') {
                throw new Error('SculptEngineWASM not found. Did you load sculpt_engine.js?');
            }
            M     = await SculptEngineWASM();
            _bind();

            const abiVersion = fn.getABIVersion?.();
            if (abiVersion !== EXPECTED_ABI_VERSION) {
                throw new Error(
                    `Unsupported sculpt WASM ABI ${abiVersion ?? 'unknown'}; expected ${EXPECTED_ABI_VERSION}.`
                );
            }

            ready = true;
            console.log('⚡ [SculptWASM] WASM sculpt engine ready');
            return true;
        } catch (e) {
            failed = true;
            console.warn(`⚠️ [SculptWASM] Load failed — JS fallback active. (${e.message})`);
            return false;
        }
    }

    function _loadGeneratedModule() {
        if (typeof document === 'undefined') return Promise.resolve(false);

        return new Promise(resolve => {
            const script = document.createElement('script');
            script.src = new URL(
                'sculpting/wasm/sculpt_engine.js',
                document.baseURI || window.location.href
            ).href;
            script.async = false;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            (document.head || document.body || document.documentElement)
                ?.appendChild(script);
        });
    }

    function _bind() {
        const w = (name, ret, args) => M.cwrap(name, ret, args);

        fn.alloc  = w('wasm_alloc', 'number', ['number']);
        fn.free   = w('wasm_free',  null,     ['number']);
        fn.getABIVersion = w('get_abi_version', 'number', []);
        fn.getVertexCount = w('get_mesh_vertex_count', 'number', []);
        fn.getTriangleCount = w('get_mesh_triangle_count', 'number', []);
        fn.clearMesh = w('clear_mesh_state', null, []);
        fn.clearTerrain = w('terrain_clear_state', null, []);

        fn.setMesh       = w('set_mesh',       null,     ['number','number','number','number','number','number']);
        fn.getDirty      = w('get_dirty_range', null,    ['number','number']);
        fn.syncMask      = w('sync_mask',       null,    ['number']);
        fn.syncNormals   = w('sync_normals',    null,    ['number']);

        fn.buildAdj      = w('build_adjacency', null,   ['number','number','number']);
        fn.buildBVH      = w('build_bvh',       null,   []);
        fn.rebuildBVH    = w('rebuild_bvh',     null,   []);
        fn.refitBVH      = w('refit_bvh',       null,   []);
        fn.queryRadius   = w('query_radius',    'number',['number','number','number','number','number','number']);
        fn.computeNormals= w('compute_normals', null,   []);

        fn.terrainBind = w('terrain_bind', null,
            ['number', 'number', 'number', 'number', 'number']);
        fn.terrainSync = w('terrain_sync', null, ['number']);
        fn.terrainGetDirty = w('terrain_get_dirty_rect', 'number',
            ['number', 'number', 'number', 'number']);
        fn.terrainApply = w('terrain_apply_brush', 'number', [
            'number', 'number', 'number', 'number', 'number',
            'number', 'number', 'number', 'number', 'number',
            'number', 'number', 'number', 'number'
        ]);

        fn.renderLuminance = w('render_analyze_luminance', 'number', [
            'number', 'number', 'number', 'number', 'number', 'number'
        ]);
        fn.selectLights = w('render_select_lights', 'number', [
            'number', 'number', 'number', 'number', 'number', 'number',
            'number', 'number', 'number', 'number'
        ]);

        fn.clay          = w('sculpt_clay',     null, ['number','number','number','number','number','number','number','number','number']);
        fn.inflate       = w('sculpt_inflate',  null, ['number','number','number','number','number','number','number']);
        fn.flatten       = w('sculpt_flatten',  null, ['number','number','number','number','number','number']);
        fn.smooth        = w('sculpt_smooth',   null, ['number','number','number','number','number','number']);
        fn.pinch         = w('sculpt_pinch',    null, ['number','number','number','number','number','number','number','number','number','number']);
        fn.crease        = w('sculpt_crease',   null, ['number','number','number','number','number','number','number','number','number']);
        fn.draw          = w('sculpt_draw',     null, ['number','number','number','number','number','number']);
        fn.layer         = w('sculpt_layer',    null, ['number','number','number','number','number','number','number','number']);
        fn.topology      = w('sculpt_topology', null, ['number','number','number','number','number','number','number','number','number']);
        fn.surfOff       = w('sculpt_surface_offset', null, ['number','number','number','number','number','number']);
        fn.dirSmooth     = w('sculpt_directional_smooth', null, ['number','number','number','number','number','number','number','number']);
        fn.grab          = w('sculpt_grab',     null, ['number','number','number','number','number','number','number','number']);

        fn.globalSmooth  = w('global_smooth',            null, ['number','number']);
        fn.hardContrast  = w('hardness_contrast',         null, ['number']);
        fn.angleSmooth   = w('angle_preserving_smooth',   null, ['number','number','number']);
        fn.smoothSA      = w('smooth_standalone',         null, ['number','number','number','number','number','number','number','number']);

        /* Allocate persistent per-call hit buffers */
        P_hitIdx  = fn.alloc(MAX_HITS * 4);   /* int32   */
        P_hitDist = fn.alloc(MAX_HITS * 4);   /* float32 */
        P_dmin    = fn.alloc(4);
        P_dmax    = fn.alloc(4);
        P_tminX   = fn.alloc(4);
        P_tmaxX   = fn.alloc(4);
        P_tminZ   = fn.alloc(4);
        P_tmaxZ   = fn.alloc(4);
        R.stats   = fn.alloc(16);
        R.samples = fn.alloc(4);
    }

    function _ensureRenderBuffer(pointerKey, sizeKey, bytes) {
        const required = Math.max(4, Math.ceil(Number(bytes) || 0));
        if (R[pointerKey] && R[sizeKey] >= required) return R[pointerKey];
        if (R[pointerKey]) fn.free(R[pointerKey]);
        R[pointerKey] = fn.alloc(required);
        R[sizeKey] = required;
        return R[pointerKey];
    }

    function _now() {
        return typeof performance !== 'undefined' && performance.now
            ? performance.now()
            : Date.now();
    }

    /**
     * Run the native display-referred meter over an RGBA8 viewport sample.
     * Returns null when the generated module does not contain the render ABI,
     * allowing the JavaScript analyzer to remain the compatibility fallback.
     */
    function analyzeLuminance(pixels, width, height, centerWeight = 0.78) {
        if (!_ok() || !fn.renderLuminance || !pixels || !M.HEAPU8) return null;
        const w = Math.max(1, Math.floor(Number(width) || 0));
        const h = Math.max(1, Math.floor(Number(height) || 0));
        const bytes = w * h * 4;
        if (pixels.length < bytes) return null;

        const pointer = _ensureRenderBuffer('pixels', 'pixelsBytes', bytes);
        M.HEAPU8.set(pixels.subarray ? pixels.subarray(0, bytes) : pixels, pointer);
        const ok = fn.renderLuminance(
            pointer, w, h, Number(centerWeight) || 0,
            R.stats, R.samples
        );
        if (!ok) return null;

        const stats = M.HEAPF32.subarray(R.stats >> 2, (R.stats >> 2) + 4);
        return {
            luminance: stats[0],
            centerLuminance: stats[1],
            lowPercentile: stats[2],
            highPercentile: stats[3],
            samples: M.getValue(R.samples, 'i32'),
            measuredAt: _now(),
            native: true
        };
    }

    /**
     * Select point/spot lights in C++ using compact records:
     * { x, y, z, range, intensity, type: 'point'|'spot' }.
     */
    function selectLights(entries, cameraPosition, maxDistance, maxPointLights, maxSpotLights) {
        if (!_ok() || !fn.selectLights || !M.HEAPU8 || !Array.isArray(entries)) return null;
        const count = entries.length;
        if (!count) {
            return {
                selected: 0,
                visible: new Uint8Array(0),
                scores: new Float32Array(0),
                native: true
            };
        }

        const input = new Float32Array(count * 6);
        for (let i = 0; i < count; i++) {
            const entry = entries[i] || {};
            const offset = i * 6;
            input[offset] = Number(entry.x) || 0;
            input[offset + 1] = Number(entry.y) || 0;
            input[offset + 2] = Number(entry.z) || 0;
            input[offset + 3] = Number(entry.range) || 0;
            input[offset + 4] = Number(entry.intensity) || 0;
            input[offset + 5] = entry.type === 'spot' ? 1 : 0;
        }

        const inputPtr = _ensureRenderBuffer(
            'lightInput', 'lightInputBytes', input.byteLength
        );
        const visiblePtr = _ensureRenderBuffer(
            'lightVisible', 'lightVisibleBytes', count
        );
        const scoresPtr = _ensureRenderBuffer(
            'lightScores', 'lightScoresBytes', count * 4
        );
        M.HEAPF32.set(input, inputPtr >> 2);

        const position = cameraPosition || {};
        const selected = fn.selectLights(
            inputPtr,
            count,
            Number(position.x) || 0,
            Number(position.y) || 0,
            Number(position.z) || 0,
            Number(maxDistance) || 120,
            Math.max(0, Math.floor(Number(maxPointLights) || 0)),
            Math.max(0, Math.floor(Number(maxSpotLights) || 0)),
            visiblePtr,
            scoresPtr
        );

        return {
            selected: Number(selected) || 0,
            visible: new Uint8Array(M.HEAPU8.subarray(visiblePtr, visiblePtr + count)),
            scores: new Float32Array(M.HEAPF32.subarray(
                scoresPtr >> 2, (scoresPtr >> 2) + count
            )),
            native: true
        };
    }

    /* ── Mesh binding ───────────────────────────────────────────────────── */

    /**
     * Call from AdvancedSculptingSystem.activateSculpting() after the
     * geometry is prepared and positions/normals/adjacency are ready.
     *
     * @param {THREE.Mesh}         mesh
     * @param {Float32Array}       maskData     per-vertex mask 0..1
     * @param {Array<Array<int>>}  adjacency    from computeAdjacency()
     */
    function setMesh(mesh, maskData, adjacency) {
        if (!_ok()) return;
        g_mesh  = mesh;
        const geo = mesh.geometry;
        const pos  = geo.attributes.position.array;
        const norm = geo.attributes.normal.array;
        const idxA = geo.index ? geo.index.array : null;
        g_verts    = geo.attributes.position.count;
        const triN = idxA ? idxA.length / 3 : 0;

        /* Clear C++-owned BVH state before freeing JS-owned heap buffers. */
        fn.clearMesh?.();

        /* Free previous mesh buffers */
        _freeP();

        /* Positions */
        P.pos = fn.alloc(pos.byteLength);
        M.HEAPF32.set(pos,  P.pos  >> 2);

        /* Normals */
        P.norm = fn.alloc(norm.byteLength);
        M.HEAPF32.set(norm, P.norm >> 2);

        /* Mask */
        const mask = maskData || new Float32Array(g_verts);
        P.mask = fn.alloc(mask.byteLength);
        M.HEAPF32.set(mask, P.mask >> 2);

        /* Index */
        if (idxA) {
            P.idx = fn.alloc(idxA.byteLength);
            M.HEAPU32.set(idxA, P.idx >> 2);
        }

        /* Tell C++ */
        fn.setMesh(P.pos, P.norm, P.mask, P.idx || 0, g_verts, triN);

        /* Adjacency */
        if (adjacency) _uploadAdj(adjacency);

        /* BVH */
        fn.buildBVH();
        console.log(`⚡ [SculptWASM] Mesh set: ${g_verts} verts`);
    }

    /**
     * Flatten JS adjacency Array<Array<int>> into three typed arrays
     * and upload them to WASM heap.
     */
    function _uploadAdj(adj) {
        if (P.adjF) { fn.free(P.adjF); fn.free(P.adjO); fn.free(P.adjC); }
        const N = adj.length;
        let total = 0;
        for (let i = 0; i < N; i++) total += adj[i].length;

        const flat = new Uint32Array(total);
        const offs = new Uint32Array(N);
        const cnts = new Uint32Array(N);
        let cur = 0;
        for (let i = 0; i < N; i++) {
            offs[i] = cur;
            const nb = adj[i];
            cnts[i] = nb.length;
            for (let j = 0; j < nb.length; j++) flat[cur++] = nb[j];
        }

        P.adjF = fn.alloc(flat.byteLength);
        P.adjO = fn.alloc(offs.byteLength);
        P.adjC = fn.alloc(cnts.byteLength);
        M.HEAPU32.set(flat, P.adjF >> 2);
        M.HEAPU32.set(offs, P.adjO >> 2);
        M.HEAPU32.set(cnts, P.adjC >> 2);
        fn.buildAdj(P.adjF, P.adjO, P.adjC);
    }

    function _freeP() {
        ['pos','norm','mask','idx','adjF','adjO','adjC'].forEach(k => {
            if (P[k]) { fn.free(P[k]); P[k] = 0; }
        });
    }

    /* ── Sync helpers ───────────────────────────────────────────────────── */

    /** Call after JS-side applyMask() / clearMask() */
    function syncMask(maskData) {
        if (!_ok() || !P.mask) return;
        M.HEAPF32.set(maskData, P.mask >> 2);
        fn.syncMask(P.mask);
    }

    /** Call after THREE.js computeVertexNormals() so WASM normals stay correct */
    function syncNormals() {
        if (!_ok() || !g_mesh || !P.norm) return;
        const norm = g_mesh.geometry.attributes.normal.array;
        M.HEAPF32.set(norm, P.norm >> 2);
        fn.syncNormals(P.norm);
    }

    /**
     * Keep WASM positions in sync when JS modifies them directly
     * (e.g., after hardReset restores originalPositions).
     */
    function syncPositions() {
        if (!_ok() || !g_mesh || !P.pos) return;
        const pos = g_mesh.geometry.attributes.position.array;
        M.HEAPF32.set(pos, P.pos >> 2);
    }

    function rebuildBVH() { if (_ok()) fn.rebuildBVH(); }
    function refitBVH()   { if (_ok()) fn.refitBVH(); }

    /**
     * Query the native BVH in local mesh space. Returns the same hit shape as
     * AdvancedSculptingSystem.getVerticesInRadius(), so callers can switch
     * between native and JS broad-phase without changing brush code.
     */
    function queryRadius(localPoint, radius) {
        if (!_ok() || !P_hitIdx || !P_hitDist) return null;

        const cx = Number(localPoint?.x) || 0;
        const cy = Number(localPoint?.y) || 0;
        const cz = Number(localPoint?.z) || 0;
        const r = Math.max(0, Number(radius) || 0);
        if (r <= 0) return [];

        const n = Math.min(
            MAX_HITS,
            Math.max(0, Number(fn.queryRadius(
                cx, cy, cz, r, P_hitIdx, P_hitDist
            )) || 0)
        );
        const idxView = M.HEAP32.subarray(
            P_hitIdx >> 2,
            (P_hitIdx >> 2) + n
        );
        const distView = M.HEAPF32.subarray(
            P_hitDist >> 2,
            (P_hitDist >> 2) + n
        );
        const hits = new Array(n);
        for (let i = 0; i < n; i++) {
            hits[i] = { index: idxView[i], dist: distView[i] };
        }
        return hits;
    }

    const TERRAIN_TOOLS = Object.freeze({
        raiseLower: 0,
        smooth: 1,
        flatten: 2,
        pinch: 3,
        clay: 4,
        scrape: 5,
        noise: 6,
        perlin: 7,
        erosion: 8,
        thermalErosion: 9,
        terrace: 10,
        grab: 11,
        inflate: 12,
        deflate: 13,
        crease: 14,
        fill: 15,
        relax: 16,
        level: 17,
        ridge: 18,
        valley: 19,
        cliff: 20,
        plateau: 21,
        crater: 22,
        canyon: 23,
        dune: 24,
        hydraulic: 25,
        deposition: 26,
        sharpen: 27,
        blur: 28
    });

    function clearTerrainBinding() {
        if (!M) return;
        fn.clearTerrain?.();
        if (T.ptr) fn.free(T.ptr);
        T.data = null;
        T.buffer = null;
        T.ptr = 0;
        T.width = 0;
        T.height = 0;
        T.stepX = 1;
        T.stepZ = 1;
        T.version = -1;
    }

    function bindTerrain(data, width, height, stepX, stepZ) {
        if (!_ok() || !data?.heights) return false;

        const heights = data.heights;
        const nextWidth = Math.max(2, Math.floor(Number(width) || 0));
        const nextHeight = Math.max(2, Math.floor(Number(height) || 0));
        if (heights.length !== nextWidth * nextHeight) return false;

        const nextStepX = Math.max(0.0001, Number(stepX) || 1);
        const nextStepZ = Math.max(0.0001, Number(stepZ) || 1);
        const needsAllocation =
            T.data !== data ||
            T.buffer !== heights.buffer ||
            T.width !== nextWidth ||
            T.height !== nextHeight;

        if (needsAllocation) {
            clearTerrainBinding();
            T.ptr = fn.alloc(heights.byteLength);
            T.data = data;
            T.buffer = heights.buffer;
            T.width = nextWidth;
            T.height = nextHeight;
            T.stepX = nextStepX;
            T.stepZ = nextStepZ;
            M.HEAPF32.set(heights, T.ptr >> 2);
            fn.terrainBind(T.ptr, T.width, T.height, T.stepX, T.stepZ);
            T.version = Number(data.version) || 0;
            return true;
        }

        const version = Number(data.version) || 0;
        if (T.version !== version) {
            M.HEAPF32.set(heights, T.ptr >> 2);
            fn.terrainSync(T.ptr);
            T.version = version;
        }
        return true;
    }

    /**
     * Run a terrain heightfield stamp in C++ and copy only the dirty rows back
     * into TerrainData.heights. Returns grid bounds for component sync, or
     * null when the native backend cannot handle this request.
     */
    function applyTerrainTool(options = {}) {
        if (!_ok()) return null;

        const data = options.data;
        const toolName = String(options.tool || '');
        const tool = TERRAIN_TOOLS[toolName];
        if (tool === undefined || !data?.heights) return null;

        const grid = options.grid || {};
        const dimensions = options.dimensions || {};
        const width = Math.floor(Number(grid.width) || 0);
        const height = Math.floor(Number(grid.height) || 0);
        if (width < 2 || height < 2) return null;

        const stepX = Number(dimensions.width) / Math.max(1, width - 1);
        const stepZ = Number(dimensions.length) / Math.max(1, height - 1);
        if (!bindTerrain(data, width, height, stepX, stepZ)) return null;

        const center = options.center || {};
        const radius = Math.max(0.01, Number(options.radius) || 1);
        const radiusX = radius / Math.max(0.0001, Number(dimensions.width) || 1) * (width - 1);
        const radiusZ = radius / Math.max(0.0001, Number(dimensions.length) || 1) * (height - 1);
        const finite = value =>
            value !== null && value !== undefined &&
            Number.isFinite(Number(value));
        const param1 = finite(options.target) ? Number(options.target) :
            toolName === 'terrace' ? Number(options.terraceStep ?? 1) :
            (toolName === 'noise' || toolName === 'perlin') ? Number(options.noiseAmplitude ?? 1) :
            (toolName === 'erosion' || toolName === 'thermalErosion' || toolName === 'hydraulic')
                ? Number(options.iterations ?? options.erosionIterations ?? 4) : NaN;
        const param2 = (toolName === 'noise' || toolName === 'perlin')
            ? Number(options.noiseFrequency ?? 0.08)
            : (toolName === 'thermalErosion')
                ? Number(options.talusAngle ?? 0.08)
                : (toolName === 'hydraulic' || toolName === 'erosion')
                    ? Number(options.sedimentCapacity ?? 1.2)
                    : NaN;
        const param3 = (toolName === 'noise' || toolName === 'perlin')
            ? Number(options.noiseOctaves ?? 5)
            : (toolName === 'hydraulic' || toolName === 'erosion')
                ? Number(options.erosionEvaporation ?? 0.08)
                : NaN;
        const result = fn.terrainApply(
            tool,
            Number(center.x) || 0,
            Number(center.z) || 0,
            radiusX,
            radiusZ,
            Number(options.strength) || 0,
            Number(options.pressure) || 0,
            Number(options.falloff) || 0,
            Number(options.heightScale) || 1,
            Number(options.sign) < 0 ? -1 : 1,
            param1,
            param2,
            param3,
            Number(options.seed) || 1337
        );
        if (!result) return null;

        const hasDirty = fn.terrainGetDirty(
            P_tminX, P_tmaxX, P_tminZ, P_tmaxZ
        );
        let minX = M.getValue(P_tminX, 'i32');
        let maxX = M.getValue(P_tmaxX, 'i32');
        let minZ = M.getValue(P_tminZ, 'i32');
        let maxZ = M.getValue(P_tmaxZ, 'i32');

        if (!hasDirty) {
            minX = Math.max(0, Math.floor((Number(center.x) || 0) - radiusX));
            maxX = Math.min(width - 1, Math.ceil((Number(center.x) || 0) + radiusX));
            minZ = Math.max(0, Math.floor((Number(center.z) || 0) - radiusZ));
            maxZ = Math.min(height - 1, Math.ceil((Number(center.z) || 0) + radiusZ));
        } else {
            minX = Math.max(0, Math.min(width - 1, minX));
            maxX = Math.max(minX, Math.min(width - 1, maxX));
            minZ = Math.max(0, Math.min(height - 1, minZ));
            maxZ = Math.max(minZ, Math.min(height - 1, maxZ));
        }

        const targetHeights = data.heights;
        for (let z = minZ; z <= maxZ; z++) {
            const start = z * width + minX;
            const end = z * width + maxX + 1;
            targetHeights.set(
                M.HEAPF32.subarray((T.ptr >> 2) + start, (T.ptr >> 2) + end),
                start
            );
        }

        /* TerrainBrushes.sync() increments data.version once per stamp. */
        T.version = (Number(data.version) || 0) + 1;
        return { minX, maxX, minZ, maxZ, native: true };
    }

    function dispose() {
        if (!M) return;

        /* Clear C++ pointers before releasing their WASM heap buffers. */
        fn.clearMesh?.();
        clearTerrainBinding();
        _freeP();

        [P_hitIdx, P_hitDist, P_dmin, P_dmax].forEach(pointer => {
            if (pointer) fn.free(pointer);
        });

        [P_tminX, P_tmaxX, P_tminZ, P_tmaxZ].forEach(pointer => {
            if (pointer) fn.free(pointer);
        });

        [R.pixels, R.stats, R.samples, R.lightInput,
            R.lightVisible, R.lightScores].forEach(pointer => {
            if (pointer) fn.free(pointer);
        });

        P_hitIdx = 0;
        P_hitDist = 0;
        P_dmin = 0;
        P_dmax = 0;
        P_tminX = 0;
        P_tmaxX = 0;
        P_tminZ = 0;
        P_tmaxZ = 0;
        R.pixels = 0;
        R.pixelsBytes = 0;
        R.stats = 0;
        R.samples = 0;
        R.lightInput = 0;
        R.lightInputBytes = 0;
        R.lightVisible = 0;
        R.lightVisibleBytes = 0;
        R.lightScores = 0;
        R.lightScoresBytes = 0;
        g_mesh = null;
        g_verts = 0;
        ready = false;
        failed = false;
        initPr = null;
        M = null;
    }

    /* ── Per-stroke: upload JS hit results → WASM ───────────────────────── */

    /**
     * Upload the hit array from the JS spatial-grid query to WASM heap.
     * hitResults: [{index, dist}, …]  (from getVerticesInRadius)
     * Returns the count uploaded (capped at MAX_HITS).
     */
    function _uploadHits(hitResults) {
        const n = Math.min(hitResults.length, MAX_HITS);
        const idxView  = M.HEAP32.subarray (P_hitIdx  >> 2, (P_hitIdx  >> 2) + n);
        const distView = M.HEAPF32.subarray(P_hitDist >> 2, (P_hitDist >> 2) + n);
        for (let i = 0; i < n; i++) {
            idxView [i] = hitResults[i].index;
            distView[i] = hitResults[i].dist;
        }
        return n;
    }

    /* After a kernel: read dirty range → sync that slice to Three.js → partial GPU upload */
    function _finish() {
        if (!g_mesh) return null;
        fn.getDirty(P_dmin, P_dmax);
        const dmin = M.getValue(P_dmin, 'i32');
        const dmax = M.getValue(P_dmax, 'i32');
        if (dmin >= dmax) return null;

        /* Copy only the dirty float slice from WASM heap → JS typed array */
        const posArr = g_mesh.geometry.attributes.position.array;
        const src    = M.HEAPF32.subarray((P.pos >> 2) + dmin, (P.pos >> 2) + dmax);
        posArr.set(src, dmin);

        /* Brush kernels move vertices in-place; keep native broad-phase tight. */
        fn.refitBVH?.();

        /* Partial GPU upload */
        const attr = g_mesh.geometry.attributes.position;
        attr.updateRange.offset = dmin;
        attr.updateRange.count  = dmax - dmin;
        attr.needsUpdate = true;

        return { minRange: dmin, maxRange: dmax };
    }

    /* After global ops: sync ALL positions */
    function _finishAll() {
        if (!g_mesh) return;
        const posArr = g_mesh.geometry.attributes.position.array;
        const src    = M.HEAPF32.subarray(P.pos >> 2, (P.pos >> 2) + posArr.length);
        posArr.set(src);
        g_mesh.geometry.attributes.position.needsUpdate = true;
        fn.refitBVH?.();
    }

    /* ═══════════════════════════════════════════════════════════════════════
       PUBLIC BRUSH API
       Each function takes hitResults (from JS getVerticesInRadius) + params.
    ═══════════════════════════════════════════════════════════════════════ */

    function clay(hits, localNormal, radius, strength, hardness, invert) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.clay(P_hitIdx, P_hitDist, n,
                localNormal.x, localNormal.y, localNormal.z,
                radius, strength, hardness, invert ? 1 : 0);
        return _finish();
    }

    function inflate(hits, radius, strength, hardness, invert) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.inflate(P_hitIdx, P_hitDist, n, radius, strength, hardness, invert ? 1 : 0);
        return _finish();
    }

    function flatten(hits, radius, strength, hardness) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.flatten(P_hitIdx, P_hitDist, n, radius, strength, hardness);
        return _finish();
    }

    function smooth(hits, radius, strength, hardness) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.smooth(P_hitIdx, P_hitDist, n, radius, strength, hardness);
        return _finish();
    }

    function pinch(hits, localCenter, radius, strength, hardness, invert) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.pinch(P_hitIdx, P_hitDist, n,
                 localCenter.x, localCenter.y, localCenter.z,
                 radius, strength, hardness, invert ? 1 : 0);
        return _finish();
    }

    function crease(hits, localNormal, radius, strength, hardness, invert) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.crease(P_hitIdx, P_hitDist, n,
                  localNormal.x, localNormal.y, localNormal.z,
                  radius, strength, hardness, invert ? 1 : 0);
        return _finish();
    }

    function draw(hits, radius, strength, invert) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.draw(P_hitIdx, P_hitDist, n, radius, strength, invert ? 1 : 0);
        return _finish();
    }

    function layer(hits, localNormal, radius, strength, invert) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.layer(P_hitIdx, P_hitDist, n,
                 localNormal.x, localNormal.y, localNormal.z,
                 radius, strength, invert ? 1 : 0);
        return _finish();
    }

    function topology(hits, localNormal, radius, strength, invert) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.topology(P_hitIdx, P_hitDist, n,
                    localNormal.x, localNormal.y, localNormal.z,
                    radius, strength, invert ? 1 : 0);
        return _finish();
    }

    function surfaceOffset(hits, radius, strength, invert) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.surfOff(P_hitIdx, P_hitDist, n, radius, strength, invert ? 1 : 0);
        return _finish();
    }

    function directionalSmooth(hits, strokeDir, radius, strength) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.dirSmooth(P_hitIdx, P_hitDist, n,
                     strokeDir.x, strokeDir.y, strokeDir.z,
                     radius, strength);
        return _finish();
    }

    function grab(hits, localDelta, radius, strength) {
        if (!_ok()) return null;
        const n = _uploadHits(hits); if (!n) return null;
        fn.grab(P_hitIdx, P_hitDist, n,
                localDelta.x, localDelta.y, localDelta.z,
                radius, strength);
        return _finish();
    }

    /* ── Global operations ──────────────────────────────────────────────── */

    function globalSmooth(iterations, intensity) {
        if (!_ok()) return false;
        fn.globalSmooth(iterations, intensity);
        _finishAll();
        return true;
    }

    function hardnessContrast(contrast) {
        if (!_ok()) return false;
        fn.hardContrast(contrast !== undefined ? contrast : 0.5);
        _finishAll();
        return true;
    }

    function anglePreservingSmooth(iterations, intensity, thresh) {
        if (!_ok()) return false;
        fn.angleSmooth(iterations, intensity, thresh !== undefined ? thresh : 0.7);
        _finishAll();
        return true;
    }

    /**
     * Smooth an isolated geometry buffer (e.g., extracted armor mesh).
     * Does NOT touch g_pos.
     * Mirrors smoothGeometry(geometry, iterations) in character-tools.js.
     *
     * @param {THREE.BufferGeometry} geo
     * @param {Array<Array<int>>}    adj
     * @param {number}               iterations
     * @param {number}               alpha       default 0.5
     */
    function smoothStandalone(geo, adj, iterations, alpha = 0.5) {
        if (!_ok()) return false;
        const pos = geo.attributes.position.array;
        const N   = geo.attributes.position.count;
        let total = 0; adj.forEach(a => total += a.length);
        const flat = new Uint32Array(total), offs = new Uint32Array(N), cnts = new Uint32Array(N);
        let cur = 0;
        for (let i = 0; i < N; i++) {
            offs[i] = cur; const nb = adj[i] || [];
            cnts[i] = nb.length;
            for (let j = 0; j < nb.length; j++) flat[cur++] = nb[j];
        }
        const pP = fn.alloc(pos.byteLength);
        const pF = fn.alloc(flat.byteLength);
        const pO = fn.alloc(offs.byteLength);
        const pC = fn.alloc(cnts.byteLength);
        M.HEAPF32.set(pos,  pP >> 2);
        M.HEAPU32.set(flat, pF >> 2);
        M.HEAPU32.set(offs, pO >> 2);
        M.HEAPU32.set(cnts, pC >> 2);
        fn.smoothSA(pP, pos.length, pF, pO, pC, N, iterations, alpha);
        pos.set(M.HEAPF32.subarray(pP >> 2, (pP >> 2) + pos.length));
        geo.attributes.position.needsUpdate = true;
        fn.free(pP); fn.free(pF); fn.free(pO); fn.free(pC);
        return true;
    }

    /* ── Helpers ────────────────────────────────────────────────────────── */
    function _ok()        { return ready && !failed && M !== null; }
    function isReady()    { return ready && !failed; }
    function isFallback() { return !ready || failed; }
    function getStatus()  {
        return {
            ready,
            failed,
            abiVersion: ready ? EXPECTED_ABI_VERSION : null,
            verts: ready ? (fn.getVertexCount?.() || g_verts) : g_verts,
            triangles: ready ? (fn.getTriangleCount?.() || 0) : 0,
            meshBound: !!g_mesh,
            terrainBound: !!T.data,
            terrainVertices: T.data?.heights?.length || 0,
            renderNative: ready && !!fn.renderLuminance && !!fn.selectLights
        };
    }

    /* ── Public API ─────────────────────────────────────────────────────── */
    return Object.freeze({
        init, setMesh, syncMask, syncNormals, syncPositions,
        rebuildBVH, refitBVH, queryRadius,
        applyTerrainTool, analyzeLuminance, selectLights, dispose,
        isReady, isFallback, getStatus,
        /* Per-stroke */
        clay, inflate, flatten, smooth, pinch, crease,
        draw, layer, topology, surfaceOffset, directionalSmooth, grab,
        /* Global */
        globalSmooth, hardnessContrast, anglePreservingSmooth,
        /* Utility */
        smoothStandalone,
    });
})();

window.SculptWASM = SculptWASM;
