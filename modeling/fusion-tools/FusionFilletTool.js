/**
 * FusionFilletTool.js
 * Multi-segment mesh fillet/bevel for selected edges in UnifiedModelingSystem.
 * Designed as a high-quality polygonal approximation of Fusion's edge fillet.
 *
 * Usage:
 *   UnifiedModelingSystem.fusionFillet({ radius: 0.15, segments: 5 });
 */
(function (root) {
    "use strict";

    const NS = root.FusionAdvancedTools = root.FusionAdvancedTools || {};
    const EPS = 1e-7;

    function ctx() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) {
            if (sys) sys.architectureMessage = "Fusion Fillet: enter Edit Mode first.";
            return null;
        }
        return { sys, em: sys.editableMesh };
    }

    function commit(em, sys, msg) {
        em.faces = em.faces.filter(f => f?.verts && new Set(f.verts).size >= 3);
        em.clearSelection?.();
        sys.commitEditableMesh(true, true);
        sys.architectureMessage = msg;
        root.updateModelingStatus?.(msg);
        root.ModelingToolkitController?.refreshUI?.();
    }

    const edgeKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;

    function buildEdgeFaces(em) {
        const map = new Map();
        em.faces.forEach((face, fi) => {
            const v = face.verts || [];
            for (let i = 0; i < v.length; i++) {
                const a = v[i], b = v[(i + 1) % v.length];
                const key = edgeKey(a, b);
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(fi);
            }
        });
        return map;
    }

    function faceCenter(em, fi) {
        const c = new THREE.Vector3();
        const f = em.faces[fi];
        if (!f?.verts?.length) return c;
        f.verts.forEach(vi => c.add(em.vertices[vi].position));
        return c.multiplyScalar(1 / f.verts.length);
    }

    function insetDirection(em, fi, vi, edgeDir) {
        const p = em.vertices[vi].position;
        const d = faceCenter(em, fi).sub(p);
        d.addScaledVector(edgeDir, -d.dot(edgeDir));
        if (d.lengthSq() < EPS) {
            const n = em.computeFaceNormal?.(fi) || new THREE.Vector3(0, 1, 0);
            d.crossVectors(n, edgeDir);
        }
        return d.lengthSq() > EPS ? d.normalize() : new THREE.Vector3();
    }

    function replaceEdge(face, a, b, newA, newB) {
        const src = face.verts;
        const out = [];
        let replaced = false;
        for (let i = 0; i < src.length; i++) {
            const cur = src[i], next = src[(i + 1) % src.length];
            if (cur === a && next === b) {
                out.push(newA, newB);
                i++;
                replaced = true;
            } else if (cur === b && next === a) {
                out.push(newB, newA);
                i++;
                replaced = true;
            } else {
                out.push(cur);
            }
        }
        if (replaced) face.verts = out;
        return replaced;
    }

    function bezier2(a, control, b, t) {
        const u = 1 - t;
        return a.clone().multiplyScalar(u * u)
            .add(control.clone().multiplyScalar(2 * u * t))
            .add(b.clone().multiplyScalar(t * t));
    }

    function addVertex(em, p) {
        const i = em.vertices.length;
        em.vertices.push({ position: p.clone() });
        return i;
    }

    const FusionFilletTool = {
        apply(options = {}) {
            const c = ctx();
            if (!c) return false;
            const { sys, em } = c;
            em.rebuildTopology?.();
            const selectedIndices = [...(em.selectedEdges || [])];
            if (!selectedIndices.length) {
                sys.architectureMessage = "Fusion Fillet: select one or more edges.";
                return false;
            }
            const selectedEdges = selectedIndices.map(i => em.edges[i]).filter(e => e && Number.isInteger(e.a) && Number.isInteger(e.b));
            if (!selectedEdges.length) return false;

            const radiusRequested = Math.max(1e-5, Math.abs(Number(options.radius) || 0.1));
            const segments = THREE.MathUtils.clamp(Math.round(Number(options.segments) || 4), 1, 16);
            const faceMap = buildEdgeFaces(em);
            const endpointDegree = new Map();
            selectedEdges.forEach(e => {
                endpointDegree.set(e.a, (endpointDegree.get(e.a) || 0) + 1);
                endpointDegree.set(e.b, (endpointDegree.get(e.b) || 0) + 1);
            });

            const strips = [];
            let done = 0, skipped = 0;

            for (const edge of selectedEdges) {
                const a = edge.a, b = edge.b;
                const adjacent = faceMap.get(edgeKey(a, b)) || [];
                if (adjacent.length !== 2) { skipped++; continue; }
                const pa = em.vertices[a].position.clone();
                const pb = em.vertices[b].position.clone();
                const edgeVec = pb.clone().sub(pa);
                const edgeLen = edgeVec.length();
                if (edgeLen < EPS) { skipped++; continue; }
                const edgeDir = edgeVec.clone().multiplyScalar(1 / edgeLen);
                const radius = Math.min(radiusRequested, edgeLen * 0.45);

                const f0 = adjacent[0], f1 = adjacent[1];
                const a0p = pa.clone().addScaledVector(insetDirection(em, f0, a, edgeDir), radius);
                const b0p = pb.clone().addScaledVector(insetDirection(em, f0, b, edgeDir), radius);
                const a1p = pa.clone().addScaledVector(insetDirection(em, f1, a, edgeDir), radius);
                const b1p = pb.clone().addScaledVector(insetDirection(em, f1, b, edgeDir), radius);

                const a0 = addVertex(em, a0p), b0 = addVertex(em, b0p);
                const a1 = addVertex(em, a1p), b1 = addVertex(em, b1p);
                if (!replaceEdge(em.faces[f0], a, b, a0, b0)) { skipped++; continue; }
                if (!replaceEdge(em.faces[f1], a, b, a1, b1)) { skipped++; continue; }

                const railA = [a0], railB = [b0];
                for (let s = 1; s < segments; s++) {
                    const t = s / segments;
                    railA.push(addVertex(em, bezier2(a0p, pa, a1p, t)));
                    railB.push(addVertex(em, bezier2(b0p, pb, b1p, t)));
                }
                railA.push(a1); railB.push(b1);

                for (let s = 0; s < railA.length - 1; s++) {
                    strips.push({ verts: [railA[s], railB[s], railB[s + 1], railA[s + 1]] });
                }

                if ((endpointDegree.get(a) || 0) === 1) {
                    for (let s = 0; s < railA.length - 1; s++) strips.push({ verts: [a, railA[s + 1], railA[s]] });
                }
                if ((endpointDegree.get(b) || 0) === 1) {
                    for (let s = 0; s < railB.length - 1; s++) strips.push({ verts: [b, railB[s], railB[s + 1]] });
                }
                done++;
            }

            if (!done) {
                sys.architectureMessage = "Fusion Fillet: no manifold selected edge could be filleted.";
                return false;
            }
            em.faces.push(...strips);
            commit(em, sys, `Fusion Fillet: ${done} edge(s), radius ${radiusRequested.toFixed(3)}, ${segments} segment(s)${skipped ? `, ${skipped} skipped` : ""}.`);
            return true;
        }
    };

    NS.Fillet = FusionFilletTool;
    root.FusionFilletTool = FusionFilletTool;

    function install() {
        const sys = root.UnifiedModelingSystem;
        if (!sys) return false;
        sys.fusionFillet = options => FusionFilletTool.apply(options);
        return true;
    }
    if (!install()) {
        let tries = 0;
        const timer = setInterval(() => { if (install() || ++tries > 80) clearInterval(timer); }, 250);
    }
    console.log("[FusionFilletTool] loaded");
})(window);