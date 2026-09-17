// engine/game-mode-environment/GameModeEnvironmentConfig.js
// SM Engine — compact Unreal-style Game Mode test arena.
(function () {
    'use strict';

    window.SMGameModeEnvironmentConfig = {
        version: 'sm-game-mode-arena-v3',

        arena: {
            width: 68,
            depth: 48,
            floorThickness: 1.20,
            wallHeight: 5.0,
            wallThickness: 0.60,
            tileSize: 2.0,

            doorway: {
                north: { width: 5.5, offset: 0 },
                south: { width: 5.5, offset: 0 },
                east: { width: 5.0, offset: 3.0 },
                west: { width: 4.2, offset: 2.0 }
            }
        },

        layout: {
            platformA: { center: [-17, 4], size: [11, 2.0, 9] },
            platformC: { center: [17, -10], size: [13, 2.8, 10] },
            cover: { center: [15, 5], size: [5.5, 1.55, 4.5] },
            objective: { center: [0, 0], radius: 3.6 },
            ramp1: { start: [-23, -14], run: 10, width: 5.0, rise: 2.8, direction: 'east' },
            stairs: { start: [8, 16], steps: 8, width: 5.2, stepDepth: 0.70, stepHeight: 0.30, direction: 'north' },
            choke: { centerZ: 2.0, innerLength: 5.0, gap: 4.2 }
        },

        style: {
            showLabels: false,
            monochrome: true
        },

        colors: {
            arenaSide: 0x343a42,
            floor: 0xd5d8db,
            gridMinor: 'rgba(70,76,82,0.22)',
            gridMajor: 'rgba(48,54,60,0.40)',
            wall: 0x8f979f,
            structure: 0xb8bec4,
            structureDark: 0x747d86,
            objective: 0xb6bcc2,
            objectiveTop: 0xd7dade,
            objectiveMark: 0x4d555e,
            accent: 0x8b939b,
            labelText: '#20252a'
        }
    };
})();