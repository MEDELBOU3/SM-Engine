// sculpting/terrain-sculpting/TerrainBrushes.js
// Advanced heightfield terrain brush engine.
// Preserves the previous brush API while adding new terrain-form brushes.

(() => {
    const NS = window.TerrainSculpting;
    if (!NS) throw new Error('TerrainSculpting namespace is required.');

    const state = NS.state || (NS.state = {});

    // TerrainState owns and freezes this registry. The previous implementation
    // called Object.assign on that frozen object, which throws during script
    // loading and prevents NS.brushes from being created at all.
    const TOOLS = NS.TOOLS;
    if (!TOOLS) {
        throw new Error('TerrainState.js must load before TerrainBrushes.js');
    }

    function numeric(v, fallback) {
        return Number.isFinite(Number(v)) ? Number(v) : fallback;
    }

    function getComponentManager(terrain, data) {
        return terrain?.userData?.componentManager ||
            terrain?.userData?.terrainComponentManager ||
            data?.componentManager ||
            (NS.activeComponentManager?.data === data
                ? NS.activeComponentManager
                : null) ||
            null;
    }

    function worldDeltaToHeight(ctx, worldDelta) {
        return worldDelta / Math.max(0.0001, ctx.heightScale);
    }

    function getTerrain() {
        return NS.getLandscape?.() || window.terrain || null;
    }

    function getData(t) {
        return t?.userData?.terrainData || null;
    }

    function getGrid(data) {
        const count = data?.heights?.length || 0;
        if (!count) return null;

        const resolutionX = Math.floor(Number(data.resolutionX) || 0);
        const resolutionZ = Math.floor(Number(data.resolutionZ) || 0);
        if (
            resolutionX > 1 &&
            resolutionZ > 1 &&
            resolutionX * resolutionZ === count
        ) {
            return { width: resolutionX, height: resolutionZ };
        }

        const explicit =
            Number(data.resolution) ||
            Number(data.heightResolution) ||
            0;

        if (explicit > 1 && (explicit + 1) * (explicit + 1) === count) {
            return { width: explicit + 1, height: explicit + 1 };
        }

        const side = Math.round(Math.sqrt(count));
        if (side * side === count) {
            return { width: side, height: side };
        }

        const width =
            Number(data.widthSamples) ||
            Number(data.gridWidth) ||
            side;

        return {
            width: Math.max(2, width),
            height: Math.max(2, Math.ceil(count / Math.max(1, width)))
        };
    }

    function getDimensions(data, terrain) {
        let width =
            numeric(data.width, 0) ||
            numeric(data.sizeX, 0) ||
            numeric(data.worldWidth, 0);

        let length =
            numeric(data.length, 0) ||
            numeric(data.sizeZ, 0) ||
            numeric(data.worldLength, 0);

        if (!(width > 0) || !(length > 0)) {
            const box = new THREE.Box3();

            terrain?.traverse?.(object => {
                if (!object.isMesh || !object.geometry) return;
                if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
                box.expandByObject(object);
            });

            if (!box.isEmpty()) {
                width = width > 0 ? width : box.max.x - box.min.x;
                length = length > 0 ? length : box.max.z - box.min.z;
            }
        }

        return {
            width: width > 0 ? width : 100,
            length: length > 0 ? length : 100
        };
    }

    function getOrigin(data, dimensions) {
        return {
            x: numeric(data.originX, -dimensions.width * 0.5),
            z: numeric(data.originZ, -dimensions.length * 0.5)
        };
    }

    function toGrid(local, data, dimensions, grid) {
        const origin = getOrigin(data, dimensions);

        return {
            x: ((local.x - origin.x) / dimensions.width) * (grid.width - 1),
            z: ((local.z - origin.z) / dimensions.length) * (grid.height - 1)
        };
    }

    function createContext(context) {
        const terrain = context.terrain || getTerrain();
        const data = getData(terrain);
        const grid = getGrid(data);

        if (!terrain || !data?.heights || !grid) return null;

        const dimensions = getDimensions(data, terrain);
        const local = context.point.clone();
        terrain.worldToLocal(local);

        const center = toGrid(local, data, dimensions, grid);

        return {
            terrain,
            data,
            grid,
            dimensions,
            local,
            center,
            heightScale: Math.max(0.0001, numeric(data.heightScale, 1)),
            radius: Math.max(0.01, numeric(state.brushSize, 10)),
            strength: Math.max(0, numeric(state.brushStrength, 0.5)),
            pressure: Math.max(0.05, Math.min(1, numeric(context.pressure, 1)))
        };
    }

    function falloff(d) {
        const x = Math.min(1, Math.max(0, d));
        const f = Math.min(1, Math.max(0, numeric(state.brushFalloff, 0.5)));
        const exponent = 0.35 + f * 4.0;
        return Math.pow(Math.max(0, 1 - x), exponent);
    }

    function signed(v) {
        return state.isShiftPressed ? -v : v;
    }

    function eachSample(ctx, callback) {
        const sx = Math.max(
            1,
            ctx.radius / ctx.dimensions.width * (ctx.grid.width - 1)
        );
        const sz = Math.max(
            1,
            ctx.radius / ctx.dimensions.length * (ctx.grid.height - 1)
        );

        const minX = Math.max(0, Math.floor(ctx.center.x - sx));
        const maxX = Math.min(ctx.grid.width - 1, Math.ceil(ctx.center.x + sx));
        const minZ = Math.max(0, Math.floor(ctx.center.z - sz));
        const maxZ = Math.min(ctx.grid.height - 1, Math.ceil(ctx.center.z + sz));

        for (let z = minZ; z <= maxZ; z++) {
            for (let x = minX; x <= maxX; x++) {
                const dx = (x - ctx.center.x) / sx;
                const dz = (z - ctx.center.z) / sz;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d > 1) continue;

                ctx.dirtyMinX = Math.min(ctx.dirtyMinX ?? x, x);
                ctx.dirtyMaxX = Math.max(ctx.dirtyMaxX ?? x, x);
                ctx.dirtyMinZ = Math.min(ctx.dirtyMinZ ?? z, z);
                ctx.dirtyMaxZ = Math.max(ctx.dirtyMaxZ ?? z, z);

                callback(
                    z * ctx.grid.width + x,
                    x,
                    z,
                    falloff(d),
                    d
                );
            }
        }
    }

    function averageNeighbour(source, index, width, height) {
        const x = index % width;
        const z = Math.floor(index / width);
        let sum = 0;
        let count = 0;

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dz) continue;

                const nx = x + dx;
                const nz = z + dz;

                if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;

                sum += source[nz * width + nx];
                count++;
            }
        }

        return count ? sum / count : source[index];
    }

    function localAverage(source, index, width, height, radius) {
        const x = index % width;
        const z = Math.floor(index / width);
        let sum = 0;
        let count = 0;

        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const nz = z + dz;

                if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;

                sum += source[nz * width + nx];
                count++;
            }
        }

        return count ? sum / count : source[index];
    }

    function noise2D(x, z, seed) {
        const n = Math.sin(
            x * 127.1 +
            z * 311.7 +
            seed * 74.7
        ) * 43758.5453;

        return n - Math.floor(n);
    }

    function smoothNoise(x, z, seed) {
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const xf = x - x0;
        const zf = z - z0;

        const a = noise2D(x0, z0, seed);
        const b = noise2D(x0 + 1, z0, seed);
        const c = noise2D(x0, z0 + 1, seed);
        const d = noise2D(x0 + 1, z0 + 1, seed);

        const sx = xf * xf * (3 - 2 * xf);
        const sz = zf * zf * (3 - 2 * zf);

        return (
            a * (1 - sx) * (1 - sz) +
            b * sx * (1 - sz) +
            c * (1 - sx) * sz +
            d * sx * sz
        );
    }

    function fbm(x, z, seed) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let total = 0;

        const octaves = Math.max(
            1,
            Math.min(8, Math.floor(numeric(state.noiseOctaves, 5)))
        );

        const persistence = Math.max(
            0,
            Math.min(1, numeric(state.noisePersistence, 0.5))
        );

        for (let i = 0; i < octaves; i++) {
            value += smoothNoise(
                x * frequency,
                z * frequency,
                seed + i * 101
            ) * amplitude;

            total += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        return value / Math.max(0.00001, total);
    }

    function sync(ctx, reason = 'sculpt') {
        ctx.data.version = (ctx.data.version || 0) + 1;

        // Generated landscapes are component based. Their authoritative sync
        // object lives on terrain.userData.componentManager (the panel uses the
        // same manager for Smooth All / Normalize). Prefer it over global/stale
        // managers so the edited height array is actually pushed to the meshes.
        const manager = getComponentManager(ctx.terrain, ctx.data);
        let synced = false;

        try {
            if (
                manager?.updateRegion &&
                Number.isFinite(ctx.dirtyMinX) &&
                Number.isFinite(ctx.dirtyMaxX) &&
                Number.isFinite(ctx.dirtyMinZ) &&
                Number.isFinite(ctx.dirtyMaxZ)
            ) {
                manager.updateRegion(
                    ctx.dirtyMinX,
                    ctx.dirtyMaxX,
                    ctx.dirtyMinZ,
                    ctx.dirtyMaxZ
                );
                synced = true;
            } else if (manager?.syncAll) {
                manager.syncAll();
                synced = true;
            } else if (typeof NS.syncAll === 'function') {
                NS.syncAll(ctx.terrain);
                synced = true;
            }
        } catch (error) {
            console.error('[TerrainBrushes] Terrain sync failed; using geometry fallback.', error);
        }

        if (!synced) {
            updateGeometryFallback(ctx);
        }

        window.dispatchEvent(new CustomEvent('sm:terrain-changed', {
            detail: {
                terrain: ctx.terrain,
                reason,
                tool: state.selectedTool
            }
        }));
    }

    function updateGeometryFallback(ctx) {
        ctx.terrain?.traverse?.(object => {
            const position = object.geometry?.attributes?.position;
            if (!object.isMesh || !position) return;
            if (position.count !== ctx.data.heights.length) return;

            for (let i = 0; i < position.count; i++) {
                position.setY(i, ctx.data.heights[i] * ctx.heightScale);
            }

            position.needsUpdate = true;
            object.geometry.computeVertexNormals?.();
            object.geometry.computeBoundingBox?.();
            object.geometry.computeBoundingSphere?.();

            if (object.geometry.attributes.normal) {
                object.geometry.attributes.normal.needsUpdate = true;
            }
        });
    }

    function applyRaiseLower(ctx) {
        // Strength is interpreted in world metres per stamp. The stored height
        // field is unscaled, so convert world displacement back to height units.
        // 0.35m at strength=1 makes the default 900m-class landscape responsive
        // without making a single click explode the terrain.
        const delta = signed(
            worldDeltaToHeight(
                ctx,
                0.35 * ctx.strength * ctx.pressure
            )
        );

        eachSample(ctx, (index, x, z, weight) => {
            ctx.data.heights[index] += delta * weight;
        });
    }

    function applySmooth(ctx) {
        const source = ctx.data.heights.slice();
        const amount = Math.min(1, ctx.strength * ctx.pressure);

        eachSample(ctx, index => {
            const avg = averageNeighbour(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height
            );

            ctx.data.heights[index] =
                source[index] +
                (avg - source[index]) * amount * 0.82;
        });
    }

    function applyFlatten(ctx) {
        const centerIndex = Math.min(
            ctx.data.heights.length - 1,
            Math.max(
                0,
                Math.round(
                    ctx.center.z * ctx.grid.width +
                    ctx.center.x
                )
            )
        );

        const target = Number.isFinite(Number(state.flattenTargetHeight))
            ? Number(state.flattenTargetHeight)
            : localAverage(
                ctx.data.heights,
                centerIndex,
                ctx.grid.width,
                ctx.grid.height,
                2
            );

        const amount = Math.min(
            1,
            ctx.strength * ctx.pressure * 0.9
        );

        eachSample(ctx, (index, x, z, weight) => {
            ctx.data.heights[index] +=
                (target - ctx.data.heights[index]) *
                amount *
                weight;
        });
    }

    function applyTerrace(ctx) {
        const step = Math.max(
            0.001,
            numeric(state.terraceStep, 1)
        );

        const amount = Math.min(
            1,
            ctx.strength * ctx.pressure
        );

        eachSample(ctx, (index, x, z, weight) => {
            const h = ctx.data.heights[index];
            const stepped = Math.round(h / step) * step;

            ctx.data.heights[index] =
                h + (stepped - h) * amount * weight;
        });
    }

    function applyClay(ctx) {
        const source = ctx.data.heights.slice();
        const amount = signed(
            worldDeltaToHeight(
                ctx,
                0.26 * ctx.strength * ctx.pressure
            )
        );

        eachSample(ctx, (index, x, z, weight) => {
            const avg = localAverage(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height,
                1
            );

            ctx.data.heights[index] +=
                (amount + (avg - source[index]) * 0.06) *
                weight;
        });
    }

    function applyGrab(ctx) {
        const amount = signed(
            worldDeltaToHeight(
                ctx,
                0.45 * ctx.strength * ctx.pressure
            )
        );

        eachSample(ctx, (index, x, z, weight) => {
            ctx.data.heights[index] +=
                amount * Math.pow(weight, 0.8);
        });
    }

    function applyInflate(ctx, direction) {
        const amount = signed(
            worldDeltaToHeight(
                ctx,
                0.35 * ctx.strength * ctx.pressure * direction
            )
        );

        eachSample(ctx, (index, x, z, weight) => {
            ctx.data.heights[index] += amount * weight;
        });
    }

    function applyPinch(ctx) {
        const source = ctx.data.heights.slice();
        const centerIndex = Math.min(
            source.length - 1,
            Math.max(
                0,
                Math.round(
                    ctx.center.z * ctx.grid.width +
                    ctx.center.x
                )
            )
        );

        const center = source[centerIndex];
        const amount =
            ctx.strength * ctx.pressure * 0.38;

        eachSample(ctx, (index, x, z, weight) => {
            ctx.data.heights[index] +=
                (center - source[index]) *
                amount *
                weight;
        });
    }

    function applyScrape(ctx) {
        const source = ctx.data.heights.slice();

        eachSample(ctx, (index, x, z, weight) => {
            const avg = averageNeighbour(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height
            );

            const diff = source[index] - avg;
            ctx.data.heights[index] +=
                -diff *
                ctx.strength *
                ctx.pressure *
                0.28 *
                weight;
        });
    }

    function applyFill(ctx) {
        const source = ctx.data.heights.slice();

        eachSample(ctx, (index, x, z, weight) => {
            const avg = localAverage(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height,
                2
            );

            ctx.data.heights[index] +=
                (avg - source[index]) *
                ctx.strength *
                ctx.pressure *
                0.32 *
                weight;
        });
    }

    function applyRelax(ctx) {
        const source = ctx.data.heights.slice();

        eachSample(ctx, index => {
            const avg = averageNeighbour(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height
            );

            ctx.data.heights[index] +=
                (avg - source[index]) *
                ctx.strength *
                ctx.pressure *
                0.32;
        });
    }

    function applyNoise(ctx) {
        const seed = numeric(state.noiseSeed, 1337);
        const frequency = numeric(state.noiseFrequency, 0.08);
        const amplitude = numeric(state.noiseAmplitude, 1);

        eachSample(ctx, (index, x, z, weight) => {
            const n = fbm(
                x * frequency,
                z * frequency,
                seed
            );

            ctx.data.heights[index] +=
                (n * 2 - 1) *
                amplitude *
                ctx.strength *
                weight *
                0.08;
        });
    }

    function applyRidge(ctx) {
        const source = ctx.data.heights.slice();

        eachSample(ctx, index => {
            const avg = localAverage(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height,
                2
            );

            ctx.data.heights[index] +=
                Math.abs(source[index] - avg) *
                ctx.strength *
                ctx.pressure *
                0.42;
        });
    }

    function applyValley(ctx) {
        const source = ctx.data.heights.slice();

        eachSample(ctx, index => {
            const avg = localAverage(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height,
                2
            );

            const depression =
                Math.max(0, source[index] - avg);

            ctx.data.heights[index] -=
                depression *
                ctx.strength *
                ctx.pressure *
                0.5;
        });
    }

    function applyCliff(ctx) {
        const source = ctx.data.heights.slice();

        const centerIndex = Math.min(
            source.length - 1,
            Math.max(
                0,
                Math.round(
                    ctx.center.z * ctx.grid.width +
                    ctx.center.x
                )
            )
        );

        const target =
            source[centerIndex];

        eachSample(ctx, index => {
            const h = source[index];
            const stepped =
                Math.round((h - target) * 2) / 2 + target;

            ctx.data.heights[index] =
                h +
                (stepped - h) *
                ctx.strength *
                ctx.pressure *
                0.65;
        });
    }

    function applyPlateau(ctx) {
        const source = ctx.data.heights.slice();

        const centerIndex = Math.min(
            source.length - 1,
            Math.max(
                0,
                Math.round(
                    ctx.center.z * ctx.grid.width +
                    ctx.center.x
                )
            )
        );

        const target = Number.isFinite(Number(state.flattenTargetHeight))
            ? Number(state.flattenTargetHeight)
            : localAverage(
                source,
                centerIndex,
                ctx.grid.width,
                ctx.grid.height,
                3
            );

        eachSample(ctx, index => {
            const h = source[index];

            if (h <= target) return;

            ctx.data.heights[index] =
                h +
                (target - h) *
                ctx.strength *
                ctx.pressure;
        });
    }

    function applyCrater(ctx) {
        const depth =
            ctx.strength *
            ctx.pressure *
            0.07;

        eachSample(ctx, (index, x, z, weight, d) => {
            const bowl =
                Math.pow(Math.max(0, 1 - d), 1.5);

            const rim =
                Math.exp(
                    -Math.pow((d - 0.62) * 7, 2)
                );

            ctx.data.heights[index] +=
                (
                    rim * depth * 0.55 -
                    bowl * depth
                ) * weight;
        });
    }

    function applyDune(ctx) {
        const sx = Math.max(
            1,
            ctx.radius / ctx.dimensions.width *
            (ctx.grid.width - 1)
        );

        const sz = Math.max(
            1,
            ctx.radius / ctx.dimensions.length *
            (ctx.grid.height - 1)
        );

        eachSample(ctx, (index, x, z, weight) => {
            const nx = (x - ctx.center.x) / sx;
            const nz = (z - ctx.center.z) / sz;

            const wave = Math.sin(
                (nx * 3.5 + nz * 1.7) * Math.PI
            );

            ctx.data.heights[index] +=
                wave *
                ctx.strength *
                ctx.pressure *
                0.025 *
                weight;
        });
    }

    function applyErosion(ctx, thermal) {
        const iterations = thermal
            ? 2
            : Math.max(
                1,
                Math.min(
                    8,
                    Math.round(
                        numeric(
                            state.erosionIterations,
                            2
                        )
                    )
                )
            );

        for (let iteration = 0; iteration < iterations; iteration++) {
            const source = ctx.data.heights.slice();

            eachSample(ctx, index => {
                const avg = averageNeighbour(
                    source,
                    index,
                    ctx.grid.width,
                    ctx.grid.height
                );

                const diff =
                    source[index] - avg;

                if (thermal) {
                    const talus =
                        numeric(
                            state.talusAngle,
                            0.08
                        );

                    if (diff > talus) {
                        ctx.data.heights[index] -=
                            diff *
                            0.18 *
                            ctx.strength *
                            ctx.pressure;
                    }
                } else {
                    ctx.data.heights[index] -=
                        Math.max(0, diff) *
                        ctx.strength *
                        ctx.pressure *
                        0.16;
                }
            });
        }
    }

    function applyHydraulic(ctx) {
        const source = ctx.data.heights.slice();
        const width = ctx.grid.width;
        const height = ctx.grid.height;

        const iterations = Math.max(
            2,
            Math.min(
                10,
                Math.round(
                    numeric(
                        state.erosionIterations,
                        4
                    )
                )
            )
        );

        eachSample(ctx, (startIndex, startX, startZ, brushWeight) => {
            let x = startX;
            let z = startZ;
            let water = numeric(state.erosionRain, 0.35);
            let sediment = 0;

            for (let i = 0; i < iterations; i++) {
                const index = z * width + x;
                const current = ctx.data.heights[index];

                let lowIndex = index;
                let lowX = x;
                let lowZ = z;
                let lowHeight = source[index];

                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dz) continue;

                        const nx = x + dx;
                        const nz = z + dz;

                        if (
                            nx < 0 || nx >= width ||
                            nz < 0 || nz >= height
                        ) continue;

                        const ni = nz * width + nx;

                        if (source[ni] < lowHeight) {
                            lowHeight = source[ni];
                            lowIndex = ni;
                            lowX = nx;
                            lowZ = nz;
                        }
                    }
                }

                const downhill = current - lowHeight;

                if (downhill > 0) {
                    const capacity =
                        Math.max(
                            0.001,
                            downhill *
                            water *
                            numeric(
                                state.sedimentCapacity,
                                1.2
                            )
                        );

                    const amount =
                        Math.min(
                            downhill * 0.35,
                            capacity
                        ) *
                        ctx.strength *
                        brushWeight;

                    ctx.data.heights[index] -= amount;
                    sediment += amount;
                } else if (sediment > 0) {
                    const deposit =
                        sediment *
                        numeric(
                            state.erosionDeposition,
                            0.35
                        );

                    ctx.data.heights[index] += deposit;
                    sediment -= deposit;
                }

                x = lowX;
                z = lowZ;

                water *= Math.max(
                    0.2,
                    1 -
                    numeric(
                        state.erosionEvaporation,
                        0.08
                    )
                );
            }
        });
    }

    function applySharpen(ctx) {
        const source = ctx.data.heights.slice();

        eachSample(ctx, index => {
            const avg = averageNeighbour(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height
            );

            ctx.data.heights[index] +=
                (source[index] - avg) *
                ctx.strength *
                ctx.pressure *
                0.6;
        });
    }

    function applyBlur(ctx) {
        const source = ctx.data.heights.slice();

        eachSample(ctx, index => {
            const avg = localAverage(
                source,
                index,
                ctx.grid.width,
                ctx.grid.height,
                2
            );

            ctx.data.heights[index] +=
                (avg - source[index]) *
                ctx.strength *
                ctx.pressure *
                0.65;
        });
    }

    function applyMaterialPaint(ctx) {
        // The dedicated terrain painter consumes world-space positions. Keep
        // this bridge in the central applyTool path because TerrainInteraction
        // calls applyTool directly (not the legacy per-brush wrappers).
        if (typeof NS.materialPainting?.paintAtWorldPoint === 'function') {
            const worldPoint = ctx.terrain.localToWorld(ctx.local.clone());

            return NS.materialPainting.paintAtWorldPoint(worldPoint, {
                terrain: ctx.terrain,
                radius: ctx.radius,
                strength: ctx.strength * ctx.pressure,
                erase: !!state.isShiftPressed ||
                    state.materialPaintOperation === 'erase'
            });
        }

        // Compatibility hook for older/custom material painters.
        const painter =
            NS.materialPainter ||
            NS.paintMaterial;

        if (typeof painter === 'function') {
            return painter(
                ctx.terrain,
                ctx.local,
                ctx.radius,
                ctx.strength * ctx.pressure,
                state.isShiftPressed
            );
        }

        return false;
    }

    function applyTool(context) {
        const ctx = createContext(context);
        if (!ctx) return false;

        const tool = context.tool || state.selectedTool;

        // Use the shared C++ heightfield backend for terrain operations when
        // the generated WASM module is available. The bridge copies only the
        // dirty rectangle back, then this existing sync path updates the
        // component meshes, collision surface, and terrain event stream.
        if (
            tool !== TOOLS.MATERIAL_PAINT &&
            typeof window.SculptWASM?.applyTerrainTool === 'function'
        ) {
            const nativeResult = window.SculptWASM.applyTerrainTool({
                data: ctx.data,
                grid: ctx.grid,
                dimensions: ctx.dimensions,
                center: ctx.center,
                radius: ctx.radius,
                strength: ctx.strength,
                pressure: ctx.pressure,
                falloff: state.brushFalloff,
                heightScale: ctx.heightScale,
                sign: state.isShiftPressed ? -1 : 1,
                target: state.flattenTargetHeight,
                terraceStep: state.terraceStep,
                noiseAmplitude: state.noiseAmplitude,
                noiseFrequency: state.noiseFrequency,
                noiseOctaves: state.noiseOctaves,
                erosionIterations: state.erosionIterations,
                talusAngle: state.talusAngle,
                sedimentCapacity: state.sedimentCapacity,
                erosionEvaporation: state.erosionEvaporation,
                seed: state.noiseSeed
            });

            if (nativeResult) {
                ctx.dirtyMinX = nativeResult.minX;
                ctx.dirtyMaxX = nativeResult.maxX;
                ctx.dirtyMinZ = nativeResult.minZ;
                ctx.dirtyMaxZ = nativeResult.maxZ;
                sync(ctx, 'sculpt');
                return true;
            }
        }

        switch (tool) {
            case TOOLS.RAISE_LOWER: applyRaiseLower(ctx); break;
            case TOOLS.SMOOTH: applySmooth(ctx); break;
            case TOOLS.FLATTEN:
            case TOOLS.LEVEL: applyFlatten(ctx); break;
            case TOOLS.TERRACE: applyTerrace(ctx); break;
            case TOOLS.CLAY: applyClay(ctx); break;
            case TOOLS.PINCH: applyPinch(ctx); break;
            case TOOLS.SCRAPE: applyScrape(ctx); break;
            case TOOLS.GRAB: applyGrab(ctx); break;
            case TOOLS.INFLATE: applyInflate(ctx, 1); break;
            case TOOLS.DEFLATE: applyInflate(ctx, -1); break;
            case TOOLS.CREASE:
            case TOOLS.RIDGE: applyRidge(ctx); break;
            case TOOLS.FILL: applyFill(ctx); break;
            case TOOLS.RELAX: applyRelax(ctx); break;
            case TOOLS.VALLEY:
            case TOOLS.CANYON: applyValley(ctx); break;
            case TOOLS.CLIFF: applyCliff(ctx); break;
            case TOOLS.PLATEAU: applyPlateau(ctx); break;
            case TOOLS.CRATER: applyCrater(ctx); break;
            case TOOLS.DUNE: applyDune(ctx); break;
            case TOOLS.NOISE:
            case TOOLS.PERLIN: applyNoise(ctx); break;
            case TOOLS.EROSION: applyErosion(ctx, false); break;
            case TOOLS.THERMAL_EROSION: applyErosion(ctx, true); break;
            case TOOLS.HYDRAULIC_EROSION: applyHydraulic(ctx); break;
            case TOOLS.DEPOSITION: applyFill(ctx); break;
            case TOOLS.SHARPEN: applySharpen(ctx); break;
            case TOOLS.BLUR: applyBlur(ctx); break;
            case TOOLS.MATERIAL_PAINT:
                return applyMaterialPaint(ctx);
            default:
                return false;
        }

        sync(ctx, 'sculpt');
        return true;
    }

    function endStroke() {
        state.strokeLastPoint = null;
    }

    // Preserve the old public brush methods.
    // All wrappers accept the historical (point, normal) signature.
    const brushes = {
        applyTool,

        endStroke,

        applyRaiseLowerBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.RAISE_LOWER
            }),

        applySmoothBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.SMOOTH
            }),

        applyFlattenBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.FLATTEN
            }),

        applyTerraceBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.TERRACE
            }),

        applyPinchBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.PINCH
            }),

        applyClayBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.CLAY
            }),

        applyScrapeBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.SCRAPE
            }),

        applyNoiseBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.NOISE
            }),

        applyPerlinBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.PERLIN
            }),

        applyErosionBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.EROSION
            }),

        applyThermalErosionBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.THERMAL_EROSION
            }),

        applyMaterialPaintBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.MATERIAL_PAINT
            }),

        applyGrabBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.GRAB
            }),

        applyInflateBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.INFLATE
            }),

        applyDeflateBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.DEFLATE
            }),

        applyRidgeBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.RIDGE
            }),

        applyValleyBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.VALLEY
            }),

        applyCliffBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.CLIFF
            }),

        applyPlateauBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.PLATEAU
            }),

        applyCraterBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.CRATER
            }),

        applyCanyonBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.CANYON
            }),

        applyDuneBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.DUNE
            }),

        applyFillBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.FILL
            }),

        applyRelaxBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.RELAX
            }),

        applySharpenBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.SHARPEN
            }),

        applyBlurBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.BLUR
            }),

        applyHydraulicErosionBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.HYDRAULIC_EROSION
            }),

        applyDepositionBrush: (point, normal) =>
            applyTool({
                terrain: getTerrain(),
                point,
                normal,
                tool: TOOLS.DEPOSITION
            })
    };

    NS.brushes = Object.assign(NS.brushes || {}, brushes);
})();
