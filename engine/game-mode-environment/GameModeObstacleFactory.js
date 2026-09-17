// engine/game-mode-environment/GameModeObstacleFactory.js
(function () {
    'use strict';

    function createPlatform(group, { name, center, size, label = null }) {
        const kit = window.SMGameModeBuildingKit;
        const mesh = kit.addBox(group, {
            name,
            type: 'structure',
            size: [size[0], size[1], size[2]],
            position: [center[0], size[1] * 0.5, center[1]],
            category: 'platform'
        });

        if (label) {
            kit.addSurfaceLabel(group, {
                name: `${name}_Label`, text: label,
                position: [center[0], size[1] + 0.03, center[1]],
                size: [Math.min(size[0] - 1, 7), 1.1]
            });
        }
        return mesh;
    }

    function createCoverObstacle(group, { name, center, size }) {
        return window.SMGameModeBuildingKit.addBox(group, {
            name,
            type: 'dark',
            size: [size[0], size[1], size[2]],
            position: [center[0], size[1] * 0.5, center[1]],
            category: 'cover'
        });
    }

    function createObjectivePlaza(group, { center, radius }) {
        const kit = window.SMGameModeBuildingKit;
        const root = new THREE.Group();
        root.name = 'Central_Objective_Plaza';
        kit.tag(root, { collidable: false, category: 'objective' });

        const tiers = [
            { radius, height: 0.20, y: 0.10, type: 'dark' },
            { radius: radius * 0.80, height: 0.24, y: 0.32, type: 'objective' },
            { radius: radius * 0.58, height: 0.28, y: 0.58, type: 'objectiveTop' }
        ];

        tiers.forEach((tier, index) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(tier.radius, tier.radius, tier.height, 48),
                kit.material(tier.type)
            );
            mesh.name = `Objective_Tier_${index + 1}`;
            mesh.position.set(center[0], tier.y, center[1]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            kit.tag(mesh, { collidable: true, category: 'objective' });
            mesh.userData.physicsShape = 'cylinder';
            mesh.userData.physicsSize = [tier.radius * 2, tier.height, tier.radius * 2];
            root.add(mesh);
        });

        const star = new THREE.Shape();
        const outer = radius * 0.34;
        const inner = outer * 0.44;
        for (let i = 0; i < 10; i += 1) {
            const a = -Math.PI * 0.5 + i * Math.PI / 5;
            const r = i % 2 === 0 ? outer : inner;
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;
            if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
        }
        star.closePath();

        const mark = new THREE.Mesh(
            new THREE.ShapeGeometry(star),
            kit.material('mark')
        );
        mark.name = 'Objective_Star';
        mark.rotation.x = -Math.PI * 0.5;
        mark.position.set(center[0], 0.735, center[1]);
        mark.renderOrder = 6;
        kit.tag(mark, { collidable: false, category: 'objective-mark' });
        root.add(mark);

        group.add(root);
        return root;
    }

    function createChokePoint(group, { centerZ, innerLength, gap }) {
        const kit = window.SMGameModeBuildingKit;
        const halfGap = gap * 0.5;
        const wallX = -window.SMGameModeEnvironmentConfig.arena.width * 0.5;
        const t = window.SMGameModeEnvironmentConfig.arena.wallThickness;
        const h = 3.4;

        kit.addBox(group, {
            name: 'Choke_Fin_North',
            type: 'wall',
            size: [innerLength, h, t],
            position: [wallX + innerLength * 0.5, h * 0.5, centerZ - halfGap],
            category: 'choke'
        });

        kit.addBox(group, {
            name: 'Choke_Fin_South',
            type: 'wall',
            size: [innerLength, h, t],
            position: [wallX + innerLength * 0.5, h * 0.5, centerZ + halfGap],
            category: 'choke'
        });
    }

    window.SMGameModeObstacleFactory = {
        createPlatform,
        createCoverObstacle,
        createObjectivePlaza,
        createChokePoint
    };
})();