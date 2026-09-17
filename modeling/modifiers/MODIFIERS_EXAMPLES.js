/**
 * MODIFIERS SYSTEM - Examples & Usage
 * 
 * This file demonstrates how to use the SM-Engine Modifiers System
 * in practical scenarios. Copy and paste into console or your code.
 */

// ============================================================================
// EXAMPLE 1: Basic Modifier Addition
// ============================================================================

// Get the currently selected object (or pick one from scene)
const myObject = selectedObject || scene.children[0];

if (!myObject.isMesh) {
    console.warn('Please select a mesh object');
} else {
    // Add an Array modifier
    SMModifiers.addModifier(myObject, 'array', {
        count: 3,
        spacing: 2,
        axis: 'x',
        randomize: false
    });

    console.log('✓ Array modifier added');
}

// ============================================================================
// EXAMPLE 2: Chain Multiple Modifiers
// ============================================================================

function chainModifiers() {
    const obj = selectedObject;

    // Create complex effect with stacked modifiers
    SMModifiers.addModifier(obj, 'array', {
        count: 4,
        spacing: 1.5,
        axis: 'x'
    });

    SMModifiers.addModifier(obj, 'bend', {
        strength: 0.3,
        axis: 'y'
    });

    SMModifiers.addModifier(obj, 'twist', {
        strength: 45,
        axis: 'z'
    });

    console.log('✓ Modifier chain applied');
}

// Usage:
// chainModifiers();

// ============================================================================
// EXAMPLE 3: Update Modifier Parameters Interactively
// ============================================================================

function interactiveModifierUpdate() {
    const obj = selectedObject;
    const modifiers = SMModifiers.getModifiers(obj);

    if (modifiers.length === 0) {
        console.warn('No modifiers on this object');
        return;
    }

    // Get first modifier
    const modifier = modifiers[0];
    console.log('Modifier:', modifier.name);

    // Create UI for parameter adjustment
    const paramDefs = modifier.getParamDefinitions?.() || [];

    paramDefs.forEach(param => {
        const currentValue = modifier.params[param.key];
        console.log(`${param.name}: ${currentValue}`);

        // Create slider or input (example)
        // You would normally create HTML elements here
    });
}

// ============================================================================
// EXAMPLE 4: Get Modifier Count & Status
// ============================================================================

function checkModifierStatus() {
    const obj = selectedObject;
    const modifiers = SMModifiers.getModifiers(obj);

    console.log(`Object: ${obj.name}`);
    console.log(`Total modifiers: ${modifiers.length}`);

    modifiers.forEach((mod, idx) => {
        const status = mod.enabled ? '✓' : '✗';
        console.log(`  ${idx + 1}. ${status} ${mod.name} (${mod.type})`);
    });
}

// Usage:
// checkModifierStatus();

// ============================================================================
// EXAMPLE 5: Toggle Modifier On/Off
// ============================================================================

function toggleFirstModifier() {
    const obj = selectedObject;
    const modifiers = SMModifiers.getModifiers(obj);

    if (modifiers.length === 0) {
        console.warn('No modifiers to toggle');
        return;
    }

    const firstModifier = modifiers[0];
    SMModifiers.modifierManager.toggleModifier(obj, firstModifier.id);

    const status = firstModifier.enabled ? 'disabled' : 'enabled';
    console.log(`✓ Modifier ${status}`);
}

// ============================================================================
// EXAMPLE 6: Remove Specific Modifier
// ============================================================================

function removeFirstModifier() {
    const obj = selectedObject;
    const modifiers = SMModifiers.getModifiers(obj);

    if (modifiers.length === 0) {
        console.warn('No modifiers to remove');
        return;
    }

    const modifier = modifiers[0];
    SMModifiers.removeModifier(obj, modifier.id);

    console.log(`✓ Removed ${modifier.name}`);
}

// ============================================================================
// EXAMPLE 7: Clear All Modifiers
// ============================================================================

function clearAllModifiers() {
    const obj = selectedObject;
    SMModifiers.clearAllModifiers(obj);
    console.log('✓ All modifiers cleared');
}

// ============================================================================
// EXAMPLE 8: Bake Modifiers to Geometry
// ============================================================================

function bakeModifiersToGeometry() {
    const obj = selectedObject;
    const modifierCount = SMModifiers.getModifiers(obj).length;

    SMModifiers.bakeModifiers(obj);

    console.log(`✓ ${modifierCount} modifier(s) baked to geometry`);
    console.log('Modifiers are now permanent and cannot be edited');
}

// ============================================================================
// EXAMPLE 9: Listen to Modifier Events
// ============================================================================

function setupModifierEventListeners() {
    const eventBus = SMModifiers.modifierManager.events;

    // Listen for modifier added
    eventBus.addEventListener('modifierAdded', (e) => {
        console.log('New modifier:', e.detail.modifier.name);
    });

    // Listen for modifier removed
    eventBus.addEventListener('modifierRemoved', (e) => {
        console.log('Removed modifier:', e.detail.modifierId);
    });

    // Listen for modifier updated
    eventBus.addEventListener('modifierUpdated', (e) => {
        console.log('Updated modifier:', e.detail.modifier.name);
    });

    // Listen for object selection changed
    eventBus.addEventListener('selectedObjectChanged', (e) => {
        console.log('Selected object:', e.detail.object?.name);
    });

    console.log('✓ Event listeners attached');
}

// ============================================================================
// EXAMPLE 10: Mirror Objects
// ============================================================================

function createMirroredObject() {
    const obj = selectedObject;

    // Add mirror modifier (requires mirror modifier implementation)
    SMModifiers.addModifier(obj, 'mirror', {
        axis: 'x',
        bisect: true,
        clipping: true
    });

    console.log('✓ Mirror modifier applied');
}

// ============================================================================
// EXAMPLE 11: Create Subdivision Surface
// ============================================================================

function subdivideObject() {
    const obj = selectedObject;

    SMModifiers.addModifier(obj, 'subdivision', {
        levels: 2,
        renderLevels: 3
    });

    console.log('✓ Subdivision applied');
}

// ============================================================================
// EXAMPLE 12: Export Modifier Stack
// ============================================================================

function exportModifierStack() {
    const obj = selectedObject;
    const stack = SMModifiers.serialize(obj);

    console.log('Modifier Stack JSON:');
    console.log(JSON.stringify(stack, null, 2));

    // Copy to clipboard (optional)
    // navigator.clipboard.writeText(JSON.stringify(stack));

    return stack;
}

// ============================================================================
// EXAMPLE 13: Import Modifier Stack
// ============================================================================

function importModifierStack(jsonData) {
    const obj = selectedObject;

    try {
        const stack = typeof jsonData === 'string' ? 
            JSON.parse(jsonData) : 
            jsonData;

        SMModifiers.modifierManager.deserialize(obj, stack);
        console.log('✓ Modifiers imported successfully');
    } catch (error) {
        console.error('Failed to import modifiers:', error);
    }
}

// Usage:
// const saved = exportModifierStack();
// importModifierStack(saved);

// ============================================================================
// EXAMPLE 14: Batch Apply Modifiers to Multiple Objects
// ============================================================================

function batchApplyModifiers(objects, modifierType, params) {
    objects.forEach(obj => {
        if (obj.isMesh) {
            SMModifiers.addModifier(obj, modifierType, params);
        }
    });

    console.log(`✓ Applied ${modifierType} to ${objects.length} objects`);
}

// Usage:
// const selectedObjects = [obj1, obj2, obj3];
// batchApplyModifiers(selectedObjects, 'array', { count: 3, spacing: 1 });

// ============================================================================
// EXAMPLE 15: Create Complex Procedural Tree
// ============================================================================

function createProceduralTree() {
    const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 })
    );

    scene.add(cylinder);
    cylinder.name = 'Procedural Tree';

    // Build the tree using modifiers
    SMModifiers.addModifier(cylinder, 'array', {
        count: 3,
        spacing: 1,
        axis: 'y'
    });

    SMModifiers.addModifier(cylinder, 'twist', {
        strength: 30,
        axis: 'y'
    });

    SMModifiers.addModifier(cylinder, 'taper', {
        factor: 0.6,
        axis: 'y'
    });

    console.log('✓ Procedural tree created');

    return cylinder;
}

// ============================================================================
// EXAMPLE 16: Real-Time Modifier Parameter Animation
// ============================================================================

function animateModifierParameter() {
    const obj = selectedObject;
    const modifiers = SMModifiers.getModifiers(obj);

    if (modifiers.length === 0) {
        console.warn('No modifiers to animate');
        return;
    }

    const modifier = modifiers[0];
    const paramKey = Object.keys(modifier.params)[0];
    const startValue = modifier.params[paramKey];
    const endValue = startValue * 2;
    const duration = 2000; // ms
    const startTime = Date.now();

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = startValue + (endValue - startValue) * progress;

        SMModifiers.modifierManager.updateModifier(obj, modifier.id, {
            [paramKey]: value
        });

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            console.log('✓ Animation complete');
        }
    }

    animate();
}

// ============================================================================
// EXAMPLE 17: Performance Check
// ============================================================================

function checkModifierPerformance() {
    const obj = selectedObject;
    const modifiers = SMModifiers.getModifiers(obj);
    const geometry = obj.geometry;

    console.log('Performance Analysis:');
    console.log(`  Vertices: ${geometry.attributes.position.count}`);
    console.log(`  Modifiers: ${modifiers.length}`);
    console.log(`  Total complexity: ${modifiers.length * geometry.attributes.position.count}`);

    if (geometry.attributes.position.count > 10000 && modifiers.length > 3) {
        console.warn('⚠ Performance warning: High polygon count + many modifiers');
        console.warn('Consider baking modifiers or using lower mesh resolution');
    }
}

// ============================================================================
// EXAMPLE 18: Modifier Template System
// ============================================================================

const ModifierPresets = {
    lowPolyArt: {
        modifier: 'decimate',
        params: { ratio: 0.5 }
    },
    smoothSurface: {
        modifier: 'subdivision',
        params: { levels: 2 }
    },
    organicDeform: [
        { modifier: 'bend', params: { strength: 0.2 } },
        { modifier: 'twist', params: { strength: 30 } },
        { modifier: 'noisedisplace', params: { scale: 0.1, strength: 0.5 } }
    ],
    industrialArray: {
        modifier: 'array',
        params: { count: 4, spacing: 2, axis: 'x' }
    }
};

function applyPreset(presetName) {
    const obj = selectedObject;
    const preset = ModifierPresets[presetName];

    if (!preset) {
        console.warn(`Preset "${presetName}" not found`);
        return;
    }

    if (Array.isArray(preset)) {
        // Multiple modifiers
        preset.forEach(p => {
            SMModifiers.addModifier(obj, p.modifier, p.params);
        });
    } else {
        // Single modifier
        SMModifiers.addModifier(obj, preset.modifier, preset.params);
    }

    console.log(`✓ Preset "${presetName}" applied`);
}

// Usage:
// applyPreset('organicDeform');

// ============================================================================
// CONSOLE HELPER
// ============================================================================

// Make utilities available globally
window.ModifiersExamples = {
    checkStatus: checkModifierStatus,
    chainModifiers,
    bake: bakeModifiersToGeometry,
    clear: clearAllModifiers,
    toggle: toggleFirstModifier,
    remove: removeFirstModifier,
    exportStack: exportModifierStack,
    importStack: importModifierStack,
    batchApply: batchApplyModifiers,
    createTree: createProceduralTree,
    animate: animateModifierParameter,
    checkPerformance: checkModifierPerformance,
    applyPreset,
    setupListeners: setupModifierEventListeners
};

console.log('✓ Modifiers Examples loaded');
console.log('Usage: ModifiersExamples.checkStatus() or SMModifiers.addModifier(...)');
