/**
 * SM Engine — Advanced Context Menu & Clipboard System v4.3 (Fixed Delete Bug)
 * Professional DCC (Blender / Unreal Engine 5 Style) Context Menu Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixes Applied:
 *  • FIXED: Resolved circular recursion bug in smDelete.
 *  • FIXED: Detaches TransformControls upon deletion so no ghost gizmos remain.
 *  • FIXED: Clean scene & objects[] array purge with Undo/Redo history.
 *  • Single-instance duplicate debounce intact (no triple duplication).
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (global) {
    'use strict';

    /* ═══════════════════════════════════════════════════════════════════════════
       1. CONTEXT MENU MANAGER (Global Singleton)
    ═══════════════════════════════════════════════════════════════════════════ */

    const SMContextMenu = {
        activeMenu: null,
        registeredMenuIds: new Set([
            '__sm_ctx_root',
            'mp-context-menu',
            'hierarchy-context-menu',
            'assets-context-menu',
            'contextMenu',
            'timeline-context-menu'
        ]),

        register(id) {
            if (id) this.registeredMenuIds.add(id);
        },

        closeAll() {
            this.registeredMenuIds.forEach(id => {
                if (id === '__sm_ctx_root') return;
                const el = document.getElementById(id);
                if (el) {
                    el.style.display = 'none';
                    el.classList.remove('sm-context-menu-open');
                }
            });

            document.querySelectorAll('#__sm_ctx_root').forEach(el => {
                try { el.remove(); } catch { }
            });

            if (this.activeMenu) {
                if (this.activeMenu.id === '__sm_ctx_root') {
                    try { this.activeMenu.remove(); } catch { }
                } else {
                    this.activeMenu.style.display = 'none';
                    this.activeMenu.classList.remove('sm-context-menu-open');
                }
                this.activeMenu = null;
            }

            this.activeOwner = null;
        },

        open(e, sections = [], options = {}) {
            this.closeAll();

            const menu = _buildMenuDOM(sections);
            menu.dataset.smContextMenu = 'true';
            menu.dataset.contextOwner = options.owner || 'viewport';

            document.body.appendChild(menu);
            this.activeMenu = menu;
            this.activeOwner = options.owner || 'viewport';

            _positionElement(menu, e.clientX, e.clientY);
            return menu;
        },

        showExisting(e, menu, owner = 'panel') {
            if (!menu) return null;

            this.closeAll();
            if (menu.id) this.register(menu.id);

            menu.dataset.smContextMenu = 'true';
            menu.dataset.contextOwner = owner;
            menu.classList.add('sm-context-menu-open');

            this.activeMenu = menu;
            this.activeOwner = owner;

            _positionElement(menu, e.clientX, e.clientY);
            return menu;
        }
    };

    global.SMContextMenu = SMContextMenu;
    global.SMContextMenuManager = SMContextMenu;

    /* ═══════════════════════════════════════════════════════════════════════════
       2. CLIPBOARD & ENGINE CORE UTILS
    ═══════════════════════════════════════════════════════════════════════════ */

    function _getSelection() {
        const out = [];
        const raw = [];
        const seen = new Set();

        const push = (o) => {
            if (!o || !o.isObject3D || o === global.scene) return;
            if (o.userData?.isSystemObject && !o.userData?.selectable) return;
            if (o.userData?.isTransformControlsChild || o.userData?.isEditorHelper) return;
            if (seen.has(o.uuid)) return;
            seen.add(o.uuid);
            raw.push(o);
        };

        if (Array.isArray(global.selectedObjects)) global.selectedObjects.forEach(push);
        if (global.selectedObject) push(global.selectedObject);

        raw.forEach(obj => {
            let isChildOfSelected = false;
            let p = obj.parent;
            while (p && p !== global.scene) {
                if (seen.has(p.uuid)) {
                    isChildOfSelected = true;
                    break;
                }
                p = p.parent;
            }
            if (!isChildOfSelected) {
                out.push(obj);
            }
        });

        return out;
    }

    function _isTyping() {
        const el = document.activeElement;
        if (!el) return false;
        return (
            el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.isContentEditable ||
            el.contentEditable === 'true' ||
            Boolean(el.closest?.('#code-editor-panel')) ||
            Boolean(el.closest?.('.monaco-editor')) ||
            Boolean(el.closest?.('.CodeMirror'))
        );
    }

    function _clone(src) {
        if (typeof global.cloneObjectForScene === 'function') return global.cloneObjectForScene(src);
        if (typeof THREE !== 'undefined' && THREE.SkeletonUtils?.clone) return THREE.SkeletonUtils.clone(src);
        const c = src.clone(true);
        c.traverse((child) => {
            if (!child.isMesh) return;
            if (child.geometry?.clone) child.geometry = child.geometry.clone();
            if (Array.isArray(child.material)) child.material = child.material.map(m => m?.clone?.() || m);
            else if (child.material?.clone) child.material = child.material.clone();
        });
        return c;
    }

    function _addToScene(obj, name, parent) {
        obj.name = name;
        if (typeof global.addObjectToScene === 'function') {
            global.addObjectToScene(obj, name, parent || null);
        } else if (parent && parent !== global.scene) {
            parent.add(obj);
        } else {
            global.scene?.add(obj);
        }
        if (Array.isArray(global.objects) && !global.objects.find(o => o.uuid === obj.uuid)) {
            global.objects.push(obj);
        }
    }

    function _reselect(arr) {
        if (typeof global.clearSelection === 'function') global.clearSelection();
        if (!arr || !arr.length) return;
        arr.forEach((o, i) => {
            if (i === arr.length - 1) {
                if (typeof global.selectObject === 'function') global.selectObject(o, { source: 'system' });
            } else {
                if (typeof global.addToSelection === 'function') global.addToSelection(o, false, { source: 'system' });
            }
        });
    }

    function _smSvgIcon(name = 'info', size = 14) {
        const common =
            `width="${size}" height="${size}" viewBox="0 0 24 24" ` +
            `fill="none" stroke="currentColor" stroke-width="1.8" ` +
            `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;

        const icons = {
            copy: `<svg ${common}><rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-10A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17H8"/></svg>`,
            paste: `<svg ${common}><path d="M9 5h6"/><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 3h6v4H9z"/></svg>`,
            duplicate: `<svg ${common}><rect x="8" y="8" width="11" height="11" rx="1.5"/><rect x="4" y="4" width="11" height="11" rx="1.5"/></svg>`,
            delete: `<svg ${common}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></svg>`,
            info: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/></svg>`,
            warning: `<svg ${common}><path d="M12 3 2.8 19h18.4L12 3z"/><path d="M12 9v4"/><path d="M12 16h.01"/></svg>`,
            chevronRight: `<svg ${common}><path d="m9 6 6 6-6 6"/></svg>`,
            dot: `<svg ${common}><circle cx="12" cy="12" r="3"/></svg>`
        };

        return icons[name] || icons.info;
    }

    function _toast(msg, type = 'info') {
        const message = String(msg ?? '');

        const LEVEL_MAP = {
            copy: 'info',
            paste: 'info',
            duplicate: 'info',
            delete: 'info',
            info: 'info',
            warning: 'warn',
            warn: 'warn',
            error: 'error'
        };

        const LABEL_MAP = {
            copy: 'Copy',
            paste: 'Paste',
            duplicate: 'Duplicate',
            delete: 'Delete',
            info: 'Info',
            warning: 'Warning',
            warn: 'Warning',
            error: 'Error'
        };

        const level =
            LEVEL_MAP[type] ||
            'info';

        const label =
            LABEL_MAP[type] ||
            'Info';

        /*
         * Preferred route:
         * send directly to SM Engine's global Console panel.
         *
         * We call .push() directly instead of console.info()/warn()
         * so the message is not captured twice by consolePanel.js.
         */
        if (
            window.SMConsolePanel &&
            typeof window.SMConsolePanel.push === 'function'
        ) {
            window.SMConsolePanel.push(
                level,
                [
                    `[${label}] ${message}`
                ],
                {
                    source: 'Clipboard'
                }
            );

            return;
        }

        /*
         * Fallback during very early boot, before consolePanel.js exists.
         */
        if (
            level === 'error'
        ) {
            console.error(
                `[Clipboard:${label}]`,
                message
            );

            return;
        }

        if (
            level === 'warn'
        ) {
            console.warn(
                `[Clipboard:${label}]`,
                message
            );

            return;
        }

        console.info(
            `[Clipboard:${label}]`,
            message
        );
    }

    function _record(name, detail, undo, redo) {
        if (global.historyManager?.push) {
            global.historyManager.push({ name, detail, undo, redo });
        } else if (typeof global.recordHistoryAction === 'function') {
            global.recordHistoryAction(name, detail, undo, redo);
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       3. ENGINE ACTIONS (With Execution Debounce Lock)
    ═══════════════════════════════════════════════════════════════════════════ */

    let _lastActionTime = 0;
    const ACTION_THROTTLE_MS = 200;

    function smCopy() {
        const now = Date.now();
        if (now - _lastActionTime < ACTION_THROTTLE_MS) return;
        _lastActionTime = now;

        const sel = _getSelection();
        if (!sel.length) { _toast('Nothing selected to copy', 'warning'); return; }

        global.__smClipboard = sel.map(obj => ({
            uuid: obj.uuid,
            parentUuid: obj.parent?.uuid || null,
            json: JSON.parse(JSON.stringify(obj.toJSON())),
        }));

        _toast(`Copied ${sel.length} object(s)`, 'copy');
        return global.__smClipboard;
    }

    function smPaste() {
        const now = Date.now();
        if (now - _lastActionTime < ACTION_THROTTLE_MS) return;
        _lastActionTime = now;

        const clipboard = global.__smClipboard;
        if (!clipboard?.length) { _toast('Clipboard is empty', 'warning'); return []; }

        const pasted = [];
        clipboard.forEach(entry => {
            let clone = null;
            const live = global.scene?.getObjectByProperty?.('uuid', entry.uuid);
            if (live) {
                clone = _clone(live);
            } else {
                try {
                    const loader = new THREE.ObjectLoader();
                    clone = loader.parse(JSON.parse(JSON.stringify(entry.json)));
                } catch (e) {
                    console.warn('[Clipboard] Fallback failed:', e);
                    return;
                }
            }

            if (!clone) return;
            clone.uuid = THREE.MathUtils.generateUUID();
            clone.traverse(c => { if (c !== clone && c.uuid) c.uuid = THREE.MathUtils.generateUUID(); });

            const baseName = (clone.name || 'Object').replace(/_paste\d*$/i, '');
            clone.name = `${baseName}_paste`;
            clone.position.x += 0.5;
            clone.position.z += 0.5;

            const targetParent = entry.parentUuid ? global.scene?.getObjectByProperty?.('uuid', entry.parentUuid) : null;
            _addToScene(clone, clone.name, targetParent);
            pasted.push(clone);
        });

        _reselect(pasted);
        global.updateHierarchy?.();
        global.updateInspector?.();
        _toast(`Pasted ${pasted.length} object(s)`, 'paste');

        _record('Paste', pasted.map(o => o.name).join(', '),
            () => { pasted.forEach(o => _purgeObject(o)); global.clearSelection?.(); global.updateHierarchy?.(); },
            () => { pasted.forEach(o => _addToScene(o, o.name, null)); _reselect(pasted); global.updateHierarchy?.(); }
        );
        return pasted;
    }

    function smDuplicate(objects) {
        const now = Date.now();
        if (now - _lastActionTime < ACTION_THROTTLE_MS) return [];
        _lastActionTime = now;

        const targets = Array.isArray(objects) && objects.length ? objects : _getSelection();
        if (!targets.length) { _toast('Nothing selected to duplicate', 'warning'); return []; }

        const dupes = [];
        targets.forEach(obj => {
            const clone = _clone(obj);
            if (!clone) return;

            clone.uuid = THREE.MathUtils.generateUUID();
            clone.traverse(c => { if (c !== clone && c.uuid) c.uuid = THREE.MathUtils.generateUUID(); });

            const baseName = (obj.name || 'Object').replace(/_copy\d*$/i, '');
            clone.name = `${baseName}_copy`;
            clone.position.x += 0.4;
            clone.position.z += 0.4;

            _addToScene(clone, clone.name, obj.parent || null);
            dupes.push(clone);
        });

        if (!dupes.length) return [];

        _reselect(dupes);
        global.updateHierarchy?.();
        global.updateInspector?.();
        _toast(`Duplicated ${dupes.length} object(s)`, 'duplicate');

        _record('Duplicate', dupes.map(o => o.name).join(', '),
            () => { dupes.forEach(o => _purgeObject(o)); global.clearSelection?.(); global.updateHierarchy?.(); },
            () => { dupes.forEach(o => _addToScene(o, o.name, null)); _reselect(dupes); global.updateHierarchy?.(); }
        );
        return dupes;
    }

    /** Direct scene & memory purge helper */
    function _purgeObject(obj) {
        if (!obj) return;

        // Detach gizmo if currently transforming this object
        if (global.transformControls?.object === obj) {
            global.transformControls.detach();
        }

        // Call engine remover if available
        if (typeof global.removeObjectFromScene === 'function') {
            global.removeObjectFromScene(obj, true);
        } else {
            obj.parent?.remove(obj);
            if (Array.isArray(global.objects)) {
                const idx = global.objects.indexOf(obj);
                if (idx !== -1) global.objects.splice(idx, 1);
            }
        }
    }

    // ── FIXED DELETE ACTION (Clean Purge, No Recursion Trap) ─────────────────
    function smDelete(objects) {
        const now = Date.now();
        if (now - _lastActionTime < ACTION_THROTTLE_MS) return;
        _lastActionTime = now;

        const targets = Array.isArray(objects) && objects.length ? objects : _getSelection();
        if (!targets.length) { _toast('Nothing selected to delete', 'warning'); return; }

        const actual = targets.filter(o =>
            o && o !== global.scene &&
            !(o.userData?.isSystemObject && !o.userData?.selectable) &&
            !o.userData?.locked
        );

        if (!actual.length) { _toast('Selected objects cannot be deleted', 'warning'); return; }

        // Snapshots for undo
        const snapshots = actual.map(o => ({
            obj: o,
            parentUuid: o.parent?.uuid || null,
            json: JSON.parse(JSON.stringify(o.toJSON()))
        }));

        // Execute direct deletion on all targets
        actual.forEach(o => _purgeObject(o));

        // Clear active selection and refresh UI
        if (typeof global.clearSelection === 'function') global.clearSelection();
        else global.selectedObject = null;

        global.updateHierarchy?.();
        global.updateInspector?.();
        _toast(`Deleted ${actual.length} item(s)`, 'delete');

        // Record Undo / Redo
        _record('Delete', actual.map(o => o.name || o.type).join(', '),
            () => {
                snapshots.forEach(snap => {
                    try {
                        const loader = new THREE.ObjectLoader();
                        const restored = loader.parse(JSON.parse(JSON.stringify(snap.json)));
                        restored.uuid = snap.obj.uuid;
                        const parent = snap.parentUuid ? global.scene?.getObjectByProperty?.('uuid', snap.parentUuid) : null;
                        _addToScene(restored, restored.name, parent);
                    } catch (e) { console.warn('[Clipboard] Undo delete failed', e); }
                });
                global.updateHierarchy?.();
            },
            () => {
                snapshots.forEach(snap => {
                    const live = global.scene?.getObjectByProperty?.('uuid', snap.obj.uuid);
                    if (live) _purgeObject(live);
                });
                if (typeof global.clearSelection === 'function') global.clearSelection();
                global.updateHierarchy?.();
            }
        );
    }

    function snapToGround() {
        const sel = _getSelection();
        if (!sel.length) return;
        sel.forEach(obj => {
            const bbox = new THREE.Box3().setFromObject(obj);
            if (!bbox.isEmpty()) {
                const bottomY = bbox.min.y;
                obj.position.y -= bottomY;
                obj.updateMatrixWorld(true);
            }
        });
        _toast('Snapped selection to ground', 'info');
    }

    function setMeshShading(smooth = true) {
        const sel = _getSelection();
        sel.forEach(obj => {
            obj.traverse(child => {
                if (child.isMesh && child.geometry) {
                    if (smooth) {
                        child.geometry.computeVertexNormals();
                    } else {
                        child.geometry = child.geometry.toNonIndexed ? child.geometry.toNonIndexed() : child.geometry;
                        child.geometry.computeVertexNormals();
                    }
                    if (child.material) child.material.flatShading = !smooth;
                    child.material.needsUpdate = true;
                }
            });
        });
        _toast(smooth ? 'Shade Smooth applied' : 'Shade Flat applied', 'info');
    }

    function focusSelected() {
        const sel = global.selectedObject || _getSelection()[0];
        if (!sel) return;
        if (typeof global.focusCamera === 'function') {
            global.focusCamera(sel);
        } else if (global.controls && global.camera) {
            const bbox = new THREE.Box3().setFromObject(sel);
            const center = bbox.getCenter(new THREE.Vector3());
            global.controls.target.copy(center);
            global.camera.lookAt(center);
            _toast(`Focused on ${sel.name}`, 'info');
        }
    }

    function alignCameraToView() {
        const sel = global.selectedObject;
        if (!sel || !sel.isCamera || !global.camera) {
            _toast('Select a camera object first', 'warning');
            return;
        }
        sel.position.copy(global.camera.position);
        sel.quaternion.copy(global.camera.quaternion);
        sel.updateMatrixWorld(true);
        _toast(`Aligned "${sel.name}" to viewport view`, 'info');
    }

    function setSelectionColor(hex) {
        const sel = _getSelection();
        sel.forEach(obj => {
            if (obj.isMesh && obj.material) {
                if (obj.material.color) obj.material.color.set(hex);
            } else if (obj.isLight && obj.color) {
                obj.color.set(hex);
            }
        });
        _toast('Color updated', 'info');
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       4. CONTEXT MENU BUILDER & STYLES (Flat 0 Radius Theme)
    ═══════════════════════════════════════════════════════════════════════════ */

    function _injectStyles() {
        if (document.getElementById('__sm_ctx_advanced_styles')) return;
        const st = document.createElement('style');
        st.id = '__sm_ctx_advanced_styles';
        st.textContent = `
            .sm-dcc-menu {
                position: fixed;
                z-index: 100000;
                background: var(--panel-bg, #333333);
                border: 1px solid var(--border-color, #444444);
                border-radius: 0px !important;
                padding: 3px 0;
                min-width: 230px;
                max-width: 290px;
                font-family: var(--ui-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
                font-size: 11px;
                color: var(--text-primary, #ffffff);
                box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
                user-select: none;
            }

            .sm-dcc-search {
                padding: 4px 6px 5px 6px;
                border-bottom: 1px solid var(--border-color, #444444);
                margin-bottom: 2px;
                background: var(--header-bg, #3c3c3c);
            }

            .sm-dcc-search input {
                width: 100%;
                background: var(--input-bg, #262626);
                border: 1px solid var(--border-color, #444444);
                border-radius: 0px !important;
                padding: 4px 6px;
                font-size: 10.5px;
                color: #ffffff;
                outline: none;
                box-sizing: border-box;
            }

            .sm-dcc-search input:focus {
                border-color: #00bcd4;
                background: #1e1e1e;
            }

            .sm-dcc-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 4px 10px;
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 0.5px;
                color: var(--text-muted, #999999);
                text-transform: uppercase;
            }

            .sm-dcc-header .badge {
                background: #444444;
                color: #ffffff;
                padding: 1px 4px;
                border-radius: 0px !important;
                font-size: 8px;
            }

            .sm-dcc-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 5px 10px;
                color: #e0e0e0;
                cursor: pointer;
                position: relative;
                white-space: nowrap;
                transition: background 0.08s ease;
            }

            .sm-dcc-item:hover {
                background: #444444;
                color: #ffffff;
            }

            .sm-dcc-item.disabled {
                color: #777777;
                opacity: 0.5;
                cursor: not-allowed;
                pointer-events: none;
            }

            .sm-dcc-item.danger:hover {
                background: #4a2424;
                color: #ff7878;
            }

            .sm-dcc-item i {
                width: 14px;
                text-align: center;
                font-size: 10.5px;
                opacity: 0.85;
                color: #bbbbbb;
            }

            .sm-dcc-item:hover i {
                color: #00bcd4;
            }

            .sm-dcc-item .sm-shortcut {
                margin-left: auto;
                color: #888888;
                font-size: 9.5px;
                padding-left: 12px;
                font-family: monospace;
            }

            .sm-dcc-item .sm-arrow {
                margin-left: auto;
                color: #888888;
                font-size: 9px;
            }

            .sm-dcc-sep {
                height: 1px;
                background: #444444;
                margin: 2px 0;
            }

            .sm-dcc-sub {
                display: none;
                position: absolute;
                left: 100%;
                top: -3px;
                background: var(--panel-bg, #333333);
                border: 1px solid var(--border-color, #444444);
                border-radius: 0px !important;
                padding: 3px 0;
                min-width: 200px;
                box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
                z-index: 100001;
            }

            .sm-dcc-item:hover > .sm-dcc-sub {
                display: block;
            }

            .sm-dcc-swatches {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 10px 5px 10px;
            }

            .sm-swatch {
                width: 16px;
                height: 16px;
                border-radius: 0px !important;
                cursor: pointer;
                border: 1px solid #444444;
            }

            .sm-swatch:hover {
                transform: scale(1.15);
                border-color: #ffffff;
            }
        `;
        document.head.appendChild(st);
    }

    function _positionElement(el, x, y) {
        el.style.visibility = 'hidden';
        el.style.display = 'block';
        el.style.left = '0px';
        el.style.top = '0px';

        requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth, vh = window.innerHeight;
            let lx = x, ly = y;

            if (lx + rect.width > vw - 6) lx = vw - rect.width - 6;
            if (ly + rect.height > vh - 6) ly = vh - rect.height - 6;

            el.style.left = `${Math.max(6, lx)}px`;
            el.style.top = `${Math.max(6, ly)}px`;
            el.style.visibility = 'visible';

            el.querySelectorAll('.sm-dcc-sub').forEach(sub => {
                const subParent = sub.parentElement;
                subParent.addEventListener('mouseenter', () => {
                    const subRect = sub.getBoundingClientRect();
                    if (subRect.right > vw) {
                        sub.style.left = 'auto';
                        sub.style.right = '100%';
                    }
                    if (subRect.bottom > vh) {
                        sub.style.top = 'auto';
                        sub.style.bottom = '-4px';
                    }
                });
            });
        });
    }

    function _buildMenuDOM(sections) {
        _injectStyles();
        const menu = document.createElement('div');
        menu.id = '__sm_ctx_root';
        menu.className = 'sm-dcc-menu';

        const searchWrap = document.createElement('div');
        searchWrap.className = 'sm-dcc-search';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Filter actions...';
        searchInput.spellcheck = false;
        searchWrap.appendChild(searchInput);
        menu.appendChild(searchWrap);

        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            menu.querySelectorAll('.sm-dcc-item, .sm-dcc-header, .sm-dcc-sep').forEach(el => {
                if (el.classList.contains('sm-dcc-sep')) return;
                if (!q) {
                    el.style.display = '';
                } else if (el.classList.contains('sm-dcc-header')) {
                    el.style.display = 'none';
                } else {
                    const text = el.textContent.toLowerCase();
                    el.style.display = text.includes(q) ? 'flex' : 'none';
                }
            });
        });

        sections.forEach((sec, sIdx) => {
            if (sec.header) {
                const h = document.createElement('div');
                h.className = 'sm-dcc-header';
                h.innerHTML = `<span>${sec.header}</span> ${sec.badge ? `<span class="badge">${sec.badge}</span>` : ''}`;
                menu.appendChild(h);
            }

            if (Array.isArray(sec.swatches)) {
                const swWrap = document.createElement('div');
                swWrap.className = 'sm-dcc-swatches';
                sec.swatches.forEach(hex => {
                    const sw = document.createElement('div');
                    sw.className = 'sm-swatch';
                    sw.style.backgroundColor = hex;
                    sw.addEventListener('click', (e) => {
                        e.stopPropagation();
                        SMContextMenu.closeAll();
                        setSelectionColor(hex);
                    });
                    swWrap.appendChild(sw);
                });
                menu.appendChild(swWrap);
            }

            if (Array.isArray(sec.items)) {
                sec.items.forEach(item => {
                    if (item.sep) {
                        const sp = document.createElement('div');
                        sp.className = 'sm-dcc-sep';
                        menu.appendChild(sp);
                        return;
                    }
                    menu.appendChild(_buildItemDOM(item));
                });
            }

            if (sIdx < sections.length - 1 && !sec.noSep) {
                const sp = document.createElement('div');
                sp.className = 'sm-dcc-sep';
                menu.appendChild(sp);
            }
        });

        return menu;
    }

    function _buildItemDOM(item) {
        const el = document.createElement('div');
        el.className = `sm-dcc-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}`;

        const iconMarkup = item.icon
            ? `<i class="${item.icon}"></i>`
            : `<span style="width:14px;text-align:center;color:#888;">•</span>`;

        el.innerHTML = `
            ${iconMarkup}
            <span>${item.label}</span>
            ${item.shortcut ? `<span class="sm-shortcut">${item.shortcut}</span>` : ''}
            ${item.children?.length ? `<span class="sm-arrow">▸</span>` : ''}
        `;

        if (item.children?.length) {
            const sub = document.createElement('div');
            sub.className = 'sm-dcc-sub';
            item.children.forEach(ch => {
                if (ch.sep) {
                    const sp = document.createElement('div');
                    sp.className = 'sm-dcc-sep';
                    sub.appendChild(sp);
                } else {
                    sub.appendChild(_buildItemDOM(ch));
                }
            });
            el.appendChild(sub);
        } else if (!item.disabled && typeof item.action === 'function') {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                SMContextMenu.closeAll();
                item.action();
            });
        }

        return el;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       5. VIEWPORT MENU CONFIGURATION
    ═══════════════════════════════════════════════════════════════════════════ */

    function getViewportMenuConfig() {
        const selection = _getSelection();
        const activeObj = global.selectedObject || selection[0] || null;
        const count = selection.length;
        const hasSel = count > 0;
        const hasClipboard = Boolean(global.__smClipboard?.length);

        const isMesh = activeObj?.isMesh;
        const isLight = activeObj?.isLight;
        const isCamera = activeObj?.isCamera;
        const isMulti = count > 1;
        const sculptTopology = global.SMAdvancedSculptTopology;
        const sculptWorkspace = global.SMAdvancedMeshSculptWorkspace;
        const sculptTargets = selection.filter(object => object?.isMesh && !object.userData?.isTerrain);
        const canIncreaseSculptResolution = (levels) => Boolean(
            sculptTargets.length &&
            sculptWorkspace?.prepareResolution &&
            sculptTargets.every(object => sculptTopology?.canSubdivide?.(object.geometry, levels))
        );
        const increaseSculptResolution = (levels) => {
            const results = sculptTargets
                .map(object => sculptWorkspace?.prepareResolution?.(object, levels))
                .filter(Boolean);
            if (!results.length) return;
            if (results.length === 1) {
                const result = results[0];
                _toast(`${result.mesh.name || 'Mesh'}: ${result.beforeVertices.toLocaleString()} → ${result.afterVertices.toLocaleString()} sculpt vertices.`);
                return;
            }
            _toast(`Sculpt resolution increased on ${results.length} selected meshes.`);
        };

        const sections = [];

        if (hasSel) {
            const typeName = isMesh ? 'Mesh' : isLight ? 'Light' : isCamera ? 'Camera' : activeObj.type || 'Object';
            sections.push({
                header: isMulti ? `${count} Objects Selected` : activeObj.name || 'Object',
                badge: isMulti ? 'MULTI' : typeName.toUpperCase(),
                noSep: true
            });
        }

        if (hasSel && !isMulti && (isMesh || isLight)) {
            sections.push({
                swatches: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ffffff', '#1f2937']
            });
        }

        sections.push({
            header: 'Edit & Clipboard',
            items: [
                { label: 'Copy', shortcut: 'Ctrl+C', icon: 'fas fa-copy', action: smCopy, disabled: !hasSel },
                { label: 'Paste', shortcut: 'Ctrl+V', icon: 'fas fa-paste', action: smPaste, disabled: !hasClipboard },
                { label: 'Duplicate', shortcut: 'Ctrl+D', icon: 'fas fa-clone', action: () => smDuplicate(), disabled: !hasSel },
                { label: 'Delete', shortcut: 'Del', icon: 'fas fa-trash-alt', action: () => smDelete(), disabled: !hasSel, danger: true },
                { sep: true },
                { label: 'Focus in View', shortcut: 'F', icon: 'fas fa-crosshairs', action: focusSelected, disabled: !hasSel }
            ]
        });

        sections.push({
            header: 'Add to Scene',
            items: [
                {
                    label: 'Add Mesh', icon: 'fas fa-cube', children: [
                        { label: 'Cube', icon: 'fas fa-cube', action: () => global.addCube?.() },
                        { label: 'UV Sphere', icon: 'fas fa-globe', action: () => global.addSphere?.() },
                        { label: 'Plane / Ground', icon: 'fas fa-square', action: () => global.addPlane?.() },
                        { label: 'Cylinder', icon: 'fas fa-database', action: () => global.addCylinder?.() },
                        { label: 'Cone', icon: 'fas fa-caret-up', action: () => global.addCone?.() },
                        { label: 'Torus', icon: 'fas fa-circle-notch', action: () => global.addTorus?.() },
                        { label: 'Monkey (Suzanne)', icon: 'fas fa-paw', action: () => global.addMonkey?.() },
                    ]
                },
                {
                    label: 'Add Light', icon: 'fas fa-lightbulb', children: [
                        { label: 'Point Light', icon: 'fas fa-sun', action: () => global.createManagedPointLight?.() },
                        { label: 'Spot Light', icon: 'fas fa-flashlight', action: () => global.createManagedSpotLight?.() },
                        { label: 'Directional / Sun', icon: 'fas fa-sun', action: () => global.createManagedDirectionalLight?.() },
                        { label: 'Area Light', icon: 'fas fa-vector-square', action: () => global.createManagedAreaLight?.() },
                    ]
                },
                {
                    label: 'Add Camera', icon: 'fas fa-video', children: [
                        { label: 'Perspective Camera', icon: 'fas fa-camera', action: () => global.addPerspectiveCameraMenu?.() },
                        { label: 'Orthographic Camera', icon: 'fas fa-cube', action: () => global.addOrthographicCameraMenu?.() }
                    ]
                }
            ]
        });

        if (isMesh) {
            sections.push({
                header: 'Mesh Operations',
                items: [
                    { label: 'Shade Smooth', icon: 'fas fa-circle', action: () => setMeshShading(true) },
                    { label: 'Shade Flat', icon: 'fas fa-cube', action: () => setMeshShading(false) },
                    { sep: true },
                    { label: 'Snap to Floor', icon: 'fas fa-arrow-down-to-line', action: snapToGround },
                    { label: 'Center Pivot', icon: 'fas fa-bullseye', action: () => global.centerPivot?.() },
                    { label: 'Bake Transform', icon: 'fas fa-fire', action: () => global.bakeTransformations?.() },
                ]
            });
        }

        if (sculptTargets.length) {
            sections.push({
                header: 'Sculpt Resolution',
                items: [
                    {
                        label: 'Add Subdivision',
                        icon: 'fas fa-layer-group',
                        children: [
                            {
                                label: '1 Level — 4× Faces',
                                icon: 'fas fa-plus',
                                disabled: !canIncreaseSculptResolution(1),
                                action: () => increaseSculptResolution(1)
                            },
                            {
                                label: '2 Levels — 16× Faces',
                                icon: 'fas fa-plus',
                                disabled: !canIncreaseSculptResolution(2),
                                action: () => increaseSculptResolution(2)
                            },
                            {
                                label: '3 Levels — 64× Faces',
                                icon: 'fas fa-plus',
                                disabled: !canIncreaseSculptResolution(3),
                                action: () => increaseSculptResolution(3)
                            }
                        ]
                    }
                ]
            });
        }

        if (isLight) {
            sections.push({
                header: 'Light Controls',
                items: [
                    {
                        label: activeObj.castShadow ? 'Disable Shadow' : 'Enable Shadow',
                        icon: 'fas fa-cloud-moon',
                        action: () => {
                            activeObj.castShadow = !activeObj.castShadow;
                            _toast(`Shadows ${activeObj.castShadow ? 'Enabled' : 'Disabled'}`);
                        }
                    },
                    {
                        label: 'Intensity Multiplier', icon: 'fas fa-bolt', children: [
                            { label: '0.5x (Dimmer)', action: () => { activeObj.intensity *= 0.5; _toast('Intensity halved'); } },
                            { label: '1.5x (Brighter)', action: () => { activeObj.intensity *= 1.5; _toast('Intensity boosted'); } },
                            { label: '2.0x (Double)', action: () => { activeObj.intensity *= 2.0; _toast('Intensity doubled'); } }
                        ]
                    }
                ]
            });
        }

        if (isCamera) {
            sections.push({
                header: 'Camera Controls',
                items: [
                    { label: 'Look Through Camera', icon: 'fas fa-eye', action: () => { global._isInsideCamera = true; global.SMViewportSystem?.setActiveCamera?.(activeObj); } },
                    { label: 'Align to View', icon: 'fas fa-arrows-to-eye', action: alignCameraToView, shortcut: 'Ctrl+Alt+0' },
                    { label: 'Set as Active Render Cam', icon: 'fas fa-camera', action: () => { global.gameCamera = activeObj; _toast('Set as Render Camera'); } }
                ]
            });
        }

        if (isMulti) {
            sections.push({
                header: 'Transform Alignment',
                items: [
                    { label: 'Group Selected', shortcut: 'Ctrl+G', icon: 'fas fa-object-group', action: () => global.groupSelectedObjects?.() },
                    {
                        label: 'Align Position', icon: 'fas fa-align-center', children: [
                            { label: 'Align Min X', action: () => global.alignObjects?.('x', 'min') },
                            { label: 'Align Center X', action: () => global.alignObjects?.('x', 'center') },
                            { label: 'Align Max X', action: () => global.alignObjects?.('x', 'max') },
                            { sep: true },
                            { label: 'Align Ground (Y)', action: snapToGround }
                        ]
                    }
                ]
            });
        }

        return sections;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       6. GLOBAL CONTEXT MENU DISPATCHER
    ═══════════════════════════════════════════════════════════════════════════ */

    if (!global.__smCtxMenuRegistered) {
        global.__smCtxMenuRegistered = true;

        window.addEventListener('contextmenu', (e) => {
            SMContextMenu.closeAll();

            // Right mouse drag is reserved for orbiting while advanced mesh
            // sculpt is active. Do not open a viewport menu when the drag ends.
            if (global.__smAdvancedMeshSculptMode) {
                const sculptViewport = e.target?.closest?.('#viewport, #canvas-container, #viewport-container, canvas, #main-viewport, .viewport-canvas-container');
                if (sculptViewport) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
            }

            const target = e.target;
            if (!target) return;

            const tag = target.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (target.closest('[data-no-context]')) return;

            const isHierarchy = target.closest('#hierarchy-panel, #outliner-container, .hierarchy-container, #hierarchy-tree');
            const isAssetsPanel = target.closest('#assetsPanel, #assetsGrid, #assetsCategoriesPanel, #assets-panel, #content-browser, #assets-container, .asset-grid');
            const isMediaPool = target.closest('#media-pool-content, .media-grid, #media-pool-grid, .resolve-media-pool');
            const isTimeline = target.closest('#timeline, #sequencer-panel, .timeline-tracks, #timeline-container');
            const isInspector = target.closest('#inspector-panel, #properties-panel, .inspector-content');

            if (isHierarchy || isAssetsPanel || isMediaPool || isTimeline || isInspector) {
                return;
            }

            const isViewport = target.closest('#viewport, #canvas-container, #viewport-container, canvas, #main-viewport, .viewport-canvas-container');
            if (!isViewport) return;

            e.preventDefault();
            e.stopPropagation();

            const sections = getViewportMenuConfig();
            SMContextMenu.open(e, sections);
        }, true);

        window.addEventListener('click', (e) => {
            if (!e.target?.closest('#__sm_ctx_root, #contextMenu, .context-menu, .sm-context-menu')) {
                SMContextMenu.closeAll();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                SMContextMenu.closeAll();
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       7. KEYBOARD SHORTCUTS
    ═══════════════════════════════════════════════════════════════════════════ */

    if (!global.__smShortcutsBound) {
        global.__smShortcutsBound = true;
        window.addEventListener('keydown', (e) => {
            if (_isTyping()) return;
            const ctrl = e.ctrlKey || e.metaKey;

            if (ctrl && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                smCopy();
            } else if (ctrl && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                smPaste();
            } else if (ctrl && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                smDuplicate();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
                if (document.activeElement === document.body || document.activeElement?.tagName === 'CANVAS') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    smDelete();
                }
            } else if (e.key.toLowerCase() === 'f' && !ctrl) {
                focusSelected();
            }
        }, true);
    }

    // ── Global Aliases ────────────────────────────────────────────────────────
    global.smCopy = smCopy;
    global.smPaste = smPaste;
    global.smDuplicate = smDuplicate;
    global.smDelete = smDelete;

    global.copyObject = smCopy;
    global.pasteObject = smPaste;
    global.duplicateObject = (obj) => smDuplicate(obj ? [obj] : null);
    global.duplicateSelected = () => smDuplicate();
    global.deleteObject = (obj) => smDelete(obj ? [obj] : null);
    global.deleteObjects = (objs) => smDelete(objs);

    global.snapToGround = snapToGround;
    global.setMeshShading = setMeshShading;
    global.focusSelected = focusSelected;

    console.log('%c[SM Engine] Advanced DCC Context Menu & Clipboard v4.3 Ready', 'color:#00bcd4;font-weight:bold;');

})(window);
