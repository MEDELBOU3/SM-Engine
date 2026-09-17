(function () {
    'use strict';
    const registry = window.smAIToolRegistry;
    if (!registry) return;

    const getAssets = () => {
        const manager = window.AssetsPanel || window.AssetManager;
        const source = manager?.assets || manager?.getAssets?.() || [];
        return Array.isArray(source) ? source : [];
    };

    registry.registerMany([
        {
            name: 'search_assets', label: 'Search assets', permission: 'read', description: 'Search assets already imported into the SM Engine content browser.',
            parameters: { type: 'object', properties: { query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'integer' } } },
            execute: ({ query = '', type = '', limit = 30 }) => {
                const needle = String(query).toLowerCase();
                const kind = String(type).toLowerCase();
                const results = getAssets().filter((asset) => {
                    const text = `${asset.name || ''} ${asset.type || ''} ${(asset.tags || []).join(' ')}`.toLowerCase();
                    return (!needle || text.includes(needle)) && (!kind || String(asset.type || '').toLowerCase() === kind);
                }).slice(0, Math.min(100, Math.max(1, Number(limit) || 30))).map((asset) => ({ id: asset.id, name: asset.name, type: asset.type, tags: asset.tags || [] }));
                return { count: results.length, assets: results };
            }
        },
        {
            name: 'add_asset_to_scene', label: 'Add asset to scene', permission: 'mutate', description: 'Add an existing content-browser asset to the scene by asset id.',
            parameters: { type: 'object', properties: { assetId: { type: 'string' }, name: { type: 'string' } }, required: ['assetId'] },
            execute: async ({ assetId, name }) => {
                const manager = window.AssetsPanel || window.AssetManager;
                const add = manager?._addToScene || manager?.addToScene;
                if (typeof add !== 'function') throw new Error('Asset scene loader is unavailable.');
                const result = await add.call(manager, assetId, null, { name });
                const object = result?.isObject3D ? result : window.selectedObject;
                return { assetId, added: object ? { uuid: object.uuid, name: object.name, type: object.type } : true };
            }
        }
    ]);
}());
