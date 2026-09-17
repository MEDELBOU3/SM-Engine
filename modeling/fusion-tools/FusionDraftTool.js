/**
 * FusionDraftTool.js
 * Fusion-inspired Draft/Taper operation for selected faces.
 * Moves the selected face vertices relative to a neutral plane and pull direction.
 *
 * Usage:
 *   UnifiedModelingSystem.fusionDraft({ angle: 8, direction: 'y', neutral: 'min' });
 */
(function (root) {
    "use strict";

    const NS = root.FusionAdvancedTools = root.FusionAdvancedTools || {};
    const EPS = 1e-8;

    function ctx() {
        const sys = root.UnifiedModelingSystem;
        if (!sys?.isEditMode || !sys.editableMesh) {
            if (sys) sys.architectureMessage = "Fusion Draft: enter Edit Mode first.";
            return null;
        }
        return { sys, em: sys.editableMesh };
    }

    function commit(em, sys, msg) {
        em.clearSelection?.();
        sys.commitEditableMesh(true, true);
        sys.architectureMessage = msg;
        root.updateModelingStatus?.(msg);
        root.ModelingToolkitController?.refreshUI?.();
    }

    function directionVector(value) {
        if (value?.isVector3) return value.clone().normalize();
        if (value && typeof value === "object") return new THREE.Vector3(value.x || 0, value.y || 0, value.z || 0).normalize();
        switch (String(value || "y").toLowerCase()) {
            case "x": return new THREE.Vector3(1, 0, 0);
            case "-x": return new THREE.Vector3(-1, 0, 0);
            case "-y": return new THREE.Vector3(0, -1, 0);
            case "z": return new THREE.Vector3(0, 0, 1);
            case "-z": return new THREE.Vector3(0, 0, -1);
            default: return new THREE.Vector3(0, 1, 0);
        }
    }

    function selectedVertices(em) {
        const set = new Set();
        (em.selectedFaces || new Set()).forEach(fi => {
            const face = em.faces[fi];
            face?.verts?.forEach(v => set.add(v));
        });
        if (!set.size) (em.selectedVertices || new Set()).forEach(v => set.add(v));
        return [...set];
    }

    const FusionDraftTool = {
        apply(options = {}) {
            const c = ctx();
            if (!c) return false;
            const { sys, em } = c;
            const verts = selectedVertices(em);
            if (verts.length < 2) {
                sys.architectureMessage = "Fusion Draft: select one or more faces (or vertices).";
                return false;
            }

            const dir = directionVector(options.direction);
            if (dir.lengthSq() < EPS) {
                sys.architectureMessage = "Fusion Draft: invalid pull direction.";
                return false;
            }
            const angleDeg = THREE.MathUtils.clamp(Number(options.angle) || 0, -80, 80);
            const tanA = Math.tan(THREE.MathUtils.degToRad(angleDeg));
            const pts = verts.map(i => em.vertices[i].position);
            const ds = pts.map(p => p.dot(dir));
            let neutralD;
            if (options.neutralPoint) {
                const np = options.neutralPoint.isVector3 ? options.neutralPoint : new THREE.Vector3(options.neutralPoint.x || 0, options.neutralPoint.y || 0, options.neutralPoint.z || 0);
                neutralD = np.dot(dir);
            } else if (options.neutral === "max") {
                neutralD = Math.max(...ds);
            } else if (options.neutral === "center") {
                neutralD = (Math.min(...ds) + Math.max(...ds)) * 0.5;
            } else {
                neutralD = Math.min(...ds);
            }

            const centroid = new THREE.Vector3();
            pts.forEach(p => centroid.add(p));
            centroid.multiplyScalar(1 / pts.length);
            const origin = centroid.clone().addScaledVector(dir, neutralD - centroid.dot(dir));
            const symmetric = options.symmetric === true;
            let changed = 0;

            for (const vi of verts) {
                const p = em.vertices[vi].position;
                let h = p.dot(dir) - neutralD;
                if (symmetric) h = Math.abs(h);
                if (Math.abs(h) < EPS) continue;
                const axisPoint = origin.clone().addScaledVector(dir, p.dot(dir) - neutralD);
                const radial = p.clone().sub(axisPoint);
                const r = radial.length();
                if (r < EPS) continue;
                const newR = Math.max(EPS, r + tanA * h);
                radial.multiplyScalar(newR / r);
                p.copy(axisPoint.add(radial));
                changed++;
            }

            if (!changed) {
                sys.architectureMessage = "Fusion Draft: selection lies on the neutral plane; nothing changed.";
                return false;
            }
            commit(em, sys, `Fusion Draft: ${angleDeg.toFixed(2)}°, direction (${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)}), ${changed} vertex/vertices.`);
            return true;
        }
    };

    NS.Draft = FusionDraftTool;
    root.FusionDraftTool = FusionDraftTool;

    function install() {
        const sys = root.UnifiedModelingSystem;
        if (!sys) return false;
        sys.fusionDraft = options => FusionDraftTool.apply(options);
        return true;
    }
    if (!install()) {
        let tries = 0;
        const timer = setInterval(() => { if (install() || ++tries > 80) clearInterval(timer); }, 250);
    }
    console.log("[FusionDraftTool] loaded");
})(window);