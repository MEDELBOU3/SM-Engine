// Optional Electron preload bridge for contextIsolation:true.
// Load/merge this into your existing preload script, then keep
// engine/water/NativeWaterBridge.js in the renderer.

const { contextBridge } = require('electron');
const path = require('path');

function loadNativeWaterAddon() {
    const explicit = process.env.SM_NATIVE_WATER_ADDON_PATH;

    const candidates = [
        explicit,
        path.join(
            __dirname,
            'build',
            'Release',
            'sm_water_native.node'
        ),
        path.join(
            __dirname,
            'build',
            'Debug',
            'sm_water_native.node'
        ),
        path.join(
            process.cwd(),
            'engine',
            'native',
            'water',
            'build',
            'Release',
            'sm_water_native.node'
        ),
        path.join(
            process.cwd(),
            'engine',
            'native',
            'water',
            'build',
            'Debug',
            'sm_water_native.node'
        )
    ].filter(Boolean);

    let lastError = null;

    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch (error) {
            lastError = error;
        }
    }

    console.warn(
        '[SM Native Water preload] Native addon was not loaded.',
        lastError?.message || ''
    );
    return null;
}

const addon = loadNativeWaterAddon();

if (addon) {
    contextBridge.exposeInMainWorld(
        'smNativeWaterAPI',
        {
            reset: () => addon.reset(),
            setTime: seconds => addon.setTime(Number(seconds) || 0),
            step: (delta, absoluteTime) =>
                addon.step(
                    Number(delta) || 0,
                    Number(absoluteTime) || 0
                ),
            upsertBody: body => addon.upsertBody(body),
            removeBody: id => addon.removeBody(String(id || '')),
            sample: (x, z) =>
                addon.sample(
                    Number(x) || 0,
                    Number(z) || 0
                ),
            sampleBody: (id, x, z) =>
                addon.sampleBody(
                    String(id || ''),
                    Number(x) || 0,
                    Number(z) || 0
                ),
            addRipple: (id, options) =>
                addon.addRipple(
                    String(id || ''),
                    options || {}
                ),
            stats: () => addon.stats()
        }
    );
}
