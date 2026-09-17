/**
 * SM Engine — ModifiersSelectionManager.js
 * ────────────────────────────────────────────────────────────────────────────
 * Selection-aware modifier application following Blender paradigm:
 *   • Object Mode - Modifiers affect entire object
 *   • Edit Mode - Component selection (vertices, edges, faces)
 *   • Context-based application with automatic mode detection
 *   • Batch modifier application to multiple selections
 * ────────────────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    const root = window.SMModifiers = window.SMModifiers || {};

    /* ═══════════════════════════════════════════════════════════════════════
       SELECTION MODE DEFINITIONS
    ═══════════════════════════════════════════════════════════════════════ */

    const SELECTION_MODES = {
        OBJECT: 'object',           // Entire object(s) selected
        VERTEX: 'vertex',           // Vertices selected
        EDGE: 'edge',               // Edges selected
        FACE: 'face',               // Faces/polygons selected
        VERTEX_GROUP: 'vertex_group', // Vertex groups
        COMPONENT: 'component'      // Generic component selection
    };

    /* ═══════════════════════════════════════════════════════════════════════
       SELECTION DETECTOR
    ═══════════════════════════════════════════════════════════════════════ */

    class SelectionDetector {
        static detect() {
            // Check modeling mode first
            if (typeof window.isModelingMode !== 'undefined' && window.isModelingMode) {
                return this._detectComponentMode();
            }

            // Object mode: check selected objects
            const selection = this._getSelection();
            if (selection && selection.length > 0) {
                return {
                    mode: SELECTION_MODES.OBJECT,
                    objects: selection,
                    componentData: null
                };
            }

            return {
                mode: SELECTION_MODES.OBJECT,
                objects: [],
                componentData: null
            };
        }

        static _getSelection() {
            // Try multiple selection methods from engine
            if (typeof window.getCurrentSelection === 'function') {
                const sel = window.getCurrentSelection();
                if (Array.isArray(sel) && sel.length > 0) return sel;
            }

            if (window.selectedObject) {
                return [window.selectedObject];
            }

            if (window.selectedObjects && Array.isArray(window.selectedObjects)) {
                return window.selectedObjects;
            }

            // Try SelectionSystem
            if (window.selectionSystem && typeof window.selectionSystem.getSelection === 'function') {
                return window.selectionSystem.getSelection();
            }

            return [];
        }

        static _detectComponentMode() {
            const componentData = {
                hasVertexSelection: false,
                hasEdgeSelection: false,
                hasFaceSelection: false,
                selectedVertices: new Set(),
                selectedEdges: new Set(),
                selectedFaces: new Set(),
                object: null
            };

            // Check for selected vertices/edges/faces through geometry data
            const selected = this._getSelection();
            if (selected && selected[0] && selected[0].isMesh && selected[0].geometry) {
                componentData.object = selected[0];
                const posAttr = selected[0].geometry.getAttribute('position');
                
                // Check userData for selection info
                if (selected[0].userData.selectedVertices) {
                    componentData.selectedVertices = new Set(selected[0].userData.selectedVertices);
                    componentData.hasVertexSelection = componentData.selectedVertices.size > 0;
                }
                if (selected[0].userData.selectedEdges) {
                    componentData.selectedEdges = new Set(selected[0].userData.selectedEdges);
                    componentData.hasEdgeSelection = componentData.selectedEdges.size > 0;
                }
                if (selected[0].userData.selectedFaces) {
                    componentData.selectedFaces = new Set(selected[0].userData.selectedFaces);
                    componentData.hasFaceSelection = componentData.selectedFaces.size > 0;
                }
            }

            // Determine primary mode
            let mode = SELECTION_MODES.COMPONENT;
            if (componentData.hasVertexSelection) mode = SELECTION_MODES.VERTEX;
            else if (componentData.hasEdgeSelection) mode = SELECTION_MODES.EDGE;
            else if (componentData.hasFaceSelection) mode = SELECTION_MODES.FACE;

            return {
                mode: mode,
                objects: [componentData.object].filter(Boolean),
                componentData: componentData
            };
        }

        static getModeLabel() {
            const detection = this.detect();
            const modeLabels = {
                [SELECTION_MODES.OBJECT]: 'Object Mode',
                [SELECTION_MODES.VERTEX]: 'Vertex Selection',
                [SELECTION_MODES.EDGE]: 'Edge Selection',
                [SELECTION_MODES.FACE]: 'Face Selection',
                [SELECTION_MODES.COMPONENT]: 'Component Selection'
            };
            return modeLabels[detection.mode] || 'Unknown Mode';
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       MODIFIER APPLICATION ENGINE
    ═══════════════════════════════════════════════════════════════════════ */

    class ModifierApplicationEngine {
        constructor(toolbox) {
            this.toolbox = toolbox;
            this.modifier_restrictions = this._buildRestrictions();
        }

        /**
         * Build which modifiers work in which selection modes
         */
        _buildRestrictions() {
            return {
                // Object mode - all modifiers work
                [SELECTION_MODES.OBJECT]: [
                    'array', 'mirror', 'bevel', 'boolean', 'subdivision', 'solidify',
                    'remesh', 'skin', 'wireframe', 'bend', 'twist', 'taper', 'smooth',
                    'displace', 'simple-deform', 'curve', 'lattice', 'decimate', 'weld',
                    'normal-edit', 'edge-split', 'uv-project', 'mask', 'cloth', 'softbody',
                    'fluid', 'particle-system', 'noise-displace', 'terrain', 'fractal'
                ],
                // Vertex selection - deform and component modifiers
                [SELECTION_MODES.VERTEX]: [
                    'smooth', 'displace', 'lattice', 'bend', 'twist', 'taper',
                    'simple-deform', 'normal-edit', 'weld'
                ],
                // Edge selection - edge-specific modifiers
                [SELECTION_MODES.EDGE]: [
                    'bevel', 'edge-split', 'smooth', 'bend', 'weld'
                ],
                // Face selection - face-working modifiers
                [SELECTION_MODES.FACE]: [
                    'solidify', 'bevel', 'skin', 'mask', 'normal-edit'
                ],
                // Generic component - most deform modifiers
                [SELECTION_MODES.COMPONENT]: [
                    'smooth', 'displace', 'bend', 'twist', 'taper', 'simple-deform'
                ]
            };
        }

        /**
         * Get available modifiers for current selection
         */
        getAvailableModifiers(selectionMode) {
            return this.modifier_restrictions[selectionMode] || [];
        }

        /**
         * Apply modifier based on selection context
         */
        applyModifier(modifierId, params = {}) {
            const detection = SelectionDetector.detect();
            
            if (detection.objects.length === 0) {
                console.warn('No object selected to apply modifier');
                return { success: false, error: 'No selection' };
            }

            // Check if modifier is allowed in this mode
            const available = this.getAvailableModifiers(detection.mode);
            if (!available.includes(modifierId)) {
                return {
                    success: false,
                    error: `Modifier '${modifierId}' not available in ${detection.mode} mode`
                };
            }

            try {
                const results = [];
                
                if (detection.mode === SELECTION_MODES.OBJECT) {
                    // Apply to all selected objects
                    detection.objects.forEach(obj => {
                        const mod = this.toolbox.addModifier(obj, modifierId, params);
                        results.push({ object: obj, modifier: mod });
                    });
                } else {
                    // Component mode - apply modifier influenced by component selection
                    for (const obj of detection.objects) {
                        const mod = this.toolbox.addModifier(obj, modifierId, params);
                        this._applyComponentInfluence(obj, mod, detection);
                        results.push({ object: obj, modifier: mod });
                    }
                }

                return { success: true, results };
            } catch (err) {
                console.error('Error applying modifier:', err);
                return { success: false, error: err.message };
            }
        }

        /**
         * Apply modifier with vertex group masking for component selection
         */
        _applyComponentInfluence(object, modifier, detection) {
            if (!object || !modifier || !detection.componentData) return;

            // For component selection, apply weights/masks
            if (detection.mode === SELECTION_MODES.VERTEX && detection.componentData.selectedVertices.size > 0) {
                modifier.params.vertexMask = Array.from(detection.componentData.selectedVertices);
                modifier.params.maskMode = 'include';
            } else if (detection.mode === SELECTION_MODES.EDGE && detection.componentData.selectedEdges.size > 0) {
                modifier.params.edgeMask = Array.from(detection.componentData.selectedEdges);
                modifier.params.maskMode = 'include';
            } else if (detection.mode === SELECTION_MODES.FACE && detection.componentData.selectedFaces.size > 0) {
                modifier.params.faceMask = Array.from(detection.componentData.selectedFaces);
                modifier.params.maskMode = 'include';
            }
        }

        /**
         * Batch apply modifiers to selection
         */
        applyMultiple(modifierIds, params = {}) {
            const results = [];
            for (const modId of modifierIds) {
                const result = this.applyModifier(modId, params);
                results.push({ modifierId: modId, ...result });
            }
            return results;
        }

        /**
         * Apply preset combination to selection
         */
        applyPreset(presetName) {
            const preset = this._getPreset(presetName);
            if (!preset) return { success: false, error: 'Preset not found' };

            return this.applyMultiple(preset.modifiers, preset.params);
        }

        /**
         * Get modifier info for UI display
         */
        getModifierInfo(modifierId) {
            const mod = this.toolbox.create(modifierId);
            if (!mod) return null;

            return {
                id: mod.id,
                name: mod.name,
                category: mod.category,
                description: mod.description,
                icon: mod.icon,
                params: mod.defaultParams
            };
        }

        /**
         * Get all modifiers organized by category
         */
        getModifierCatalog() {
            const catalog = {};
            for (const [id, reg] of this.toolbox.registry) {
                const category = reg.category;
                if (!catalog[category]) catalog[category] = [];
                
                const mod = this.toolbox.create(id);
                if (mod) {
                    catalog[category].push({
                        id: id,
                        name: mod.name,
                        icon: mod.icon,
                        description: mod.description
                    });
                }
            }
            return catalog;
        }

        /**
         * Presets - predefined modifier combinations
         */
        _getPreset(name) {
            const presets = {
                'metallic-edge': {
                    modifiers: ['bevel', 'edge-split'],
                    params: {}
                },
                'smooth-organic': {
                    modifiers: ['smooth', 'smooth'],
                    params: { iterations: 2 }
                },
                'array-mirror': {
                    modifiers: ['array', 'mirror'],
                    params: {}
                },
                'detailed-subdivision': {
                    modifiers: ['subdivision', 'smooth'],
                    params: { levels: 2 }
                },
                'sculpted-solid': {
                    modifiers: ['solidify', 'bevel'],
                    params: { thickness: 0.1 }
                },
                'lowpoly-optimized': {
                    modifiers: ['decimate', 'weld'],
                    params: { ratio: 0.5 }
                }
            };

            return presets[name];
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       EXPORT
    ═══════════════════════════════════════════════════════════════════════ */

    root.SelectionDetector = SelectionDetector;
    root.ModifierApplicationEngine = ModifierApplicationEngine;
    root.SELECTION_MODES = SELECTION_MODES;

    // Initialize engine if toolbox exists
    if (document.readyState !== 'loading') {
        if (root.toolbox) {
            root.applicationEngine = new ModifierApplicationEngine(root.toolbox);
            console.log('%c[ModifierApplicationEngine] Initialized', 'color:#0f0;font-weight:bold');
        }
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (root.toolbox && !root.applicationEngine) {
                root.applicationEngine = new ModifierApplicationEngine(root.toolbox);
                console.log('%c[ModifierApplicationEngine] Initialized', 'color:#0f0;font-weight:bold');
            }
        });
    }

})();
