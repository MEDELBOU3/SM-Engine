/**
 * MODIFIERS SYSTEM - Global Integration
 * Initializes and integrates all modifier components
 */
(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    // Track initialization state
    let initialized = false;

    // Public API
    root.init = function() {
        if (initialized) {
            console.warn('Modifier system already initialized');
            return;
        }

        console.log('🔧 Initializing Modifier System...');

        // Ensure core systems are available
        if (!root.modifierManager) {
            console.error('❌ ModifierManager not loaded');
            return;
        }

        if (!root.modifierPanel) {
            console.error('❌ ModifierPanel not loaded');
            return;
        }

        // Setup integration with scene
        root.setupSceneIntegration();

        // Auto-update modifiers in animation loop
        root.startUpdateLoop();

        initialized = true;
        console.log('✅ Modifier System initialized');

        // Dispatch ready event
        window.dispatchEvent(new CustomEvent('modifierSystemReady'));
    };

    root.setupSceneIntegration = function() {
        // Track object selection
        if (typeof selectObject !== 'undefined') {
            const originalSelectObject = window.selectObject;
            window.selectObject = function(obj, ...args) {
                const result = originalSelectObject(obj, ...args);
                root.modifierManager.setSelectedObject(obj);
                return result;
            };
        }

        // Listen for selection in hierarchy
        const hierarchyList = document.getElementById('hierarchy-list');
        if (hierarchyList) {
            hierarchyList.addEventListener('click', (e) => {
                const item = e.target.closest('.hierarchy-item');
                if (item) {
                    const objUuid = item.id;
                    const obj = typeof scene !== 'undefined' ? scene.getObjectByProperty('uuid', objUuid) : null;
                    if (obj) {
                        root.modifierManager.setSelectedObject(obj);
                    }
                }
            });
        }

        console.log('✓ Scene integration complete');
    };

    root.startUpdateLoop = function() {
        let lastUpdateTime = 0;
        const UPDATE_INTERVAL = 16; // ~60fps

        const updateFrame = () => {
            const now = performance.now();
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                root.modifierManager.processUpdateQueue();
                lastUpdateTime = now;
            }
            requestAnimationFrame(updateFrame);
        };

        requestAnimationFrame(updateFrame);
        console.log('✓ Update loop started');
    };

    // Utility methods for developers
    root.addModifier = function(object, type, params) {
        return root.modifierManager.addModifier(object, type, params);
    };

    root.removeModifier = function(object, modifierId) {
        return root.modifierManager.removeModifier(object, modifierId);
    };

    root.getModifiers = function(object) {
        return root.modifierManager.getModifiers(object);
    };

    root.bakeModifiers = function(object) {
        return root.modifierManager.bakeModifiers(object);
    };

    root.clearAllModifiers = function(object) {
        return root.modifierManager.clearAllModifiers(object);
    };

    // Auto-init when document is ready and THREE is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (typeof THREE !== 'undefined' && window.scene) {
                    root.init();
                }
            }, 100);
        });
    } else {
        setTimeout(() => {
            if (typeof THREE !== 'undefined' && window.scene) {
                root.init();
            }
        }, 100);
    }

    console.log('✓ Modifiers System loaded');
})();
