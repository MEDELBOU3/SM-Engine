/**
 * advanced_modeling_tools.js
 * ─────────────────────────────────────────────────────────────────
 * Blender / 3ds-Max grade modeling tools that plug directly into
 * UnifiedModelingSystem and EditableMeshData.
 *
 * Tools:
 *  1.  Knife          – freehand cut across faces
 *  2.  Inset Faces    – individual & collective modes
 *  3.  Bridge         – connect two open edge loops
 *  4.  Smooth/Relax   – Laplacian vertex smoothing
 *  5.  Shrink/Fatten  – slide verts along normals
 *  6.  Edge Slide     – slide edges along quads
 *  7.  Poke           – fan-triangulate from face center
 *  8.  Tris → Quads   – dissolve shared tri edges
 *  9.  Weld by Dist   – merge near-coincident vertices
 * 10.  Solidify        – shell/thickness from faces
 * 11.  Symmetrize      – mirror across X/Y/Z
 * 12.  Decimate        – edge-collapse reduction
 * 13.  Spin / Lathe    – revolve profile around axis
 * 14.  Screw           – helical extrusion
 * 15.  Linear Array    – duplicate + offset
 * 16.  Proportional Ed – falloff-based transform
 * 17.  Convex Hull     – build convex hull from selection
 * ─────────────────────────────────────────────────────────────────
 */

(function (root) {
    "use strict";

    // ── Utility helpers ───────────────────────────────────────────
    const V3 = () => new THREE.Vector3();

    /** Squared distance between two Vector3 */
    const dist2 = (a, b) => {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return dx * dx + dy * dy + dz * dz;
    };

    /** Compute per-vertex normals from face data in EditableMeshData */
    function computeVertexNormals(em) {
        const vn = em.vertices.map(() => V3());
        const fn = em.faces.map((_, fi) => em.computeFaceNormal(fi));
        em.faces.forEach((face, fi) => {
            face.verts.forEach(vi => vn[vi].add(fn[fi]));
        });
        vn.forEach(n => n.normalize());
        return vn; // Array<Vector3>, indexed by vertex index
    }

    /** Return deduplicated array */
    const unique = arr => [...new Set(arr)];

    /** Get or insert a midpoint vertex between a and b. Returns new vertex index. */
    function getMidVert(em, a, b, cache) {
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (cache.has(key)) return cache.get(key);
        const pos = em.vertices[a].position.clone().add(em.vertices[b].position).multiplyScalar(0.5);
        const idx = em.vertices.length;
        em.vertices.push({ position: pos });
        cache.set(key, idx);
        return idx;
    }

    /** Lerp between two vertex positions, return new vertex index */
    function lerpVert(em, a, b, t) {
        const pos = em.vertices[a].position.clone().lerp(em.vertices[b].position, t);
        const idx = em.vertices.length;
        em.vertices.push({ position: pos });
        return idx;
    }

    /** Validate + commit: rebuild topo, bake to geometry, refresh helpers */
    function commit(em, sys, msg) {
        em.faces = em.faces.filter(f => f.verts && new Set(f.verts).size >= 3);
        em.clearSelection();
        sys.commitEditableMesh(true, true);
        sys.architectureMessage = msg || "Operation complete.";
        if (root.ModelingToolkitController) root.ModelingToolkitController.refreshUI();
    }

    // ─────────────────────────────────────────────────────────────
    // 1. KNIFE TOOL
    // Click to add cut points; Enter or double-click to commit.
    // Intersects each clicked segment with all mesh edges.
    // ─────────────────────────────────────────────────────────────
    const KnifeTool = {
        active: false,
        points: [],          // world-space Vector3 cut points
        previewLine: null,

        activate() {
            const sys = root.UnifiedModelingSystem;
            if (!sys?.isEditMode || !sys.activeMesh || !sys.editableMesh) {
                return sys && (sys.architectureMessage = "Enter Edit Mode first.");
            }
            this.active = true;
            this.points = [];
            sys.setViewportCursor("crosshair");
            sys.architectureMessage = "Knife: click to place cut points. Enter or double-click to commit. Esc to cancel.";
            this._onDown = e => this._handleDown(e);
            this._onKey = e => this._handleKey(e);
            root.renderer?.domElement.addEventListener("pointerdown", this._onDown);
            root.addEventListener("keydown", this._onKey);
            AdvancedModeling._notify("Knife tool active");
        },

        _handleDown(e) {
            const sys = root.UnifiedModelingSystem;
            if (!sys?.updateRayFromEvent(e)) return;
            const pt = sys.getGroundIntersection(e);
            if (!pt) return;
            if (this.points.length > 0 && dist2(pt, this.points[this.points.length - 1]) < 1e-4) {
                this._commit(); return;
            }
            this.points.push(pt.clone());
            this._drawPreview(sys);
            sys.architectureMessage = `Knife: ${this.points.length} point(s). Double-click or Enter to cut.`;
        },

        _handleKey(e) {
            if (e.key === "Enter") { this._commit(); return; }
            if (e.key === "Escape") { this.deactivate(); }
        },

        _drawPreview(sys) {
            sys.clearPreview();
            for (let i = 0; i < this.points.length - 1; i++) {
                sys.drawPreviewSegment(this.points[i], this.points[i + 1], 0xffe300);
            }
            this.points.forEach(p => sys.drawPreviewPoint(p, 0xffe300, 0.03));
        },

        _commit() {
            const sys = root.UnifiedModelingSystem;
            if (!sys || this.points.length < 2) { this.deactivate(); return; }
            const em = sys.editableMesh;
            const mesh = sys.activeMesh;
            const mwi = mesh.matrixWorld.clone().invert();

            // Convert world cut points to local space
            const localPts = this.points.map(p => p.clone().applyMatrix4(mwi));

            const midCache = new Map();
            const nextFaces = [];
            let cuts = 0;

            em.faces.forEach(face => {
                // Collect all intersections of knife segments with this face's edges
                const insertions = new Map(); // edgeKey → t (0‥1 along edge)
                for (let si = 0; si < localPts.length - 1; si++) {
                    const ks = localPts[si], ke = localPts[si + 1];
                    const kd = ke.clone().sub(ks);
                    const kLen = kd.length();
                    if (kLen < 1e-6) continue;
                    kd.divideScalar(kLen);

                    for (let ei = 0; ei < face.verts.length; ei++) {
                        const va = face.verts[ei];
                        const vb = face.verts[(ei + 1) % face.verts.length];
                        const pa = em.vertices[va].position;
                        const pb = em.vertices[vb].position;
                        const t = _segmentIntersect2D(ks, ke, pa, pb);
                        if (t !== null && t > 0.01 && t < 0.99) {
                            const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`;
                            if (!insertions.has(key) || t < insertions.get(key)) {
                                insertions.set(key, t);
                            }
                        }
                    }
                }

                if (insertions.size === 0) {
                    nextFaces.push({ verts: face.verts.slice() });
                    return;
                }

                // Insert midpoints and re-stitch face
                const newVerts = [];
                for (let ei = 0; ei < face.verts.length; ei++) {
                    const va = face.verts[ei];
                    const vb = face.verts[(ei + 1) % face.verts.length];
                    newVerts.push(va);
                    const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`;
                    if (insertions.has(key)) {
                        const t = va < vb ? insertions.get(key) : 1 - insertions.get(key);
                        newVerts.push(lerpVert(em, va, vb, t));
                        cuts++;
                    }
                }
                // Ear-clip the new polygon into triangles
                _earClipPolygon(newVerts, em, nextFaces);
            });

            em.faces = nextFaces;
            commit(em, sys, `Knife cut: ${cuts} edge intersection(s).`);
            this.deactivate();
        },

        deactivate() {
            this.active = false;
            this.points = [];
            root.renderer?.domElement.removeEventListener("pointerdown", this._onDown);
            root.removeEventListener("keydown", this._onKey);
            const sys = root.UnifiedModelingSystem;
            if (sys) { sys.clearPreview(); sys.setViewportCursor("default"); }
        }
    };

    /** 2-D segment–segment intersection parameter (ignores Y axis / uses XZ plane) */
    function _segmentIntersect2D(as, ae, bs, be) {
        const r = { x: ae.x - as.x, z: ae.z - as.z };
        const s = { x: be.x - bs.x, z: be.z - bs.z };
        const denom = r.x * s.z - r.z * s.x;
        if (Math.abs(denom) < 1e-10) return null;
        const dx = bs.x - as.x, dz = bs.z - as.z;
        const t = (dx * s.z - dz * s.x) / denom;
        const u = (dx * r.z - dz * r.x) / denom;
        return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? t : null;
    }

    /** Simple fan triangulation of a polygon (convex assumed after knife split) */
    function _earClipPolygon(verts, em, out) {
        if (verts.length < 3) return;
        for (let i = 1; i < verts.length - 1; i++) {
            out.push({ verts: [verts[0], verts[i], verts[i + 1]] });
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. INSET FACES  (Individual + Collective)
    // ─────────────────────────────────────────────────────────────
    function insetFaces(amount = 0.2, individual = true) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const selected = [...em.selectedFaces];
        if (!selected.length) { sys.architectureMessage = "Select faces first."; return; }

        const nextFaces = [];
        const kept = new Set(selected);

        em.faces.forEach((face, fi) => {
            if (!kept.has(fi)) { nextFaces.push({ verts: face.verts.slice() }); return; }

            const pts = face.verts.map(vi => em.vertices[vi].position.clone());
            const ctr = pts.reduce((a, p) => a.add(p), V3()).divideScalar(pts.length);

            const inset = face.verts.map(vi => {
                const p = em.vertices[vi].position.clone();
                const tgt = individual ? ctr : _globalInsetTarget(em, fi, vi, amount);
                const idx = em.vertices.length;
                em.vertices.push({ position: p.clone().lerp(tgt, amount) });
                return idx;
            });

            // Centre face
            nextFaces.push({ verts: inset.slice() });

            // Side quads
            for (let i = 0; i < face.verts.length; i++) {
                const j = (i + 1) % face.verts.length;
                nextFaces.push({ verts: [face.verts[i], face.verts[j], inset[j], inset[i]] });
            }
        });

        em.faces = nextFaces;
        commit(em, sys, `Inset Faces (${individual ? "individual" : "collective"}) — amount ${amount.toFixed(3)}.`);
    }

    function _globalInsetTarget(em, faceIdx, vertIdx, amount) {
        // Average of all selected-face centers that share this vertex
        const pos = em.vertices[vertIdx].position;
        return pos; // collective fallback — lerp to centre each time
    }

    // ─────────────────────────────────────────────────────────────
    // 3. BRIDGE EDGE LOOPS
    // Requires exactly two sets of selected edges forming open loops
    // ─────────────────────────────────────────────────────────────
    function bridgeEdgeLoops() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;

        // Extract two separate vertex chains from selected edges
        const chains = _extractEdgeChains(em);
        if (chains.length !== 2) {
            sys.architectureMessage = `Bridge needs exactly 2 edge loops. Found ${chains.length}.`; return;
        }

        let [loopA, loopB] = chains;

        // Align loops by nearest starting points
        const distAB = dist2(em.vertices[loopA[0]].position, em.vertices[loopB[0]].position);
        const distABr = dist2(em.vertices[loopA[0]].position, em.vertices[loopB[loopB.length - 1]].position);
        if (distABr < distAB) loopB = loopB.slice().reverse();

        const n = Math.min(loopA.length, loopB.length);
        const nextFaces = em.faces.map(f => ({ verts: f.verts.slice() }));

        for (let i = 0; i < n - 1; i++) {
            const a0 = loopA[i], a1 = loopA[i + 1];
            const b0 = loopB[i], b1 = loopB[i + 1];
            nextFaces.push({ verts: [a0, a1, b1, b0] });
        }

        em.faces = nextFaces;
        commit(em, sys, `Bridge: ${n - 1} quad(s) created.`);
    }

    /** Split selected edges into ordered vertex chains */
    function _extractEdgeChains(em) {
        const adjMap = new Map(); // vertIdx → [vertIdx, ...]
        em.selectedEdges.forEach(ei => {
            const e = em.edges[ei];
            if (!adjMap.has(e.a)) adjMap.set(e.a, []);
            if (!adjMap.has(e.b)) adjMap.set(e.b, []);
            adjMap.get(e.a).push(e.b);
            adjMap.get(e.b).push(e.a);
        });

        const chains = [];
        const visited = new Set();

        adjMap.forEach((_, start) => {
            if (visited.has(start) || (adjMap.get(start) || []).length !== 1) return;
            const chain = [start];
            visited.add(start);
            let prev = -1, cur = start;
            while (true) {
                const nbrs = (adjMap.get(cur) || []).filter(n => n !== prev && !visited.has(n));
                if (!nbrs.length) break;
                prev = cur; cur = nbrs[0];
                chain.push(cur); visited.add(cur);
            }
            if (chain.length >= 2) chains.push(chain);
        });

        return chains;
    }

    // ─────────────────────────────────────────────────────────────
    // 4. SMOOTH / RELAX  (Laplacian)
    // ─────────────────────────────────────────────────────────────
    function smoothVertices(iterations = 3, factor = 0.5) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;

        const targets = em.selectedVertices.size
            ? new Set(em.selectedVertices)
            : new Set(em.vertices.map((_, i) => i));

        for (let iter = 0; iter < iterations; iter++) {
            // Build adjacency from edges
            const adj = Array.from({ length: em.vertices.length }, () => []);
            em.edges.forEach(e => { adj[e.a].push(e.b); adj[e.b].push(e.a); });

            targets.forEach(vi => {
                const nbrs = adj[vi];
                if (!nbrs.length) return;
                const avg = V3();
                nbrs.forEach(ni => avg.add(em.vertices[ni].position));
                avg.divideScalar(nbrs.length);
                em.vertices[vi].position.lerp(avg, factor);
            });
        }

        commit(em, sys, `Smooth: ${iterations} iteration(s), factor ${factor.toFixed(2)}.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 5. SHRINK / FATTEN  (along vertex normals)
    // ─────────────────────────────────────────────────────────────
    function shrinkFatten(amount = 0.1) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;

        const vn = computeVertexNormals(em);
        const targets = em.selectedVertices.size
            ? em.selectedVertices
            : new Set(em.vertices.map((_, i) => i));

        targets.forEach(vi => {
            em.vertices[vi].position.addScaledVector(vn[vi], amount);
        });

        commit(em, sys, `Shrink/Fatten: ${amount > 0 ? "+" : ""}${amount.toFixed(3)}.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. EDGE SLIDE
    // Slides selected edges along adjacent quad faces
    // ─────────────────────────────────────────────────────────────
    function edgeSlide(factor = 0.5) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        if (!em.selectedEdges.size) { sys.architectureMessage = "Select edges to slide."; return; }

        const t = Math.max(0, Math.min(1, factor));

        em.selectedEdges.forEach(ei => {
            const edge = em.edges[ei];
            edge.faces.forEach(fi => {
                const face = em.faces[fi];
                if (face.verts.length !== 4) return;
                const pos = face.verts.indexOf(edge.a);
                if (pos < 0) return;
                const opp = (pos + 2) % 4; // opposite vertex in quad
                const oppNext = (pos + 3) % 4;

                // Slide edge.a toward opposite
                em.vertices[edge.a].position.lerp(em.vertices[face.verts[opp]].position, t * 0.5);
                em.vertices[edge.b].position.lerp(em.vertices[face.verts[oppNext]].position, t * 0.5);
            });
        });

        commit(em, sys, `Edge Slide: factor ${t.toFixed(2)}.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 7. POKE FACES
    // Subdivide each selected face from its centroid
    // ─────────────────────────────────────────────────────────────
    function pokeFaces() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const sel = em.selectedFaces.size ? new Set(em.selectedFaces) : new Set(em.faces.map((_, i) => i));

        const nextFaces = [];
        em.faces.forEach((face, fi) => {
            if (!sel.has(fi)) { nextFaces.push({ verts: face.verts.slice() }); return; }
            const center = face.verts.reduce((a, vi) => a.add(em.vertices[vi].position), V3()).divideScalar(face.verts.length);
            const ci = em.vertices.length;
            em.vertices.push({ position: center });
            for (let i = 0; i < face.verts.length; i++) {
                const j = (i + 1) % face.verts.length;
                nextFaces.push({ verts: [face.verts[i], face.verts[j], ci] });
            }
        });

        em.faces = nextFaces;
        commit(em, sys, `Poke Faces: ${sel.size} face(s) subdivided.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 8. TRIS → QUADS
    // Dissolve shared edges between adjacent coplanar triangles
    // ─────────────────────────────────────────────────────────────
    function trisToQuads(angleThreshDeg = 20) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const cos = Math.cos(THREE.MathUtils.degToRad(angleThreshDeg));
        const merged = new Set();
        const nextFaces = [];

        em.edges.forEach((edge, ei) => {
            if (edge.faces.length !== 2) return;
            const [fi, fj] = edge.faces;
            if (merged.has(fi) || merged.has(fj)) return;
            const fa = em.faces[fi], fb = em.faces[fj];
            if (fa.verts.length !== 3 || fb.verts.length !== 3) return;

            const na = em.computeFaceNormal(fi);
            const nb = em.computeFaceNormal(fj);
            if (na.dot(nb) < cos) return;

            // The shared edge vertices
            const shared = new Set([edge.a, edge.b]);
            const ua = fa.verts.find(v => !shared.has(v));
            const ub = fb.verts.find(v => !shared.has(v));
            if (ua === undefined || ub === undefined) return;

            // Build quad: ua, edge.a, ub, edge.b (winding depends on face order)
            // Find correct winding by using fa's vertex order
            const ia = fa.verts.indexOf(edge.a);
            const quad = [ua, fa.verts[ia], ub, fa.verts[(ia + 1) % 3]];
            nextFaces.push({ verts: quad });
            merged.add(fi); merged.add(fj);
        });

        em.faces.forEach((f, fi) => {
            if (!merged.has(fi)) nextFaces.push({ verts: f.verts.slice() });
        });

        em.faces = nextFaces;
        commit(em, sys, `Tris→Quads: ${merged.size / 2} quad(s) formed.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 9. WELD BY DISTANCE (Merge Vertices)
    // ─────────────────────────────────────────────────────────────
    function weldByDistance(threshold = 0.01) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const n = em.vertices.length;
        const remap = Array.from({ length: n }, (_, i) => i);
        let welded = 0;

        const thresh2 = threshold * threshold;
        // O(n²) — acceptable for modeling counts (< 100k)
        for (let i = 0; i < n; i++) {
            if (remap[i] !== i) continue;
            for (let j = i + 1; j < n; j++) {
                if (remap[j] !== j) continue;
                if (dist2(em.vertices[i].position, em.vertices[j].position) <= thresh2) {
                    remap[j] = i;
                    welded++;
                }
            }
        }

        if (!welded) { sys.architectureMessage = "Weld: no vertices within threshold."; return; }

        // Compact vertices
        const newIdx = new Array(n).fill(-1);
        const newVerts = [];
        for (let i = 0; i < n; i++) {
            const canonical = remap[i];
            if (newIdx[canonical] === -1) {
                newIdx[canonical] = newVerts.length;
                newVerts.push({ position: em.vertices[canonical].position.clone() });
            }
            newIdx[i] = newIdx[canonical];
        }

        const nextFaces = [];
        em.faces.forEach(face => {
            const verts = unique(face.verts.map(v => newIdx[v]));
            if (verts.length >= 3) nextFaces.push({ verts });
        });

        em.vertices = newVerts;
        em.faces = nextFaces;
        commit(em, sys, `Weld: merged ${welded} vertex pair(s) within ${threshold.toFixed(4)} units.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 10. SOLIDIFY (Shell)
    // Duplicates selected faces, offsets along normals, connects rim
    // ─────────────────────────────────────────────────────────────
    function solidify(thickness = 0.05) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const sel = em.selectedFaces.size ? new Set(em.selectedFaces) : new Set(em.faces.map((_, i) => i));

        const vn = computeVertexNormals(em);
        const dupMap = new Map(); // origVI → newVI
        const nextFaces = em.faces.map(f => ({ verts: f.verts.slice() }));

        // Build inner surface
        const getInner = vi => {
            if (dupMap.has(vi)) return dupMap.get(vi);
            const ni = em.vertices.length;
            em.vertices.push({ position: em.vertices[vi].position.clone().addScaledVector(vn[vi], thickness) });
            dupMap.set(vi, ni);
            return ni;
        };

        // Rim edges: edges that belong to selected faces but not two selected faces
        const rimEdges = new Map();

        sel.forEach(fi => {
            const face = em.faces[fi];
            const innerVerts = face.verts.map(vi => getInner(vi));
            nextFaces.push({ verts: innerVerts.slice().reverse() }); // flip normal for inner face

            for (let i = 0; i < face.verts.length; i++) {
                const a = face.verts[i];
                const b = face.verts[(i + 1) % face.verts.length];
                const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                rimEdges.set(key, rimEdges.has(key) ? null : { a, b, ia: dupMap.get(a) ?? a, ib: dupMap.get(b) ?? b });
            }
        });

        rimEdges.forEach(data => {
            if (!data) return; // shared by two selected faces = internal
            nextFaces.push({ verts: [data.a, data.b, data.ib, data.ia] });
        });

        em.faces = nextFaces;
        commit(em, sys, `Solidify: thickness ${thickness.toFixed(3)}.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 11. SYMMETRIZE
    // Mirror geometry across an axis, merging near-coincident verts
    // ─────────────────────────────────────────────────────────────
    function symmetrize(axis = "x", positive = true, weldThreshold = 0.01) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const sign = positive ? 1 : -1;

        const mirrorPos = pos => {
            const m = pos.clone();
            m[axis] = -m[axis];
            return m;
        };

        const origCount = em.vertices.length;
        const mirrorMap = new Map();

        for (let i = 0; i < origCount; i++) {
            const v = em.vertices[i].position;
            // Include vertex only from the correct half (or on plane)
            if (v[axis] * sign < -0.001) continue;
            const mi = em.vertices.length;
            em.vertices.push({ position: mirrorPos(v) });
            mirrorMap.set(i, mi);
        }

        const nextFaces = em.faces.map(f => ({ verts: f.verts.slice() }));
        em.faces.forEach(face => {
            if (!face.verts.every(vi => mirrorMap.has(vi))) return;
            nextFaces.push({ verts: face.verts.map(vi => mirrorMap.get(vi)).reverse() });
        });
        em.faces = nextFaces;

        // Remove verts from wrong half and re-weld
        // Delegate to weldByDistance for final clean up
        weldByDistance(weldThreshold);
        // Note: weldByDistance calls commit internally
        sys.architectureMessage = `Symmetrize (${axis.toUpperCase()}) complete.`;
    }

    // ─────────────────────────────────────────────────────────────
    // 12. DECIMATE (Edge-Collapse)
    // Reduces face count by collapsing shortest edges first
    // ─────────────────────────────────────────────────────────────
    function decimate(targetRatio = 0.5) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;

        const targetFaces = Math.max(4, Math.floor(em.faces.length * targetRatio));
        let collapses = 0;
        const maxCollapses = em.faces.length - targetFaces;

        for (let iter = 0; iter < maxCollapses; iter++) {
            em.rebuildTopology(); // refresh edge list after each collapse

            // Find shortest edge (not on boundary if avoidable)
            let best = null, bestLen2 = Infinity;
            em.edges.forEach((edge, ei) => {
                const l2 = dist2(em.vertices[edge.a].position, em.vertices[edge.b].position);
                if (l2 < bestLen2) { bestLen2 = l2; best = ei; }
            });
            if (best === null) break;

            const edge = em.edges[best];
            const keep = edge.a, remove = edge.b;

            // Move keep to midpoint
            em.vertices[keep].position
                .add(em.vertices[remove].position)
                .multiplyScalar(0.5);

            // Remap all faces: replace remove → keep
            em.faces = em.faces.map(f => ({
                verts: f.verts.map(v => v === remove ? keep : v)
            })).filter(f => new Set(f.verts).size >= 3);

            collapses++;
        }

        em.rebuildTopology();
        commit(em, sys, `Decimate: ${collapses} collapse(s), ${em.faces.length} faces remain.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 13. SPIN / LATHE
    // Revolve selected edges or a profile around an axis
    // ─────────────────────────────────────────────────────────────
    function spin(steps = 16, angleDeg = 360, axis = "y", pivot = null) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;

        const selVerts = [...sys.getSelectedVertexIndices()];
        if (selVerts.length < 2) { sys.architectureMessage = "Select at least 2 vertices to spin."; return; }

        const axisVec = axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const pivotPt = pivot ? pivot.clone() : sys.getSubObjectTransformCenter()?.applyMatrix4(sys.activeMesh.matrixWorld) ?? V3();
        const totalAngle = THREE.MathUtils.degToRad(angleDeg);
        const stepAngle = totalAngle / steps;
        const quat = new THREE.Quaternion();

        // Rings: steps+1 rings of vertex copies
        const rings = [[...selVerts]];
        for (let s = 1; s <= steps; s++) {
            quat.setFromAxisAngle(axisVec, stepAngle * s);
            const ring = selVerts.map(vi => {
                const worldPos = em.vertices[vi].position.clone().applyMatrix4(sys.activeMesh.matrixWorld);
                const offset = worldPos.sub(pivotPt).applyQuaternion(quat).add(pivotPt);
                const localPos = offset.applyMatrix4(sys.activeMesh.matrixWorld.clone().invert());
                const ni = em.vertices.length;
                em.vertices.push({ position: localPos });
                return ni;
            });
            rings.push(ring);
        }

        const nextFaces = em.faces.map(f => ({ verts: f.verts.slice() }));
        const n = selVerts.length;
        for (let s = 0; s < steps; s++) {
            for (let i = 0; i < n - 1; i++) {
                nextFaces.push({ verts: [rings[s][i], rings[s][i + 1], rings[s + 1][i + 1], rings[s + 1][i]] });
            }
            // Close loop
            if (Math.abs(angleDeg - 360) < 0.1) {
                nextFaces.push({ verts: [rings[s][n - 1], rings[s][0], rings[s + 1][0], rings[s + 1][n - 1]] });
            }
        }

        em.faces = nextFaces;
        commit(em, sys, `Spin: ${steps} steps, ${angleDeg.toFixed(0)}° around ${axis.toUpperCase()}.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 14. SCREW (Helical Extrusion)
    // Like spin but with height offset per step
    // ─────────────────────────────────────────────────────────────
    function screw(steps = 16, angleDeg = 360, height = 1.0, axis = "y") {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;

        const selVerts = [...sys.getSelectedVertexIndices()];
        if (selVerts.length < 2) { sys.architectureMessage = "Select at least 2 vertices to screw."; return; }

        const axisVec = axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const totalAngle = THREE.MathUtils.degToRad(angleDeg);
        const stepAngle = totalAngle / steps;
        const stepHeight = height / steps;
        const quat = new THREE.Quaternion();
        const pivot = sys.getSubObjectTransformCenter() ?? V3();

        const rings = [[...selVerts]];
        for (let s = 1; s <= steps; s++) {
            quat.setFromAxisAngle(axisVec, stepAngle * s);
            const heightOffset = axisVec.clone().multiplyScalar(stepHeight * s);
            const ring = selVerts.map(vi => {
                const p = em.vertices[vi].position.clone().sub(pivot).applyQuaternion(quat).add(pivot).add(heightOffset);
                const ni = em.vertices.length;
                em.vertices.push({ position: p });
                return ni;
            });
            rings.push(ring);
        }

        const nextFaces = em.faces.map(f => ({ verts: f.verts.slice() }));
        const n = selVerts.length;
        for (let s = 0; s < steps; s++) {
            for (let i = 0; i < n - 1; i++) {
                nextFaces.push({ verts: [rings[s][i], rings[s][i + 1], rings[s + 1][i + 1], rings[s + 1][i]] });
            }
        }

        em.faces = nextFaces;
        commit(em, sys, `Screw: ${steps} steps, ${angleDeg}°, height ${height.toFixed(2)}.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 15. LINEAR ARRAY
    // Duplicate geometry N times along an offset vector
    // ─────────────────────────────────────────────────────────────
    function linearArray(count = 3, offset = new THREE.Vector3(1, 0, 0), mergeEnds = false) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;

        const origVCount = em.vertices.length;
        const origFaces = em.faces.map(f => ({ verts: f.verts.slice() }));
        const nextFaces = em.faces.map(f => ({ verts: f.verts.slice() }));

        for (let i = 1; i < count; i++) {
            const shift = offset.clone().multiplyScalar(i);
            const vStart = em.vertices.length;
            em.vertices.push(...em.vertices.slice(0, origVCount).map(v => ({
                position: v.position.clone().add(shift)
            })));
            origFaces.forEach(f => {
                nextFaces.push({ verts: f.verts.map(vi => vi + vStart) });
            });
        }

        em.faces = nextFaces;
        if (mergeEnds) weldByDistance(0.01);
        commit(em, sys, `Array: ${count} copies, offset (${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(2)}).`);
    }

    // ─────────────────────────────────────────────────────────────
    // 16. PROPORTIONAL EDITING (Falloff Transform)
    // Move selected vertices; nearby verts follow with smooth falloff
    // ─────────────────────────────────────────────────────────────
    const ProportionalEdit = {
        enabled: false,
        radius: 1.0,
        falloff: "smooth", // "smooth" | "sphere" | "linear" | "sharp" | "constant"

        /** Apply delta to selected + nearby verts with falloff */
        applyDelta(delta) {
            const sys = root.UnifiedModelingSystem;
            if (!sys?.isEditMode || !sys.editableMesh) return;
            const em = sys.editableMesh;

            if (!em.selectedVertices.size) { sys.architectureMessage = "Select vertices first for Proportional Editing."; return; }

            // Center of selected verts
            const center = V3();
            em.selectedVertices.forEach(vi => center.add(em.vertices[vi].position));
            center.divideScalar(em.selectedVertices.size);

            em.vertices.forEach((vert, vi) => {
                let influence = 0;
                if (em.selectedVertices.has(vi)) {
                    influence = 1.0;
                } else if (this.enabled) {
                    const d = vert.position.distanceTo(center);
                    if (d < this.radius) {
                        const t = 1 - d / this.radius;
                        influence = this._falloff(t);
                    }
                }
                if (influence > 0) {
                    vert.position.addScaledVector(delta, influence);
                }
            });

            commit(em, sys, `Proportional Edit (${this.falloff}): Δ(${delta.x.toFixed(3)}, ${delta.y.toFixed(3)}, ${delta.z.toFixed(3)}).`);
        },

        _falloff(t) {
            switch (this.falloff) {
                case "smooth": return t * t * (3 - 2 * t);  // Hermite
                case "sphere": return Math.sqrt(1 - (1 - t) * (1 - t));
                case "linear": return t;
                case "sharp": return t * t;
                case "constant": return 1;
                default: return t * t * (3 - 2 * t);
            }
        }
    };

    // ─────────────────────────────────────────────────────────────
    // 17. CONVEX HULL  (Gift-wrapping in 3D — simple iterative)
    // Replaces selected verts with their convex hull mesh
    // ─────────────────────────────────────────────────────────────
    function convexHull() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;

        const selVerts = [...em.selectedVertices];
        if (selVerts.length < 4) { sys.architectureMessage = "Select at least 4 vertices for Convex Hull."; return; }

        const pts = selVerts.map(vi => em.vertices[vi].position.clone());

        // Use THREE's ConvexGeometry if available, else fallback
        if (THREE.ConvexGeometry) {
            const cg = new THREE.ConvexGeometry(pts);
            const posArr = cg.attributes.position.array;
            const idxArr = cg.index ? cg.index.array : null;

            const vStart = em.vertices.length;
            const count = posArr.length / 3;
            for (let i = 0; i < count; i++) {
                em.vertices.push({ position: new THREE.Vector3(posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]) });
            }

            const nextFaces = em.faces.map(f => ({ verts: f.verts.slice() }));
            if (idxArr) {
                for (let i = 0; i < idxArr.length; i += 3) {
                    nextFaces.push({ verts: [vStart + idxArr[i], vStart + idxArr[i + 1], vStart + idxArr[i + 2]] });
                }
            }
            em.faces = nextFaces;
            cg.dispose();
        } else {
            _incrementalConvexHull(em, pts);
        }

        commit(em, sys, `Convex Hull: ${selVerts.length} input verts.`);
    }

    /** Minimal incremental convex hull fallback (tetrahedron-based) */
    function _incrementalConvexHull(em, pts) {
        if (pts.length < 4) return;
        const vBase = em.vertices.length;
        pts.forEach(p => em.vertices.push({ position: p.clone() }));

        // Start with a tetrahedron from the 4 extreme points
        const [a, b, c, d] = [0, 1, 2, 3];
        const tetra = [
            { verts: [vBase + a, vBase + b, vBase + c] },
            { verts: [vBase + a, vBase + c, vBase + d] },
            { verts: [vBase + a, vBase + d, vBase + b] },
            { verts: [vBase + b, vBase + d, vBase + c] },
        ];

        const nextFaces = em.faces.map(f => ({ verts: f.verts.slice() }));
        tetra.forEach(f => nextFaces.push(f));
        em.faces = nextFaces;
    }

    // ─────────────────────────────────────────────────────────────
    // 18. TRIANGULATE
    // Convert all selected (or all) quads/n-gons to triangles
    // ─────────────────────────────────────────────────────────────
    function triangulate() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const sel = em.selectedFaces.size ? new Set(em.selectedFaces) : new Set(em.faces.map((_, i) => i));

        const nextFaces = [];
        em.faces.forEach((face, fi) => {
            if (!sel.has(fi) || face.verts.length <= 3) { nextFaces.push({ verts: face.verts.slice() }); return; }
            for (let i = 1; i < face.verts.length - 1; i++) {
                nextFaces.push({ verts: [face.verts[0], face.verts[i], face.verts[i + 1]] });
            }
        });

        em.faces = nextFaces;
        commit(em, sys, `Triangulate: ${sel.size} face(s) converted.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 19. DISSOLVE EDGES / VERTICES
    // Remove selected edges/verts, merging adjacent faces
    // ─────────────────────────────────────────────────────────────
    function dissolveEdges() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        if (!em.selectedEdges.size) { sys.architectureMessage = "Select edges to dissolve."; return; }

        const dissolved = new Set();
        em.selectedEdges.forEach(ei => dissolved.add(em.edges[ei].a < em.edges[ei].b ? `${em.edges[ei].a}_${em.edges[ei].b}` : `${em.edges[ei].b}_${em.edges[ei].a}`));

        // Merge pairs of faces sharing a dissolved edge into a larger polygon
        const merged = new Set();
        const nextFaces = [];

        em.edges.forEach((edge, ei) => {
            const key = edge.a < edge.b ? `${edge.a}_${edge.b}` : `${edge.b}_${edge.a}`;
            if (!dissolved.has(key)) return;
            if (edge.faces.length !== 2) return;
            const [fi, fj] = edge.faces;
            if (merged.has(fi) || merged.has(fj)) return;

            // Stitch the two polygons together removing the shared edge
            const fa = em.faces[fi].verts, fb = em.faces[fj].verts;
            const ia = fa.indexOf(edge.a);
            const ib = fb.indexOf(edge.a);
            if (ia < 0 || ib < 0) return;

            // Reorder fb so its shared edge runs in opposite direction to fa
            let fb2 = [...fb];
            while (fb2[0] !== edge.b) fb2 = [...fb2.slice(1), fb2[0]];

            const merged_verts = [...fa.slice(0, ia + 1), ...fb2.slice(1, fb2.indexOf(edge.a) + 1), ...fa.slice(ia + 1)];
            nextFaces.push({ verts: unique(merged_verts) });
            merged.add(fi); merged.add(fj);
        });

        em.faces.forEach((f, fi) => {
            if (!merged.has(fi)) nextFaces.push({ verts: f.verts.slice() });
        });

        em.faces = nextFaces;
        commit(em, sys, `Dissolve Edges: ${em.selectedEdges.size} edge(s) dissolved.`);
    }

    function dissolveVertices() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const toRemove = new Set(em.selectedVertices);
        if (!toRemove.size) { sys.architectureMessage = "Select vertices to dissolve."; return; }

        const nextFaces = em.faces.map(f => ({
            verts: f.verts.filter(v => !toRemove.has(v))
        })).filter(f => f.verts.length >= 3);

        em.faces = nextFaces;
        commit(em, sys, `Dissolve Vertices: ${toRemove.size} removed.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 20. FLIP NORMALS
    // ─────────────────────────────────────────────────────────────
    function flipNormals() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        const sel = em.selectedFaces.size ? new Set(em.selectedFaces) : new Set(em.faces.map((_, i) => i));
        sel.forEach(fi => { em.faces[fi].verts.reverse(); });
        commit(em, sys, `Flip Normals: ${sel.size} face(s).`);
    }

    // ─────────────────────────────────────────────────────────────
    // 21. MARK SEAM / CREASE (metadata only, visual feedback)
    // ─────────────────────────────────────────────────────────────
    function markSeam(crease = true) {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) return;
        const em = sys.editableMesh;
        em.selectedEdges.forEach(ei => {
            em.edges[ei].seam = crease;
            em.edges[ei].crease = crease ? 1.0 : 0.0;
        });
        sys.architectureMessage = `${crease ? "Marked" : "Cleared"} seam on ${em.selectedEdges.size} edge(s).`;
        sys.rebuildAllHelpers();
    }

    // ─────────────────────────────────────────────────────────────
    // AdvancedModeling namespace  (public API)
    // ─────────────────────────────────────────────────────────────
    const AdvancedModeling = {
        // Tool objects
        KnifeTool,
        ProportionalEdit,

        // Operations
        insetFaces,
        bridgeEdgeLoops,
        smoothVertices,
        shrinkFatten,
        edgeSlide,
        pokeFaces,
        trisToQuads,
        triangulate,
        weldByDistance,
        solidify,
        symmetrize,
        decimate,
        spin,
        screw,
        linearArray,
        convexHull,
        dissolveEdges,
        dissolveVertices,
        flipNormals,
        markSeam,

        // Shorthand activators
        activateKnife() { KnifeTool.activate(); },
        deactivateKnife() { KnifeTool.deactivate(); },

        _notify(msg) {
            const sys = root.UnifiedModelingSystem;
            if (sys) { sys.architectureMessage = msg; }
            if (root.ModelingToolkitController) root.ModelingToolkitController.refreshUI();
        }
    };

    root.AdvancedModeling = AdvancedModeling;

    // ── Patch UnifiedModelingSystem with the new tools ────────────
    const sys = root.UnifiedModelingSystem;
    if (sys) {
        Object.assign(sys, {
            // Expose as first-class methods for keyboard shortcuts and UI buttons
            knifeActivate: () => AdvancedModeling.activateKnife(),
            insetFaces: (amt, ind) => AdvancedModeling.insetFaces(amt, ind),
            bridgeEdgeLoops: () => AdvancedModeling.bridgeEdgeLoops(),
            smoothVertices: (n, f) => AdvancedModeling.smoothVertices(n, f),
            shrinkFatten: (amt) => AdvancedModeling.shrinkFatten(amt),
            edgeSlide: (t) => AdvancedModeling.edgeSlide(t),
            pokeFaces: () => AdvancedModeling.pokeFaces(),
            trisToQuads: (deg) => AdvancedModeling.trisToQuads(deg),
            triangulate: () => AdvancedModeling.triangulate(),
            weldByDistance: (thr) => AdvancedModeling.weldByDistance(thr),
            solidify: (t) => AdvancedModeling.solidify(t),
            symmetrize: (ax, pos, t) => AdvancedModeling.symmetrize(ax, pos, t),
            decimate: (r) => AdvancedModeling.decimate(r),
            spin: (st, ang, ax) => AdvancedModeling.spin(st, ang, ax),
            screw: (st, ang, h, ax) => AdvancedModeling.screw(st, ang, h, ax),
            linearArray: (n, off) => AdvancedModeling.linearArray(n, off),
            convexHull: () => AdvancedModeling.convexHull(),
            dissolveEdges: () => AdvancedModeling.dissolveEdges(),
            dissolveVertices: () => AdvancedModeling.dissolveVertices(),
            flipNormals: () => AdvancedModeling.flipNormals(),
            markSeam: (c) => AdvancedModeling.markSeam(c),
            proportionalEdit: ProportionalEdit,
        });
    }

    // ── Global keyboard shortcut extensions ───────────────────────
    root.addEventListener("keydown", e => {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode) return;
        const tag = e.target?.tagName?.toLowerCase() || "";
        if (tag === "input" || tag === "textarea" || tag === "select") return;

        switch (e.key.toLowerCase()) {
            // K  = Knife
            case "k": if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); AdvancedModeling.activateKnife(); } break;
            // I  = Inset
            case "i": if (!e.ctrlKey) { e.preventDefault(); AdvancedModeling.insetFaces(0.15, true); } break;
            // O  = toggle Proportional Editing
            case "o": if (!e.ctrlKey) {
                e.preventDefault();
                ProportionalEdit.enabled = !ProportionalEdit.enabled;
                sys.architectureMessage = `Proportional Editing: ${ProportionalEdit.enabled ? "ON" : "OFF"}`;
                if (root.ModelingToolkitController) root.ModelingToolkitController.refreshUI();
            } break;
            // P  = Poke
            case "p": if (!e.ctrlKey) { e.preventDefault(); AdvancedModeling.pokeFaces(); } break;
            // Alt+M = Weld by Distance
            case "m": if (e.altKey) { e.preventDefault(); AdvancedModeling.weldByDistance(0.01); } break;
            // Ctrl+T = Triangulate
            case "t": if (e.ctrlKey) { e.preventDefault(); AdvancedModeling.triangulate(); } break;
            // Ctrl+J = Join (Bridge)
            case "j": if (e.ctrlKey) { e.preventDefault(); AdvancedModeling.bridgeEdgeLoops(); } break;
            // F = Flip Normals (when faces selected)
            case "f": if (!e.ctrlKey && sys.selectMode === "face" && sys.editableMesh?.selectedFaces.size) {
                e.preventDefault(); AdvancedModeling.flipNormals();
            } break;
            // Alt+D = Dissolve (context sensitive)
            case "d": if (e.altKey) {
                e.preventDefault();
                if (sys.selectMode === "edge") AdvancedModeling.dissolveEdges();
                else AdvancedModeling.dissolveVertices();
            } break;
        }
    });

    console.log("[AdvancedModeling] 21 tools loaded. Access via window.AdvancedModeling or UnifiedModelingSystem.*");


    // ============================================================================
    // ADVANCED MAYA & 3DS MAX SOFT SELECTION ENGINE
    // ============================================================================
    const SoftSelectionEngine = {
        enabled: false,
        mode: 'volume',         // 'volume' (3D distance) | 'surface' (edge distance)
        radius: 3.0,            // Falloff radius in world units
        pinch: 0.0,             // Sharpness of peak (-1.0 to +1.0)
        bubble: 0.0,            // Side dome bulge (-1.0 to +1.0)
        falloff: 'smooth',      // 'smooth' | 'sphere' | 'linear' | 'sharp'
        showHeatmap: true,      // Colorize viewport vertices
        edgeDistance: false,    // 3ds Max "Edge Distance": bound region in edge-topology space
        edgeSteps: 3,           // 3ds Max Edge Distance count
        affectBackfacing: true, // 3ds Max "Affect Backfacing": include opposite-normal faces
        showShadedFaces: false, // 3ds Max "Shaded Face Toggle": gradient on faces
        locked: false,          // 3ds Max "Lock Soft Selection"
        _cachedWeight: null,   // Locked weight snapshot

        /**
         * Falloff curve evaluated at normalized distance x (0 center, 1 boundary).
         * Pinch/Bubble shaping is applied here exactly like 3ds Max.
         * @param {number} x - Normalized distance 0.0..1.0
         * @returns {number} Weight 0.0..1.0
         */
        curveValue(x) {
            let w = 1.0 - x;
            if (this.falloff === 'smooth') w = (1.0 - x) * (1.0 - x) * (3.0 - 2.0 * (1.0 - x));
            else if (this.falloff === 'sphere') w = Math.sqrt(Math.max(0, 1.0 - x * x));
            else if (this.falloff === 'linear') w = 1.0 - x;
            else if (this.falloff === 'sharp') w = Math.pow(1.0 - x, 3.0);

            if (this.pinch !== 0) {
                const pinchFactor = Math.pow(Math.max(0.0, w), Math.max(0.05, 1.0 + this.pinch * 2.5));
                w = THREE.MathUtils.lerp(w, pinchFactor, Math.abs(this.pinch));
            }

            if (this.bubble !== 0) {
                w += Math.sin(x * Math.PI) * (this.bubble * 0.5);
            }

            return Math.max(0.0, Math.min(1.0, w));
        },

        /**
         * Calculate Soft Selection Weight W for an arbitrary distance.
         * @param {number} distance - Distance from selection
         * @returns {number} Weight between 0.0 and 1.0
         */
        calculateWeight(distance) {
            if (distance >= this.radius || this.radius <= 0) return 0.0;
            return this.curveValue(distance / this.radius);
        },

        /**
         * Lazy vertex adjacency map (topology neighbors).
         */
        buildAdjacency(em) {
            if (em._softAdjacency) return em._softAdjacency;
            const adjacency = new Array(em.vertices.length);
            for (let i = 0; i < adjacency.length; i++) adjacency[i] = [];
            for (const edge of em.edges) {
                adjacency[edge.a].push(edge.b);
                adjacency[edge.b].push(edge.a);
            }
            em._softAdjacency = adjacency;
            return adjacency;
        },

        /**
         * Lazy averaged per-vertex normals (from face geometry).
         */
        buildVertexNormals(em) {
            if (em._softVertexNormals) return em._softVertexNormals;
            const vNormals = new Array(em.vertices.length);
            for (let i = 0; i < vNormals.length; i++) vNormals[i] = new THREE.Vector3();
            for (const face of em.faces) {
                if (!face.verts || face.verts.length < 3) continue;
                const p0 = em.vertices[face.verts[0]].position;
                const p1 = em.vertices[face.verts[1]].position;
                const p2 = em.vertices[face.verts[2]].position;
                const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
                for (const vi of face.verts) vNormals[vi].add(n);
            }
            for (const n of vNormals) n.normalize();
            em._softVertexNormals = vNormals;
            return vNormals;
        },

        /**
         * 3ds Max "Affect Backfacing" mask.
         * Returns true when the vertex should be excluded (weight forced to 0) when
         * affectBackfacing is OFF and the vertex normal opposes the selection normals.
         */
        computeVertexNormals(em) {
            // Alias kept for readability; delegates to lazy normal builder
            return this.buildVertexNormals(em);
        },

        /**
         * Compute weight map for all affected vertices in EditableMeshData.
         * Handles volume (3D falloff) and surface (edge-distance BFS) modes.
         * @param {EditableMeshData} em
         * @returns {Map<number, number>} vertIndex -> weight
         */
        computeMeshWeights(em) {

            if (!em || !this.enabled) {
                return new Map();
            }

            if (
                this.locked &&
                this._cachedWeight
            ) {
                return this._cachedWeight;
            }

            const selected =
                this.getSelectionSeedVertices(em);

            if (!selected.size) {
                return new Map();
            }

            const weights = new Map();

            if (
                this.edgeDistance ||
                this.mode === 'surface'
            ) {
                this._computeEdgeWeights(
                    em,
                    selected,
                    weights
                );
            } else {
                this._computeVolumeWeights(
                    em,
                    selected,
                    weights
                );
            }

            if (!this.affectBackfacing) {
                this._maskBackfacing(
                    em,
                    selected,
                    weights
                );
            }

            if (this.locked) {
                this._cachedWeight = weights;
            }

            return weights;
        },

        getSelectionSeedVertices(em) {

            const seeds = new Set();

            // Vertex selection
            if (em.selectedVertices) {
                em.selectedVertices.forEach(vi => {
                    seeds.add(vi);
                });
            }

            // Edge selection
            if (em.selectedEdges) {

                em.selectedEdges.forEach(ei => {

                    const edge = em.edges[ei];

                    if (!edge) return;

                    seeds.add(edge.a);
                    seeds.add(edge.b);
                });
            }

            // Face selection
            if (em.selectedFaces) {

                em.selectedFaces.forEach(fi => {

                    const face = em.faces[fi];

                    if (!face?.verts) return;

                    for (const vi of face.verts) {
                        seeds.add(vi);
                    }
                });
            }

            return seeds;
        },

        _computeVolumeWeights(em, selected, weights) {
            if (!selected || selected.size === 0) return;

            const radius = Math.max(0.0001, Number(this.radius) || 3.0);

            // Selected vertices always have full influence.
            selected.forEach(vi => {
                weights.set(vi, 1.0);
            });

            /*
             * 3ds Max-style volume falloff:
             *
             * Weight is based on the distance from the CLOSEST
             * selected vertex, not the centroid of the selection.
             *
             * This is especially important when several vertices
             * are selected far apart.
             */
            em.vertices.forEach((vert, vi) => {

                if (selected.has(vi)) return;

                let nearestDistance = Infinity;

                for (const selectedIndex of selected) {
                    const selectedVertex = em.vertices[selectedIndex];

                    if (!selectedVertex) continue;

                    const distance = vert.position.distanceTo(
                        selectedVertex.position
                    );

                    if (distance < nearestDistance) {
                        nearestDistance = distance;

                        // Can't get better than zero.
                        if (nearestDistance <= 0) break;
                    }
                }

                if (nearestDistance >= radius) return;

                const normalizedDistance =
                    nearestDistance / radius;

                const weight = this.curveValue(normalizedDistance);

                if (weight > 0) {
                    weights.set(vi, weight);
                }
            });
        },

        _computeEdgeWeights(em, selected, weights) {
            const steps = Math.max(1, Math.round(this.edgeSteps) || this.edgeSteps || 3);
            const adjacency = this.buildAdjacency(em);
            const distance = new Int16Array(em.vertices.length).fill(-1);
            const queue = [];
            let head = 0;

            selected.forEach(vi => {
                distance[vi] = 0;
                queue.push(vi);
                weights.set(vi, 1.0);
            });

            while (head < queue.length) {
                const vi = queue[head++];
                const d = distance[vi];
                if (d >= steps) continue;
                for (const nb of adjacency[vi]) {
                    if (distance[nb] !== -1) continue;
                    distance[nb] = d + 1;
                    queue.push(nb);
                    const w = this.curveValue(distance[nb] / steps);
                    if (w > 0) weights.set(nb, w);
                }
            }
        },

        _maskBackfacing(em, selected, weights) {
            // When "Affect Backfacing" is unchecked, vertices whose averaged normal
            // points opposite the selection are excluded from the falloff.
            const normals = this.buildVertexNormals(em);
            const avg = new THREE.Vector3();
            let gathered = false;
            selected.forEach(vi => {
                const n = normals[vi];
                if (n && n.lengthSq() > 1e-9) { avg.add(n); gathered = true; }
            });
            if (!gathered) return;
            avg.normalize();
            const THRESHOLD = 0.0; // dot < 0 => back-facing relative to selection
            weights.forEach((w, vi) => {
                if (selected.has(vi)) return;
                const n = normals[vi];
                if (!n || n.lengthSq() < 1e-9) return;
                if (n.dot(avg) < THRESHOLD) weights.set(vi, 0.0);
            });
        },

        // ── Face weight / gradient helpers (Shaded Face Toggle) ──────────────
        faceWeight(em, faceIndex, liveWeights) {
            const face = em.faces[faceIndex];
            if (!face || !face.verts || !face.verts.length) return 0;
            let sum = 0;
            for (const vi of face.verts) {
                if (!liveWeights) sum += this.getWeightAt(em, vi);
                else sum += liveWeights.has(vi) ? liveWeights.get(vi) : 0;
            }
            return sum / face.verts.length;
        },

        faceWeights(em, live = true) {
            if (!em || !em.faces) return new Float32Array(0);
            const liveWeights = live && this.enabled ? this.computeMeshWeights(em) : null;
            const out = new Float32Array(em.faces.length);
            for (let i = 0; i < em.faces.length; i++) {
                out[i] = liveWeights ? this.faceWeight(em, i, liveWeights) : this.faceWeight(em, i, null);
            }
            return out;
        },

        /**
         * Get weight for a vertex index into the current weight map (selected => 1).
         * Cheap path used during vertex-drag (fluent call per frame).
         */
        selectedWeightAt(em, vi) {

            if (!em) return 0;

            if (em.selectedVertices.has(vi)) {
                return 1.0;
            }

            if (!this.enabled) {
                return 0.0;
            }

            if (this._dragWeights?.has(vi)) {
                return this._dragWeights.get(vi);
            }

            if (this._cachedWeight?.has(vi)) {
                return this._cachedWeight.get(vi);
            }

            return 0.0;
        },

        /**
         * Get weight for a vertex index into the current weight map (selected => 1).
         * Used by faceWeight / shaded-face gradient between drags.
         */
        getWeightAt(em, vi) {

            if (!em) return 0;

            if (em.selectedVertices.has(vi)) {
                return 1.0;
            }

            if (!this.enabled) {
                return 0.0;
            }

            if (
                this._dragWeights &&
                this._dragWeights.has(vi)
            ) {
                return this._dragWeights.get(vi);
            }

            if (
                this._cachedWeight &&
                this._cachedWeight.has(vi)
            ) {
                return this._cachedWeight.get(vi);
            }

            return 0.0;
        },

        // ── Drag-session cache ────────────────────────────────────────────────
        // Populated on sub-object gizmo mouseDown so weight math is stable for the
        // whole drag (matches 3ds Max: Falloff/Pinch/Bubble apply at drag start).
        _dragWeights: null,

        beginWeightSession(em) {
            this._dragWeights = this.enabled ? this.computeMeshWeights(em) : null;
            return this._dragWeights;
        },

        endWeightSession() {
            this._dragWeights = null;
            this._cachedWeight = null;
        },

        dragWeightFor(vi) {
            if (!this.enabled || !this._dragWeights) return 1.0;
            return this._dragWeights.has(vi) ? this._dragWeights.get(vi) : 0.0;
        },

        /**
         * Maya / 3ds Max Viewport Heatmap Color Gradient
         * Weight 1.0 = Yellow/White, 0.75 = Red, 0.4 = Dark Red/Purple, 0.0 = Blue/Gray
         */
        getHeatmapColor(weight) {
            const color = new THREE.Color();
            if (weight <= 0.001) return color.setHex(0x666666); // Default Gray

            if (weight >= 0.85) {
                color.setHSL(0.15, 1.0, 0.6); // Yellow / White Center
            } else if (weight >= 0.5) {
                color.setHSL(0.05, 1.0, 0.5); // Orange / Red
            } else if (weight >= 0.2) {
                color.setHSL(0.95, 1.0, 0.4); // Dark Red
            } else {
                color.setHSL(0.7, 0.8, 0.3);  // Dark Blue / Purple
            }
            return color;
        },

        /**
         * Apply per-vertex weighted transform delta (Move/Rotate/Scale).
         * Uses the active drag weight session when available, else computes once.
         */
        applyDeltaTransform(em, delta) {
            if (!em || !delta) return;
            const weights = this.enabled ? (this._dragWeights || this.computeMeshWeights(em)) : null;
            if (!weights) return;

            const deltaVector = (delta.isVector3 || delta instanceof THREE.Vector3)
                ? delta
                : (delta.position || delta);

            weights.forEach((w, vi) => {
                if (em.vertices[vi] && w > 0) {
                    em.vertices[vi].position.addScaledVector(deltaVector, w);
                }
            });
        }
    };

    // Global Window Hooks for Inspector Controls
    root.toggleSoftSelection = function (enabled) {

        const engine = SoftSelectionEngine;

        engine.enabled = !!enabled;

        // Reset previous drag/cache.
        engine._cachedWeight = null;
        engine._dragWeights = null;

        const sys = root.UnifiedModelingSystem;
        const em = sys?.editableMesh;

        if (engine.enabled && em) {

            // Build the initial weight field immediately.
            engine._dragWeights =
                engine.computeMeshWeights(em);

        }

        const ctrl =
            document.getElementById('soft-select-controls');

        if (ctrl) {
            ctrl.style.display =
                engine.enabled ? 'flex' : 'none';
        }

        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    root.setSoftSelectionMode = function (mode) {
        SoftSelectionEngine.mode = mode;
        SoftSelectionEngine._cachedWeight = null;
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    root.setSoftSelectionRadius = function (val) {
        SoftSelectionEngine.radius = Math.max(0.01, parseFloat(val) || 3.0);
        SoftSelectionEngine._cachedWeight = null;
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    root.setSoftSelectionPinch = function (val) {
        SoftSelectionEngine.pinch = Math.max(-1.0, Math.min(1.0, parseFloat(val) || 0.0));
        SoftSelectionEngine._cachedWeight = null;
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    root.setSoftSelectionBubble = function (val) {
        SoftSelectionEngine.bubble = Math.max(-1.0, Math.min(1.0, parseFloat(val) || 0.0));
        SoftSelectionEngine._cachedWeight = null;
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    root.toggleSoftSelectionColors = function (enabled) {
        SoftSelectionEngine.showHeatmap = !!enabled;
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    // ── 3ds Max rollout additions ────────────────────────────────────────────

    // Edge Distance: bound the affected region in edge-topology space
    root.toggleSoftSelectionEdgeDistance = function (enabled) {
        SoftSelectionEngine.edgeDistance = !!enabled;
        SoftSelectionEngine._cachedWeight = null;
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    root.setSoftSelectionEdgeSteps = function (val) {
        SoftSelectionEngine.edgeSteps = Math.max(1, Math.min(50, Math.round(parseFloat(val) || 3)));
        SoftSelectionEngine._cachedWeight = null;
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    // Affect Backfacing (exclude/override opposite-normal faces)
    root.toggleSoftSelectionAffectBackfacing = function (enabled) {
        SoftSelectionEngine.affectBackfacing = !!enabled;
        SoftSelectionEngine._cachedWeight = null;
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    // Shaded Face Toggle: gradient overlay across faces
    root.toggleSoftSelectionShadedFaces = function (enabled) {
        SoftSelectionEngine.showShadedFaces = !!enabled;
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    // Lock Soft Selection (freeze the weight field while params change)
    root.toggleSoftSelectionLock = function (enabled) {
        SoftSelectionEngine.locked = !!enabled;
        if (enabled && root.UnifiedModelingSystem?.editableMesh) {
            SoftSelectionEngine._cachedWeight = SoftSelectionEngine.computeMeshWeights(root.UnifiedModelingSystem.editableMesh);
        }
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    // Keep a cached norms/weight snapshot for drag sessions cleanly
    SoftSelectionEngine.refreshCache = function () {
        if (this.locked && root.UnifiedModelingSystem?.editableMesh) {
            this._cachedWeight = this.computeMeshWeights(root.UnifiedModelingSystem.editableMesh);
        }
    };

    // Repaint the intra-rollout Falloff curve preview (mirrors 3ds Max bezier preview)
    root.drawSoftCurvePreview = function () {
        const canvas = document.getElementById('soft-select-curve');
        if (!canvas || !canvas.getContext) return () => 0;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = 'rgba(120,140,170,0.25)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const y = (h / 4) * i;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        for (let i = 1; i < 9; i++) {
            const x = (w / 8) * i;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }

        // Curve
        ctx.beginPath();
        ctx.strokeStyle = '#38a0ff';
        ctx.lineWidth = 2;
        const curveFn = SoftSelectionEngine.curveValue.bind(SoftSelectionEngine);
        for (let i = 0; i <= 40; i++) {
            const x = i / 40;
            const val = curveFn(x);
            const px = x * (w - 2) + 1;
            const py = h - 2 - val * (h - 6);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Range tint for pinch/bubble extremes
        if (Math.abs(SoftSelectionEngine.pinch) > 0.001 || Math.abs(SoftSelectionEngine.bubble) > 0.001) {
            ctx.fillStyle = 'rgba(0,122,204,0.12)';
            ctx.fillRect(0, 0, w, h);
        }
        return () => 0;
    };

    root.refreshSoftSelectionVisuals = function () {
        try {
            root.drawSoftCurvePreview?.();
            root.UnifiedModelingSystem?.rebuildSoftSelectionViews?.();
        } catch (e) { /* noop */ }
    };

    root.setSoftSelectionCurve = function (curveType, btn) {
        SoftSelectionEngine.falloff = curveType;
        SoftSelectionEngine._cachedWeight = null;
        document.querySelectorAll('.soft-curve-btn').forEach(b => b.classList.remove('active'));
        btn?.classList.add('active');
        root.refreshSoftSelectionVisuals?.();
        root.UnifiedModelingSystem?.rebuildAllHelpers?.();
    };

    // ============================================================
    // EXTRUDE ALONG SPLINE ENGINE (3ds Max-style sweep)
    // Sweeps the selected face profile along a spline path using
    // rotation-minimizing frames, with taper / twist / align controls.
    // Non-destructive: live preview mesh + topology commit on Apply.
    // ============================================================
    const SplineExtrudeEngine = {
        enabled: false,
        splineName: "",
        splineObject: null,
        pathPoints: [],
        pathClosed: false,
        segments: 8,
        taperAmount: 0,
        taperCurve: 1,
        twistDegrees: 0,
        alignToFaceNormal: false,
        rotationDegrees: 0,
        reverse: false,
        capStart: false,
        capEnd: true,
        smoothNormals: true,
        generateUVs: true,
        adaptiveSampling: false,
        samplesPerUnit: 2,
        previewMesh: null,
        previewTopology: null,
        _pickMode: false,
        _pickHandler: null,
        _pickKeyHandler: null,
        _lastSignature: "",

        setPath(points, closed, name) {
            this.pathPoints = [];
            const list = Array.isArray(points) ? points : [];
            for (let i = 0; i < list.length; i++) {
                const p = list[i];
                const v = V3();
                if (p && (p.isVector3 || p instanceof THREE.Vector3)) v.copy(p);
                else v.set((p && p.x) || 0, (p && p.y) || 0, (p && p.z) || 0);
                this.pathPoints.push(v);
            }
            this.pathClosed = !!closed && this.pathPoints.length > 2;
            if (this.pathClosed && this.pathPoints.length > 1 &&
                this.pathPoints[0].distanceTo(this.pathPoints[this.pathPoints.length - 1]) < 1e-4) {
                this.pathPoints.pop();
            }
            this.splineName = name || "";
            this._invalidate();
        },

        getPathLength() {
            const dense = this._densePolyline();
            let len = 0;
            for (let i = 1; i < dense.length; i++) len += dense[i - 1].distanceTo(dense[i]);
            return len;
        },

        _catmullRomPoint(p0, p1, p2, p3, t) {
            const t2 = t * t, t3 = t2 * t;
            const cx = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
            const cy = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
            const cz = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
            return { x: cx, y: cy, z: cz };
        },

        _densePolyline() {
            const pts = this.pathPoints;
            if (pts.length < 2) return pts.map(p => p.clone());
            const dense = [];
            const n = pts.length;
            const steps = Math.max(16, Math.min(256, Math.round(64 / (n - 1)) * (n - 1)));
            for (let i = 0; i < n - 1; i++) {
                const p0 = pts[this.pathClosed ? (i + n - 1) % n : Math.max(0, i - 1)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[this.pathClosed ? (i + 2) % n : Math.min(n - 1, i + 2)];
                const segSteps = Math.max(2, Math.ceil(steps / Math.max(1, n - 1)));
                for (let s = 0; s < segSteps; s++) {
                    const t = s / segSteps;
                    const pt = this._catmullRomPoint(p0, p1, p2, p3, t);
                    dense.push(V3().set(pt.x, pt.y, pt.z));
                }
            }
            dense.push(pts[n - 1].clone());
            if (this.pathClosed) dense.push(dense[0].clone());
            return dense;
        },

        _arcLengthResample(dense, count, closed) {
            const lens = [0];
            for (let i = 1; i < dense.length; i++) lens.push(lens[i - 1] + dense[i - 1].distanceTo(dense[i]));
            const total = lens[lens.length - 1] || 1;
            const samples = [];
            for (let i = 0; i < count; i++) {
                const target = (total * i) / (closed ? count : Math.max(1, count - 1));
                let lo = 0;
                while (lo < lens.length - 2 && lens[lo + 1] < target) lo++;
                const t = (target - lens[lo]) / Math.max(1e-9, lens[lo + 1] - lens[lo]);
                const a = dense[lo], b = dense[lo + 1];
                samples.push(V3().lerpVectors(a, b, Math.min(1, Math.max(0, t))));
            }
            return samples;
        },

        _buildFrames(alignNormal) {
            const pts = this.pathPoints;
            if (pts.length < 2) return [];
            let dense = this._densePolyline();
            if (this.reverse && !this.pathClosed) {
                dense = dense.reverse().map(p => p.clone());
            }
            const closed = this.pathClosed;
            let count = Math.max(2, Math.round(this.segments));
            if (this.adaptiveSampling) {
                let len = 0;
                for (let i = 1; i < dense.length; i++) len += dense[i - 1].distanceTo(dense[i]);
                count = Math.max(2, Math.min(512, Math.round(len * Math.max(0.1, this.samplesPerUnit))));
            }
            if (closed) count = Math.max(2, count);
            const ringCount = closed ? count : count + 1;
            const samples = this._arcLengthResample(dense, ringCount, closed);

            const tangents = [];
            for (let i = 0; i < ringCount; i++) {
                const prev = i === 0
                    ? (closed ? samples[ringCount - 1] : samples[0])
                    : samples[i - 1];
                const next = i === ringCount - 1
                    ? (closed ? samples[0] : samples[ringCount - 1])
                    : samples[i + 1];
                tangents.push(V3().subVectors(next, prev).normalize());
            }
            if (!closed && tangents[0].lengthSq() < 1e-12 && ringCount > 1) {
                tangents[0].subVectors(samples[1], samples[0]).normalize();
            }
            if (!closed && tangents[ringCount - 1].lengthSq() < 1e-12 && ringCount > 1) {
                tangents[ringCount - 1].subVectors(samples[ringCount - 1], samples[ringCount - 2]).normalize();
            }

            // Rotation-minimizing frames (double reflection)
            const frames = [];
            const upHint = Math.abs(tangents[0].y) < 0.9 ? V3().set(0, 1, 0) : V3().set(1, 0, 0);
            let normal = V3().crossVectors(tangents[0], upHint).normalize();
            let binormal = V3().crossVectors(tangents[0], normal).normalize();
            const pushFrame = (i) => {
                frames.push({
                    position: samples[i].clone(),
                    tangent: tangents[i].clone(),
                    normal: normal.clone(),
                    binormal: binormal.clone(),
                });
            };
            pushFrame(0);
            for (let i = 1; i < ringCount; i++) {
                const t1 = tangents[i - 1], t2 = tangents[i];
                const axis = V3().addVectors(t1, t2);
                const axLen = axis.length();
                if (axLen > 1e-6) {
                    axis.divideScalar(axLen);
                    const v2 = V3().copy(normal).addScaledVector(axis, -2 * normal.dot(axis));
                    const v3 = V3().copy(binormal).addScaledVector(axis, -2 * binormal.dot(axis));
                    normal = V3().copy(v2).addScaledVector(t2, -2 * v2.dot(t2));
                    binormal = V3().copy(v3).addScaledVector(t2, -2 * v3.dot(t2));
                    normal.normalize();
                    binormal.normalize();
                }
                pushFrame(i);
            }

            const degRad = THREE.MathUtils.degToRad;
            const rollOffset = this.alignToFaceNormal && Math.abs(this.rotationDegrees) > 1e-4 ? degRad(this.rotationDegrees) : 0;

            for (let i = 0; i < ringCount; i++) {
                const frame = frames[i];
                if (rollOffset !== 0) {
                    const c = Math.cos(rollOffset), s = Math.sin(rollOffset);
                    const n = V3().copy(frame.normal).multiplyScalar(c).addScaledVector(frame.binormal, s);
                    frame.binormal = V3().copy(frame.binormal).multiplyScalar(c).addScaledVector(frame.normal, -s);
                    frame.normal = n;
                }
                if (Math.abs(this.twistDegrees) > 1e-4) {
                    const tw = degRad(this.twistDegrees) * (closed ? i / ringCount : i / Math.max(1, ringCount - 1));
                    const c = Math.cos(tw), s = Math.sin(tw);
                    const n = V3().copy(frame.normal).multiplyScalar(c).addScaledVector(frame.binormal, s);
                    frame.binormal = V3().copy(frame.binormal).multiplyScalar(c).addScaledVector(frame.normal, -s);
                    frame.normal = n;
                }
                if (alignNormal && this.alignToFaceNormal) {
                    const q = new THREE.Quaternion().setFromUnitVectors(frame.tangent, alignNormal);
                    frame.normal = q.applyToVector3(frame.normal);
                    frame.binormal = q.applyToVector3(frame.binormal);
                }
            }
            return frames;
        },

        taperScale(t) {
            return Math.max(0.01, 1 + (Number(this.taperAmount) || 0) * Math.pow(Math.min(1, Math.max(0, t)), Math.max(0.01, Number(this.taperCurve) || 1)));
        },

        _profileLoops(em, faceIndices) {
            if (faceIndices.length === 1) {
                return [{ verts: em.faces[faceIndices[0]].verts.slice() }];
            }
            const boundary = new Map();
            faceIndices.forEach((fi) => {
                const f = em.faces[fi];
                for (let i = 0; i < f.verts.length; i++) {
                    const a = f.verts[i], b = f.verts[(i + 1) % f.verts.length];
                    const key = a < b ? a + "_" + b : b + "_" + a;
                    boundary.set(key, (boundary.get(key) || 0) + 1);
                }
            });
            const adjacency = new Map();
            boundary.forEach((count, key) => {
                if (count !== 1) return;
                const parts = key.split("_");
                const a = Number(parts[0]), b = Number(parts[1]);
                if (!adjacency.has(a)) adjacency.set(a, []);
                if (!adjacency.has(b)) adjacency.set(b, []);
                adjacency.get(a).push(b);
                adjacency.get(b).push(a);
            });
            const edgeUsed = new Set();
            const loops = [];
            adjacency.forEach((_, start) => {
                const loop = [];
                let cur = start, prev = -1;
                while (true) {
                    if (loop.includes(cur)) break;
                    loop.push(cur);
                    const candidates = (adjacency.get(cur) || []).filter((n) => {
                        const key = cur < n ? cur + "_" + n : n + "_" + cur;
                        return n !== prev && !edgeUsed.has(key);
                    });
                    if (!candidates.length) break;
                    const next = candidates[0];
                    const key = cur < next ? cur + "_" + next : next + "_" + cur;
                    edgeUsed.add(key);
                    prev = cur;
                    cur = next;
                    if (cur === start) break;
                }
                if (loop.length >= 3 && loop[0] === loop[loop.length - 1]) loop.pop();
                if (loop.length >= 3) loops.push({ verts: loop });
            });
            if (!loops.length) loops.push({ verts: em.faces[faceIndices[0]].verts.slice() });
            return loops;
        },

        _newellNormal(em, loop) {
            const n = V3();
            for (let i = 0; i < loop.length; i++) {
                const p = em.vertices[loop[i]].position;
                const q = em.vertices[loop[(i + 1) % loop.length]].position;
                n.x += (p.y - q.y) * (p.z + q.z);
                n.y += (p.z - q.z) * (p.x + q.x);
                n.z += (p.x - q.x) * (p.y + q.y);
            }
            const l = n.length();
            return l > 1e-9 ? n.divideScalar(l) : V3().set(0, 1, 0);
        },

        _buildSweep(em, faceIndices) {
            const alignNormal = V3();
            faceIndices.forEach((fi) => alignNormal.add(em.computeFaceNormal(fi)));
            alignNormal.normalize();
            const frames = this._buildFrames(alignNormal);
            const ringCount = frames.length;
            if (ringCount < 2) return null;

            const loops = this._profileLoops(em, faceIndices);
            const refNormal = alignNormal.clone();
            const profiles = loops.map((loop) => {
                const verts = loop.verts;
                const centroid = V3();
                verts.forEach((vi) => centroid.add(em.vertices[vi].position));
                centroid.divideScalar(verts.length);
                const n = this._newellNormal(em, verts);
                if (n.dot(refNormal) < 0) verts.reverse();
                let uAxis = V3().subVectors(em.vertices[verts[1]].position, em.vertices[verts[0]].position);
                const uLen = uAxis.length();
                if (uLen < 1e-9) uAxis = V3().set(1, 0, 0);
                else uAxis.divideScalar(uLen);
                const vAxis = V3().crossVectors(n, uAxis).normalize();
                const coords = verts.map((vi) => {
                    const d = V3().subVectors(em.vertices[vi].position, centroid);
                    return { u: d.dot(uAxis), v: d.dot(vAxis) };
                });
                return { verts, count: verts.length, centroid, coords };
            });

            const vertices = [];
            const faces = [];
            const loopMeta = [];
            profiles.forEach((profile, loopIndex) => {
                const start = vertices.length;
                for (let s = 0; s < ringCount; s++) {
                    const frame = frames[s];
                    const t = ringCount > 1 ? s / (ringCount - 1) : 0;
                    const scale = this.taperScale(t);
                    for (let k = 0; k < profile.count; k++) {
                        const c = profile.coords[k];
                        vertices.push({
                            position: V3()
                                .copy(frame.position)
                                .addScaledVector(frame.normal, c.u * scale)
                                .addScaledVector(frame.binormal, c.v * scale),
                        });
                    }
                }
                loopMeta.push({ start, count: profile.count });
                if (this.pathClosed) {
                    for (let s = 0; s < ringCount; s++) {
                        const nextS = (s + 1) % ringCount;
                        for (let k = 0; k < profile.count; k++) {
                            const k2 = (k + 1) % profile.count;
                            const a = start + s * profile.count + k;
                            const b = start + s * profile.count + k2;
                            const c = start + nextS * profile.count + k;
                            const d = start + nextS * profile.count + k2;
                            faces.push({ verts: [a, c, b], kind: "side", loop: loopIndex, s, k });
                            faces.push({ verts: [b, c, d], kind: "side", loop: loopIndex, s, k });
                        }
                    }
                } else {
                    for (let s = 0; s < ringCount - 1; s++) {
                        for (let k = 0; k < profile.count; k++) {
                            const k2 = (k + 1) % profile.count;
                            const a = start + s * profile.count + k;
                            const b = start + s * profile.count + k2;
                            const c = start + (s + 1) * profile.count + k;
                            const d = start + (s + 1) * profile.count + k2;
                            faces.push({ verts: [a, c, b], kind: "side", loop: loopIndex, s, k });
                            faces.push({ verts: [b, c, d], kind: "side", loop: loopIndex, s, k });
                        }
                    }
                    if (this.capStart) {
                        const centerIdx = vertices.length;
                        vertices.push({ position: frames[0].position.clone() });
                        for (let k = 0; k < profile.count; k++) {
                            const k2 = (k + 1) % profile.count;
                            faces.push({ verts: [start + k, centerIdx, start + k2], kind: "cap", loop: loopIndex, s: 0, k, centerCorner: 1 });
                        }
                    }
                    if (this.capEnd) {
                        const centerIdx = vertices.length;
                        const ringStart = start + (ringCount - 1) * profile.count;
                        vertices.push({ position: frames[ringCount - 1].position.clone() });
                        for (let k = 0; k < profile.count; k++) {
                            const k2 = (k + 1) % profile.count;
                            faces.push({ verts: [centerIdx, ringStart + k, ringStart + k2], kind: "cap", loop: loopIndex, s: ringCount - 1, k, centerCorner: 0 });
                        }
                    }
                }
            });

            return { vertices, faces, frames, ringCount, loopMeta };
        },

        signature(em) {
            return [
                this.enabled ? 1 : 0,
                this.segments, this.taperAmount, this.taperCurve, this.twistDegrees,
                this.alignToFaceNormal ? 1 : 0, this.rotationDegrees, this.reverse ? 1 : 0,
                this.capStart ? 1 : 0, this.capEnd ? 1 : 0, this.smoothNormals ? 1 : 0,
                this.generateUVs ? 1 : 0, this.adaptiveSampling ? 1 : 0, this.samplesPerUnit,
                this.pathClosed ? 1 : 0, this.pathPoints.length,
                em ? em.vertices.length : 0, em ? em.faces.length : 0, em ? em.selectedFaces.size : 0,
            ].join("|");
        },

        _invalidate() {
            this._lastSignature = "";
            this.refreshIfDirty();
        },

        refreshIfDirty() {
            if (!this.enabled) return;
            const em = root.UnifiedModelingSystem?.editableMesh;
            const sig = this.signature(em);
            if (sig === this._lastSignature && this.previewMesh) return;
            this._lastSignature = sig;
            this.refreshPreview();
        },

        refreshPreview() {
            const sys = root.UnifiedModelingSystem;
            const em = sys?.editableMesh;
            if (!em || !this.enabled || this.pathPoints.length < 2) {
                sys?.clearSplineExtrudePreview?.();
                this.previewTopology = null;
                this.previewMesh = null;
                return null;
            }
            const faceIndices = [...em.selectedFaces].filter((fi) => em.faces[fi] && em.faces[fi].verts.length >= 3);
            if (!faceIndices.length) {
                sys?.clearSplineExtrudePreview?.();
                this.previewTopology = null;
                this.previewMesh = null;
                return null;
            }
            const sweep = this._buildSweep(em, faceIndices);
            if (!sweep) return null;
            this.previewTopology = sweep;
            const mesh = this._buildPreviewMesh(sweep, sys);
            sys?.showSplineExtrudePreview?.(mesh);
            this.previewMesh = mesh;
            return mesh;
        },

        _buildPreviewMesh(sweep, sys) {
            const worldVerts = sweep.vertices.map((v) => sys.activeMesh.localToWorld(v.position.clone()));
            const positions = [];
            const uvs = this.generateUVs ? [] : null;
            const faceNormals = this.smoothNormals ? null : [];

            const appendTriangle = (v0, v1, v2, face) => {
                const meta = this._faceUV(face, v0, v1, v2);
                [v0, v1, v2].forEach((vi, corner) => {
                    const p = worldVerts[vi];
                    positions.push(p.x, p.y, p.z);
                    if (uvs) uvs.push(meta.uv[corner][0], meta.uv[corner][1]);
                });
                if (faceNormals) {
                    const A = worldVerts[v0], B = worldVerts[v1], C = worldVerts[v2];
                    const n = V3().subVectors(B, A).cross(V3().subVectors(C, A)).normalize();
                    for (let i = 0; i < 3; i++) faceNormals.push(n.x, n.y, n.z);
                }
            };

            sweep.faces.forEach((face) => {
                appendTriangle(face.verts[0], face.verts[1], face.verts[2], face);
            });

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            if (uvs) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
            if (faceNormals) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(faceNormals, 3));
            else geometry.computeVertexNormals();

            const solid = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
                color: 0x38a0ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
            }));
            const wire = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
                color: 0x38a0ff, wireframe: true, transparent: true, opacity: 0.75, depthWrite: false,
            }));
            solid.renderOrder = 980;
            wire.renderOrder = 981;
            const group = new THREE.Group();
            group.add(solid, wire);
            return group;
        },

        _faceUV(face, v0, v1, v2) {
            const meta = this.previewTopology.loopMeta[face.loop] || { start: 0, count: 4 };
            const R = meta.count;
            const ringCount = this.previewTopology.ringCount;
            const vAt = (vi) => {
                const ring = Math.floor((vi - meta.start) / R);
                return ring / Math.max(1, ringCount - 1);
            };
            if (face.kind === "cap") {
                const angle = (k) => (Math.PI * 2 * k) / R;
                const ringCorner = (vi) => {
                    const kk = (vi - meta.start) % R;
                    return [0.5 + 0.5 * Math.cos(angle(kk)), 0.5 + 0.5 * Math.sin(angle(kk))];
                };
                return {
                    uv: [v0, v1, v2].map((vi, corner) =>
                        corner === face.centerCorner ? [0.5, 0.5] : ringCorner(vi)
                    ),
                };
            }
            return {
                uv: [v0, v1, v2].map((vi) => {
                    const kk = (vi - meta.start) % R;
                    return [kk / R, vAt(vi)];
                }),
            };
        },

        apply() {
            const sys = root.UnifiedModelingSystem;
            const em = sys?.editableMesh;
            if (!sys || !em || !this.previewTopology || !this.enabled) {
                if (sys) sys.architectureMessage = "Select a face, pick a spline, and enable Live Preview first.";
                return false;
            }
            const selected = new Set(em.selectedFaces);
            const nextFaces = [];
            em.faces.forEach((face, index) => {
                if (!selected.has(index)) nextFaces.push({ verts: face.verts.slice() });
            });
            const base = em.vertices.length;
            this.previewTopology.vertices.forEach((v) => em.vertices.push({ position: v.position.clone() }));
            this.previewTopology.faces.forEach((f) => nextFaces.push({ verts: f.verts.slice().map((i) => i + base) }));
            em.faces = nextFaces;
            em.clearSelection();
            sys.commitEditableMesh(true, true);
            this.enabled = false;
            this._lastSignature = "";
            this.previewTopology = null;
            this.previewMesh = null;
            sys.clearSplineExtrudePreview?.();
            sys.architectureMessage = "Extrude along spline applied.";
            root.refreshSplineExtrudeUI?.();
            return true;
        },

        extractPathFromObject(obj) {
            if (!obj) return false;
            const ud = obj.userData || {};
            let pts = null;
            let closed = false;
            if (ud.curve && typeof ud.curve.getPoints === "function") {
                pts = ud.curve.getPoints(64);
                closed = !!ud.closed;
            } else if (Array.isArray(ud.curvePoints) && ud.curvePoints.length >= 2) {
                pts = ud.curvePoints;
                closed = !!ud.closed;
            } else if (Array.isArray(ud.controlPoints) && ud.controlPoints.length >= 2) {
                pts = ud.controlPoints;
                closed = !!ud.closed;
            } else if (obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position) {
                const attr = obj.geometry.attributes.position;
                pts = [];
                for (let i = 0; i < attr.count; i++) pts.push(V3().set(attr.getX(i), attr.getY(i), attr.getZ(i)));
                closed = obj.isLineLoop === true;
            }
            if (!pts || pts.length < 2) return false;
            const world = [];
            pts.forEach((p) => {
                const v = (p && (p.isVector3 || p instanceof THREE.Vector3))
                    ? p.clone()
                    : V3().set((p && p.x) || 0, (p && p.y) || 0, (p && p.z) || 0);
                if (obj.localToWorld) obj.localToWorld(v);
                world.push(v);
            });
            closed = closed || world[0].distanceTo(world[world.length - 1]) < 1e-4;
            this.setPath(world, closed, obj.name || ud.splineName || "Spline");
            return true;
        },

        startPick() {
            if (this._pickMode) return;
            const sys = root.UnifiedModelingSystem;
            const renderer = root.renderer || (typeof renderer !== "undefined" ? renderer : null) || sys?.renderer || null;
            const el = (renderer && renderer.domElement) || document.getElementById("renderer-container")?.querySelector?.("canvas") || null;
            if (!el) {
                if (sys) sys.architectureMessage = "No viewport available to pick a spline.";
                return;
            }
            this._pickMode = true;
            if (sys) {
                sys.architectureMessage = "Pick a spline object in the viewport (Esc to cancel).";
                sys.setViewportCursor?.("crosshair");
            }
            this._pickHandler = (event) => this._handlePick(event);
            this._pickKeyHandler = (event) => {
                if (event.key === "Escape") this._exitPick(true);
            };
            el.addEventListener("click", this._pickHandler);
            el.addEventListener("contextmenu", this._pickHandler);
            document.addEventListener("keydown", this._pickKeyHandler);
        },

        _handlePick(event) {
            if (event.type === "contextmenu") event.preventDefault();
            const sys = root.UnifiedModelingSystem;
            const renderer = root.renderer || (typeof renderer !== "undefined" ? renderer : null) || sys?.renderer || null;
            const camera = root.camera || sys?.camera || (typeof camera !== "undefined" ? camera : null);
            const el = renderer?.domElement;
            if (!el || !camera) {
                this._exitPick(true);
                return;
            }
            const rect = el.getBoundingClientRect();
            const ndc = V3().set(
                ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
                -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
                0
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(ndc, camera);
            const candidates = [];
            if (root.scene && typeof root.scene.traverse === "function") {
                root.scene.traverse((o) => {
                    if (!o || o.visible === false) return;
                    const ud = o.userData || {};
                    if (o.isLine || o.isLineSegments || o.isLineLoop || o.isPoints ||
                        ud.curve || ud.curvePoints || ud.controlPoints || ud.isSpline) {
                        candidates.push(o);
                    }
                });
            }
            const hits = raycaster.intersectObjects(candidates, false);
            if (!hits.length) {
                if (event.type === "contextmenu") this._exitPick(true);
                return;
            }
            const ok = this.extractPathFromObject(hits[0].object);
            this._exitPick(!ok);
            if (ok) {
                if (sys) sys.architectureMessage = "Spline picked: " + (this.splineName || "Spline");
                this._invalidate();
            }
        },

        _exitPick(restore) {
            if (!this._pickMode) return;
            this._pickMode = false;
            const sys = root.UnifiedModelingSystem;
            if (this._pickHandler) {
                const renderer = root.renderer || (typeof renderer !== "undefined" ? renderer : null) || sys?.renderer || null;
                const el = (renderer && renderer.domElement) || document.getElementById("renderer-container")?.querySelector?.("canvas") || null;
                el?.removeEventListener?.("click", this._pickHandler);
                el?.removeEventListener?.("contextmenu", this._pickHandler);
                this._pickHandler = null;
            }
            if (this._pickKeyHandler) {
                document.removeEventListener("keydown", this._pickKeyHandler);
                this._pickKeyHandler = null;
            }
            if (restore && sys) {
                sys.setViewportCursor?.("default");
                sys.architectureMessage = "Spline picking cancelled.";
            }
        },
    };

    root.SplineExtrudeEngine = SplineExtrudeEngine;

    // ---------- Extrude Along Spline global hooks ----------
    root.toggleSplineExtrude = function (enabled) {
        SplineExtrudeEngine.enabled = !!enabled;
        if (!SplineExtrudeEngine.enabled) {
            SplineExtrudeEngine._lastSignature = "";
            SplineExtrudeEngine.previewTopology = null;
            SplineExtrudeEngine.previewMesh = null;
            root.UnifiedModelingSystem?.clearSplineExtrudePreview?.();
        } else {
            SplineExtrudeEngine._invalidate();
        }
    };

    root.setSplineExtrudeSegments = function (value) {
        SplineExtrudeEngine.segments = Math.max(1, Math.min(256, Math.round(Number(value) || 8)));
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeTaper = function (value) {
        SplineExtrudeEngine.taperAmount = Number(value) || 0;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeTaperCurve = function (value) {
        SplineExtrudeEngine.taperCurve = Math.max(0.01, Number(value) || 1);
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeTwist = function (value) {
        SplineExtrudeEngine.twistDegrees = Number(value) || 0;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeAlign = function (enabled) {
        SplineExtrudeEngine.alignToFaceNormal = !!enabled;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeRotation = function (value) {
        SplineExtrudeEngine.rotationDegrees = THREE.MathUtils.clamp(Number(value) || 0, -360, 360);
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeReverse = function (enabled) {
        SplineExtrudeEngine.reverse = !!enabled;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeCapStart = function (enabled) {
        SplineExtrudeEngine.capStart = !!enabled;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeCapEnd = function (enabled) {
        SplineExtrudeEngine.capEnd = enabled !== false;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeSmoothNormals = function (enabled) {
        SplineExtrudeEngine.smoothNormals = enabled !== false;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeUVs = function (enabled) {
        SplineExtrudeEngine.generateUVs = enabled !== false;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudeAdaptive = function (enabled) {
        SplineExtrudeEngine.adaptiveSampling = !!enabled;
        SplineExtrudeEngine._invalidate();
    };
    root.setSplineExtrudePerUnit = function (value) {
        SplineExtrudeEngine.samplesPerUnit = Math.max(0.1, Number(value) || 2);
        SplineExtrudeEngine._invalidate();
    };
    root.startSplinePick = function () {
        SplineExtrudeEngine.startPick();
    };
    root.applySplineExtrude = function () {
        return SplineExtrudeEngine.apply();
    };
    root.refreshSplineExtrudePreview = function () {
        SplineExtrudeEngine._lastSignature = "";
        SplineExtrudeEngine.refreshIfDirty();
    };

    root.SoftSelectionEngine = SoftSelectionEngine;
})(window);