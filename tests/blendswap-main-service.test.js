const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    createBlendSwapMainService,
    registerBlendSwapIPC
} = require('../electron/BlendSwapMainService.js');

assert.equal(typeof createBlendSwapMainService, 'function');
assert.equal(typeof registerBlendSwapIPC, 'function');

const previousPrimaryKey = process.env.BLENDSWAP_API_KEY;
const previousLegacyKey = process.env.BLENDSWAP_KEY;
delete process.env.BLENDSWAP_API_KEY;
delete process.env.BLENDSWAP_KEY;

const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'sm-blendswap-test-')
);
const handlers = new Map();
const ipcMain = {
    handle(channel, handler) {
        handlers.set(channel, handler);
    },
    removeHandler(channel) {
        handlers.delete(channel);
    }
};
const app = {
    getPath(name) {
        assert.equal(name, 'userData');
        return temporaryRoot;
    }
};
const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`secure:${value}`, 'utf8'),
    decryptString: value => value.toString('utf8').replace(/^secure:/, '')
};

(async () => {
    try {
        const service = registerBlendSwapIPC({
            app,
            ipcMain,
            safeStorage,
            rootDir: temporaryRoot,
            electron: {}
        });
        await service.ready;

        const expectedChannels = [
            'sm-blendswap:key-status',
            'sm-blendswap:key-set',
            'sm-blendswap:key-clear',
            'sm-blendswap:search',
            'sm-blendswap:download',
            'sm-blendswap:cancel-download'
        ];
        assert.deepEqual([...handlers.keys()].sort(), [...expectedChannels].sort());

        const initial = await handlers.get('sm-blendswap:key-status')();
        assert.equal(initial.configured, false);

        const saved = await handlers.get('sm-blendswap:key-set')(
            null,
            { key: 'test-key' }
        );
        assert.equal(saved.ok, true);
        assert.equal(saved.configured, true);
        assert.equal(saved.persistent, true);

        const settingsPath = path.join(
            temporaryRoot,
            'asset-library',
            'blendswap',
            'settings.json'
        );
        const settingsText = fs.readFileSync(settingsPath, 'utf8');
        assert.equal(settingsText.includes('test-key'), false);

        const cleared = await handlers.get('sm-blendswap:key-clear')();
        assert.equal(cleared.ok, true);
        assert.equal(cleared.configured, false);

        const mainSource = fs.readFileSync(
            path.join(__dirname, '..', 'electron-main.js'),
            'utf8'
        );
        assert.match(mainSource, /registerBlendSwapIPC\s*\(\s*\)/);

        console.log(JSON.stringify({
            passed: true,
            registerExport: typeof registerBlendSwapIPC,
            channels: expectedChannels.length,
            encryptedKeyStorage: true
        }));
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
        if (previousPrimaryKey === undefined) delete process.env.BLENDSWAP_API_KEY;
        else process.env.BLENDSWAP_API_KEY = previousPrimaryKey;
        if (previousLegacyKey === undefined) delete process.env.BLENDSWAP_KEY;
        else process.env.BLENDSWAP_KEY = previousLegacyKey;
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
