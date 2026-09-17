// engine/game-mode-environment/GameModeFacilityLayout.js
// Image-inspired compact arena: one room, four doorways, ramps, platforms, cover and objective.
(function () {
    'use strict';

    function build(root) {
        const cfg = window.SMGameModeEnvironmentConfig;
        const kit = window.SMGameModeBuildingKit;
        const factory = window.SMGameModeObstacleFactory;
        const l = cfg.layout;

        const arena = new THREE.Group();
        arena.name = 'Arena_Blockout';
        kit.tag(arena, { collidable: false, category: 'arena-root' });

        // Real cubic arena floor. Top is exactly y=0; thickness is visible from outside.
        kit.createArenaFoundation(arena);

        // Thick perimeter walls with clean empty doorway openings. No door meshes.
        kit.addPerimeterWalls(arena);

        // Left choke passage inspired by the reference layout.
        factory.createChokePoint(arena, l.choke);

        // Upper-left ramp and its elevated landing.
        kit.addBox(arena, {
            name: 'Ramp1_Landing',
            type: 'structure',
            size: [10.5, l.ramp1.rise, 7.5],
            position: [-27.5, l.ramp1.rise * 0.5, -15.0],
            category: 'platform'
        });
        kit.addSlopeRamp(arena, {
            name: 'Ramp_1',
            start: l.ramp1.start,
            run: l.ramp1.run,
            width: l.ramp1.width,
            rise: l.ramp1.rise,
            direction: l.ramp1.direction
        });

        // Main readable blockout platforms.
        factory.createPlatform(arena, {
            name: 'Platform_A',
            center: l.platformA.center,
            size: l.platformA.size,
            label: 'PLATFORM A'
        });

        factory.createPlatform(arena, {
            name: 'Platform_C',
            center: l.platformC.center,
            size: l.platformC.size,
            label: 'PLATFORM C'
        });

        factory.createCoverObstacle(arena, {
            name: 'Cover_Obstacle',
            center: l.cover.center,
            size: l.cover.size
        });

        // Objective is neutral gray, not a blue ring.
        factory.createObjectivePlaza(arena, l.objective);

        // Lower-right staircase / Ramp 2.
        kit.addStaircase(arena, {
            name: 'Ramp_2_Staircase',
            start: l.stairs.start,
            steps: l.stairs.steps,
            width: l.stairs.width,
            stepDepth: l.stairs.stepDepth,
            stepHeight: l.stairs.stepHeight,
            direction: l.stairs.direction
        });

        // Small tactical cover behind Platform A, like the reference tactical position.
        kit.addBox(arena, {
            name: 'Tactical_Position_Cover',
            type: 'dark',
            size: [5.0, 1.10, 0.65],
            position: [-18.0, 0.55, 12.0],
            category: 'cover'
        });

        root.add(arena);
        return root;
    }

    window.SMGameModeFacilityLayout = { build };
})();
