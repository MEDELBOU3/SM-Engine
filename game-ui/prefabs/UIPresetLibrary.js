/**
 * GAME-UI/prefabs/UIPresetLibrary.js
 * ------------------------------------------------------------
 * Built-in reusable Game UI prefab presets.
 */
(function () {
    'use strict';

    class UIPresetLibrary {
        constructor(options = {}) {
            this.prefabManager =
                options.prefabManager ||
                window.uiPrefabManager ||
                null;

            this.registerBuiltIns();
        }

        registerBuiltIns() {
            const manager =
                this.prefabManager ||
                window.uiPrefabManager;

            if (!manager) {
                console.warn('[UIPresetLibrary] UIPrefabManager is unavailable.');
                return this;
            }

            manager.register(
                'HealthBar',
                {
                    category: 'HUD',
                    description: 'Player health bar with title and bound value.',
                    tags: ['hud', 'health', 'player'],
                    root: {
                        type: 'panel',
                        name: 'Health Bar',
                        x: 60,
                        y: 60,
                        width: 320,
                        height: 64,
                        background: 'rgba(0,0,0,0.35)',
                        borderRadius: 4,
                        children: [
                            {
                                type: 'text',
                                name: 'Health Label',
                                x: 10,
                                y: 6,
                                width: 120,
                                height: 22,
                                text: 'HEALTH',
                                fontSize: 14,
                                fontWeight: 600,
                                color: '#ffffff',
                                children: []
                            },
                            {
                                type: 'progressBar',
                                name: 'Health Value',
                                x: 10,
                                y: 34,
                                width: 300,
                                height: 18,
                                min: 0,
                                max: 100,
                                value: 100,
                                fillColor: '#ffffff',
                                background: 'rgba(255,255,255,0.12)',
                                bindings: {
                                    value: {
                                        source: 'player',
                                        path: 'health',
                                        mode: 'one-way'
                                    }
                                },
                                children: []
                            }
                        ]
                    }
                }
            );

            manager.register(
                'AmmoHUD',
                {
                    category: 'HUD',
                    description: 'Weapon ammunition counter.',
                    tags: ['hud', 'ammo', 'weapon'],
                    root: {
                        type: 'panel',
                        name: 'Ammo HUD',
                        x: 1680,
                        y: 940,
                        width: 190,
                        height: 90,
                        background: 'rgba(0,0,0,0.28)',
                        anchor: {
                            minX: 1,
                            minY: 1,
                            maxX: 1,
                            maxY: 1
                        },
                        pivot: {
                            x: 1,
                            y: 1
                        },
                        children: [
                            {
                                type: 'text',
                                name: 'Current Ammo',
                                x: 12,
                                y: 10,
                                width: 90,
                                height: 46,
                                text: '30',
                                fontSize: 36,
                                fontWeight: 700,
                                color: '#ffffff',
                                bindings: {
                                    text: {
                                        source: 'weapon',
                                        path: 'currentAmmo',
                                        transform: 'string'
                                    }
                                },
                                children: []
                            },
                            {
                                type: 'text',
                                name: 'Reserve Ammo',
                                x: 108,
                                y: 24,
                                width: 66,
                                height: 26,
                                text: '120',
                                fontSize: 18,
                                fontWeight: 500,
                                color: '#cfcfcf',
                                bindings: {
                                    text: {
                                        source: 'weapon',
                                        path: 'reserveAmmo',
                                        transform: 'string'
                                    }
                                },
                                children: []
                            },
                            {
                                type: 'text',
                                name: 'Weapon Name',
                                x: 12,
                                y: 62,
                                width: 160,
                                height: 20,
                                text: 'WEAPON',
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#bdbdbd',
                                bindings: {
                                    text: {
                                        source: 'weapon',
                                        path: 'name',
                                        transform: 'uppercase'
                                    }
                                },
                                children: []
                            }
                        ]
                    }
                }
            );

            manager.register(
                'ObjectiveCard',
                {
                    category: 'HUD',
                    description: 'Objective text card for missions and gameplay tasks.',
                    tags: ['hud', 'objective', 'mission'],
                    root: {
                        type: 'panel',
                        name: 'Objective Card',
                        x: 60,
                        y: 150,
                        width: 430,
                        height: 88,
                        background: 'rgba(0,0,0,0.28)',
                        children: [
                            {
                                type: 'text',
                                name: 'Objective Header',
                                x: 12,
                                y: 8,
                                width: 180,
                                height: 20,
                                text: 'OBJECTIVE',
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#bcbcbc',
                                children: []
                            },
                            {
                                type: 'text',
                                name: 'Objective Text',
                                x: 12,
                                y: 34,
                                width: 400,
                                height: 42,
                                text: 'Reach the extraction point',
                                fontSize: 18,
                                fontWeight: 500,
                                color: '#ffffff',
                                bindings: {
                                    text: {
                                        source: 'game',
                                        path: 'currentObjective',
                                        transform: 'string'
                                    }
                                },
                                children: []
                            }
                        ]
                    }
                }
            );

            manager.register(
                'PauseMenu',
                {
                    category: 'Menu',
                    description: 'Reusable pause menu.',
                    tags: ['menu', 'pause'],
                    root: {
                        type: 'panel',
                        name: 'Pause Menu',
                        x: 0,
                        y: 0,
                        width: 0,
                        height: 0,
                        background: 'rgba(0,0,0,0.62)',
                        anchor: {
                            minX: 0,
                            minY: 0,
                            maxX: 1,
                            maxY: 1
                        },
                        children: [
                            {
                                type: 'panel',
                                name: 'Pause Menu Content',
                                x: 960,
                                y: 540,
                                width: 360,
                                height: 360,
                                background: '#2f2f2f',
                                pivot: {
                                    x: 0.5,
                                    y: 0.5
                                },
                                anchor: {
                                    minX: 0.5,
                                    minY: 0.5,
                                    maxX: 0.5,
                                    maxY: 0.5
                                },
                                children: [
                                    {
                                        type: 'text',
                                        name: 'Pause Title',
                                        x: 30,
                                        y: 25,
                                        width: 300,
                                        height: 44,
                                        text: 'PAUSED',
                                        textAlign: 'center',
                                        fontSize: 30,
                                        fontWeight: 700,
                                        color: '#ffffff',
                                        children: []
                                    },
                                    {
                                        type: 'button',
                                        name: 'Resume Button',
                                        x: 50,
                                        y: 100,
                                        width: 260,
                                        height: 46,
                                        text: 'Resume',
                                        events: {
                                            click: {
                                                action: 'invoke',
                                                target: 'game',
                                                method: 'resumeGame'
                                            }
                                        },
                                        children: []
                                    },
                                    {
                                        type: 'button',
                                        name: 'Settings Button',
                                        x: 50,
                                        y: 165,
                                        width: 260,
                                        height: 46,
                                        text: 'Settings',
                                        events: {
                                            click: {
                                                action: 'invoke',
                                                target: 'game',
                                                method: 'openSettings'
                                            }
                                        },
                                        children: []
                                    },
                                    {
                                        type: 'button',
                                        name: 'Quit Button',
                                        x: 50,
                                        y: 230,
                                        width: 260,
                                        height: 46,
                                        text: 'Quit',
                                        events: {
                                            click: {
                                                action: 'invoke',
                                                target: 'game',
                                                method: 'quitToMenu'
                                            }
                                        },
                                        children: []
                                    }
                                ]
                            }
                        ]
                    }
                }
            );

            manager.register(
                'InventorySlot',
                {
                    category: 'Inventory',
                    description: 'Basic inventory slot with icon and quantity.',
                    tags: ['inventory', 'slot', 'item'],
                    root: {
                        type: 'panel',
                        name: 'Inventory Slot',
                        x: 0,
                        y: 0,
                        width: 82,
                        height: 82,
                        background: '#3a3a3a',
                        borderColor: '#555555',
                        borderWidth: 1,
                        children: [
                            {
                                type: 'image',
                                name: 'Item Icon',
                                x: 9,
                                y: 9,
                                width: 64,
                                height: 64,
                                src: '',
                                objectFit: 'contain',
                                children: []
                            },
                            {
                                type: 'text',
                                name: 'Item Quantity',
                                x: 50,
                                y: 54,
                                width: 24,
                                height: 18,
                                text: '1',
                                fontSize: 12,
                                fontWeight: 700,
                                textAlign: 'right',
                                color: '#ffffff',
                                children: []
                            }
                        ]
                    }
                }
            );

            return this;
        }

        getNames() {
            return this.prefabManager?.getNames?.() || [];
        }

        create(name, options = {}) {
            return this.prefabManager?.instantiate?.(
                name,
                options
            ) || null;
        }
    }

    window.UIPresetLibrary =
        UIPresetLibrary;

    if (!window.uiPresetLibrary) {
        window.uiPresetLibrary =
            new UIPresetLibrary();
    }
})();