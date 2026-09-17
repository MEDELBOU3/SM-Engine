/*
 * CPU topology tools for mesh sculpting. This module never touches terrain
 * components or TerrainSculptingSystem; it only receives ordinary THREE.Mesh
 * geometries from the mesh-sculpt workspace.
 */
(function () {
    'use strict';

    const MAX_VERTICES = 420000;

    class SMAdvancedSculptTopology {
        static getTriangleCount(geometry) {
            if (!geometry?.attributes?.position) return 0;
            return Math.floor((geometry.index?.count || geometry.attributes.position.count) / 3);
        }

        static getVertexCount(geometry) {
            return geometry?.attributes?.position?.count || 0;
        }

        static getEdgeCount(geometry) {
            const position = geometry?.getAttribute?.('position');
            if (!position) return 0;
            const index = geometry.index?.array;
            const triangleCount = this.getTriangleCount(geometry);
            const edges = new Set();
            const get = offset => index ? index[offset] : offset;
            const add = (a, b) => edges.add(a < b ? `${a}:${b}` : `${b}:${a}`);

            for (let triangle = 0; triangle < triangleCount; triangle += 1) {
                const offset = triangle * 3;
                const a = get(offset), b = get(offset + 1), c = get(offset + 2);
                add(a, b); add(b, c); add(c, a);
            }
            return edges.size;
        }

        static getSubdividedVertexCount(geometry, levels = 1) {
            const levelCount = Math.max(1, Math.floor(levels));
            let vertices = this.getVertexCount(geometry);
            let edges = this.getEdgeCount(geometry);
            let triangles = this.getTriangleCount(geometry);
            for (let level = 0; level < levelCount; level += 1) {
                vertices += edges;
                edges = edges * 2 + triangles * 3;
                triangles *= 4;
            }
            return vertices;
        }

        static canSubdivide(geometry, levels = 1, limit = MAX_VERTICES) {
            return this.getSubdividedVertexCount(geometry, levels) <= limit;
        }

        static subdivideGeometry(source, { levels = 1, maxVertices = MAX_VERTICES } = {}) {
            let geometry = source?.clone?.();
            const count = Math.max(1, Math.floor(levels));
            if (!geometry?.attributes?.position) throw new Error('Select a mesh with a position attribute.');

            for (let level = 0; level < count; level += 1) {
                const next = this._subdivideOnce(geometry, maxVertices);
                geometry.dispose?.();
                geometry = next;
            }

            return geometry;
        }

        static uniformRemeshGeometry(source, { subdivisions = 1, relaxIterations = 2, maxVertices = MAX_VERTICES } = {}) {
            const geometry = this.subdivideGeometry(source, { levels: subdivisions, maxVertices });
            this.relaxGeometry(geometry, relaxIterations, 0.32);
            return geometry;
        }

        static relaxGeometry(geometry, iterations = 1, strength = 0.25) {
            const position = geometry?.getAttribute?.('position');
            if (!position) return geometry;
            const count = position.count;
            const neighbors = Array.from({ length: count }, () => new Set());
            const index = geometry.index?.array;
            const triangleCount = Math.floor((index?.length || count) / 3);
            const get = value => index ? index[value] : value;

            for (let triangle = 0; triangle < triangleCount; triangle += 1) {
                const offset = triangle * 3;
                const a = get(offset), b = get(offset + 1), c = get(offset + 2);
                neighbors[a].add(b); neighbors[a].add(c);
                neighbors[b].add(a); neighbors[b].add(c);
                neighbors[c].add(a); neighbors[c].add(b);
            }

            const iterationsCount = Math.max(1, Math.floor(iterations));
            const weight = THREE.MathUtils.clamp(Number(strength) || 0.25, 0, 1);
            const source = new Float32Array(position.array.length);
            for (let iteration = 0; iteration < iterationsCount; iteration += 1) {
                source.set(position.array);
                for (let vertex = 0; vertex < count; vertex += 1) {
                    const linked = neighbors[vertex];
                    if (!linked.size) continue;
                    let x = 0, y = 0, z = 0;
                    linked.forEach(neighbor => {
                        const offset = neighbor * 3;
                        x += source[offset]; y += source[offset + 1]; z += source[offset + 2];
                    });
                    const own = vertex * 3;
                    const inverse = 1 / linked.size;
                    position.array[own] = THREE.MathUtils.lerp(source[own], x * inverse, weight);
                    position.array[own + 1] = THREE.MathUtils.lerp(source[own + 1], y * inverse, weight);
                    position.array[own + 2] = THREE.MathUtils.lerp(source[own + 2], z * inverse, weight);
                }
            }
            position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            return geometry;
        }

        static _subdivideOnce(source, maxVertices) {
            const position = source.getAttribute('position');
            const index = source.index?.array;
            const triangleCount = this.getTriangleCount(source);
            const sourceVertexCount = position.count;
            const outputVertexCount = sourceVertexCount + this.getEdgeCount(source);
            if (outputVertexCount > maxVertices) {
                throw new Error(`Refinement would create ${outputVertexCount.toLocaleString()} vertices. Reduce resolution or remesh in smaller steps.`);
            }

            const attributes = Object.entries(source.attributes)
                .filter(([name]) => name !== 'position' && name !== 'normal')
                .map(([name, attribute]) => ({ name, attribute }));
            const output = new THREE.BufferGeometry();
            const positions = new position.array.constructor(outputVertexCount * position.itemSize);
            positions.set(position.array);
            const attributesOut = new Map(attributes.map(({ name, attribute }) => [
                name,
                new attribute.array.constructor(outputVertexCount * attribute.itemSize)
            ]));
            attributes.forEach(({ name, attribute }) => attributesOut.get(name).set(attribute.array));
            const outputIndex = new Uint32Array(triangleCount * 12);
            const midpointByEdge = new Map();
            let vertexCursor = sourceVertexCount;
            let indexCursor = 0;
            const getIndex = value => index ? index[value] : value;
            const midpoint = (a, b) => {
                const key = a < b ? `${a}:${b}` : `${b}:${a}`;
                const existing = midpointByEdge.get(key);
                if (existing !== undefined) return existing;

                const vertex = vertexCursor++;
                for (let component = 0; component < position.itemSize; component += 1) {
                    positions[vertex * position.itemSize + component] =
                        (position.array[a * position.itemSize + component] + position.array[b * position.itemSize + component]) * 0.5;
                }
                attributes.forEach(({ name, attribute }) => {
                    const target = attributesOut.get(name);
                    for (let component = 0; component < attribute.itemSize; component += 1) {
                        target[vertex * attribute.itemSize + component] =
                            (attribute.array[a * attribute.itemSize + component] + attribute.array[b * attribute.itemSize + component]) * 0.5;
                    }
                });
                midpointByEdge.set(key, vertex);
                return vertex;
            };

            for (let triangle = 0; triangle < triangleCount; triangle += 1) {
                const offset = triangle * 3;
                const a = getIndex(offset), b = getIndex(offset + 1), c = getIndex(offset + 2);
                const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
                outputIndex.set([
                    a, ab, ca,
                    ab, b, bc,
                    ca, bc, c,
                    ab, bc, ca
                ], indexCursor);
                indexCursor += 12;
            }

            output.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            attributes.forEach(({ name, attribute }) => {
                output.setAttribute(name, new THREE.BufferAttribute(attributesOut.get(name), attribute.itemSize, attribute.normalized));
            });
            output.setIndex(new THREE.BufferAttribute(outputIndex, 1));
            source.groups.forEach(group => {
                const startTriangle = Math.floor(group.start / 3);
                const triangleLength = Math.floor(group.count / 3);
                output.addGroup(startTriangle * 12, triangleLength * 12, group.materialIndex);
            });
            output.computeVertexNormals();
            output.computeBoundingBox();
            output.computeBoundingSphere();
            return output;
        }
    }

    window.SMAdvancedSculptTopology = SMAdvancedSculptTopology;
}());
