/**
 * FusionPatternTool.js
 * Fusion-inspired pattern family for UnifiedModelingSystem.
 * Includes Circular Pattern, Rectangular Pattern, and Pattern Along Active Spline.
 *
 * Usage examples:
 *   UnifiedModelingSystem.fusionCircularPattern({ count: 8, axis: 'y', angle: 360 });
 *   UnifiedModelingSystem.fusionRectangularPattern({ countX: 4, countY: 3, spacingX: 1, spacingY: 1 });
 *   UnifiedModelingSystem.fusionPathPattern({ count: 10, align: true });
 */
(function (root) {
    "use strict";

    const NS = root.FusionAdvancedTools = root.FusionAdvancedTools || {};
    const EPS = 1e-8;

    function ctx() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) {
            if (sys) sys.architectureMessage = "Fusion Pattern: enter Edit Mode first.";
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

    function axisVector(axis) {
        if (axis?.isVector3) return axis.clone().normalize();
        if (axis && typeof axis === "object") return new THREE.Vector3(axis.x || 0, axis.y || 0, axis.z || 0).normalize();
        switch (String(axis || "y").toLowerCase()) {
            case "x": return new THREE.Vector3(1, 0, 0);
            case "z": return new THREE.Vector3(0, 0, 1);
            case "-x": return new THREE.Vector3(-1, 0, 0);
            case "-y": return new THREE.Vector3(0, -1, 0);
            case "-z": return new THREE.Vector3(0, 0, -1);
            default: return new THREE.Vector3(0, 1, 0);
        }
    }

    function selectedFaceIndices(em, wholeIfEmpty = false) {
        const selected = [...(em.selectedFaces || [])];
        if (selected.length) return selected;
        if (wholeIfEmpty) return em.faces.map((_, i) => i);
        return [];
    }

    function selectionCenter(em, faceIndices) {
        const set = new Set();
        faceIndices.forEach(fi => em.faces[fi]?.verts?.forEach(v => set.add(v)));
        const c = new THREE.Vector3();
        if (!set.size) return c;
        set.forEach(v => c.add(em.vertices[v].position));
        return c.multiplyScalar(1 / set.size);
    }

    function cloneFaces(em, faceIndices, transform) {
        const map = new Map();
        const outFaces = [];
        const mapVertex = old => {
            if (map.has(old)) return map.get(old);
            const p = transform(em.vertices[old].position.clone(), old);
            const idx = em.vertices.length;
            em.vertices.push({ position: p });
            map.set(old, idx);
            return idx;
        };
        faceIndices.forEach(fi => {
            const f = em.faces[fi];
            if (!f?.verts?.length) return;
            outFaces.push({ verts: f.verts.map(mapVertex) });
        });
        em.faces.push(...outFaces);
        return outFaces.length;
    }

    function splinePointsLocal(sys) {
        const engine = root.SplineExtrudeEngine;
        let pts = engine?.pathPoints || engine?.points || null;
        if (!Array.isArray(pts) || pts.length < 2) return null;
        const inv = sys.activeMesh?.matrixWorld?.clone()?.invert?.();
        return pts.map(p => {
            const v = p?.isVector3 ? p.clone() : new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
            return inv ? v.applyMatrix4(inv) : v;
        });
    }

    const FusionPatternTool = {
        circular(options = {}) {
            const c = ctx();
            if (!c) return false;
            const { sys, em } = c;
            const faces = selectedFaceIndices(em, options.wholeMesh === true);
            if (!faces.length) {
                sys.architectureMessage = "Fusion Circular Pattern: select faces first.";
                return false;
            }
            const count = THREE.MathUtils.clamp(Math.round(Number(options.count) || 4), 2, 128);
            const totalDeg = Number(options.angle ?? 360);
            const axis = axisVector(options.axis);
            const pivot = options.pivot?.isVector3 ? options.pivot.clone() : (options.pivot ? new THREE.Vector3(options.pivot.x || 0, options.pivot.y || 0, options.pivot.z || 0) : selectionCenter(em, faces));
            const full = Math.abs(Math.abs(totalDeg) - 360) < 1e-5;
            const step = THREE.MathUtils.degToRad(totalDeg / (full ? count : Math.max(1, count - 1)));
            let made = 0;
            const q = new THREE.Quaternion();
            for (let i = 1; i < count; i++) {
                q.setFromAxisAngle(axis, step * i);
                made += cloneFaces(em, faces, p => p.sub(pivot).applyQuaternion(q).add(pivot));
            }
            commit(em, sys, `Fusion Circular Pattern: ${count} instances, ${totalDeg.toFixed(1)}°, ${made} new face(s).`);
            return true;
        },

        rectangular(options = {}) {
            const c = ctx();
            if (!c) return false;
            const { sys, em } = c;
            const faces = selectedFaceIndices(em, options.wholeMesh === true);
            if (!faces.length) {
                sys.architectureMessage = "Fusion Rectangular Pattern: select faces first.";
                return false;
            }
            const countX = THREE.MathUtils.clamp(Math.round(Number(options.countX) || 3), 1, 64);
            const countY = THREE.MathUtils.clamp(Math.round(Number(options.countY) || 1), 1, 64);
            const spacingX = Number(options.spacingX) || 1;
            const spacingY = Number(options.spacingY) || 1;
            const dirX = axisVector(options.directionX || "x");
            let dirY = axisVector(options.directionY || "z");
            if (Math.abs(dirX.dot(dirY)) > 0.999) dirY = new THREE.Vector3(0, 0, 1);
            let made = 0;
            for (let y = 0; y < countY; y++) {
                for (let x = 0; x < countX; x++) {
                    if (x === 0 && y === 0) continue;
                    const offset = dirX.clone().multiplyScalar(x * spacingX).addScaledVector(dirY, y * spacingY);
                    made += cloneFaces(em, faces, p => p.add(offset));
                }
            }
            commit(em, sys, `Fusion Rectangular Pattern: ${countX} × ${countY}, ${made} new face(s).`);
            return true;
        },

        alongActiveSpline(options = {}) {
            const c = ctx();
            if (!c) return false;
            const { sys, em } = c;
            const faces = selectedFaceIndices(em, options.wholeMesh === true);
            if (!faces.length) {
                sys.architectureMessage = "Fusion Path Pattern: select faces first.";
                return false;
            }
            const pts = splinePointsLocal(sys);
            if (!pts) {
                sys.architectureMessage = "Fusion Path Pattern: choose a spline first with the Extrude Along Spline picker.";
                return false;
            }
            const curve = new THREE.CatmullRomCurve3(pts, options.closed === true, "centripetal", 0.5);
            const count = THREE.MathUtils.clamp(Math.round(Number(options.count) || 6), 2, 128);
            const align = options.align !== false;
            const sourceCenter = selectionCenter(em, faces);
            const start = curve.getPointAt(0);
            const baseTangent = curve.getTangentAt(0).normalize();
            let made = 0;
            for (let i = 1; i < count; i++) {
                const t = options.closed === true ? i / count : i / (count - 1);
                const point = curve.getPointAt(t);
                const tangent = curve.getTangentAt(t).normalize();
                const q = align ? new THREE.Quaternion().setFromUnitVectors(baseTangent, tangent) : new THREE.Quaternion();
                made += cloneFaces(em, faces, p => {
                    p.sub(sourceCenter);
                    if (align) p.applyQuaternion(q);
                    return p.add(point).add(sourceCenter.clone().sub(start));
                });
            }
            commit(em, sys, `Fusion Path Pattern: ${count} instances along active spline, ${made} new face(s).`);
            return true;
        }
    };

    NS.Pattern = FusionPatternTool;
    root.FusionPatternTool = FusionPatternTool;

    function install() {
        const sys = root.UnifiedModelingSystem;
        if (!sys) return false;
        sys.fusionCircularPattern = options => FusionPatternTool.circular(options);
        sys.fusionRectangularPattern = options => FusionPatternTool.rectangular(options);
        sys.fusionPathPattern = options => FusionPatternTool.alongActiveSpline(options);
        return true;
    }
    if (!install()) {
        let tries = 0;
        const timer = setInterval(() => { if (install() || ++tries > 80) clearInterval(timer); }, 250);
    }
    console.log("[FusionPatternTool] loaded");
})(window);