// ============================================================================
// HierarchyManager.js — Patched UE5-style Scene Outliner
// ============================================================================

class HierarchyManager {
    constructor(scene) {
        this.scene = scene;
        this.container = document.getElementById('hierarchy-content');
        this.viewModeSelect = document.getElementById('hierarchyViewMode');
        this.searchbar = document.getElementById('hierarchy-search-input');
        this.searchClearBtn = document.getElementById('hierarchy-search-clear');
        this.domElementMap = new Map();
        this._videoRowMap = new Map();
        this.videoMode = false;
        this.videoProvider = null;
        this.draggedItem = null;
        this._renameTarget = null;
        this._contextMenu = null;
        this.initListeners();
    }

    /* ─── Initialisation ─────────────────────────────────────────────── */
    initListeners() {
        if (!this.container) {
            console.error('HierarchyManager: #hierarchy-content not found.');
            return;
        }
        this.viewModeSelect?.addEventListener('change', () => this.renderAll());
        this.searchbar?.addEventListener('input', () => this.filterAndHighlight(this.searchbar.value));
        this.searchClearBtn?.addEventListener('click', () => {
            if (this.searchbar) this.searchbar.value = '';
            this.filterAndHighlight('');
        });
        if (window.selectionManager?.addEventListener) {
            window.selectionManager.addEventListener('selectionChanged', (e) => {
                this._updateSelectionInDOM(e.activeObject, e.selectedObjects || []);
            });
        }
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.hm-context-menu')) this._closeContextMenu();
            this._clearDropIndicators();
        });
        document.addEventListener('dragend', () => this._clearDropIndicators());
        this.renderAll();
    }

    /* ─── System-object filter ───────────────────────────────────────── */
    _isSystemObject(obj) {
        if (!obj || !obj.isObject3D) return true;
        
        const ud = obj.userData || {};
        if (ud.ignoreInHierarchy || ud.isSystemObject || ud.isHelper || ud.isInternal) return true;
        if (ud.isNaniteLOD || ud.isNaniteOriginal || ud.naniteHidden) return true;

        const type = obj.type || '';
        
        // 1. Hide System Helper Types & Bones
        const HELPER_TYPES = [
            'GridHelper', 'InfiniteGridHelper', 'PolarGridHelper',
            'AxesHelper', 'ArrowHelper', 'BoxHelper', 'Box3Helper',
            'CameraHelper', 'DirectionalLightHelper', 'HemisphereLightHelper',
            'PointLightHelper', 'SpotLightHelper', 'RectAreaLightHelper',
            'SkeletonHelper', 'PlaneHelper', 'TransformControlsGizmo',
            'TransformControlsPlane', 'TransformControls',
            'LineSegments', 'LineLoop', 'Line'
        ];
        if (HELPER_TYPES.includes(type)) return true;

        const name = (obj.name || '').trim();
        const lowerName = name.toLowerCase();

        // Terrain is a workspace-private collection. Keep it completely out of
        // the hierarchy while another workspace is active, even if a legacy
        // creator restored the objects after the mode switch.
        const activeMode = String(
            window.workspaceManager?.currentMode ||
            localStorage.getItem('sm_workspace_mode') ||
            'FILM'
        ).toUpperCase();
        const isTerrainObject =
            obj === window.terrain ||
            ud.isTerrain === true ||
            ud.isTerrainMesh === true ||
            ud.isTerrainComponent === true ||
            ud.workspaceOnly === 'TERRAIN' ||
            name === 'Terrain' ||
            name === 'Terrain_Mesh' ||
            name.startsWith('Terrain_');
        if (isTerrainObject && activeMode !== 'TERRAIN') return true;

        // 2. Hide Nanite & Exporter LOD clones (e.g., NaniteObj_LOD2, innerRing_LOD2, X_LOD3)
        if (lowerName.includes('lod') || lowerName.match(/_lod\d/) || lowerName.match(/lod\d/)) {
            return true;
        }

        // 3. Hide Transform Gizmo Interactive Handles (e.g. XYZE, X, Y, Z, E)
        const GIZMO_PIECES = ['x', 'y', 'z', 'e', 'xyze', 'pct'];
        if (GIZMO_PIECES.includes(lowerName)) {
            return true;
        }

        // 4. Hide raw unnamed or generic "Mesh" objects added flatly to the scene
        // Primitives are named (Cube, Sphere, Plane) and character models are wrapped in groups.
        if (obj.parent === this.scene && obj.isMesh && (name === '' || lowerName === 'mesh')) {
            return true;
        }

        // 5. Internal Engine helper naming filters
        const INTERNAL_NAMES = [
            'distancemarker', 'distancemarkers',
            'vertexhelper', 'vertexhelpers',
            'edgehelper', 'edgehelpers',
            'facehelper', 'facehelpers',
            'previewline', 'previewhelper',
            'helper', '_helper', '_internal',
            'grid', 'skyhemilight', 'skyhelper',
            'gizmoplanes', 'gizmo', 'transformgizmo',
            'decal', 'paintdecal', 'nanitedebuggroup',
            'unrealenginefloor', 'axeshelper'
        ];
        if (INTERNAL_NAMES.some(iname => lowerName === iname || lowerName.startsWith(iname + '_') || lowerName.startsWith(iname + '-'))) {
            return true;
        }

        // 6. Parent Chain Check: If any parent is a system/LOD object, hide this child
        let parent = obj.parent;
        while (parent) {
            const pName = (parent.name || '').toLowerCase();
            if (parent.userData?.isSystemObject || 
                parent.userData?.ignoreInHierarchy || 
                pName === 'nanitedebuggroup' || 
                pName.includes('lod')) {
                return true;
            }
            parent = parent.parent;
        }

        return false;
    }

    _visibleObjects(list) {
        return (list || []).filter(o => !this._isSystemObject(o));
    }

    /* ─── UUID helper ────────────────────────────────────────────────── */
    _ensureUUID(obj) {
        if (!obj.uuid && window.THREE?.MathUtils?.generateUUID)
            obj.uuid = THREE.MathUtils.generateUUID();
        obj.userData = obj.userData || {};
        window.smSceneManager?.ensureEntity?.(obj);
        if (typeof obj.userData.expanded === 'undefined') obj.userData.expanded = true;
        if (typeof obj.userData.locked === 'undefined') obj.userData.locked = false;
    }

    /* ─── Icon resolution ────────────────────────────────────────────── */
    _getObjectIcon(obj) {
        if (typeof window.getObjectIcon === 'function') return window.getObjectIcon(obj);
        if (obj.isDirectionalLight || obj.isPointLight || obj.isSpotLight || obj.isRectAreaLight || obj.isAmbientLight || obj.isHemisphereLight)
            return '<i class="fas fa-lightbulb icon-light"></i>';
        if (obj.isCamera)    return '<i class="fas fa-video icon-camera"></i>';
        if (obj.isBone)      return '<i class="fas fa-bone icon-bone"></i>';
        if (obj.isMesh || obj.isSkinnedMesh)
            return '<i class="fas fa-cube icon-mesh"></i>';
        if (obj.isGroup)     return '<i class="fas fa-object-group icon-group"></i>';
        if (obj.isScene)     return '<i class="fas fa-globe icon-scene"></i>';
        return '<i class="fas fa-circle-dot icon-default"></i>';
    }

    _displayName(obj) {
        return obj.name || obj.type || obj.uuid?.slice(0, 8) || 'Object';
    }

    _hasVisibleChildren(obj) {
        return this._visibleObjects(obj.children || []).length > 0;
    }

    /* ─── Render entry point ─────────────────────────────────────────── */
    renderAll() {
        if (!this.container || !this.scene) return;
        if (this.videoMode && this.videoProvider) {
            this._renderVideoItems();
            return;
        }
        this.domElementMap.clear();
        this.container.innerHTML = '';

        const topLevel = this._visibleObjects(this.scene.children);
        const worldHeader = document.createElement('div');
        worldHeader.className = 'hm-world-root';
        worldHeader.innerHTML = `<i class="fas fa-globe"></i><strong>${this.scene.name || 'WORLD'}</strong><span>${topLevel.length} roots</span>`;
        this.container.appendChild(worldHeader);
        if (!topLevel.length) {
            const msg = document.createElement('div');
            msg.className = 'hm-empty';
            msg.innerHTML = '<i class="fas fa-ghost"></i><span>Scene is empty</span>';
            this.container.appendChild(msg);
            return;
        }

        const mode = this.viewModeSelect?.value || 'tree';
        if (mode === 'flat') this._renderFlat(topLevel);
        else if (mode === 'type') this._renderByType(topLevel);
        else this._renderTree(this.container, topLevel, 0, []);

        if (window.selectedObject)
            this._updateSelectionInDOM(window.selectedObject, [window.selectedObject]);

        const term = this.searchbar?.value?.trim();
        if (term) this.filterAndHighlight(term);
    }

    /* ─── Tree view ──────────────────────────────────────────────────── */
    _renderTree(parent, objList, depth, ancestorIsLast) {
        const visible = this._visibleObjects(objList);
        visible.forEach((obj, idx) => {
            this._ensureUUID(obj);
            const isLast = idx === visible.length - 1;
            const row = this._buildRow(obj, depth, isLast, ancestorIsLast);
            parent.appendChild(row);
            if (obj.userData.expanded && this._hasVisibleChildren(obj)) {
                this._renderTree(parent, obj.children, depth + 1, [...ancestorIsLast, isLast]);
            }
        });
    }

    /* ─── Row DOM builder ────────────────────────────────────────────── */
    _buildRow(obj, depth, isLast, ancestorIsLast) {
        const row = document.createElement('div');
        row.className = 'hm-row';
        row.dataset.uuid = obj.uuid;
        row.dataset.depth = String(depth);
        row.draggable = !obj.userData?.locked;

        const lines = document.createElement('div');
        lines.className = 'hm-lines';
        lines.style.width = `${depth * 16}px`;

        for (let i = 0; i < depth; i++) {
            const vline = document.createElement('span');
            vline.className = 'hm-vline';
            vline.style.left = `${i * 16 + 7}px`;
            if (ancestorIsLast[i]) vline.style.display = 'none'; 
            lines.appendChild(vline);
        }
        if (depth > 0) {
            const elbow = document.createElement('span');
            elbow.className = `hm-elbow${isLast ? ' hm-elbow-last' : ''}`;
            elbow.style.left = `${(depth - 1) * 16 + 7}px`;
            lines.appendChild(elbow);
        }

        const hasKids = this._hasVisibleChildren(obj);
        const toggle = document.createElement('button');
        toggle.className = 'hm-toggle' + (hasKids ? '' : ' hm-toggle-empty');
        toggle.innerHTML = hasKids
            ? (obj.userData.expanded
                ? '<i class="fas fa-caret-down"></i>'
                : '<i class="fas fa-caret-right"></i>')
            : '';
        toggle.addEventListener('click', (e) => { e.stopPropagation(); this._toggleExpand(obj); });

        const icon = document.createElement('span');
        icon.className = 'hm-icon';
        icon.innerHTML = this._getObjectIcon(obj);

        const nameEl = document.createElement('span');
        nameEl.className = 'hm-name';
        nameEl.textContent = this._displayName(obj);
        nameEl.title = `${this._displayName(obj)} [${obj.type || 'Object3D'}]`;
        nameEl.addEventListener('dblclick', (e) => { e.stopPropagation(); this._startRename(obj, nameEl); });

        const spacer = document.createElement('span');
        spacer.className = 'hm-spacer';

        const vis = document.createElement('button');
        vis.className = 'hm-action hm-vis';
        vis.title = obj.visible ? 'Hide' : 'Show';
        vis.innerHTML = obj.visible
            ? '<i class="fas fa-eye"></i>'
            : '<i class="fas fa-eye-slash"></i>';
        vis.addEventListener('click', (e) => { e.stopPropagation(); this._toggleVis(obj, vis); });

        const entity = window.smSceneManager?.ensureEntity?.(obj);
        const active = document.createElement('button');
        active.className = 'hm-action hm-active' + (entity?.active === false ? ' hm-active-off' : '');
        active.title = entity?.active === false ? 'Enable Entity' : 'Disable Entity';
        active.innerHTML = '<i class="fas fa-power-off"></i>';
        active.addEventListener('click', (e) => { e.stopPropagation(); this._toggleActive(obj, active, row); });

        const lock = document.createElement('button');
        lock.className = 'hm-action hm-lock' + (obj.userData.locked ? ' hm-lock-active' : '');
        lock.title = obj.userData.locked ? 'Unlock' : 'Lock';
        lock.innerHTML = obj.userData.locked
            ? '<i class="fas fa-lock"></i>'
            : '<i class="fas fa-lock-open"></i>';
        lock.addEventListener('click', (e) => { e.stopPropagation(); this._toggleLock(obj, lock, row); });

        row.append(lines, toggle, icon, nameEl, spacer, vis, active, lock);

        row.addEventListener('click', (e) => this._selectObject(obj, e));
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); this._openContextMenu(obj, e); });
        row.addEventListener('dragstart', (e) => this._onDragStart(e, obj));
        row.addEventListener('dragover', (e) => this._onDragOver(e, obj, row));
        row.addEventListener('dragleave', () => this._clearDropIndicators());
        row.addEventListener('drop', (e) => this._onDrop(e, obj));

        if (obj.userData.locked) row.classList.add('hm-row-locked');
        if (!obj.visible) row.classList.add('hm-row-hidden');
        if (entity?.active === false) row.classList.add('hm-row-inactive');

        this.domElementMap.set(obj.uuid, row);
        return row;
    }

    /* ─── Flat view ──────────────────────────────────────────────────── */
    _renderFlat(topLevel) {
        const all = [];
        const collect = (o) => { if (!this._isSystemObject(o)) { all.push(o); o.children?.forEach(collect); } };
        topLevel.forEach(collect);
        all.forEach(o => { this._ensureUUID(o); this.container.appendChild(this._buildRow(o, 0, true, [])); });
    }

    /* ─── Type-grouped view ──────────────────────────────────────────── */
    _renderByType(topLevel) {
        const groups = new Map();
        const collect = (o) => {
            if (this._isSystemObject(o)) return;
            const entityCategory = window.smSceneManager?.getEntity?.(o)?.category;
            const t = entityCategory && entityCategory !== 'World'
                ? entityCategory
                : o.isLight ? 'Lights' : o.isCamera ? 'Cameras' : o.isMesh || o.isSkinnedMesh ? 'Meshes' : o.isBone ? 'Bones' : o.isGroup ? 'Groups' : 'Objects';
            if (!groups.has(t)) groups.set(t, []);
            groups.get(t).push(o);
            o.children?.forEach(collect);
        };
        topLevel.forEach(collect);
        const ORDER = ['Meshes', 'Groups', 'Lights', 'Cameras', 'Bones', 'Objects'];
        const sorted = [...groups.keys()].sort((a, b) => (ORDER.indexOf(a) - ORDER.indexOf(b)));
        sorted.forEach(type => {
            const header = document.createElement('div');
            header.className = 'hm-type-header';
            header.innerHTML = `<span>${type}</span><span class="hm-count">${groups.get(type).length}</span>`;
            this.container.appendChild(header);
            groups.get(type).forEach(o => { this._ensureUUID(o); this.container.appendChild(this._buildRow(o, 1, true, [])); });
        });
    }

    /* ─── Video Editing Mode ─────────────────────────────────────────── */
    setVideoMode(active, provider) {
        this.videoMode = !!active;
        this.videoProvider = active ? provider : null;
        this.renderAll();
    }

    _videoItemIcon(item) {
        if (item.type === 'text') return '<i class="fas fa-font icon-mesh"></i>';
        if (item.mediaType === 'video') return '<i class="fas fa-video icon-camera"></i>';
        if (item.mediaType === 'image') return '<i class="fas fa-image icon-mesh"></i>';
        if (item.mediaType === 'audio') return '<i class="fas fa-music icon-mesh"></i>';
        return '<i class="fas fa-square icon-mesh"></i>';
    }

    _renderVideoItems() {
        this._videoRowMap.clear();
        this.domElementMap.clear();
        this.container.innerHTML = '';

        const items = (this.videoProvider?.items) || [];
        if (!items.length) {
            const msg = document.createElement('div');
            msg.className = 'hm-empty';
            msg.innerHTML = '<i class="fas fa-film"></i><span>Canvas is empty</span>';
            this.container.appendChild(msg);
            return;
        }

        items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'hm-row hm-row-video';
            row.dataset.videoItemId = item.id || String(index);

            const icon = document.createElement('span');
            icon.className = 'hm-icon';
            icon.innerHTML = this._videoItemIcon(item);

            const nameEl = document.createElement('span');
            nameEl.className = 'hm-name';
            nameEl.textContent = item.name || item.type || 'Clip';
            nameEl.title = `${nameEl.textContent} [${item.type || 'Clip'}]`;
            nameEl.addEventListener('dblclick', (e) => { e.stopPropagation(); this._startVideoRename(item, nameEl); });

            const spacer = document.createElement('span');
            spacer.className = 'hm-spacer';

            const vis = document.createElement('button');
            vis.className = 'hm-action hm-vis';
            vis.title = item.visible === false ? 'Show' : 'Hide';
            vis.innerHTML = item.visible === false
                ? '<i class="fas fa-eye-slash"></i>'
                : '<i class="fas fa-eye"></i>';
            vis.addEventListener('click', (e) => { e.stopPropagation(); this._toggleVideoVis(item, vis, row); });

            const del = document.createElement('button');
            del.className = 'hm-action hm-video-delete';
            del.title = 'Delete Clip';
            del.innerHTML = '<i class="fas fa-trash"></i>';
            del.addEventListener('click', (e) => { e.stopPropagation(); this.videoProvider?.deleteItem?.(item); });

            row.append(icon, nameEl, spacer, vis, del);

            row.addEventListener('click', (e) => {
                if (e.target.closest('.hm-action')) return;
                this.videoProvider?.selectItem?.(item);
            });

            if (this.videoProvider?.selectedItem === item) row.classList.add('hm-selected');
            if (item.visible === false) row.classList.add('hm-row-hidden');

            this._videoRowMap.set(item.id || String(index), row);
            this.container.appendChild(row);
        });

        const term = this.searchbar?.value?.trim();
        if (term) this.filterAndHighlight(term);
    }

    updateVideoSelection(item) {
        this._videoRowMap.forEach(row => row.classList.remove('hm-selected'));
        if (!item) return;
        const row = this._videoRowMap.get(item.id);
        row?.classList.add('hm-selected');
    }

    _toggleVideoVis(item, btn, row) {
        item.visible = item.visible === false ? true : false;
        btn.innerHTML = item.visible === false ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
        btn.title = item.visible === false ? 'Show' : 'Hide';
        row.classList.toggle('hm-row-hidden', item.visible === false);
        this.videoProvider?.renderCanvas?.();
    }

    _startVideoRename(item, nameEl) {
        const input = document.createElement('input');
        input.className = 'hm-rename-input';
        input.value = item.name || '';
        nameEl.replaceWith(input);
        input.focus(); input.select();
        const commit = () => {
            const newName = input.value.trim();
            if (newName) this.videoProvider?.renameItem?.(item, newName);
            input.replaceWith(nameEl);
            nameEl.textContent = item.name || item.type || 'Clip';
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { input.value = item.name || ''; commit(); }
        });
    }

    /* ─── Selection ──────────────────────────────────────────────────── */
    _selectObject(obj, event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const activeMode = String(
            window.workspaceManager?.currentMode ||
            localStorage.getItem('sm_workspace_mode') ||
            'FILM'
        ).toUpperCase();
        let terrainNode = obj;
        let isTerrainObject = false;
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
                isTerrainObject = true;
                break;
            }
            terrainNode = terrainNode.parent;
        }
        if (isTerrainObject && activeMode !== 'TERRAIN') return;
        if (obj.userData?.locked) return;

        // Use the same selection authority as viewport clicks. This keeps the
        // hierarchy, gizmo, inspector and Modeling vertex/edge/face helpers in
        // one state instead of letting two selection managers fight.
        if (
            window._selectionState &&
            typeof window.selectObject === 'function'
        ) {
            const additive = !!(event?.ctrlKey || event?.metaKey);
            const selected = window.selectObject(obj, {
                source: 'hierarchy',
                additive,
                toggleIfSelected: additive
            });
            this._updateSelectionInDOM(
                selected || window.selectedObject || null,
                window.selectedObjects || []
            );
            return;
        }

        window.selectedObject = obj;
        if (typeof selectedObject !== 'undefined') selectedObject = obj;
        window.selectedBone = obj.isBone ? obj : null;
        if (window.selectionManager?.setSelection) {
            window.selectionManager.setSelection(obj, !!(event?.ctrlKey || event?.metaKey));
        }
        if (window.transformControls?.attach && !obj.isScene && !obj.userData?.isSystemObject) {
            try { window.transformControls.attach(obj); } catch (_) {}
        }
        if (window.outlinePass) window.outlinePass.selectedObjects = [obj];
        window.physicsSystem?.setSelectedObject?.(obj);
        if (typeof window.updateInspector === 'function') window.updateInspector();
        this._updateSelectionInDOM(obj, [obj]);
    }

    _updateSelectionInDOM(activeObj, allSelected = []) {
        this.container?.querySelectorAll('.hm-row.hm-selected').forEach(el => el.classList.remove('hm-selected'));
        const targets = Array.isArray(allSelected) && allSelected.length ? allSelected : activeObj ? [activeObj] : [];
        targets.forEach(o => this.domElementMap.get(o.uuid)?.classList.add('hm-selected'));
        if (activeObj?.uuid) {
            const el = this.domElementMap.get(activeObj.uuid);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /* ─── Expand / Collapse ──────────────────────────────────────────── */
    _toggleExpand(obj) {
        if (!this._hasVisibleChildren(obj)) return;
        obj.userData.expanded = !obj.userData.expanded;
        this.renderAll();
    }

    /* ─── Visibility ─────────────────────────────────────────────────── */
    _toggleVis(obj, btn) {
        if (window.smSceneManager) window.smSceneManager.setVisible(obj, !obj.visible);
        else obj.visible = !obj.visible;
        btn.innerHTML = obj.visible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        btn.title = obj.visible ? 'Hide' : 'Show';
        const row = this.domElementMap.get(obj.uuid);
        row?.classList.toggle('hm-row-hidden', !obj.visible);
    }

    _toggleActive(obj, btn, row) {
        const entity = window.smSceneManager?.ensureEntity?.(obj);
        const next = !(entity?.active !== false);
        if (entity) window.smSceneManager.setActive(entity, next);
        else {
            obj.userData = obj.userData || {};
            obj.userData.active = next;
        }
        btn.title = next ? 'Disable Entity' : 'Enable Entity';
        btn.classList.toggle('hm-active-off', !next);
        row?.classList.toggle('hm-row-inactive', !next);
        window.updateInspector?.();
    }

    /* ─── Lock ───────────────────────────────────────────────────────── */
    _toggleLock(obj, btn, row) {
        obj.userData.locked = !obj.userData.locked;
        btn.innerHTML = obj.userData.locked ? '<i class="fas fa-lock"></i>' : '<i class="fas fa-lock-open"></i>';
        btn.title = obj.userData.locked ? 'Unlock' : 'Lock';
        btn.classList.toggle('hm-lock-active', obj.userData.locked);
        row.classList.toggle('hm-row-locked', obj.userData.locked);
        row.draggable = !obj.userData.locked;
        if (window.transformControls && obj === window.selectedObject) {
            if (obj.userData.locked) { try { window.transformControls.detach(); } catch (_) {} }
            else { try { window.transformControls.attach(obj); } catch (_) {} }
        }
    }

    /* ─── Inline rename ──────────────────────────────────────────────── */
    _startRename(obj, nameEl) {
        const oldName = this._displayName(obj);
        const input = document.createElement('input');
        input.className = 'hm-rename-input';
        input.value = oldName;
        nameEl.replaceWith(input);
        input.focus(); input.select();
        const commit = () => {
            const newName = input.value.trim() || oldName;
            if (window.smSceneManager) window.smSceneManager.renameEntity(obj, newName);
            else obj.name = newName;
            input.replaceWith(nameEl);
            nameEl.textContent = newName;
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { input.value = oldName; commit(); } });
    }

    /* ─── Search ─────────────────────────────────────────────────────── */
    filterAndHighlight(term) {
        const needle = (term || '').trim().toLowerCase();
        this.container?.querySelectorAll('.hm-row').forEach(row => {
            const name = row.querySelector('.hm-name')?.textContent?.toLowerCase() || '';
            const match = !needle || name.includes(needle);
            row.style.display = match ? '' : 'none';
            row.classList.toggle('hm-search-match', !!(needle && match));
        });
    }

    /* ─── Context menu ───────────────────────────────────────────────── */
    _openContextMenu(obj, e) {
        this._closeContextMenu();
        const menu = document.createElement('div');
        menu.className = 'hm-context-menu';
        menu.style.left = `${e.clientX}px`;
        menu.style.top  = `${e.clientY}px`;

        const actions = [
            { icon: 'fa-crosshairs',  label: 'Focus',     fn: () => this._focusObject(obj) },
            { icon: 'fa-i-cursor',    label: 'Rename',    fn: () => { const row = this.domElementMap.get(obj.uuid); const nm = row?.querySelector('.hm-name'); if (nm) this._startRename(obj, nm); } },
            { icon: 'fa-copy',        label: 'Duplicate', fn: () => this._duplicateObject(obj) },
            { separator: true },
            { icon: 'fa-eye',         label: obj.visible ? 'Hide' : 'Show', fn: () => { const row = this.domElementMap.get(obj.uuid); const btn = row?.querySelector('.hm-vis'); this._toggleVis(obj, btn || { innerHTML: '' }); } },
            { icon: 'fa-power-off',    label: window.smSceneManager?.getEntity?.(obj)?.active === false ? 'Enable' : 'Disable', fn: () => { const row = this.domElementMap.get(obj.uuid); const btn = row?.querySelector('.hm-active'); if (btn) this._toggleActive(obj, btn, row); } },
            { icon: 'fa-lock',        label: obj.userData?.locked ? 'Unlock' : 'Lock', fn: () => { const row = this.domElementMap.get(obj.uuid); const btn = row?.querySelector('.hm-lock'); if (btn && row) this._toggleLock(obj, btn, row); } },
            { separator: true },
            ...(obj.isCamera ? [
                { separator: true },
                { icon: 'fa-video',   label: 'Use as Game Camera', fn: () => {
                    window.gameCamera = obj;
                    if (window.SMViewportSystem) {
                        window.SMViewportSystem.panels.forEach(panel => {
                            if (panel.type === 'game') panel.camera = obj;
                        });
                    }
                    console.log(`SM Engine: "${obj.name || obj.uuid}" set as Game Camera`);
                }},
                { icon: 'fa-eye',    label: 'Look Through Camera', fn: () => {
                    window._isInsideCamera = true;
                    window._viewedCamera = obj;
                    if (window.SMViewportSystem) window.SMViewportSystem.setActiveCamera(obj);
                }},
                { separator: true },
            ] : []),
            { icon: 'fa-trash',       label: 'Delete',    fn: () => this._deleteObject(obj), danger: true },
        ];

        actions.forEach(a => {
            if (a.separator) { const hr = document.createElement('div'); hr.className = 'hm-ctx-sep'; menu.appendChild(hr); return; }
            const item = document.createElement('button');
            item.className = 'hm-ctx-item' + (a.danger ? ' hm-ctx-danger' : '');
            item.innerHTML = `<i class="fas ${a.icon}"></i><span>${a.label}</span>`;
            item.addEventListener('click', () => { a.fn(); this._closeContextMenu(); });
            menu.appendChild(item);
        });

        document.body.appendChild(menu);
        this._contextMenu = menu;

        const r = menu.getBoundingClientRect();
        if (r.right > window.innerWidth)  menu.style.left = `${e.clientX - r.width}px`;
        if (r.bottom > window.innerHeight) menu.style.top  = `${e.clientY - r.height}px`;
    }

    _closeContextMenu() { this._contextMenu?.remove(); this._contextMenu = null; }

    /* ─── Object actions ─────────────────────────────────────────────── */
    _focusObject(obj) {
        if (!window.camera || !obj.getWorldPosition) return;
        const pos = new THREE.Vector3();
        obj.getWorldPosition(pos);
        if (window.controls?.target) {
            window.controls.target.copy(pos);
            window.controls.update();
        }
        if (window.camera) {
            const offset = pos.clone().add(new THREE.Vector3(2, 2, 5));
            window.camera.position.copy(offset);
            window.camera.lookAt(pos);
        }
    }

    _duplicateObject(obj) {
        if (window.smSceneManager) {
            const entity = window.smSceneManager.duplicateEntity(obj, { select: true });
            if (entity) {
                this.renderAll();
                this._selectObject(entity.object, null);
            }
            return;
        }
        if (!obj.parent) return;
        const clone = obj.clone();
        clone.name = (obj.name || 'Object') + '_Copy';
        clone.uuid = THREE.MathUtils.generateUUID();
        obj.parent.add(clone);
        this.renderAll();
        this._selectObject(clone, null);
    }

    _deleteObject(obj) {
        if (window.smSceneManager?.getEntity?.(obj)) {
            window.smSceneManager.destroyEntity(obj, { dispose: true, reason: 'outliner-delete' });
            this.renderAll();
            return;
        }
        if (obj === window.selectedObject) {
            try { window.transformControls?.detach(); } catch (_) {}
            window.selectedObject = null;
        }
        obj.parent?.remove(obj);
        if (obj.geometry) obj.geometry.dispose?.();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m?.dispose?.());
        else obj.material?.dispose?.();
        this.renderAll();
    }

    /* ─── Drag & drop ────────────────────────────────────────────────── */
    _onDragStart(e, obj) {
        this.draggedItem = obj;
        e.dataTransfer.setData('text/plain', obj.uuid);
        e.stopPropagation();
    }

    _onDragOver(e, targetObj, row) {
        e.preventDefault();
        if (!this.draggedItem || this.draggedItem === targetObj) return;
        if (this._isDescendant(this.draggedItem, targetObj)) { e.dataTransfer.dropEffect = 'none'; return; }
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('hm-drop-target');
    }

    _onDrop(e, targetObj) {
        e.preventDefault(); e.stopPropagation();
        this._clearDropIndicators();
        const uuid = e.dataTransfer.getData('text/plain');
        const src = this.scene.getObjectByProperty('uuid', uuid);
        if (!src || src === targetObj || this._isDescendant(src, targetObj)) return;

        // Reparenting a weapon/model below a scaled player bone with add()
        // keeps its local transform. Player skeletons commonly have a
        // non-unit scale, so the asset can suddenly become microscopic or
        // move outside the camera. Object3D.attach() preserves the world
        // position, rotation and scale while still making the model follow
        // the selected bone.
        this.scene.updateMatrixWorld?.(true);
        targetObj.updateMatrixWorld?.(true);
        if (window.smSceneManager) {
            window.smSceneManager.reparentEntity(src, targetObj, { preserveWorld: true, source: 'outliner-drop' });
        } else if (typeof targetObj.attach === 'function') {
            targetObj.attach(src);
        } else {
            src.parent?.remove(src);
            targetObj.add(src);
        }
        src.userData = src.userData || {};
        src.userData.isBoneAttachment = !!targetObj.isBone;
        if (targetObj.isBone) {
            src.userData.attachedBoneUuid = targetObj.uuid;
            src.userData.attachedBoneName = targetObj.name || 'Bone';
        } else {
            delete src.userData.attachedBoneUuid;
            delete src.userData.attachedBoneName;
        }
        src.visible = true;
        src.updateMatrixWorld?.(true);
        if (targetObj.isBone) {
            let playerRoot = targetObj;
            while (playerRoot && playerRoot !== this.scene && !playerRoot.userData?.isPlayerRoot) {
                playerRoot = playerRoot.parent;
            }
            const activeMode = String(
                window.workspaceManager?.currentMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM'
            ).toUpperCase();
            // A disabled player root makes every attached child invisible in
            // Three.js, even when the weapon row itself has its eye enabled.
            // The player is authorable in every normal workspace. Terrain is
            // the only mode where its dedicated placement bridge owns it.
            if (
                playerRoot?.userData?.isPlayerRoot &&
                activeMode !== 'TERRAIN'
            ) {
                playerRoot.visible = true;
            }
        }
        targetObj.userData.expanded = true;
        this.renderAll();
        this._selectObject(src, null);
    }

    _clearDropIndicators() {
        this.container?.querySelectorAll('.hm-drop-target').forEach(el => el.classList.remove('hm-drop-target'));
    }

    _isDescendant(parent, child) {
        let n = child;
        while (n) { if (n === parent) return true; n = n.parent; }
        return false;
    }

    /* ─── Public update API ──────────────────────────────────────────── */
    updateObjectDOM(obj) {
        const row = this.domElementMap.get(obj?.uuid);
        if (!row) return;
        const nm = row.querySelector('.hm-name');
        if (nm) nm.textContent = this._displayName(obj);
        const ic = row.querySelector('.hm-icon');
        if (ic) ic.innerHTML = this._getObjectIcon(obj);
        const vis = row.querySelector('.hm-vis');
        if (vis) vis.innerHTML = obj.visible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        row.classList.toggle('hm-row-hidden', !obj.visible);
    }
}

window.HierarchyManager = HierarchyManager;
