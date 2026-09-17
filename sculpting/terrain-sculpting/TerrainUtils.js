// sculpting/terrain-sculpting/TerrainUtils.js
// Small shared helpers used by terrain generation, preview and sculpting.

(() => {
    const NS = window.TerrainSculpting;
    if (!NS) throw new Error('TerrainState.js must be loaded before TerrainUtils.js');

    function getTerrainNoiseSource() {
        if (window.simplex && typeof window.simplex.noise2D === 'function') {
            return window.simplex;
        }

        if (typeof window.SimplexNoise !== 'undefined') {
            try {
                const instance = new window.SimplexNoise();
                if (typeof instance.noise2D === 'function') {
                    window.simplex = instance;
                    return instance;
                }
            } catch (_) {}
        }

        if (typeof window.createNoise2D === 'function') {
            const noise2D = window.createNoise2D();
            window.simplex = { noise2D };
            return window.simplex;
        }

        // Deterministic fallback when no external simplex-noise library is loaded.
        window.simplex = {
            noise2D(x, y) {
                const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                return (n - Math.floor(n)) * 2 - 1;
            }
        };

        return window.simplex;
    }

    function getMouseNormalized(event, canvas) {
        if (!canvas) return new THREE.Vector2();

        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        return new THREE.Vector2(x, y);
    }

    function getFalloff(distance, radius) {
        if (radius <= 0) return 0;
        const t = Math.max(0, 1 - distance / radius);
        return t * t * (3 - 2 * t);
    }

    function markAsNonSelectableBrushHelper(object3d, helperName) {
        if (!object3d) return;
        if (helperName) object3d.name = helperName;

        const mark = (obj) => {
            if (!obj) return;
            obj.userData = obj.userData || {};
            obj.userData.isSystemObject = true;
            obj.userData.selectable = false;
            obj.userData.isHelper = true;
            obj.userData.isBrushHelper = true;
            obj.userData.ignoreInHierarchy = true;
            obj.raycast = () => null;
        };

        mark(object3d);
        object3d.traverse(mark);
    }

    function disposeObject3D(object3d) {
        if (!object3d) return;

        object3d.traverse((child) => {
            if (child.geometry) child.geometry.dispose();

            const materials = Array.isArray(child.material)
                ? child.material
                : child.material ? [child.material] : [];

            for (const material of materials) {
                for (const key of Object.keys(material)) {
                    const value = material[key];
                    if (value && value.isTexture) value.dispose();
                }
                material.dispose?.();
            }
        });
    }

    NS.utils = {
        getTerrainNoiseSource,
        getMouseNormalized,
        getFalloff,
        markAsNonSelectableBrushHelper,
        disposeObject3D
    };
})();