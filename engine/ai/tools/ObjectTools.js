(function () {
    'use strict';
    const registry = window.smAIToolRegistry;
    if (!registry) return;

    const find = (id) => {
        if (!id || id === 'selected') return window.selectedObject || null;
        const entityObject = window.smSceneManager?.resolveObject?.(id);
        if (entityObject) return entityObject;
        return window.scene?.getObjectByProperty?.('uuid', id) || window.scene?.getObjectByName?.(id) || null;
    };
    const vec = (value, fallback) => Array.isArray(value) && value.length >= 3
        ? value.map((number, index) => Number.isFinite(Number(number)) ? Number(number) : fallback[index])
        : fallback.slice();
    const summary = (object) => ({
        id: window.smSceneManager?.getEntity?.(object)?.id || object.uuid,
        uuid: object.uuid,
        name: object.name,
        type: object.type,
        position: object.position.toArray(),
        rotationDegrees: object.rotation.toArray().slice(0, 3).map((radian) => radian * 180 / Math.PI),
        scale: object.scale.toArray(),
        visible: object.visible !== false
    });
    const refresh = () => {
        window.updateHierarchy?.();
        window.updateInspector?.();
        window.renderer?.shadowMap && (window.renderer.shadowMap.needsUpdate = true);
    };
    const record = (name, undo, redo) => window.historyManager?.recordCustomAction?.(name, '', undo, redo);

    registry.registerMany([
        {
            name: 'list_scene_objects', label: 'List scene objects', permission: 'read',
            description: 'List editable objects in the current scene, optionally filtering by name or type.',
            parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } } },
            execute: ({ query = '', limit = 50 }) => {
                const results = [];
                const needle = String(query).toLowerCase();
                window.scene?.traverse?.((object) => {
                    if (object === window.scene || object.userData?.ignoreInHierarchy) return;
                    const haystack = `${object.name} ${object.type}`.toLowerCase();
                    if ((!needle || haystack.includes(needle)) && results.length < Math.min(200, Math.max(1, Number(limit) || 50))) {
                        results.push(summary(object));
                    }
                });
                return { count: results.length, objects: results };
            }
        },
        {
            name: 'get_object_details', label: 'Inspect object', permission: 'read',
            description: 'Get transform, geometry and material details for an object. Use selected when no id is given.',
            parameters: { type: 'object', properties: { objectId: { type: 'string' } } },
            execute: ({ objectId = 'selected' }) => {
                const object = find(objectId);
                if (!object) throw new Error('Object not found.');
                return { object: window.smAIContextBuilder?.describeObject?.(object, true) || summary(object) };
            }
        },
        {
            name: 'select_object', label: 'Select object', permission: 'read',
            description: 'Select an object in the editor by entity id, uuid or name.',
            parameters: { type: 'object', properties: { objectId: { type: 'string' } }, required: ['objectId'] },
            execute: ({ objectId }) => {
                const object = find(objectId);
                if (!object) throw new Error('Object not found.');
                window.selectObject?.(object);
                return { selected: summary(object) };
            }
        },
        {
            name: 'create_primitive', label: 'Create primitive', permission: 'mutate',
            description: 'Create a mesh primitive in the scene. Supported types: cube, sphere, plane, cylinder, cone, torus.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['cube', 'sphere', 'plane', 'cylinder', 'cone', 'torus'] },
                    name: { type: 'string' }, position: { type: 'array', items: { type: 'number' } },
                    scale: { type: 'array', items: { type: 'number' } }, color: { type: 'string' }
                }, required: ['type']
            },
            execute: ({ type, name, position, scale, color = '#b8b8b8' }) => {
                const geometries = {
                    cube: () => new THREE.BoxGeometry(1, 1, 1), sphere: () => new THREE.SphereGeometry(0.5, 32, 20),
                    plane: () => new THREE.PlaneGeometry(1, 1, 16, 16), cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
                    cone: () => new THREE.ConeGeometry(0.5, 1, 32), torus: () => new THREE.TorusGeometry(0.5, 0.16, 16, 48)
                };
                const make = geometries[String(type).toLowerCase()];
                if (!make) throw new Error(`Unsupported primitive type: ${type}`);
                const mesh = new THREE.Mesh(make(), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }));
                mesh.name = String(name || `AI_${type}`);
                mesh.position.fromArray(vec(position, [0, 0.5, 0]));
                mesh.scale.fromArray(vec(scale, [1, 1, 1]));
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const entity = window.smSceneManager?.addObject?.(mesh, { select: true, reason: 'ai' });
                if (!entity) { window.scene.add(mesh); window.selectObject?.(mesh); }
                record(`AI Create ${mesh.name}`, () => mesh.parent?.remove(mesh), () => window.scene?.add(mesh));
                refresh();
                return { created: summary(mesh) };
            }
        },
        {
            name: 'set_object_transform', label: 'Transform object', permission: 'mutate',
            description: 'Set position, rotation in degrees, or scale of an object. Omitted properties remain unchanged.',
            parameters: {
                type: 'object', properties: {
                    objectId: { type: 'string' }, position: { type: 'array', items: { type: 'number' } },
                    rotationDegrees: { type: 'array', items: { type: 'number' } }, scale: { type: 'array', items: { type: 'number' } }
                }
            },
            execute: ({ objectId = 'selected', position, rotationDegrees, scale }) => {
                const object = find(objectId);
                if (!object) throw new Error('Object not found.');
                const before = { position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() };
                if (position) object.position.fromArray(vec(position, object.position.toArray()));
                if (rotationDegrees) {
                    const degrees = vec(rotationDegrees, object.rotation.toArray().slice(0, 3).map((v) => v * 180 / Math.PI));
                    object.rotation.set(...degrees.map((v) => v * Math.PI / 180));
                }
                if (scale) object.scale.fromArray(vec(scale, object.scale.toArray()));
                const after = { position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() };
                record(`AI Transform ${object.name}`, () => { object.position.copy(before.position); object.rotation.copy(before.rotation); object.scale.copy(before.scale); }, () => { object.position.copy(after.position); object.rotation.copy(after.rotation); object.scale.copy(after.scale); });
                window.smSceneManager?.notifyEntityChanged?.(object, 'aiTransform');
                refresh();
                return { updated: summary(object) };
            }
        },
        {
            name: 'rename_object', label: 'Rename object', permission: 'mutate',
            description: 'Rename an object.',
            parameters: { type: 'object', properties: { objectId: { type: 'string' }, name: { type: 'string' } }, required: ['name'] },
            execute: ({ objectId = 'selected', name }) => {
                const object = find(objectId);
                if (!object) throw new Error('Object not found.');
                const before = object.name;
                const next = String(name || '').trim();
                if (!next) throw new Error('Name cannot be empty.');
                if (window.smSceneManager?.getEntity?.(object)) window.smSceneManager.renameEntity(object, next, { reason: 'ai' });
                else object.name = next;
                record(`AI Rename ${before}`, () => { object.name = before; refresh(); }, () => { object.name = next; refresh(); });
                refresh();
                return { renamed: summary(object), previousName: before };
            }
        },
        {
            name: 'duplicate_object', label: 'Duplicate object', permission: 'mutate',
            description: 'Duplicate an object and optionally give the copy a new name.',
            parameters: { type: 'object', properties: { objectId: { type: 'string' }, name: { type: 'string' } } },
            execute: ({ objectId = 'selected', name }) => {
                const source = find(objectId);
                if (!source) throw new Error('Object not found.');
                const entity = window.smSceneManager?.duplicateEntity?.(source, { name, select: true });
                const clone = entity?.object || entity || source.clone(true);
                if (!clone.parent) { clone.name = name || `${source.name}_Copy`; window.scene.add(clone); window.selectObject?.(clone); }
                record(`AI Duplicate ${source.name}`, () => clone.parent?.remove(clone), () => window.scene?.add(clone));
                refresh();
                return { duplicated: summary(clone) };
            }
        },
        {
            name: 'delete_object', label: 'Delete object', permission: 'destructive',
            description: 'Delete an object from the scene. This always requires confirmation.',
            parameters: { type: 'object', properties: { objectId: { type: 'string' } } },
            execute: ({ objectId = 'selected' }) => {
                const object = find(objectId);
                if (!object || object === window.scene) throw new Error('Object not found or cannot be deleted.');
                const parent = object.parent;
                const index = parent?.children?.indexOf(object) ?? -1;
                const objectSummary = summary(object);
                if (window.smSceneManager?.getEntity?.(object)) window.smSceneManager.destroyEntity(object, { reason: 'ai', dispose: false });
                else parent?.remove(object);
                record(`AI Delete ${object.name}`, () => { if (parent) parent.add(object); if (index >= 0) { parent.children.splice(parent.children.indexOf(object), 1); parent.children.splice(index, 0, object); } refresh(); }, () => { object.parent?.remove(object); refresh(); });
                refresh();
                return { deleted: objectSummary };
            }
        }
    ]);
}());
