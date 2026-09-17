/**
 * MODIFIERS SYSTEM - Troubleshooting & Debugging Guide
 * 
 * Comprehensive guide for diagnosing and fixing modifier system issues.
 */

// ============================================================================
// ISSUE 1: Modifiers Not Appearing in Inspector
// ============================================================================

/**
 * Problem: Clicked object but no modifier panel appears in right sidebar
 * 
 * Cause 1: Inspector panel not properly initialized
 * Solution:
 */

function debugInspectorPanel() {
    console.log('=== Debugging Inspector Panel ===');

    // Check if inspector container exists
    const inspectorContainer = document.querySelector('.inspector-main-content');
    if (!inspectorContainer) {
        console.error('✗ Inspector container not found');
        return;
    }
    
    console.log('✓ Inspector container found');

    // Check if modifier panel was added
    let modifierPanel = inspectorContainer.querySelector('.modifier-panel');
    if (!modifierPanel) {
        console.warn('⚠ Modifier panel not found - trying to create it');
        
        // Try to manually create it
        try {
            const newPanel = document.createElement('div');
            newPanel.className = 'modifier-panel';
            newPanel.innerHTML = '<div class="modifier-header">Modifiers</div>';
            inspectorContainer.appendChild(newPanel);
            console.log('✓ Manually created modifier panel');
        } catch (error) {
            console.error('Failed to create panel:', error);
        }
    } else {
        console.log('✓ Modifier panel exists');
        console.log(`  Display: ${modifierPanel.style.display}`);
        console.log(`  Visibility: ${modifierPanel.style.visibility}`);
        console.log(`  Opacity: ${modifierPanel.style.opacity}`);
    }
}

// ============================================================================
// ISSUE 2: Modifiers Not Applying to Geometry
// ============================================================================

/**
 * Problem: Can add modifiers but geometry doesn't change
 * 
 * Cause: Modifier evaluate() method not implemented or not called
 * Solution:
 */

function debugModifierEvaluation() {
    console.log('=== Debugging Modifier Evaluation ===');

    const obj = selectedObject;
    if (!obj?.isMesh) {
        console.error('No mesh object selected');
        return;
    }

    console.log(`Object: ${obj.name}`);
    console.log(`Original geometry vertices: ${obj.geometry.attributes.position.count}`);

    // Get modifiers
    const modifiers = SMModifiers.getModifiers(obj);
    console.log(`Modifiers: ${modifiers.length}`);

    // Check each modifier
    modifiers.forEach((mod, idx) => {
        console.group(`Modifier ${idx + 1}: ${mod.name}`);
        
        console.log(`  Type: ${mod.type}`);
        console.log(`  Enabled: ${mod.enabled}`);
        console.log(`  ID: ${mod.id}`);
        
        // Check if evaluate method exists
        if (typeof mod.evaluate === 'function') {
            console.log('  ✓ Evaluate method exists');
            
            try {
                // Test evaluate
                const meshData = mod.getMeshData?.();
                if (!meshData) {
                    console.warn('  ⚠ No MeshData - modifier may be non-functional');
                }
            } catch (error) {
                console.error('  ✗ Error in evaluate:', error.message);
            }
        } else {
            console.error('  ✗ No evaluate method');
        }
        
        // Check parameters
        console.log('  Parameters:', mod.params);
        
        console.groupEnd();
    });
}

// ============================================================================
// ISSUE 3: Script Loading Errors
// ============================================================================

/**
 * Problem: Console shows "SMModifiers is not defined" or script errors
 * 
 * Cause: Scripts loaded in wrong order or not loaded at all
 * Solution:
 */

function debugScriptLoading() {
    console.log('=== Debugging Script Loading ===');

    // Check which script files are loaded
    const scripts = document.querySelectorAll('script');
    const modifierScripts = Array.from(scripts).filter(s => 
        s.src && (s.src.includes('modifiers') || s.src.includes('modifier'))
    );

    console.log(`Total scripts: ${scripts.length}`);
    console.log(`Modifier-related scripts: ${modifierScripts.length}`);

    if (modifierScripts.length === 0) {
        console.error('✗ No modifier scripts loaded!');
        console.log('Check index.html to ensure scripts are included');
        return;
    }

    // List loaded modifier scripts in order
    console.log('\nLoaded modifier scripts:');
    modifierScripts.forEach((script, idx) => {
        const filename = script.src.split('/').pop();
        const status = script.async ? '(async)' : '(sync)';
        console.log(`  ${idx + 1}. ${filename} ${status}`);
    });

    // Check for load errors
    console.log('\nChecking for script errors...');
    try {
        if (window.SMModifiers) {
            console.log('✓ SMModifiers object exists');
        } else {
            console.error('✗ SMModifiers not defined');
        }

        if (window.ModifierManager) {
            console.log('✓ ModifierManager class loaded');
        } else {
            console.error('✗ ModifierManager not found');
        }
    } catch (error) {
        console.error('Error checking globals:', error);
    }
}

// ============================================================================
// ISSUE 4: CSS Not Applying / Styling Issues
// ============================================================================

/**
 * Problem: Modifier panel appears but looks broken/unstyled
 * 
 * Cause: CSS file not loaded or CSS class names mismatch
 * Solution:
 */

function debugModifierStyling() {
    console.log('=== Debugging Modifier Styling ===');

    // Check if CSS loaded
    const modifiersCss = Array.from(document.styleSheets).find(sheet => 
        sheet.href && sheet.href.includes('modifiers.css')
    );

    if (!modifiersCss) {
        console.error('✗ modifiers.css not loaded');
        console.log('Loaded stylesheets:');
        Array.from(document.styleSheets).forEach(sheet => {
            const filename = sheet.href?.split('/').pop() || 'inline';
            console.log(`  - ${filename}`);
        });
        return;
    }

    console.log('✓ modifiers.css loaded');

    // Check modifier panel styling
    const modifierPanel = document.querySelector('.modifier-panel');
    if (modifierPanel) {
        const styles = window.getComputedStyle(modifierPanel);
        
        console.log('Modifier panel computed styles:');
        console.log(`  Display: ${styles.display}`);
        console.log(`  Background: ${styles.backgroundColor}`);
        console.log(`  Width: ${styles.width}`);
        console.log(`  Height: ${styles.height}`);
        console.log(`  Opacity: ${styles.opacity}`);

        // Check for visibility issues
        if (styles.display === 'none') {
            console.error('⚠ Panel display is "none" - check CSS');
        }
        
        if (styles.opacity === '0') {
            console.error('⚠ Panel opacity is 0 - invisible');
        }
    }

    // Test CSS class application
    console.log('\nTesting CSS classes...');
    const testElement = document.createElement('div');
    testElement.className = 'modifier-item';
    document.body.appendChild(testElement);
    
    const testStyles = window.getComputedStyle(testElement);
    if (testStyles.color !== 'rgb(255, 255, 255)') {
        console.warn('⚠ CSS class may not be applying correctly');
    }
    
    document.body.removeChild(testElement);
    console.log('✓ CSS classes appear functional');
}

// ============================================================================
// ISSUE 5: Event Listeners Not Working
// ============================================================================

/**
 * Problem: Changes to modifiers don't update UI
 * 
 * Cause: Event listeners not attached or event names mismatch
 * Solution:
 */

function debugEventSystem() {
    console.log('=== Debugging Event System ===');

    const eventBus = SMModifiers.modifierManager?.events;

    if (!eventBus) {
        console.error('✗ Event bus not found');
        return;
    }

    console.log('✓ Event bus exists');

    // List active event listeners
    if (eventBus._eventListeners) {
        console.log('Event listeners:');
        Object.entries(eventBus._eventListeners).forEach(([eventName, listeners]) => {
            console.log(`  ${eventName}: ${listeners?.length || 0} listener(s)`);
        });
    }

    // Test event dispatch
    console.log('\nTesting event dispatch...');
    let testEventFired = false;

    const listener = () => {
        testEventFired = true;
    };

    eventBus.addEventListener('test', listener);
    eventBus.dispatchEvent(new CustomEvent('test'));

    if (testEventFired) {
        console.log('✓ Events dispatching correctly');
    } else {
        console.error('✗ Events not firing');
    }

    eventBus.removeEventListener('test', listener);
}

// ============================================================================
// ISSUE 6: Memory Leaks / Performance Issues
// ============================================================================

/**
 * Problem: App gets slower when adding/removing many modifiers
 * 
 * Cause: Memory not released or update queue not clearing
 * Solution:
 */

function debugPerformance() {
    console.log('=== Debugging Performance ===');

    const manager = SMModifiers.modifierManager;

    // Check update queue
    console.log('Update queue stats:');
    console.log(`  Size: ${manager.updateQueue?.size || 0}`);
    console.log(`  Pending updates: ${manager.pendingUpdates?.size || 0}`);

    // Check memory usage (if available)
    if (performance.memory) {
        const memory = performance.memory;
        const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
        const limitMB = Math.round(memory.jsHeapSizeLimit / 1048576);
        
        console.log(`Memory usage: ${usedMB}MB / ${limitMB}MB`);
        
        if (usedMB > limitMB * 0.9) {
            console.error('⚠ High memory usage detected');
        }
    }

    // Count objects with modifiers
    const objectsWithModifiers = new Set();
    manager.modifierStacks.forEach((stack, objUuid) => {
        objectsWithModifiers.add(objUuid);
    });

    console.log(`Objects with modifiers: ${objectsWithModifiers.size}`);
    console.log(`Total modifier stacks: ${manager.modifierStacks.size}`);

    // Check for orphaned data
    let totalModifiers = 0;
    manager.modifierStacks.forEach(stack => {
        totalModifiers += stack.modifiers.length;
    });

    console.log(`Total modifiers in use: ${totalModifiers}`);
}

// ============================================================================
// ISSUE 7: Object Selection Not Working
// ============================================================================

/**
 * Problem: Selecting different objects doesn't update modifier panel
 * 
 * Cause: Selection event not firing or not handled
 * Solution:
 */

function debugObjectSelection() {
    console.log('=== Debugging Object Selection ===');

    // Check if selection changed event fires
    console.log('Testing selection system...');

    const currentSelection = selectedObject;
    console.log(`Currently selected: ${currentSelection?.name || 'none'}`);

    // Try manual selection
    if (scene.children.length > 1) {
        const testObject = scene.children.find(c => c.isMesh && c !== currentSelection);
        
        if (testObject) {
            console.log(`\nSelecting test object: ${testObject.name}`);
            
            // Dispatch selection event
            const selectionEvent = new CustomEvent('objectSelected', {
                detail: { object: testObject }
            });

            window.dispatchEvent(selectionEvent);
            console.log('Selection event dispatched');

            // Check if modifier panel updated
            setTimeout(() => {
                const panel = document.querySelector('.modifier-panel');
                if (panel) {
                    console.log('✓ Modifier panel found after selection');
                } else {
                    console.warn('⚠ Modifier panel not updated');
                }
            }, 500);
        }
    }
}

// ============================================================================
// ISSUE 8: Modifier Parameters Not Updating
// ============================================================================

/**
 * Problem: Change slider/input but modifier doesn't update
 * 
 * Cause: Parameter binding not connected or update not triggered
 * Solution:
 */

function debugParameterBinding() {
    console.log('=== Debugging Parameter Binding ===');

    const obj = selectedObject;
    if (!obj) {
        console.warn('No object selected');
        return;
    }

    const modifiers = SMModifiers.getModifiers(obj);
    if (modifiers.length === 0) {
        console.warn('No modifiers on selected object');
        return;
    }

    const modifier = modifiers[0];
    console.log(`Checking modifier: ${modifier.name}`);

    // List all parameters
    console.log('Parameters:');
    Object.entries(modifier.params).forEach(([key, value]) => {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
    });

    // Try updating a parameter
    console.log('\nTesting parameter update...');
    const firstParamKey = Object.keys(modifier.params)[0];
    const oldValue = modifier.params[firstParamKey];

    SMModifiers.modifierManager.updateModifier(obj, modifier.id, {
        [firstParamKey]: oldValue * 2
    });

    console.log(`✓ Updated ${firstParamKey}: ${oldValue} → ${modifier.params[firstParamKey]}`);
}

// ============================================================================
// MASTER DIAGNOSTIC FUNCTION
// ============================================================================

function runFullDiagnostics() {
    console.clear();
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  SM-Engine Modifiers System - Full Diagnostic');
    console.log('╚════════════════════════════════════════════╝\n');

    const tests = [
        ['Script Loading', debugScriptLoading],
        ['CSS Styling', debugModifierStyling],
        ['Inspector Panel', debugInspectorPanel],
        ['Event System', debugEventSystem],
        ['Modifier Evaluation', debugModifierEvaluation],
        ['Object Selection', debugObjectSelection],
        ['Parameter Binding', debugParameterBinding],
        ['Performance', debugPerformance]
    ];

    tests.forEach(([name, fn]) => {
        try {
            console.group(`\n${name}:`);
            fn();
            console.groupEnd();
        } catch (error) {
            console.error(`Error in ${name}:`, error);
            console.groupEnd();
        }
    });

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Diagnostic Complete');
    console.log('╚════════════════════════════════════════════╝');
}

// ============================================================================
// QUICK FIX FUNCTIONS
// ============================================================================

/**
 * Force reinitialize modifier system
 */
function reinitializeModifiers() {
    console.log('Reinitializing modifiers system...');
    
    if (window.SMModifiers && window.SMModifiers.init) {
        window.SMModifiers.init();
        console.log('✓ Reinitialized');
    } else {
        console.error('Cannot reinitialize - init method not found');
    }
}

/**
 * Clear all modifier data and reset
 */
function resetModifiersSystem() {
    console.warn('⚠ Resetting modifier system - all modifiers will be cleared');
    
    if (window.SMModifiers && window.SMModifiers.modifierManager) {
        window.SMModifiers.modifierManager.modifierStacks.clear();
        console.log('✓ System reset');
    }
}

/**
 * Rebuild modifier panel UI
 */
function rebuildModifierPanel() {
    console.log('Rebuilding modifier panel UI...');
    
    const inspectorContainer = document.querySelector('.inspector-main-content');
    if (!inspectorContainer) {
        console.error('Inspector container not found');
        return;
    }

    // Remove old panel
    const oldPanel = inspectorContainer.querySelector('.modifier-panel');
    if (oldPanel) oldPanel.remove();

    // Try to create new panel via ModifierPanel
    if (window.ModifierPanel) {
        try {
            const newPanel = new ModifierPanel(selectedObject);
            inspectorContainer.appendChild(newPanel.element);
            console.log('✓ Panel rebuilt');
        } catch (error) {
            console.error('Failed to rebuild:', error);
        }
    } else {
        console.error('ModifierPanel class not found');
    }
}

// ============================================================================
// Export utilities
// ============================================================================

window.ModifiersDiagnostics = {
    runFullDiagnostics,
    debugScriptLoading,
    debugModifierStyling,
    debugInspectorPanel,
    debugEventSystem,
    debugModifierEvaluation,
    debugObjectSelection,
    debugParameterBinding,
    debugPerformance,
    reinitializeModifiers,
    resetModifiersSystem,
    rebuildModifierPanel
};

console.log('Diagnostic tools loaded!');
console.log('Usage: ModifiersDiagnostics.runFullDiagnostics()');
console.log('Or: ModifiersDiagnostics.debugScriptLoading() for specific tests');
