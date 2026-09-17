// =======================================================================
//  js/scripting/code.js
//  ADVANCED VS CODE-STYLE EDITOR WITH PROFESSIONAL FEATURES
//  Enhanced version with intellisense, diagnostics, and improved explorer
// =======================================================================

// =======================================================================
// PART 1: CORE SYSTEMS
// =======================================================================
const scriptManager = {
    scripts: [],

    _callLifecycle: function (instance, hook, object) {
        if (typeof instance?.[hook] !== 'function') return;

        try {
            instance[hook]();
        } catch (error) {
            const name = object?.name || 'Unknown Object';
            customConsole.error(
                `Error in ${hook}() for script on '${name}': ${error.message}`
            );
            console.error(error);
        }
    },

    _disposeAPI: function (instance) {
        if (!instance?.api || instance.__smApiDisposed) return;
        instance.__smApiDisposed = true;
        try {
            instance.api.dispose?.();
        } catch (error) {
            console.warn('Unable to dispose script API:', error);
        }
    },

    registerScript: function (instance) {
        if (!instance || typeof instance !== 'object') {
            console.warn('Attempted to register an invalid script instance:', instance);
            return false;
        }

        // `update` is optional.  A script can be event/start driven and still
        // needs to be registered so its start/onDestroy hooks work.
        if (typeof instance.update !== 'function') instance.update = () => {};

        const object = instance.object || null;
        const existing = object?.userData?.scriptInstance;

        if (existing && existing !== instance) {
            this.removeScriptForObject(object, false);
        }

        if (!this.scripts.includes(instance)) {
            this.scripts.push(instance);
        }

        if (object?.userData) {
            object.userData.scriptInstance = instance;
            if (object.userData.scriptEnabled === undefined) {
                object.userData.scriptEnabled = true;
            }
        }

        instance.enabled = object?.userData?.scriptEnabled !== false;

        if (!instance.__smStarted) {
            instance.__smStarted = true;
            this._callLifecycle(instance, 'start', object);
        }

        if (instance.enabled) {
            this._callLifecycle(instance, 'onEnable', object);
        }

        return true;
    },

    update: function (delta, time) {
        for (let i = this.scripts.length - 1; i >= 0; i--) {
            const script = this.scripts[i];
            if (!script || script.enabled === false) continue;

            try {
                if (typeof script.update === 'function') script.update(delta, time);
            } catch (e) {
                const name = script.object?.name || 'Unknown Object';
                customConsole.error(`Error in update() for script on '${name}': ${e.message}. Script paused.`);
                console.error(e);
                this._callLifecycle(script, 'onDisable', script.object);
                this._disposeAPI(script);
                this.scripts.splice(i, 1);
                script.enabled = false;
                if (script.object?.userData) {
                    script.object.userData.scriptEnabled = false;
                }
            }
        }
    },

    setScriptEnabled: function (object, enabled = true) {
        const instance = object?.userData?.scriptInstance;
        if (!instance) return false;

        const next = Boolean(enabled);
        const wasEnabled = instance.enabled !== false;

        object.userData.scriptEnabled = next;
        instance.enabled = next;

        if (next && !this.scripts.includes(instance)) {
            this.scripts.push(instance);
        }

        if (next !== wasEnabled) {
            this._callLifecycle(
                instance,
                next ? 'onEnable' : 'onDisable',
                object
            );
        }

        return true;
    },

    toggleScriptForObject: function (object) {
        const instance = object?.userData?.scriptInstance;
        return instance
            ? this.setScriptEnabled(object, instance.enabled === false)
            : false;
    },

    removeScriptForObject: function (object, clearUserData = true) {
        const instance = object?.userData?.scriptInstance;
        if (!object || !instance) return false;

        if (instance.enabled !== false) {
            this._callLifecycle(instance, 'onDisable', object);
        }

        this._callLifecycle(instance, 'onDestroy', object);
        this._disposeAPI(instance);
        instance.enabled = false;
        this.scripts = this.scripts.filter(script => script !== instance);

        if (clearUserData) {
            delete object.userData.scriptInstance;
            delete object.userData.scriptSourceCode;
            delete object.userData.scriptClassName;
            delete object.userData.scriptEnabled;
        }

        return true;
    }
};

// Keep a window reference as well as the lexical constant.  Several engine
// systems (the game loop and the universal editor) access scripting through
// window and previously ended up with two disconnected managers.
window.scriptManager = scriptManager;

const EditorAccess = {
    scene: null,
    camera: null,
    transformControls: null,
    init: function (s, c, t) {
        this.scene = s;
        this.camera = c;
        this.transformControls = t;
        window.EditorAccess = this;
    },
    getSelectedObject: function () {
        return window.selectedObject ||
            window.selectionManager?.activeObject ||
            this.transformControls?.object ||
            (Array.isArray(window.selectedObjects) ? window.selectedObjects.at(-1) : null) ||
            null;
    },
    getSelectedObjects: function () {
        if (Array.isArray(window.selectedObjects) && window.selectedObjects.length) {
            return window.selectedObjects.slice();
        }
        const active = this.getSelectedObject();
        return active ? [active] : [];
    },
    findObject: function (name) {
        if (!name || !this.scene) return null;
        return this.scene.getObjectByName(name) || null;
    },
};

window.EditorAccess = EditorAccess;

const hierarchyManager = {
    init: function () {
        if (window.hierarchyManager?.renderAll) window.hierarchyManager.renderAll();
    },
    updateSelectionStyle: function () {
        if (window.hierarchyManager?.renderAll) {
            window.hierarchyManager.renderAll();
        }
    }
};

// =======================================================================
// PART 2: ADVANCED INTELLISENSE & DIAGNOSTICS ENGINE
// =======================================================================

class IntelliSenseEngine {
    constructor() {
        this.threeJSSymbols = this.buildThreeJSSymbols();
        this.userDefinedSymbols = new Map();
        this.diagnostics = [];
    }

    buildThreeJSSymbols() {
        const symbols = {
            'THREE': {
                type: 'namespace',
                members: [
                    'Scene', 'PerspectiveCamera', 'OrthographicCamera', 'WebGLRenderer',
                    'Mesh', 'Group', 'Object3D', 'BoxGeometry', 'SphereGeometry',
                    'PlaneGeometry', 'CylinderGeometry', 'TorusGeometry', 'TorusKnotGeometry',
                    'MeshStandardMaterial', 'MeshBasicMaterial', 'MeshPhongMaterial',
                    'PointLight', 'DirectionalLight', 'AmbientLight', 'SpotLight',
                    'Vector3', 'Vector2', 'Euler', 'Quaternion', 'Matrix4',
                    'Color', 'Fog', 'FogExp2', 'TextureLoader', 'Clock',
                    'Raycaster', 'AnimationMixer', 'AnimationClip', 'KeyframeTrack'
                ]
            },
            'customConsole': {
                type: 'object',
                members: ['log', 'error', 'warn', 'clear']
            },
            'EditorAccess': {
                type: 'object',
                members: ['scene', 'camera', 'transformControls', 'getSelectedObject', 'getSelectedObjects', 'findObject']
            },
            'EngineAPI': {
                type: 'object',
                members: ['scene', 'camera', 'renderer', 'object', 'selectedObject', 'getSelectedObject', 'getSelectedObjects', 'findObject', 'findObjectById', 'forEachObject', 'selectObject', 'addObject', 'createObject', 'removeObject', 'destroyObject', 'cloneObject', 'getComponent', 'setComponent', 'removeComponent', 'playSound', 'stopAllSounds', 'on', 'emit']
            }
        };
        return symbols;
    }

    analyzeCode(code) {
        this.diagnostics = [];
        const lines = code.split('\n');

        lines.forEach((line, index) => {
            if (line.includes('console.log') && !line.includes('customConsole')) {
                this.diagnostics.push({
                    line: index,
                    message: 'Use customConsole.log() instead of console.log()',
                    severity: 'warning'
                });
            }
        });

        return this.diagnostics;
    }

    isKnownSymbol(name) {
        return this.threeJSSymbols[name] ||
            ['THREE', 'customConsole', 'EditorAccess', 'EngineAPI'].includes(name);
    }

    isBuiltIn(name) {
        const builtIns = ['console', 'Math', 'Date', 'Array', 'Object', 'String',
            'Number', 'Boolean', 'Function', 'JSON', 'window', 'document'];
        return builtIns.includes(name);
    }

    getCompletions(context, token) {
        const completions = [];

        if (context === 'THREE') {
            this.threeJSSymbols.THREE.members.forEach(member => {
                completions.push({
                    text: member,
                    displayText: member,
                    type: 'class',
                    info: `THREE.${member}`
                });
            });
        }

        if (context === 'customConsole') {
            ['log', 'error', 'warn', 'clear'].forEach(method => {
                completions.push({
                    text: method,
                    displayText: method,
                    type: 'function',
                    info: `customConsole.${method}()`
                });
            });
        }

        if (context === 'EditorAccess') {
            ['scene', 'camera', 'transformControls', 'getSelectedObject', 'getSelectedObjects', 'findObject'].forEach(member => {
                completions.push({
                    text: member,
                    displayText: member,
                    type: member.includes('get') ? 'function' : 'property',
                    info: `EditorAccess.${member}`
                });
            });
        }

        if (context === 'EngineAPI') {
            ['scene', 'camera', 'renderer', 'object', 'selectedObject', 'getSelectedObject', 'getSelectedObjects', 'findObject', 'findObjectById', 'forEachObject', 'selectObject', 'addObject', 'createObject', 'removeObject', 'destroyObject', 'cloneObject', 'getComponent', 'setComponent', 'removeComponent', 'playSound', 'stopAllSounds', 'on', 'emit'].forEach(member => {
                completions.push({
                    text: member,
                    displayText: member,
                    type: member.includes('get') || ['addObject', 'createObject', 'removeObject', 'destroyObject', 'playSound', 'on', 'emit'].includes(member) ? 'function' : 'property',
                    info: `EngineAPI.${member}`
                });
            });
        }

        if (!context) {
            ['class', 'const', 'let', 'var', 'function', 'return', 'if', 'else',
                'for', 'while', 'switch', 'case', 'break', 'continue', 'new', 'this'].forEach(keyword => {
                    if (keyword.startsWith(token)) {
                        completions.push({
                            text: keyword,
                            displayText: keyword,
                            type: 'keyword'
                        });
                    }
                });
        }

        return completions;
    }
}

// =======================================================================
// PART 3: CODE EDITOR MANAGER WITH ADVANCED FEATURES
// =======================================================================

class CodeEditorManager {
    constructor(editorInstance) {
        this.editor = editorInstance;
        this.intelliSense = new IntelliSenseEngine();
        this.activeObject = null;
        this.activeScriptAsset = null;
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;

        this.statusDisplay = document.getElementById('editing-status');
        this.filenameInput = document.getElementById('filename-input');

        this.createButton = document.getElementById('create-object-btn');
        this.attachButton = document.getElementById('attach-script-btn');
        this.applyButton = document.getElementById('apply-changes-btn');
        this.detachButton = document.getElementById('detach-script-btn');
        this.saveAsNewAssetButton = document.getElementById('save-as-new-asset-btn');
        this.saveToCurrentAssetButton = document.getElementById('save-to-current-asset-btn');

        if (!this.createButton || !this.attachButton || !this.applyButton ||
            !this.detachButton || !this.saveAsNewAssetButton || !this.saveToCurrentAssetButton) {
            console.error("CRITICAL ERROR: One or more editor buttons are missing!");
            return;
        }

        this.setupAdvancedFeatures();
        this.bindEvents();
        this.setState('create');
    }

    setupAdvancedFeatures() {
        this.editor.on("inputRead", (cm, change) => {
            if (cm.state.completionActive) return;

            const cur = cm.getCursor();
            const token = cm.getTokenAt(cur);

            if (token.string === '.') {
                const beforeDot = cm.getRange({ line: cur.line, ch: 0 }, cur);
                const match = beforeDot.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\.$/);

                if (match) {
                    const context = match[1];
                    setTimeout(() => {
                        this.showContextualCompletions(cm, context);
                    }, 50);
                }
            }
            else if (token.type === 'variable' || token.type === 'property' ||
                /^[a-zA-Z_$]/.test(token.string)) {
                setTimeout(() => {
                    if (!cm.state.completionActive) {
                        cm.execCommand("autocomplete");
                    }
                }, 150);
            }
        });

        this.editor.on("change", () => {
            clearTimeout(this.diagnosticTimer);
            this.diagnosticTimer = setTimeout(() => {
                this.runDiagnostics();
            }, 500);
        });

        this.editor.setOption("matchBrackets", true);
        this.editor.setOption("autoCloseBrackets", true);
        this.editor.setOption("styleActiveLine", true);
    }

    /*showContextualCompletions(cm, context) {
        const completions = this.intelliSense.getCompletions(context);

        if (completions.length > 0) {
            CodeMirror.showHint(cm, () => {
                const cur = cm.getCursor();
                return {
                    list: completions,
                    from: cur,
                    to: cur
                };
            }, {
                completeSingle: false,
                closeOnUnfocus: true
            });
        }
    }*/

    showContextualCompletions(cm, context) {
        const completions = this.intelliSense.getCompletions(context);

        if (completions.length > 0) {
            // --- MODIFICATION START ---
            // Add a custom render function to each completion item
            const listWithRenderers = completions.map(item => {
                return {
                    ...item, // Keep original properties (text, displayText, etc.)
                    render: (element, self, data) => {
                        const main = document.createElement('span');
                        main.className = `cm-hint-main type-${data.type || 'property'}`;
                        main.textContent = data.displayText;

                        const meta = document.createElement('span');
                        meta.className = 'cm-hint-meta';
                        meta.textContent = data.type || '';

                        element.appendChild(main);
                        element.appendChild(meta);
                    }
                };
            });

            CodeMirror.showHint(cm, () => {
                const cur = cm.getCursor();
                return {
                    list: listWithRenderers, // Use our new list with renderers
                    from: cur,
                    to: cur
                };
            }, {
                completeSingle: false,
                closeOnUnfocus: true
            });
            // --- MODIFICATION END ---
        }
    }

    runDiagnostics() {
        const code = this.editor.getValue();
        const diagnostics = this.intelliSense.analyzeCode(code);

        this.editor.getAllMarks().forEach(mark => mark.clear());

        diagnostics.forEach(diag => {
            const className = diag.severity === 'error' ? 'cm-error-line' : 'cm-warning-line';
            this.editor.addLineClass(diag.line, 'background', className);
        });

        const errorCount = diagnostics.filter(d => d.severity === 'error').length;
        const warningCount = diagnostics.filter(d => d.severity === 'warning').length;
        updateConsoleFooter(errorCount, warningCount, 0);
    }

    bindEvents() {
        this.createButton.onclick = () => this.handleCreate();
        this.attachButton.onclick = () => this.handleAttach();
        this.applyButton.onclick = () => this.handleApplyChanges();
        this.detachButton.onclick = () => this.handleDetach();
        this.saveAsNewAssetButton.onclick = () => this.handleSaveAsNewAsset();
        this.saveToCurrentAssetButton.onclick = () => this.handleSaveToCurrentAsset();

        this.editor.setOption("extraKeys", {
            ...this.editor.getOption("extraKeys"),
            "Ctrl-Enter": () => {
                if (this.createButton.style.display !== 'none') this.createButton.click();
                else if (this.attachButton.style.display !== 'none') this.attachButton.click();
                else if (this.applyButton.style.display !== 'none') this.applyButton.click();
                else if (this.saveToCurrentAssetButton.style.display !== 'none') this.saveToCurrentAssetButton.click();
            },
            "Ctrl-Space": "autocomplete",
            "Alt-F": () => this.formatCode(),
            // Ctrl+D → duplicate current line (VS Code: select next occurrence,
            // but duplicate is more useful for quick scripting)
            "Ctrl-D": () => this.duplicateLine(),
            // Ctrl+Shift+K → delete the current line (VS Code standard)
            "Ctrl-Shift-K": (cm) => {
                const cursor = cm.getCursor();
                const lineCount = cm.lineCount();
                if (lineCount === 1) {
                    cm.setValue('');
                } else if (cursor.line === lineCount - 1) {
                    // Last line — remove the newline before it
                    cm.replaceRange('', { line: cursor.line - 1, ch: cm.getLine(cursor.line - 1).length }, { line: cursor.line, ch: cm.getLine(cursor.line).length });
                } else {
                    cm.replaceRange('', { line: cursor.line, ch: 0 }, { line: cursor.line + 1, ch: 0 });
                }
            },
            // Alt+Up / Alt+Down → move line up/down
            "Alt-Up": (cm) => {
                const cursor = cm.getCursor();
                if (cursor.line === 0) return;
                const currentLine = cm.getLine(cursor.line);
                const prevLine = cm.getLine(cursor.line - 1);
                cm.replaceRange(currentLine, { line: cursor.line - 1, ch: 0 }, { line: cursor.line - 1, ch: prevLine.length });
                cm.replaceRange(prevLine, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: currentLine.length });
                cm.setCursor({ line: cursor.line - 1, ch: cursor.ch });
            },
            "Alt-Down": (cm) => {
                const cursor = cm.getCursor();
                if (cursor.line >= cm.lineCount() - 1) return;
                const currentLine = cm.getLine(cursor.line);
                const nextLine = cm.getLine(cursor.line + 1);
                cm.replaceRange(nextLine, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: currentLine.length });
                cm.replaceRange(currentLine, { line: cursor.line + 1, ch: 0 }, { line: cursor.line + 1, ch: nextLine.length });
                cm.setCursor({ line: cursor.line + 1, ch: cursor.ch });
            },
            "Ctrl-/": "toggleComment"
        });
    }

    formatCode() {
        try {
            const code = this.editor.getValue();
            const lines = code.split('\n');
            let indentLevel = 0;
            const formatted = lines.map(line => {
                const trimmed = line.trim();

                if (trimmed.startsWith('}')) {
                    indentLevel = Math.max(0, indentLevel - 1);
                }

                const indented = '    '.repeat(indentLevel) + trimmed;

                if (trimmed.endsWith('{')) {
                    indentLevel++;
                }

                return indented;
            }).join('\n');

            this.editor.setValue(formatted);
            customConsole.log('✓ Code formatted successfully');
        } catch (e) {
            customConsole.error('Formatting failed: ' + e.message);
        }
    }

    duplicateLine() {
        const cursor = this.editor.getCursor();
        const line = this.editor.getLine(cursor.line);
        this.editor.replaceRange('\n' + line, { line: cursor.line, ch: line.length });
        this.editor.setCursor({ line: cursor.line + 1, ch: cursor.ch });
    }

    setState(mode, selectedOverride = null) {
        this.createButton.style.display = 'none';
        this.attachButton.style.display = 'none';
        this.applyButton.style.display = 'none';
        this.detachButton.style.display = 'none';
        this.saveAsNewAssetButton.style.display = 'none';
        this.saveToCurrentAssetButton.style.display = 'none';
        this.filenameInput.disabled = false;

        const selectedObject = selectedOverride || EditorAccess.getSelectedObject();
        const selectedCount =
            EditorAccess.getSelectedObjects()
                .filter(object =>
                    object instanceof
                    THREE.Object3D
                )
                .length;
        const selectionSuffix =
            selectedCount > 1
                ? ` · ${selectedCount} selected`
                : '';

        switch (mode) {
            case 'create':
                this.activeObject = null;
                this.activeScriptAsset = null;
                this.statusDisplay.textContent = 'Mode: Create New Object';
                this.filenameInput.value = '';
                this.createButton.style.display = 'inline-block';
                this.saveAsNewAssetButton.style.display = 'inline-block';
                break;

            case 'attach_to_object':
                this.activeScriptAsset = null;
                this.activeObject = selectedObject || this.activeObject;
                if (!this.activeObject) {
                    this.setState('create');
                    return;
                }
                this.statusDisplay.textContent = `Attaching to: ${this.activeObject.name || 'Unnamed'}${selectionSuffix}`;
                this.filenameInput.value = this.activeObject.name || '';
                this.filenameInput.disabled = true;
                this.attachButton.style.display = 'inline-block';
                this.saveAsNewAssetButton.style.display = 'inline-block';
                break;

            case 'edit_object_script':
                this.activeScriptAsset = null;
                this.activeObject = selectedObject || this.activeObject;
                if (!this.activeObject) {
                    this.setState('create');
                    return;
                }
                this.statusDisplay.textContent = `Editing Script: ${this.activeObject.name || 'Unnamed'}${selectionSuffix}`;
                this.filenameInput.value = this.activeObject.name || '';
                this.filenameInput.disabled = true;
                this.applyButton.style.display = 'inline-block';
                this.detachButton.style.display = 'inline-block';
                this.saveAsNewAssetButton.style.display = 'inline-block';
                break;

            case 'edit_asset_script':
                if (!this.activeScriptAsset) {
                    console.error("setState('edit_asset_script') called without activeScriptAsset.");
                    this.setState('create');
                    return;
                }
                this.statusDisplay.textContent = `Editing Asset: ${this.activeScriptAsset.name}`;
                this.filenameInput.value = this.activeScriptAsset.name.replace(/\.(js|html|css|json)$/i, '');
                this.saveToCurrentAssetButton.style.display = 'inline-block';
                if (selectedObject) {
                    this.attachButton.style.display = 'inline-block';
                }
                this.saveAsNewAssetButton.style.display = 'inline-block';
                break;

            default:
                console.warn(`CodeEditorManager: Unknown state mode '${mode}'.`);
                this.setState('create');
                return;
        }
        if (this.editor) this.editor.refresh();
    }

    _buildRuntimeAPI(targetObject = null) {
        const scene = window.scene || EditorAccess.scene || null;
        const camera = window.camera || EditorAccess.camera || null;
        const renderer = window.renderer || window.mainRenderer || null;
        const sounds = new Set();

        const add = (object, name = 'Scripted Object', parent = scene) => {
            if (!(object instanceof THREE.Object3D)) {
                throw new Error('EngineAPI.addObject() expects a THREE.Object3D.');
            }
            object.name = name || object.name || 'Scripted Object';
            object.userData = { ...object.userData, selectable: true };
            if (parent === scene && typeof window.addObjectToScene === 'function') {
                return window.addObjectToScene(object, object.name);
            }
            if (parent && !object.parent) parent.add(object);
            if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
            return object;
        };

        const remove = (object) => {
            if (!object) return false;
            if (typeof window.removeObjectFromScene === 'function') {
                window.removeObjectFromScene(object, true);
            } else if (object.parent) {
                object.parent.remove(object);
            }
            return true;
        };

        const findComponent = (object, name) => {
            if (!object || !name) return null;
            const direct = object.getComponent?.(name);
            if (direct) return direct;
            const all = object.getComponents?.() || [];
            return all.find((component) =>
                component.customType === name ||
                component.type === name ||
                component.constructor?.name === name
            ) || null;
        };

        const select = (object) => {
            if (!(object instanceof THREE.Object3D)) return false;

            if (typeof window.selectObject === 'function') {
                window.selectObject(object, {
                    source: 'script'
                });
            } else {
                window.selectedObject = object;
                window.selectedObjects = [object];
                window.transformControls?.attach?.(object);
            }

            return true;
        };

        const playSound = (source, options = {}) => {
            let url = source;
            if (source && typeof source === 'object') url = source.url || source.src || source.data;
            const assetsPanel = window.AssetsPanel || (typeof AssetsPanel !== 'undefined' ? AssetsPanel : null);
            if (typeof url === 'string' && assetsPanel?._findById) {
                const asset = assetsPanel._findById(url);
                if (asset) url = asset.data || asset.url || url;
            }
            if (!url || typeof Audio !== 'function') {
                customConsole.warn('EngineAPI.playSound(): provide an audio URL or an audio asset id.');
                return null;
            }
            const audio = new Audio(url);
            audio.volume = Number.isFinite(options.volume) ? options.volume : 1;
            audio.loop = Boolean(options.loop);
            const controller = {
                audio,
                play: () => audio.play().catch(() => {}),
                pause: () => audio.pause(),
                stop: () => { audio.pause(); audio.currentTime = 0; },
                dispose: () => { controller.stop(); sounds.delete(controller); }
            };
            sounds.add(controller);
            if (options.autoplay !== false) controller.play();
            return controller;
        };

        const api = {
            scene,
            camera,
            renderer,
            object: targetObject || null,
            selectedObject: targetObject || EditorAccess.getSelectedObject(),
            getSelectedObject: () => EditorAccess.getSelectedObject(),
            getSelectedObjects: () => EditorAccess.getSelectedObjects(),
            findObject: (name) => EditorAccess.findObject(name),
            findObjectById: (id) => window.smSceneManager?.findById?.(id)?.object || scene?.getObjectByProperty?.('uuid', id) || null,
            forEachObject: (callback) => scene?.traverse?.(callback),
            selectObject: select,
            addObject: add,
            createObject: add,
            removeObject: remove,
            destroyObject: remove,
            cloneObject: (object = targetObject, recursive = true) => object?.clone?.(recursive) || null,
            getComponent: (object, name) => findComponent(object, name),
            setComponent: (object, name, value) => {
                if (!object || !name || !window.smSceneManager) return null;
                let component = findComponent(object, name);
                if (!component) {
                    component = window.SMComponentRegistry?.has?.(name)
                        ? window.smSceneManager.addComponent(object, name, value && typeof value === 'object' ? value : {})
                        : window.smSceneManager.addComponent(object, 'SMCustomComponent', {
                            customType: name,
                            properties: value && typeof value === 'object' ? value : { value }
                        });
                } else if (component.customType && value && typeof value === 'object') {
                    component.properties = { ...component.properties, ...value };
                } else if (value && typeof value === 'object') {
                    component.deserialize?.({ ...component.serialize?.(), ...value });
                }
                object.components?.saveToOwner?.();
                return component;
            },
            removeComponent: (object, name) => {
                const component = findComponent(object, name);
                return component ? window.smSceneManager?.removeComponent?.(object, component) || false : false;
            },
            playSound,
            stopAllSounds: () => sounds.forEach((sound) => sound.stop()),
            dispose: () => sounds.forEach((sound) => sound.dispose()),
            on: (eventName, handler) => window.addEventListener(eventName, handler),
            emit: (eventName, detail) => window.dispatchEvent(new CustomEvent(eventName, { detail }))
        };
        return api;
    }

    _compileAndInstantiate(sourceCode, targetObject = null) {
        customConsole.clear();
        const runtime = this._buildRuntimeAPI(targetObject);
        const ScriptClass = new Function(
            'THREE', 'customConsole', 'EditorAccess', 'scene', 'camera', 'renderer',
            'selectedObject', 'selectedObjects', 'scriptManager', 'EngineAPI',
            'createObject', 'addObject', 'destroyObject', 'removeObject', 'playSound',
            'window', 'document',
            `"use strict"; ${sourceCode}`
        )(
            THREE, customConsole, EditorAccess, runtime.scene, runtime.camera, runtime.renderer,
            runtime.selectedObject, runtime.getSelectedObjects(), scriptManager, runtime,
            runtime.createObject, runtime.addObject, runtime.destroyObject, runtime.removeObject,
            runtime.playSound, window, document
        );
        if (typeof ScriptClass !== 'function') throw new Error("Script must return a class.");
        // The second constructor argument is the public runtime API. Existing
        // one-argument scripts remain compatible while new scripts can use
        // `constructor(object, api)` or `this.api`.
        const scriptInstance = targetObject
            ? new ScriptClass(targetObject, runtime)
            : new ScriptClass(null, runtime);
        scriptInstance.api = runtime;
        if (!scriptInstance.object && targetObject) scriptInstance.object = targetObject;
        const object3D = targetObject || scriptInstance.object;
        if (!(object3D instanceof THREE.Object3D)) throw new Error("Script class must have a '.object' property that is a THREE.Object3D.");
        // Do not mutate object.userData here. Callers compile every selected
        // target first, then commit. A syntax/runtime error therefore leaves
        // the previous live script completely untouched.
        return {
            object3D,
            scriptInstance,
            sourceCode,
            scriptClassName:
                ScriptClass.name ||
                'ObjectScript'
        };
    }

    _getScriptTargets(fallback = null) {
        const selected =
            EditorAccess.getSelectedObjects()
                .filter(object =>
                    object instanceof
                    THREE.Object3D
                );

        if (selected.length) {
            return [
                ...new Set(selected)
            ];
        }

        return fallback instanceof THREE.Object3D
            ? [fallback]
            : [];
    }

    _commitCompiledScript(compiled) {
        const {
            object3D,
            scriptInstance,
            sourceCode,
            scriptClassName
        } = compiled;
        const shouldStayEnabled =
            object3D.userData
                ?.scriptEnabled !==
            false;

        scriptManager.removeScriptForObject(
            object3D,
            false
        );

        object3D.userData = {
            ...object3D.userData,
            scriptInstance,
            scriptSourceCode: sourceCode,
            scriptClassName,
            scriptEnabled: shouldStayEnabled
        };

        scriptInstance.object = object3D;
        scriptManager.registerScript(
            scriptInstance
        );

        return object3D;
    }

    handleCreate() {
        try {
            const compiled = this._compileAndInstantiate(
                this.editor.getValue()
            );
            const { object3D } = compiled;
            const objectName = this.filenameInput.value.trim() || `ScriptedObject`;
            object3D.userData.selectable = true;

            if (object3D.parent === (window.scene || EditorAccess.scene)) {
                object3D.name = objectName;
                if (Array.isArray(window.objects) && !window.objects.includes(object3D)) {
                    window.objects.push(object3D);
                    if (typeof window.addObjectToTimeline === 'function') window.addObjectToTimeline(object3D);
                }
                if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
            } else if (typeof window.addObjectToScene === 'function') {
                window.addObjectToScene(object3D, objectName);
            } else {
                console.error("'addObjectToScene' not found.");
                showStatus("Error: addObjectToScene() not found.");
                return;
            }

            this._commitCompiledScript(compiled);
            showStatus(`✓ '${object3D.name}' created successfully`);
            this.loadScriptForObject(object3D);
        } catch (e) {
            showEnhancedError(e);
        }
    }

    handleAttach() {
        const targets = this._getScriptTargets(
            EditorAccess.getSelectedObject()
        );

        if (!targets.length) {
            showStatus("Please select an object to attach the script.");
            return;
        }

        try {
            const sourceCode =
                this.activeScriptAsset
                    ? this.activeScriptAsset.data
                    : this.editor.getValue();

            // Compile every target before replacing any live instance. A
            // single invalid script therefore cannot partially detach a
            // multi-selection.
            const compiled =
                targets.map(target =>
                    this._compileAndInstantiate(
                        sourceCode,
                        target
                    )
                );

            const objects =
                compiled.map(candidate =>
                    this._commitCompiledScript(
                        candidate
                    )
                );

            if (typeof window.updateHierarchy === 'function') window.updateHierarchy();

            this.activeScriptAsset = null;
            this.activeObject = objects[0] || null;
            this.loadScriptForObject(this.activeObject);

            showStatus(
                targets.length === 1
                    ? `✓ Script attached to '${objects[0].name}'`
                    : `✓ Script attached to ${targets.length} selected objects`
            );
        } catch (e) {
            showEnhancedError(e);
            const active =
                targets[0] ||
                null;
            if (active?.userData?.scriptSourceCode) {
                this.loadScriptForObject(active);
            } else {
                this.setAttachTemplate();
                this.setState(
                    'attach_to_object',
                    active
                );
            }
        }
    }

    handleApplyChanges() {
        const targets = this._getScriptTargets(
            this.activeObject
        );

        if (!targets.length) {
            showStatus('Select an object before applying a script.');
            return;
        }

        try {
            const sourceCode =
                this.editor.getValue();
            const compiled =
                targets.map(target =>
                    this._compileAndInstantiate(
                        sourceCode,
                        target
                    )
                );
            const objects =
                compiled.map(candidate =>
                    this._commitCompiledScript(
                        candidate
                    )
                );

            if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
            this.activeObject = objects[0] || null;
            this.loadScriptForObject(this.activeObject);
            showStatus(
                targets.length === 1
                    ? `✓ Changes applied to '${objects[0].name}'`
                    : `✓ Changes applied to ${targets.length} selected objects`
            );
        } catch (e) {
            showEnhancedError(e);
            // Nothing was removed before compilation, so the previous scripts
            // are still active exactly as they were before Apply was pressed.
            showStatus('Script was not applied; the previous running script was kept.');
        }
    }

    handleDetach() {
        const targets = this._getScriptTargets(
            this.activeObject
        ).filter(object =>
            !!object.userData?.scriptInstance
        );

        if (!targets.length) return;

        targets.forEach(object =>
            scriptManager.removeScriptForObject(
                object
            )
        );

        if (typeof window.updateHierarchy === 'function') window.updateHierarchy();

        this.activeScriptAsset = null;
        this.setAttachTemplate();
        this.setState(
            'attach_to_object',
            targets[0]
        );
        showStatus(
            targets.length === 1
                ? `Script detached from '${targets[0].name}'`
                : `Scripts detached from ${targets.length} selected objects`
        );
    }

   handleSaveAsNewAsset() {
        // 1. Identify Active Tab and Editor
        const activeTabElement = document.querySelector('.editor-tab.active');
        // Default to 'js' if no tab is explicitly active
        const mode = activeTabElement ? activeTabElement.dataset.tab : 'js'; 
        
        // 'editors' is the global object containing { js: ..., html: ..., css: ..., json: ... }
        const currentEditor = editors[mode];

        if (!currentEditor) {
            console.error(`CodeEditorManager: No active editor found for mode: ${mode}`);
            showStatus("Error: Editor instance not found");
            return;
        }

        // 2. Get Content from the *Active* Editor
        const sourceCode = currentEditor.getValue();

        // 3. Get and Clean Filename
        const rawName = this.filenameInput.value.trim();
        if (!rawName) {
            showStatus("Please enter a filename.");
            return;
        }

        // 4. Force Correct Extension based on Tab
        let finalName = rawName;
        const extensionMap = {
            'js': '.js',
            'html': '.html',
            'css': '.css',
            'json': '.json'
        };

        const requiredExt = extensionMap[mode] || '.js';

        // Check if the filename already has the correct extension. 
        // If not, strip potential wrong extensions and append the correct one.
        if (!finalName.toLowerCase().endsWith(requiredExt)) {
            // Regex to remove any existing extension from the list
            finalName = finalName.replace(/\.(js|html|css|json)$/i, '');
            finalName += requiredExt;
        }

        console.log(`Saving ${mode.toUpperCase()} file: ${finalName}`);

        // 5. Save via AssetsPanel
        if (typeof AssetsPanel !== 'undefined' && typeof AssetsPanel.addScriptAsset === 'function') {
            // Scripts created by the code editor always live in the dedicated
            // Scripts folder. This keeps the editor and AssetsPanel in sync,
            // even when the asset browser is currently open elsewhere.
            const folderId = typeof AssetsPanel.ensureScriptsFolder === 'function'
                ? AssetsPanel.ensureScriptsFolder()
                : (AssetsPanel.openFolderId || null);
            
            // We use addScriptAsset for all text-based files. 
            // The AssetsPanel logic uses the file extension to determine the internal type/icon.
            const newAsset = AssetsPanel.addScriptAsset(finalName, sourceCode, folderId);

            if (newAsset) {
                showStatus(`✓ Saved '${newAsset.name}'`);
                
                // Update the editor state to "Editing Asset" so subsequent "Save" clicks 
                // will update this specific asset instead of creating duplicates.
                this.activeScriptAsset = newAsset;
                this.setState('edit_asset_script');
                
                // If ExplorerManager is active (sidebar tree), refresh it to show the new file
                if (explorerManager) {
                    if (typeof explorerManager.refreshFromAssets === 'function') explorerManager.refreshFromAssets();
                    else if (typeof explorerManager.render === 'function') explorerManager.render();
                }
            } else {
                showStatus("Failed to save. (Name conflict?)");
            }
        } else {
            console.error("AssetsPanel or addScriptAsset is missing.");
            showStatus("Error: AssetsPanel unavailable");
        }
    }

    handleSaveToCurrentAsset() {
        if (!this.activeScriptAsset) {
            showStatus("No active script asset to save.");
            return;
        }
        const newName = this.filenameInput.value.trim();
        if (!newName) {
            showStatus("Please enter a script name.");
            return;
        }
        const activeTabElement = document.querySelector('.editor-tab.active');
        const mode = activeTabElement ? activeTabElement.dataset.tab : 'js';
        const requiredExt = ({ js: '.js', html: '.html', css: '.css', json: '.json' })[mode] || '.js';
        const fullNewName = new RegExp(`\\${requiredExt}$`, 'i').test(newName)
            ? newName
            : newName.replace(/\.(js|html|css|json)$/i, '') + requiredExt;
        const sourceCode = (window.editors?.[mode] || this.editor).getValue();

        if (typeof AssetsPanel !== 'undefined' && typeof AssetsPanel.updateScriptAsset === 'function') {
            if (!this.activeScriptAsset.folderId && typeof AssetsPanel.ensureScriptsFolder === 'function') {
                this.activeScriptAsset.folderId = AssetsPanel.ensureScriptsFolder();
            }
            const success = AssetsPanel.updateScriptAsset(this.activeScriptAsset.id, fullNewName, sourceCode);
            if (success) {
                showStatus(`✓ Asset '${fullNewName}' updated`);
                this.activeScriptAsset = AssetsPanel._findById(this.activeScriptAsset.id);
                this.setState('edit_asset_script');
                if (explorerManager && typeof explorerManager.refreshFromAssets === 'function') {
                    explorerManager.refreshFromAssets();
                }
            } else {
                showStatus("Failed to update asset.");
            }
        } else {
            showStatus("AssetsPanel not available.");
        }
    }

    setAttachTemplate() {
        const tpl =
            `// Attach this script to an existing object
class Rotator {
    constructor(object) {
        this.object = object;
        this.speed = 1.5;
        if(object.material) {
            this.initialColor = object.material.color.clone();
        }
    }

    start() {
        customConsole.log("Rotator attached to " + this.object.name);
    }

    update(delta, time) {
        this.object.rotation.y += delta * this.speed;
    }

    onDestroy() {
        customConsole.log("Rotator destroyed on " + this.object.name);
        if(this.object.material && this.initialColor) {
            this.object.material.color.copy(this.initialColor);
        }
    }
}
return Rotator;`;
        if (window.smMonacoEditor) window.smMonacoEditor.setValue(tpl);
        this.editor.setValue(tpl);
    }

    setCreateTemplate() {
        const tpl =
            `// Create a new object with this script
class MyNewObject {
    constructor() {
        const geometry = new THREE.TorusKnotGeometry(0.8, 0.25, 100, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            metalness: 0.8,
            roughness: 0.2
        });
        this.object = new THREE.Mesh(geometry, material);
        this.object.position.y = 1.5;
    }

    start() {
        customConsole.log(this.object.name + " created!");
    }

    update(delta, time) {
        this.object.rotation.x = time * 0.2;
        this.object.rotation.y = time * 0.3;
    }
}
return MyNewObject;`;
        if (window.smMonacoEditor) window.smMonacoEditor.setValue(tpl);
        this.editor.setValue(tpl);
    }

    loadScriptForObject(object) {
        this.activeScriptAsset = null;
        if (object) {
            this.activeObject = object;
            if (object.userData.scriptSourceCode) {
                if (window.smMonacoEditor) window.smMonacoEditor.setValue(object.userData.scriptSourceCode);
                this.editor.setValue(object.userData.scriptSourceCode);
                this.setState('edit_object_script');
            } else {
                this.setAttachTemplate();
                this.setState('attach_to_object');
            }
        } else {
            this.activeObject = null;
            this.setCreateTemplate();
            this.setState('create');
        }
        if (this.editor) this.editor.refresh();
    }

    loadScriptFromAsset(asset) {
        if (asset.type !== 'code' || !asset.data) {
            console.warn('Invalid asset:', asset);
            return;
        }
        this.activeObject = null;
        this.activeScriptAsset = asset;
        const ext = String(asset.name || '').split('.').pop().toLowerCase();
        const editorKey = ['js', 'html', 'css', 'json'].includes(ext) ? ext : 'js';
        const targetEditor = window.editors?.[editorKey] || this.editor;
        if (targetEditor && targetEditor !== this.editor) this.editor = targetEditor;

        syncEditorVisibility(editorKey);
        document.querySelectorAll('.editor-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.tab === editorKey);
        });

        if (window.smMonacoEditor && editorKey === 'js') {
            window.smMonacoEditor.setValue(asset.data);
        }
        this.editor.setValue(asset.data);
        this.setState('edit_asset_script');
    }
}

function syncEditorVisibility(editorKey = 'js') {
    const monacoHost = document.getElementById('monaco-editor-host');
    const hasMonaco = Boolean(window.smMonacoEditor && monacoHost);

    // Hide static dummy minimap overlay when Monaco is active
    const minimapOverlay = document.querySelector('#code-editor-panel .vs-minimap-overlay');
    if (minimapOverlay) {
        minimapOverlay.style.display = hasMonaco ? 'none' : '';
    }

    if (editorKey === 'js' && hasMonaco) {
        monacoHost.style.display = 'block';
        if (window.editors) {
            Object.values(window.editors).forEach(ed => {
                const w = ed?.getWrapperElement?.();
                if (w) w.style.display = 'none';
            });
        }
        try { window.smMonacoEditor.layout(); } catch (_) {}
    } else {
        if (monacoHost) monacoHost.style.display = 'none';
        if (window.editors) {
            Object.keys(window.editors).forEach(key => {
                const w = window.editors[key]?.getWrapperElement?.();
                if (w) {
                    w.style.display = (key === editorKey) ? 'block' : 'none';
                    if (key === editorKey) {
                        w.style.height = '100%';
                        setTimeout(() => window.editors[key]?.refresh?.(), 10);
                    }
                }
            });
        }
    }
}
window.syncEditorVisibility = syncEditorVisibility;
// =======================================================================

const FILE_ICONS = {
    folder: `<svg viewBox="0 0 16 16" fill="none"><path d="M7.25 4L6.75 3.5H1V12.5H15V4H7.25Z" fill="#dcb67a" stroke="#dcb67a"/></svg>`,
    folderOpen: `<svg viewBox="0 0 16 16" fill="none"><path d="M7.25 4L6.75 3.5H1V12.5H15V4H7.25Z" fill="#dcb67a" stroke="#dcb67a"/><path d="M1 5.5L2 13.5H15L14 5.5H1Z" fill="#e8c485" stroke="#e8c485"/></svg>`,
    js: `<svg viewBox="0 0 32 32"><path fill="#f7df1e" d="M0 0h32v32H0z"/><path fill="#000" d="M21.2 21.6c-.6-1.1-1.4-1.6-2.6-1.6-.9 0-1.6.4-1.6 1.3 0 1.2 1.8 1.6 3.1 2.2 1.9.9 2.7 2.1 2.7 3.9 0 2.8-2.3 4.2-5.5 4.2-2.5 0-4.4-.9-5.3-3.2l2.6-1.6c.4 1.2 1.3 2 2.7 2 .9 0 1.8-.4 1.8-1.5 0-1-.8-1.5-2.7-2.3-2.3-1-3.2-2.2-3.2-4.1 0-2.3 1.8-4 4.8-4 2.2 0 3.7.8 4.6 2.5l-2.4 1.6z"/></svg>`,
    html: `<svg viewBox="0 0 32 32"><path fill="#e34f26" d="M5 28l-2-24h26l-2 24-11 4z"/><path fill="#fff" d="M16 28v-3l8-3 1-18h-18l1 18 8 3z"/></svg>`,
    css: `<svg viewBox="0 0 32 32"><path fill="#1572b6" d="M5 28l-2-24h26l-2 24-11 4z"/><path fill="#fff" d="M16 28v-3l8-3 1-18h-18l1 18 8 3z"/></svg>`,
    json: `<svg viewBox="0 0 16 16"><path fill="#CBCB41" d="M4 3h2v2H4z"/><path fill="#858585" d="M2 1h12v14H2z"/></svg>`,
    default: `<svg viewBox="0 0 16 16"><path fill="#d4d4d4" d="M3 1h10v14H3z"/></svg>`
};

// =======================================================================
//  FIXED EXPLORER MANAGER (Handles Uploads & Reading)
// =======================================================================

class ExplorerManager {
    constructor() {
        // 1. Initialize Virtual File System with Default Files
        this.fileSystem = {
            name: "root",
            type: "folder",
            children: [],
            expanded: true
        };
        
        this.container = document.getElementById("explorer-tree");
        this.selectedNode = null;
        this.openNode = null;
        this.openEditorKey = 'js';
        
        // Populate default files to match your HTML tabs
        this.populateDefaultFiles();

        // Delay init to ensure DOM is ready
        setTimeout(() => this.init(), 100);
    }

    populateDefaultFiles() {
        this.fileSystem.children = [
            {
                name: "Logic.js",
                type: "file",
                content: "// Game Logic\nconsole.log('Engine Ready');",
                fileRef: null
            },
            {
                name: "Config.json",
                type: "file",
                content: "{\n\t\"version\": \"1.0\",\n\t\"debug\": true\n}",
                fileRef: null
            }
        ];
        this.syncFromAssets();
    }

    // Mirror code assets from AssetsPanel into the editor explorer. The
    // explorer remains useful for local uploads/default files, while saved
    // scripts become real, persistent project files under their asset folder.
    syncFromAssets() {
        if (typeof AssetsPanel === 'undefined' || !Array.isArray(AssetsPanel.assets)) return;

        // Drop the previous mirrored tree before rebuilding it, otherwise a
        // save/rename would add the same asset to the explorer repeatedly.
        this.fileSystem.children = (this.fileSystem.children || []).filter(
            (node) => !node.asset && !node.assetFolderId
        );

        const folderNodes = new Map();
        const ensureFolder = (folderId) => {
            if (!folderId) return this.fileSystem;
            if (folderNodes.has(folderId)) return folderNodes.get(folderId);
            const folder = AssetsPanel.folders?.[folderId];
            if (!folder) return this.fileSystem;
            const parentNode = ensureFolder(folder.parentId || null);
            const node = {
                name: folder.name,
                type: 'folder',
                children: [],
                expanded: folder.name.toLowerCase() === 'scripts',
                assetFolderId: folder.id
            };
            parentNode.children.push(node);
            folderNodes.set(folderId, node);
            return node;
        };

        AssetsPanel.assets
            .filter((asset) => asset && asset.type === 'code')
            .forEach((asset) => {
                const parent = ensureFolder(asset.folderId || null);
                parent.children.push({
                    name: asset.name,
                    type: 'file',
                    content: asset.data || '',
                    fileRef: null,
                    asset
                });
            });
    }

    init() {
        if (!this.container) return;
        this.setupUploadInputs();

        const searchInput = document.getElementById('explorer-search');
        if (searchInput && !searchInput.dataset.explorerBound) {
            searchInput.dataset.explorerBound = '1';
            searchInput.addEventListener('input', () => {
                this.filterVisibleNodes(searchInput.value);
            });
        }

        // --- Bind Sidebar header buttons (using the IDs from CodeEditorPanel.js) ---

        // New File button: creates a new .js file in explorer
        const newFileBtn = document.getElementById('new-file-btn');
        if (newFileBtn) newFileBtn.addEventListener('click', () => this.createNewFilePrompt());

        // New Folder button: creates a new folder node in explorer
        const newFolderBtn = document.getElementById('new-folder-btn');
        if (newFolderBtn) newFolderBtn.addEventListener('click', () => this.createNewFolderPrompt());

        // Upload Files button: opens file picker
        const uploadFilesBtn = document.getElementById('upload-files-btn');
        if (uploadFilesBtn) uploadFilesBtn.addEventListener('click', () => {
            const inp = document.getElementById('hidden-file-input');
            if (inp) inp.click();
        });

        // Refresh explorer
        const refreshBtn = document.getElementById('refresh-explorer-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshFromAssets());

        // Collapse All
        const collapseBtn = document.getElementById('collapse-explorer-btn');
        if (collapseBtn) collapseBtn.addEventListener('click', () => {
            const collapseNode = (node) => {
                if (node.type === 'folder') node.expanded = false;
                if (node.children) node.children.forEach(collapseNode);
            };
            this.fileSystem.children.forEach(collapseNode);
            this.render();
        });

        this.refreshFromAssets();
    }

    refreshFromAssets() {
        this.syncFromAssets();
        this.render();
    }

    // ... [Keep setupUploadInputs, handleFileUpload, handleFolderUpload, addFileToTree same as before] ...
    // For brevity, I am skipping the upload logic here as it was correct in previous version. 
    // Paste those methods here if you removed them.
    setupUploadInputs() {
        const existingFile = document.getElementById("hidden-file-input");
        if(existingFile) existingFile.remove();
        const existingFolder = document.getElementById("hidden-folder-input");
        if(existingFolder) existingFolder.remove();

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.id = "hidden-file-input";
        fileInput.multiple = true;
        fileInput.style.display = "none";
        fileInput.onchange = (e) => this.handleFileUpload(e.target.files);
        document.body.appendChild(fileInput);

        const folderInput = document.createElement("input");
        folderInput.type = "file";
        folderInput.id = "hidden-folder-input";
        folderInput.webkitdirectory = true;
        folderInput.style.display = "none";
        folderInput.onchange = (e) => this.handleFolderUpload(e.target.files);
        document.body.appendChild(folderInput);
    }

    handleFolderUpload(fileList) {
        Array.from(fileList).forEach(file => {
            const pathParts = file.webkitRelativePath.split('/');
            this.addFileToTree(this.fileSystem, pathParts, file);
        });
        this.render();
    }

    handleFileUpload(fileList) {
        Array.from(fileList).forEach(file => {
            const fileNode = { name: file.name, type: "file", content: null, fileRef: file };
            this.fileSystem.children.push(fileNode);
        });
        this.render();
    }

    addFileToTree(root, pathParts, fileRef) {
        let currentFolder = root;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            let existing = currentFolder.children.find(c => c.name === part && c.type === 'folder');
            if (!existing) {
                existing = { name: part, type: "folder", children: [], expanded: false };
                currentFolder.children.push(existing);
            }
            currentFolder = existing;
        }
        const fileName = pathParts[pathParts.length - 1];
        if (!currentFolder.children.find(c => c.name === fileName)) {
            currentFolder.children.push({ name: fileName, type: "file", content: null, fileRef: fileRef });
        }
    }

    createNewFilePrompt(parentFolder = null) {
        const name = prompt('New file name (e.g. MyScript.js):');
        if (!name || !name.trim()) return;
        const cleanName = name.trim().includes('.') ? name.trim() : name.trim() + '.js';
        const newNode = { name: cleanName, type: 'file', content: '// New Script\n', fileRef: null };
        const target = parentFolder || this._getSelectedFolder() || this.fileSystem;
        if (!target.children) target.children = [];
        target.children.push(newNode);
        if (target !== this.fileSystem) target.expanded = true;
        this.render();
        this.openFileInEditor(newNode);
    }

    createNewFolderPrompt(parentFolder = null) {
        const name = prompt('New folder name:');
        if (!name || !name.trim()) return;
        const newNode = { name: name.trim(), type: 'folder', children: [], expanded: true };
        const target = parentFolder || this._getSelectedFolder() || this.fileSystem;
        if (!target.children) target.children = [];
        target.children.push(newNode);
        if (target !== this.fileSystem) target.expanded = true;
        this.selectedNode = newNode;
        this.render();
    }

    // Returns the currently selected folder node (or null if a file is selected)
    _getSelectedFolder() {
        if (!this.selectedNode) return null;
        if (this.selectedNode.type === 'folder') return this.selectedNode;
        // Find the parent folder of the selected file
        const findParent = (folder, target) => {
            if (!folder.children) return null;
            if (folder.children.includes(target)) return folder;
            for (const child of folder.children) {
                const found = findParent(child, target);
                if (found) return found;
            }
            return null;
        };
        return findParent(this.fileSystem, this.selectedNode);
    }

    // --- RENDERING ---
    render() {
        this.container.innerHTML = "";
        this.sortTree(this.fileSystem);
        this.fileSystem.children.forEach(child => {
            this.container.appendChild(this.createDOMNode(child, 0));
        });
    }

    sortTree(folder) {
        if (!folder.children) return;
        folder.children.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === "folder" ? -1 : 1;
        });
        folder.children.forEach(c => { if (c.type === "folder") this.sortTree(c); });
    }

    createDOMNode(node, level) {
        const wrapper = document.createElement("div");
        wrapper.className = "tree-item-wrapper";

        const row = document.createElement("div");
        row.className = "tree-node";
        row.style.paddingLeft = "2px";

        if (node === this.selectedNode) row.classList.add("focused");

        // 1. Arrow
        const arrow = document.createElement("div");
        arrow.className = "tree-arrow";
        if (node.type === "folder") {
            arrow.textContent = "▶";
            if (node.expanded) arrow.classList.add("rotated");
        }
        row.appendChild(arrow);

        // 2. Icon
        const icon = document.createElement("div");
        icon.className = "tree-icon";
        icon.innerHTML = this.getIconSVG(node);
        row.appendChild(icon);

        // 3. Label (double-click to rename)
        const label = document.createElement("span");
        label.className = "tree-label";
        label.textContent = node.name;
        label.ondblclick = (e) => {
            e.stopPropagation();
            const newName = prompt('Rename:', node.name);
            if (newName && newName.trim() && newName.trim() !== node.name) {
                node.name = newName.trim();
                this.render();
            }
        };
        row.appendChild(label);

        // 4. Inline actions (Delete button shown on hover via CSS :hover)
        const actions = document.createElement("div");
        actions.className = "tree-node-actions";
        if (node.type === 'folder') {
            const addFileInFolder = document.createElement('button');
            addFileInFolder.className = 'tree-action-btn';
            addFileInFolder.title = 'New File';
            addFileInFolder.innerHTML = '<i class="fas fa-file-alt" style="font-size:9px;"></i>';
            addFileInFolder.onclick = (e) => { e.stopPropagation(); this.createNewFilePrompt(node); };
            const addFolderInFolder = document.createElement('button');
            addFolderInFolder.className = 'tree-action-btn';
            addFolderInFolder.title = 'New Folder';
            addFolderInFolder.innerHTML = '<i class="fas fa-folder-plus" style="font-size:9px;"></i>';
            addFolderInFolder.onclick = (e) => { e.stopPropagation(); this.createNewFolderPrompt(node); };
            actions.appendChild(addFileInFolder);
            actions.appendChild(addFolderInFolder);
        }
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tree-action-btn tree-action-delete';
        deleteBtn.title = 'Delete';
        deleteBtn.innerHTML = '<i class="fas fa-times" style="font-size:9px;"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (!confirm(`Delete "${node.name}"?`)) return;
            const removeFromParent = (folder, target) => {
                if (!folder.children) return false;
                const idx = folder.children.indexOf(target);
                if (idx !== -1) { folder.children.splice(idx, 1); return true; }
                return folder.children.some(c => c.type === 'folder' && removeFromParent(c, target));
            };
            removeFromParent(this.fileSystem, node);
            if (this.selectedNode === node) this.selectedNode = null;
            this.render();
        };
        actions.appendChild(deleteBtn);
        row.appendChild(actions);

        wrapper.appendChild(row);

        // Click Logic
        row.onclick = (e) => {
            e.stopPropagation();
            this.handleNodeClick(node, row, childrenContainer);
        };
        
        return wrapper;
    }

    createNewFilePrompt(parentFolder = null) {
        const name = prompt('New file name (e.g. MyScript.js):');
        if (!name || !name.trim()) return;
        const cleanName = name.trim().includes('.') ? name.trim() : name.trim() + '.js';
        const newNode = { name: cleanName, type: 'file', content: '// New Script\n', fileRef: null };
        const target = parentFolder || this._getSelectedFolder() || this.fileSystem;
        if (!target.children) target.children = [];
        target.children.push(newNode);
        if (target !== this.fileSystem) target.expanded = true;
        this.render();
        this.openFileInEditor(newNode);
    }

    createNewFolderPrompt(parentFolder = null) {
        const name = prompt('New folder name:');
        if (!name || !name.trim()) return;
        const newNode = { name: name.trim(), type: 'folder', children: [], expanded: true };
        const target = parentFolder || this._getSelectedFolder() || this.fileSystem;
        if (!target.children) target.children = [];
        target.children.push(newNode);
        if (target !== this.fileSystem) target.expanded = true;
        this.selectedNode = newNode;
        this.render();
    }

    // Returns the currently selected folder node (or null if a file is selected)
    _getSelectedFolder() {
        if (!this.selectedNode) return null;
        if (this.selectedNode.type === 'folder') return this.selectedNode;
        // Find the parent folder of the selected file
        const findParent = (folder, target) => {
            if (!folder.children) return null;
            if (folder.children.includes(target)) return folder;
            for (const child of folder.children) {
                const found = findParent(child, target);
                if (found) return found;
            }
            return null;
        };
        return findParent(this.fileSystem, this.selectedNode);
    }

    // --- RENDERING ---
    render() {
        this.container.innerHTML = "";
        this.sortTree(this.fileSystem);
        this.fileSystem.children.forEach(child => {
            this.container.appendChild(this.createDOMNode(child, 0));
        });
    }

    sortTree(folder) {
        if (!folder.children) return;
        folder.children.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === "folder" ? -1 : 1;
        });
        folder.children.forEach(c => { if (c.type === "folder") this.sortTree(c); });
    }

    createDOMNode(node, level) {
        const wrapper = document.createElement("div");
        wrapper.className = "tree-item-wrapper";

        const row = document.createElement("div");
        row.className = "tree-node";
        row.style.paddingLeft = "2px";
        row.tabIndex = 0;
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-label', node.name);

        if (node === this.selectedNode) row.classList.add("focused");

        // 1. Arrow
        const arrow = document.createElement("div");
        arrow.className = "tree-arrow";
        if (node.type === "folder") {
            arrow.textContent = "▶";
            if (node.expanded) arrow.classList.add("rotated");
        }
        row.appendChild(arrow);

        // 2. Icon
        const icon = document.createElement("div");
        icon.className = "tree-icon";
        icon.innerHTML = this.getIconSVG(node);
        row.appendChild(icon);

        // 3. Label (double-click to rename)
        const label = document.createElement("span");
        label.className = "tree-label";
        label.textContent = node.name;
        label.ondblclick = (e) => {
            e.stopPropagation();
            const newName = prompt('Rename:', node.name);
            if (newName && newName.trim() && newName.trim() !== node.name) {
                node.name = newName.trim();
                this.render();
            }
        };
        row.appendChild(label);

        // 4. Inline actions (Delete button shown on hover via CSS :hover)
        const actions = document.createElement("div");
        actions.className = "tree-node-actions";
        if (node.type === 'folder') {
            const addFileInFolder = document.createElement('button');
            addFileInFolder.className = 'tree-action-btn';
            addFileInFolder.title = 'New File';
            addFileInFolder.innerHTML = '<i class="fas fa-file-alt" style="font-size:9px;"></i>';
            addFileInFolder.onclick = (e) => { e.stopPropagation(); this.createNewFilePrompt(node); };
            const addFolderInFolder = document.createElement('button');
            addFolderInFolder.className = 'tree-action-btn';
            addFolderInFolder.title = 'New Folder';
            addFolderInFolder.innerHTML = '<i class="fas fa-folder-plus" style="font-size:9px;"></i>';
            addFolderInFolder.onclick = (e) => { e.stopPropagation(); this.createNewFolderPrompt(node); };
            actions.appendChild(addFileInFolder);
            actions.appendChild(addFolderInFolder);
        }
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tree-action-btn tree-action-delete';
        deleteBtn.title = 'Delete';
        deleteBtn.innerHTML = '<i class="fas fa-times" style="font-size:9px;"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (!confirm(`Delete "${node.name}"?`)) return;
            const removeFromParent = (folder, target) => {
                if (!folder.children) return false;
                const idx = folder.children.indexOf(target);
                if (idx !== -1) { folder.children.splice(idx, 1); return true; }
                return folder.children.some(c => c.type === 'folder' && removeFromParent(c, target));
            };
            removeFromParent(this.fileSystem, node);
            if (this.selectedNode === node) this.selectedNode = null;
            this.render();
        };
        actions.appendChild(deleteBtn);
        row.appendChild(actions);

        wrapper.appendChild(row);

        // Click Logic
        row.onclick = (e) => {
            e.stopPropagation();
            this.handleNodeClick(node, row, childrenContainer);
        };

        row.onkeydown = (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            this.handleNodeClick(node, row, childrenContainer);
        };
        
        // 4. Children Container
        let childrenContainer;
        if (node.type === "folder") {
            childrenContainer = document.createElement("div");
            childrenContainer.className = "tree-children";
            if (node.expanded) childrenContainer.classList.add("open");
            
            if (node.children) {
                node.children.forEach(child => {
                    childrenContainer.appendChild(this.createDOMNode(child, level + 1));
                });
            }
            wrapper.appendChild(childrenContainer);
        }

        return wrapper;
    }

    handleNodeClick(node, rowElement, childrenContainer) {
        const allNodes = this.container.querySelectorAll(".tree-node");
        allNodes.forEach(n => n.classList.remove("focused"));
        rowElement.classList.add("focused");
        this.selectedNode = node;

        if (node.type === "folder") {
            node.expanded = !node.expanded;
            const arrow = rowElement.querySelector(".tree-arrow");
            if (node.expanded) {
                childrenContainer.classList.add("open");
                arrow.classList.add("rotated");
                rowElement.querySelector(".tree-icon").innerHTML = FILE_ICONS.folderOpen;
            } else {
                childrenContainer.classList.remove("open");
                arrow.classList.remove("rotated");
                rowElement.querySelector(".tree-icon").innerHTML = FILE_ICONS.folder;
            }
        } else {
            this.openFileInEditor(node);
        }
    }

    getIconSVG(node) {
        if (node.type === "folder") return node.expanded ? FILE_ICONS.folderOpen : FILE_ICONS.folder;
        const ext = node.name.split('.').pop().toLowerCase();
        return FILE_ICONS[ext] || FILE_ICONS.default;
    }

    _captureOpenFileContent() {
        const node = this.openNode;
        if (!node || node.type !== 'file') return;

        const editorKey = this.openEditorKey || 'js';
        let value = null;

        if (editorKey === 'js' && window.smMonacoEditor?.getValue) {
            value = window.smMonacoEditor.getValue();
        } else {
            value = window.editors?.[editorKey]?.getValue?.() ?? null;
        }

        if (typeof value === 'string') node.draftContent = value;
    }

    async _readFileNode(node) {
        if (typeof node.draftContent === 'string') return node.draftContent;
        if (typeof node.content === 'string') return node.content;
        if (!node.fileRef) return '';

        try {
            if (typeof node.fileRef.text === 'function') {
                node.content = await node.fileRef.text();
                return node.content;
            }

            node.content = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(reader.error);
                reader.readAsText(node.fileRef);
            });
            return node.content;
        } catch (error) {
            console.error('[Explorer] Unable to read file:', node.name, error);
            window.customConsole?.error?.(`Unable to open ${node.name}: ${error.message || error}`);
            return '';
        }
    }

    _editorKeyForNode(node) {
        const extension = String(node?.name || '').split('.').pop().toLowerCase();
        return ['js', 'html', 'css', 'json'].includes(extension) ? extension : 'js';
    }

    _setActiveEditorTab(editorKey) {
        document.querySelectorAll('#code-editor-panel .editor-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === editorKey);
        });

        const language = { js: 'JavaScript', html: 'HTML', css: 'CSS', json: 'JSON' };
        const label = document.getElementById('lang-mode');
        if (label) label.textContent = language[editorKey] || 'Text';
    }

    async openFileInEditor(node) {
        if (!node || node.type !== 'file') return false;

        this._captureOpenFileContent();
        this.selectedNode = node;

        const editorKey = this._editorKeyForNode(node);
        const content = node.asset
            ? (typeof node.draftContent === 'string' ? node.draftContent : (node.asset.data || ''))
            : await this._readFileNode(node);

        const editor = window.editors?.[editorKey];
        const source = document.getElementById(`${editorKey}-editor`);
        if (source) source.value = content;

        window.syncEditorVisibility?.(editorKey);
        this._setActiveEditorTab(editorKey);

        if (editorKey === 'js' && window.smMonacoEditor?.setValue) {
            if (window.smMonacoEditor.getValue() !== content) {
                window.smMonacoEditor.setValue(content);
            }
        } else if (editor?.setValue) {
            editor.setOption?.('readOnly', false);
            if (editor.getValue() !== content) editor.setValue(content);
        }

        const manager = window.codeEditorManager;
        if (manager) {
            manager.editor = editor || manager.editor;
            manager.activeObject = null;
            manager.activeScriptAsset = node.asset || null;

            if (node.asset) {
                manager.setState?.('edit_asset_script');
            } else {
                manager.setState?.('create');
                const status = document.getElementById('editing-status');
                if (status) status.textContent = `Editing file: ${node.name}`;
            }
        }

        const filename = document.getElementById('filename-input');
        if (filename) filename.value = node.name;

        this.openNode = node;
        this.openEditorKey = editorKey;
        this.render();

        requestAnimationFrame(() => {
            if (editorKey === 'js' && window.smMonacoEditor?.focus) {
                window.smMonacoEditor.focus();
                window.smMonacoEditor.layout?.();
            } else {
                editor?.refresh?.();
                editor?.focus?.();
            }
        });

        return true;
    }

    filterVisibleNodes(term = '') {
        const query = String(term).trim().toLowerCase();
        const filterWrapper = (wrapper) => {
            const row = wrapper.querySelector(':scope > .tree-node');
            const label = row?.querySelector('.tree-label')?.textContent?.toLowerCase() || '';
            const children = Array.from(wrapper.querySelectorAll(':scope > .tree-children > .tree-item-wrapper'));
            const childMatch = children.map(filterWrapper).some(Boolean);
            const matches = !query || label.includes(query) || childMatch;

            wrapper.hidden = !matches;
            const childrenContainer = wrapper.querySelector(':scope > .tree-children');
            if (query && childMatch && childrenContainer) childrenContainer.classList.add('open');
            return matches;
        };

        Array.from(this.container?.children || []).forEach(filterWrapper);
    }

}

const customConsole = {
    log: (m) => appendToConsole(m, 'info'),
    error: (m) => appendToConsole(m, 'error'),
    warn: (m) => appendToConsole(m, 'warning'),
    clear: () => {
        const consoleContent = document.getElementById('console-content');
        if (consoleContent) consoleContent.innerHTML = '';
    }
};
window.customConsole = customConsole;

function appendToConsole(message, type = 'info') {
    const consoleContent = document.getElementById('console-content');
    if (!consoleContent) return;
    const line = document.createElement('div');
    line.className = `console-line console-${type}`;
    const text = message.stack ? message.stack : (typeof message === 'object' ? JSON.stringify(message, null, 2) : message);
    line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    consoleContent.appendChild(line);
    consoleContent.scrollTop = consoleContent.scrollHeight;
}

function showEnhancedError(error) {
    console.error('Full script error:', error);
    const message = error.stack || error.message || String(error);
    customConsole.error(`${message}`);
    showStatus(`Execution failed: ${message.split('\n')[0]}`);
}

function showStatus(message) {
    const statusBar = document.querySelector('.status-bar-code');
    if (statusBar) {
        statusBar.textContent = message;
        setTimeout(() => {
            if (statusBar.textContent === message) {
                statusBar.textContent = 'Ready';
            }
        }, 5000);
    }
}

function updateConsoleFooter(errors, warnings, infos) {
    const errorEl = document.getElementById("error-count");
    if (errorEl) errorEl.textContent = `${errors} Errors`;

    const warningEl = document.getElementById("warning-count");
    if (warningEl) warningEl.textContent = `${warnings} Warnings`;

    const infoEl = document.getElementById("info-count");
    if (infoEl) infoEl.textContent = `${infos} Info`;

    const lastRunEl = document.getElementById("last-run");
    if (lastRunEl) lastRunEl.textContent = "Last run: " + new Date().toLocaleTimeString();
}

let editors = {};
let codeEditorManager;

// =======================================================================
// PART 6: ADVANCED TOOLBAR & FEATURES
// =======================================================================

function setupAdvancedToolbar() {
    document.getElementById('undo-btn')?.addEventListener('click', () => {
        if (editors.js) {
            editors.js.undo();
            customConsole.log('Undo performed');
        }
    });

    document.getElementById('redo-btn')?.addEventListener('click', () => {
        if (editors.js) {
            editors.js.redo();
            customConsole.log('Redo performed');
        }
    });

    document.getElementById('cut-btn')?.addEventListener('click', () => {
        if (editors.js) {
            const selection = editors.js.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection).then(() => {
                    editors.js.replaceSelection('');
                    customConsole.log('Text cut to clipboard');
                }).catch(err => {
                    customConsole.error('Failed to cut: ' + err.message);
                });
            }
        }
    });

    document.getElementById('copy-btn')?.addEventListener('click', () => {
        if (editors.js) {
            const selection = editors.js.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection).then(() => {
                    customConsole.log('Text copied to clipboard');
                }).catch(err => {
                    customConsole.error('Failed to copy: ' + err.message);
                });
            }
        }
    });

    document.getElementById('paste-btn')?.addEventListener('click', async () => {
        if (editors.js) {
            try {
                const text = await navigator.clipboard.readText();
                editors.js.replaceSelection(text);
                customConsole.log('Text pasted from clipboard');
            } catch (err) {
                customConsole.error('Failed to read clipboard: ' + err.message);
            }
        }
    });

    document.getElementById('find-btn')?.addEventListener('click', () => {
        if (editors.js) {
            editors.js.execCommand('find');
            customConsole.log('Find dialog opened');
        }
    });

    document.getElementById('replace-btn')?.addEventListener('click', () => {
        if (editors.js) {
            editors.js.execCommand('replace');
            customConsole.log('Replace dialog opened');
        }
    });

    document.getElementById('format-btn')?.addEventListener('click', () => {
        if (codeEditorManager) {
            codeEditorManager.formatCode();
        }
    });

    document.getElementById('comment-btn')?.addEventListener('click', () => {
        if (editors.js) {
            editors.js.toggleComment();
            customConsole.log('Comment toggled');
        }
    });

    document.getElementById('validate-btn')?.addEventListener('click', () => {
        if (editors.js) {
            try {
                const code = editors.js.getValue();
                new Function(code);
                customConsole.log('✓ Code syntax is valid');
                showStatus('Code validation passed');
            } catch (e) {
                customConsole.error('✗ Syntax error: ' + e.message);
                showStatus('Code validation failed');
            }
        }
    });

    let wordWrapEnabled = false;
    document.getElementById('word-wrap-btn')?.addEventListener('click', function () {
        if (editors.js) {
            wordWrapEnabled = !wordWrapEnabled;
            editors.js.setOption('lineWrapping', wordWrapEnabled);
            this.classList.toggle('active', wordWrapEnabled);
            customConsole.log(`Word wrap ${wordWrapEnabled ? 'enabled' : 'disabled'}`);
        }
    });

    let minimapEnabled = false;
    document.getElementById('minimap-btn')?.addEventListener('click', function () {
        minimapEnabled = !minimapEnabled;
        this.classList.toggle('active', minimapEnabled);
        customConsole.log(`Minimap ${minimapEnabled ? 'enabled' : 'disabled'}`);
    });

    document.getElementById('font-size-select')?.addEventListener('change', (e) => {
        if (editors.js) {
            const fontSize = e.target.value + 'px';
            const cmElements = document.querySelectorAll('.CodeMirror');
            cmElements.forEach(el => el.style.fontSize = fontSize);
            editors.js.refresh();
            customConsole.log(`Font size changed to ${fontSize}`);
        }
    });

    document.getElementById('theme-select')?.addEventListener('change', (e) => {
        if (editors.js) {
            const theme = e.target.value;
            Object.values(editors).forEach(editor => {
                if (editor) editor.setOption('theme', theme);
            });
            customConsole.log(`Theme changed to ${theme}`);
        }
    });

    // new-file-btn is now handled by ExplorerManager.init() — do not double-bind
    // (kept as a fallback if explorerManager isn't ready yet)
    document.getElementById('new-file-btn')?.addEventListener('click', () => {
        if (window.explorerManager) {
            window.explorerManager.createNewFilePrompt();
        } else if (confirm('Create new file? Unsaved changes will be lost.')) {
            if (codeEditorManager) {
                codeEditorManager.setCreateTemplate();
                codeEditorManager.setState('create');
                customConsole.log('New file created');
            }
        }
    });

    document.getElementById('new-folder-btn')?.addEventListener('click', () => {
        if (window.explorerManager) {
            window.explorerManager.createNewFolderPrompt();
        }
    });

    document.getElementById('upload-files-btn')?.addEventListener('click', () => {
        const inp = document.getElementById('hidden-file-input');
        if (inp) inp.click();
    });

    document.getElementById('save-file-btn')?.addEventListener('click', () => {
        const manager = codeEditorManager || window.codeEditorManager;
        if (!manager) {
            console.error('Code editor save requested before the editor manager was initialized.');
            showStatus('Code editor is still initializing. Try Save again.');
            return;
        }
        if (manager.saveToCurrentAssetButton.style.display !== 'none') {
            manager.saveToCurrentAssetButton.click();
        } else if (manager.saveAsNewAssetButton.style.display !== 'none') {
            manager.saveAsNewAssetButton.click();
        } else {
            showStatus('Nothing to save in the current editor state.');
        }
    });

    document.querySelectorAll('.console-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.console-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const consoleType = this.getAttribute('data-console');
            customConsole.log(`Switched to ${consoleType} view`);
        });
    });

    document.getElementById('filter-console')?.addEventListener('click', () => {
        customConsole.log('Console filter functionality');
    });

    // Both IDs used in different HTML versions
    document.getElementById('clear-console')?.addEventListener('click', () => customConsole.clear());
    document.getElementById('clear-console-vs')?.addEventListener('click', () => customConsole.clear());

    // Keep the viewport frame control focused on framing; script execution has
    // its own explicit Run / Stop controls in the code toolbar.
    const runOnSelectedBtn = document.getElementById('scripting-frame-selected');
    if (runOnSelectedBtn) {
        runOnSelectedBtn.title = 'Frame selected object in viewport';
    }

    // Selected-object scripting is the primary workflow. The controls are
    // created once here because older saved layouts do not contain them.
    let compileBtn = document.getElementById('compile-on-selected-btn');
    const createObjBtn = document.getElementById('create-object-btn');

    if (!compileBtn && createObjBtn?.parentElement) {
        compileBtn = document.createElement('button');
        compileBtn.id = 'compile-on-selected-btn';
        compileBtn.className = 'vs-btn-primary';
        compileBtn.style.cssText = 'margin-left:6px;';
        createObjBtn.parentElement.insertBefore(
            compileBtn,
            createObjBtn.nextSibling
        );
    }

    let stopBtn = document.getElementById('stop-selected-script-btn');

    if (!stopBtn && compileBtn?.parentElement) {
        stopBtn = document.createElement('button');
        stopBtn.id = 'stop-selected-script-btn';
        stopBtn.className = 'vs-btn-danger';
        stopBtn.style.cssText = 'margin-left:4px;';
        compileBtn.insertAdjacentElement(
            'afterend',
            stopBtn
        );
    }

    let targetInfo = document.getElementById('selected-script-target-info');

    if (!targetInfo && stopBtn?.parentElement) {
        targetInfo = document.createElement('span');
        targetInfo.id = 'selected-script-target-info';
        targetInfo.style.cssText = 'margin-left:7px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b7b7b7;font-size:10px;';
        stopBtn.insertAdjacentElement(
            'afterend',
            targetInfo
        );
    }

    const getTargets = () => {
        const manager = window.codeEditorManager;
        return manager?._getScriptTargets?.(
            window.EditorAccess?.getSelectedObject?.()
        ) || [];
    };

    const refreshSelectedScriptControls = () => {
        const targets = getTargets();
        const count = targets.length;
        const label = count > 1
            ? `Run ${count} Selected`
            : 'Run Selected';

        if (compileBtn) {
            compileBtn.disabled = count === 0;
            compileBtn.title = count
                ? 'Compile and run this script on every selected object (Ctrl+Enter)'
                : 'Select an object in the viewport first';
            compileBtn.innerHTML = `<i class="fas fa-play"></i> ${label}`;
        }

        const attached = targets.filter(object =>
            !!object.userData?.scriptInstance
        );

        if (stopBtn) {
            stopBtn.disabled = attached.length === 0;
            stopBtn.title = 'Pause scripts on selected objects';
            stopBtn.innerHTML = '<i class="fas fa-pause"></i> Stop';
        }

        if (targetInfo) {
            targetInfo.textContent = count === 0
                ? 'No object selected'
                : count === 1
                    ? targets[0].name || 'Unnamed Object'
                    : `${count} objects selected`;
        }
    };

    window.refreshSelectedScriptControls =
        refreshSelectedScriptControls;

    if (compileBtn && compileBtn.dataset.smScriptRunBound !== '1') {
        compileBtn.dataset.smScriptRunBound = '1';
        compileBtn.addEventListener('click', () => {
            const manager = window.codeEditorManager;
            const targets = getTargets();

            if (!manager || !targets.length) {
                customConsole.warn('Select an object in the viewport first.');
                return;
            }

            if (targets.some(object => object.userData?.scriptSourceCode)) {
                manager.activeObject = targets[0];
                manager.handleApplyChanges();
            } else {
                manager.handleAttach();
            }

            targets.forEach(object =>
                scriptManager.setScriptEnabled(
                    object,
                    true
                )
            );

            refreshSelectedScriptControls();
        });
    }

    if (stopBtn && stopBtn.dataset.smScriptStopBound !== '1') {
        stopBtn.dataset.smScriptStopBound = '1';
        stopBtn.addEventListener('click', () => {
            const targets = getTargets().filter(object =>
                !!object.userData?.scriptInstance
            );

            targets.forEach(object =>
                scriptManager.setScriptEnabled(
                    object,
                    false
                )
            );

            if (targets.length) {
                showStatus(
                    targets.length === 1
                        ? `Paused script on '${targets[0].name}'`
                        : `Paused scripts on ${targets.length} selected objects`
                );
            }

            refreshSelectedScriptControls();
        });
    }

    refreshSelectedScriptControls();
}

function updateEditorStats(editor) {
    editor.on('cursorActivity', () => {
        const cursor = editor.getCursor();
        const lineColInfo = document.getElementById('line-col-info');
        if (lineColInfo) {
            lineColInfo.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
        }

        const selection = editor.getSelection();
        const selectionInfo = document.getElementById('selection-info');
        if (selectionInfo) {
            if (selection) {
                selectionInfo.textContent = `(${selection.length} selected)`;
            } else {
                selectionInfo.textContent = '';
            }
        }
    });

    editor.on('change', () => {
        const charCount = document.getElementById('char-count');
        if (charCount) {
            const content = editor.getValue();
            charCount.textContent = `${content.length} chars`;
        }
    });
}


// =======================================================================
// PART 7: MAIN INITIALIZATION
// =======================================================================
function initializeEditors() {
    // The app bootstrap may request a CodeMirror fallback after the engine has
    // already initialized the scripting workspace. Reusing the existing
    // instances prevents duplicate save listeners and lost editor content.
    if (window.__smCodeEditorsInitialized && window.editors?.js) {
        codeEditorManager = window.codeEditorManager || codeEditorManager;
        explorerManager = window.explorerManager || explorerManager;
        return;
    }

    // --- 1. IntelliSense Engine ---
    function customJSHint(editor) {
        const cursor = editor.getCursor();
        const token = editor.getTokenAt(cursor);
        const mode = editor.getMode().name;
        let completions = [];
        const prefix = token.string.replace(/['"<>{}\s]/g, '').toLowerCase();

        // Detect Language
        let language = 'js';
        if (mode.includes('html') || mode.includes('xml')) language = 'html';
        else if (mode.includes('css')) language = 'css';
        else if (mode.includes('json')) language = 'json';

        switch (language) {
            case 'html': completions = Object.keys(CodeMirror.htmlSchema || {}).map(tag => ({ displayText: tag, type: 'HTML Tag' })); break;
            case 'css': completions = Object.keys(CodeMirror.cssSchema || {}).map(prop => ({ displayText: prop, type: 'CSS Property' })); break;
            case 'js': 
                completions = Object.getOwnPropertyNames(window)
                    .concat(['console', 'document', 'THREE', 'customConsole', 'EditorAccess', 'EngineAPI', 'scene', 'camera', 'selectedObject', 'createObject', 'addObject', 'removeObject', 'playSound', 'Math', 'JSON'])
                    .map(k => ({ displayText: k, type: 'JS Global' })); 
                break;
            case 'json': completions = [{ displayText: '"id": ""', type: 'Key' }, { displayText: '"name": ""', type: 'Key' }]; break;
        }

        const filtered = completions.filter(c => c.displayText.toLowerCase().startsWith(prefix));
        return {
            list: filtered.map(item => ({
                ...item,
                render: (element, self, data) => {
                    const main = document.createElement('span');
                    main.className = `cm-hint-main type-${data.type.replace(/\s+/g, '-').toLowerCase()}`;
                    main.textContent = data.displayText;
                    const meta = document.createElement('span');
                    meta.className = 'cm-hint-meta';
                    meta.textContent = data.type;
                    element.appendChild(main);
                    element.appendChild(meta);
                }
            })),
            from: CodeMirror.Pos(cursor.line, token.start),
            to: CodeMirror.Pos(cursor.line, token.end)
        };
    }

    // --- 2. Shared Config ---
    const commonOptions = {
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        styleActiveLine: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,   // Always use spaces, not tabs
        electricChars: false,    // Prevent auto-indent from swallowing keystrokes
        smartIndent: true,
        lineWrapping: false,
        readOnly: false,
        keyMap: 'default',       // Ensures Space bar is NOT intercepted
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-/": "toggleComment",
            // Tab inserts 4 spaces (or indents selection); does NOT intercept Space
            "Tab": function(cm) {
                if (cm.somethingSelected()) {
                    cm.indentSelection('add');
                } else {
                    // Insert 4 spaces at cursor position
                    var spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
                    cm.replaceSelection(spaces, "end", "+input");
                }
            },
            "Shift-Tab": function(cm) {
                cm.indentSelection('subtract');
            },
            "Ctrl-S": () => document.getElementById('save-file-btn')?.click()
        },
        hintOptions: { hint: customJSHint, completeSingle: false }
    };


    // --- 3. Create 4 Editor Instances ---
    editors = window.editors = {};

    const configs = [
        { id: 'js-editor', key: 'js', mode: { name: "javascript", json: true } },
        { id: 'html-editor', key: 'html', mode: "xml" },
        { id: 'css-editor', key: 'css', mode: "css" },
        { id: 'json-editor', key: 'json', mode: "application/json" }
    ];

    configs.forEach(conf => {
        const el = document.getElementById(conf.id);
        if (el) {
            window.editors[conf.key] = CodeMirror.fromTextArea(el, { ...commonOptions, mode: conf.mode });
            updateEditorStats(window.editors[conf.key]);
            
            // Hide all wrappers except JS initially
            window.editors[conf.key].getWrapperElement().style.display = (conf.key === 'js') ? 'block' : 'none';
        }
    });

    // --- 4. Initialize Managers ---
    if (hierarchyManager && hierarchyManager.init) hierarchyManager.init();

    // The enhanced manager is loaded after this base file in normal startup.
    // Fall back to the base manager if Scripting mode is opened while that
    // optional file is still loading; this prevents the whole editor boot
    // sequence from failing with "UniversalCodeEditorManager is not defined".
    if (window.editors.js) {
        const EditorManagerConstructor = window.UniversalCodeEditorManager ||
            (typeof UniversalCodeEditorManager !== 'undefined'
                ? UniversalCodeEditorManager
                : CodeEditorManager);
        codeEditorManager = new EditorManagerConstructor(window.editors.js);
        window.codeEditorManager = codeEditorManager;
        codeEditorManager.setState('create');
        const selected = EditorAccess.getSelectedObject();
        if (selected) codeEditorManager.loadScriptForObject(selected);
        window.__smCodeEditorsInitialized = true;
    }

    // Initialize Explorer Manager
    setTimeout(() => {
        explorerManager = new ExplorerManager();
        window.explorerManager = explorerManager;
        console.log("✅ Explorer System Ready");
    }, 200);

    // --- 5. UI Logic: Tab Switching ---
    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.tab;
            if (!window.editors[mode]) return;

            // Update UI Active State
            document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Hide/Show correct Editor Wrapper
            Object.keys(window.editors).forEach(key => {
                const wrapper = window.editors[key].getWrapperElement();
                if (key === mode) {
                    wrapper.style.display = 'block';
                    window.editors[key].refresh(); // Crucial: Fixes blank lines
                } else {
                    wrapper.style.display = 'none';
                }
            });

            // Update Language Display
            const langMode = document.getElementById('language-mode');
            if (langMode) {
                const names = { js: 'JavaScript', html: 'HTML', css: 'CSS', json: 'JSON' };
                langMode.textContent = names[mode] || 'Text';
            }
        });
    });

    // --- 6. Event Listeners & Integrations ---
    if (typeof setupAdvancedToolbar === 'function') setupAdvancedToolbar();

    if (EditorAccess && EditorAccess.transformControls) {
        EditorAccess.transformControls.addEventListener('objectChange', () => {
            const obj = EditorAccess.transformControls.object;
            if (window.codeEditorManager && obj) {
                const manager = window.codeEditorManager;
                if (manager.activeScriptAsset && !obj.userData?.scriptSourceCode) {
                    manager.activeObject = obj;
                    manager.setState('edit_asset_script', obj);
                } else {
                    manager.loadScriptForObject(obj);
                }
            }
            if (hierarchyManager && hierarchyManager.updateSelectionStyle) hierarchyManager.updateSelectionStyle();
        });
    }

    // Hierarchy/viewport selection does not always move TransformControls, so
    // listen to the engine's canonical selection event too. This keeps the
    // scripting editor attached to exactly the object the user selected.
    if (!window.__codeEditorSelectionBound) {
        const loadSelectedScript = (event) => {
            const object = event?.detail?.object || event?.detail?.activeObject || EditorAccess.getSelectedObject();
            const manager = window.codeEditorManager;
            if (!manager) return;
            // Preserve a loaded asset while choosing the destination object,
            // matching the Unity/Blender workflow: select script, select
            // object, then press Attach.
            if (object && manager.activeScriptAsset && !object.userData?.scriptSourceCode) {
                manager.activeObject = object;
                manager.setState('edit_asset_script', object);
            } else {
                manager.loadScriptForObject(object || null);
            }

            window.refreshSelectedScriptControls?.();
        };

        [
            'objectSelected',
            'selectionChanged',
            'sm:selection-changed',
            'sm:selected-object-changed'
        ].forEach(eventName =>
            window.addEventListener(
                eventName,
                loadSelectedScript
            )
        );

        if (window.selectionManager?.addEventListener) {
            window.selectionManager.addEventListener('selectionChanged', (event) => {
                loadSelectedScript({ detail: { object: event.activeObject || null } });
            });
        }
        window.__codeEditorSelectionBound = true;
    }

    // Global Test Cube button
    document.getElementById('run-test-cube')?.addEventListener('click', createCubeFromMenu);

    // Resize handlers
    if (typeof setupConsoleResize === 'function') setupConsoleResize();

    // Panel Closing
    document.getElementById('close-editor')?.addEventListener('click', () => {
        document.getElementById('code-editor-panel').style.display = 'none';
        const scene = document.querySelector('.editor-scene');
        if(scene) scene.style.visibility = 'visible';
    });

    if (typeof setupKeyboardShortcuts === 'function') setupKeyboardShortcuts();

    console.log("🚀 Code Editor System Fully Initialized");
    if (customConsole) customConsole.log('Visual Studio Style Editor Ready');
}

function setupConsoleResize() {
    const resizeHandle = document.querySelector('.resize-handle-console-code');
    const consolePanel = document.querySelector('.vs-bottom-panel');

    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const panelTop = consolePanel.getBoundingClientRect().top;
        const newHeight = window.innerHeight - e.clientY;

        if (newHeight > 80 && newHeight < window.innerHeight * 0.7) {
            consolePanel.style.height = `${newHeight}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = 'auto';
    });
}

function setupResizeHandlers() {
    let isResizingEdit = false;
    const resizeHandleEditor = document.querySelector('.resize-handle-Editor');
    const panel = document.getElementById('code-editor-panel');

    const startResize = () => {
        isResizingEdit = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    };

    const stopResize = () => {
        isResizingEdit = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    };

    const doResize = (e) => {
        if (!isResizingEdit) return;
        const newWidth = window.innerWidth - e.clientX;
        if (panel && newWidth > 300 && newWidth < window.innerWidth - 100) {
            panel.style.width = `${newWidth}px`;
            Object.values(editors).forEach(editor => {
                if (editor) editor.refresh();
            });
        }
    };

    if (resizeHandleEditor) {
        resizeHandleEditor.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
    }

    let isResizingTerminal = false;
    const splitContainer = document.querySelector(".split-container");
    const resizeHandleTerminal = document.querySelector(".resize-handle-console-code");

    if (resizeHandleTerminal) {
        resizeHandleTerminal.addEventListener("mousedown", (e) => {
            isResizingTerminal = true;
            document.body.style.cursor = "ns-resize";
        });
    }

    document.addEventListener("mousemove", (e) => {
        if (!isResizingTerminal || !splitContainer) return;
        const containerRect = splitContainer.getBoundingClientRect();
        const offsetY = e.clientY - containerRect.top;
        const newConsoleHeight = Math.min(
            Math.max(containerRect.height - offsetY, 100),
            window.innerHeight * 0.7
        );
        splitContainer.style.gridTemplateRows = `1fr ${newConsoleHeight}px`;
    });

    document.addEventListener("mouseup", () => {
        if (isResizingTerminal) {
            isResizingTerminal = false;
            document.body.style.cursor = "";
        }
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const panel = document.getElementById('code-editor-panel');

        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const saveBtn = document.getElementById('save-file-btn');
            if (saveBtn) saveBtn.click();
        }

        if (e.key === 'Escape' && panel?.classList.contains('open')) {
            panel.classList.remove('open');
        }

        if (e.ctrlKey && e.key === "`") {
            e.preventDefault();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            document.getElementById('toggle-editor')?.click();
        }
    });
}

function createCubeFromMenu() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
    const cube = new THREE.Mesh(geometry, material);
    cube.userData.selectable = true;
    const cubeName = "TestCube";

    if (typeof window.addObjectToScene === 'function') {
        window.addObjectToScene(cube, cubeName);
        customConsole.log(`Test cube '${cubeName}' created`);
    } else {
        console.error("addObjectToScene not found");
        customConsole.error("Failed to create test cube");
    }
}

if (typeof CodeMirror !== 'undefined') {
    console.log("✓ CodeMirror detected. Call initializeEditors() when ready.");
} else {
    console.warn("CodeMirror not loaded. Load CodeMirror before calling initializeEditors().");
}
