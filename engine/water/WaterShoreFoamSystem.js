(function () {
    'use strict';

    class SMWaterShoreFoamSystem {
        constructor(scene, options = {}) {
            if (!scene) throw new Error('SMWaterShoreFoamSystem requires a THREE.Scene');
            if (!window.SMWaterShorelineSampler) {
                throw new Error('Load WaterShorelineSampler.js before WaterShoreFoamSystem.js');
            }
            if (!window.SMWaterShoreFoamMaterialFactory) {
                throw new Error('Load WaterShoreFoamMaterial.js before WaterShoreFoamSystem.js');
            }

            this.scene = scene;
            this.terrainAdapter = options.terrainAdapter || null;
            this.interactionFX = options.interactionFX || null;
            this.sampler = new SMWaterShorelineSampler(this.terrainAdapter);
            this.entries = new Map();
            this.time = 0;
            this._fleckAccumulator = 0;
        }

        setTerrainAdapter(adapter) {
            this.terrainAdapter = adapter || null;
            this.sampler.setTerrainAdapter(this.terrainAdapter);
        }

        setInteractionFX(fx) {
            this.interactionFX = fx || null;
        }

        _disposeEntry(entry) {
            if (!entry) return;
            entry.group?.parent?.remove?.(entry.group);
            entry.baseMesh?.geometry?.dispose?.();
            entry.crownMesh?.geometry?.dispose?.();
            SMWaterShoreFoamMaterialFactory.dispose(entry.baseMaterial);
            SMWaterShoreFoamMaterialFactory.dispose(entry.crownMaterial);
        }

        remove(bodyOrId) {
            const id = typeof bodyOrId === 'string' ? bodyOrId : bodyOrId?.id;
            if (!id) return false;
            const entry = this.entries.get(id);
            if (!entry) return false;
            this._disposeEntry(entry);
            this.entries.delete(id);
            return true;
        }

        _makeRibbonGeometry(samples, config, crown = false) {
            if (!samples || samples.length < 2) return null;

            const width = Math.max(
                0.08,
                Number(config.riverbankFoamWidth ?? 0.62)
            );
            const thickness = Math.max(
                0.0,
                Number(config.riverbankFoamThickness ?? 0.045)
            );
            const crownWidth = THREE.MathUtils.clamp(
                Number(config.riverbankFoamCrownWidth ?? 0.48),
                0.18,
                0.90
            );
            const actualWidth = crown ? width * crownWidth : width;
            const yLift = crown ? thickness : Math.max(0.006, thickness * 0.10);

            const rows = crown ? 3 : 4;
            const positions = [];
            const uvs = [];
            const intensities = [];
            const crowns = [];
            const indices = [];

            for (let i = 0; i < samples.length; i++) {
                const s = samples[i];
                const along = s.distance / Math.max(0.15, actualWidth * 1.75);

                for (let r = 0; r < rows; r++) {
                    const across = r / Math.max(1, rows - 1);
                    const curvedAcross = across * across * (3 - 2 * across);

                    const p = s.position
                        .clone()
                        .addScaledVector(
                            s.inward,
                            actualWidth * curvedAcross
                        );

                    // The cross section is slightly arched instead of a flat decal.
                    const arch = Math.sin(across * Math.PI);
                    p.y += yLift + arch * (crown ? thickness * 0.45 : thickness * 0.22);

                    positions.push(p.x, p.y, p.z);
                    uvs.push(across, along);
                    intensities.push(
                        THREE.MathUtils.clamp(
                            s.intensity * (crown ? 0.86 : 1.0),
                            0,
                            1.35
                        )
                    );
                    crowns.push(crown ? 1 : arch * 0.35);
                }
            }

            for (let i = 0; i < samples.length - 1; i++) {
                for (let r = 0; r < rows - 1; r++) {
                    const a = i * rows + r;
                    const b = a + 1;
                    const c = a + rows;
                    const d = c + 1;
                    indices.push(a, c, b, b, c, d);
                }
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
            geometry.setAttribute(
                'uv',
                new THREE.Float32BufferAttribute(uvs, 2)
            );
            geometry.setAttribute(
                'aFoamIntensity',
                new THREE.Float32BufferAttribute(intensities, 1)
            );
            geometry.setAttribute(
                'aCrown',
                new THREE.Float32BufferAttribute(crowns, 1)
            );
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            return geometry;
        }

        _buildCombinedGeometry(sampleData, config, crown = false) {
            const pieces = [];
            for (const bank of [sampleData.left, sampleData.right]) {
                const geometry = this._makeRibbonGeometry(bank, config, crown);
                if (geometry) pieces.push(geometry);
            }
            if (!pieces.length) return null;
            if (pieces.length === 1) return pieces[0];

            // Merge two bank ribbons without requiring BufferGeometryUtils.
            const attributes = ['position', 'uv', 'aFoamIntensity', 'aCrown'];
            const arrays = {};
            const itemSizes = {};
            let totalVertices = 0;
            let totalIndices = 0;

            for (const name of attributes) {
                itemSizes[name] = pieces[0].attributes[name].itemSize;
                arrays[name] = [];
            }

            for (const g of pieces) {
                const baseVertex = totalVertices;
                const count = g.attributes.position.count;
                totalVertices += count;

                for (const name of attributes) {
                    arrays[name].push(...g.attributes[name].array);
                }

                const idx = g.index?.array || [];
                totalIndices += idx.length;
                if (!arrays.index) arrays.index = [];
                for (let i = 0; i < idx.length; i++) {
                    arrays.index.push(idx[i] + baseVertex);
                }
            }

            const merged = new THREE.BufferGeometry();
            for (const name of attributes) {
                merged.setAttribute(
                    name,
                    new THREE.Float32BufferAttribute(
                        arrays[name],
                        itemSizes[name]
                    )
                );
            }
            merged.setIndex(arrays.index);
            merged.computeVertexNormals();
            merged.computeBoundingBox();
            merged.computeBoundingSphere();

            for (const g of pieces) g.dispose();
            return merged;
        }

        build(body) {
            if (!body?.id) return null;
            this.remove(body.id);

            if (
                body.type !== 'river' ||
                body.config?.riverbankFoamEnabled === false ||
                body.points?.length < 2
            ) {
                return null;
            }

            const sampleData = this.sampler.sample(body);
            if (!sampleData.left.length && !sampleData.right.length) return null;

            const group = new THREE.Group();
            group.name = `SMWaterShoreFoam_${body.id}`;
            group.userData.isWater = true;
            group.userData.isWaterFX = true;
            group.userData.isSystemObject = true;
            group.userData.waterBodyId = body.id;
            group.renderOrder = Number(body.config?.renderOrder || 50) + 4;

            const baseGeometry = this._buildCombinedGeometry(
                sampleData,
                body.config,
                false
            );
            const crownGeometry = this._buildCombinedGeometry(
                sampleData,
                body.config,
                true
            );

            const baseMaterial = SMWaterShoreFoamMaterialFactory.create({
                ...body.config,
                riverbankFoamOpacity:
                    Number(body.config?.riverbankFoamOpacity ?? 0.90)
            });
            const crownMaterial = SMWaterShoreFoamMaterialFactory.create({
                ...body.config,
                riverbankFoamOpacity:
                    Number(body.config?.riverbankFoamOpacity ?? 0.90) * 0.72,
                riverbankFoamBreakup:
                    Math.min(
                        0.88,
                        Number(body.config?.riverbankFoamBreakup ?? 0.58) + 0.06
                    )
            });

            const baseMesh = baseGeometry
                ? new THREE.Mesh(baseGeometry, baseMaterial)
                : null;
            const crownMesh = crownGeometry
                ? new THREE.Mesh(crownGeometry, crownMaterial)
                : null;

            if (baseMesh) {
                baseMesh.name = `SMWaterShoreFoamBase_${body.id}`;
                baseMesh.frustumCulled = true;
                baseMesh.renderOrder = group.renderOrder;
                baseMesh.userData.isWater = true;
                baseMesh.userData.isWaterFoam = true;
                baseMesh.userData.waterBodyId = body.id;
                group.add(baseMesh);
            }

            if (crownMesh) {
                crownMesh.name = `SMWaterShoreFoamCrown_${body.id}`;
                crownMesh.frustumCulled = true;
                crownMesh.renderOrder = group.renderOrder + 1;
                crownMesh.userData.isWater = true;
                crownMesh.userData.isWaterFoam = true;
                crownMesh.userData.waterBodyId = body.id;
                group.add(crownMesh);
            }

            body.group?.add?.(group);

            const entry = {
                body,
                group,
                baseMesh,
                crownMesh,
                baseMaterial,
                crownMaterial,
                sampleData,
                nextFleckAt: 0
            };

            this.entries.set(body.id, entry);
            return entry;
        }

        rebuild(body) {
            return this.build(body);
        }

        rebuildAll(bodies) {
            const live = new Set();
            for (const body of bodies || []) {
                live.add(body.id);
                this.build(body);
            }
            for (const id of Array.from(this.entries.keys())) {
                if (!live.has(id)) this.remove(id);
            }
        }

        applyConfig(body, patch = {}) {
            const entry = this.entries.get(body?.id);
            if (!entry) return this.build(body);

            const geometryKeys = new Set([
                'width',
                'levelOffset',
                'riverbankFoamWidth',
                'riverbankFoamThickness',
                'riverbankFoamCrownWidth',
                'riverbankFoamSpacing',
                'riverbankFoamContactInset',
                'riverbankFoamDepth',
                'riverbankFoamIntensity',
                'currentStrength',
                'currentBankDrag',
                'flowReverse',
                'shoreWidth',
                'shoreDepth',
                'bedDepth'
            ]);

            if (
                patch.riverbankFoamEnabled === false ||
                Object.keys(patch).some(key => geometryKeys.has(key))
            ) {
                return this.build(body);
            }

            SMWaterShoreFoamMaterialFactory.apply(entry.baseMaterial, patch);
            SMWaterShoreFoamMaterialFactory.apply(entry.crownMaterial, patch);
            return entry;
        }

        _emitFlecks(entry, delta) {
            const body = entry.body;
            const config = body.config || {};
            if (
                config.riverbankFoamFlecks === false ||
                !this.interactionFX?.emitFoamFlecks
            ) {
                return;
            }

            const rate = Math.max(
                0,
                Number(config.riverbankFoamFleckRate ?? 4)
            );
            if (rate <= 0) return;

            entry.nextFleckAt -= delta;
            if (entry.nextFleckAt > 0) return;
            entry.nextFleckAt = 1 / Math.max(rate, 0.1);

            const banks = [entry.sampleData.left, entry.sampleData.right];
            const candidates = [];

            for (const bank of banks) {
                if (!bank?.length) continue;
                for (let tries = 0; tries < 3; tries++) {
                    const sample = bank[
                        Math.floor(Math.random() * bank.length)
                    ];
                    if (sample?.intensity > 0.34) {
                        candidates.push(sample);
                        break;
                    }
                }
            }

            for (const sample of candidates) {
                const pos = sample.position
                    .clone()
                    .addScaledVector(
                        sample.inward,
                        Math.random() *
                        Math.max(
                            0.08,
                            Number(config.riverbankFoamWidth ?? 0.62) * 0.75
                        )
                    );
                pos.y += 0.018;

                this.interactionFX.emitFoamFlecks(pos, {
                    strength: THREE.MathUtils.clamp(sample.intensity, 0.15, 1),
                    radius: Math.max(
                        0.08,
                        Number(config.riverbankFoamWidth ?? 0.62) * 0.16
                    ),
                    flowDirection: sample.tangent,
                    surfaceY: sample.surfaceY,
                    life: Number(config.riverbankFoamFleckLife ?? 1.8)
                });
            }
        }

        update(delta = 0, time = 0) {
            this.time = Number(time) || 0;
            const dt = Math.max(0, Number(delta) || 0);

            for (const entry of this.entries.values()) {
                if (!entry.body?.group?.parent) continue;
                entry.group.visible =
                    entry.body.config?.riverbankFoamEnabled !== false &&
                    entry.body.group.visible !== false;

                SMWaterShoreFoamMaterialFactory.update(
                    entry.baseMaterial,
                    this.time
                );
                SMWaterShoreFoamMaterialFactory.update(
                    entry.crownMaterial,
                    this.time
                );
                this._emitFlecks(entry, dt);
            }
        }

        dispose() {
            for (const entry of this.entries.values()) {
                this._disposeEntry(entry);
            }
            this.entries.clear();
        }
    }

    window.SMWaterShoreFoamSystem = SMWaterShoreFoamSystem;
})();