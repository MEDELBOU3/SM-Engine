// sculpting/vegetation/VegetationPresets.js

window.VegetationPresets = {
    createGrass() {
        const geom = new THREE.BufferGeometry();
        
        // Procedurally construct crossing grass blades
        const width = 0.2;
        const height = 0.7;
        const vertices = new Float32Array([
            -width, 0, 0,  width, 0, 0,  0, height, 0,
            0, 0, -width,  0, 0, width,  0, height, 0
        ]);

        const uvs = new Float32Array([
            0, 0,  1, 0,  0.5, 1,
            0, 0,  1, 0,  0.5, 1
        ]);

        const indices = [0, 1, 2, 3, 4, 5];

        geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        // Custom stylized grass gradient material
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 16, 0, 0);
        grad.addColorStop(0, '#15320e');
        grad.addColorStop(0.3, '#356e21');
        grad.addColorStop(1, '#81cc3f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            side: THREE.DoubleSide,
            shadowSide: THREE.DoubleSide,
            alphaTest: 0.1,
            roughness: 0.8
        });

        return new THREE.Mesh(geom, mat);
    },

    createTree() {
        const trunkGeom = new THREE.CylinderGeometry(0.12, 0.2, 2.5, 8);
        trunkGeom.translate(0, 1.25, 0);
        
        // Canopy spheres
        const leaves1 = new THREE.SphereGeometry(1.2, 8, 8);
        leaves1.translate(0, 3, 0);
        const leaves2 = new THREE.SphereGeometry(0.9, 8, 8);
        leaves2.translate(0.5, 3.8, 0.3);

        const geometryUtils = THREE.BufferGeometryUtils || window.BufferGeometryUtils;
        // Older Three.js builds expose BufferGeometryUtils on window instead
        // of THREE. Keep a safe trunk-only fallback so the painter still works
        // when the optional utility script was not loaded.
        const mergedGeom = geometryUtils?.mergeBufferGeometries
            ? geometryUtils.mergeBufferGeometries([trunkGeom, leaves1, leaves2])
            : (() => {
                const fallback = new THREE.ConeGeometry(0.95, 2.4, 8);
                fallback.translate(0, 1.7, 0);
                return fallback;
            })();

        // Simple Multi-Material or generic color
        const mat = new THREE.MeshStandardMaterial({
            color: 0x2c4e20,
            roughness: 0.9,
            metalness: 0.1
        });

        return new THREE.Mesh(mergedGeom, mat);
    }
};
