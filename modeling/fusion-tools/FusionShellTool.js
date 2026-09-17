/**
 * FusionShellTool.js
 * Shell / hollow-body tool for UnifiedModelingSystem.
 * Select faces to remove as openings, then run fusionShell().
 *
 * Usage:
 *   UnifiedModelingSystem.fusionShell({ thickness: 0.12, direction: 'inside' });
 */
(function (root) {
    "use strict";

    const NS = root.FusionAdvancedTools = root.FusionAdvancedTools || {};
    const EPS = 1e-8;
    const edgeKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;

    function ctx() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) {
            if (sys) sys.architectureMessage = "Fusion Shell: enter Edit Mode first.";
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

    function faceNormal(em, face) {
        if (!face?.verts || face.verts.length < 3) return new THREE.Vector3();
        const a = em.vertices[face.verts[0]].position;
        const b = em.vertices[face.verts[1]].position;
        const c = em.vertices[face.verts[2]].position;
        return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    }

    function buildNormals(em, faces) {
        const normals = em.vertices.map(() => new THREE.Vector3());
        faces.forEach(face => {
            const n = faceNormal(em, face);
            face.verts.forEach(vi => normals[vi].add(n));
        });
        normals.forEach(n => {
            if (n.lengthSq() > EPS) n.normalize();
        });
        return normals;
    }

    function boundaryEdges(faces) {
        const map = new Map();
        faces.forEach(face => {
            const v = face.verts;
            for (let i = 0; i < v.length; i++) {
                const a = v[i], b = v[(i + 1) % v.length];
                const k = edgeKey(a, b);
                const rec = map.get(k) || { count: 0, a, b };
                rec.count++;
                map.set(k, rec);
            }
        });
        return [...map.values()].filter(e => e.count === 1);
    }

    const FusionShellTool = {
        apply(options = {}) {
            const c = ctx();
            if (!c) return false;
            const { sys, em } = c;
            const thickness = Math.max(1e-5, Math.abs(Number(options.thickness) || 0.1));
            const direction = options.direction === "outside" ? 1 : -1;
            const openings = new Set([...(em.selectedFaces || [])]);
            const retained = em.faces.filter((_, fi) => !openings.has(fi)).map(f => ({ verts: f.verts.slice() }));
            if (!retained.length) {
                sys.architectureMessage = "Fusion Shell: no faces remain after removing the opening selection.";
                return false;
            }

            const normals = buildNormals(em, retained);
            const used = new Set();
            retained.forEach(f => f.verts.forEach(v => used.add(v)));
            const innerMap = new Map();
            used.forEach(vi => {
                const p = em.vertices[vi].position;
                const n = normals[vi];
                const idx = em.vertices.length;
                em.vertices.push({ position: p.clone().addScaledVector(n, thickness * direction) });
                innerMap.set(vi, idx);
            });

            const innerFaces = retained.map(f => ({ verts: f.verts.map(v => innerMap.get(v)).reverse() }));
            const rims = [];
            for (const edge of boundaryEdges(retained)) {
                const ia = innerMap.get(edge.a), ib = innerMap.get(edge.b);
                if (ia == null || ib == null) continue;
                rims.push({ verts: [edge.a, edge.b, ib, ia] });
            }

            em.faces = [...retained, ...innerFaces, ...rims];
            commit(em, sys, `Fusion Shell: thickness ${thickness.toFixed(3)} (${direction < 0 ? "inside" : "outside"}), ${openings.size} opening face(s), ${rims.length} rim face(s).`);
            return true;
        }
    };

    NS.Shell = FusionShellTool;
    root.FusionShellTool = FusionShellTool;

    function install() {
        const sys = root.UnifiedModelingSystem;
        if (!sys) return false;
        sys.fusionShell = options => FusionShellTool.apply(options);
        return true;
    }
    if (!install()) {
        let tries = 0;
        const timer = setInterval(() => { if (install() || ++tries > 80) clearInterval(timer); }, 250);
    }
    console.log("[FusionShellTool] loaded");
})(window);