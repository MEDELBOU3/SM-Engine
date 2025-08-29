// =======================================================================
//  COMPLETE AND FUNCTIONAL EDITOR SCRIPTING SYSTEM
//  This is the full content for your code.js file.
// =======================================================================


// =======================================================================
// PART 1: CORE SYSTEMS
// These are the foundational objects that manage scripts and access the scene.
// =======================================================================

const scriptManager = {
    scripts: [],
    registerScript: function(instance) {
        if (!instance || typeof instance.update !== 'function') {
            console.warn('Attempted to register an invalid script instance:', instance);
            return;
        }
        this.scripts.push(instance);
        // Safely call the start method
        if (typeof instance.start === 'function') {
            try {
                instance.start();
            } catch (e) {
                const name = instance.object?.name || 'Unknown Object';
                customConsole.error(`Error in start() for script on '${name}': ${e.message}`);
                console.error(e); // Also log full error to browser console
            }
        }
    },
    update: function(delta, time) {
        // Loop backwards so we can safely remove scripts if they fail critically
        for (let i = this.scripts.length - 1; i >= 0; i--) {
            const script = this.scripts[i];
            try {
                script.update(delta, time);
            } catch (e) {
                const name = script.object?.name || 'Unknown Object';
                customConsole.error(`Error in update() for script on '${name}': ${e.message}. Script disabled.`);
                console.error(e); // Also log full error
                // Remove the faulty script to prevent the app from crashing
                this.scripts.splice(i, 1);
            }
        }
    },
    removeScriptForObject: function(object) {
        if (!object || !object.userData.scriptInstance) return;

        // Call a cleanup method if the script has one
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

// A minimal hierarchy helper just for styling the selection.
// Your main `updateHierarchy` function handles adding/removing items.
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
// PART 2: THE CODE EDITOR MANAGER
// This class controls the entire UI and logic of the code editor panel.
// =======================================================================

class CodeEditorManager {
    constructor(editorInstance) {
        this.editor = editorInstance;
        this.activeObject = null;
        this.statusDisplay = document.getElementById('editing-status');
        this.filenameInput = document.getElementById('filename-input');
        this.createButton = document.getElementById('run-code-btn');
        this.attachButton = document.getElementById('attach-script-btn');
        this.applyButton = document.getElementById('apply-changes-btn');
        this.detachButton = document.getElementById('detach-script-btn');

        if (!this.createButton || !this.attachButton || !this.applyButton || !this.detachButton) {
            console.error("CRITICAL ERROR: One or more editor buttons are missing from the HTML!");
            return;
        }

        this.bindEvents();
        this.loadScriptForObject(null); // Set initial state
    }

    bindEvents() {
        this.createButton.onclick = () => this.handleCreate();
        this.attachButton.onclick = () => this.handleAttach();
        this.applyButton.onclick = () => this.handleApplyChanges();
        this.detachButton.onclick = () => this.handleDetach();

        this.editor.setOption("extraKeys", {
            ...this.editor.getOption("extraKeys"),
            "Ctrl-Enter": () => {
                if (this.createButton.style.display !== 'none') this.createButton.click();
                else if (this.attachButton.style.display !== 'none') this.attachButton.click();
                else if (this.applyButton.style.display !== 'none') this.applyButton.click();
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
            this.statusDisplay.textContent = `Editing Script: ${this.activeObject.name || 'Unnamed'}`;
            this.filenameInput.value = this.activeObject.name || '';
            this.applyButton.style.display = 'inline-block';
            this.detachButton.style.display = 'inline-block';
        } else if (mode === 'attach' && this.activeObject) {
            this.statusDisplay.textContent = `Attaching to: ${this.activeObject.name || 'Unnamed'}`;
            this.filenameInput.value = this.activeObject.name || '';
            this.attachButton.style.display = 'inline-block';
        } else {
            this.statusDisplay.textContent = 'Mode: Create New';
            this.filenameInput.value = '';
            this.filenameInput.disabled = false;
            this.activeObject = null;
            this.createButton.style.display = 'inline-block';
        }
    }

    _compileAndInstantiate(sourceCode, targetObject = null) {
        const ScriptClass = new Function('THREE', 'customConsole', 'EditorAccess', sourceCode)(THREE, customConsole, EditorAccess);
        if (typeof ScriptClass !== 'function') throw new Error("Script must return a class. Example: 'return MyClassName;'");
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
            
            // THE FIX: Make the new object compatible with YOUR selection system.
            object3D.userData.selectable = true;

            // Now, call your global addObjectToScene function.
            // This is the correct integration point.
            if (typeof window.addObjectToScene === 'function') {
                window.addObjectToScene(object3D, objectName);
            } else {
                console.error("Critical: 'addObjectToScene' is not a global function. The editor cannot add objects to your hierarchy correctly.");
                showStatus("Error: addObjectToScene() not found.");
                return;
            }

            // Register the script so its `update` loop runs.
            scriptManager.registerScript(scriptInstance);
            showStatus(`Success! '${object3D.name}' created and is now selectable.`);
        } catch (e) {
            showEnhancedError(e);
        }
    }

    handleAttach() {
        if (!this.activeObject) return;
        try {
            scriptManager.removeScriptForObject(this.activeObject);
            const { object3D, scriptInstance } = this._compileAndInstantiate(this.editor.getValue(), this.activeObject);
            scriptManager.registerScript(scriptInstance);
            if(typeof window.updateHierarchy === 'function') window.updateHierarchy();
            this.setState('edit');
            showStatus(`Success! Script attached to '${object3D.name}'.`);
        } catch (e) {
            showEnhancedError(e);
        }
    }

    handleApplyChanges() {
        if (!this.activeObject) return;
        scriptManager.removeScriptForObject(this.activeObject);
        try {
            const { object3D, scriptInstance } = this._compileAndInstantiate(this.editor.getValue(), this.activeObject);
            scriptManager.registerScript(scriptInstance);
            if(typeof window.updateHierarchy === 'function') window.updateHierarchy();
            this.setState('edit');
            showStatus(`Success! Script changes applied to '${object3D.name}'.`);
        } catch (e) {
            showEnhancedError(e);
            this.setState('attach');
        }
    }

    handleDetach() {
        if (!this.activeObject) return;
        customConsole.warn(`Detaching script from '${this.activeObject.name}'.`);
        scriptManager.removeScriptForObject(this.activeObject);
        if(typeof window.updateHierarchy === 'function') window.updateHierarchy();
        this.setAttachTemplate();
        this.setState('attach');
    }

    setAttachTemplate() {
        this.editor.setValue(
`// This script will be attached to an existing object.
// The 'constructor' receives the object it's attached to.
class Rotator {
    constructor(object) {
        this.object = object;
        if(object.material) {
            this.initialColor = object.material.color.clone();
        }
    }
    
    start() {
        customConsole.log("Rotator attached to " + this.object.name);
    }

    update(delta, time) {
        this.object.rotation.y += delta * 1.5;
    }
    
    // This is called when the script is detached.
    onDestroy() {
        customConsole.log("Rotator script destroyed on " + this.object.name);
        if(this.object.material && this.initialColor) {
            this.object.material.color.copy(this.initialColor);
        }
    }
}
return Rotator;`);
    }

    setCreateTemplate() {
        this.editor.setValue(
`// This script creates a new object from scratch.
// The class must have a '.object' property that is a THREE.Object3D.
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
        customConsole.log(this.object.name + " has been created!");
    }

    update(delta, time) {
        // 'time' is the total elapsed time
        this.object.rotation.x = time * 0.2;
        this.object.rotation.y = time * 0.3;
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
        if(this.editor) this.editor.refresh();
    }
}


// =======================================================================
// PART 3: UTILITIES AND INITIALIZATION
// These functions connect the editor to your app and control the UI.
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
    if (statusBar) statusBar.textContent = message;
}

let editors = {};
let codeEditorManager;

// This is the main function you call from your application's init().
function initializeEditors() {
    editors.js = CodeMirror.fromTextArea(document.getElementById('js-editor'), {
        mode: { name: "javascript", json: true },
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        extraKeys: { 'Ctrl-Space': 'autocomplete' }
    });
    
    // Initialize other editors if they exist
    const htmlEditorEl = document.getElementById('html-editor');
    if (htmlEditorEl) editors.html = CodeMirror.fromTextArea(htmlEditorEl, { mode: 'xml', theme: 'monokai', lineNumbers: true });
    
    const cssEditorEl = document.getElementById('css-editor');
    if (cssEditorEl) editors.css = CodeMirror.fromTextArea(cssEditorEl, { mode: 'css', theme: 'monokai', lineNumbers: true });

    hierarchyManager.init();
    codeEditorManager = new CodeEditorManager(editors.js);

    // This is the critical link to your selection system.
    if (EditorAccess.transformControls) {
        EditorAccess.transformControls.addEventListener('objectChange', () => {
            const currentObject = EditorAccess.transformControls.object;
            codeEditorManager.loadScriptForObject(currentObject);
            hierarchyManager.updateSelectionStyle(); 
        });
    } else {
        console.error("transformControls not found. Scripting will not be fully functional.");
    }

    // --- All other UI Event Listeners ---
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
                if (editors[key]) {
                    const wrapper = editors[key].getWrapperElement();
                    wrapper.style.display = key === editorType ? 'block' : 'none';
                }
            });
            if (editors[editorType]) editors[editorType].refresh();
        });
    });
    
    document.getElementById('clear-console')?.addEventListener('click', () => customConsole.clear());
    document.getElementById('run-test-cube')?.addEventListener('click', createCubeFromMenu);
    
    let isResizingEdit = false;
    const resizeHandleEditor = document.querySelector('.resize-handle-Editor');
    const panel = document.getElementById('code-editor-panel');
    const startResize = () => { isResizingEdit = true; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; };
    const stopResize = () => { isResizingEdit = false; document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto';};
    const doResize = (e) => {
        if (!isResizingEdit) return;
        const newWidth = window.innerWidth - e.clientX;
        if (panel) panel.style.width = `${newWidth}px`;
        Object.values(editors).forEach(editor => editor.refresh());
    };

    resizeHandleEditor?.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);

    document.getElementById('close-editor')?.addEventListener('click', () => panel?.classList.remove('open'));

    console.log("Code Editor Systems Initialized.");
}

function createCubeFromMenu() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
    const cube = new THREE.Mesh(geometry, material);
    
    // Ensure this test cube is also selectable by your system
    cube.userData.selectable = true;
    
    const cubeName = "TestCube";

    if (typeof window.addObjectToScene === 'function') {
        window.addObjectToScene(cube, cubeName);
    } else {
        console.error("addObjectToScene function not found, cannot create test cube.");
    }
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