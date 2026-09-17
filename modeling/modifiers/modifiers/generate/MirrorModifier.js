//modifiers/modifiers/generate/MirrorModifier.js
// Mirrors geometry across one or more axes — mirrors Blender's Mirror modifier exactly.

(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class MirrorModifier extends root.ModifierBase {
        defineSchema() {
            return {
                mirrorX:        { type: "bool",  default: true,  label: "X" },
                mirrorY:        { type: "bool",  default: false, label: "Y" },
                mirrorZ:        { type: "bool",  default: false, label: "Z" },
                // Clipping: vertices exactly on the mirror plane get snapped to it
                clipping:       { type: "bool",  default: false, label: "Clipping" },
                // Merge overlapping verts on the mirror plane
                mergeVertices:  { type: "bool",  default: true,  label: "Merge Vertices" },
                mergeThreshold: { type: "float", default: 0.001, min: 0, max: 1, label: "Merge Threshold" },
                // Bisect: remove geometry on the negative side of each mirror plane
                bisectX:        { type: "bool",  default: false, label: "Bisect X" },
                bisectY:        { type: "bool",  default: false, label: "Bisect Y" },
                bisectZ:        { type: "bool",  default: false, label: "Bisect Z" },
                // Flip UVs on mirrored copies
                flipUVX:        { type: "bool",  default: false, label: "Flip U" },
                flipUVY:        { type: "bool",  default: false, label: "Flip V" },
                // Mirror object pivot (use a different object as the mirror center)
                mirrorObjectUUID: { type: "string", default: "", label: "Mirror Object" },
            };
        }

        apply(geometry, object) {
            const p = this.getParams();

            // Mirror pivot: world origin of mirror object, or local origin
            let pivotOffset = new THREE.Vector3(0, 0, 0);
            if (p.mirrorObjectUUID && object?.parent) {
                const mirrorObj = object.parent.getObjectByProperty("uuid", p.mirrorObjectUUID);
                if (mirrorObj) {
                    const worldPos = new THREE.Vector3();
                    mirrorObj.getWorldPosition(worldPos);
                    const localPos = object.worldToLocal(worldPos.clone());
                    pivotOffset.copy(localPos);
                }
            }

            const axes = [
                { enabled: p.mirrorX, bisect: p.bisectX, sign: new THREE.Vector3(-1,  1,  1), uvFlip: p.flipUVX ? "u" : null },
                { enabled: p.mirrorY, bisect: p.bisectY, sign: new THREE.Vector3( 1, -1,  1), uvFlip: p.flipUVY ? "v" : null },
                { enabled: p.mirrorZ, bisect: p.bisectZ, sign: new THREE.Vector3( 1,  1, -1), uvFlip: null },
            ];

            let base = root.GeometryUtils.ensureNonIndexed(geometry);

            // Apply bisect if needed (remove verts on negative side of axis)
            for (const axis of axes) {
                if (axis.enabled && axis.bisect) {
                    base = this._bisect(base, axis.sign, pivotOffset);
                }
            }

            // Generate mirrored copies for each active axis combination
            // Blender mirrors all active axes, resulting in up to 8 copies (2^3)
            const copies = [base.clone()];

            for (const axis of axes) {
                if (!axis.enabled) continue;
                const newCopies = [];
                for (const copy of copies) {
                    const mirrored = this._mirrorGeometry(copy, axis.sign, axis.uvFlip, pivotOffset);
                    newCopies.push(mirrored);
                }
                copies.push(...newCopies);
            }

            let result = root.GeometryUtils.mergeNonIndexedGeometries(copies);

            if (p.mergeVertices) {
                result = this._mergeOnPlane(result, axes.filter(a => a.enabled), p.mergeThreshold, pivotOffset);
            }

            if (p.clipping) {
                result = this._clipToPlanes(result, axes.filter(a => a.enabled), pivotOffset);
            }

            result.computeVertexNormals();
            return result;
        }

        _mirrorGeometry(geometry, signVec, uvFlipChannel, pivot) {
            const mirrored = geometry.clone();
            const position  = mirrored.getAttribute("position");
            const uv        = mirrored.getAttribute("uv");

            for (let i = 0; i < position.count; i++) {
                const x = (position.getX(i) - pivot.x) * signVec.x + pivot.x;
                const y = (position.getY(i) - pivot.y) * signVec.y + pivot.y;
                const z = (position.getZ(i) - pivot.z) * signVec.z + pivot.z;
                position.setXYZ(i, x, y, z);
            }
            position.needsUpdate = true;

            // Flip triangle winding for the mirror copy so normals face outward
            this._flipWinding(mirrored);

            // Flip UVs if requested
            if (uv && uvFlipChannel) {
                for (let i = 0; i < uv.count; i++) {
                    if (uvFlipChannel === "u") uv.setX(i, 1.0 - uv.getX(i));
                    if (uvFlipChannel === "v") uv.setY(i, 1.0 - uv.getY(i));
                }
                uv.needsUpdate = true;
            }

            return mirrored;
        }

        _flipWinding(geometry) {
            const position = geometry.getAttribute("position");
            for (let i = 0; i < position.count; i += 3) {
                // Swap vertex 1 and 2 in each triangle
                const ax = position.getX(i+1), ay = position.getY(i+1), az = position.getZ(i+1);
                position.setXYZ(i+1, position.getX(i+2), position.getY(i+2), position.getZ(i+2));
                position.setXYZ(i+2, ax, ay, az);

                const uv = geometry.getAttribute("uv");
                if (uv) {
                    const au = uv.getX(i+1), av = uv.getY(i+1);
                    uv.setXY(i+1, uv.getX(i+2), uv.getY(i+2));
                    uv.setXY(i+2, au, av);
                }
            }
            position.needsUpdate = true;
        }

        _bisect(geometry, signVec, pivot) {
            // Remove triangles where the centroid is on the "wrong" side
            const position = geometry.getAttribute("position");
            const keepPositions = [];
            const keepUVs = [];
            const uv = geometry.getAttribute("uv");

            for (let i = 0; i < position.count; i += 3) {
                const cx = ((position.getX(i) + position.getX(i+1) + position.getX(i+2)) / 3) - pivot.x;
                const cy = ((position.getY(i) + position.getY(i+1) + position.getY(i+2)) / 3) - pivot.y;
                const cz = ((position.getZ(i) + position.getZ(i+1) + position.getZ(i+2)) / 3) - pivot.z;

                // signVec has -1 for the mirrored axis; keep triangles on the positive side
                const keepX = signVec.x === -1 ? cx >= 0 : true;
                const keepY = signVec.y === -1 ? cy >= 0 : true;
                const keepZ = signVec.z === -1 ? cz >= 0 : true;

                if (keepX && keepY && keepZ) {
                    for (let j = 0; j < 3; j++) {
                        keepPositions.push(position.getX(i+j), position.getY(i+j), position.getZ(i+j));
                        if (uv) keepUVs.push(uv.getX(i+j), uv.getY(i+j));
                    }
                }
            }

            const result = new THREE.BufferGeometry();
            result.setAttribute("position", new THREE.Float32BufferAttribute(keepPositions, 3));
            if (uv && keepUVs.length) result.setAttribute("uv", new THREE.Float32BufferAttribute(keepUVs, 2));
            return result;
        }

        _mergeOnPlane(geometry, axes, threshold, pivot) {
            // Snap vertices that are within threshold of a mirror plane onto that plane
            const position = geometry.getAttribute("position");
            for (let i = 0; i < position.count; i++) {
                let x = position.getX(i), y = position.getY(i), z = position.getZ(i);
                for (const axis of axes) {
                    if (axis.sign.x === -1 && Math.abs(x - pivot.x) < threshold) x = pivot.x;
                    if (axis.sign.y === -1 && Math.abs(y - pivot.y) < threshold) y = pivot.y;
                    if (axis.sign.z === -1 && Math.abs(z - pivot.z) < threshold) z = pivot.z;
                }
                position.setXYZ(i, x, y, z);
            }
            position.needsUpdate = true;
            return geometry;
        }

        _clipToPlanes(geometry, axes, pivot) {
            // Hard-clamp vertex positions to ensure nothing crosses the mirror plane
            const position = geometry.getAttribute("position");
            for (let i = 0; i < position.count; i++) {
                let x = position.getX(i), y = position.getY(i), z = position.getZ(i);
                for (const axis of axes) {
                    if (axis.sign.x === -1) x = Math.max(x, pivot.x);
                    if (axis.sign.y === -1) y = Math.max(y, pivot.y);
                    if (axis.sign.z === -1) z = Math.max(z, pivot.z);
                }
                position.setXYZ(i, x, y, z);
            }
            position.needsUpdate = true;
            return geometry;
        }
    }

    root.MirrorModifier = MirrorModifier;
})();