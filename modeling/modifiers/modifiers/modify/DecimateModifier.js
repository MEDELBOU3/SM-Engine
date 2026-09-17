//modifiers/modifiers/modify/DecimateModifier.js
// Reduces polygon count — mirrors Blender's Decimate modifier.
// Implements Garland-Heckbert Quadric Error Metric (QEM) edge collapse.

(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class DecimateModifier extends root.ModifierBase {
        defineSchema() {
            return {
                ratio:          { type: "float",  default: 0.5,  min: 0.001, max: 1.0,  label: "Ratio" },
                // "collapse" | "unsubdivide" | "planar"
                decimateType:   { type: "select", default: "collapse",                  label: "Type",
                                  options: ["collapse", "planar"] },
                // For planar: angle limit below which faces are merged
                angleLimit:     { type: "float",  default: 5.0,  min: 0,     max: 180,  label: "Angle Limit (°)" },
                // For collapse: preserve UV seams, sharp edges
                triangleCount:  { type: "int",    default: 0,    min: 0,     max: 1e6,  label: "Triangle Count (0=auto)" },
                symmetryAxis:   { type: "select", default: "none",                      label: "Symmetry",
                                  options: ["none", "x", "y", "z"] },
            };
        }

        apply(geometry, object) {
            const p = this.getParams();
            const geo = root.GeometryUtils.ensureNonIndexed(geometry);

            if (p.decimateType === "planar") {
                return this._planarDecimate(geo, p);
            }
            return this._qemDecimate(geo, p);
        }

        // ── Planar decimation: merge coplanar adjacent faces ──────────────────
        _planarDecimate(geo, p) {
            const cosLimit = Math.cos(THREE.MathUtils.degToRad(p.angleLimit));
            const pos = geo.getAttribute("position");
            const n   = pos.count;

            // Compute per-triangle normals
            const triNormals = [];
            for (let i = 0; i < n; i += 3) {
                const a = new THREE.Vector3(pos.getX(i),   pos.getY(i),   pos.getZ(i));
                const b = new THREE.Vector3(pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1));
                const c = new THREE.Vector3(pos.getX(i+2), pos.getY(i+2), pos.getZ(i+2));
                triNormals.push(b.sub(a).cross(c.clone().sub(a)).normalize());
            }

            // Mark triangles to keep (those that are on a crease)
            const keep = new Uint8Array(n / 3).fill(1);
            // Build adjacency
            const posKey = (i) =>
                `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
            const edgeToFace = new Map();

            for (let tri = 0; tri < n / 3; tri++) {
                for (let e = 0; e < 3; e++) {
                    const ia = tri * 3 + e, ib = tri * 3 + (e + 1) % 3;
                    const ka = posKey(ia), kb = posKey(ib);
                    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
                    if (!edgeToFace.has(key)) edgeToFace.set(key, []);
                    edgeToFace.get(key).push(tri);
                }
            }

            for (const [, faces] of edgeToFace) {
                if (faces.length === 2) {
                    const dot = triNormals[faces[0]].dot(triNormals[faces[1]]);
                    if (dot >= cosLimit) {
                        // Near-coplanar: keep only first
                        keep[faces[1]] = 0;
                    }
                }
            }

            // Rebuild geometry from kept triangles
            const newPos = [];
            for (let tri = 0; tri < n / 3; tri++) {
                if (!keep[tri]) continue;
                for (let v = 0; v < 3; v++) {
                    const i = tri * 3 + v;
                    newPos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
                }
            }

            const result = new THREE.BufferGeometry();
            result.setAttribute("position", new THREE.Float32BufferAttribute(newPos, 3));
            result.computeVertexNormals();
            return result;
        }

        // ── QEM Edge-Collapse decimation ───────────────────────────────────────
        _qemDecimate(geo, p) {
            // Build indexed mesh
            const pos = geo.getAttribute("position");
            const n   = pos.count;

            // Deduplicate vertices
            const posMap = new Map();
            const verts  = [];  // {x, y, z, q: Matrix4x4 quadric}
            const tris   = [];  // [vi0, vi1, vi2]
            const vidxMap = []; // position.count → vertex index

            const pkey = (i) =>
                `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;

            for (let i = 0; i < n; i++) {
                const k = pkey(i);
                if (!posMap.has(k)) {
                    posMap.set(k, verts.length);
                    verts.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i), q: new Float64Array(16) });
                }
                vidxMap.push(posMap.get(k));
            }

            for (let i = 0; i < n; i += 3) {
                tris.push([vidxMap[i], vidxMap[i+1], vidxMap[i+2]]);
            }

            // Compute initial quadrics per vertex (sum of face plane quadrics)
            for (const [a, b, c] of tris) {
                const va = verts[a], vb = verts[b], vc = verts[c];
                const normal = new THREE.Vector3(
                    va.x - vb.x, va.y - vb.y, va.z - vb.z
                ).cross(new THREE.Vector3(vc.x - vb.x, vc.y - vb.y, vc.z - vb.z)).normalize();
                const d = -(normal.x * va.x + normal.y * va.y + normal.z * va.z);
                const plane = [normal.x, normal.y, normal.z, d];
                const K = this._planeQuadric(plane);
                this._addQ(va.q, K); this._addQ(vb.q, K); this._addQ(vc.q, K);
            }

            // Target triangle count
            const totalTris = tris.length;
            const targetTris = p.triangleCount > 0
                ? Math.min(p.triangleCount, totalTris)
                : Math.max(1, Math.floor(totalTris * p.ratio));

            if (targetTris >= totalTris) return geo;

            // Build edge heap: {cost, a, b, optimal}
            const edgeSet = new Map();
            const addEdge = (a, b) => {
                const key = a < b ? `${a}:${b}` : `${b}:${a}`;
                if (edgeSet.has(key)) return;
                const cost = this._edgeCost(verts[a], verts[b]);
                edgeSet.set(key, { a, b, cost, valid: true });
            };

            for (const [a, b, c] of tris) {
                addEdge(a, b); addEdge(b, c); addEdge(c, a);
            }

            let edges = [...edgeSet.values()].sort((x, y) => x.cost - y.cost);

            // Collapse cheapest edges until target is reached
            const collapsed = new Uint8Array(verts.length);  // merged-into tracking
            const triAlive  = new Uint8Array(tris.length).fill(1);
            let triAliveCount = totalTris;

            const getRoot = (v) => {
                while (collapsed[v] && collapsed[v] !== v) v = collapsed[v];
                return v;
            };

            let ei = 0;
            while (triAliveCount > targetTris && ei < edges.length) {
                const edge = edges[ei++];
                if (!edge.valid) continue;

                let { a, b } = edge;
                a = getRoot(a); b = getRoot(b);
                if (a === b) continue;

                // Merge b into a
                const va = verts[a], vb = verts[b];
                // Move a to optimal position (midpoint for simplicity)
                va.x = (va.x + vb.x) * 0.5;
                va.y = (va.y + vb.y) * 0.5;
                va.z = (va.z + vb.z) * 0.5;
                this._addQ(va.q, vb.q);
                collapsed[b] = a;

                // Deactivate degenerate triangles (those containing both a and b)
                for (let t = 0; t < tris.length; t++) {
                    if (!triAlive[t]) continue;
                    const tri = tris[t];
                    const ra = tri[0] === b ? a : tri[0] === a ? a : getRoot(tri[0]);
                    const rb = tri[1] === b ? a : tri[1] === a ? a : getRoot(tri[1]);
                    const rc = tri[2] === b ? a : tri[2] === a ? a : getRoot(tri[2]);
                    tri[0] = ra; tri[1] = rb; tri[2] = rc;
                    if (ra === rb || rb === rc || ra === rc) {
                        triAlive[t] = 0;
                        triAliveCount--;
                    }
                }
            }

            // Rebuild geometry from surviving triangles
            const newPos = [];
            for (let t = 0; t < tris.length; t++) {
                if (!triAlive[t]) continue;
                for (const vi of tris[t]) {
                    const v = verts[vi];
                    newPos.push(v.x, v.y, v.z);
                }
            }

            const result = new THREE.BufferGeometry();
            result.setAttribute("position", new THREE.Float32BufferAttribute(newPos, 3));
            result.computeVertexNormals();
            return result;
        }

        _planeQuadric(p) {
            const [a, b, c, d] = p;
            return new Float64Array([
                a*a, a*b, a*c, a*d,
                a*b, b*b, b*c, b*d,
                a*c, b*c, c*c, c*d,
                a*d, b*d, c*d, d*d
            ]);
        }

        _addQ(qa, qb) {
            for (let i = 0; i < 16; i++) qa[i] += qb[i];
        }

        _edgeCost(va, vb) {
            const mx = (va.x + vb.x) * 0.5, my = (va.y + vb.y) * 0.5, mz = (vb.z + va.z) * 0.5;
            const q = new Float64Array(16);
            for (let i = 0; i < 16; i++) q[i] = va.q[i] + vb.q[i];
            return this._evalQuadric(q, mx, my, mz);
        }

        _evalQuadric(q, x, y, z) {
            return (
                q[0]*x*x + 2*q[1]*x*y + 2*q[2]*x*z + 2*q[3]*x
                         +   q[5]*y*y + 2*q[6]*y*z + 2*q[7]*y
                                      +   q[10]*z*z + 2*q[11]*z
                                                    +   q[15]
            );
        }
    }

    root.DecimateModifier = DecimateModifier;
})();