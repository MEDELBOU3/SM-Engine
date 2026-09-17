const assert = require('node:assert/strict');

global.window = global;
global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
    }
};
window.dispatchEvent = () => true;

const editorCamera = {
    isCamera: true,
    name: 'EditorCamera',
    uuid: 'editor-camera',
    type: 'PerspectiveCamera'
};
const gameplayCamera = {
    isCamera: true,
    name: 'GameplayCamera',
    uuid: 'gameplay-camera',
    type: 'PerspectiveCamera'
};

window.camera = editorCamera;
require('../engine/viewport/SMViewportCameraRouter.js');

const Router = window.SMViewportCameraRouterClass;
const router = new Router();

// This exact bootstrap sequence previously recursed until the engine aborted.
assert.equal(router.refreshEditorCamera(), editorCamera);
assert.equal(router.setActiveRole('editor'), editorCamera);
assert.equal(router.getActiveCamera(), editorCamera);

assert.equal(router.setGameplayCamera(gameplayCamera), gameplayCamera);
assert.equal(router.getActiveCamera(), gameplayCamera);
assert.equal(window._gameCameraActive, true);

router.clearGameplayCamera({ force: true });
assert.equal(router.activeRole, 'editor');
assert.equal(router.getActiveCamera(), editorCamera);
assert.equal(window._gameCameraActive, false);

console.log(JSON.stringify({
    passed: true,
    editor: editorCamera.name,
    gameplay: gameplayCamera.name,
    restoredRole: router.activeRole
}));
