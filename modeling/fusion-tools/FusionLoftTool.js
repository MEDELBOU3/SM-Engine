/**
 * FusionLoftTool.js
 * Fusion-inspired multi-profile loft for SM Engine's UnifiedModelingSystem.
 * Works on EditableMeshData (mesh topology), not a B-Rep CAD kernel.
 *
 * Usage:
 *   UnifiedModelingSystem.fusionLoft({ segments: 24, subdivisions: 4, interpolation: 'catmullrom' });
 * Select 2 or more faces that represent ordered cross-section profiles.
 */
(function (root) {
    "use strict";

    const NS = root.FusionAdvancedTools = root.FusionAdvancedTools || {};
    const EPS = 1e-8;

    function ctx() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) {
            if (sys) sys.architectureMessage = "Fusion Loft: enter Edit Mode first.";
            return null;
        }
        return { sys, em: sys.editableMesh };
    }

    function commit(em, sys, message) {
        em.faces = em.faces.filter(f => f?.verts && new Set(f.verts).size >= 3);
        em.clearSelection?.();
        sys.commitEditableMesh(true, true);
        sys.architectureMessage = message;
        root.updateModelingStatus?.(message);
        root.ModelingToolkitController?.refreshUI?.();
    }

    function facePoints(em, fi) {
        const f = em.faces[fi];
        return f?.verts?.map(vi => em.vertices[vi]?.position?.clone()).filter(Boolean) || [];
    }

    function centerOf(points) {
        const c = new THREE.Vector3();
        if (!points.length) return c;
        points.forEach(p => c.add(p));
        return c.multiplyScalar(1 / points.length);
    }

    function perimeterSample(points, count) {
        if (points.length < 3) return [];
        const lengths = [];
        let total = 0;
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            const len = a.distanceTo(b);
            lengths.push(len);
            total += len;
        }
        if (total < EPS) return [];
        const out = [];
        for (let s = 0; s < count; s++) {
            const target = total * (s / count);
            let acc = 0;
            for (let i = 0; i < points.length; i++) {
                const next = acc + lengths[i];
                if (target <= next || i === points.length - 1) {
                    const t = lengths[i] > EPS ? (target - acc) / lengths[i] : 0;
                    out.push(points[i].clone().lerp(points[(i + 1) % points.length], THREE.MathUtils.clamp(t, 0, 1)));
                    break;
                }
                acc = next;
            }
        }
        return out;
    }

    function ringError(a, b, shift, reversed) {
        let err = 0;
        const n = a.length;
        for (let i = 0; i < n; i++) {
            const j = reversed ? (shift - i + n * 8) % n : (i + shift) % n;
            err += a[i].distanceToSquared(b[j]);
        }
        return err;
    }

    function alignRing(reference, ring) {
        if (reference.length !== ring.length) return ring;
        let bestErr = Infinity, bestShift = 0, bestReverse = false;
        for (let s = 0; s < ring.length; s++) {
            const e0 = ringError(reference, ring, s, false);
            if (e0 < bestErr) { bestErr = e0; bestShift = s; bestReverse = false; }
            const e1 = ringError(reference, ring, s, true);
            if (e1 < bestErr) { bestErr = e1; bestShift = s; bestReverse = true; }
        }
        const out = [];
        const n = ring.length;
        for (let i = 0; i < n; i++) {
            const j = bestReverse ? (bestShift - i + n * 8) % n : (i + bestShift) % n;
            out.push(ring[j].clone());
        }
        return out;
    }

    function profileAxis(profiles) {
        if (profiles.length < 2) return new THREE.Vector3(0, 1, 0);
        let bestA = 0, bestB = 1, best = -Infinity;
        const centers = profiles.map(centerOf);
        for (let i = 0; i < centers.length; i++) {
            for (let j = i + 1; j < centers.length; j++) {
                const d = centers[i].distanceToSquared(centers[j]);
                if (d > best) { best = d; bestA = i; bestB = j; }
            }
        }
        const axis = centers[bestB].clone().sub(centers[bestA]);
        return axis.lengthSq() > EPS ? axis.normalize() : new THREE.Vector3(0, 1, 0);
    }

    function orderProfiles(profiles) {
        const axis = profileAxis(profiles);
        const globalCenter = centerOf(profiles.map(centerOf));
        return profiles.slice().sort((a, b) => {
            return centerOf(a).sub(globalCenter).dot(axis) - centerOf(b).sub(globalCenter).dot(axis);
        });
    }

    function makeInterpolatedRings(profiles, subdivisions, interpolation) {
        if (profiles.length === 2 || interpolation === "linear") {
            const rings = [];
            for (let p = 0; p < profiles.length - 1; p++) {
                for (let s = 0; s < subdivisions; s++) {
                    const t = s / subdivisions;
                    rings.push(profiles[p].map((v, i) => v.clone().lerp(profiles[p + 1][i], t)));
                }
            }
            rings.push(profiles[profiles.length - 1].map(v => v.clone()));
            return rings;
        }
        const cols = profiles[0].length;
        const curves = [];
        for (let c = 0; c < cols; c++) {
            curves.push(new THREE.CatmullRomCurve3(profiles.map(r => r[c].clone()), false, "centripetal", 0.5));
        }
        const totalSteps = Math.max(1, (profiles.length - 1) * subdivisions);
        const rings = [];
        for (let s = 0; s <= totalSteps; s++) {
            const t = s / totalSteps;
            rings.push(curves.map(curve => curve.getPoint(t)));
        }
        return rings;
    }

    function addRing(em, points) {
        return points.map(p => {
            const i = em.vertices.length;
            em.vertices.push({ position: p.clone() });
            return i;
        });
    }

    function buildLoft(em, rawProfiles, options = {}) {
        const count = THREE.MathUtils.clamp(Math.round(Number(options.segments) || 24), 3, 128);
        const subdivisions = THREE.MathUtils.clamp(Math.round(Number(options.subdivisions) || 3), 1, 32);
        const interpolation = options.interpolation === "linear" ? "linear" : "catmullrom";
        let profiles = orderProfiles(rawProfiles).map(p => perimeterSample(p, count));
        if (profiles.some(p => p.length !== count)) throw new Error("Could not sample one of the loft profiles.");
        for (let i = 1; i < profiles.length; i++) profiles[i] = alignRing(profiles[i - 1], profiles[i]);
        const pointsRings = makeInterpolatedRings(profiles, subdivisions, interpolation);
        const rings = pointsRings.map(r => addRing(em, r));
        const newFaces = [];
        for (let r = 0; r < rings.length - 1; r++) {
            const a = rings[r], b = rings[r + 1];
            for (let i = 0; i < count; i++) {
                const j = (i + 1) % count;
                newFaces.push({ verts: [a[i], a[j], b[j], b[i]] });
            }
        }
        if (options.capStart !== false) newFaces.push({ verts: rings[0].slice().reverse() });
        if (options.capEnd !== false) newFaces.push({ verts: rings[rings.length - 1].slice() });
        em.faces.push(...newFaces);
        return { rings, facesCreated: newFaces.length };
    }

    const FusionLoftTool = {
        loftSelectedFaces(options = {}) {
            const c = ctx();
            if (!c) return false;
            const { sys, em } = c;
            const selected = [...(em.selectedFaces || [])];
            if (selected.length < 2) {
                sys.architectureMessage = "Fusion Loft: select at least 2 profile faces.";
                return false;
            }
            const profiles = selected.map(fi => facePoints(em, fi)).filter(p => p.length >= 3);
            if (profiles.length < 2) {
                sys.architectureMessage = "Fusion Loft: selected faces are not valid profiles.";
                return false;
            }
            if (options.removeProfiles !== false) {
                const remove = new Set(selected);
                em.faces = em.faces.filter((_, fi) => !remove.has(fi));
            }
            const result = buildLoft(em, profiles, options);
            commit(em, sys, `Fusion Loft: ${profiles.length} profiles, ${result.rings.length} rings, ${result.facesCreated} faces.`);
            return true;
        },

        loftFromPointProfiles(profiles, options = {}) {
            const c = ctx();
            if (!c) return false;
            if (!Array.isArray(profiles) || profiles.length < 2) return false;
            const cleaned = profiles.map(loop => loop.map(p => p?.isVector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z)));
            const result = buildLoft(c.em, cleaned, options);
            commit(c.em, c.sys, `Fusion Loft: ${cleaned.length} external profiles lofted.`);
            return result;
        }
    };

    NS.Loft = FusionLoftTool;
    root.FusionLoftTool = FusionLoftTool;

    function install() {
        const sys = root.UnifiedModelingSystem;
        if (!sys) return false;
        sys.fusionLoft = (options) => FusionLoftTool.loftSelectedFaces(options);
        sys.fusionLoftProfiles = (profiles, options) => FusionLoftTool.loftFromPointProfiles(profiles, options);
        return true;
    }
    if (!install()) {
        let tries = 0;
        const timer = setInterval(() => { if (install() || ++tries > 80) clearInterval(timer); }, 250);
    }
    console.log("[FusionLoftTool] loaded");
})(window);