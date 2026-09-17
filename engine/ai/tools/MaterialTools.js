(function () {
    'use strict';
    const registry = window.smAIToolRegistry;
    if (!registry) return;
    const find = (id) => !id || id === 'selected'
        ? window.selectedObject
        : window.smSceneManager?.resolveObject?.(id) || window.scene?.getObjectByProperty?.('uuid', id) || window.scene?.getObjectByName?.(id);
    const materials = (object) => Array.isArray(object?.material) ? object.material : object?.material ? [object.material] : [];
    const snapshot = (material) => ({
        color: material.color?.getHex(), roughness: material.roughness, metalness: material.metalness,
        opacity: material.opacity, transparent: material.transparent, emissive: material.emissive?.getHex(), emissiveIntensity: material.emissiveIntensity
    });
    const restore = (material, state) => {
        if (state.color !== undefined && material.color) material.color.setHex(state.color);
        if (state.emissive !== undefined && material.emissive) material.emissive.setHex(state.emissive);
        ['roughness', 'metalness', 'opacity', 'transparent', 'emissiveIntensity'].forEach((key) => { if (state[key] !== undefined) material[key] = state[key]; });
        material.needsUpdate = true;
    };

    registry.registerMany([
        {
            name: 'inspect_material', label: 'Inspect material', permission: 'read',
            description: 'Inspect materials on an object.',
            parameters: { type: 'object', properties: { objectId: { type: 'string' } } },
            execute: ({ objectId = 'selected' }) => {
                const object = find(objectId);
                if (!object) throw new Error('Object not found.');
                return { object: object.name, materials: materials(object).map((material) => window.smAIContextBuilder.describeMaterial(material)) };
            }
        },
        {
            name: 'set_material_properties', label: 'Edit material', permission: 'mutate',
            description: 'Set color, roughness, metalness, opacity, emissive color or emissive intensity on an object material.',
            parameters: { type: 'object', properties: {
                objectId: { type: 'string' }, color: { type: 'string' }, roughness: { type: 'number' },
                metalness: { type: 'number' }, opacity: { type: 'number' }, emissive: { type: 'string' }, emissiveIntensity: { type: 'number' }
            } },
            execute: (args) => {
                const object = find(args.objectId || 'selected');
                const targetMaterials = materials(object);
                if (!object || !targetMaterials.length) throw new Error('Object has no editable material.');
                const before = targetMaterials.map(snapshot);
                const apply = () => targetMaterials.forEach((material) => {
                    if (args.color && material.color) material.color.set(args.color);
                    if (args.emissive && material.emissive) material.emissive.set(args.emissive);
                    if (Number.isFinite(Number(args.roughness)) && 'roughness' in material) material.roughness = THREE.MathUtils.clamp(Number(args.roughness), 0, 1);
                    if (Number.isFinite(Number(args.metalness)) && 'metalness' in material) material.metalness = THREE.MathUtils.clamp(Number(args.metalness), 0, 1);
                    if (Number.isFinite(Number(args.opacity))) { material.opacity = THREE.MathUtils.clamp(Number(args.opacity), 0, 1); material.transparent = material.opacity < 1; }
                    if (Number.isFinite(Number(args.emissiveIntensity)) && 'emissiveIntensity' in material) material.emissiveIntensity = Math.max(0, Number(args.emissiveIntensity));
                    material.needsUpdate = true;
                });
                apply();
                const after = targetMaterials.map(snapshot);
                window.historyManager?.recordCustomAction?.(`AI Material ${object.name}`, '', () => targetMaterials.forEach((m, i) => restore(m, before[i])), () => targetMaterials.forEach((m, i) => restore(m, after[i])));
                window.smSceneManager?.notifyEntityChanged?.(object, 'aiMaterial');
                return { object: object.name, materials: targetMaterials.map((material) => window.smAIContextBuilder.describeMaterial(material)) };
            }
        }
    ]);
}());
