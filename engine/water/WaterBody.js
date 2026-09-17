(function () {
    function normalizeWaterType(type) {
        return window.SMWaterWaveSpectrum?.normalizeType?.(type) ||
            (['river', 'lake', 'ocean', 'pool'].includes(String(type || '').toLowerCase())
                ? String(type).toLowerCase()
                : 'river');
    }

    function isAreaWaterType(type) {
        return type === 'lake' || type === 'pool';
    }

    class SMWaterBody {
        constructor(scene, config = {}) {
            if (!scene) throw new Error('SMWaterBody requires a THREE.Scene');
            if (!window.SMWaterMaterialFactory) throw new Error('Load WaterMaterial.js before WaterBody.js');
            this.scene = scene;
            this.id = config.id || `sm_water_${Math.random().toString(36).slice(2, 9)}`;
            this.type = normalizeWaterType(config.type || 'river');
            this.points = (config.points || []).map(p => p.clone ? p.clone() : new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0));
            this.config = {
                width: 4,
                levelOffset: 0.08,
                oceanSize: 800,
                quality: 1,
                renderOrder: 50,
                volumeDepth: 4,
                bedDepth: 3,
                shoreWidth: 1.5,
                shoreDepth: 0.08,
                flowReverse: false,
                currentStrength: 1.5,
                currentBankDrag: 0.55,
                windDirection: { x: 1, y: 0 },
                windSpeed: 1.0,
                waveScale: 1.0,
                waveSteepness: 0.42,
                waveChoppiness: 0.48,
                waveSpread: 0.72,
                smallWaveStrength: 0.34,
                normalStrength: 0.28,
                detailDistance: 420,
                waterDebugMode: 0,

                // PHYSICAL RIVERBANK FOAM
                riverbankFoamEnabled: true,
                riverbankFoamWidth: 0.62,
                riverbankFoamThickness: 0.045,
                riverbankFoamCrownWidth: 0.48,
                riverbankFoamIntensity: 0.58,
                riverbankFoamDepth: 0.42,
                riverbankFoamFlow: 1.0,
                riverbankFoamNoiseScale: 1.25,
                riverbankFoamBreakup: 0.58,
                riverbankFoamEdgeSoftness: 0.18,
                riverbankFoamTextureScale: 1.0,
                riverbankFoamSpacing: 0.42,
                riverbankFoamContactInset: 0.06,
                riverbankFoamFlecks: true,
                riverbankFoamFleckRate: 4,
                riverbankFoamFleckLife: 1.8,

                ...config
            };

            // The surface shader keeps a subtle shoreline base, while the
            // dedicated shoreline system renders the main riverbank foam.
            this.config.externalShoreFoam =
                this.type === 'river' &&
                this.config.riverbankFoamEnabled !== false
                    ? 1
                    : 0;
            // Older saved water bodies used a nearly invisible volume alpha
            // (0.025). Keep those scenes upgrade-safe while preserving any
            // deliberate higher value chosen by the user.
            this.config.waterVolumeOpacity = Math.max(
                0.08,
                Number(this.config.waterVolumeOpacity) || 0.12
            );
            delete this.config.points;
            this.time = 0;
            this._oceanAnchorWorld = null;
            this.material = SMWaterMaterialFactory.create(this.config);
            this.mesh = null;
            this.volume = null;
            this.group = new THREE.Group();
            this.group.name = `SMWaterBody_${this.type}_${this.id}`;
            this.group.userData.isWater = true;
            this.group.userData.isSystemObject = true;
            this.group.userData.waterBodyId = this.id;
            this.group.userData.visibleInWorkspace = true;
            this.scene.add(this.group);
            this.rebuild();
        }

        _getQuality() {
            return THREE.MathUtils.clamp(
                Number(this.config.quality) || 1,
                0.35,
                3.0
            );
        }

        _getCenter() {
            if (this.points.length) {
                const c = new THREE.Vector3();
                for (const p of this.points) c.add(p);
                return c.multiplyScalar(1 / this.points.length);
            }
            if (window.controls?.target) return window.controls.target.clone();
            return new THREE.Vector3();
        }

        _pointInPolygonXZ(x, z) {
            const pts = this.points;
            if (pts.length < 3) return false;
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
                const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
                if (hit) inside = !inside;
            }
            return inside;
        }

        _distanceToSegmentXZ(px, pz, a, b) {
            const abx = b.x - a.x, abz = b.z - a.z;
            const apx = px - a.x, apz = pz - a.z;
            const len2 = abx * abx + abz * abz;
            const t = len2 > 1e-8 ? THREE.MathUtils.clamp((apx * abx + apz * abz) / len2, 0, 1) : 0;
            return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
        }

        _distanceToPolygonEdgeXZ(x, z) {
            if (this.points.length < 2) return Infinity;
            let min = Infinity;
            for (let i = 0; i < this.points.length; i++) {
                min = Math.min(min, this._distanceToSegmentXZ(x, z, this.points[i], this.points[(i + 1) % this.points.length]));
            }
            return min;
        }

        createRiverGeometry() {
            if (this.points.length < 2) return null;
            const curve = new THREE.CatmullRomCurve3(this.points, false, 'catmullrom', 0.35);
            const length = Math.max(curve.getLength(), 0.001);
            const q = this._getQuality();
            const width = Math.max(0.25, Number(this.config.width || 4));
            // Dense enough for vertex-displaced waves while keeping a hard cap.
            // The old surface was visibly faceted on wide rivers.
            const longitudinal = Math.max(
                48,
                Math.min(
                    1200,
                    Math.ceil(length * 4.25 * q)
                )
            );
            const lateral = Math.max(
                16,
                Math.min(
                    96,
                    Math.ceil(width * 4.0 * q)
                )
            );
            const vertices = [];
            const uvs = [];
            const flowDirections = [];
            const indices = [];
            const reverse = !!this.config.flowReverse;
            for (let i = 0; i <= longitudinal; i++) {
                const t = i / longitudinal;
                const p = curve.getPointAt(t);
                const tangent = curve.getTangentAt(t).normalize();
                const flowTangent = tangent.clone();
                if (reverse) flowTangent.multiplyScalar(-1);
                const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
                if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
                side.normalize();
                for (let j = 0; j <= lateral; j++) {
                    const across = j / lateral;
                    const offset = (across - 0.5) * width;
                    const v = p.clone().addScaledVector(side, offset);
                    v.y += Number(this.config.levelOffset || 0);
                    vertices.push(v.x, v.y, v.z);
                    uvs.push(across, t * Math.max(length / width, 1));
                    flowDirections.push(flowTangent.x, flowTangent.z);
                }
            }
            const row = lateral + 1;
            for (let i = 0; i < longitudinal; i++) {
                for (let j = 0; j < lateral; j++) {
                    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
                    indices.push(a, c, b, b, c, d);
                }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            g.setAttribute('smWaterFlow', new THREE.Float32BufferAttribute(flowDirections, 2));
            g.setIndex(indices);
            g.computeVertexNormals();
            this._attachDepthAttribute(g);
            g.computeBoundingBox();
            g.computeBoundingSphere();
            return g;
        }

        createLakeGeometry() {
            if (this.points.length < 3) return null;

            // ------------------------------------------------------------
            // POLYGON-CONFORMING LAKE SURFACE
            // ------------------------------------------------------------
            // The previous implementation generated a rectangular grid and
            // kept a cell only when its CENTER was inside the shoreline.
            // That inevitably created the visible staircase / blocky border.
            //
            // This version triangulates the actual shoreline polygon first,
            // then recursively subdivides the triangles. The outer border
            // therefore follows the user's points exactly while the interior
            // still has enough vertices for smooth GPU wave displacement.

            const cleanPoints = [];

            for (const source of this.points) {
                if (!source) continue;

                const point =
                    source.clone
                        ? source.clone()
                        : new THREE.Vector3(
                            Number(source.x) || 0,
                            Number(source.y) || 0,
                            Number(source.z) || 0
                        );

                const previous =
                    cleanPoints[
                        cleanPoints.length - 1
                    ];

                if (
                    previous &&
                    previous.distanceToSquared(point) <
                    1e-8
                ) {
                    continue;
                }

                cleanPoints.push(point);
            }

            if (
                cleanPoints.length > 2 &&
                cleanPoints[0].distanceToSquared(
                    cleanPoints[
                        cleanPoints.length - 1
                    ]
                ) < 1e-8
            ) {
                cleanPoints.pop();
            }

            if (cleanPoints.length < 3) {
                return null;
            }

            let minX = Infinity;
            let maxX = -Infinity;
            let minZ = Infinity;
            let maxZ = -Infinity;

            for (const p of cleanPoints) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minZ = Math.min(minZ, p.z);
                maxZ = Math.max(maxZ, p.z);
            }

            const sizeX =
                Math.max(
                    maxX - minX,
                    0.1
                );

            const sizeZ =
                Math.max(
                    maxZ - minZ,
                    0.1
                );

            const maxSize =
                Math.max(
                    sizeX,
                    sizeZ
                );

            const avgY =
                cleanPoints.reduce(
                    (sum, p) =>
                        sum + p.y,
                    0
                ) /
                cleanPoints.length +
                Number(
                    this.config.levelOffset ||
                    0
                );

            const contour =
                cleanPoints.map(
                    p =>
                        new THREE.Vector2(
                            p.x,
                            p.z
                        )
                );

            let faces = [];

            try {
                faces =
                    THREE.ShapeUtils
                        .triangulateShape(
                            contour,
                            []
                        );
            } catch (error) {
                console.warn(
                    '[SMWaterBody] Lake triangulation failed:',
                    error
                );
                return null;
            }

            if (!faces.length) {
                return null;
            }

            const q =
                this._getQuality();

            // Recursive 4-way subdivision. At quality 1 this normally produces
            // ~0.5-1.0 m triangles for editor-sized lakes, enough for a smooth
            // wave silhouette without creating an uncontrolled vertex count.
            const subdivisionLevel =
                THREE.MathUtils.clamp(
                    Math.ceil(
                        Math.log2(
                            Math.max(
                                1,
                                maxSize *
                                q /
                                2.25
                            )
                        )
                    ),
                    2,
                    5
                );

            const triangles = [];

            const subdivideTriangle =
                (
                    a,
                    b,
                    c,
                    level
                ) => {
                    if (level <= 0) {
                        triangles.push([
                            a,
                            b,
                            c
                        ]);
                        return;
                    }

                    const ab =
                        a.clone()
                            .add(b)
                            .multiplyScalar(0.5);

                    const bc =
                        b.clone()
                            .add(c)
                            .multiplyScalar(0.5);

                    const ca =
                        c.clone()
                            .add(a)
                            .multiplyScalar(0.5);

                    const next =
                        level - 1;

                    subdivideTriangle(
                        a,
                        ab,
                        ca,
                        next
                    );

                    subdivideTriangle(
                        ab,
                        b,
                        bc,
                        next
                    );

                    subdivideTriangle(
                        ca,
                        bc,
                        c,
                        next
                    );

                    subdivideTriangle(
                        ab,
                        bc,
                        ca,
                        next
                    );
                };

            for (const face of faces) {
                const a2 =
                    contour[face[0]];

                const b2 =
                    contour[face[1]];

                const c2 =
                    contour[face[2]];

                if (
                    !a2 ||
                    !b2 ||
                    !c2
                ) {
                    continue;
                }

                subdivideTriangle(
                    new THREE.Vector3(
                        a2.x,
                        avgY,
                        a2.y
                    ),
                    new THREE.Vector3(
                        b2.x,
                        avgY,
                        b2.y
                    ),
                    new THREE.Vector3(
                        c2.x,
                        avgY,
                        c2.y
                    ),
                    subdivisionLevel
                );
            }

            if (!triangles.length) {
                return null;
            }

            const vertices = [];
            const uvs = [];
            const flowDirections = [];

            const invX =
                1 /
                Math.max(
                    sizeX,
                    1e-6
                );

            const invZ =
                1 /
                Math.max(
                    sizeZ,
                    1e-6
                );

            for (const triangle of triangles) {
                for (const p of triangle) {
                    vertices.push(
                        p.x,
                        p.y,
                        p.z
                    );

                    uvs.push(
                        (p.x - minX) * invX,
                        (p.z - minZ) * invZ
                    );

                    // Lakes do not have a spline current. The shader will use
                    // its configured broad flow direction as a fallback.
                    flowDirections.push(
                        0,
                        0
                    );
                }
            }

            const geometry =
                new THREE.BufferGeometry();

            geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(
                    vertices,
                    3
                )
            );

            geometry.setAttribute(
                'uv',
                new THREE.Float32BufferAttribute(
                    uvs,
                    2
                )
            );

            geometry.setAttribute(
                'smWaterFlow',
                new THREE.Float32BufferAttribute(
                    flowDirections,
                    2
                )
            );

            geometry.computeVertexNormals();

            this._attachDepthAttribute(
                geometry
            );

            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();

            geometry.userData.smWaterGeometry =
                'lake-polygon-smooth-v2';

            geometry.userData.subdivisionLevel =
                subdivisionLevel;

            return geometry;
        }

        createOceanGeometry() {
            const size = Math.max(10, Number(this.config.oceanSize || 800));
            const q = this._getQuality();
            const seg = Math.max(
                96,
                Math.min(
                    320,
                    Math.round(
                        160 * q
                    )
                )
            );
            const g = new THREE.PlaneGeometry(size, size, seg, seg);
            g.rotateX(-Math.PI / 2);
            const center = this._getCenter();
            g.translate(center.x, center.y + Number(this.config.levelOffset || 0), center.z);
            g.userData.smOceanGeometryCenter = center.clone();
            g.userData.smOceanGridSize = size;
            g.setAttribute('smWaterFlow', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
            g.computeVertexNormals();
            this._attachDepthAttribute(g);
            g.computeBoundingBox();
            g.computeBoundingSphere();
            return g;
        }

        _createGeometry() {
            if (this.type === 'river') return this.createRiverGeometry();
            if (isAreaWaterType(this.type)) {
                // Area waters need an authored boundary. Falling back to an
                // ocean plane for a pool/lake made an invalid sketch look as
                // if it succeeded and also broke containment/depth queries.
                return this.points.length >= 3
                    ? this.createLakeGeometry()
                    : null;
            }
            return this.createOceanGeometry();
        }

        _smooth01(t) {
            t = THREE.MathUtils.clamp(t, 0, 1);
            return t * t * (3 - 2 * t);
        }

        _depthAtWorldXZ(x, z, uv = null) {
            const bedDepth = Math.max(0.02, Number(this.config.bedDepth ?? this.config.volumeDepth ?? 3));
            const shoreDepth = THREE.MathUtils.clamp(Number(this.config.shoreDepth ?? 0.08), 0.01, bedDepth);
            const shoreWidth = Math.max(0.05, Number(this.config.shoreWidth ?? 1.5));
            if (this.type === 'ocean') return Math.max(bedDepth, Number(this.config.volumeDepth || bedDepth));
            if (this.type === 'river') {
                const width = Math.max(0.25, Number(this.config.width || 4));
                let centerFactor;
                if (uv) centerFactor = 1 - Math.abs(uv.x * 2 - 1);
                else {
                    let d = Infinity;
                    for (let i = 0; i < this.points.length - 1; i++) d = Math.min(d, this._distanceToSegmentXZ(x, z, this.points[i], this.points[i + 1]));
                    centerFactor = 1 - THREE.MathUtils.clamp(d / Math.max(width * 0.5, 0.001), 0, 1);
                }
                const f = this._smooth01(centerFactor);
                return THREE.MathUtils.lerp(shoreDepth, bedDepth, f);
            }
            if (isAreaWaterType(this.type)) {
                const edge = this._distanceToPolygonEdgeXZ(x, z);
                const f = this._smooth01(THREE.MathUtils.clamp(edge / shoreWidth, 0, 1));
                return THREE.MathUtils.lerp(shoreDepth, bedDepth, f);
            }
            return bedDepth;
        }

        _attachDepthAttribute(geometry) {
            const pos = geometry?.attributes?.position;
            if (!pos) return;
            const uv = geometry.attributes.uv;
            const depth = new Float32Array(pos.count);
            for (let i = 0; i < pos.count; i++) {
                const u = uv ? { x: uv.getX(i), y: uv.getY(i) } : null;
                depth[i] = this._depthAtWorldXZ(pos.getX(i), pos.getZ(i), u);
            }
            geometry.setAttribute('smWaterDepth', new THREE.BufferAttribute(depth, 1));
        }

        updateDepthProfile() {
            const geometry = this.mesh?.geometry;
            if (!geometry?.attributes?.position) return false;
            this._attachDepthAttribute(geometry);
            geometry.attributes.smWaterDepth.needsUpdate = true;

            this.volume?.rebuild?.();

            return true;
        }

        rebuild() {
            const geometry = this._createGeometry();
            if (!geometry) return false;
            if (!this.group.parent) this.scene.add(this.group);
            this.group.position.set(0, 0, 0);
            if (this.mesh) {
                this.group.remove(this.mesh);
                this.mesh.geometry?.dispose?.();
            }
            this.mesh = new THREE.Mesh(geometry, this.material);
            this.mesh.name = `SMWaterMesh_${this.type}_${this.id}`;
            this.mesh.renderOrder = Number(this.config.renderOrder || 50);
            this.mesh.frustumCulled = false;
            this.mesh.visible = true;
            this.mesh.castShadow = false;
            this.mesh.receiveShadow = true;

            // Water must always interpolate vertex normals smoothly.
            if (
                this.mesh.material &&
                'flatShading' in
                this.mesh.material
            ) {
                this.mesh.material.flatShading = false;
                this.mesh.material.needsUpdate = true;
            }
            this.mesh.userData.isWater = true;
            this.mesh.userData.isWaterSurface = true;
            this.mesh.userData.isSystemObject = true;
            this.mesh.userData.waterBodyId = this.id;
            this.group.visible = true;
            this.group.renderOrder = this.mesh.renderOrder;
            this.group.add(this.mesh);
            this.mesh.updateMatrixWorld?.(true);

            this._oceanAnchorWorld =
                this.type === 'ocean'
                    ? (geometry.userData?.smOceanGeometryCenter?.clone?.() || this._getCenter())
                    : null;

            if (window.SMWaterVolume) {
                if (!this.volume) {
                    this.volume =
                        new window.SMWaterVolume(
                            this
                        );
                } else {
                    this.volume.rebuild();
                }
            }

            return true;
        }

        _updateOceanAnchor(camera = null) {
            if (this.type !== 'ocean' || !this.mesh || !this.group) return;

            const activeCamera = camera || window.SMViewportSystem?.getActivePanel?.()?.camera || window.camera || null;
            const target = activeCamera?.position || window.controls?.target || null;
            if (!target) return;

            const center =
                this.mesh.geometry?.userData?.smOceanGeometryCenter ||
                this._getCenter();
            const size = Math.max(
                10,
                Number(this.mesh.geometry?.userData?.smOceanGridSize || this.config.oceanSize || 800)
            );
            const snap = Math.max(4, Math.min(size * 0.25, 24));
            const anchorX = center.x + Math.round((target.x - center.x) / snap) * snap;
            const anchorZ = center.z + Math.round((target.z - center.z) / snap) * snap;

            this.group.position.x = anchorX - center.x;
            this.group.position.z = anchorZ - center.z;
            this._oceanAnchorWorld = this._oceanAnchorWorld || center.clone();
            this._oceanAnchorWorld.set(anchorX, center.y, anchorZ);
        }

        setPoints(points = []) {
            this.points = points.map(p => p.clone ? p.clone() : new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0));
            return this.rebuild();
        }

        setType(type) {
            const nextType = normalizeWaterType(type || 'river');
            if (nextType === 'river' && this.points.length < 2) return false;
            if ((nextType === 'lake' || nextType === 'pool') && this.points.length < 3) return false;
            this.type = nextType;
            this.config.type = this.type;
            this.config.externalShoreFoam =
                this.type === 'river' &&
                this.config.riverbankFoamEnabled !== false
                    ? 1
                    : 0;
            SMWaterMaterialFactory.apply(
                this.material,
                {
                    type: this.type,
                    waterType: this.type,
                    externalShoreFoam: this.config.externalShoreFoam
                }
            );
            return this.rebuild();
        }

        setConfig(patch = {}) {
            if (patch.type !== undefined || patch.waterType !== undefined) {
                const nextType = normalizeWaterType(patch.type || patch.waterType);
                this.type = nextType;
                patch = { ...patch, type: nextType, waterType: nextType };
            }
            if (patch.riverbankFoamEnabled !== undefined) {
                patch = {
                    ...patch,
                    externalShoreFoam:
                        this.type === 'river' &&
                        patch.riverbankFoamEnabled !== false
                            ? 1
                            : 0
                };
            }

            const geometryKeys = ['type', 'width', 'levelOffset', 'oceanSize', 'quality', 'flowReverse'];
            const depthKeys = ['bedDepth', 'volumeDepth', 'shoreWidth', 'shoreDepth'];
            let rebuild = false;
            let updateDepth = false;
            for (const key of geometryKeys) if (patch[key] !== undefined && patch[key] !== this.config[key]) rebuild = true;
            for (const key of depthKeys) if (patch[key] !== undefined && patch[key] !== this.config[key]) updateDepth = true;
            Object.assign(this.config, patch);
            SMWaterMaterialFactory.apply(this.material, patch);
            this.volume?.setConfig?.(patch);
            if (rebuild) this.rebuild();
            else if (updateDepth) this.updateDepthProfile();
            if (!this.mesh) this.rebuild();
            this.group.visible = true;
            if (this.mesh) {
                this.mesh.visible = true;
                this.mesh.material.visible = true;
                this.mesh.frustumCulled = false;
                this.mesh.renderOrder = Number(this.config.renderOrder || 50);
            }
        }

        _surfaceYRiver(x, z) {
            let best = Infinity, bestY = 0;
            for (let i = 0; i < this.points.length - 1; i++) {
                const a = this.points[i], b = this.points[i + 1];
                const abx = b.x - a.x, abz = b.z - a.z;
                const ab2 = abx * abx + abz * abz;
                const t = ab2 > 1e-8 ? THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.z) * abz) / ab2, 0, 1) : 0;
                const px = a.x + abx * t, pz = a.z + abz * t;
                const d = (x - px) * (x - px) + (z - pz) * (z - pz);
                if (d < best) {
                    best = d;
                    bestY = THREE.MathUtils.lerp(a.y, b.y, t);
                }
            }
            return bestY + Number(this.config.levelOffset || 0);
        }

        surfaceYAt(x, z, includeWaves = false, time = this.time) {
            let y;
            if (this.type === 'river') y = this._surfaceYRiver(x, z);
            else if (isAreaWaterType(this.type) && this.points.length) y = this.points.reduce((s, p) => s + p.y, 0) / this.points.length + Number(this.config.levelOffset || 0);
            else {
                const c = this._getCenter();
                y = c.y + Number(this.config.levelOffset || 0);
            }
            if (includeWaves) {
                let flow = null;
                if (this.type === 'river') {
                    const dir3 = this.flowDirectionAt(x, z, new THREE.Vector3());
                    flow = new THREE.Vector2(dir3.x, dir3.z);
                }
                y += SMWaterMaterialFactory.sampleWaveHeight(this.material, x, z, time, flow);
            }
            return y;
        }

        surfaceNormalAt(x, z, time = this.time) {
            const eps = 0.08;
            const dx = (
                this.surfaceYAt(x + eps, z, true, time) -
                this.surfaceYAt(x - eps, z, true, time)
            ) / (2 * eps);
            const dz = (
                this.surfaceYAt(x, z + eps, true, time) -
                this.surfaceYAt(x, z - eps, true, time)
            ) / (2 * eps);
            const normal = new THREE.Vector3(-dx, 1, -dz);
            return normal.normalize();
        }

        sampleWaterAt(x, z, time = this.time) {
            const surfaceY = this.surfaceYAt(x, z, true, time);
            return {
                found: this.containsXZ(x, z, 0),
                bodyId: this.id,
                surfaceY,
                normal: this.surfaceNormalAt(x, z, time),
                current: this.currentAt(x, z, new THREE.Vector3()),
                waterDepth: Math.max(0.02, Number(this.depthAt(x, z)) || 0.02)
            };
        }

        _closestRiverSegmentInfo(x, z) {
            if (this.type !== 'river' || this.points.length < 2) return null;
            let best = null;
            let bestDistanceSq = Infinity;
            for (let i = 0; i < this.points.length - 1; i++) {
                const a = this.points[i];
                const b = this.points[i + 1];
                const abx = b.x - a.x;
                const abz = b.z - a.z;
                const lenSq = abx * abx + abz * abz;
                const t = lenSq > 1e-8
                    ? THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.z) * abz) / lenSq, 0, 1)
                    : 0;
                const px = a.x + abx * t;
                const pz = a.z + abz * t;
                const dx = x - px;
                const dz = z - pz;
                const distanceSq = dx * dx + dz * dz;
                if (distanceSq < bestDistanceSq) {
                    bestDistanceSq = distanceSq;
                    best = { a, b, t, px, pz, distance: Math.sqrt(distanceSq), segmentIndex: i };
                }
            }
            return best;
        }

        flowDirectionAt(x, z, target = new THREE.Vector3()) {
            target.set(0, 0, 0);
            if (this.type !== 'river') {
                const f = this.config.flowDirection || { x: 1, y: 0 };
                target.set(Number(f.x ?? 1), 0, Number(f.y ?? 0));
                if (target.lengthSq() < 1e-8) target.set(1, 0, 0);
                return target.normalize();
            }
            const info = this._closestRiverSegmentInfo(x, z);
            if (!info) return target;
            target.set(info.b.x - info.a.x, 0, info.b.z - info.a.z);
            if (target.lengthSq() < 1e-8) return target;
            target.normalize();
            if (this.config.flowReverse) target.multiplyScalar(-1);
            return target;
        }

        currentAt(x, z, target = new THREE.Vector3()) {
            target.set(0, 0, 0);
            if (this.type !== 'river' || !this.containsXZ(x, z, 0)) return target;
            const info = this._closestRiverSegmentInfo(x, z);
            if (!info) return target;
            this.flowDirectionAt(x, z, target);
            if (target.lengthSq() < 1e-8) return target;

            // A real river is usually slower close to the banks than in the center.
            const halfWidth = Math.max(0.125, Number(this.config.width || 4) * 0.5);
            const centerFactor = 1 - THREE.MathUtils.clamp(info.distance / halfWidth, 0, 1);
            const smoothCenter = this._smooth01(centerFactor);
            const bankDrag = THREE.MathUtils.clamp(Number(this.config.currentBankDrag ?? 0.55), 0, 0.95);
            const bankMultiplier = THREE.MathUtils.lerp(1 - bankDrag, 1, smoothCenter);
            const strength = Math.max(0, Number(this.config.currentStrength ?? 1.5));
            return target.multiplyScalar(strength * bankMultiplier);
        }

        depthAt(x, z) {
            return this._depthAtWorldXZ(x, z, null);
        }

        containsXZ(x, z, padding = 0) {
            if (isAreaWaterType(this.type)) {
                if (this._pointInPolygonXZ(x, z)) return true;
                if (padding <= 0) return false;
                return this._distanceToPolygonEdgeXZ(x, z) <= padding;
            }
            if (this.type === 'river' && this.points.length > 1) {
                let best = Infinity;
                for (let i = 0; i < this.points.length - 1; i++) best = Math.min(best, this._distanceToSegmentXZ(x, z, this.points[i], this.points[i + 1]));
                return best <= Math.max(0.25, Number(this.config.width || 4) * 0.5 + padding);
            }
            if (this.type === 'ocean') {
                const c = this._oceanAnchorWorld || this._getCenter();
                const half = Math.max(5, Number(this.config.oceanSize || 800) * 0.5) + padding;
                return Math.abs(x - c.x) <= half && Math.abs(z - c.z) <= half;
            }
            return false;
        }

        addRipple(position, options = {}) {
            return SMWaterMaterialFactory.addRipple(this.material, {
                position,
                time: options.time ?? this.time,
                strength: options.strength ?? 0.14,
                speed: options.speed ?? 2.6,
                frequency: options.frequency ?? 11,
                decay: options.decay ?? 1.4,
                radius: options.radius ?? 7
            });
        }

        update(delta, time, state = {}) {
            this.time = Number(time) || 0;
            this._updateOceanAnchor(state.camera || this.camera);
            SMWaterMaterialFactory.update(this.material, delta, this.time, state);
            this.volume?.update?.(this.time);
        }

        dispose() {
            this.volume?.dispose?.();
            this.volume = null;

            if (this.mesh) {
                this.group.remove(this.mesh);
                this.mesh.geometry?.dispose?.();
            }
            this.material?.dispose?.();
            this.scene.remove(this.group);
            this.mesh = null;
        }
    }

    window.SMWaterBody = SMWaterBody;
})();
