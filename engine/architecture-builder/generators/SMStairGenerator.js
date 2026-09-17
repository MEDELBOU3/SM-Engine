// engine/architecture/generators/SMStairGenerator.js
(function (global) {
    'use strict';

    class SMStairGenerator {
        constructor(context) {
            this.context = context;
        }

        generate(stair, floor) {
            const THREE = global.THREE;
            const Geo = global.SMArchitecturalGeometry;
            const group = new THREE.Group();
            group.name = stair.id;
            group.userData.smArchitectureType = 'stair';
            group.userData.smStairId = stair.id;

            const dx = stair.to[0] - stair.from[0];
            const dz = stair.to[1] - stair.from[1];
            const planLength = Math.max(0.001, Math.hypot(dx, dz));
            const angle = Math.atan2(dz, dx);
            const totalRise = Math.max(0.01, stair.targetElevation - stair.elevation);
            const steps = stair.steps > 0
                ? stair.steps
                : Math.max(1, Math.round(totalRise / stair.rise));
            const rise = totalRise / steps;
            const run = planLength / steps;
            const material = this.context.materials.resolve(
                stair.material,
                this.context.map.materials
            );

            for (let i = 0; i < steps; i++) {
                const treadDepth = run + 0.002;
                const stepHeight = rise * (i + 1);
                const geometry = Geo.createBox(treadDepth, stepHeight, stair.width);
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = `${stair.id}:step_${i + 1}`;

                const along = run * (i + 0.5);
                const t = along / planLength;
                mesh.position.set(
                    stair.from[0] + dx * t,
                    floor.elevation + stair.elevation + stepHeight * 0.5,
                    stair.from[1] + dz * t
                );
                mesh.rotation.y = -angle;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData.smArchitectureType = 'stair-step';
                group.add(mesh);
            }

            return group;
        }
    }

    global.SMStairGenerator = SMStairGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
