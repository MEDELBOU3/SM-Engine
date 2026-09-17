(function () {
    'use strict';

    class SMSceneManager {
        constructor(scene, options = {}) {
            if (!scene?.isScene) throw new TypeError('SMSceneManager requires a THREE.Scene.');
            this.scene = scene;
            this.options = { includeEditorOnly: false, ...options };
            this.entities = new Map();
            this.objectToId = new WeakMap();
            this.byName = new Map();
            this.byTag = new Map();
            this.listeners = new Map();
            this.initialized = false;
            this.revision = 0;
            this.stats = { created: 0, destroyed: 0, componentAdds: 0, componentRemoves: 0 };
        }

        initialize() {
            if (this.initialized) return this;
            this.initialized = true;
            this.scanScene({ emit: false });
            this._installPublicAPI();
            this._bindSelectionEvents();
            this.emit('sceneReady', { manager: this, scene: this.scene });
            window.dispatchEvent(new CustomEvent('sm:scene-architecture-ready', { detail: { manager: this } }));
            return this;
        }

        shouldTrack(object) {
            if (!object?.isObject3D || object === this.scene) return false;
            const data = object.userData || {};
            if (this.options.includeEditorOnly) return true;
            if (object.isTransformControls || data.isTransformControlsChild) return false;
            if (data.isEditorHelper === true || data.isHelper === true || data.editorOnly === true) return false;
            if (object.isHelper === true) return false;
            const type = String(object.type || '');
            return !['TransformControls', 'TransformControlsGizmo', 'TransformControlsPlane'].includes(type);
        }

        ensureEntity(object, options = {}) {
            if (!this.shouldTrack(object) && options.force !== true) return null;
            const knownId = this.objectToId.get(object);
            if (knownId) return this.entities.get(knownId) || null;

            options = { ...this._inferEntityOptions(object), ...options };
            let requestedId = options.id || object.userData?.smEntity?.id || null;
            if (requestedId && this.entities.has(String(requestedId)) && this.entities.get(String(requestedId))?.object !== object) {
                requestedId = null;
            }
            const entity = window.SMEntity.ensure(object, this, { ...options, id: requestedId || undefined });
            this.entities.set(entity.id, entity);
            this.objectToId.set(object, entity.id);
            this._index(entity);
            this.stats.created += 1;
            this._changed('entityCreated', { entity, object }, options);
            return entity;
        }

        registerObject(object, options = {}) {
            const entity = this.ensureEntity(object, options);
            if (options.recursive !== false) {
                object?.children?.forEach((child) => this.registerObject(child, options));
            }
            return entity;
        }

        unregisterObject(objectOrEntity, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity) return false;
            if (options.recursive !== false) {
                [...entity.object.children].forEach((child) => this.unregisterObject(child, options));
            }
            this._unindex(entity);
            this.entities.delete(entity.id);
            this.objectToId.delete(entity.object);
            this._changed('entityUnregistered', { entity, object: entity.object }, options);
            return true;
        }

        scanScene(options = {}) {
            let registered = 0;
            this.scene.traverse((object) => {
                if (object === this.scene || !this.shouldTrack(object)) return;
                if (!this.getEntity(object)) {
                    this.ensureEntity(object, options);
                    registered += 1;
                }
            });
            this.emit('sceneScanned', { manager: this, registered, total: this.entities.size });
            return { registered, total: this.entities.size };
        }

        createEntity(options = {}) {
            const object = options.object || new THREE.Group();
            object.name = String(options.name || object.name || 'Entity');
            return this.addObject(object, options);
        }

        addObject(object, options = {}) {
            if (!object?.isObject3D) throw new TypeError('addObject() requires a THREE.Object3D.');
            const parentObject = this.resolveObject(options.parent) || this.scene;
            if (options.name) object.name = String(options.name);
            if (object.parent !== parentObject) parentObject.add(object);
            const entity = this.registerObject(object, { ...options, recursive: true });
            this._syncLegacyRoot(object);
            this._refreshEditor(options.select === true ? object : null);
            return entity;
        }

        destroyEntity(objectOrEntity, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity) return false;
            const object = entity.object;
            const descendants = [];
            object.traverse((child) => {
                const childEntity = this.getEntity(child);
                if (childEntity) descendants.push(childEntity);
            });
            const container = window.SMComponentContainer && object.components instanceof window.SMComponentContainer ? object.components : null;
            container?.destroy?.(options.reason || 'entity-destroyed');
            object.parent?.remove(object);
            descendants.reverse().forEach((item) => this.unregisterObject(item, { recursive: false, emit: false }));
            this._removeLegacyTree(object);
            if (options.dispose === true) this._disposeTree(object);
            if (window.selectedObject === object || object.getObjectByProperty?.('uuid', window.selectedObject?.uuid)) {
                window.selectObject?.(null);
            }
            this.stats.destroyed += 1;
            this._changed('entityDestroyed', { entity, object, reason: options.reason || 'user' }, options);
            this._refreshEditor();
            return true;
        }

        duplicateEntity(objectOrEntity, options = {}) {
            const source = this.resolveObject(objectOrEntity);
            if (!source) return null;
            const clone = this._cloneObjectSafely(source, options.recursive !== false);
            clone.name = String(options.name || `${source.name || 'Entity'}_Copy`);
            clone.traverse((child) => {
                child.userData = child.userData || {};
                if (child.userData.smEntity) child.userData.smEntity = { ...child.userData.smEntity, id: window.SMEntity.createId(), createdAt: Date.now(), updatedAt: Date.now() };
                delete child.userData.runtimeId;
                delete child.userData.scriptInstance;
            });
            const parent = this.resolveObject(options.parent) || source.parent || this.scene;
            const entity = this.addObject(clone, { parent, select: options.select !== false });
            this._changed('entityDuplicated', { source: this.getEntity(source), entity }, options);
            return entity;
        }

        renameEntity(objectOrEntity, name, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity) return false;
            const next = String(name || '').trim();
            if (!next || next === entity.object.name) return entity.object.name;
            const previous = entity.object.name;
            this._unindexName(entity, previous);
            entity.object.name = next;
            entity.touch();
            this._indexName(entity);
            this._changed('entityRenamed', { entity, previous, name: next }, options);
            this._refreshEditor();
            return next;
        }

        reparentEntity(objectOrEntity, parentOrEntity = null, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            const object = entity?.object;
            const parent = this.resolveObject(parentOrEntity) || this.scene;
            if (!object || parent === object || this._isDescendant(object, parent)) return false;
            const previousParent = object.parent;
            this.scene.updateMatrixWorld?.(true);
            if (options.preserveWorld !== false && parent.attach) parent.attach(object);
            else parent.add(object);
            object.updateMatrixWorld?.(true);
            this._syncLegacyRoot(object);
            this._changed('entityParentChanged', {
                entity,
                previousParent: this.getEntity(previousParent),
                parent: this.getEntity(parent)
            }, options);
            this._refreshEditor();
            return true;
        }

        setActive(objectOrEntity, active, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity) return false;
            const next = Boolean(active);
            if (entity.data.active === next) return next;
            entity.data.active = next;
            entity.touch();
            entity.object.dispatchEvent?.({ type: next ? 'sm:entity-enabled' : 'sm:entity-disabled', entity });
            this._changed('entityActiveChanged', { entity, active: next }, options);
            return next;
        }

        setVisible(objectOrEntity, visible, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity) return false;
            entity.object.visible = Boolean(visible);
            entity.touch();
            this._changed('entityVisibilityChanged', { entity, visible: entity.object.visible }, options);
            return entity.object.visible;
        }

        setTags(objectOrEntity, tags, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity) return [];
            this._unindexTags(entity);
            entity.data.tags = window.SMEntity.normalizeTags(tags);
            entity.object.userData.tags = entity.data.tags.slice();
            entity.touch();
            this._indexTags(entity);
            this._changed('entityTagsChanged', { entity, tags: entity.tags }, options);
            return entity.tags;
        }

        setLayer(objectOrEntity, layer, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity) return null;
            entity.data.layer = String(layer || 'Default');
            entity.touch();
            this._changed('entityLayerChanged', { entity, layer: entity.data.layer }, options);
            return entity.data.layer;
        }

        setCategory(objectOrEntity, category, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity) return null;
            entity.data.category = String(category || 'World');
            entity.touch();
            this._changed('entityCategoryChanged', { entity, category: entity.data.category }, options);
            return entity.data.category;
        }

        notifyEntityChanged(objectOrEntity, reason = 'entityChanged', detail = {}) {
            const entity = this.getEntity(objectOrEntity) || this.ensureEntity(this.resolveObject(objectOrEntity));
            if (!entity) return false;
            entity.touch();
            this._changed(reason, { entity, object: entity.object, ...detail });
            return true;
        }

        ensureComponentContainer(objectOrEntity) {
            const entity = this.getEntity(objectOrEntity);
            if (!entity || !window.SMComponentContainer) return null;
            let container = entity.object.components instanceof window.SMComponentContainer ? entity.object.components : null;
            if (!container) {
                container = new window.SMComponentContainer(entity.object, {
                    world: window.SMRuntime?.getWorld?.() || null,
                    session: window.SMRuntime?.getSession?.() || null
                });
                if (Array.isArray(entity.object.userData.components)) container.hydrate(entity.object.userData.components);
            }
            return container;
        }

        addComponent(objectOrEntity, componentOrType, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            const container = this.ensureComponentContainer(entity);
            if (!container) throw new Error('Component framework is unavailable.');
            const component = container.add(componentOrType, options);
            container.saveToOwner();
            this.stats.componentAdds += 1;
            this._changed('componentAdded', { entity, component }, options);
            this._refreshEditor(entity.object);
            return component;
        }

        removeComponent(objectOrEntity, componentOrType, options = {}) {
            const entity = this.getEntity(objectOrEntity);
            const container = entity ? this.ensureComponentContainer(entity) : null;
            const component = container?.get?.(componentOrType) || null;
            if (!component || !container.remove(component, { ...options, destroy: options.destroy !== false })) return false;
            container.saveToOwner();
            this.stats.componentRemoves += 1;
            this._changed('componentRemoved', { entity, component }, options);
            this._refreshEditor(entity.object);
            return true;
        }

        getEntity(value) {
            if (!value) return null;
            if (value instanceof window.SMEntity) return value;
            if (typeof value === 'string') return this.entities.get(value) || this.getEntity(this.scene.getObjectByProperty?.('uuid', value));
            const id = this.objectToId.get(value) || value.userData?.smEntity?.id;
            return id ? this.entities.get(String(id)) || null : null;
        }

        resolveObject(value) {
            if (!value) return null;
            if (value?.isObject3D) return value;
            if (value instanceof window.SMEntity) return value.object;
            return this.getEntity(value)?.object || null;
        }

        findById(id) { return this.entities.get(String(id)) || null; }
        findByName(name) { return [...(this.byName.get(String(name || '').toLowerCase()) || [])].map((id) => this.entities.get(id)).filter(Boolean); }
        findByTag(tag) { return [...(this.byTag.get(String(tag || '').toLowerCase()) || [])].map((id) => this.entities.get(id)).filter(Boolean); }

        query(query = {}) {
            let list = [...this.entities.values()];
            if (query.active !== undefined) list = list.filter((entity) => entity.active === Boolean(query.active));
            if (query.visible !== undefined) list = list.filter((entity) => entity.visible === Boolean(query.visible));
            if (query.tag) list = list.filter((entity) => entity.tags.includes(String(query.tag).toLowerCase()));
            if (query.layer) list = list.filter((entity) => entity.layer === query.layer);
            if (query.category) list = list.filter((entity) => entity.category === query.category);
            if (query.component) list = list.filter((entity) => entity.object.getComponent?.(query.component) || (entity.object.userData.components || []).some((item) => item.type === query.component));
            if (typeof query.filter === 'function') list = list.filter(query.filter);
            return list;
        }

        clear(options = {}) {
            const targets = [...this.entities.values()]
                .filter((entity) => entity.object.parent === this.scene)
                .filter((entity) => options.includeSystem === true || !this.isSystemEntity(entity))
                .filter((entity) => !options.filter || options.filter(entity));
            targets.forEach((entity) => this.destroyEntity(entity, { emit: false, dispose: options.dispose === true, reason: options.reason || 'scene-clear' }));
            this._changed('sceneCleared', { count: targets.length }, options);
            this._refreshEditor();
            return targets.length;
        }

        serialize(options = {}) {
            if (!window.SMWorldSceneSerializer) throw new Error('SMWorldSceneSerializer is unavailable.');
            return window.SMWorldSceneSerializer.capture(this, options);
        }

        async load(data, options = {}) {
            if (!window.SMWorldSceneSerializer) throw new Error('SMWorldSceneSerializer is unavailable.');
            return window.SMWorldSceneSerializer.restore(data, this, options);
        }

        isSystemEntity(entityOrObject) {
            const object = this.resolveObject(entityOrObject);
            const data = object?.userData || {};
            return data.isSystemObject === true || data.ignoreInSerialization === true || data.projectSerializable === false || data.runtimeOwned === true;
        }

        getStats() {
            let active = 0;
            let visible = 0;
            let components = 0;
            let physics = 0;
            let authored = 0;
            for (const entity of this.entities.values()) {
                if (!this.isSystemEntity(entity)) authored += 1;
                if (entity.active) active += 1;
                if (entity.visible) visible += 1;
                const descriptors = entity.object.components?.serialize?.() || entity.object.userData?.components || [];
                components += Array.isArray(descriptors) ? descriptors.length : 0;
                if (entity.object.userData?.physics || entity.object.userData?.colliderAuthoring || entity.object.getComponent?.('SMRigidBodyComponent')) physics += 1;
            }
            return {
                revision: this.revision,
                entities: this.entities.size,
                authored,
                active,
                visible,
                components,
                physics,
                roots: [...this.entities.values()].filter((entity) => entity.object.parent === this.scene).length,
                ...this.stats
            };
        }

        on(type, listener) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(listener);
            return () => this.off(type, listener);
        }

        off(type, listener) { return this.listeners.get(type)?.delete(listener) || false; }

        emit(type, detail = {}) {
            for (const listener of this.listeners.get(type) || []) {
                try { listener(detail); } catch (error) { console.error(`[SMSceneManager] ${type} listener failed.`, error); }
            }
        }

        _changed(type, detail, options = {}) {
            if (options.emit === false) return;
            this.revision += 1;
            this.emit(type, detail);
            const eventName = `sm:${type.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
            window.dispatchEvent(new CustomEvent(eventName, { detail: { manager: this, ...detail } }));
            if (!detail.entity || !this.isSystemEntity(detail.entity)) {
                window.dispatchEvent(new CustomEvent('sm:scene-dirty', { detail: { reason: type, ...detail } }));
            }
        }

        _index(entity) { this._indexName(entity); this._indexTags(entity); }
        _unindex(entity) { this._unindexName(entity); this._unindexTags(entity); }
        _indexName(entity) {
            const name = entity.name.toLowerCase();
            if (!this.byName.has(name)) this.byName.set(name, new Set());
            this.byName.get(name).add(entity.id);
        }
        _unindexName(entity, value = entity.name) {
            const name = String(value || '').toLowerCase();
            const set = this.byName.get(name);
            set?.delete(entity.id);
            if (set && !set.size) this.byName.delete(name);
        }
        _indexTags(entity) {
            entity.tags.forEach((tag) => {
                if (!this.byTag.has(tag)) this.byTag.set(tag, new Set());
                this.byTag.get(tag).add(entity.id);
            });
        }
        _unindexTags(entity) {
            entity.tags.forEach((tag) => {
                const set = this.byTag.get(tag);
                set?.delete(entity.id);
                if (set && !set.size) this.byTag.delete(tag);
            });
        }
        _isDescendant(parent, candidate) {
            let current = candidate;
            while (current) { if (current === parent) return true; current = current.parent; }
            return false;
        }
        _inferEntityOptions(object) {
            const data = object?.userData || {};
            const tags = new Set(window.SMEntity.normalizeTags(data.tags));
            let category = data.category || 'World';
            if (data.isTerrain || data.isTerrainMesh || data.isLandscape) { category = 'Terrain'; tags.add('terrain'); }
            else if (data.isWater || data.waterBodyId) { category = 'Water'; tags.add('water'); }
            else if (data.isPlayer || data.isPlayerRoot || data.isRuntimeCharacter) { category = 'Player'; tags.add('player'); }
            else if (object?.isCamera) { category = 'Cameras'; tags.add('camera'); }
            else if (object?.isLight) { category = 'Lights'; tags.add('light'); }
            else if (object?.isAudio) { category = 'Audio'; tags.add('audio'); }
            else if (data.isSkyLightingObject || data.keepForSky || data.isEnvironment) { category = 'Environment'; tags.add('environment'); }
            else if (data.isNPC || data.runtimeType === 'npc' || data.aiController) { category = 'NPCs'; tags.add('npc'); }
            return { category, tags: [...tags], layer: data.layer || 'Default' };
        }
        _syncLegacyRoot(object) {
            if (!Array.isArray(window.objects)) return;
            const root = object.parent === this.scene;
            const index = window.objects.indexOf(object);
            if (root && index < 0 && !object.userData?.isSystemObject) window.objects.push(object);
            if (!root && index >= 0) window.objects.splice(index, 1);
        }
        _removeLegacyTree(root) {
            if (!Array.isArray(window.objects)) return;
            const nodes = new Set();
            root.traverse?.((node) => nodes.add(node));
            for (let i = window.objects.length - 1; i >= 0; i -= 1) if (nodes.has(window.objects[i])) window.objects.splice(i, 1);
        }
        _disposeTree(root) {
            root.traverse?.((node) => {
                if (node.geometry && !this._resourceUsedOutsideTree(node.geometry, root, 'geometry')) node.geometry.dispose?.();
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.filter(Boolean).forEach((material) => {
                    if (!this._resourceUsedOutsideTree(material, root, 'material')) material.dispose?.();
                });
            });
        }
        _resourceUsedOutsideTree(resource, root, property) {
            let shared = false;
            const inside = new Set();
            root.traverse?.((node) => inside.add(node));
            this.scene.traverse?.((node) => {
                if (shared || inside.has(node)) return;
                const value = node[property];
                if (value === resource || (Array.isArray(value) && value.includes(resource))) shared = true;
            });
            return shared;
        }
        _cloneObjectSafely(source, recursive) {
            try {
                return source.clone(recursive);
            } catch (error) {
                const originals = new Map();
                source.traverse?.((node) => {
                    originals.set(node, node.userData);
                    node.userData = this._cloneSerializableData(node.userData);
                });
                try {
                    return source.clone(recursive);
                } finally {
                    originals.forEach((userData, node) => { node.userData = userData; });
                }
            }
        }
        _cloneSerializableData(data) {
            const seen = new WeakSet();
            const visit = (value) => {
                if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
                if (typeof value !== 'object' || value.isObject3D || value.isMaterial || value.isBufferGeometry || value.isTexture) return undefined;
                if (seen.has(value)) return undefined;
                seen.add(value);
                if (Array.isArray(value)) return value.map(visit).filter((item) => item !== undefined);
                const output = {};
                for (const [key, item] of Object.entries(value)) {
                    const safe = visit(item);
                    if (safe !== undefined) output[key] = safe;
                }
                return output;
            };
            return visit(data) || {};
        }
        _installPublicAPI() {
            window.createEntity = (options = {}) => this.createEntity({ select: true, ...options });
            window.destroyEntity = (entity, options = {}) => this.destroyEntity(entity, options);
            window.duplicateEntity = (entity, options = {}) => this.duplicateEntity(entity, options);
            window.reparentEntity = (entity, parent, options = {}) => this.reparentEntity(entity, parent, options);
            window.findEntityById = (id) => this.findById(id);
            window.queryEntities = (query = {}) => this.query(query);
            const createButton = document.getElementById('sm-create-entity-btn');
            if (createButton && createButton.dataset.smBound !== '1') {
                createButton.dataset.smBound = '1';
                createButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.createEntity({ name: 'Entity', select: true });
                });
            }
        }
        _bindSelectionEvents() {
            if (this._selectionBound) return;
            this._selectionBound = true;
            const notify = (event) => {
                const object = event?.detail?.object || event?.detail?.activeObject || window.selectedObject || null;
                const entity = object ? this.ensureEntity(object) : null;
                this.emit('entitySelected', { manager: this, entity, object });
                window.dispatchEvent(new CustomEvent('sm:entity-selected', { detail: { manager: this, entity, object } }));
            };
            window.addEventListener('sm:selection-changed', notify);
            window.addEventListener('sm:selected-object-changed', notify);
        }
        _refreshEditor(select = null) {
            if (select) window.selectObject?.(select);
            window.hierarchyManager?.renderAll?.();
            window.updateInspector?.();
        }
    }

    window.SMSceneManager = SMSceneManager;
    window.SMSceneManagerClass = SMSceneManager;
})();
