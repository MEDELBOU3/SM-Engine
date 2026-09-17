(function () {
    'use strict';
    const registry = window.smAIToolRegistry;
    if (!registry) return;
    const find = (id) => !id || id === 'selected' ? window.selectedObject : window.scene?.getObjectByProperty?.('uuid', id) || window.scene?.getObjectByName?.(id);
    const describe = (light) => ({ uuid: light.uuid, name: light.name, type: light.type, color: `#${light.color.getHexString()}`, intensity: light.intensity, position: light.position.toArray(), castShadow: light.castShadow === true });

    registry.registerMany([
        {
            name: 'list_lights', label: 'List lights', permission: 'read', description: 'List all lights in the scene.',
            parameters: { type: 'object', properties: {} },
            execute: () => { const lights = []; window.scene?.traverse?.((object) => { if (object.isLight) lights.push(describe(object)); }); return { count: lights.length, lights }; }
        },
        {
            name: 'add_light', label: 'Add light', permission: 'mutate',
            description: 'Add a point, spot, directional, hemisphere or ambient light.',
            parameters: { type: 'object', properties: {
                type: { type: 'string', enum: ['point', 'spot', 'directional', 'hemisphere', 'ambient'] }, name: { type: 'string' },
                color: { type: 'string' }, intensity: { type: 'number' }, position: { type: 'array', items: { type: 'number' } }, castShadow: { type: 'boolean' }
            }, required: ['type'] },
            execute: ({ type, name, color = '#ffffff', intensity = 1, position = [3, 5, 3], castShadow = false }) => {
                const creators = {
                    point: () => new THREE.PointLight(color, intensity, 0, 2), spot: () => new THREE.SpotLight(color, intensity),
                    directional: () => new THREE.DirectionalLight(color, intensity), hemisphere: () => new THREE.HemisphereLight(color, 0x333333, intensity),
                    ambient: () => new THREE.AmbientLight(color, intensity)
                };
                const create = creators[String(type).toLowerCase()];
                if (!create) throw new Error(`Unsupported light type: ${type}`);
                const light = create();
                light.name = name || `AI_${type}_Light`;
                if (light.position && Array.isArray(position)) light.position.fromArray(position.map(Number));
                if ('castShadow' in light) light.castShadow = castShadow === true;
                light.userData = { ...(light.userData || {}), createdByAI: true, allowSecondaryGlobalSun: true };
                window.smSceneManager?.addObject?.(light, { select: true, reason: 'ai' }) || window.scene.add(light);
                window.renderer?.shadowMap && (window.renderer.shadowMap.needsUpdate = true);
                return { created: describe(light) };
            }
        },
        {
            name: 'set_light_properties', label: 'Edit light', permission: 'mutate',
            description: 'Change color, intensity, position, shadow casting, distance or spot angle for a light.',
            parameters: { type: 'object', properties: {
                objectId: { type: 'string' }, color: { type: 'string' }, intensity: { type: 'number' }, position: { type: 'array', items: { type: 'number' } },
                castShadow: { type: 'boolean' }, distance: { type: 'number' }, angleDegrees: { type: 'number' }
            } },
            execute: (args) => {
                const light = find(args.objectId || 'selected');
                if (!light?.isLight) throw new Error('Light not found.');
                if (args.color) light.color.set(args.color);
                if (Number.isFinite(Number(args.intensity))) light.intensity = Math.max(0, Number(args.intensity));
                if (Array.isArray(args.position)) light.position.fromArray(args.position.map(Number));
                if (typeof args.castShadow === 'boolean' && 'castShadow' in light) { light.castShadow = args.castShadow; light.userData.allowSecondaryGlobalSun = true; }
                if (Number.isFinite(Number(args.distance)) && 'distance' in light) light.distance = Math.max(0, Number(args.distance));
                if (Number.isFinite(Number(args.angleDegrees)) && 'angle' in light) light.angle = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(Number(args.angleDegrees), 1, 179));
                light.shadow && (light.shadow.needsUpdate = true);
                window.renderer?.shadowMap && (window.renderer.shadowMap.needsUpdate = true);
                return { updated: describe(light) };
            }
        }
    ]);
}());
