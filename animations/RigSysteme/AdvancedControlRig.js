/**
 * SMAdvancedControlRigSystem.js — UE5 + Blender Style Edition
 *
 * Layout mirrors Unreal Engine 5's Control Rig editor:
 *   Left  → Bone Hierarchy Tree (searchable, collapsible)
 *   Center → Controller Grid  (filterable by role/chain)
 *   Right  → Full Property Inspector:
 *              • Transform  (editable pos / rot / scale)
 *              • Constraints stack
 *              • IK Settings
 *              • Bone Properties
 *
 * Mode bar:  Object Mode  |  Pose Mode  |  Edit Mode
 * Toolbar:   Add Bone  |  Key  |  Sync  |  Deselect  |  Pose Library
 */
class SMAdvancedControlRigSystem {
    constructor(rigManager) {
        this.rigManager    = rigManager;
        this.panel         = document.getElementById('bone-editor');
        this.activeObject  = null;
        this.activeProfile = null;
        this.selectedBone  = null;

        /* ── UI State ── */
        this.currentMode     = 'pose';      // 'object' | 'pose' | 'edit'
        this.hierarchySearch = '';
        this.collapsedNodes  = new Set();   // collapsed bone uuids
        this.controlFilter   = 'all';       // 'all' | 'control' | 'deform' | 'ik'
        this.sortMode        = 'hierarchy'; // 'hierarchy' | 'alpha' | 'role'
        this.showPoseLibrary = false;

        /* ── Transform edit tracking ── */
        this._transformUpdateTimer = null;

        this._ensurePanel();
        this._bindEvents();
        this.refresh();
    }

    /* ═══════════════════════════════════════════════════════════
       INIT
    ═══════════════════════════════════════════════════════════ */

    _ensurePanel() {
        if (!this.panel) return;

        /* Cache key containers */
        this.summaryEl        = this.panel.querySelector('#rig-profile-summary');
        this.chainsEl         = this.panel.querySelector('#rig-profile-chains');
        this.controlsEl       = this.panel.querySelector('#rig-profile-controls');
        this.selectionDetailsEl = this.panel.querySelector('#rig-selection-details');
        this.selectionStatusEl  = this.panel.querySelector('#rig-status-selection');
        this.hierarchyEl      = this.panel.querySelector('#rig-hierarchy-tree');
        this.editorBodyEl     = this.panel.querySelector('.bone-rig-editor-body');

        /* Toolbar buttons */
        this.panel.querySelector('#rig-key-selected-btn')?.addEventListener('click', () => {
            if (typeof addKeyframe === 'function') addKeyframe();
            this.rigManager?.recordPoseKey?.(this.activeObject, Number(window.currentTime) || 0);
        });
        this.panel.querySelector('#rig-setup-btn')?.addEventListener('click', () => {
            const candidate = this._resolveRigOwner(window.selectedObject || this.activeObject);
            if (!candidate) {
                window.alert?.('Select an object, character, car or machine before creating a rig.');
                return;
            }
            // RigManager creates an authored Root_CTRL automatically when an
            // object has no imported skeleton, so every Object3D can enter
            // the exact same Bone Rig workflow.
            this.rigManager?.setupRigForObject?.(candidate);
            this.setActiveObject(candidate);
            this._setWorkflowStatus('Rig ready. Select Root_CTRL, then use Add Bone in Rig View to build chains.');
        });
        this.panel.querySelector('#rig-record-pose-btn')?.addEventListener('click', () => {
            const key = this.rigManager?.recordPoseKey?.(this.activeObject, Number(window.currentTime) || 0);
            if (key) this._setWorkflowStatus(`Pose recorded at ${(Number(window.currentTime) || 0).toFixed(2)}s.`);
        });
        this.panel.querySelector('#rig-bake-clip-btn')?.addEventListener('click', () => {
            const count = this.rigManager?.getPoseRecording?.(this.activeObject)?.length || 0;
            if (!count) {
                window.alert?.('Record one or more poses first. Move the timeline playhead, pose the character, then click Record.');
                return;
            }
            const clipName = window.prompt?.('Animation clip name:', 'Rig_Animation');
            if (clipName === null) return;
            const clip = this.rigManager?.bakePoseRecording?.(this.activeObject, clipName);
            if (clip) this._setWorkflowStatus(`Clip “${clip.name}” baked (${clip.duration.toFixed(2)}s).`);
        });
        this.panel.querySelector('#rig-preview-clip-btn')?.addEventListener('click', () => {
            const owner = this.activeObject;
            const clipName = owner?.userData?.rigLastClip;
            const action = clipName ? this.rigManager?.playRigClip?.(owner, clipName, { loop: true, fadeIn: 0.12 }) : null;
            if (action) this._setWorkflowStatus(`Previewing “${clipName}”.`);
            else window.alert?.('Bake a clip first, then use Preview.');
        });
        this.panel.querySelector('#rig-runtime-btn')?.addEventListener('click', () => {
            const profile = this.rigManager?.createRuntimeProfile?.(this.activeObject);
            if (profile) this._setWorkflowStatus(`Runtime profile ready: ${profile.skeleton.length} bones, ${profile.clips.length} clips.`);
        });
        this.panel.querySelector('#rig-focus-timeline-btn')?.addEventListener('click', () => {
            this.rigManager?.focusSelectionInTimeline?.();
        });
        this.panel.querySelector('#deselect-bone-btn')?.addEventListener('click', () => {
            this.rigManager?.clearActiveBoneSelection?.();
        });
        this.panel.querySelector('#add-bone-btn')?.addEventListener('click', () => {
            const candidate = this._resolveRigOwner(window.selectedObject || this.activeObject);
            if (!candidate) {
                window.alert?.('Select an object first, then create a rig.');
                return;
            }
            this.rigManager?.setupRigForObject?.(candidate);
            const parent = this.rigManager?.selectedBone || this.rigManager?.getBonesForObject?.(candidate)?.[0] || null;
            this.rigManager?.startAddingMode?.(parent);
            this.currentMode = 'edit';
            this.panel.querySelectorAll('[data-rig-mode]').forEach((button) => {
                button.classList.toggle('active', button.dataset.rigMode === 'edit');
            });
            this._updateModeDisplay();
        });

        this.panel.querySelector('#rig-parent-part-btn')?.addEventListener('click', () => {
            const part = this.rigManager?.lastSelectedRigPart || null;
            const bone = this.rigManager?.selectedBone || window.selectedBone || null;
            if (!part || !bone) {
                this._setWorkflowStatus('Select a part first, then select a bone and click Parent Part.');
                return;
            }
            if (this.rigManager?.parentObjectToBone?.(part, bone)) {
                this._setWorkflowStatus(`${part.name || 'Part'} parented to ${bone.name} (Keep Transform).`);
                this.refresh();
            } else {
                this._setWorkflowStatus('Cannot parent that object to the selected bone.');
            }
        });

        this.panel.querySelector('#rig-unparent-part-btn')?.addEventListener('click', () => {
            const part = this.rigManager?.lastSelectedRigPart || null;
            if (this.rigManager?.unparentObjectFromBone?.(part)) {
                this._setWorkflowStatus(`${part.name || 'Part'} detached from its rig parent.`);
            } else {
                this._setWorkflowStatus('Select a rigged object part to clear its parent.');
            }
        });

        this.panel.querySelector('#rig-pose-lib-btn')?.addEventListener('click', () => {
            this.showPoseLibrary = !this.showPoseLibrary;
            this.refresh();
        });
        this.panel.querySelector('#bone-editor-expand')?.addEventListener('click', (event) => {
            const expanded = document.body.classList.toggle('bone-editor-expanded');
            event.currentTarget.classList.toggle('active', expanded);
            const icon = event.currentTarget.querySelector('i');
            if (icon) icon.className = expanded ? 'fas fa-compress' : 'fas fa-expand';
            window.dispatchEvent(new Event('resize'));
        });

        /* Mode buttons */
        this.panel.querySelectorAll('[data-rig-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentMode = btn.dataset.rigMode;
                this.rigManager?.setEditMode?.(this.currentMode);
                this.panel.querySelectorAll('[data-rig-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._updateModeDisplay();
                window.dispatchEvent(new CustomEvent('rigModeChanged', { detail: { mode: this.currentMode } }));
            });
        });

        /* Search */
        const searchInput = this.panel.querySelector('#rig-hierarchy-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.hierarchySearch = e.target.value.toLowerCase();
                this._renderHierarchyTree();
            });
        }

        /* Control filter */
        this.panel.querySelectorAll('[data-ctrl-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.panel.querySelectorAll('[data-ctrl-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.controlFilter = btn.dataset.ctrlFilter;
                this._renderControls();
            });
        });

        /* Sort */
        const sortSel = this.panel.querySelector('#rig-sort-select');
        if (sortSel) {
            sortSel.addEventListener('change', (e) => {
                this.sortMode = e.target.value;
                this._renderControls();
            });
        }

        this._setupResizers();
    }

    _bindEvents() {
        window.addEventListener('objectSelected', (e) => {
            this.selectedBone = e.detail?.object?.isBone ? e.detail.object : (window.selectedBone || null);
            this.setActiveObject(e.detail?.object || null);
        });

        window.addEventListener('rigProfileReady', (e) => {
            const obj = e.detail?.object || null;
            if (!this.activeObject || (obj && this._matchesActiveObject(obj))) this.setActiveObject(obj);
        });

        window.addEventListener('rigSelectionChanged', (e) => {
            this.selectedBone = e.detail?.bone || window.selectedBone || null;
            const owner = e.detail?.owner || null;
            if (owner && this._matchesActiveObject(owner)) this.setActiveObject(owner);
            else this.refresh();
        });

        window.addEventListener('rigBoneAdded', () => this.refresh());
        window.addEventListener('rigBoneRenamed', () => this.refresh());
        window.addEventListener('rigConstraintAdded', () => this._renderInspector());
        window.addEventListener('rigPoseSaved', () => { if (this.showPoseLibrary) this._renderPoseLibrary(); });
        window.addEventListener('rigClipBaked', (e) => {
            if (this._matchesActiveObject(e.detail?.owner)) this._setWorkflowStatus(`Clip “${e.detail.clip.name}” is available for game and film playback.`);
        });

        /* Transform field live-update */
        window.addEventListener('rigModeChanged', (e) => {
            this._updateModeDisplay();
        });
    }

    _matchesActiveObject(obj) {
        if (!obj || !this.activeObject) return false;
        if (obj.uuid === this.activeObject.uuid) return true;
        return !!obj.userData?.controlRigProfile
            && obj.userData.controlRigProfile.objectUuid === this.activeObject.uuid;
    }

    _resolveRigOwner(obj) {
        if (!obj) return null;
        if (obj.userData?.controlRigProfile) return obj;
        if (obj.isBone && typeof findSkinnedMeshOwner === 'function')
            return findSkinnedMeshOwner(obj) || obj.parent || obj;

        let ancestor = obj.parent;
        while (ancestor) {
            if (ancestor.userData?.controlRigProfile) return ancestor;
            ancestor = ancestor.parent;
        }

        const profiles = this.rigManager?.controlRigProfiles;
        if (profiles?.size && this.rigManager?.scene) {
            for (const objectUuid of profiles.keys()) {
                const owner = this.rigManager.scene.getObjectByProperty('uuid', objectUuid);
                let cursor = obj;
                while (cursor) {
                    if (cursor === owner) return owner;
                    cursor = cursor.parent;
                }
            }
        }
        return obj;
    }

    activateFromSceneSelection() {
        let candidate = window.selectedBone || window.selectedObject || null;
        if (!candidate && Array.isArray(window.selectedObjects)) {
            candidate = window.selectedObjects[window.selectedObjects.length - 1] || null;
        }

        if (!candidate && this.rigManager?.controlRigProfiles?.size && this.rigManager?.scene) {
            const firstUuid = this.rigManager.controlRigProfiles.keys().next().value;
            candidate = this.rigManager.scene.getObjectByProperty('uuid', firstUuid) || null;
        }

        if (candidate) this.setActiveObject(candidate);
        else this.refresh();
    }

    setActiveObject(obj) {
        this.activeObject = this._resolveRigOwner(obj);
        if (this.activeObject && !this.activeObject.userData?.controlRigProfile
            && this.rigManager?.getBonesForObject?.(this.activeObject).length > 0) {
            this.rigManager.setupRigForObject(this.activeObject);
        }
        this.activeProfile = this.rigManager?.getRigProfile?.(this.activeObject)
            || this.activeObject?.userData?.controlRigProfile
            || null;
        this.refresh();
    }

    refresh() {
        if (!this.summaryEl) return;

        if (!this.activeProfile) {
            this._renderEmptyState();
            return;
        }

        this._renderSummary();
        this._renderHierarchyTree();
        this._renderControls();
        this._renderInspector();
        if (this.showPoseLibrary) this._renderPoseLibrary();
    }

    _updateModeDisplay() {
        this.rigManager?.setEditMode?.(this.currentMode);
        const badge = this.panel?.querySelector('#rig-mode-badge');
        if (badge) badge.textContent = this.currentMode.charAt(0).toUpperCase() + this.currentMode.slice(1) + ' Mode';
        const statusMode = this.panel?.querySelector('#rig-status-mode');
        if (statusMode) statusMode.innerHTML = `<strong>Mode</strong> ${this._humanize(this.currentMode)}`;

        /* Disable transform editing in Object mode */
        const transformFields = this.panel?.querySelectorAll('.rig-transform-input');
        if (transformFields) {
            const disabled = (this.currentMode === 'object');
            transformFields.forEach(f => f.disabled = disabled);
        }
    }

    _setWorkflowStatus(message) {
        const status = this.panel?.querySelector('#rig-status-selection');
        if (status) status.innerHTML = `<strong>Rig</strong> ${message}`;
    }

    /* ═══════════════════════════════════════════════════════════
       EMPTY STATE
    ═══════════════════════════════════════════════════════════ */

    _renderEmptyState() {
        const empty = `<div class="rig-empty-state">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="rig-empty-icon">
                <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
                <path d="M24 14v8M24 30v4M18 24h4M26 24h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>Select or import a rigged object to begin.</p>
        </div>`;

        if (this.summaryEl)         this.summaryEl.innerHTML         = empty;
        if (this.hierarchyEl)       this.hierarchyEl.innerHTML       = empty;
        if (this.controlsEl)        this.controlsEl.innerHTML        = empty;
        if (this.selectionDetailsEl)this.selectionDetailsEl.innerHTML = `<div class="rig-empty-state"><p>No rig active.</p></div>`;
        if (this.selectionStatusEl) this.selectionStatusEl.innerHTML = `<strong>Active</strong> None`;
    }

    /* ═══════════════════════════════════════════════════════════
       SUMMARY
    ═══════════════════════════════════════════════════════════ */

    _renderSummary() {
        const p = this.activeProfile;
        const hasAuthored = p.authoredControllerCount > 0;
        const handRig = this.rigManager?.getHandRig?.(this.activeObject) || null;
        const handRows = ['left', 'right'].map(side => {
            const hand = handRig?.[side];
            if (!hand) return '';
            const label = side === 'left' ? 'Left Hand' : 'Right Hand';
            return `
                <div class="rig-hand-row" data-hand-side="${side}">
                    <div class="rig-hand-row-head">
                        <strong>${label}</strong>
                        <span class="rig-muted">Fist ${(hand.fist * 100).toFixed(0)}%</span>
                    </div>
                    <div class="rig-hand-row-controls">
                        <input class="rig-hand-fist" data-hand-fist="${side}" type="range" min="0" max="1" step="0.01" value="${hand.fist}" aria-label="${label} fist">
                        <select class="rig-hand-axis" data-hand-axis="${side}" title="Finger curl axis">
                            ${['x','y','z'].map(axis => `<option value="${axis}" ${hand.curlAxis === axis ? 'selected' : ''}>Curl ${axis.toUpperCase()}</option>`).join('')}
                        </select>
                        <button class="rig-hand-key" data-hand-key="${side}" title="Key this hand pose">◆</button>
                    </div>
                </div>`;
        }).join('');

        this.summaryEl.innerHTML = `
        <div class="rig-summary-card">
            <div class="rig-summary-head">
                <div class="rig-summary-name">${p.objectName}</div>
                <span class="rig-badge rig-badge--green">Rig Active</span>
            </div>
            <div class="rig-summary-note ${hasAuthored ? '' : 'rig-summary-note--warn'}">
                ${hasAuthored
                    ? 'Authored control rig detected — full controller workflow available.'
                    : 'No authored control shapes found. Showing skeleton-based rig view.'}
            </div>
            <div class="rig-stat-row">
                ${[
                    ['Bones',    p.totalBones],
                    ['Ctrls',   p.controllerCount],
                    ['IK',      p.ikControls.length],
                    ['Deform',  p.deformCount],
                    ['Chains',  Object.keys(p.chains||{}).length]
                ].map(([l,v]) => `<div class="rig-stat"><strong>${v}</strong><span>${l}</span></div>`).join('')}
            </div>
        </div>

        <!-- Chains chips -->
        <div class="rig-panel-label">Chains</div>
        <div class="rig-chains-wrap">
        ${Object.entries(p.chains || {})
            .sort((a,b) => b[1].length - a[1].length)
            .map(([name, ctrls]) => `
            <button class="rig-chain-chip" data-chain="${name}">
                <span>${this._humanize(name)}</span>
                <span class="rig-chain-count">${ctrls.length}</span>
            </button>`).join('') || '<span class="rig-muted">No chains detected.</span>'}
        </div>

        <div class="rig-hand-tools">
            <div class="rig-hand-tools-head">
                <span>Hand Controls</span>
                <button class="rig-hand-create" type="button">${handRig ? 'Rebuild' : 'Auto Create'}</button>
            </div>
            ${handRows || '<p class="rig-hand-empty">Auto-detect fingers and create Fist_CTRL drivers.</p>'}
        </div>`;

        /* Chain chip clicks */
        this.summaryEl.querySelectorAll('.rig-chain-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const ctrls   = p.chains?.[btn.dataset.chain] || [];
                const primary = ctrls.find(c => c.isControl) || ctrls[0];
                if (primary) this.rigManager?.selectRigControl?.(p.objectUuid, primary.uuid);
            });
        });

        this.summaryEl.querySelector('.rig-hand-create')?.addEventListener('click', () => {
            const result = this.rigManager?.createHandRig?.(this.activeObject);
            if (!result) {
                this._setWorkflowStatus('No left/right finger chains found. Check bone names or rig the hand manually.');
                return;
            }
            this.activeProfile = this.rigManager?.getRigProfile?.(this.activeObject) || this.activeProfile;
            this.refresh();
            this._setWorkflowStatus('Hand controls ready. Select Fist_CTRL or use the Fist sliders.');
        });

        this.summaryEl.querySelectorAll('.rig-hand-fist').forEach(slider => {
            slider.addEventListener('input', () => {
                const side = slider.dataset.handFist;
                this.rigManager?.setHandPose?.(this.activeObject, side, { fist: Number(slider.value) });
                const label = slider.closest('.rig-hand-row')?.querySelector('.rig-muted');
                if (label) label.textContent = `Fist ${(Number(slider.value) * 100).toFixed(0)}%`;
            });
        });

        this.summaryEl.querySelectorAll('.rig-hand-axis').forEach(select => {
            select.addEventListener('change', () => {
                this.rigManager?.setHandCurlAxis?.(this.activeObject, select.dataset.handAxis, select.value);
            });
        });

        this.summaryEl.querySelectorAll('.rig-hand-key').forEach(button => {
            button.addEventListener('click', () => {
                if (typeof addKeyframe === 'function') addKeyframe();
                this.rigManager?.recordPoseKey?.(this.activeObject, Number(window.currentTime) || 0);
                this._setWorkflowStatus(`${button.dataset.handKey === 'left' ? 'Left' : 'Right'} hand pose keyed.`);
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════
       HIERARCHY TREE  (Blender / UE5 outliner style)
    ═══════════════════════════════════════════════════════════ */

    _renderHierarchyTree() {
        if (!this.hierarchyEl || !this.activeProfile) return;

        const profile   = this.activeProfile;
        const search    = this.hierarchySearch;
        const selectedUuid = this.selectedBone?.uuid || window.selectedBone?.uuid || null;

        /* Build uuid→control map */
        const ctrlMap = new Map(profile.controls.map(c => [c.uuid, c]));

        /* Find roots (no parentUuid or parentUuid not in this profile) */
        const profileUuids = new Set(profile.controls.map(c => c.uuid));
        const roots = profile.controls.filter(c => !c.parentUuid || !profileUuids.has(c.parentUuid));

        const filtered = search
            ? new Set(profile.controls.filter(c => c.name.toLowerCase().includes(search)).map(c => c.uuid))
            : null;

        /* Recursive render */
        const renderNode = (ctrl, depth = 0) => {
            const isSelected  = ctrl.uuid === selectedUuid;
            const hasChildren = ctrl.childUuids.length > 0;
            const isCollapsed = this.collapsedNodes.has(ctrl.uuid);
            const visible     = !filtered || filtered.has(ctrl.uuid)
                || ctrl.childUuids.some(id => filtered.has(id));
            if (!visible) return '';

            const indent  = depth * 16;
            const roleTag = this._roleTag(ctrl);
            const nameMatch = search && ctrl.name.toLowerCase().includes(search);

            let html = `
            <div class="rig-tree-node ${isSelected ? 'is-selected' : ''} ${nameMatch ? 'is-matched' : ''}"
                 data-uuid="${ctrl.uuid}"
                 style="padding-left:${8 + indent}px">
                <span class="rig-tree-toggle ${hasChildren ? '' : 'rig-tree-leaf'}"
                      data-toggle="${ctrl.uuid}">
                    ${hasChildren ? (isCollapsed ? '▶' : '▼') : '•'}
                </span>
                <span class="rig-tree-icon" style="color:${this._ctrlColor(ctrl)}">
                    ${this._roleIcon(ctrl.role)}
                </span>
                <span class="rig-tree-name">${nameMatch && search
                    ? ctrl.name.replace(new RegExp(`(${search})`, 'gi'), '<mark>$1</mark>')
                    : ctrl.name}
                </span>
                ${roleTag}
                ${ctrl.isIK ? '<span class="rig-tag rig-tag--ik">IK</span>' : ''}
            </div>`;

            if (hasChildren && !isCollapsed) {
                ctrl.childUuids.forEach(id => {
                    const child = ctrlMap.get(id);
                    if (child) html += renderNode(child, depth + 1);
                });
            }
            return html;
        };

        this.hierarchyEl.innerHTML = roots.map(r => renderNode(r)).join('') ||
            '<div class="rig-muted" style="padding:12px">No bones match search.</div>';

        /* Collapse toggles */
        this.hierarchyEl.querySelectorAll('[data-toggle]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const uuid = btn.dataset.toggle;
                if (this.collapsedNodes.has(uuid)) this.collapsedNodes.delete(uuid);
                else this.collapsedNodes.add(uuid);
                this._renderHierarchyTree();
            });
        });

        /* Row selection */
        this.hierarchyEl.querySelectorAll('.rig-tree-node').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.dataset.toggle) return;
                this.rigManager?.selectRigControl?.(profile.objectUuid, row.dataset.uuid);
            });
            /* Right-click context menu */
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showBoneContextMenu(e, row.dataset.uuid);
            });
        });
    }

    _roleIcon(role) {
        const icons = {
            'root':     '◆', 'control':  '○', 'ik':       '↯',
            'ik-target':'⊕', 'pole':     '⊗', 'limb-end': '●',
            'finger':   '·', 'spine':    '|', 'head':     '⊙',
            'arm':      '—', 'leg':      '|', 'deform':   '○'
        };
        return icons[role] || '○';
    }

    _roleTag(ctrl) {
        if (ctrl.isControl) return `<span class="rig-tag rig-tag--ctrl">CTRL</span>`;
        if (ctrl.deform)    return `<span class="rig-tag rig-tag--def">DEF</span>`;
        return '';
    }

    _ctrlColor(ctrl) {
        if (ctrl.role === 'root')    return '#ffcc44';
        if (ctrl.isControl)          return '#44ccff';
        if (ctrl.isIK)               return '#aa55dd';
        if (ctrl.symmetry === 'left') return '#6699dd';
        if (ctrl.symmetry === 'right')return '#dd6666';
        return '#aaaaaa';
    }

    /* ── Bone context menu ── */
    _showBoneContextMenu(e, uuid) {
        document.querySelector('.rig-context-menu')?.remove();

        const menu = document.createElement('div');
        menu.className = 'rig-context-menu';
        menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;`;
        menu.innerHTML = `
            <div class="rig-ctx-item" data-action="select">Select</div>
            <div class="rig-ctx-item" data-action="selectChain">Select Chain</div>
            <div class="rig-ctx-item" data-action="mirror">Select Mirror</div>
            <div class="rig-ctx-sep"></div>
            <div class="rig-ctx-item" data-action="rename">Rename (F2)</div>
            <div class="rig-ctx-item" data-action="addChild">Add Child Bone</div>
            <div class="rig-ctx-sep"></div>
            <div class="rig-ctx-item" data-action="hide">Toggle Visibility</div>
            <div class="rig-ctx-item" data-action="addConstraint">Add Constraint…</div>`;

        document.body.appendChild(menu);

        const close = () => menu.remove();
        setTimeout(() => document.addEventListener('pointerdown', close, { once: true }), 0);

        menu.querySelectorAll('.rig-ctx-item').forEach(item => {
            item.addEventListener('click', () => {
                const bone = this._getBoneByUuid(uuid);
                switch (item.dataset.action) {
                    case 'select':
                        this.rigManager?.selectRigControl?.(this.activeProfile.objectUuid, uuid); break;
                    case 'selectChain':
                        if (bone) this.rigManager?.selectBoneChain?.(bone); break;
                    case 'mirror':
                        if (bone) { this.rigManager?.requestBoneSelection?.(bone); this.rigManager?.mirrorSelection?.(); } break;
                    case 'rename':
                        if (bone) {
                            const name = prompt('Rename bone:', bone.name);
                            if (name) this.rigManager?.renameBone?.(bone, name);
                        } break;
                    case 'addChild':
                        if (bone) this.rigManager?.startAddingMode?.(bone); break;
                    case 'hide':
                        if (bone) { const v = this.rigManager?.boneVisuals?.get?.(bone);
                            if (v) v.body.visible = !v.body.visible; } break;
                    case 'addConstraint':
                        this._showAddConstraintDialog(bone); break;
                }
                close();
            });
        });
    }

    _getBoneByUuid(uuid) {
        for (const [bone] of this.rigManager.boneVisuals) {
            if (bone.uuid === uuid) return bone;
        }
        return null;
    }

    /* ═══════════════════════════════════════════════════════════
       CONTROLLER GRID
    ═══════════════════════════════════════════════════════════ */

    _renderControls() {
        if (!this.controlsEl || !this.activeProfile) return;

        const profile = this.activeProfile;
        const selectedUuid = this.selectedBone?.uuid || window.selectedBone?.uuid || null;

        /* Filter */
        let controls = [...profile.controls];
        switch (this.controlFilter) {
            case 'control': controls = controls.filter(c => c.isControl); break;
            case 'deform':  controls = controls.filter(c => c.deform && !c.isControl); break;
            case 'ik':      controls = controls.filter(c => c.isIK || c.role === 'ik-target' || c.role === 'pole'); break;
        }

        /* Sort */
        switch (this.sortMode) {
            case 'alpha':
                controls.sort((a,b) => a.name.localeCompare(b.name)); break;
            case 'role':
                controls.sort((a,b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)); break;
            default: /* hierarchy */
                controls.sort((a,b) => (a.depth - b.depth) || a.name.localeCompare(b.name));
        }

        if (!controls.length) {
            this.controlsEl.innerHTML = '<div class="rig-muted" style="padding:16px">No controls match the current filter.</div>';
            return;
        }

        /* Group by chain */
        const byChain = {};
        controls.forEach(c => { (byChain[c.chain] = byChain[c.chain] || []).push(c); });

        let html = '';
        Object.entries(byChain).forEach(([chain, list]) => {
            html += `<div class="rig-chain-group">
                <div class="rig-chain-group-header">
                    <span>${this._humanize(chain)}</span>
                    <span class="rig-muted">${list.length}</span>
                </div>
                <div class="rig-ctrl-grid">`;
            list.forEach(ctrl => {
                const isSelected = ctrl.uuid === selectedUuid;
                const accent = this._ctrlColor(ctrl);
                html += `
                <button class="rig-ctrl-card ${isSelected ? 'is-selected' : ''} ${ctrl.isControl ? 'is-ctrl' : ''}"
                        data-ctrl-uuid="${ctrl.uuid}" title="${ctrl.name}">
                    <span class="rig-ctrl-accent" style="background:${accent}"></span>
                    <span class="rig-ctrl-icon" style="color:${accent}">${this._roleIcon(ctrl.role)}</span>
                    <span class="rig-ctrl-name">${ctrl.name}</span>
                    <span class="rig-ctrl-tags">
                        ${ctrl.isControl ? '<span class="rig-tag rig-tag--ctrl">C</span>' : ''}
                        ${ctrl.isIK      ? '<span class="rig-tag rig-tag--ik">IK</span>' : ''}
                        ${ctrl.constraintCount ? `<span class="rig-tag rig-tag--con">${ctrl.constraintCount}</span>` : ''}
                    </span>
                </button>`;
            });
            html += '</div></div>';
        });

        this.controlsEl.innerHTML = html;
        this.controlsEl.querySelectorAll('.rig-ctrl-card').forEach(btn => {
            btn.addEventListener('click', () => {
                this.rigManager?.selectRigControl?.(profile.objectUuid, btn.dataset.ctrlUuid);
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════
       INSPECTOR  (right panel)
    ═══════════════════════════════════════════════════════════ */

    _renderInspector() {
        if (!this.selectionDetailsEl) return;

        const bone    = this.selectedBone || window.selectedBone || null;
        const profile = this.activeProfile;

        if (!bone || !profile) {
            this.selectionDetailsEl.innerHTML = `
                <div class="rig-inspector-empty">
                    <p>Select a bone or controller to inspect its properties.</p>
                </div>`;
            if (this.selectionStatusEl) this.selectionStatusEl.innerHTML = `<strong>Active</strong> None`;
            return;
        }

        const ctrl = profile.controls.find(c => c.uuid === bone.uuid);
        if (!ctrl) {
            this.selectionDetailsEl.innerHTML = `<div class="rig-muted" style="padding:16px">Selection outside active rig.</div>`;
            return;
        }

        if (this.selectionStatusEl) this.selectionStatusEl.innerHTML = `<strong>Active</strong> ${ctrl.name}`;

        const constraints = this.rigManager?.getConstraints?.(bone) || [];
        const disabled    = this.currentMode === 'object' ? 'disabled' : '';
        const pos   = bone.position;
        const rot   = bone.rotation;        // Euler radians
        const scale = bone.scale;
        const toDeg = r => (r * 180 / Math.PI).toFixed(2);
        const fmt   = v => v.toFixed(4);

        /* IK chain info */
        const ikBlend     = this.rigManager?.getIKBlend?.(ctrl.chain) ?? 0;
        const hasIKInChain = (profile.chains?.[ctrl.chain] || []).some(c => c.isIK);

        this.selectionDetailsEl.innerHTML = `
        <!-- ─ Header ─ -->
        <div class="rig-insp-header">
            <div>
                <div class="rig-insp-name">${ctrl.name}</div>
                <div class="rig-insp-meta">${this._humanize(ctrl.role)}  ·  ${this._humanize(ctrl.chain)}  ·  Depth ${ctrl.depth}</div>
            </div>
            <span class="rig-badge ${ctrl.isControl ? 'rig-badge--blue' : 'rig-badge--gray'}">
                ${ctrl.isControl ? 'Controller' : 'Bone'}
            </span>
        </div>

        <!-- ─ Transform ─ -->
        <div class="rig-insp-section">
            <div class="rig-insp-section-title">
                <span>Transform</span>
                <button class="rig-icon-btn rig-reset-transform" title="Reset to rest pose">↺</button>
            </div>
            <div class="rig-transform-grid">
                <label>Location</label>
                <div class="rig-xyz-row">
                    <label class="rig-axis x">X</label>
                    <input class="rig-transform-input" data-axis="px" type="number" step="0.01" value="${fmt(pos.x)}" ${disabled}>
                    <label class="rig-axis y">Y</label>
                    <input class="rig-transform-input" data-axis="py" type="number" step="0.01" value="${fmt(pos.y)}" ${disabled}>
                    <label class="rig-axis z">Z</label>
                    <input class="rig-transform-input" data-axis="pz" type="number" step="0.01" value="${fmt(pos.z)}" ${disabled}>
                </div>

                <label>Rotation</label>
                <div class="rig-xyz-row">
                    <label class="rig-axis x">X</label>
                    <input class="rig-transform-input" data-axis="rx" type="number" step="0.1" value="${toDeg(rot.x)}" ${disabled}>
                    <label class="rig-axis y">Y</label>
                    <input class="rig-transform-input" data-axis="ry" type="number" step="0.1" value="${toDeg(rot.y)}" ${disabled}>
                    <label class="rig-axis z">Z</label>
                    <input class="rig-transform-input" data-axis="rz" type="number" step="0.1" value="${toDeg(rot.z)}" ${disabled}>
                </div>

                <label>Scale</label>
                <div class="rig-xyz-row">
                    <label class="rig-axis x">X</label>
                    <input class="rig-transform-input" data-axis="sx" type="number" step="0.01" value="${fmt(scale.x)}" ${disabled}>
                    <label class="rig-axis y">Y</label>
                    <input class="rig-transform-input" data-axis="sy" type="number" step="0.01" value="${fmt(scale.y)}" ${disabled}>
                    <label class="rig-axis z">Z</label>
                    <input class="rig-transform-input" data-axis="sz" type="number" step="0.01" value="${fmt(scale.z)}" ${disabled}>
                </div>
            </div>
        </div>

        <!-- ─ IK / FK Blend ─ -->
        ${hasIKInChain ? `
        <div class="rig-insp-section">
            <div class="rig-insp-section-title">IK / FK Blend</div>
            <div class="rig-blend-row">
                <span class="rig-muted">FK</span>
                <input type="range" min="0" max="1" step="0.01"
                       value="${ikBlend}"
                       class="rig-blend-slider"
                       data-chain="${ctrl.chain}">
                <span class="rig-muted">IK</span>
                <span class="rig-blend-val">${(ikBlend * 100).toFixed(0)}%</span>
            </div>
        </div>` : ''}

        <!-- ─ Bone Properties ─ -->
        <div class="rig-insp-section">
            <div class="rig-insp-section-title">Bone Properties</div>
            <div class="rig-prop-grid">
                <span>Symmetry</span><strong>${this._humanize(ctrl.symmetry)}</strong>
                <span>Deform</span><strong>${ctrl.deform ? 'Yes' : 'No'}</strong>
                <span>Controller</span><strong>${ctrl.isControl ? 'Yes' : 'No'}</strong>
                <span>IK Bone</span><strong>${ctrl.isIK ? 'Yes' : 'No'}</strong>
                <span>IK Target</span><strong>${ctrl.isIKTarget ? 'Yes' : 'No'}</strong>
                <span>Layer</span><strong>${this.rigManager?.boneLayers?.[ctrl.layer ?? 0]?.name || 'Default'}</strong>
            </div>
        </div>

        <!-- ─ Constraints ─ -->
        <div class="rig-insp-section">
            <div class="rig-insp-section-title">
                <span>Bone Constraints</span>
                <button class="rig-icon-btn rig-add-constraint" data-uuid="${ctrl.uuid}" title="Add constraint">＋</button>
            </div>
            <div class="rig-constraint-list" id="rig-constraint-list-${ctrl.uuid}">
                ${constraints.length ? constraints.map((con, i) => `
                <div class="rig-constraint-item ${con.enabled ? '' : 'is-disabled'}">
                    <span class="rig-constraint-type">${this._humanize(con.type)}</span>
                    <span class="rig-constraint-influence">${(con.influence * 100).toFixed(0)}%</span>
                    <label class="rig-toggle-mini">
                        <input type="checkbox" ${con.enabled ? 'checked' : ''}
                               data-con-idx="${i}" data-con-uuid="${ctrl.uuid}">
                        <span></span>
                    </label>
                    <button class="rig-icon-btn rig-del-constraint"
                            data-con-idx="${i}" data-con-uuid="${ctrl.uuid}">✕</button>
                </div>`).join('')
                : '<div class="rig-muted" style="padding:8px 0">No constraints.</div>'}
            </div>
        </div>

        <!-- ─ Actions ─ -->
        <div class="rig-insp-actions">
            <button class="rig-btn" id="rig-select-parent-btn">↑ Parent</button>
            <button class="rig-btn" id="rig-mirror-sel-btn">⇄ Mirror</button>
            <button class="rig-btn rig-btn--accent" id="rig-key-bone-btn">◆ Key</button>
        </div>`;

        /* ── Wire transform inputs ── */
        this.selectionDetailsEl.querySelectorAll('.rig-transform-input').forEach(inp => {
            inp.addEventListener('change', () => this._applyTransformField(bone, inp));
        });

        /* Reset transform */
        this.selectionDetailsEl.querySelector('.rig-reset-transform')?.addEventListener('click', () => {
            this.rigManager?.applyRestPose?.(1);
            this._renderInspector();
        });

        /* IK blend slider */
        this.selectionDetailsEl.querySelector('.rig-blend-slider')?.addEventListener('input', (e) => {
            const chain = e.target.dataset.chain;
            const val   = parseFloat(e.target.value);
            this.rigManager?.setIKBlend?.(chain, val);
            const label = e.target.closest('.rig-blend-row')?.querySelector('.rig-blend-val');
            if (label) label.textContent = (val * 100).toFixed(0) + '%';
        });

        /* Add constraint */
        this.selectionDetailsEl.querySelector('.rig-add-constraint')?.addEventListener('click', () => {
            this._showAddConstraintDialog(bone);
        });

        /* Remove constraint */
        this.selectionDetailsEl.querySelectorAll('.rig-del-constraint').forEach(btn => {
            btn.addEventListener('click', () => {
                this.rigManager?.removeConstraint?.(bone, parseInt(btn.dataset.conIdx));
                this._renderInspector();
            });
        });

        /* Toggle constraint */
        this.selectionDetailsEl.querySelectorAll('[data-con-idx]').forEach(chk => {
            if (chk.type !== 'checkbox') return;
            chk.addEventListener('change', () => {
                const list = this.rigManager?.getConstraints?.(bone) || [];
                if (list[chk.dataset.conIdx]) list[chk.dataset.conIdx].enabled = chk.checked;
                this._renderInspector();
            });
        });

        /* Action buttons */
        this.selectionDetailsEl.querySelector('#rig-select-parent-btn')?.addEventListener('click', () => {
            if (ctrl.parentUuid) this.rigManager?.selectRigControl?.(profile.objectUuid, ctrl.parentUuid);
        });
        this.selectionDetailsEl.querySelector('#rig-mirror-sel-btn')?.addEventListener('click', () => {
            this.rigManager?.mirrorSelection?.();
        });
        this.selectionDetailsEl.querySelector('#rig-key-bone-btn')?.addEventListener('click', () => {
            if (typeof addKeyframe === 'function') addKeyframe();
            this.rigManager?.recordPoseKey?.(this.activeObject, Number(window.currentTime) || 0);
        });
    }

    /* Apply a changed transform field back to the live bone */
    _applyTransformField(bone, input) {
        const val = parseFloat(input.value);
        if (isNaN(val)) return;
        const toRad = d => d * Math.PI / 180;
        switch (input.dataset.axis) {
            case 'px': bone.position.x = val; break;
            case 'py': bone.position.y = val; break;
            case 'pz': bone.position.z = val; break;
            case 'rx': bone.rotation.x = toRad(val); break;
            case 'ry': bone.rotation.y = toRad(val); break;
            case 'rz': bone.rotation.z = toRad(val); break;
            case 'sx': bone.scale.x = val; break;
            case 'sy': bone.scale.y = val; break;
            case 'sz': bone.scale.z = val; break;
        }
        if (typeof updateKeyframesUI === 'function') updateKeyframesUI();
    }

    /* ═══════════════════════════════════════════════════════════
       ADD CONSTRAINT DIALOG
    ═══════════════════════════════════════════════════════════ */

    _showAddConstraintDialog(bone) {
        if (!bone) return;
        document.querySelector('.rig-dialog')?.remove();

        const targetOptions = (this.activeProfile?.controls || [])
            .filter((ctrl) => ctrl.uuid !== bone.uuid)
            .map((ctrl) => `<option value="${ctrl.uuid}">${ctrl.name}</option>`)
            .join('');

        const dialog = document.createElement('div');
        dialog.className = 'rig-dialog';
        dialog.innerHTML = `
            <div class="rig-dialog-box">
                <div class="rig-dialog-title">Add Bone Constraint</div>
                <select class="rig-dialog-select" id="rig-con-type">
                    <option value="copy_location">Copy Location</option>
                    <option value="copy_rotation">Copy Rotation</option>
                    <option value="copy_transforms">Copy Transforms</option>
                    <option value="look_at">Look At</option>
                    <option value="limit_rotation">Limit Rotation</option>
                    <option value="limit_location">Limit Location</option>
                    <option value="ik">Inverse Kinematics</option>
                    <option value="stretch_to">Stretch To</option>
                </select>
                <label class="rig-dialog-field">Target
                    <select class="rig-dialog-select" id="rig-con-target">
                        <option value="">No target (limit constraint)</option>
                        ${targetOptions}
                    </select>
                </label>
                <label class="rig-dialog-field">IK chain length
                    <input class="rig-dialog-select" id="rig-con-chain-length" type="number" min="2" max="8" value="2">
                </label>
                <div class="rig-dialog-actions">
                    <button id="rig-con-cancel" class="rig-btn">Cancel</button>
                    <button id="rig-con-ok"     class="rig-btn rig-btn--accent">Add</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);

        dialog.querySelector('#rig-con-cancel').onclick = () => dialog.remove();
        dialog.querySelector('#rig-con-ok').onclick = () => {
            const type = dialog.querySelector('#rig-con-type').value;
            const targetUuid = dialog.querySelector('#rig-con-target')?.value || null;
            const target = targetUuid ? this._getBoneByUuid(targetUuid) : null;
            const chainLength = Math.max(2, Number(dialog.querySelector('#rig-con-chain-length')?.value) || 2);
            this.rigManager?.addConstraint?.(bone, type, { influence: 1, target, targetUuid, chainLength });
            dialog.remove();
            this._renderInspector();
        };
    }

    /* ═══════════════════════════════════════════════════════════
       POSE LIBRARY
    ═══════════════════════════════════════════════════════════ */

    _renderPoseLibrary() {
        let el = this.panel.querySelector('#rig-pose-library');
        if (!el) {
            el = document.createElement('div');
            el.id = 'rig-pose-library';
            el.className = 'rig-pose-library';
            this.selectionDetailsEl?.parentNode?.insertBefore(el, this.selectionDetailsEl);
        }

        const names = this.rigManager?.getPoseNames?.() || [];
        el.innerHTML = `
        <div class="rig-insp-section">
            <div class="rig-insp-section-title">
                <span>Pose Library</span>
                <button class="rig-icon-btn" id="rig-save-pose-btn" title="Save current pose">＋</button>
            </div>
            ${names.length ? `<div class="rig-pose-grid">
                ${names.map(n => `
                <div class="rig-pose-card">
                    <span class="rig-pose-name">${n}</span>
                    <div class="rig-pose-actions">
                        <button class="rig-icon-btn" data-pose-apply="${n}" title="Apply">▶</button>
                        <button class="rig-icon-btn" data-pose-del="${n}"   title="Delete">✕</button>
                    </div>
                </div>`).join('')}
            </div>` : '<div class="rig-muted" style="padding:8px 0">No saved poses.</div>'}
            <button class="rig-btn" id="rig-reset-pose-btn" style="width:100%;margin-top:8px">↺ Reset to Rest</button>
        </div>`;

        el.querySelector('#rig-save-pose-btn')?.addEventListener('click', () => {
            const name = prompt('Pose name:', `Pose_${Date.now().toString(36)}`);
            if (name) { this.rigManager?.savePose?.(name); this._renderPoseLibrary(); }
        });

        el.querySelector('#rig-reset-pose-btn')?.addEventListener('click', () => {
            this.rigManager?.applyRestPose?.(1);
        });

        el.querySelectorAll('[data-pose-apply]').forEach(btn => {
            btn.addEventListener('click', () => this.rigManager?.applyPose?.(btn.dataset.poseApply));
        });

        el.querySelectorAll('[data-pose-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.rigManager?.deletePose?.(btn.dataset.poseDel);
                this._renderPoseLibrary();
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════
       RESIZERS
    ═══════════════════════════════════════════════════════════ */

    _setupResizers() {
        if (!this.editorBodyEl || this.panel.dataset.rigResizeBound === 'true') return;

        const startResize = (side, e) => {
            e.preventDefault();
            const startX   = e.clientX;
            const varName  = side === 'left' ? '--rig-left-w' : side === 'hierarchy' ? '--rig-hier-w' : '--rig-right-w';
            const fallback = side === 'left' ? 240 : side === 'hierarchy' ? 220 : 300;
            const startW   = parseFloat(getComputedStyle(this.panel).getPropertyValue(varName)) || fallback;

            const move = (me) => {
                const delta = me.clientX - startX;
                const sign  = (side === 'right') ? -1 : 1;
                const next  = Math.min(460, Math.max(180, startW + sign * delta));
                this.panel.style.setProperty(varName, `${next}px`);
            };
            document.body.classList.add('rig-resizing');
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', () => {
                window.removeEventListener('pointermove', move);
                document.body.classList.remove('rig-resizing');
            }, { once: true });
        };

        this.panel.querySelectorAll('[data-rig-resize]').forEach(handle => {
            handle.addEventListener('pointerdown', e => startResize(handle.dataset.rigResize, e));
        });
        this.panel.dataset.rigResizeBound = 'true';
    }

    /* ═══════════════════════════════════════════════════════════
       UTILITY
    ═══════════════════════════════════════════════════════════ */

    _humanize(val) {
        return String(val || '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, m => m.toUpperCase());
    }
}
