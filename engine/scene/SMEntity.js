(function () {
    'use strict';

    const ENTITY_VERSION = 1;

    function createEntityId() {
        if (globalThis.crypto?.randomUUID) {
            return `entity-${globalThis.crypto.randomUUID()}`;
        }
        if (globalThis.THREE?.MathUtils?.generateUUID) {
            return `entity-${THREE.MathUtils.generateUUID()}`;
        }
        return `entity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeTags(tags) {
        const values = Array.isArray(tags)
            ? tags
            : String(tags || '').split(',');
        return [...new Set(values
            .map((tag) => String(tag).trim().toLowerCase())
            .filter(Boolean))];
    }

    class SMEntity {
        constructor(object, manager = null, options = {}) {
            if (!object?.isObject3D) {
                throw new TypeError('SMEntity requires a THREE.Object3D owner.');
            }
            this.object = object;
            this.manager = manager;
            this._ensureData(options);
        }

        _ensureData(options = {}) {
            const object = this.object;
            object.userData = object.userData || {};
            const current = object.userData.smEntity || {};
            const tags = normalizeTags(options.tags ?? current.tags ?? object.userData.tags);

            object.userData.smEntity = {
                version: ENTITY_VERSION,
                id: String(options.id || current.id || createEntityId()),
                active: options.active ?? current.active ?? true,
                layer: String(options.layer ?? current.layer ?? object.userData.layer ?? 'Default'),
                category: String(options.category ?? current.category ?? object.userData.category ?? 'World'),
                tags,
                metadata: {
                    ...(current.metadata || {}),
                    ...(options.metadata || {})
                },
                prefabId: options.prefabId ?? current.prefabId ?? object.userData.prefabId ?? null,
                editorOnly: options.editorOnly ?? current.editorOnly ?? object.userData.editorOnly === true,
                createdAt: current.createdAt || Date.now(),
                updatedAt: Date.now()
            };
            object.userData.tags = tags.slice();
            return object.userData.smEntity;
        }

        get data() { return this.object.userData.smEntity; }
        get id() { return this.data.id; }
        get name() { return this.object.name || 'Entity'; }
        set name(value) {
            if (this.manager) this.manager.renameEntity(this, value);
            else this.object.name = String(value || 'Entity');
        }
        get parent() { return this.manager?.getEntity(this.object.parent) || null; }
        get children() { return (this.object.children || []).map((child) => this.manager?.getEntity(child)).filter(Boolean); }
        get active() { return this.data.active !== false; }
        get visible() { return this.object.visible !== false; }
        get tags() { return this.data.tags.slice(); }
        get layer() { return this.data.layer; }
        get category() { return this.data.category; }

        setActive(active) { return this.manager?.setActive(this, active) ?? Boolean(active); }
        setVisible(visible) { return this.manager?.setVisible(this, visible) ?? (this.object.visible = Boolean(visible)); }
        setParent(parent, options = {}) { return this.manager?.reparentEntity(this, parent, options) || false; }
        addComponent(type, options = {}) { return this.manager?.addComponent(this, type, options) || null; }
        removeComponent(type, options = {}) { return this.manager?.removeComponent(this, type, options) || false; }
        getComponent(type) { return this.object.getComponent?.(type) || null; }
        getComponents(type = null) { return this.object.getComponents?.(type) || []; }

        addTag(tag) {
            const next = normalizeTags([...this.data.tags, tag]);
            this.manager?.setTags(this, next);
            return next;
        }

        removeTag(tag) {
            const target = String(tag || '').trim().toLowerCase();
            const next = this.data.tags.filter((item) => item !== target);
            this.manager?.setTags(this, next);
            return next;
        }

        getLocalTransform() {
            return {
                position: this.object.position.toArray(),
                quaternion: this.object.quaternion.toArray(),
                scale: this.object.scale.toArray()
            };
        }

        getWorldTransform() {
            this.object.updateWorldMatrix?.(true, false);
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            this.object.matrixWorld.decompose(position, quaternion, scale);
            return {
                position: position.toArray(),
                quaternion: quaternion.toArray(),
                scale: scale.toArray()
            };
        }

        touch() {
            this.data.updatedAt = Date.now();
            return this;
        }

        toJSON() {
            return {
                id: this.id,
                name: this.name,
                active: this.active,
                visible: this.visible,
                layer: this.layer,
                category: this.category,
                tags: this.tags,
                parentId: this.parent?.id || null,
                transform: this.getLocalTransform(),
                metadata: { ...this.data.metadata }
            };
        }

        static ensure(object, manager = null, options = {}) {
            return new SMEntity(object, manager, options);
        }

        static createId() { return createEntityId(); }
        static normalizeTags(tags) { return normalizeTags(tags); }
    }

    SMEntity.VERSION = ENTITY_VERSION;
    window.SMEntity = SMEntity;
    window.SMEntityClass = SMEntity;
})();
