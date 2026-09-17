/*
 * High-density mesh brush kernel. It keeps UV/hard-normal seam duplicates
 * welded during editing and uses a local spatial hash, so it is appropriate
 * for character meshes without sharing any code or state with terrain tools.
 */
(function () {
    'use strict';

    class SMAdvancedSculptBrushEngine {
        constructor() {
            this.geometry = null;
            this.positions = null;
            this.normals = null;
            this.mask = null;
            this.groups = [];
            this.groupForVertex = null;
            this.adjacency = [];
            this.spatial = new Map();
            this.cellSize = 0.1;
            this.boundsCenter = new THREE.Vector3();
            this._tmpPosition = new THREE.Vector3();
            this._tmpAverage = new THREE.Vector3();
            this._tmpNormal = new THREE.Vector3();
        }

        prepare(geometry, existingMask = null) {
            this.geometry = geometry;
            this.positions = geometry?.getAttribute?.('position')?.array || null;
            this.normals = geometry?.getAttribute?.('normal')?.array || null;
            const count = geometry?.getAttribute?.('position')?.count || 0;
            this.mask = existingMask?.length === count ? new Float32Array(existingMask) : new Float32Array(count);
            this._buildWeldedTopology();
            return this.mask;
        }

        _buildWeldedTopology() {
            const geometry = this.geometry;
            const position = geometry?.getAttribute?.('position');
            if (!position) return;
            geometry.computeBoundingBox();
            const bounds = geometry.boundingBox;
            const diagonal = Math.max(bounds?.max.distanceTo(bounds.min) || 1, 1e-4);
            const precision = Math.max(diagonal * 1e-6, 1e-6);
            this.cellSize = Math.max(diagonal / 42, 0.012);
            this.boundsCenter.copy(bounds?.getCenter(this.boundsCenter) || new THREE.Vector3());

            const map = new Map();
            this.groups = [];
            this.groupForVertex = new Int32Array(position.count);
            for (let vertex = 0; vertex < position.count; vertex += 1) {
                const key = `${Math.round(position.getX(vertex) / precision)}:${Math.round(position.getY(vertex) / precision)}:${Math.round(position.getZ(vertex) / precision)}`;
                let groupIndex = map.get(key);
                if (groupIndex === undefined) {
                    groupIndex = this.groups.length;
                    map.set(key, groupIndex);
                    this.groups.push([]);
                }
                this.groups[groupIndex].push(vertex);
                this.groupForVertex[vertex] = groupIndex;
            }

            const linked = Array.from({ length: this.groups.length }, () => new Set());
            const index = geometry.index?.array;
            const faceVertices = index || Array.from({ length: position.count }, (_, value) => value);
            for (let offset = 0; offset + 2 < faceVertices.length; offset += 3) {
                const a = this.groupForVertex[faceVertices[offset]];
                const b = this.groupForVertex[faceVertices[offset + 1]];
                const c = this.groupForVertex[faceVertices[offset + 2]];
                if (a !== b) { linked[a].add(b); linked[b].add(a); }
                if (a !== c) { linked[a].add(c); linked[c].add(a); }
                if (b !== c) { linked[b].add(c); linked[c].add(b); }
            }
            this.adjacency = linked.map(neighbors => [...neighbors]);

            this.spatial.clear();
            this.groups.forEach((group, groupIndex) => {
                const vertex = group[0];
                const key = this._cellKey(this.positions[vertex * 3], this.positions[vertex * 3 + 1], this.positions[vertex * 3 + 2]);
                const bucket = this.spatial.get(key) || [];
                bucket.push(groupIndex);
                this.spatial.set(key, bucket);
            });
        }

        apply({ center, normal, radius, strength, falloff, profile = 'smooth', brush = 'draw', invert = false, smooth = false, delta = null }) {
            if (!this.positions || !center || !normal || radius <= 0) return false;
            const mode = smooth ? 'smooth' : brush;
            const candidates = this.query(center, radius);
            if (!candidates.length) return false;
            const sign = invert ? -1 : 1;
            const planeNormal = normal.clone().normalize();
            const average = this._tmpAverage.set(0, 0, 0);
            if (mode === 'flatten' || mode === 'scrape') {
                candidates.forEach(({ group }) => average.add(this.positionAtGroup(group)));
                average.multiplyScalar(1 / candidates.length);
            }

            candidates.forEach(({ group, distance }) => {
                const vertex = this.groups[group][0];
                const mask = this.mask[vertex] || 0;
                const weight = this.falloff(distance / radius, falloff, profile) * (1 - mask);
                if (weight <= 0.00001) return;
                const position = this.positionAtGroup(group, this._tmpPosition);
                const amount = radius * strength * weight * 0.16 * sign;
                const vertexNormal = this.normalAtVertex(vertex, this._tmpNormal);

                if (mode === 'mask') {
                    this.writeMask(group, THREE.MathUtils.clamp(mask + sign * weight * 0.12, 0, 1));
                    return;
                }
                if (mode === 'mask-smooth') {
                    const neighbors = this.adjacency[group] || [];
                    if (neighbors.length) {
                        const target = neighbors.reduce((sum, neighbor) => sum + (this.mask[this.groups[neighbor][0]] || 0), 0) / neighbors.length;
                        this.writeMask(group, THREE.MathUtils.lerp(mask, target, weight * Math.abs(strength)));
                    }
                    return;
                }
                if (mode === 'smooth') {
                    const neighbors = this.adjacency[group] || [];
                    if (neighbors.length) {
                        const target = new THREE.Vector3();
                        neighbors.forEach(neighbor => target.add(this.positionAtGroup(neighbor)));
                        target.multiplyScalar(1 / neighbors.length);
                        position.lerp(target, THREE.MathUtils.clamp(Math.abs(amount) * 1.7, 0, 0.82));
                    }
                } else if (mode === 'flatten' || mode === 'scrape') {
                    const planePoint = mode === 'scrape' ? center : average;
                    const height = planeNormal.dot(position.clone().sub(planePoint));
                    position.addScaledVector(planeNormal, -height * Math.min(1, Math.abs(amount) * 4));
                } else if (mode === 'pinch') {
                    position.lerp(center, THREE.MathUtils.clamp(Math.abs(amount) * 1.9, 0, 0.65));
                } else if (mode === 'grab' || mode === 'snake-hook') {
                    if (delta?.lengthSq?.() > 0) position.addScaledVector(delta, weight * (mode === 'snake-hook' ? 1.25 : 0.8));
                } else if (mode === 'crease') {
                    position.addScaledVector(planeNormal, -amount * 1.25);
                    position.lerp(center, THREE.MathUtils.clamp(Math.abs(amount) * 0.42, 0, 0.28));
                } else if (mode === 'expand') {
                    const direction = position.clone().sub(center);
                    if (direction.lengthSq() > 1e-8) position.addScaledVector(direction.normalize(), amount * 0.55);
                } else if (mode === 'clay') {
                    position.addScaledVector(planeNormal, amount * 1.45);
                } else {
                    position.addScaledVector(mode === 'inflate' ? vertexNormal : planeNormal, amount);
                }

                this.writePosition(group, position);
            });

            this.geometry.getAttribute('position').needsUpdate = true;
            return true;
        }

        query(center, radius) {
            const values = [];
            const lowerX = Math.floor((center.x - radius) / this.cellSize);
            const upperX = Math.floor((center.x + radius) / this.cellSize);
            const lowerY = Math.floor((center.y - radius) / this.cellSize);
            const upperY = Math.floor((center.y + radius) / this.cellSize);
            const lowerZ = Math.floor((center.z - radius) / this.cellSize);
            const upperZ = Math.floor((center.z + radius) / this.cellSize);
            const radiusSq = radius * radius;
            const cells = (upperX - lowerX + 1) * (upperY - lowerY + 1) * (upperZ - lowerZ + 1);
            const inspect = group => {
                const vertex = this.groups[group][0] * 3;
                const dx = this.positions[vertex] - center.x;
                const dy = this.positions[vertex + 1] - center.y;
                const dz = this.positions[vertex + 2] - center.z;
                const distanceSq = dx * dx + dy * dy + dz * dz;
                if (distanceSq <= radiusSq) values.push({ group, distance: Math.sqrt(distanceSq) });
            };

            // A huge brush should scan its representatives once rather than
            // iterate millions of empty spatial-hash cells.
            if (cells > 30000) {
                this.groups.forEach((_, group) => inspect(group));
                return values;
            }

            for (let x = lowerX; x <= upperX; x += 1) {
                for (let y = lowerY; y <= upperY; y += 1) {
                    for (let z = lowerZ; z <= upperZ; z += 1) {
                        (this.spatial.get(`${x}:${y}:${z}`) || []).forEach(inspect);
                    }
                }
            }
            return values;
        }

        positionAtGroup(group, target = new THREE.Vector3()) {
            const vertex = this.groups[group][0] * 3;
            return target.set(this.positions[vertex], this.positions[vertex + 1], this.positions[vertex + 2]);
        }

        normalAtVertex(vertex, target = new THREE.Vector3(0, 1, 0)) {
            const offset = vertex * 3;
            return target.set(this.normals[offset], this.normals[offset + 1], this.normals[offset + 2]).normalize();
        }

        writePosition(group, value) {
            this.groups[group].forEach(vertex => {
                const offset = vertex * 3;
                this.positions[offset] = value.x;
                this.positions[offset + 1] = value.y;
                this.positions[offset + 2] = value.z;
            });
        }

        writeMask(group, value) {
            this.groups[group].forEach(vertex => { this.mask[vertex] = value; });
        }

        falloff(value, amount, profile) {
            const edge = THREE.MathUtils.clamp(1 - value, 0, 1);
            const curve = profile === 'linear'
                ? edge
                : profile === 'sharp'
                    ? edge * edge * edge
                    : profile === 'sphere'
                        ? Math.sqrt(Math.max(0, 1 - value * value))
                        : edge * edge * (3 - 2 * edge);
            return Math.pow(curve, 1 + THREE.MathUtils.clamp(Number(amount) || 0.5, 0, 1) * 2.4);
        }

        _cellKey(x, y, z) {
            return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}:${Math.floor(z / this.cellSize)}`;
        }
    }

    window.SMAdvancedSculptBrushEngine = SMAdvancedSculptBrushEngine;
}());
