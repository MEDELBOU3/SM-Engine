/**
 * MODIFIERS SYSTEM - Configuration & Default Presets
 * 
 * Pre-configured modifier combinations for common use cases.
 * Load these with: SMModifiers.applyPreset(objectName, presetName)
 */

(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    root.Config = {
        // Default parameters for all modifiers
        defaults: {
            updateInterval: 16, // ms (60fps)
            cacheSize: 100,
            maxModifiersPerObject: 20,
            enableAutoOptimization: true,
            enableGPUCompute: false,
            gpuComputeThreshold: 10000 // vertices
        },

        // Performance settings
        performance: {
            lowPerformance: {
                updateInterval: 32, // 30fps
                maxModifiers: 5,
                enableAutoOptimization: true
            },
            normalPerformance: {
                updateInterval: 16, // 60fps
                maxModifiers: 15,
                enableAutoOptimization: true
            },
            highPerformance: {
                updateInterval: 8, // 120fps
                maxModifiers: 30,
                enableAutoOptimization: true
            }
        },

        // Theme settings
        theme: {
            darkMode: {
                backgroundColor: '#1e1e1e',
                textColor: '#ffffff',
                accentColor: '#0d47a1',
                hoverColor: '#2d2d2d'
            },
            lightMode: {
                backgroundColor: '#ffffff',
                textColor: '#333333',
                accentColor: '#1976d2',
                hoverColor: '#f5f5f5'
            }
        }
    };

    // ========================================================================
    // PRESET LIBRARY
    // ========================================================================

    root.Presets = {
        // ====== GEOMETRY GENERATION ======
        basicArray: {
            name: 'Basic Array',
            category: 'Generate',
            modifiers: [
                { type: 'array', params: { count: 3, spacing: 1, axis: 'x' } }
            ]
        },

        gridArray: {
            name: 'Grid Array',
            category: 'Generate',
            modifiers: [
                { type: 'array', params: { count: 3, spacing: 1, axis: 'x' } },
                { type: 'array', params: { count: 3, spacing: 1, axis: 'z' } }
            ]
        },

        mirrorSymmetrical: {
            name: 'Mirror Symmetrical',
            category: 'Generate',
            modifiers: [
                { type: 'mirror', params: { axis: 'x', mergeOriginal: true } }
            ]
        },

        multiArray: {
            name: 'Multi-Axis Array',
            category: 'Generate',
            modifiers: [
                { type: 'array', params: { count: 2, spacing: 2, axis: 'x' } },
                { type: 'array', params: { count: 2, spacing: 2, axis: 'y' } },
                { type: 'array', params: { count: 2, spacing: 2, axis: 'z' } }
            ]
        },

        // ====== DEFORMATION ======
        gentleBend: {
            name: 'Gentle Bend',
            category: 'Deform',
            modifiers: [
                { type: 'bend', params: { strength: 0.15, axis: 'y' } }
            ]
        },

        spiralTwist: {
            name: 'Spiral Twist',
            category: 'Deform',
            modifiers: [
                { type: 'twist', params: { strength: 180, axis: 'z' } },
                { type: 'bend', params: { strength: 0.3, axis: 'y' } }
            ]
        },

        taperWarp: {
            name: 'Taper Warp',
            category: 'Deform',
            modifiers: [
                { type: 'taper', params: { factor: 0.6, axis: 'y' } }
            ]
        },

        complexDeform: {
            name: 'Complex Deformation',
            category: 'Deform',
            modifiers: [
                { type: 'bend', params: { strength: 0.2, axis: 'x' } },
                { type: 'twist', params: { strength: 90, axis: 'z' } },
                { type: 'taper', params: { factor: 0.5, axis: 'y' } }
            ]
        },

        // ====== DETAILS & SURFACES ======
        beveledEdges: {
            name: 'Beveled Edges',
            category: 'Modify',
            modifiers: [
                { type: 'bevel', params: { amount: 0.05, bevelType: 'vertices' } }
            ]
        },

        shellHollow: {
            name: 'Shell/Hollow',
            category: 'Modify',
            modifiers: [
                { type: 'solidify', params: { thickness: 0.1, rim: true } }
            ]
        },

        smoothDecimate: {
            name: 'Smooth & Decimate',
            category: 'Modify',
            modifiers: [
                { type: 'subdivision', params: { levels: 1 } },
                { type: 'decimate', params: { ratio: 0.7 } }
            ]
        },

        // ====== PROCEDURAL EFFECTS ======
        noisyDisplacement: {
            name: 'Noisy Displacement',
            category: 'Procedural',
            modifiers: [
                { type: 'noisedisplace', params: { strength: 0.2, scale: 2.0 } }
            ]
        },

        roughSurface: {
            name: 'Rough Surface',
            category: 'Procedural',
            modifiers: [
                { type: 'noisedisplace', params: { strength: 0.3, scale: 1.0 } },
                { type: 'noisedisplace', params: { strength: 0.1, scale: 5.0 } }
            ]
        },

        terrainLike: {
            name: 'Terrain-Like',
            category: 'Procedural',
            modifiers: [
                { type: 'terrain', params: {} }
            ]
        },

        // ====== ARCHITECTURAL ======
        wallBrick: {
            name: 'Wall Brick Pattern',
            category: 'Generate',
            modifiers: [
                { type: 'array', params: { count: 5, spacing: 0.2, axis: 'x' } },
                { type: 'array', params: { count: 8, spacing: 0.2, axis: 'y' } }
            ]
        },

        pillarRepeat: {
            name: 'Pillar Repeat',
            category: 'Generate',
            modifiers: [
                { type: 'array', params: { count: 6, spacing: 3, axis: 'z' } }
            ]
        },

        // ====== ORGANIC ======
        organicWave: {
            name: 'Organic Wave',
            category: 'Deform',
            modifiers: [
                { type: 'bend', params: { strength: 0.25, axis: 'y' } },
                { type: 'twist', params: { strength: 45, axis: 'z' } },
                { type: 'noisedisplace', params: { strength: 0.1, scale: 3 } }
            ]
        },

        organicTextured: {
            name: 'Organic Textured',
            category: 'Procedural',
            modifiers: [
                { type: 'noisedisplace', params: { strength: 0.2, scale: 1.5 } },
                { type: 'subdivision', params: { levels: 2 } }
            ]
        },

        // ====== HIGH POLY OPTIMIZATION ======
        lowPolyArt: {
            name: 'Low-Poly Art',
            category: 'Modify',
            modifiers: [
                { type: 'decimate', params: { ratio: 0.3 } }
            ]
        },

        facetedEffect: {
            name: 'Faceted Effect',
            category: 'Modify',
            modifiers: [
                { type: 'decimate', params: { ratio: 0.5 } },
                { type: 'bevel', params: { amount: 0.02 } }
            ]
        },

        // ====== SPECIAL EFFECTS ======
        metalShell: {
            name: 'Metal Shell',
            category: 'Modify',
            modifiers: [
                { type: 'solidify', params: { thickness: 0.05, rim: true } },
                { type: 'bevel', params: { amount: 0.01 } }
            ]
        },

        crystalline: {
            name: 'Crystalline',
            category: 'Procedural',
            modifiers: [
                { type: 'fractal', params: { iterations: 3, scale: 0.5 } },
                { type: 'bevel', params: { amount: 0.02 } }
            ]
        }
    };

    // ========================================================================
    // PRESET APPLICATION FUNCTION
    // ========================================================================

    root.applyPreset = function(object, presetName) {
        if (!object?.isMesh) {
            console.error('Object must be a mesh');
            return false;
        }

        const preset = root.Presets[presetName];
        if (!preset) {
            console.error(`Preset "${presetName}" not found`);
            console.log('Available presets:', Object.keys(root.Presets));
            return false;
        }

        try {
            // Clear existing modifiers
            SMModifiers.clearAllModifiers(object);

            // Apply each modifier in the preset
            preset.modifiers.forEach(({ type, params }) => {
                SMModifiers.addModifier(object, type, params);
            });

            console.log(`✓ Applied preset: ${preset.name}`);
            return true;
        } catch (error) {
            console.error(`Failed to apply preset: ${error.message}`);
            return false;
        }
    };

    // ========================================================================
    // LIST PRESETS FUNCTION
    // ========================================================================

    root.listPresets = function() {
        console.group('Available Modifier Presets');

        Object.entries(root.Presets).forEach(([key, preset]) => {
            console.group(`${preset.name} (${preset.category})`);
            console.log(`Key: ${key}`);
            console.log('Modifiers:', preset.modifiers.map(m => m.type).join(', '));
            console.groupEnd();
        });

        console.log('\nUsage: SMModifiers.applyPreset(selectedObject, "presetName")');
        console.groupEnd();
    };

    // ========================================================================
    // QUICK ACCESS
    // ========================================================================

    root.presets = function() {
        return root.Presets;
    };

    // Log available presets on load
    console.log('✓ Presets loaded - use SMModifiers.applyPreset(obj, "presetName")');
    console.log('  or SMModifiers.listPresets() to see all options');

})();
