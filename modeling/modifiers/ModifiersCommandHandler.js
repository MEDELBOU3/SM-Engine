/**
 * SM Engine — ModifiersCommandHandler.js
 * ────────────────────────────────────────────────────────────────────────────
 * High-level API for modifier commands:
 *   • Quick modifier application methods
 *   • Keyboard shortcut support
 *   • Right-click context menu integration
 *   • Modifier undo/redo support
 * ────────────────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    const root = window.SMModifiers = window.SMModifiers || {};

    class ModifiersCommandHandler {
        constructor() {
            this.enabled = true;
            this.shortcuts = new Map();
            this._setupShortcuts();
            this._setupContextMenu();
            this._setupEventListeners();
        }

        /**
         * Quick apply modifier
         */
        add(modifierId, params = {}) {
            if (!this.enabled) {
                console.warn('Modifiers are disabled in this workspace mode');
                return false;
            }
            if (!root.applicationEngine) {
                console.warn('Application engine not initialized');
                return false;
            }
            const result = root.applicationEngine.applyModifier(modifierId, params);
            return result.success;
        }

        /**
         * Remove modifier from selected object
         */
        remove(modifierId) {
            if (!this.enabled) return false;
            const selection = root.SelectionDetector._getSelection();
            if (!selection || selection.length === 0) return false;
            
            return root.toolbox.removeModifier(selection[0], modifierId);
        }

        /**
         * Show context menu for adding modifiers
         */
        showAddMenu(event) {
            if (!this.enabled) return;
            if (root.contextMenuManager) {
                root.contextMenuManager.showContextMenu(event);
            }
        }

        /**
         * Show properties for modifier
         */
        showProperties(modifierId) {
            if (!this.enabled) return;
            const selection = root.SelectionDetector._getSelection();
            if (!selection || selection.length === 0) return;
            
            if (root.propertiesPanel) {
                root.propertiesPanel.showProperties(selection[0], modifierId);
            }
        }

        /**
         * Get modifier stack for selected object
         */
        getStack() {
            const selection = root.SelectionDetector._getSelection();
            if (!selection || selection.length === 0) return [];
            
            return root.toolbox ? root.toolbox.getStack(selection[0]) : [];
        }

        /**
         * Clear all modifiers from selected object
         */
        clearStack() {
            if (!this.enabled) return false;
            const selection = root.SelectionDetector._getSelection();
            if (!selection || selection.length === 0) return false;
            
            for (const obj of selection) {
                root.toolbox.clearStack(obj);
            }
            return true;
        }

        /**
         * Bake modifiers (make permanent)
         */
        bake() {
            if (!this.enabled) return false;
            const selection = root.SelectionDetector._getSelection();
            if (!selection || selection.length === 0) return false;
            
            for (const obj of selection) {
                root.toolbox.bakeStack(obj);
            }
            return true;
        }

        /**
         * Apply preset combination
         */
        applyPreset(presetName) {
            if (!this.enabled) return false;
            if (root.applicationEngine) {
                const result = root.applicationEngine.applyPreset(presetName);
                return result.success;
            }
            return false;
        }

        /**
         * Set modifier parameter
         */
        setParam(modifierId, paramKey, value) {
            if (!this.enabled) return false;
            const selection = root.SelectionDetector._getSelection();
            if (!selection || selection.length === 0) return false;

            const stack = root.toolbox.getStack(selection[0]);
            const modifier = stack.find(m => m.id === modifierId);
            if (!modifier) return false;

            modifier.setParam(paramKey, value);
            root.toolbox._applyStack(selection[0], stack);
            return true;
        }

        /**
         * Get modifier catalog
         */
        getCatalog() {
            return root.applicationEngine ? root.applicationEngine.getModifierCatalog() : {};
        }

        /**
         * Setup keyboard shortcuts
         */
        _setupShortcuts() {
            // M + modifier key combinations
            document.addEventListener('keydown', (e) => {
                if (!this.enabled || !root.selectionSystem) return;

                // M key for modifier menu
                if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                    this.showAddMenu(e);
                }

                // Ctrl+Shift+M to clear modifiers
                if (e.code === 'KeyM' && e.ctrlKey && e.shiftKey) {
                    e.preventDefault();
                    this.clearStack();
                }

                // Ctrl+Alt+M to bake modifiers
                if (e.code === 'KeyM' && e.ctrlKey && e.altKey) {
                    e.preventDefault();
                    this.bake();
                }
            });
        }

        /**
         * Setup right-click context menu integration
         */
        _setupContextMenu() {
            document.addEventListener('contextmenu', (e) => {
                if (!this.enabled) return;

                // Check if right-clicked on viewport or modifier-related element
                const target = e.target;
                if (!target) return;

                // Don't override other context menus
                if (target.closest('.ui-panel') || target.closest('#gl-root')) {
                    // Show modifiers context menu in 3D view
                    this.showAddMenu(e);
                }
            });
        }

        /**
         * Setup event listeners for UI feedback
         */
        _setupEventListeners() {
            // Listen for modifier stack updates
            window.addEventListener('modifierStackUpdated', (e) => {
                console.log('Modifier stack updated:', e.detail);
            });

            // Listen for selection changes to update context availability
            document.addEventListener('selectionChanged', (e) => {
                if (root.contextMenuManager) {
                    // Update available modifiers for new selection
                    const detection = root.SelectionDetector.detect();
                    console.log(`Selection changed - Mode: ${detection.mode}, Objects: ${detection.objects.length}`);
                }
            });

            // Listen for mode changes
            window.addEventListener('modeChanged', (e) => {
                console.log(`Modifier mode changed: ${e.detail?.mode}`);
            });
        }

        /**
         * Enable/disable command handler
         */
        enable(state = true) {
            this.enabled = state;
            // Hide context menu when disabling
            if (!state && root.contextMenuManager?.hideContextMenu) {
                root.contextMenuManager.hideContextMenu();
            }
        }

        /**
         * Hide context menu
         */
        hideContextMenu() {
            if (root.contextMenuManager?.hideContextMenu) {
                root.contextMenuManager.hideContextMenu();
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       PUBLIC API
    ═══════════════════════════════════════════════════════════════════════ */

    root.CommandHandler = ModifiersCommandHandler;

    // Create global instance
    if (typeof root.commandHandler === 'undefined') {
        root.commandHandler = new ModifiersCommandHandler();
    }

    // Expose convenient API methods to window
    window.addModifier = (modId, params) => root.commandHandler.add(modId, params);
    window.removeModifier = (modId) => root.commandHandler.remove(modId);
    window.showModifiersMenu = (e) => root.commandHandler.showAddMenu(e);
    window.showModifierProps = (modId) => root.commandHandler.showProperties(modId);
    window.getModifierStack = () => root.commandHandler.getStack();
    window.clearModifiers = () => root.commandHandler.clearStack();
    window.bakeModifiers = () => root.commandHandler.bake();
    window.applyModifierPreset = (name) => root.commandHandler.applyPreset(name);
    window.setModifierParam = (modId, param, val) => root.commandHandler.setParam(modId, param, val);
    window.getModifierCatalog = () => root.commandHandler.getCatalog();

    // Log initialization
    if (document.readyState !== 'loading') {
        console.log('%c[ModifiersCommandHandler] Ready - Use window.addModifier(), showModifiersMenu() etc', 'color:#0f0;font-weight:bold');
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('%c[ModifiersCommandHandler] Ready - Use window.addModifier(), showModifiersMenu() etc', 'color:#0f0;font-weight:bold');
        });
    }

})();
