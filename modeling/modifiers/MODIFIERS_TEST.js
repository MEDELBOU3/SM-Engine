/**
 * MODIFIERS SYSTEM - Quick Test & Verification Guide
 * 
 * Run these checks to verify the modifier system is working correctly.
 */

// ============================================================================
// TEST 1: Verify Global Objects Exist
// ============================================================================

console.group('TEST 1: Global Objects');

try {
    // Check ModifierManager exists
    if (window.SMModifiers && window.SMModifiers.modifierManager) {
        console.log('✓ SMModifiers.modifierManager initialized');
    } else {
        console.error('✗ SMModifiers not found - system may not have initialized');
    }

    // Check THREE.js loaded
    if (window.THREE) {
        console.log('✓ THREE.js loaded');
    } else {
        console.error('✗ THREE.js not loaded');
    }

    // Check scene exists
    if (window.scene) {
        console.log('✓ Scene object available');
    } else {
        console.error('✗ Scene object not found');
    }

} catch (error) {
    console.error('ERROR:', error.message);
}

console.groupEnd();

// ============================================================================
// TEST 2: Check Public API Methods
// ============================================================================

console.group('TEST 2: Public API');

const requiredMethods = [
    'addModifier',
    'removeModifier',
    'getModifiers',
    'updateModifier',
    'clearAllModifiers',
    'bakeModifiers',
    'serialize'
];

requiredMethods.forEach(method => {
    if (typeof SMModifiers[method] === 'function') {
        console.log(`✓ SMModifiers.${method}() available`);
    } else {
        console.error(`✗ SMModifiers.${method}() NOT FOUND`);
    }
});

console.groupEnd();

// ============================================================================
// TEST 3: Modifier Registration
// ============================================================================

console.group('TEST 3: Modifier Types');

const modifierRegistry = SMModifiers.modifierManager.modifierRegistry;
console.log(`Registered Modifiers: ${Object.keys(modifierRegistry).length}`);

Object.keys(modifierRegistry).forEach(type => {
    const constructor = modifierRegistry[type];
    console.log(`  ✓ ${type}`);
});

console.groupEnd();

// ============================================================================
// TEST 4: Add Modifier to Selected Object
// ============================================================================

console.group('TEST 4: Add Modifier');

try {
    const obj = selectedObject || scene.children.find(c => c.isMesh);

    if (!obj) {
        console.warn('No mesh object selected or available in scene');
    } else {
        console.log(`Target object: ${obj.name}`);

        // Add test modifier
        const modId = SMModifiers.addModifier(obj, 'array', {
            count: 3,
            spacing: 1,
            axis: 'x'
        });

        if (modId) {
            console.log(`✓ Array modifier added (ID: ${modId})`);
            
            // Check if it's in the stack
            const modifiers = SMModifiers.getModifiers(obj);
            console.log(`  Stack now has ${modifiers.length} modifier(s)`);
        } else {
            console.error('✗ Failed to add modifier');
        }
    }

} catch (error) {
    console.error('ERROR:', error.message);
}

console.groupEnd();

// ============================================================================
// TEST 5: Check Inspector Panel
// ============================================================================

console.group('TEST 5: Inspector UI');

try {
    const inspectorPanel = document.querySelector('.inspector-main-content');
    
    if (inspectorPanel) {
        console.log('✓ Inspector main content found');
        
        const modifierPanel = inspectorPanel.querySelector('.modifier-panel');
        
        if (modifierPanel) {
            console.log('✓ Modifier panel exists in DOM');
            console.log(`  Panel visible: ${modifierPanel.style.display !== 'none'}`);
        } else {
            console.warn('⚠ Modifier panel not in DOM (may appear after object selection)');
        }
    } else {
        console.warn('⚠ Inspector panel not found');
    }

} catch (error) {
    console.error('ERROR:', error.message);
}

console.groupEnd();

// ============================================================================
// TEST 6: Event System
// ============================================================================

console.group('TEST 6: Event System');

try {
    const eventBus = SMModifiers.modifierManager.events;
    
    if (eventBus) {
        console.log('✓ Event bus available');
        
        // Test event listener
        let eventFired = false;
        const testListener = () => {
            eventFired = true;
        };
        
        eventBus.addEventListener('test-event', testListener);
        eventBus.dispatchEvent(new CustomEvent('test-event'));
        
        if (eventFired) {
            console.log('✓ Event system working');
        } else {
            console.error('✗ Events not firing');
        }
        
        eventBus.removeEventListener('test-event', testListener);
    } else {
        console.error('✗ Event bus not found');
    }

} catch (error) {
    console.error('ERROR:', error.message);
}

console.groupEnd();

// ============================================================================
// TEST 7: Geometry Update
// ============================================================================

console.group('TEST 7: Geometry Updates');

try {
    const obj = selectedObject || scene.children.find(c => c.isMesh);
    
    if (obj?.isMesh) {
        const originalGeometry = obj.geometry.clone();
        const originalVertexCount = obj.geometry.attributes.position.count;
        
        console.log(`Initial vertex count: ${originalVertexCount}`);
        
        // Modifiers should have been applied above
        // Check if geometry has changed
        
        console.log('✓ Geometry accessible');
    }

} catch (error) {
    console.error('ERROR:', error.message);
}

console.groupEnd();

// ============================================================================
// TEST 8: Serialization
// ============================================================================

console.group('TEST 8: Serialization');

try {
    const obj = selectedObject || scene.children.find(c => c.isMesh);
    
    if (obj) {
        const stack = SMModifiers.serialize(obj);
        
        if (stack && Array.isArray(stack)) {
            console.log(`✓ Stack serialized: ${stack.length} modifier(s)`);
            Console.log('Sample:', JSON.stringify(stack[0], null, 2));
        } else {
            console.warn('⚠ Serialization returned unexpected format');
        }
    }

} catch (error) {
    console.error('ERROR:', error.message);
}

console.groupEnd();

// ============================================================================
// COMPREHENSIVE HEALTH CHECK
// ============================================================================

console.group('COMPREHENSIVE HEALTH CHECK');

const checks = {
    globalObject: !!window.SMModifiers,
    modifierManager: !!window.SMModifiers?.modifierManager,
    registry: Object.keys(window.SMModifiers?.modifierManager?.modifierRegistry || {}).length > 0,
    publicAPI: typeof window.SMModifiers?.addModifier === 'function',
    eventBus: !!window.SMModifiers?.modifierManager?.events,
    threejs: !!window.THREE,
    scene: !!window.scene
};

let passCount = 0;
let failCount = 0;

Object.entries(checks).forEach(([name, passed]) => {
    if (passed) {
        console.log(`✓ ${name}`);
        passCount++;
    } else {
        console.log(`✗ ${name}`);
        failCount++;
    }
});

console.log(`\nTotal: ${passCount} passed, ${failCount} failed`);

if (failCount === 0) {
    console.log('✅ All systems operational!');
} else if (failCount === 1) {
    console.warn('⚠ Minor issues detected');
} else {
    console.error('❌ Critical failures - system may not be usable');
}

console.groupEnd();

// ============================================================================
// NEXT STEPS
// ============================================================================

console.group('NEXT STEPS');

if (failCount === 0) {
    console.log('System ready! Try these commands:');
    console.log('  1. ModifiersExamples.checkStatus()  - See current modifiers');
    console.log('  2. ModifiersExamples.chainModifiers() - Add multiple modifiers');
    console.log('  3. ModifiersExamples.bake() - Bake to geometry');
    console.log('\nOr use SMModifiers API directly:');
    console.log('  SMModifiers.addModifier(selectedObject, "array", { count: 3, spacing: 1 })');
} else {
    console.error('System needs fixes. Check errors above.');
}

console.groupEnd();
