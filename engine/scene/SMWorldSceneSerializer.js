(function () {
    'use strict';

    const FORMAT = 'SM_WORLD_SCENE';
    const VERSION = 1;

    class SMWorldSceneSerializer {
        static capture(manager = window.smSceneManager, options = {}) {
            if (!manager?.scene) throw new Error('A live SMSceneManager is required to capture a scene.');
            manager.scanScene({ emit: false });

            const roots = this._resolveRoots(manager, options);
            const included = new Set();
            for (const root of roots) {
                root.traverse?.((object) => {
                    const entity = manager.getEntity(object);
                    if (entity && this._shouldSerialize(entity, manager, options)) included.add(entity.id);
                });
            }

            const entities = [];
            for (const entity of manager.entities.values()) {
                if (!included.has(entity.id)) continue;
                entities.push(this.serializeEntity(entity, manager, included, options));
            }
            entities.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

            const dependencies = this._collectDependencies(entities);
            const scene = manager.scene;
            return {
                format: FORMAT,
                version: VERSION,
                scene: {
                    id: String(scene.userData?.smSceneId || scene.uuid || 'scene'),
                    name: String(scene.name || scene.userData?.levelName || 'Scene'),
                    metadata: this._cloneSafe(scene.userData?.sceneMetadata || {}),
                    settings: this._cloneSafe(scene.userData?.worldSettings || {}),
                    rootEntityIds: entities.filter((item) => !item.parentId).map((item) => item.id)
                },
                entities,
                dependencies,
                statistics: {
                    entities: entities.length,
                    components: entities.reduce((sum, entity) => sum + entity.components.length, 0),
                    dependencies: dependencies.length
                },
                savedAt: new Date().toISOString()
            };
        }

        static serializeEntity(entity, manager, included, options = {}) {
            const object = entity.object;
            const parentEntity = manager.getEntity(object.parent);
            const node = window.SMPrefabSerializer?.serializeNode
                ? window.SMPrefabSerializer.serializeNode(object, {
                    includeChildren: false,
                    includeEditorOnly: options.includeEditorOnly === true,
                    resourceMode: options.resourceMode || 'descriptor',
                    inlineResources: options.inlineResources === true,
                    inlineFallback: options.inlineFallback !== false
                })
                : this._fallbackNode(object);
            node.nodeId = entity.id;
            node.components = this._runtimeComponentDescriptors(object);

            return {
                id: entity.id,
                name: entity.name,
                parentId: parentEntity && included.has(parentEntity.id) ? parentEntity.id : null,
                order: object.parent?.children?.indexOf(object) ?? 0,
                active: entity.active,
                visible: entity.visible,
                layer: entity.layer,
                layerMask: object.layers?.mask ?? 1,
                category: entity.category,
                tags: entity.tags,
                static: object.userData?.static === true,
                prefab: entity.data.prefabId ? {
                    id: entity.data.prefabId,
                    overrides: this._cloneSafe(object.userData?.prefabOverrides || {})
                } : null,
                transform: {
                    local: entity.getLocalTransform(),
                    world: options.includeWorldTransforms === false ? undefined : entity.getWorldTransform()
                },
                components: this._componentDescriptors(object),
                object: node,
                metadata: this._cloneSafe(entity.data.metadata || {})
            };
        }

        static async restore(payload, manager = window.smSceneManager, options = {}) {
            if (!payload || payload.format !== FORMAT) throw new Error(`Unsupported world scene format: ${payload?.format || 'unknown'}`);
            if (Number(payload.version) > VERSION) throw new Error(`Scene version ${payload.version} is newer than this engine supports.`);
            if (!manager?.scene) throw new Error('A live SMSceneManager is required to restore a scene.');

            if (options.clearExisting !== false) {
                manager.clear({
                    includeSystem: options.includeSystem === true,
                    dispose: false,
                    reason: 'scene-load',
                    emit: false,
                    filter: options.clearFilter
                });
            }

            const created = new Map();
            const errors = [];
            const entities = Array.isArray(payload.entities) ? payload.entities : [];

            for (const descriptor of entities) {
                try {
                    const object = await this._instantiateObject(descriptor, options);
                    this._applyEntityDescriptor(object, descriptor);
                    manager.scene.add(object);
                    const entity = manager.registerObject(object, {
                        id: descriptor.id,
                        active: descriptor.active,
                        layer: descriptor.layer,
                        category: descriptor.category,
                        tags: descriptor.tags,
                        metadata: descriptor.metadata,
                        prefabId: descriptor.prefab?.id || null,
                        recursive: false,
                        emit: false
                    });
                    created.set(descriptor.id, { descriptor, object, entity });
                } catch (error) {
                    errors.push({ id: descriptor?.id || null, name: descriptor?.name || '', message: String(error?.message || error) });
                    console.error('[SMWorldSceneSerializer] Entity restore failed.', descriptor?.name, error);
                }
            }

            const ordered = [...created.values()].sort((a, b) => (a.descriptor.order || 0) - (b.descriptor.order || 0));
            for (const record of ordered) {
                const parent = created.get(record.descriptor.parentId)?.object || manager.scene;
                parent.add(record.object);
                this._applyLocalTransform(record.object, record.descriptor.transform?.local);
                manager._syncLegacyRoot?.(record.object);
            }
            manager.scene.updateMatrixWorld?.(true);
            manager.revision += 1;
            manager.emit('sceneLoaded', { manager, payload, entities: [...created.values()].map((item) => item.entity), errors });
            window.dispatchEvent(new CustomEvent('sm:world-scene-loaded', { detail: { manager, payload, count: created.size, errors } }));
            window.hierarchyManager?.renderAll?.();
            window.updateInspector?.();
            window.performanceManager?.registerScene?.();
            window.playerSystem?.playerPhysics?.refreshWorld?.(true);

            return {
                loaded: errors.length === 0,
                entityCount: created.size,
                entities: [...created.values()].map((item) => item.object),
                roots: [...created.values()].filter((item) => !item.descriptor.parentId).map((item) => item.object),
                errors
            };
        }

        static _resolveRoots(manager, options) {
            if (Array.isArray(options.roots)) return options.roots.filter((object) => object?.isObject3D);
            return manager.scene.children.filter((object) => {
                const entity = manager.getEntity(object);
                return entity && this._shouldSerialize(entity, manager, options);
            });
        }

        static _shouldSerialize(entity, manager, options) {
            const object = entity.object;
            const data = object.userData || {};
            if (options.includeEditorOnly !== true && (entity.data.editorOnly || data.isEditorHelper || data.editorOnly || data.ignoreInSerialization)) return false;
            if (options.includeSystem !== true && manager.isSystemEntity(entity)) return false;
            if (typeof options.filter === 'function' && !options.filter(object, entity)) return false;
            return true;
        }

        static _runtimeComponentDescriptors(object) {
            if (object.components?.serialize) {
                try { return object.components.serialize(); } catch (_) {}
            }
            return Array.isArray(object.userData?.components) ? this._cloneSafe(object.userData.components) : [];
        }

        static _componentDescriptors(object) {
            const components = [{
                type: 'Transform',
                storage: 'native',
                local: {
                    position: object.position?.toArray?.() || [0, 0, 0],
                    quaternion: object.quaternion?.toArray?.() || [0, 0, 0, 1],
                    scale: object.scale?.toArray?.() || [1, 1, 1]
                }
            }];
            if (object.isMesh || object.isSkinnedMesh) {
                components.push({ type: 'MeshRenderer', storage: 'native', castShadow: object.castShadow === true, receiveShadow: object.receiveShadow === true, asset: this._assetRef(object), geometry: object.geometry?.type || null, material: Array.isArray(object.material) ? object.material.map((item) => item?.type || null) : object.material?.type || null });
            }
            if (object.isCamera) components.push({ type: 'Camera', storage: 'native', projection: object.isOrthographicCamera ? 'orthographic' : 'perspective', fov: object.fov, near: object.near, far: object.far });
            if (object.isLight) components.push({ type: 'Light', storage: 'native', lightType: object.type, color: object.color?.getHexString?.() ? `#${object.color.getHexString()}` : '#ffffff', intensity: object.intensity ?? 1, castShadow: object.castShadow === true });
            if (object.userData?.physics) components.push({ type: 'Physics', storage: 'legacy-adapter', data: this._cloneSafe(object.userData.physics) });
            if (object.userData?.colliderAuthoring) components.push({ type: 'Collider', storage: 'legacy-adapter', data: this._cloneSafe(object.userData.colliderAuthoring) });
            if (object.userData?.isTerrain || object.userData?.isTerrainMesh) components.push({ type: 'TerrainData', storage: 'subsystem-reference', serializer: 'SMTerrainSerializer' });
            if (object.userData?.isWater || object.userData?.waterBodyId) components.push({ type: 'WaterBody', storage: 'subsystem-reference', id: object.userData.waterBodyId || null });
            if (object.userData?.isPlayer || object.userData?.isPlayerRoot) components.push({ type: 'PlayerController', storage: 'subsystem-reference', serializer: 'SMPlayerSerializer' });
            if (object.userData?.scriptSourceCode || object.userData?.scriptAssetId) components.push({ type: 'Script', storage: 'legacy-adapter', assetId: object.userData.scriptAssetId || null, className: object.userData.scriptClassName || null, enabled: object.userData.scriptEnabled !== false });
            if (object.animations?.length || object.userData?.animationController) components.push({ type: 'Animator', storage: 'native', clips: (object.animations || []).map((clip) => clip.name) });
            for (const component of this._runtimeComponentDescriptors(object)) components.push({ ...this._cloneSafe(component), storage: 'runtime' });
            return components;
        }

        static async _instantiateObject(entity, options) {
            const node = this._cloneSafe(entity.object || {});
            node.nodeId = entity.id;
            node.name = entity.name;
            node.components = (entity.components || []).filter((component) => component.storage === 'runtime').map((component) => {
                const clone = { ...component };
                delete clone.storage;
                return clone;
            });
            if (window.SMPrefab && window.SMPrefabInstantiator?.instantiate) {
                const prefab = new window.SMPrefab({ id: `scene-entity-${entity.id}`, name: entity.name, root: node });
                return await window.SMPrefabInstantiator.instantiate(prefab, {
                    addToScene: false,
                    preferTemplate: false,
                    assetResolvers: options.assetResolvers || []
                });
            }
            return this._fallbackObject(entity, node);
        }

        static _fallbackObject(entity, node) {
            const type = node.objectType || 'Group';
            let object;
            if (type.includes('Camera')) object = type.includes('Orthographic') ? new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 2000) : new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
            else if (type.includes('Light')) object = this._fallbackLight(type);
            else if (type === 'Mesh' || type === 'SkinnedMesh') object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
            else object = new THREE.Group();
            object.name = entity.name || node.name || 'Entity';
            return object;
        }

        static _fallbackLight(type) {
            if (type === 'DirectionalLight') return new THREE.DirectionalLight(0xffffff, 1);
            if (type === 'SpotLight') return new THREE.SpotLight(0xffffff, 1);
            if (type === 'HemisphereLight') return new THREE.HemisphereLight(0xffffff, 0x444444, 1);
            if (type === 'AmbientLight') return new THREE.AmbientLight(0xffffff, 1);
            return new THREE.PointLight(0xffffff, 1);
        }

        static _applyEntityDescriptor(object, entity) {
            object.name = entity.name || object.name || 'Entity';
            object.visible = entity.visible !== false;
            object.layers.mask = Number(entity.layerMask ?? 1);
            object.userData = object.userData || {};
            object.userData.static = entity.static === true;
            object.userData.tags = [...(entity.tags || [])];
            object.userData.smEntity = {
                version: 1,
                id: entity.id,
                active: entity.active !== false,
                layer: entity.layer || 'Default',
                category: entity.category || 'World',
                tags: [...(entity.tags || [])],
                metadata: this._cloneSafe(entity.metadata || {}),
                prefabId: entity.prefab?.id || null,
                editorOnly: false,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            if (entity.prefab?.overrides) object.userData.prefabOverrides = this._cloneSafe(entity.prefab.overrides);
            const physics = entity.components?.find((component) => component.type === 'Physics');
            const collider = entity.components?.find((component) => component.type === 'Collider');
            if (physics?.data) object.userData.physics = this._cloneSafe(physics.data);
            if (collider?.data) object.userData.colliderAuthoring = this._cloneSafe(collider.data);
            object.userData.components = (entity.components || []).filter((component) => component.storage === 'runtime').map((component) => {
                const clone = { ...this._cloneSafe(component) };
                delete clone.storage;
                return clone;
            });
            if (entity.prefab?.id) object.userData.prefabId = entity.prefab.id;
            else {
                delete object.userData.prefabId;
                delete object.userData.prefabInstanceId;
                delete object.userData.prefabSourceUUID;
            }
            this._applyLocalTransform(object, entity.transform?.local);
        }

        static _applyLocalTransform(object, transform) {
            if (!transform) return;
            if (Array.isArray(transform.position)) object.position.fromArray(transform.position);
            if (Array.isArray(transform.quaternion)) object.quaternion.fromArray(transform.quaternion);
            if (Array.isArray(transform.scale)) object.scale.fromArray(transform.scale);
            object.updateMatrix?.();
        }

        static _fallbackNode(object) {
            return {
                nodeId: object.uuid,
                name: object.name,
                objectType: object.type || 'Object3D',
                visible: object.visible !== false,
                layers: object.layers?.mask ?? 1,
                transform: {
                    position: object.position?.toArray?.() || [0, 0, 0],
                    quaternion: object.quaternion?.toArray?.() || [0, 0, 0, 1],
                    scale: object.scale?.toArray?.() || [1, 1, 1]
                },
                userData: {},
                components: this._runtimeComponentDescriptors(object),
                children: []
            };
        }

        static _assetRef(object) {
            const data = object.userData || {};
            if (!data.assetId && !data.assetPath && !data.sourcePath && !data.modelPath) return null;
            return { id: data.assetId || data.sourceAssetId || null, path: data.assetPath || data.sourcePath || data.modelPath || null, type: data.assetType || 'object' };
        }

        static _collectDependencies(entities) {
            const map = new Map();
            for (const entity of entities) {
                const refs = window.SMPrefabSerializer?.collectDependencies?.(entity.object) || [];
                for (const ref of refs) {
                    const key = ref.id || ref.path || JSON.stringify(ref);
                    if (!map.has(key)) map.set(key, ref);
                }
            }
            return [...map.values()];
        }

        static _cloneSafe(value) {
            if (value === undefined) return undefined;
            try { return structuredClone(value); } catch (_) {}
            try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; }
        }
    }

    SMWorldSceneSerializer.FORMAT = FORMAT;
    SMWorldSceneSerializer.VERSION = VERSION;
    window.SMWorldSceneSerializer = SMWorldSceneSerializer;
    window.SMWorldSceneSerializerClass = SMWorldSceneSerializer;
})();
