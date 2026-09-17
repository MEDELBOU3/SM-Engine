/**
 * SM Engine — SelectionCore.js  v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Unreal Engine–style silhouette outline.
 *
 * v3 changes vs v2:
 *   • PRIMARY outline  → light orange  #FFA040  (bright, clearly visible)
 *   • SECONDARY outline → cyan         #00D4FF
 *   • HOVER            → dim gray      #888888  (subtle, never white)
 *   • Shell meshes are applied IMMEDIATELY on selection — not only on hover.
 *   • Hover no longer shows a bright white ring; it shows a thin dim rim.
 *   • OutlinePass + shell-mesh are both driven from the same selectObject path.
 *   • All old emissive-glow highlight code removed (no more material mutation).
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════════
       COLOUR PALETTE
    ═══════════════════════════════════════════════════════════════ */
    const COL_SELECT_PRIMARY = 0xFFA040;   // ← light orange  (was 0xFF8C00)
    const COL_SELECT_SECONDARY = 0x00D4FF;   // cyan multi-select
    const COL_HOVER = 0x888888;   // dim gray hover (NOT white)
    const COL_HIDDEN_EDGE = 0x7F3A00;   // hidden-edge amber tint

    /* ═══════════════════════════════════════════════════════════════
       EXCLUSION LISTS  (unchanged)
    ═══════════════════════════════════════════════════════════════ */
    const GROUND_NAMES_EXACT = new Set([
        'unrealenginefloor', 'skyshadowcatcher', 'skyshadowground',
        'advancedgrid', 'ws-filmgrid', 'modelingground',
    ]);
    const GROUND_NAME_PATTERN = /\b(floor|ground|terrain|shadow.?catch|shadow.?ground|grid.?helper)\b/i;
    const SKY_SYSTEM_NAMES = new Set([
        'SkySphere', 'SkyClouds', 'SkyStars', 'SkyShadowCatcher', 'SkyShadowGround',
        'SkySunLight', 'SkyHemiLight', 'SkyAmbientLight', 'SkyMoonLight', 'SkyBackLight',
        'SkyMoonTarget', 'SkySunTarget', 'SkyDebugHelper',
        'StudioKeyLight', 'StudioFillLight', 'StudioRimLight', 'StudioAmbient',
        'GameSunLight', 'GameHemiLight', 'GameFillLight', 'GameAmbientLight',
    ]);

    function _isGroundObject(obj) {
        if (!obj) return false;
        if (obj.userData?.isGround || obj.userData?.isFloor || obj.userData?.isGrid) return true;
        const name = (obj.name || '').toLowerCase();
        if (GROUND_NAMES_EXACT.has(name) || GROUND_NAME_PATTERN.test(name)) return true;
        if (obj.isMesh && obj.geometry) {
            let bb = obj.geometry.boundingBox;
            if (!bb) { try { obj.geometry.computeBoundingBox(); bb = obj.geometry.boundingBox; } catch { } }
            if (bb) {
                const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z, sy = bb.max.y - bb.min.y;
                if (sx > 500 && sz > 500 && sy < 2) return true;
            }
        }
        return false;
    }

    /* ═══════════════════════════════════════════════════════════════
       CANDIDATE / RESOLUTION  (unchanged logic)
    ═══════════════════════════════════════════════════════════════ */
    function isSelectableCandidate(obj) {
        if (!obj?.isObject3D || !obj.visible) return false;
        if (obj.userData?.isSystemObject && !obj.userData?.selectable) return false;
        if (obj.userData?.locked || obj.userData?.isTransformControlsChild) return false;
        if (obj.userData?.keepForSky || SKY_SYSTEM_NAMES.has(obj.name)) return false;
        const type = obj.type || '', name = (obj.name || '').toLowerCase();
        if (type.includes('Helper') || name.includes('helper') || name.includes('gizmo')) return false;
        if (_isGroundObject(obj)) return false;
        return obj.isMesh || obj.isLine || obj.isPoints || obj.isGroup || obj.isLight || obj.isBone || obj.isObject3D;
    }

    function resolveSelectionTarget(current, options) {
        if (!current) return null;
        const { source = 'viewport' } = options || {};
        if (window.isModelingMode && source === 'viewport') return null;
        while (current && current !== window.scene) {
            if (current.userData?.selectionProxy?.isObject3D) return current.userData.selectionProxy;
            if (current.userData?.locked) return null;
            if (current.userData?.isTransformControlsChild) { current = current.parent; continue; }
            if (current.userData?.keepForSky || SKY_SYSTEM_NAMES.has(current.name)) return null;
            if (_isGroundObject(current)) return null;
            if (current.isLight || current.isBone) return current;
            if (source === 'hierarchy' || source === 'asset_import') return current;
            if (current.isMesh || current.isGroup) {
                let preferred = current, walker = current.parent;
                while (walker && walker !== window.scene) {
                    if (walker.userData?.locked || walker.userData?.keepForSky ||
                        walker.type?.includes('Helper') || walker.isBone) break;
                    if ((walker.isGroup || walker.name) && isSelectableCandidate(walker)) preferred = walker;
                    walker = walker.parent;
                }
                return preferred;
            }
            current = current.parent;
        }
        return null;
    }

    /* ═══════════════════════════════════════════════════════════════
       COLLECT RENDERABLES
       OutlinePass needs actual Mesh objects, not Groups.
    ═══════════════════════════════════════════════════════════════ */
    function _collectRenderables(obj) {
        if (!obj) return [];
        const out = [];
        if (obj.isMesh || obj.isLine || obj.isPoints) out.push(obj);
        obj.traverse?.((c) => {
            if (c !== obj && (c.isMesh || c.isLine || c.isPoints) && c.visible && !c.userData?.isOutlineShell) {
                out.push(c);
            }
        });
        return out.length ? out : [obj];
    }

    /* ═══════════════════════════════════════════════════════════════
       SHELL MESH OUTLINE
       Back-face scaled mesh — crisp circumference edge, no material mutation.
       Works with or without OutlinePass / post-processing.
    ═══════════════════════════════════════════════════════════════ */
    const _selectionShells = new Map();  // renderable.uuid → shell Mesh

    /**
     * Build a back-face shell for one Mesh/Line/Points.
     * @param {THREE.Mesh} src
     * @param {number} colorHex
     * @param {number} [scale=1.028]  – how far outside the surface the border sits
     * @param {number} [opacity=1.0]
     */
    function _buildShell(src, colorHex, scale, opacity) {
        if (!src?.geometry) return null;
        scale = scale ?? 1.028;
        opacity = opacity ?? 1.0;

        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(colorHex),
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: true,
            transparent: opacity < 1.0,
            opacity: opacity,
            fog: false,
        });
        const shell = new THREE.Mesh(src.geometry, mat);   // shares geometry (read-only)
        shell.name = '__sel_shell__';
        shell.renderOrder = 998;
        shell.userData.isSystemObject = true;
        shell.userData.isOutlineShell = true;
        shell.userData.selectable = false;
        shell.matrixAutoUpdate = true;
        shell.scale.setScalar(scale);
        return shell;
    }

    /** Attach selection shells to a list of renderables. */
    function _attachShells(renderables, colorHex, scale) {
        renderables.forEach((r) => {
            if (!r.isMesh) return;
            // Remove any existing shell first
            _detachShell(r.uuid);
            const shell = _buildShell(r, colorHex, scale ?? 1.028, 1.0);
            if (!shell) return;
            r.add(shell);
            _selectionShells.set(r.uuid, shell);
        });
    }

    /** Remove and dispose the shell for one renderable UUID. */
    function _detachShell(uuid) {
        const shell = _selectionShells.get(uuid);
        if (!shell) return;
        shell.parent?.remove(shell);
        shell.material?.dispose?.();
        // Do NOT dispose geometry — it is shared with the source mesh
        _selectionShells.delete(uuid);
    }

    /** Remove all selection shells. */
    function _detachAllShells() {
        _selectionShells.forEach((_, uuid) => _detachShell(uuid));
    }

    /** Remove shells for one root object and all its renderables. */
    function _clearShellsForObj(obj) {
        _collectRenderables(obj).forEach(r => _detachShell(r.uuid));
    }

    /* ── Hover shell (thin, dim gray) ───────────────────────────── */
    let _hoverShell = null;

    function _showHoverShell(obj) {
        _hideHoverShell();
        if (!obj?.isMesh || !obj.geometry) return;
        _hoverShell = _buildShell(obj, COL_HOVER, 1.014, 0.55);
        if (!_hoverShell) return;
        obj.add(_hoverShell);
    }

    function _hideHoverShell() {
        if (_hoverShell) {
            _hoverShell.parent?.remove(_hoverShell);
            _hoverShell.material?.dispose?.();
            _hoverShell = null;
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       OUTLINE PASS CONFIG
    ═══════════════════════════════════════════════════════════════ */
    function _configurePass(pass, colorHex, opts) {
        if (!pass) return;
        const { thickness = 2.8, strength = 9.0, glow = 0.0 } = opts || {};
        pass.visibleEdgeColor?.set?.(colorHex);
        pass.hiddenEdgeColor?.set?.(COL_HIDDEN_EDGE);
        pass.edgeStrength = strength;
        pass.edgeGlow = glow;
        pass.edgeThickness = thickness;
        pass.pulsePeriod = 0;
        pass.usePatternTexture = false;
    }

    /* Secondary OutlinePass (cyan for multi-select) */
    let _passB = null;
    function _ensurePassB() {
        if (_passB) return _passB;
        if (window.outlinePassB) return (_passB = window.outlinePassB);
        const passA = window.outlinePass;
        if (!passA) return null;
        try {
            const OPC = passA.constructor;
            const size = passA.resolution || new THREE.Vector2(window.innerWidth, window.innerHeight);
            _passB = new OPC(size, passA.renderScene || window.scene, passA.renderCamera || window.camera);
            window.outlinePassB = _passB;
            const composer = window.composer || window.effectComposer;
            if (composer?.passes) {
                const idx = composer.passes.indexOf(passA);
                composer.passes.splice(idx >= 0 ? idx + 1 : composer.passes.length, 0, _passB);
            }
        } catch { _passB = null; }
        return _passB;
    }

    /* ═══════════════════════════════════════════════════════════════
       MASTER OUTLINE SYNC
       Called every time selection changes.
       Drives BOTH OutlinePass (if available) AND shell meshes.
    ═══════════════════════════════════════════════════════════════ */
    function _syncOutline() {
        const suppress = !!(
            window.isModelingMode ||
            window.isSculptModeActive ||
            window.sculptingSystem?.isActive
        );

        // ── Always start clean ──────────────────────────────────────
        _detachAllShells();

        const passA = window.outlinePass;
        const passB = _ensurePassB();
        if (passA) passA.selectedObjects = [];
        if (passB) passB.selectedObjects = [];

        if (suppress) return;

        const primary = selectionState.active;
        const secondary = selectionState.order.filter(o => o && o !== primary);

        /* ── OutlinePass path ──────────────────────────────────────── */
        if (passA) {
            _configurePass(passA, COL_SELECT_PRIMARY, { thickness: 2.8, strength: 9.5 });
            passA.selectedObjects = primary ? _collectRenderables(primary) : [];
        }
        if (passB) {
            _configurePass(passB, COL_SELECT_SECONDARY, { thickness: 2.2, strength: 7.5 });
            passB.selectedObjects = secondary.flatMap(_collectRenderables);
        } else if (passA && secondary.length) {
            // Single-pass fallback: lump all under primary colour
            passA.selectedObjects = [
                ...(primary ? _collectRenderables(primary) : []),
                ...secondary.flatMap(_collectRenderables),
            ];
        }

        /* ── Shell mesh path ───────────────────────────────────────── *
         *  Shell meshes are ALWAYS applied regardless of OutlinePass.   *
         *  This guarantees a visible outline even if post-processing is  *
         *  disabled, and gives a crisp edge that OutlinePass can soften. *
         * ────────────────────────────────────────────────────────────── */
        if (primary) {
            _attachShells(_collectRenderables(primary), COL_SELECT_PRIMARY, 1.028);
        }
        secondary.forEach(obj => {
            _attachShells(_collectRenderables(obj), COL_SELECT_SECONDARY, 1.022);
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       LEGACY STUBS  (kept so existing engine calls don't throw)
    ═══════════════════════════════════════════════════════════════ */
    function applySelectionHighlight() { /* no-op — shells handle visuals */ }
    function clearSelectionHighlight(obj) { if (obj) _clearShellsForObj(obj); }
    function restoreOriginalMaterial(obj) {
        if (obj?.userData?.originalMaterial) {
            obj.material = obj.userData.originalMaterial;
            delete obj.userData.originalMaterial;
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       SELECTION STATE
    ═══════════════════════════════════════════════════════════════ */
    const selectionState = { active: null, order: [] };

    function syncSelectionGlobals() {
        window.selectedObject = selectionState.active || null;
        window.selectedObjects = selectionState.order.slice();
        window.activeObject = selectionState.active || null;
    }

    function refreshSelectionVisuals() {
        _detachAllShells();
        window._currentHoverObj = null;
        _syncOutline();
    }

    function _expandAncestors(obj) {
        let c = obj?.parent || null;
        while (c && c !== window.scene) {
            (c.userData = c.userData || {}).hierarchyExpanded = true;
            c = c.parent || null;
        }
    }

    function applySelectionState() {
        syncSelectionGlobals();

        // ← This is the key change: outline fires here, on every selection change
        _syncOutline();

        selectionState.order.forEach(_expandAncestors);

        // Transform Controls
        const tc = window.transformControls;
        if (tc) {
            const a = selectionState.active;
            if (a && !a.userData?.locked) {
                if (window.scene && tc.parent !== window.scene) {
                    window.scene.add(tc);
                }
                tc.enabled = true;
                tc.visible = true;
                tc.attach(a);
            } else {
                tc.detach();
                tc.visible = false;
            }
        }

        // Bone visualizer
        if (window.boneVisualizer) window.boneVisualizer.clear();
        const active = selectionState.active;
        if (active) {
            if (!window.boneVisualizer && typeof CustomBoneVisualizer !== 'undefined') {
                window.boneVisualizer = new CustomBoneVisualizer(window.scene);
            }
            let hasSkel = false;
            active.traverse(c => { if (c.isSkinnedMesh && c.skeleton) hasSkel = true; });
            if (hasSkel && window.boneVisualizer) window.boneVisualizer.visualizeSkeleton(active, 'octahedron');
        }

        if (active?.isLight && typeof updateLightUI === 'function') updateLightUI(active);
        if (active?.isCamera && typeof updateCameraUI === 'function') updateCameraUI(active);

        if (window.isModelingMode) {
            let mt = active;
            if (mt && !mt.isMesh) mt = mt.getObjectByProperty?.('isMesh', true) || mt;
            window.activeObject = mt?.isMesh ? mt : (window.activeObject?.isMesh ? window.activeObject : null);
            if (window.UnifiedModelingSystem?.rebuildAllHelpers) window.UnifiedModelingSystem.rebuildAllHelpers();
            if (window.activeObject && typeof showMeshStructure === 'function') showMeshStructure(window.activeObject);
        }

        if (window.physicsSystem) window.physicsSystem.setSelectedObject(active || null);
        if (typeof updateHierarchySelection === 'function') updateHierarchySelection();
        if (typeof updateHierarchy === 'function') updateHierarchy();
        if (typeof updateInspector === 'function') updateInspector();

        window.dispatchEvent(new CustomEvent('objectSelected', { detail: { object: active || null } }));
    }

    function resolvePhysicsSelectionTarget(object) {
        if (!object) return null;

        if (
            object.isTransformControls ||
            object.userData?.isTransformControlsChild ||
            object.userData?.isSystemObject ||
            object.isBone ||
            object.isLight ||
            object.isCamera
        ) {
            return null;
        }

        if (object.isMesh) return object;

        /*
        For a normal imported model/root group:
        If the selected root contains exactly one usable mesh,
        allow Physics Lab to target that mesh.
        */
        const meshes = [];

        object.traverse?.(child => {
            if (
                child.isMesh &&
                !child.isSkinnedMesh &&
                !child.userData?.isSystemObject &&
                child.userData?.selectable !== false
            ) {
                meshes.push(child);
            }
        });

        if (meshes.length === 1) {
            return meshes[0];
        }

        /*
        If the group itself already owns physics,
        keep using the group.
        */
        if (object.userData?.physics) {
            return object;
        }

        /*
        For multi-mesh objects we keep the selected root.
        The improved PhysicsSystem can use primitive bounds
        (box/sphere/capsule) on Object3D roots.
        */
        if (meshes.length > 1) {
            return object;
        }

        return object;
    }

    function syncPhysicsSelection(object) {
        const system =
            window.physicsSystem ||
            (typeof physicsSystem !== 'undefined' ? physicsSystem : null);

        if (!system) return;

        const physicsTarget = resolvePhysicsSelectionTarget(object);

        system.setSelectedObject?.(physicsTarget);

        if (system.ui) {
            system.ui.updateObjectPanel?.(physicsTarget);
            system.ui.refreshWorkbench?.();
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       PUBLIC API
    ═══════════════════════════════════════════════════════════════ */

    function selectObject(newObject, options) {
        try {
            const {
                additive = false,
                toggleIfSelected = false,
                source = 'unknown'
            } = options || {};

            const activeWorkspaceMode = String(
                window.workspaceManager?.currentMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM'
            ).toUpperCase();
            if (newObject && activeWorkspaceMode !== 'TERRAIN') {
                let terrainNode = newObject;
                while (terrainNode) {
                    const data = terrainNode.userData || {};
                    const name = String(terrainNode.name || '').trim();
                    if (
                        terrainNode === window.terrain ||
                        data.isTerrain === true ||
                        data.isTerrainMesh === true ||
                        data.isTerrainComponent === true ||
                        data.workspaceOnly === 'TERRAIN' ||
                        name === 'Terrain' ||
                        name === 'Terrain_Mesh' ||
                        name.startsWith('Terrain_')
                    ) {
                        return window.selectedObject || null;
                    }
                    terrainNode = terrainNode.parent;
                }
            }

            if (source === 'viewport' && newObject) {
                let curr = newObject;

                while (curr) {
                    if (curr.userData?.selectable === false) {
                        return window.selectedObject || null;
                    }

                    curr = curr.parent;
                }
            }

            if (isLocked && source === 'viewport') {
                return selectedObject || null;
            }

            if (
                (window.isSculptModeActive ||
                    window.sculptingSystem?.isActive) &&
                source !== 'system'
            ) {
                return window.selectedObject || null;
            }

            const resolved = resolveSelectionTarget(newObject, { source });

            if (!resolved) {
                syncPhysicsSelection(null);
                return window.selectedObject || null;
            }

            if (
                source === 'viewport' &&
                typeof _isAnyToolActive === 'function' &&
                _isAnyToolActive()
            ) {
                return window.selectedObject || null;
            }

            _ensureUUID(resolved);

            if (window._currentHoverObj === resolved) {
                window._currentHoverObj = null;
                _hideHoverShell();
            }

            if (additive) {
                const result = _addToSelectionInternal(
                    resolved,
                    toggleIfSelected
                );

                /*
                After additive selection, Physics uses the active object,
                not every selected object.
                */
                syncPhysicsSelection(
                    selectionState.active ||
                    window.selectedObject ||
                    resolved
                );

                return result;
            }

            /*
            Clear previous selection visuals.
            */
            selectionState.order.forEach(object => {
                _clearShellsForObj(object);
            });

            /*
            Assign new active selection.
            */
            selectionState.order = [resolved];
            selectionState.active = resolved;

            if (Array.isArray(window.selectedObjectsFromBox)) {
                window.selectedObjectsFromBox.length = 0;
            }

            /*
            This updates:
            - window.selectedObject
            - TransformControls
            - outline
            - hierarchy selection
            */
            applySelectionState();

            /*
            IMPORTANT:
            SelectionCore and PhysicsSystem must always share
            the same active object.
            */
            syncPhysicsSelection(resolved);

            /*
            Keep other editor systems synchronized.
            */
            window.selectedObject = resolved;

            if (
                window.transformControls &&
                !resolved.isBone &&
                !resolved.userData?.disableTransformControls
            ) {
                if (
                    window.scene &&
                    window.transformControls.parent !== window.scene
                ) {
                    window.scene.add(window.transformControls);
                }

                window.transformControls.enabled = true;
                window.transformControls.visible = true;

                if (window.transformControls.object !== resolved) {
                    window.transformControls.attach(resolved);
                }
            }

            if (window.codeEditorManager?.loadScriptForObject) {
                window.codeEditorManager.loadScriptForObject(resolved);
            } else if (
                typeof codeEditorManager !== 'undefined' &&
                codeEditorManager?.loadScriptForObject
            ) {
                codeEditorManager.loadScriptForObject(resolved);
            }

            window.hierarchyManager?.updateSelectionStyle?.();

            if (typeof updateInspector === 'function') {
                updateInspector();
            }

            if (typeof updateLayersUI === 'function') {
                updateLayersUI();
            }

            window.dispatchEvent(
                new CustomEvent('objectSelected', {
                    detail: {
                        object: resolved,
                        source
                    }
                })
            );

            return resolved;

        } catch (err) {
            console.error(
                '[SelectionCore] selectObject error:',
                err
            );

            return window.selectedObject || null;
        }
    }

    function _addToSelectionInternal(obj, toggleIfSelected) {
        if (!obj) return window.selectedObject || null;
        _ensureUUID(obj);

        const idx = selectionState.order.findIndex(o => o?.uuid === obj.uuid);
        if (idx >= 0 && toggleIfSelected) {
            selectionState.order.splice(idx, 1);
            _clearShellsForObj(obj);
            if (selectionState.active?.uuid === obj.uuid) {
                selectionState.active = selectionState.order.length
                    ? selectionState.order[selectionState.order.length - 1]
                    : null;
            }
        } else if (idx < 0) {
            selectionState.order.push(obj);
            selectionState.active = obj;
        } else {
            selectionState.active = obj;
        }

        applySelectionState();
        return selectionState.active;
    }

    function addToSelection(obj, toggleIfSelected = false, options = {}) {
        if ((window.isSculptModeActive || window.sculptingSystem?.isActive) && options?.source !== 'system') {
            return window.selectedObject || null;
        }
        const resolved = resolveSelectionTarget(obj, options);
        if (!resolved) return window.selectedObject || null;
        return _addToSelectionInternal(resolved, toggleIfSelected);
    }

    function removeFromSelection(obj) {
        if (!obj) return window.selectedObject || null;
        const idx = selectionState.order.findIndex(o => o?.uuid === obj.uuid);
        if (idx < 0) return window.selectedObject || null;
        _clearShellsForObj(selectionState.order[idx]);
        selectionState.order.splice(idx, 1);
        if (selectionState.active?.uuid === obj.uuid) {
            selectionState.active = selectionState.order.length
                ? selectionState.order[selectionState.order.length - 1]
                : null;
        }
        applySelectionState();
        return selectionState.active;
    }

    function clearSelection() {
        selectionState.order.forEach(object => {
            _clearShellsForObj(object);
        });

        selectionState.order = [];
        selectionState.active = null;

        window.selectedObject = null;

        applySelectionState();

        if (window.transformControls) {
            window.transformControls.detach();
            window.transformControls.visible = false;
        }

        syncPhysicsSelection(null);

        window.dispatchEvent(
            new CustomEvent('objectSelected', {
                detail: {
                    object: null,
                    source: 'clear'
                }
            })
        );
    }

    function legacySelectObject(object) {
        if (typeof window.selectObject === 'function') {
            return window.selectObject(object, {
                source: 'legacy'
            });
        }

        return null;
    }
    /* ═══════════════════════════════════════════════════════════════
       HOVER  — thin dim-gray rim, never interferes with selection
    ═══════════════════════════════════════════════════════════════ */

    function setHoverObject(obj) {
        if (window.isModelingMode || window.isSculptModeActive || window.sculptingSystem?.isActive) {
            clearHoverObject(); return;
        }
        // Don't show hover ring on already-selected objects
        if (obj && selectionState.order.find(o => o?.uuid === obj.uuid)) {
            clearHoverObject(); return;
        }
        if (obj === window._currentHoverObj) return;
        clearHoverObject();
        if (!obj) return;
        window._currentHoverObj = obj;
        const renderables = _collectRenderables(obj);
        if (renderables[0]?.isMesh) _showHoverShell(renderables[0]);
    }

    function clearHoverObject() {
        window._currentHoverObj = null;
        _hideHoverShell();
    }

    /* ═══════════════════════════════════════════════════════════════
       STUBS & HELPERS
    ═══════════════════════════════════════════════════════════════ */

    function performSelectionAtPointer() { /* SelectionSystem.js owns viewport clicks */ }

    function _ensureUUID(obj) {
        if (obj && !obj.uuid) obj.uuid = THREE.MathUtils.generateUUID();
    }

    function _isAnyToolActive() {
        return !!(
            window.isModelingMode || window.isBrushActive || window.isMaterialBrushActive ||
            window.isDrawingMode || window.drawMode || window.extrudeMode ||
            window.polyPenToolActive || window.activeArchTool || window.isLoopCutMode ||
            window.splineCreationMode || window.isSculptModeActive
        );
    }

    /* ═══════════════════════════════════════════════════════════════
       EXPORT
    ═══════════════════════════════════════════════════════════════ */

    window.selectObject = selectObject;
    window.addToSelection = addToSelection;
    window.removeFromSelection = removeFromSelection;
    window.clearSelection = clearSelection;

    window.resolveSelectionTarget = resolveSelectionTarget;
    window.isSelectableCandidate = isSelectableCandidate;

    window.syncSelectionGlobals = syncSelectionGlobals;
    window.refreshSelectionVisuals = refreshSelectionVisuals;
    window.applySelectionState = applySelectionState;

    window.applySelectionHighlight = applySelectionHighlight;
    window.clearSelectionHighlight = clearSelectionHighlight;
    window.restoreOriginalMaterial = restoreOriginalMaterial;

    window.setHoverObject = setHoverObject;
    window.clearHoverObject = clearHoverObject;

    window.performSelectionAtPointer = performSelectionAtPointer;

    // Debug
    window._selectionState = selectionState;
    window._syncOutlineSelection = _syncOutline;
    window._collectRenderables = _collectRenderables;

    // Resync if external code writes window.selectedObject directly
    window.addEventListener('objectSelected', () => {
        const ext = window.selectedObject;
        if (ext && selectionState.active !== ext) {
            if (!selectionState.order.find(o => o?.uuid === ext.uuid)) {
                selectionState.order = [ext];
                selectionState.active = ext;
            } else {
                selectionState.active = ext;
            }
        }
    });

    // Re-init secondary pass after composer is ready
    window.addEventListener('composerReady', () => {
        _passB = null;
        _syncOutline();
    });

    window.addEventListener('beforeunload', () => {
        _detachAllShells();
        const passA = window.outlinePass, passB = _passB || window.outlinePassB;
        if (passA) passA.selectedObjects = [];
        if (passB) passB.selectedObjects = [];
    });

    console.log(
        '%c[SelectionCore v3] Loaded — light-orange shell outline on selection',
        'color:#FFA040;font-weight:bold;background:#1a1a1a;padding:2px 6px;border-radius:3px'
    );

})();
