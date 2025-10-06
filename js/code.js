// =======================================================================
//  ADVANCED VS CODE-STYLE EDITOR WITH PROFESSIONAL FEATURES
//  Enhanced version with intellisense, diagnostics, and improved explorer
// =======================================================================

// =======================================================================
// PART 1: CORE SYSTEMS
// =======================================================================

const scriptManager = {
    scripts: [],
    registerScript: function(instance) {
        if (!instance || typeof instance.update !== 'function') {
            console.warn('Attempted to register an invalid script instance:', instance);
            return;
        }
        this.scripts.push(instance);
        if (typeof instance.start === 'function') {
            try {
                instance.start();
            } catch (e) {
                const name = instance.object?.name || 'Unknown Object';
                customConsole.error(`Error in start() for script on '${name}': ${e.message}`);
                console.error(e);
            }
        }
    },
    update: function(delta, time) {
        for (let i = this.scripts.length - 1; i >= 0; i--) {
            const script = this.scripts[i];
            try {
                script.update(delta, time);
            } catch (e) {
                const name = script.object?.name || 'Unknown Object';
                customConsole.error(`Error in update() for script on '${name}': ${e.message}. Script disabled.`);
                console.error(e);
                this.scripts.splice(i, 1);
            }
        }
    },
    removeScriptForObject: function(object) {
        if (!object || !object.userData.scriptInstance) return;
        if (typeof object.userData.scriptInstance.onDestroy === 'function') {
            try {
                object.userData.scriptInstance.onDestroy();
            } catch (e) {
                customConsole.error(`Error in onDestroy() for ${object.name}: ${e.message}`);
            }
        }
        this.scripts = this.scripts.filter(script => script !== object.userData.scriptInstance);
        delete object.userData.scriptInstance;
        delete object.userData.scriptSourceCode;
        delete object.userData.scriptClassName;
        console.log(`Script removed from ${object.name}`);
    }
};

const EditorAccess = {
    scene: null,
    camera: null,
    transformControls: null,
    init: function(s, c, t) {
        this.scene = s;
        this.camera = c;
        this.transformControls = t;
    },
    getSelectedObject: function() {
        return this.transformControls?.object || null;
    },
};

const hierarchyManager = {
    listElement: null,
    init: function() {
        this.listElement = document.getElementById('hierarchy-list');
        if (!this.listElement) console.warn("Hierarchy list element not found!");
    },
    updateSelectionStyle: function() {
        if (!this.listElement) return;
        const selected = EditorAccess.getSelectedObject();
        Array.from(this.listElement.children).forEach(child => {
            child.classList.toggle('selected', child.id === selected?.uuid);
        });
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
                members: ['scene', 'camera', 'transformControls', 'getSelectedObject']
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
               ['THREE', 'customConsole', 'EditorAccess'].includes(name);
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
            ['scene', 'camera', 'transformControls', 'getSelectedObject'].forEach(member => {
                completions.push({
                    text: member,
                    displayText: member,
                    type: member.includes('get') ? 'function' : 'property',
                    info: `EditorAccess.${member}`
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
                const beforeDot = cm.getRange({line: cur.line, ch: 0}, cur);
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

    showContextualCompletions(cm, context) {
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
            "Ctrl-D": () => this.duplicateLine(),
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
        this.editor.replaceRange('\n' + line, {line: cursor.line, ch: line.length});
        this.editor.setCursor({line: cursor.line + 1, ch: cursor.ch});
    }

    setState(mode) {
        this.createButton.style.display = 'none';
        this.attachButton.style.display = 'none';
        this.applyButton.style.display = 'none';
        this.detachButton.style.display = 'none';
        this.saveAsNewAssetButton.style.display = 'none';
        this.saveToCurrentAssetButton.style.display = 'none';
        this.filenameInput.disabled = false;

        this.activeObject = null;
        this.activeScriptAsset = null;

        const selectedObject = EditorAccess.getSelectedObject();

        switch (mode) {
            case 'create':
                this.statusDisplay.textContent = 'Mode: Create New Object';
                this.filenameInput.value = '';
                this.createButton.style.display = 'inline-block';
                this.saveAsNewAssetButton.style.display = 'inline-block';
                break;

            case 'attach_to_object':
                this.activeObject = selectedObject;
                this.statusDisplay.textContent = `Attaching to: ${this.activeObject.name || 'Unnamed'}`;
                this.filenameInput.value = this.activeObject.name || '';
                this.filenameInput.disabled = true;
                this.attachButton.style.display = 'inline-block';
                this.saveAsNewAssetButton.style.display = 'inline-block';
                break;

            case 'edit_object_script':
                this.activeObject = selectedObject;
                this.statusDisplay.textContent = `Editing Script: ${this.activeObject.name || 'Unnamed'}`;
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
                this.filenameInput.value = this.activeScriptAsset.name.replace(/\.js$/, '');
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
        if(this.editor) this.editor.refresh();
    }

    _compileAndInstantiate(sourceCode, targetObject = null) {
        customConsole.clear();

        const ScriptClass = new Function('THREE', 'customConsole', 'EditorAccess', ` "use strict"; ${sourceCode} `)(THREE, customConsole, EditorAccess);
        if (typeof ScriptClass !== 'function') throw new Error("Script must return a class.");
        const scriptInstance = targetObject ? new ScriptClass(targetObject) : new ScriptClass();
        const object3D = targetObject || scriptInstance.object;
        if (!(object3D instanceof THREE.Object3D)) throw new Error("Script class must have a '.object' property that is a THREE.Object3D.");
        object3D.userData = { ...object3D.userData, scriptInstance, scriptSourceCode: sourceCode, scriptClassName: ScriptClass.name };
        return { object3D, scriptInstance };
    }

    handleCreate() {
        try {
            const { object3D, scriptInstance } = this._compileAndInstantiate(this.editor.getValue());
            const objectName = this.filenameInput.value.trim() || `ScriptedObject`;
            object3D.userData.selectable = true;

            if (typeof window.addObjectToScene === 'function') {
                window.addObjectToScene(object3D, objectName);
            } else {
                console.error("'addObjectToScene' not found.");
                showStatus("Error: addObjectToScene() not found.");
                return;
            }

            scriptManager.registerScript(scriptInstance);
            showStatus(`✓ '${object3D.name}' created successfully`);
            this.loadScriptForObject(object3D);
        } catch (e) {
            showEnhancedError(e);
        }
    }

    handleAttach() {
        let targetObject = EditorAccess.getSelectedObject();
        if (!targetObject) {
            showStatus("Please select an object to attach the script.");
            return;
        }

        try {
            scriptManager.removeScriptForObject(targetObject);
            let sourceCode = this.activeScriptAsset ? this.activeScriptAsset.data : this.editor.getValue();

            const { object3D, scriptInstance } = this._compileAndInstantiate(sourceCode, targetObject);
            scriptManager.registerScript(scriptInstance);
            if(typeof window.updateHierarchy === 'function') window.updateHierarchy();

            this.activeScriptAsset = null;
            this.activeObject = object3D;
            this.loadScriptForObject(object3D);

            showStatus(`✓ Script attached to '${object3D.name}'`);
        } catch (e) {
            showEnhancedError(e);
            if (targetObject.userData.scriptSourceCode) {
                 this.loadScriptForObject(targetObject);
            } else {
                this.setAttachTemplate();
                this.setState('attach_to_object');
            }
        }
    }

    handleApplyChanges() {
        if (!this.activeObject) return;
        scriptManager.removeScriptForObject(this.activeObject);
        try {
            const { object3D, scriptInstance } = this._compileAndInstantiate(this.editor.getValue(), this.activeObject);
            scriptManager.registerScript(scriptInstance);
            if(typeof window.updateHierarchy === 'function') window.updateHierarchy();
            this.loadScriptForObject(object3D);
            showStatus(`✓ Changes applied to '${object3D.name}'`);
        } catch (e) {
            showEnhancedError(e);
            if (this.activeObject.userData.scriptSourceCode) {
                try {
                    const { object3D, scriptInstance } = this._compileAndInstantiate(this.activeObject.userData.scriptSourceCode, this.activeObject);
                    scriptManager.registerScript(scriptInstance);
                    showStatus("Error applying changes. Reverted to previous script.");
                } catch (revertError) {
                    this.setAttachTemplate();
                    this.setState('attach_to_object');
                    showStatus("Script detached due to critical error.");
                }
            }
        }
    }

    handleDetach() {
        if (!this.activeObject) return;
        customConsole.warn(`Detaching script from '${this.activeObject.name}'`);
        scriptManager.removeScriptForObject(this.activeObject);
        if(typeof window.updateHierarchy === 'function') window.updateHierarchy();

        this.activeScriptAsset = null;
        this.setAttachTemplate();
        this.setState('attach_to_object');
    }

    handleSaveAsNewAsset() {
        const scriptName = this.filenameInput.value.trim();
        if (!scriptName) {
            showStatus("Please enter a script name.");
            return;
        }
        const sourceCode = this.editor.getValue();

        if (typeof AssetsPanel !== 'undefined' && typeof AssetsPanel.addScriptAsset === 'function') {
            const newAsset = AssetsPanel.addScriptAsset(scriptName + '.js', sourceCode, AssetsPanel.openFolderId);
            if (newAsset) {
                showStatus(`✓ Script '${newAsset.name}' saved to Assets`);
                this.loadScriptFromAsset(newAsset);
            } else {
                showStatus("Failed to save script asset.");
            }
        } else {
            showStatus("AssetsPanel not available.");
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
        const fullNewName = newName.endsWith('.js') ? newName : newName + '.js';
        const sourceCode = this.editor.getValue();

        if (typeof AssetsPanel !== 'undefined' && typeof AssetsPanel.updateScriptAsset === 'function') {
            const success = AssetsPanel.updateScriptAsset(this.activeScriptAsset.id, fullNewName, sourceCode);
            if (success) {
                showStatus(`✓ Asset '${fullNewName}' updated`);
                this.activeScriptAsset = AssetsPanel._findById(this.activeScriptAsset.id);
                this.setState('edit_asset_script');
            } else {
                showStatus("Failed to update asset.");
            }
        } else {
            showStatus("AssetsPanel not available.");
        }
    }

    setAttachTemplate() {
        this.editor.setValue(
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
return Rotator;`);
    }

    setCreateTemplate() {
        this.editor.setValue(
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
return MyNewObject;`);
}

    loadScriptForObject(object) {
        this.activeScriptAsset = null;
        if (object) {
            this.activeObject = object;
            if (object.userData.scriptSourceCode) {
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
        if(this.editor) this.editor.refresh();
    }

    loadScriptFromAsset(asset) {
        if (asset.type !== 'code' || !asset.data) {
            console.warn('Invalid asset:', asset);
            return;
        }
        this.activeObject = null;
        this.activeScriptAsset = asset;
        this.editor.setValue(asset.data);
        this.setState('edit_asset_script');
        if(this.editor) this.editor.refresh();
        showStatus(`Loaded '${asset.name}' for editing`);
    }
}

// =======================================================================
// PART 4: IMPROVED EXPLORER LOGIC
// =======================================================================

class ExplorerManager {
    constructor() {
        this.state = {
            assets: ["main.js", "style.css"],
            scripts: ["player.js"],
            uploads: []
        };
        this.treeElement = null;
        this.init();
    }

    init() {
        this.treeElement = document.getElementById("explorer-tree");
        
        const uploadFileBtn = document.getElementById("upload-file-btn");
        const uploadFolderBtn = document.getElementById("upload-folder-btn");
        const addObjectBtn = document.getElementById("add-object-btn");

        if (!this.treeElement) {
            console.error("Explorer tree element not found!");
            return;
        }

        if (uploadFileBtn) {
            uploadFileBtn.addEventListener("click", () => this.addFile());
        }

        if (uploadFolderBtn) {
            uploadFolderBtn.addEventListener("click", () => this.addFolder());
        }

        if (addObjectBtn) {
            addObjectBtn.addEventListener("click", () => this.addObject());
        }

        this.render();
    }

    addFile() {
        const fileName = prompt("Enter file name (e.g., script.js):");
        if (fileName && fileName.trim()) {
            if (!this.state.uploads) this.state.uploads = [];
            this.state.uploads.push(fileName.trim());
            this.render();
            customConsole.log(`File '${fileName}' added to uploads`);
        }
    }

    addFolder() {
        const folderName = prompt("Enter folder name:");
        if (folderName && folderName.trim()) {
            this.state[folderName.trim()] = [];
            this.render();
            customConsole.log(`Folder '${folderName}' created`);
        }
    }

    addObject() {
        const objName = prompt("Enter object script name:");
        if (objName && objName.trim()) {
            if (!this.state.objects) this.state.objects = [];
            const fullName = objName.trim().endsWith('.js') ? objName.trim() : `${objName.trim()}.js`;
            this.state.objects.push(fullName);
            this.render();
            customConsole.log(`Object script '${fullName}' added`);
        }
    }

    buildTree() {
        let html = '<ul class="explorer-root">';
        
        for (let folder in this.state) {
            if (Array.isArray(this.state[folder])) {
                html += `<li class="folder-item" data-folder="${folder}">`;
                html += `<div class="folder-header">`;
                html += `<span class="folder-icon">▶</span>`;
                html += `<span class="folder-name">${folder}</span>`;
                html += `</div>`;
                html += `<ul class="folder-contents" style="display: none;">`;
                
                this.state[folder].forEach(file => {
                    const icon = this.getFileIcon(file);
                    html += `<li class="file-item" data-file="${file}" data-folder="${folder}">`;
                    html += `<span class="file-icon">${icon}</span>`;
                    html += `<span class="file-name">${file}</span>`;
                    html += `</li>`;
                });
                
                html += '</ul></li>';
            }
        }
        
        html += '</ul>';
        return html;
    }

    getFileIcon(fileName) {
        if (fileName.endsWith('.js')) return '📜';
        if (fileName.endsWith('.css')) return '🎨';
        if (fileName.endsWith('.html')) return '📄';
        if (fileName.endsWith('.json')) return '📋';
        return '📄';
    }

    bindEvents() {
        if (!this.treeElement) return;

        const folders = this.treeElement.querySelectorAll(".folder-item");
        folders.forEach(folder => {
            const header = folder.querySelector(".folder-header");
            const icon = folder.querySelector(".folder-icon");
            const contents = folder.querySelector(".folder-contents");
            
            if (header && icon && contents) {
                header.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const isOpen = contents.style.display !== "none";
                    
                    if (isOpen) {
                        contents.style.display = "none";
                        icon.textContent = "▶";
                        folder.classList.remove("open");
                    } else {
                        contents.style.display = "block";
                        icon.textContent = "▼";
                        folder.classList.add("open");
                    }
                });
            }
        });

         const files = this.treeElement.querySelectorAll(".file-item");
        files.forEach(file => {
            file.addEventListener("click", (e) => {
                e.stopPropagation();
        
                // Remove active state from all files
                this.treeElement.querySelectorAll(".file-item").forEach(f => {
                   f.classList.remove("active");
                });
        
                // Add active state to clicked file
                file.classList.add("active");
        
                const fileName = file.getAttribute("data-file");
                const folderName = file.getAttribute("data-folder");
        
                customConsole.log(`Opening file: ${fileName} from ${folderName}`);
        
                // NEW: Load file into editor
                this.loadFileInEditor(fileName, folderName);
            });
        });
       
    }

    loadFileInEditor(fileName, folderName) {
    if (!codeEditorManager || !editors.js) {
        customConsole.error('Editor not initialized');
        return;
    }

    // Determine file type and switch to appropriate editor tab
    const extension = fileName.split('.').pop().toLowerCase();
    let editorType = 'js';
    
    if (extension === 'html') editorType = 'html';
    else if (extension === 'css') editorType = 'css';
    
    // Switch to appropriate tab
    const targetTab = document.querySelector(`.editor-tab[data-tab="${editorType}"]`);
    if (targetTab) targetTab.click();
    
    // Get the appropriate editor
    const activeEditor = editors[editorType];
    if (!activeEditor) {
        customConsole.error(`No editor found for type: ${editorType}`);
        return;
    }
    
    // Load empty content or existing content (you can extend this to store file contents)
    const fileContent = this.getFileContent(fileName, folderName) || `// ${fileName}\n// Write your code here...\n`;
    
    activeEditor.setValue(fileContent);
    activeEditor.refresh();
    
    // Update filename input
    const filenameInput = document.getElementById('filename-input');
    if (filenameInput) {
        filenameInput.value = fileName.replace(/\.(js|css|html)$/, '');
    }
    
    customConsole.log(`Loaded ${fileName} into editor`);
}

getFileContent(fileName, folderName) {
    // Store file contents in state for persistence
    if (!this.fileContents) this.fileContents = {};
    
    const key = `${folderName}/${fileName}`;
    return this.fileContents[key] || '';
}

saveFileContent(fileName, folderName, content) {
    if (!this.fileContents) this.fileContents = {};
    
    const key = `${folderName}/${fileName}`;
    this.fileContents[key] = content;
}

    render() {
        if (!this.treeElement) return;
        this.treeElement.innerHTML = this.buildTree();
        this.bindEvents();
    }

    deleteFile(fileName, folderName) {
        if (this.state[folderName]) {
            const index = this.state[folderName].indexOf(fileName);
            if (index > -1) {
                this.state[folderName].splice(index, 1);
                this.render();
                customConsole.log(`Deleted file: ${fileName}`);
            }
        }
    }

    deleteFolder(folderName) {
        if (this.state[folderName]) {
            delete this.state[folderName];
            this.render();
            customConsole.log(`Deleted folder: ${folderName}`);
        }
    }
}

// Global explorer instance
let explorerManager = null;

// =======================================================================
// PART 5: UTILITIES AND HELPERS
// =======================================================================

const customConsole = {
    log: (m) => appendToConsole(m, 'info'),
    error: (m) => appendToConsole(m, 'error'),
    warn: (m) => appendToConsole(m, 'warning'),
    clear: () => {
        const consoleContent = document.getElementById('console-content');
        if (consoleContent) consoleContent.innerHTML = '';
    }
};

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
    if(warningEl) warningEl.textContent = `${warnings} Warnings`;

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
    document.getElementById('word-wrap-btn')?.addEventListener('click', function() {
        if (editors.js) {
            wordWrapEnabled = !wordWrapEnabled;
            editors.js.setOption('lineWrapping', wordWrapEnabled);
            this.classList.toggle('active', wordWrapEnabled);
            customConsole.log(`Word wrap ${wordWrapEnabled ? 'enabled' : 'disabled'}`);
        }
    });

    let minimapEnabled = false;
    document.getElementById('minimap-btn')?.addEventListener('click', function() {
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

    document.getElementById('new-file-btn')?.addEventListener('click', () => {
        if (confirm('Create new file? Unsaved changes will be lost.')) {
            if (codeEditorManager) {
                codeEditorManager.setCreateTemplate();
                codeEditorManager.setState('create');
                customConsole.log('New file created');
            }
        }
    });

    document.getElementById('save-file-btn')?.addEventListener('click', () => {
        if (codeEditorManager) {
            if (codeEditorManager.saveToCurrentAssetButton.style.display !== 'none') {
                codeEditorManager.saveToCurrentAssetButton.click();
            } else if (codeEditorManager.saveAsNewAssetButton.style.display !== 'none') {
                codeEditorManager.saveAsNewAssetButton.click();
            }
        }
    });

    document.querySelectorAll('.console-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.console-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const consoleType = this.getAttribute('data-console');
            customConsole.log(`Switched to ${consoleType} view`);
        });
    });

    document.getElementById('filter-console')?.addEventListener('click', () => {
        customConsole.log('Console filter functionality');
    });

    document.getElementById('clear-console')?.addEventListener('click', () => {
        customConsole.clear();
    });
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
    editors.js = CodeMirror.fromTextArea(document.getElementById('js-editor'), {
        mode: { name: "javascript", json: true },
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        styleActiveLine: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: false,
        extraKeys: { 
            'Ctrl-Space': 'autocomplete',
            'Ctrl-/': 'toggleComment',
            'Ctrl-S': function(cm) {
                const saveBtn = document.getElementById('save-file-btn');
                if (saveBtn) saveBtn.click();
            },
            'Tab': function(cm) {
                if (cm.somethingSelected()) {
                    cm.indentSelection('add');
                } else {
                    cm.replaceSelection('    ', 'end');
                }
            }
        },
        hintOptions: {
            hint: CodeMirror.hint.javascript,
            completeSingle: false,
            globalScope: {
                "THREE": (typeof THREE !== 'undefined' ? THREE : null),
                "customConsole": customConsole,
                "EditorAccess": EditorAccess,
            }
        }
    });

    editors.js.on("inputRead", function(cm, change) {
        if (cm.state.completionActive || change.origin !== "+input") return;
        const token = cm.getTokenAt(cm.getCursor());
        if (token.type === "variable" || token.type === "property" || token.string === ".") {
            setTimeout(() => {
                if (!cm.state.completionActive) cm.execCommand("autocomplete");
            }, 100);
        }
    });

    const htmlEditorEl = document.getElementById('html-editor');
    if (htmlEditorEl) {
        editors.html = CodeMirror.fromTextArea(htmlEditorEl, { 
            mode: 'xml', 
            theme: 'monokai', 
            lineNumbers: true,
            autoCloseBrackets: true,
            matchBrackets: true,
            styleActiveLine: true,
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                'Tab': function(cm) {
                    if (cm.somethingSelected()) {
                        cm.indentSelection('add');
                    } else {
                        cm.replaceSelection('    ', 'end');
                    }
                }
            }
        });
        updateEditorStats(editors.html);
    }

    const cssEditorEl = document.getElementById('css-editor');
    if (cssEditorEl) {
        editors.css = CodeMirror.fromTextArea(cssEditorEl, { 
            mode: 'css', 
            theme: 'monokai', 
            lineNumbers: true,
            autoCloseBrackets: true,
            matchBrackets: true,
            styleActiveLine: true,
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                'Tab': function(cm) {
                    if (cm.somethingSelected()) {
                        cm.indentSelection('add');
                    } else {
                        cm.replaceSelection('    ', 'end');
                    }
                }
            }
        });
        updateEditorStats(editors.css);
    }

    // Auto-save file content when editing
Object.values(editors).forEach((editor, index) => {
    if (editor) {
        editor.on('change', () => {
            const activeFile = explorerManager?.treeElement?.querySelector('.file-item.active');
            if (activeFile && explorerManager) {
                const fileName = activeFile.getAttribute('data-file');
                const folderName = activeFile.getAttribute('data-folder');
                if (fileName && folderName) {
                    explorerManager.saveFileContent(fileName, folderName, editor.getValue());
                }
            }
        });
    }
});
    updateEditorStats(editors.js);
    hierarchyManager.init();
    
    codeEditorManager = new CodeEditorManager(editors.js);
    codeEditorManager.setState('create');

    explorerManager = new ExplorerManager();

    setupAdvancedToolbar();

    if (EditorAccess.transformControls) {
        EditorAccess.transformControls.addEventListener('objectChange', () => {
            const currentObject = EditorAccess.transformControls.object;
            if (codeEditorManager) {
                codeEditorManager.loadScriptForObject(currentObject);
            }
            hierarchyManager.updateSelectionStyle(); 
        });
    } else {
        console.error("transformControls not found.");
    }

    document.getElementById('toggle-editor')?.addEventListener('click', () => {
        const panel = document.getElementById('code-editor-panel');
        if (panel) {
            panel.classList.toggle('open');
            Object.values(editors).forEach(editor => {
                if (editor) editor.refresh();
            });
            const currentSelected = EditorAccess.getSelectedObject();
            if (codeEditorManager) {
                codeEditorManager.loadScriptForObject(currentSelected);
            }
        }
    });

    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const editorType = tab.dataset.tab;
            
            const langMode = document.getElementById('language-mode');
            if (langMode) {
                const modeNames = { js: 'JavaScript', html: 'HTML', css: 'CSS' };
                langMode.textContent = modeNames[editorType] || 'Text';
            }
            
            Object.keys(editors).forEach(key => {
                if (editors[key]) {
                    const wrapper = editors[key].getWrapperElement();
                    wrapper.style.display = (key === editorType) ? 'block' : 'none';
                }
            });
            if (editors[editorType]) editors[editorType].refresh();
        });
    });

    document.getElementById('run-test-cube')?.addEventListener('click', createCubeFromMenu);

    setupResizeHandlers();

    document.getElementById('close-editor')?.addEventListener('click', () => {
        document.getElementById('code-editor-panel')?.classList.remove('open');
    });

    setupKeyboardShortcuts();

    console.log("✓ Advanced Code Editor initialized with IntelliSense");
    customConsole.log('Editor ready with VS Code-style features');
    updateConsoleFooter(0, 0, 0);
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
    const resizeHandleTerminal = document.querySelector(".resize-handle-console");

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

/*
// =======================================================================
// PART 1: CORE SYSTEMS (Place at the top)
// =======================================================================

const scriptManager = {
    scripts: [],
    registerScript: function(instance) {
        if (!instance || typeof instance.update !== 'function') {
            console.warn('Invalid script instance:', instance);
            return;
        }
        this.scripts.push(instance);
        if (typeof instance.start === 'function') {
            try { instance.start(); } catch (e) {
                const name = instance.object?.name || 'Unknown';
                customConsole.error(`Error in start() for ${name}: ${e.message}`);
            }
        }
    },
    update: function(delta, time) {
         console.log('Updating scripts with delta:', delta); // Debug line
        for (const script of this.scripts) {
            try { script.update(delta, time); } catch (e) {
                const name = script.object?.name || 'Unknown';
                customConsole.error(`Error in update() for ${name}: ${e.message}`);
            }
        }
    },
    removeScriptForObject: function(object) {
        if (object?.userData?.scriptInstance) {
            this.scripts = this.scripts.filter(script => script !== object.userData.scriptInstance);
            delete object.userData.scriptInstance;
            delete object.userData.scriptSourceCode;
            delete object.userData.scriptClassName;
        }
    }
};

const EditorAccess = {
    scene: null, camera: null, transformControls: null,
    init: function(s, c, t) { this.scene = s; this.camera = c; this.transformControls = t; },
    getSelectedObject: function() { return this.transformControls?.object || null; },
};

const hierarchyManager = {
    listElement: null,
    init: function() { this.listElement = document.getElementById('hierarchy-list'); },
    addOrUpdate(object) {
        if (!this.listElement) return;
        let item = document.getElementById(object.uuid);
        if (!item) {
            item = document.createElement('div');
            item.className = 'hierarchy-item';
            item.id = object.uuid;
            item.onclick = () => selectObject(object);
            this.listElement.appendChild(item);
        }
        const scriptTag = object.userData.scriptClassName ? `<span class="script-tag" title="${object.userData.scriptClassName}.js">${object.userData.scriptClassName}</span>` : '';
        item.innerHTML = `<span>${object.name}</span>${scriptTag}`;
    },
    remove(object) {
        if (!this.listElement || !object) return;
        const item = document.getElementById(object.uuid);
        if (item) item.remove();
    },
    updateSelectionStyle() {
        if (!this.listElement) return;
        const selected = EditorAccess.getSelectedObject();
        Array.from(this.listElement.children).forEach(child => {
            child.classList.toggle('selected', child.id === selected?.uuid);
        });
    }
};

// =======================================================================
// PART 2: THE FULLY IMPLEMENTED CODE EDITOR MANAGER
// =======================================================================

class CodeEditorManager {
    constructor(editorInstance) {
        this.editor = editorInstance;
        this.activeObject = null;
        this.statusDisplay = document.getElementById('editing-status');
        this.filenameInput = document.getElementById('filename-input');
        this.createButton = document.getElementById('run-code-btn');
        this.applyButton = document.getElementById('apply-changes-btn');
        this.detachButton = document.getElementById('detach-script-btn');
        this.attachButton = document.createElement('button');
        this.attachButton.id = 'attach-script-btn';
        this.attachButton.className = 'editor-btn';
        this.attachButton.textContent = 'Attach Script';
        this.attachButton.style.backgroundColor = '#17a2b8';
        this.createButton.parentElement.insertBefore(this.attachButton, this.applyButton);
        this.bindEvents();
    }

    bindEvents() {
        this.createButton.onclick = () => this.handleCreate();
        this.attachButton.onclick = () => this.handleAttach();
        this.applyButton.onclick = () => this.handleApplyChanges();
        this.detachButton.onclick = () => this.handleDetach();
        this.editor.setOption("extraKeys", {
            ...this.editor.getOption("extraKeys"),
            "Ctrl-Enter": () => {
                if (getComputedStyle(this.createButton).display !== 'none') this.createButton.click();
                else if (getComputedStyle(this.attachButton).display !== 'none') this.attachButton.click();
                else if (getComputedStyle(this.applyButton).display !== 'none') this.applyButton.click();
            }
        });
    }

    setState(mode) {
        this.createButton.style.display = 'none';
        this.attachButton.style.display = 'none';
        this.applyButton.style.display = 'none';
        this.detachButton.style.display = 'none';
        this.filenameInput.disabled = true;

        if (mode === 'edit' && this.activeObject) {
            this.statusDisplay.textContent = `Editing Script: ${this.activeObject.name}`;
            this.filenameInput.value = this.activeObject.name;
            this.applyButton.style.display = 'inline-block';
            this.detachButton.style.display = 'inline-block';
        } else if (mode === 'attach' && this.activeObject) {
            this.statusDisplay.textContent = `Attaching to: ${this.activeObject.name}`;
            this.filenameInput.value = this.activeObject.name;
            this.attachButton.style.display = 'inline-block';
        } else {
            this.statusDisplay.textContent = 'Mode: Create New Object';
            this.filenameInput.value = '';
            this.filenameInput.disabled = false;
            this.activeObject = null;
            this.createButton.style.display = 'inline-block';
        }
    }

    setAttachTemplate() {
        this.editor.setValue(`
class Rotator {
    constructor(object) {
        this.object = object;
        // Example: Change material on attach
        if (this.object.material) {
            this.object.material.color.set(0xff00ff);
        }
    }
    start() {
        customConsole.log("Rotator attached to " + this.object.name);
    }
    update(delta, time) {
        this.object.rotation.y += delta * 1.5;
    }
}
return Rotator;`);
    }

    setCreateTemplate() {
        this.editor.setValue(`
class MyNewObject {
    constructor() {
        const geometry = new THREE.BoxGeometry();
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        this.object = new THREE.Mesh(geometry, material);
        this.object.position.y = 0.5;
    }
    start() {}
    update(delta, time) {
        this.object.rotation.x = time;
    }
}
return MyNewObject;`);
    }

    loadScriptForObject(object) {
        this.activeObject = object;
        if (object) {
            if (object.userData.scriptSourceCode) {
                this.editor.setValue(object.userData.scriptSourceCode);
                this.setState('edit');
            } else {
                this.setAttachTemplate();
                this.setState('attach');
            }
        } else {
            this.setCreateTemplate();
            this.setState('create');
        }
    }

    _compileAndInstantiate(sourceCode, targetObject = null) {
        const ScriptClass = new Function(sourceCode)();
        if (typeof ScriptClass !== 'function') throw new Error("Code must return a class.");
        const scriptInstance = targetObject ? new ScriptClass(targetObject) : new ScriptClass();
        const object3D = targetObject || scriptInstance.object;
        if (!(object3D instanceof THREE.Object3D)) throw new Error("Script did not produce a valid THREE.Object3D.");
        object3D.userData = {...object3D.userData, scriptInstance, scriptSourceCode: sourceCode, scriptClassName: ScriptClass.name };
        return { object3D, scriptInstance };
    }

    handleCreate() {
        try {
            const { object3D, scriptInstance } = this._compileAndInstantiate(this.editor.getValue());
            object3D.name = this.filenameInput.value || `CreatedObject_${Date.now()}`;
            addObjectToScene(object3D);
            scriptManager.registerScript(scriptInstance);
            selectObject(object3D);
            showStatus(`Success! '${object3D.name}' created.`);
        } catch (e) { showEnhancedError(e); }
    }

    handleAttach() {
        if (!this.activeObject) return;
        try {
            const { object3D, scriptInstance } = this._compileAndInstantiate(this.editor.getValue(), this.activeObject);
            scriptManager.registerScript(scriptInstance);
            hierarchyManager.addOrUpdate(object3D);
            this.setState('edit');
            showStatus(`Success! Script attached to '${object3D.name}'.`);
        } catch (e) { showEnhancedError(e); }
    }

    handleApplyChanges() {
        if (!this.activeObject) return;
        const oldObject = this.activeObject;
        const { position, rotation, scale, name } = oldObject;

        scriptManager.removeScriptForObject(oldObject);
        if (oldObject.parent) oldObject.parent.remove(oldObject);
        hierarchyManager.remove(oldObject);

        try {
            const { object3D, scriptInstance } = this._compileAndInstantiate(this.editor.getValue(), null); // Create new
            object3D.name = name;
            object3D.position.copy(position);
            object3D.rotation.copy(rotation);
            object3D.scale.copy(scale);
            
            addObjectToScene(object3D);
            scriptManager.registerScript(scriptInstance);
            selectObject(object3D);
            showStatus(`Success! Applied changes to '${name}'.`);
        } catch (e) {
            showEnhancedError(e);
            customConsole.error("Could not apply changes. The original object has been removed.");
        }
    }

    handleDetach() {
        if (!this.activeObject) return;
        const object = this.activeObject;
        customConsole.warn(`Detaching script from '${object.name}'.`);
        scriptManager.removeScriptForObject(object);
        hierarchyManager.addOrUpdate(object); // Update UI to remove tag
        this.setState('attach'); // Go back to attach mode for this object
    }
}

// =======================================================================
// PART 3: YOUR EXISTING EDITOR CODE (INTEGRATED)
// =======================================================================

// --- Global variables assumed to be defined elsewhere ---
// let scene, camera, renderer, clock, transformControls;

// --- Your Global Integration Functions ---
function addObjectToScene(object) {
    scene.add(object);
    hierarchyManager.addOrUpdate(object);
}

function selectObject(object) {
    transformControls.attach(object);
    // Manually trigger the event since attach() doesn't always fire it
    transformControls.dispatchEvent({ type: 'objectChange' });
}

// --- Your Existing UI Code ---
let editors = {};

const customConsole = {
    log: (m) => appendToConsole(m, 'info'),
    error: (m) => appendToConsole(m, 'error'),
    warn: (m) => appendToConsole(m, 'warning'),
    clear: () => { if(document.getElementById('console-content')) document.getElementById('console-content').innerHTML = ''; }
};
function appendToConsole(message, type = 'info') {
    const consoleContent = document.getElementById('console-content');
    if(!consoleContent) return;
    const line = document.createElement('div');
    line.className = `console-line console-${type}`;
    line.textContent = message.stack ? message.stack : (typeof message === 'object' ? JSON.stringify(message, null, 2) : message);
    consoleContent.appendChild(line);
    consoleContent.scrollTop = consoleContent.scrollHeight;
}
function showEnhancedError(error) {
    customConsole.error(error);
    showStatus('Execution failed. See console.');
}
function showStatus(message) {
    const statusBar = document.querySelector('.status-bar-code');
    if(statusBar) statusBar.textContent = message;
}

function initializeEditors() {
    editors.js = CodeMirror.fromTextArea(document.getElementById('js-editor'), {
        mode: 'javascript', theme: 'monokai', lineNumbers: true, autoCloseBrackets: true,
        matchBrackets: true, foldGutter: true, gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        extraKeys: { 'Ctrl-Space': 'autocomplete' }
    });
    editors.html = CodeMirror.fromTextArea(document.getElementById('html-editor'), { mode: 'xml', theme: 'monokai', lineNumbers: true });
    editors.css = CodeMirror.fromTextArea(document.getElementById('css-editor'), { mode: 'css', theme: 'monokai', lineNumbers: true });

    hierarchyManager.init();
    const codeEditorManager = new CodeEditorManager(editors.js);
    
    if (window.transformControls) {
        transformControls.addEventListener('objectChange', () => {
            codeEditorManager.loadScriptForObject(transformControls.object);
            hierarchyManager.updateSelectionStyle();
        });
    } else { console.error("transformControls not found. Scripting will not be fully functional."); }
}

// Your existing UI event listeners
document.getElementById('toggle-editor')?.addEventListener('click', () => {
    document.getElementById('code-editor-panel').classList.toggle('open');
    Object.values(editors).forEach(editor => editor.refresh());
});
document.querySelectorAll('.editor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const editorType = tab.dataset.tab;
        Object.keys(editors).forEach(key => {
            editors[key].getWrapperElement().style.display = key === editorType ? 'block' : 'none';
        });
        editors[editorType].refresh();
    });
});
// ... The rest of your resize handle, close button, and clear console listeners ...
let isResizingEdit = false;
const resizeHandleEditor = document.querySelector('.resize-handle-Editor');
resizeHandleEditor?.addEventListener('mousedown', () => { isResizingEdit = true; document.addEventListener('mousemove', handleMouseMoveEdit); document.addEventListener('mouseup', stopResizeEdit); });
function handleMouseMoveEdit(e) { if (!isResizingEdit) return; const newWidth = window.innerWidth - e.clientX; document.getElementById('code-editor-panel').style.width = `${newWidth}px`; Object.values(editors).forEach(editor => editor.refresh()); }
function stopResizeEdit() { isResizingEdit = false; document.removeEventListener('mousemove', handleMouseMoveEdit); }
document.getElementById('close-editor')?.addEventListener('click', () => { document.getElementById('code-editor-panel').classList.remove('open'); });
document.getElementById('clear-console')?.addEventListener('click', () => customConsole.clear());
document.getElementById('run-test-cube')?.addEventListener('click', createCubeFromMenu);
// =======================================================================
// PART 4: HOW TO INTEGRATE INTO YOUR MAIN EDITOR
// =======================================================================

// 1. In your main `init()` function:
//    EditorAccess.init(scene, camera, transformControls);
//    initializeEditors();

// 2. In your `animate()` loop:
//    const delta = clock.getDelta();
//    const time = clock.getElapsedTime();
//    scriptManager.update(delta, time);

// 3. Create a test button in your UI to add a static cube:
function createCubeFromMenu() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const cube = new THREE.Mesh(geometry, material);
    cube.name = "StaticCube";
    
    // Use the integrated functions
    addObjectToScene(cube);
    selectObject(cube);
}


function showEnhancedError(error) {
    console.error('Full error:', error); // Log to browser console
    const message = error.stack || error.message || String(error);
    customConsole.error(`SCRIPT ERROR: ${message}`);
    showStatus(`Execution failed: ${message.split('\n')[0]}`);
}*/