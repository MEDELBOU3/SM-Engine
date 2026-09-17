// =======================================================================
// js/scripting/codeunivers.js
// SM Engine — Universal Code Editor V2 compatibility layer
//
// IMPORTANT:
// - Does NOT own openCodeEditor/closeCodeEditor.
// - Does NOT bind #close-editor.
// - Idempotent setup.
// - Reuses the single global CodeEditorManager / ExplorerManager.
// =======================================================================

(function () {
    'use strict';

    if (typeof window.CodeEditorManager === 'undefined' && typeof CodeEditorManager === 'undefined') {
        console.error('[Scripting] CodeEditorManager is missing. Load js/scripting/code.js first.');
        return;
    }

    const BaseManager = window.CodeEditorManager || CodeEditorManager;

    class UniversalCodeEditorManager extends BaseManager {
        constructor(editorInstance) {
            super(editorInstance);
            this.supportedTypes = {
                Mesh: 'mesh',
                Group: 'group',
                Bone: 'bone',
                SkinnedMesh: 'skinnedMesh',
                Light: 'light',
                Camera: 'camera',
                Object3D: 'object3d'
            };
        }

        detectObjectType(object) {
            if (!object) return 'object3d';
            if (object.isSkinnedMesh) return 'skinnedMesh';
            if (object.isMesh) return 'mesh';
            if (object.isBone) return 'bone';
            if (object.isGroup) return 'group';
            if (object.isLight) return 'light';
            if (object.isCamera) return 'camera';
            return 'object3d';
        }

        _sanitizeClassName(name) {
            return String(name || 'Object')
                .replace(/[^a-zA-Z0-9_]/g, '')
                .replace(/^[0-9]/, '_$&') || 'Object';
        }

        getTemplateForType(type, objectName = 'MyObject') {
            const safeName = this._sanitizeClassName(objectName);

            const templates = {
                mesh:
`// Mesh Controller: ${objectName}
class ${safeName}Controller {
    constructor(object, api) {
        this.object = object;
        this.api = api;
        this.speed = 1;
    }

    start() {
        customConsole.log("Started " + this.object.name);
    }

    update(delta) {
        this.object.rotation.y += delta * this.speed;
    }

    onDestroy() {}
}
return ${safeName}Controller;`,

                skinnedMesh:
`// Character / SkinnedMesh Controller: ${objectName}
class ${safeName}CharacterController {
    constructor(object, api) {
        this.object = object;
        this.api = api;
    }

    start() {}

    update(delta) {}

    onDestroy() {}
}
return ${safeName}CharacterController;`,

                light:
`// Light Controller: ${objectName}
class ${safeName}LightController {
    constructor(object, api) {
        this.object = object;
        this.api = api;
        this.baseIntensity = Number(object.intensity || 1);
    }

    update(delta, time) {
        this.object.intensity =
            this.baseIntensity + Math.sin(time) * 0.2;
    }
}
return ${safeName}LightController;`,

                camera:
`// Camera Controller: ${objectName}
class ${safeName}CameraController {
    constructor(object, api) {
        this.object = object;
        this.api = api;
    }

    update(delta) {}
}
return ${safeName}CameraController;`,

                group:
`// Group Controller: ${objectName}
class ${safeName}GroupController {
    constructor(object, api) {
        this.object = object;
        this.api = api;
    }

    update(delta) {}
}
return ${safeName}GroupController;`,

                bone:
`// Bone Controller: ${objectName}
class ${safeName}BoneController {
    constructor(object, api) {
        this.object = object;
        this.api = api;
    }

    update(delta) {}
}
return ${safeName}BoneController;`,

                object3d:
`// Object Controller: ${objectName}
class ${safeName}Controller {
    constructor(object, api) {
        this.object = object;
        this.api = api;
    }

    start() {
        customConsole.log("Started " + this.object.name);
    }

    update(delta) {}

    onDestroy() {}
}
return ${safeName}Controller;`
            };

            return templates[type] || templates.object3d;
        }

        loadScriptForObject(object) {
            this.activeScriptAsset = null;

            if (!object) {
                this.activeObject = null;
                this.setCreateTemplate();
                this.setState('create');
                this.editor?.refresh?.();
                return;
            }

            this.activeObject = object;
            const objectType = this.detectObjectType(object);

            if (object.userData?.scriptSourceCode) {
                this.editor.setValue(object.userData.scriptSourceCode);
                this.setState('edit_object_script', object);
                window.customConsole?.log?.(`Loaded script for ${object.name}`);
            } else {
                this.editor.setValue(
                    this.getTemplateForType(objectType, object.name || 'Unnamed')
                );
                this.setState('attach_to_object', object);
            }

            this.editor?.refresh?.();
            window.smMonacoEditor?.layout?.();
        }

        handleAttach() {
            // Base manager performs a transaction: all selected targets must
            // compile before any existing object script is replaced.
            super.handleAttach();
            window.hierarchyManager?.renderAll?.();
        }
    }

    window.UniversalCodeEditorManager = UniversalCodeEditorManager;

    function resolvePrimaryEditor() {
        const allEditors =
            window.editors ||
            (typeof editors !== 'undefined' ? editors : null);

        return allEditors?.js || null;
    }

    function setupUniversalEditorSystem() {
        if (window.__smUniversalEditorV2Ready) {
            window.SMCodeWorkspace?.refresh?.();
            return window.codeEditorManager || null;
        }

        if (typeof window.initializeEditors === 'function') {
            try { window.initializeEditors(); } catch (error) {
                console.warn('[Scripting] initializeEditors warning:', error);
            }
        } else if (typeof initializeEditors === 'function') {
            try { initializeEditors(); } catch (error) {
                console.warn('[Scripting] initializeEditors warning:', error);
            }
        }

        const boot = () => {
            const editor = resolvePrimaryEditor();

            if (!editor) {
                setTimeout(boot, 80);
                return;
            }

            if (!window.codeEditorManager) {
                window.codeEditorManager =
                    new UniversalCodeEditorManager(editor);
            }

            try {
                window.codeEditorManager.setState?.('create');
            } catch (_) {}

            const ExplorerCtor =
                window.ExplorerManager ||
                (typeof ExplorerManager !== 'undefined' ? ExplorerManager : null);

            if (!window.explorerManager && ExplorerCtor) {
                window.explorerManager = new ExplorerCtor();
            }

            window.__smUniversalEditorV2Ready = true;
            window.SMCodeWorkspace?.refresh?.();

            console.log('✅ Universal Code Editor V2 ready');
            window.customConsole?.log?.('Scripting workspace ready');
        };

        boot();
        return window.codeEditorManager || null;
    }

    window.setupUniversalEditorSystem = setupUniversalEditorSystem;

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            setupUniversalEditorSystem,
            { once: true }
        );
    } else {
        setupUniversalEditorSystem();
    }
})();
