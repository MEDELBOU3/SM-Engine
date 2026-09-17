(function () {
    'use strict';

    class SMWaterVolume {
        constructor(
            body,
            options = {}
        ) {
            if (!body) {
                throw new Error(
                    'SMWaterVolume requires an SMWaterBody'
                );
            }

            if (
                !window
                    .SMWaterVolumeMaterialFactory
            ) {
                throw new Error(
                    'Load WaterVolumeMaterial.js before WaterVolume.js'
                );
            }

            this.body =
                body;

            this.options = {
                ...body.config,
                ...options
            };

            this.material =
                SMWaterVolumeMaterialFactory
                    .create(
                        this.options
                    );

            this.mesh =
                null;

            this.time =
                0;

            this._tmpPoint =
                new THREE.Vector3();

            this.rebuild();
        }

        _getSurfaceGeometry() {
            return this.body?.mesh?.geometry || null;
        }

        _edgeKey(
            a,
            b
        ) {
            return a < b ? `${a}_${b}` : `${b}_${a}`;
        }

        _collectBoundaryEdges(
            indexArray
        ) {
            const edges =
                new Map();

            const addEdge =
                (
                    a,
                    b
                ) => {
                    const key =
                        this._edgeKey(
                            a,
                            b
                        );

                    const current =
                        edges.get(key);

                    if (current) {
                        current.count++;
                    } else {
                        edges.set(
                            key,
                            {
                                a,
                                b,
                                count: 1
                            }
                        );
                    }
                };

            for (
                let i = 0;
                i < indexArray.length;
                i += 3
            ) {
                const a =
                    indexArray[i];

                const b =
                    indexArray[i + 1];

                const c =
                    indexArray[i + 2];

                addEdge(a, b);
                addEdge(b, c);
                addEdge(c, a);
            }

            return Array
                .from(
                    edges.values()
                )
                .filter(
                    edge =>
                        edge.count ===
                        1
                );
        }

        _createGeometry() {
            const source =
                this._getSurfaceGeometry();

            const position =
                source
                    ?.attributes
                    ?.position;

            if (!position) {
                return null;
            }

            const sourceIndex =
                source.index;

            if (!sourceIndex) {
                console.warn(
                    '[SMWaterVolume] Surface geometry needs an index buffer.'
                );

                return null;
            }

            const count =
                position.count;

            const sourceUv =
                source.attributes.uv;

            const sourceDepth =
                source.attributes
                    .smWaterDepth;

            const positions =
                new Float32Array(
                    count *
                    2 *
                    3
                );

            const uvs =
                new Float32Array(
                    count *
                    2 *
                    2
                );

            const depth01 =
                new Float32Array(
                    count *
                    2
                );

            for (
                let i = 0;
                i < count;
                i++
            ) {
                const x =
                    position.getX(i);

                const y =
                    position.getY(i);

                const z =
                    position.getZ(i);

                const depth =
                    Math.max(
                        0.02,
                        Number(
                            sourceDepth
                                ?.getX?.(i) ??
                            this.body
                                .depthAt?.(
                                    x,
                                    z
                                ) ??
                            this.body
                                .config
                                ?.volumeDepth ??
                            4
                        )
                    );

                const topIndex =
                    i * 3;

                const bottomIndex =
                    (
                        count +
                        i
                    ) *
                    3;

                positions[topIndex] =
                    x;

                positions[topIndex + 1] =
                    y;

                positions[topIndex + 2] =
                    z;

                positions[bottomIndex] =
                    x;

                positions[bottomIndex + 1] =
                    y -
                    depth;

                positions[bottomIndex + 2] =
                    z;

                const u =
                    sourceUv
                        ?.getX?.(i) ??
                    0;

                const v =
                    sourceUv
                        ?.getY?.(i) ??
                    0;

                const topUv =
                    i * 2;

                const bottomUv =
                    (
                        count +
                        i
                    ) *
                    2;

                uvs[topUv] =
                    u;

                uvs[topUv + 1] =
                    v;

                uvs[bottomUv] =
                    u;

                uvs[bottomUv + 1] =
                    v;

                depth01[i] =
                    0;

                depth01[
                    count +
                    i
                ] =
                    1;
            }

            const sourceIndices =
                Array.from(
                    sourceIndex.array
                );

            const boundaryEdges =
                this
                    ._collectBoundaryEdges(
                        sourceIndices
                    );

            const indices = [];

            // The visible surface is rendered by SMWaterSurfaceMaterial. Do
            // not draw a second transparent top cap here: that duplicate
            // layer is the reason shallow water looks like a decal from an
            // oblique or underwater camera. Keep the bottom cap for depth and
            // build the boundary walls for a real 3D shoreline.
            for (
                let i = 0;
                i < sourceIndices.length;
                i += 3
            ) {
                const a =
                    sourceIndices[i] +
                    count;

                const b =
                    sourceIndices[i + 1] +
                    count;

                const c =
                    sourceIndices[i + 2] +
                    count;

                indices.push(
                    c,
                    b,
                    a
                );
            }

            // Boundary walls.
            for (
                const edge of
                boundaryEdges
            ) {
                const topA =
                    edge.a;

                const topB =
                    edge.b;

                const bottomA =
                    edge.a +
                    count;

                const bottomB =
                    edge.b +
                    count;

                indices.push(
                    topA,
                    bottomA,
                    topB
                );

                indices.push(
                    topB,
                    bottomA,
                    bottomB
                );
            }

            let geometry =
                new THREE
                    .BufferGeometry();

            geometry.setAttribute(
                'position',
                new THREE
                    .BufferAttribute(
                        positions,
                        3
                    )
            );

            geometry.setAttribute(
                'uv',
                new THREE
                    .BufferAttribute(
                        uvs,
                        2
                    )
            );

            geometry.setAttribute(
                'smVolumeDepth01',
                new THREE
                    .BufferAttribute(
                        depth01,
                        1
                    )
            );

            geometry.setIndex(
                indices
            );

            // Keep the cap and boundary-wall normals independent. Indexed
            // smoothing averages their normals at the shoreline and makes
            // the side render like a paper-thin strip instead of a volume.
            geometry = geometry.toNonIndexed();

            geometry
                .computeVertexNormals();

            geometry
                .computeBoundingBox();

            geometry
                .computeBoundingSphere();

            return geometry;
        }

        rebuild() {
            const geometry =
                this._createGeometry();

            if (!geometry) {
                return false;
            }

            if (this.mesh) {
                this.body.group
                    ?.remove?.(
                        this.mesh
                    );

                this.mesh.geometry
                    ?.dispose?.();
            }

            this.mesh =
                new THREE.Mesh(
                    geometry,
                    this.material
                );

            this.mesh.name =
                `SMWaterVolume_${this.body.type}_${this.body.id}`;

            this.mesh.renderOrder =
                Math.max(
                    0,
                    Number(
                        this.body
                            .config
                            ?.renderOrder ||
                        50
                    ) -
                    2
                );

            this.mesh.frustumCulled =
                false;

            this.mesh.castShadow =
                false;

            this.mesh.receiveShadow =
                false;

            this.mesh.userData.isWater =
                true;

            this.mesh.userData.isWaterVolume =
                true;

            this.mesh.userData.isSystemObject =
                true;

            this.mesh.userData.waterBodyId =
                this.body.id;

            this.body.group
                ?.add?.(
                    this.mesh
                );

            return true;
        }

        containsPoint(
            point,
            time =
                this.body.time
        ) {
            if (!point) {
                return false;
            }

            const x =
                Number(point.x);

            const y =
                Number(point.y);

            const z =
                Number(point.z);

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                !Number.isFinite(z)
            ) {
                return false;
            }

            if (
                !this.body
                    .containsXZ?.(
                        x,
                        z,
                        0.05
                    )
            ) {
                return false;
            }

            const surfaceY =
                Number(
                    this.body
                        .surfaceYAt?.(
                            x,
                            z,
                            true,
                            time
                        )
                );

            if (
                !Number.isFinite(
                    surfaceY
                )
            ) {
                return false;
            }

            const depth =
                Math.max(
                    0.02,
                    Number(
                        this.body
                            .depthAt?.(
                                x,
                                z
                            ) ??
                        this.body
                            .config
                            ?.volumeDepth ??
                        this.body
                            .config
                            ?.bedDepth ??
                        4
                    )
                );

            const bottomY =
                surfaceY -
                depth;

            return (
                y <=
                    surfaceY +
                    0.03 &&
                y >=
                    bottomY -
                    0.03
            );
        }

        getDepthFraction(
            point,
            time =
                this.body.time
        ) {
            if (!point) {
                return 0;
            }

            const surfaceY =
                Number(
                    this.body
                        .surfaceYAt?.(
                            point.x,
                            point.z,
                            true,
                            time
                        )
                );

            const depth =
                Math.max(
                    0.02,
                    Number(
                        this.body
                            .depthAt?.(
                                point.x,
                                point.z
                            ) ??
                        this.body
                            .config
                            ?.volumeDepth ??
                        4
                    )
                );

            if (
                !Number.isFinite(
                    surfaceY
                )
            ) {
                return 0;
            }

            return THREE
                .MathUtils
                .clamp(
                    (
                        surfaceY -
                        point.y
                    ) /
                    depth,
                    0,
                    1
                );
        }

        setConfig(
            patch = {}
        ) {
            Object.assign(
                this.options,
                patch
            );

            SMWaterVolumeMaterialFactory
                .apply(
                    this.material,
                    patch
                );

            const rebuildKeys =
                [
                    'width',
                    'levelOffset',
                    'oceanSize',
                    'quality',
                    'bedDepth',
                    'volumeDepth',
                    'shoreWidth',
                    'shoreDepth',
                    'flowReverse'
                ];

            if (
                Object
                    .keys(patch)
                    .some(
                        key =>
                            rebuildKeys
                                .includes(key)
                    )
            ) {
                this.rebuild();
            }
        }

        update(
            time = 0
        ) {
            this.time =
                Number(time) ||
                0;

            SMWaterVolumeMaterialFactory
                .update(
                    this.material,
                    this.time
                );
        }

        setVisible(
            value
        ) {
            if (this.mesh) {
                this.mesh.visible =
                    !!value;
            }
        }

        dispose() {
            if (this.mesh) {
                this.body.group
                    ?.remove?.(
                        this.mesh
                    );

                this.mesh.geometry
                    ?.dispose?.();

                this.mesh =
                    null;
            }

            this.material
                ?.dispose?.();

            this.material =
                null;
        }
    }

    window.SMWaterVolume =
        SMWaterVolume;
})();
