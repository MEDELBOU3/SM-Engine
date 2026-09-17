//modifiers/modifiers/generate/SubdivisionModifier.js
// Catmull-Clark subdivision surface — mirrors Blender's Subdivision Surface modifier.
// Implements proper CC rules: face points, edge points, vertex points.

(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class SubdivisionModifier extends root.ModifierBase {
        defineSchema() {
            return {
                levels:         { type: "int",    default: 1,    min: 0, max: 6,  label: "Levels" },
                renderLevels:   { type: "int",    default: 2,    min: 0, max: 6,  label: "Render Levels" },
                // "catmull-clark" | "simple" (just splits edges, no smoothing)
                subdivType:     { type: "select", default: "catmull-clark",         label: "Type",
                                  options: ["catmull-clark", "simple"] },
                // Smooth normals or keep sharp
                smoothShading:  { type: "bool",   default: true,                   label: "Smooth Shading" },
                // UV smoothing
                uvSmooth:       { type: "select", default: "none",                 label: "UV Smooth",
                                  options: ["none", "preserve-corners", "all"] },
            };
        }

        apply(geometry, object) {
            const p  = this.getParams();
            const levels = Math.min(p.levels, 6); // Hard cap for performance
            if (levels === 0) return geometry.clone();

            // Convert non-indexed triangle soup → indexed for CC
            let geo = geometry.index ? geometry.clone() : this._indexify(root.GeometryUtils.ensureNonIndexed(geometry));

            for (let i = 0; i < levels; i++) {
                if (p.subdivType === "simple") {
                    geo = this._simpleSubdivide(geo);
                } else {
                    geo = this._catmullClark(geo);
                }
            }

            geo.computeVertexNormals();
            return root.GeometryUtils.ensureNonIndexed(geo);
        }

        // ── Simple 1→4 triangle split ─────────────────────────────────────────
        _simpleSubdivide(geo) {
            const pos    = geo.getAttribute("position");
            const index  = geo.index;
            const newPos = [];
            const newIdx = [];
            const midCache = new Map();
            const vertCount = pos.count;

            // Copy original vertices
            for (let i = 0; i < vertCount; i++) {
                newPos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
            }

            const getMid = (a, b) => {
                const key = a < b ? `${a}:${b}` : `${b}:${a}`;
                if (midCache.has(key)) return midCache.get(key);
                const idx = newPos.length / 3;
                newPos.push(
                    (pos.getX(a) + pos.getX(b)) * 0.5,
                    (pos.getY(a) + pos.getY(b)) * 0.5,
                    (pos.getZ(a) + pos.getZ(b)) * 0.5
                );
                midCache.set(key, idx);
                return idx;
            };

            for (let i = 0; i < index.count; i += 3) {
                const a = index.getX(i), b = index.getX(i+1), c = index.getX(i+2);
                const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
                newIdx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
            }

            const result = new THREE.BufferGeometry();
            result.setAttribute("position", new THREE.Float32BufferAttribute(newPos, 3));
            result.setIndex(newIdx);
            return result;
        }

        // ── Catmull-Clark subdivision ─────────────────────────────────────────
        _catmullClark(geo) {
            // CC works on quads/polygons — we treat our triangles as-is.
            // Each face gets a face point; each edge gets an edge point; 
            // each vertex gets an updated vertex point.

            const pos   = geo.getAttribute("position");
            const index = geo.index;
            const V = pos.count;
            const getV = (i) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));

            // Build adjacency structures
            const facesOf     = Array.from({ length: V }, () => []);   // vertex → face indices
            const edgeMap     = new Map();                               // "a:b" → midpoint index (to be computed)
            const neighbors   = Array.from({ length: V }, () => new Set()); // vertex → neighbor set
            const faceCount   = index.count / 3;
            const facePoints  = [];

            // 1. Face points (centroid of each face)
            for (let f = 0; f < faceCount; f++) {
                const a = index.getX(f*3), b = index.getX(f*3+1), c = index.getX(f*3+2);
                [a, b, c].forEach(v => facesOf[v].push(f));
                neighbors[a].add(b); neighbors[a].add(c);
                neighbors[b].add(a); neighbors[b].add(c);
                neighbors[c].add(a); neighbors[c].add(b);
                const fp = getV(a).add(getV(b)).add(getV(c)).divideScalar(3);
                facePoints.push(fp);
            }

            // 2. Edge points: avg(v1, v2, fp1, fp2)
            const getEdgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
            for (let f = 0; f < faceCount; f++) {
                const tri = [index.getX(f*3), index.getX(f*3+1), index.getX(f*3+2)];
                for (let e = 0; e < 3; e++) {
                    const a = tri[e], b = tri[(e+1)%3];
                    const key = getEdgeKey(a, b);
                    if (!edgeMap.has(key)) edgeMap.set(key, { a, b, faces: [] });
                    edgeMap.get(key).faces.push(f);
                }
            }

            // New vertex array: [original verts ... face points ... edge points]
            const newVerts = [];
            for (let i = 0; i < V; i++) newVerts.push(getV(i));

            const fpOffset = V;
            for (const fp of facePoints) newVerts.push(fp);

            const epOffset = fpOffset + faceCount;
            const edgeKeys = [...edgeMap.keys()];
            for (const key of edgeKeys) {
                const { a, b, faces } = edgeMap.get(key);
                const ep = getV(a).add(getV(b));
                faces.forEach(f => ep.add(facePoints[f]));
                ep.divideScalar(2 + faces.length);
                edgeMap.get(key).newIdx = newVerts.length;
                newVerts.push(ep);
            }

            // 3. Updated original vertex points
            // CC rule: Q = avg face points of adjacent faces
            //          R = avg of edge midpoints of adjacent edges
            //          new_v = (Q + 2R + (n-3)*v) / n   where n = valence
            for (let v = 0; v < V; v++) {
                const adjFaces = facesOf[v];
                const n = adjFaces.length;
                if (n === 0) continue;

                const Q = new THREE.Vector3();
                adjFaces.forEach(f => Q.add(facePoints[f]));
                Q.divideScalar(n);

                const R = new THREE.Vector3();
                let edgeCount = 0;
                for (const nb of neighbors[v]) {
                    const key = getEdgeKey(v, nb);
                    const edge = edgeMap.get(key);
                    if (edge) {
                        R.add(getV(v)).add(getV(nb)).multiplyScalar(0.5);
                        edgeCount++;
                    }
                }
                if (edgeCount) R.divideScalar(edgeCount);

                const oldV = getV(v);
                const newV = Q.add(R.multiplyScalar(2)).add(oldV.multiplyScalar(n - 3)).divideScalar(n);
                newVerts[v].copy(newV);
            }

            // 4. Build new topology: each old triangle → 3 quads → 6 triangles
            const newPositions = [];
            const newIndex = [];

            const pushV = (v) => {
                newPositions.push(v.x, v.y, v.z);
                return newPositions.length / 3 - 1;
            };

            // Flatten newVerts into buffer
            const flatIdx = [];
            newVerts.forEach(v => flatIdx.push(pushV(v)));

            for (let f = 0; f < faceCount; f++) {
                const a = index.getX(f*3), b = index.getX(f*3+1), c = index.getX(f*3+2);
                const fp = fpOffset + f;
                const eab = edgeMap.get(getEdgeKey(a, b)).newIdx;
                const ebc = edgeMap.get(getEdgeKey(b, c)).newIdx;
                const eca = edgeMap.get(getEdgeKey(c, a)).newIdx;

                // 3 quads per triangle → 6 triangles
                // Quad 1: a, eab, fp, eca
                newIndex.push(flatIdx[a], flatIdx[eab], flatIdx[fp]);
                newIndex.push(flatIdx[a], flatIdx[fp], flatIdx[eca]);
                // Quad 2: b, ebc, fp, eab
                newIndex.push(flatIdx[b], flatIdx[ebc], flatIdx[fp]);
                newIndex.push(flatIdx[b], flatIdx[fp], flatIdx[eab]);
                // Quad 3: c, eca, fp, ebc
                newIndex.push(flatIdx[c], flatIdx[eca], flatIdx[fp]);
                newIndex.push(flatIdx[c], flatIdx[fp], flatIdx[ebc]);
            }

            const result = new THREE.BufferGeometry();
            result.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
            result.setIndex(newIndex);
            return result;
        }

        // Convert non-indexed geometry to indexed by deduplicating vertices
        _indexify(geo) {
            const pos = geo.getAttribute("position");
            const posMap = new Map();
            const verts = [];
            const indices = [];

            const key = (i) =>
                `${pos.getX(i).toFixed(6)},${pos.getY(i).toFixed(6)},${pos.getZ(i).toFixed(6)}`;

            for (let i = 0; i < pos.count; i++) {
                const k = key(i);
                if (!posMap.has(k)) {
                    posMap.set(k, verts.length / 3);
                    verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
                }
                indices.push(posMap.get(k));
            }

            const result = new THREE.BufferGeometry();
            result.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
            result.setIndex(indices);
            return result;
        }
    }

    root.SubdivisionModifier = SubdivisionModifier;
})();