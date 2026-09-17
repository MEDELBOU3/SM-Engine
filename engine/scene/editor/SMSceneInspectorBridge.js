(function () {
    'use strict';

    class SMSceneInspectorBridge {
        constructor(manager) {
            this.manager = manager;
            this.selected = null;
            this._bound = false;
            this._legacyUpdateInspector = null;
        }

        initialize() {
            if (this._bound) return this;
            this._bound = true;
            this._installUpdateHook();
            this._bindEvents();
            this.ensureLayout();
            this.refresh();
            return this;
        }

        refresh(object = window.selectedObject || null) {
            this.ensureLayout();
            this.selected = object?.isObject3D ? object : null;
            const entity = this.selected ? this.manager.ensureEntity(this.selected) : null;
            const card = document.getElementById('sm-entity-card');
            const componentsHost = document.getElementById('sm-entity-components');
            const addButton = document.getElementById('sm-add-component-btn');

            if (!entity) {
                if (card) card.classList.add('sm-no-entity');
                this._setValue('objectNameInput', 'No Selection');
                this._setText('sm-entity-id', 'No Selection');
                if (componentsHost) componentsHost.innerHTML = '<div class="sm-component-empty">Select an object to view details.</div>';
                if (addButton) addButton.disabled = true;
                this._syncLegacyCards(null);
                return;
            }

            card?.classList.remove('sm-no-entity');
            this._setValue('objectNameInput', entity.name);
            this._setChecked('objectActiveCheck', entity.active);
            this._setChecked('objectVisibleCheck', entity.visible);
            this._setChecked('objectStaticCheck', this.selected.userData?.static === true);
            this._setValue('objectTagInput', entity.tags ? entity.tags.join(', ') : '');
            this._setValue('objectLayerInput', entity.layer || 'Default');
            this._setValue('objectCategoryInput', entity.category || 'World');
            this._setText('sm-entity-id', entity.id || 'Entity');
            this._setText('sm-world-transform-summary', this._worldTransformText(entity));
            if (addButton) addButton.disabled = false;
            
            this._syncLegacyCards(this.selected);
            this._renderComponents(entity, componentsHost);
        }

        ensureLayout() {
            const main = document.getElementById('inspector-main-content');
            if (!main) return false;

            // Make headers collapsible like UE5
            this._bindCollapsibleHeaders();

            // Bind slider and color listeners
            this._bindMaterialSync();

            // Filter box listener
            const filterInput = document.getElementById('ue5DetailsFilter');
            if (filterInput && filterInput.dataset.bound !== '1') {
                filterInput.dataset.bound = '1';
                filterInput.addEventListener('input', (e) => this._filterSections(e.target.value));
            }

            // Expand / Collapse All buttons
            document.getElementById('ue5ExpandAllBtn')?.addEventListener('click', () => {
                document.querySelectorAll('.inspector-card').forEach(c => c.classList.remove('collapsed'));
            });
            document.getElementById('ue5CollapseAllBtn')?.addEventListener('click', () => {
                document.querySelectorAll('.inspector-card').forEach(c => c.classList.add('collapsed'));
            });

            this._bindLayoutEvents();
            return true;
        }

        _bindCollapsibleHeaders() {
            document.querySelectorAll('.inspector-card-header').forEach((header) => {
                if (header.dataset.foldBound === '1') return;
                header.dataset.foldBound = '1';
                header.addEventListener('click', (e) => {
                    if (e.target.closest('.sm-remove-component')) return;
                    const card = header.closest('.inspector-card');
                    if (card) card.classList.toggle('collapsed');
                });
            });
        }

        _bindMaterialSync() {
            const roughness = document.getElementById('matRoughnessInput');
            const roughnessVal = document.getElementById('matRoughnessVal');
            if (roughness && roughnessVal && roughness.dataset.syncBound !== '1') {
                roughness.dataset.syncBound = '1';
                roughness.addEventListener('input', (e) => {
                    roughnessVal.textContent = parseFloat(e.target.value).toFixed(2);
                });
            }

            const metallic = document.getElementById('matMetallicInput');
            const metallicVal = document.getElementById('matMetallicVal');
            if (metallic && metallicVal && metallic.dataset.syncBound !== '1') {
                metallic.dataset.syncBound = '1';
                metallic.addEventListener('input', (e) => {
                    metallicVal.textContent = parseFloat(e.target.value).toFixed(2);
                });
            }

            const color = document.getElementById('matColorInput');
            const hexDisplay = document.getElementById('matColorHexDisplay');
            if (color && hexDisplay && color.dataset.syncBound !== '1') {
                color.dataset.syncBound = '1';
                color.addEventListener('input', (e) => {
                    hexDisplay.textContent = e.target.value.toUpperCase();
                });
            }
        }

        _filterSections(query) {
            const q = String(query).trim().toLowerCase();
            document.querySelectorAll('#inspector-main-content .inspector-card').forEach((card) => {
                const text = card.textContent.toLowerCase();
                card.style.display = !q || text.includes(q) ? 'flex' : 'none';
            });
        }

        _renderComponents(entity, host) {
            if (!host) return;
            const descriptors = window.SMWorldSceneSerializer?._componentDescriptors?.(entity.object) || [];
            const cards = descriptors.filter((component) => component.type !== 'Transform' && component.type !== 'MeshRenderer' && component.type !== 'Physics');
            
            if (!cards.length) {
                host.innerHTML = '';
                return;
            }
            host.innerHTML = cards.map((descriptor, index) => this._componentCard(descriptor, index)).join('');
            this._bindCollapsibleHeaders();
        }

        _componentCard(descriptor, index) {
            const runtime = descriptor.storage === 'runtime';
            const values = Object.entries(descriptor)
                .filter(([key, value]) => !['storage', 'metadata', 'tags', 'id', 'type'].includes(key) && ['string', 'number', 'boolean'].includes(typeof value))
                .slice(0, 8)
                .map(([key, value]) => this._componentField(descriptor.type, key, value))
                .join('');
            return `
                <div class="inspector-card sm-component-card" data-component-type="${this._escape(descriptor.type)}" data-component-index="${index}">
                    <div class="inspector-card-header">
                        <i class="fas fa-caret-down ue5-fold-icon"></i>
                        <i class="fas ${this._componentIcon(descriptor.type)} header-type-icon"></i>
                        <span class="header-title">${this._escape(this._displayType(descriptor.type))}</span>
                        <small class="header-badge">${this._escape(descriptor.storage || 'component')}</small>
                        ${runtime ? '<button class="sm-remove-component" type="button" title="Remove component"><i class="fas fa-xmark"></i></button>' : ''}
                    </div>
                    <div class="inspector-card-body">${values || `<div class="sm-component-summary">${this._componentSummary(descriptor)}</div>`}</div>
                </div>`;
        }

        _componentField(type, key, value) {
            if (typeof value === 'boolean') {
                return `<div class="inspector-field-row sm-component-property"><span class="field-label">${this._escape(this._displayType(key))}</span><input data-component-edit="${this._escape(type)}" data-component-key="${this._escape(key)}" type="checkbox" ${value ? 'checked' : ''}></div>`;
            }
            const inputType = typeof value === 'number' ? 'number' : 'text';
            const step = typeof value === 'number' ? ' step="0.01"' : '';
            return `<div class="inspector-field-row sm-component-property"><span class="field-label">${this._escape(this._displayType(key))}</span><input class="field-number-input" data-component-edit="${this._escape(type)}" data-component-key="${this._escape(key)}" type="${inputType}"${step} value="${this._escape(value)}"></div>`;
        }

        _componentSummary(component) {
            if (component.type === 'Camera') return `${component.projection || 'perspective'} · near ${component.near ?? '-'} · far ${component.far ?? '-'}`;
            if (component.type === 'Light') return `${component.lightType || 'Light'} · intensity ${component.intensity ?? 1}`;
            if (component.type === 'Script') return component.className || component.assetId || 'Object script';
            if (component.type === 'Animator') return `${component.clips?.length || 0} animation clip(s)`;
            return component.serializer || component.id || 'Managed component';
        }

        _syncLegacyCards(object) {
            const material = document.getElementById('materialContainer');
            const physics = document.getElementById('physicsContainer');
            if (material) material.style.display = object?.isMesh ? 'flex' : 'none';
            const hasPhysics = Boolean(object && (object.userData?.physics || object.userData?.colliderAuthoring || object.getComponent?.('SMRigidBodyComponent') || object.getComponent?.('SMColliderComponent')));
            if (physics) physics.style.display = hasPhysics ? 'flex' : 'none';
        }

        _bindLayoutEvents() {
            const card = document.getElementById('sm-entity-card');
            if (card && card.dataset.smBound !== '1') {
                card.dataset.smBound = '1';
                card.addEventListener('change', (event) => this._handleIdentityChange(event));
            }
            const add = document.getElementById('sm-add-component-btn');
            if (add && add.dataset.smBound !== '1') {
                add.dataset.smBound = '1';
                add.addEventListener('click', () => this._toggleComponentPicker());
            }
            const search = document.getElementById('sm-component-search');
            if (search && search.dataset.smBound !== '1') {
                search.dataset.smBound = '1';
                search.addEventListener('input', () => this._renderComponentOptions(search.value));
            }
            const host = document.getElementById('sm-entity-components');
            if (host && host.dataset.smBound !== '1') {
                host.dataset.smBound = '1';
                host.addEventListener('click', (event) => this._handleComponentClick(event));
                host.addEventListener('change', (event) => this._handleComponentEdit(event));
            }
        }

        _handleIdentityChange(event) {
            const entity = this.manager.getEntity(this.selected);
            if (!entity) return;
            const target = event.target;
            if (target.id === 'objectNameInput') this.manager.renameEntity(entity, target.value);
            if (target.id === 'objectActiveCheck') this.manager.setActive(entity, target.checked);
            if (target.id === 'objectVisibleCheck') this.manager.setVisible(entity, target.checked);
            if (target.id === 'objectStaticCheck') { entity.object.userData.static = target.checked; this.manager._changed('entityStaticChanged', { entity, static: target.checked }); }
            if (target.id === 'objectTagInput') this.manager.setTags(entity, target.value);
            if (target.id === 'objectLayerInput') this.manager.setLayer(entity, target.value);
            if (target.id === 'objectCategoryInput') this.manager.setCategory(entity, target.value);
            window.hierarchyManager?.renderAll?.();
        }

        _toggleComponentPicker() {
            const picker = document.getElementById('sm-component-picker');
            if (!picker || !this.selected) return;
            picker.hidden = !picker.hidden;
            if (!picker.hidden) {
                this._renderComponentOptions('');
                document.getElementById('sm-component-search')?.focus();
            }
        }

        _renderComponentOptions(search = '') {
            const host = document.getElementById('sm-component-options');
            if (!host) return;
            const query = String(search).trim().toLowerCase();
            const registered = window.SMComponentRegistry?.list?.() || [];
            const choices = [
                { type: '__script__', displayName: 'Script / Behaviour', category: 'Scripting', className: 'Script' },
                ...registered
            ].filter((item) => !query || `${item.displayName} ${item.category} ${item.type}`.toLowerCase().includes(query));
            
            host.innerHTML = choices.length ? choices.map((item) => `
                <button type="button" data-add-component="${this._escape(item.type)}">
                    <i class="fas ${this._componentIcon(item.type)}"></i>
                    <span><strong>${this._escape(item.displayName)}</strong></span>
                </button>
            `).join('') : '<div class="sm-component-empty">No matching component.</div>';
            
            host.querySelectorAll('[data-add-component]').forEach((button) => button.addEventListener('click', () => this._addComponent(button.dataset.addComponent)));
        }

        _addComponent(type) {
            if (!this.selected) return;
            if (type === '__script__') {
                document.getElementById('sm-component-picker').hidden = true;
                window.openCodeEditor?.();
                window.codeEditorManager?.loadScriptForObject?.(this.selected);
                return;
            }
            try {
                this.manager.addComponent(this.selected, type);
                document.getElementById('sm-component-picker').hidden = true;
                this.refresh(this.selected);
            } catch (error) {
                console.error('[SMSceneInspector] Add component failed.', error);
                window.showToast?.(error.message, 'error');
            }
        }

        _handleComponentClick(event) {
            const remove = event.target.closest('.sm-remove-component');
            if (!remove || !this.selected) return;
            const type = remove.closest('[data-component-type]')?.dataset.componentType;
            if (type && this.manager.removeComponent(this.selected, type)) this.refresh(this.selected);
        }

        _handleComponentEdit(event) {
            const input = event.target.closest('[data-component-edit]');
            if (!input || !this.selected) return;
            const component = this.selected.getComponent?.(input.dataset.componentEdit);
            if (!component) return;
            const key = input.dataset.componentKey;
            const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
            component[key] = value;
            this.selected.components?.saveToOwner?.();
            this.manager._changed('componentChanged', { entity: this.manager.getEntity(this.selected), component, property: key, value });
        }

        _installUpdateHook() {
            if (window.__smSceneInspectorUpdateHooked) return;
            const bridge = this;
            this._legacyUpdateInspector = window.updateInspector;
            window.updateInspector = function (...args) {
                const result = bridge._legacyUpdateInspector?.apply(this, args);
                bridge.refresh(window.selectedObject || null);
                return result;
            };
            window.__smSceneInspectorUpdateHooked = true;
        }

        _bindEvents() {
            ['sm:selection-changed', 'sm:selected-object-changed', 'objectSelected', 'selectionChanged'].forEach((name) => window.addEventListener(name, (event) => {
                const object = event.detail?.object || event.detail?.activeObject || window.selectedObject || null;
                this.refresh(object);
            }));
            ['entityCreated', 'entityDestroyed', 'componentAdded', 'componentRemoved', 'entityActiveChanged', 'entityVisibilityChanged'].forEach((name) => this.manager?.on?.(name, () => this.refresh()));
        }

        _worldTransformText(entity) {
            const transform = entity.getWorldTransform ? entity.getWorldTransform() : null;
            if (!transform) return 'World (0.00, 0.00, 0.00)';
            const p = transform.position.map((value) => Number(value).toFixed(2));
            return `World (${p.join(', ')})`;
        }
        _componentIcon(type) {
            const value = String(type || '').toLowerCase();
            if (value.includes('camera')) return 'fa-video';
            if (value.includes('light')) return 'fa-lightbulb';
            if (value.includes('physics') || value.includes('rigid') || value.includes('collider')) return 'fa-atom';
            if (value.includes('script') || value.includes('behaviour')) return 'fa-code';
            if (value.includes('anim')) return 'fa-person-running';
            if (value.includes('audio')) return 'fa-volume-high';
            if (value.includes('ai')) return 'fa-brain';
            return 'fa-puzzle-piece';
        }
        _displayType(value) { return String(value || '').replace(/^SM/, '').replace(/Component$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' '); }
        _escape(value) { const div = document.createElement('div'); div.textContent = String(value ?? ''); return div.innerHTML; }
        _setValue(id, value) { const element = document.getElementById(id); if (element && document.activeElement !== element) element.value = value ?? ''; }
        _setChecked(id, value) { const element = document.getElementById(id); if (element) element.checked = Boolean(value); }
        _setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value ?? ''; }
    }

    window.SMSceneInspectorBridge = SMSceneInspectorBridge;
    window.SMSceneInspectorBridgeClass = SMSceneInspectorBridge;
})();