/**
 * // =======================================================================
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
// Your main updateHierarchy function handles adding/removing items.
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
        this.activeObject = null; // The THREE.Object3D whose script is being edited
        this.activeScriptAsset = null; // The AssetsPanel script asset being edited

        this.statusDisplay = document.getElementById('editing-status');
        this.filenameInput = document.getElementById('filename-input');

        // Main action buttons
        this.createButton = document.getElementById('create-object-btn'); // Renamed from 'run-code-btn' for clarity
        this.attachButton = document.getElementById('attach-script-btn');
        this.applyButton = document.getElementById('apply-changes-btn');
        this.detachButton = document.getElementById('detach-script-btn');

        // New asset-related buttons
        this.saveAsNewAssetButton = document.getElementById('save-as-new-asset-btn');
        this.saveToCurrentAssetButton = document.getElementById('save-to-current-asset-btn');

        if (!this.createButton || !this.attachButton || !this.applyButton || !this.detachButton || !this.saveAsNewAssetButton || !this.saveToCurrentAssetButton) {
            console.error("CRITICAL ERROR: One or more editor buttons are missing from the HTML!");
            return;
        }

        this.bindEvents();
        this.setState('create'); // Set initial state
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
            }
        });
    }

    /**
     * Sets the UI state of the code editor based on context.
     * @param {string} mode - 'create', 'attach_to_object', 'edit_object_script', 'edit_asset_script'
     */
    setState(mode) {
        // Hide all buttons and enable filename input by default
        this.createButton.style.display = 'none';
        this.attachButton.style.display = 'none';
        this.applyButton.style.display = 'none';
        this.detachButton.style.display = 'none';
        this.saveAsNewAssetButton.style.display = 'none';
        this.saveToCurrentAssetButton.style.display = 'none';
        this.filenameInput.disabled = false;

        // Clear previous contexts
        this.activeObject = null;
        this.activeScriptAsset = null;

        const selectedObject = EditorAccess.getSelectedObject();

        switch (mode) {
            case 'create':
                this.statusDisplay.textContent = 'Mode: Create New Object';
                this.filenameInput.value = '';
                this.createButton.style.display = 'inline-block';
                this.saveAsNewAssetButton.style.display = 'inline-block'; // Always allow saving current code as a new asset
                break;

            case 'attach_to_object':
                this.activeObject = selectedObject; // The object is selected, but has no script
                this.statusDisplay.textContent = `Attaching to: ${this.activeObject.name || 'Unnamed'}`;
                this.filenameInput.value = this.activeObject.name || ''; // Use object name as a hint
                this.filenameInput.disabled = true; // Object's name is not changed here
                this.attachButton.style.display = 'inline-block';
                this.saveAsNewAssetButton.style.display = 'inline-block'; // Still allow saving current editor content as new asset
                break;

            case 'edit_object_script':
                this.activeObject = selectedObject; // The object has a script attached
                this.statusDisplay.textContent = `Editing Script: ${this.activeObject.name || 'Unnamed'}`;
                this.filenameInput.value = this.activeObject.name || '';
                this.filenameInput.disabled = true; // Object's name is not changed here
                this.applyButton.style.display = 'inline-block';
                this.detachButton.style.display = 'inline-block';
                this.saveAsNewAssetButton.style.display = 'inline-block'; // Still allow saving current editor content as new asset
                break;

            case 'edit_asset_script':
                // `this.activeScriptAsset` must be set by `loadScriptFromAsset` before calling this state
                if (!this.activeScriptAsset) {
                    console.error("setState('edit_asset_script') called without activeScriptAsset.");
                    this.setState('create'); // Fallback
                    return;
                }
                this.statusDisplay.textContent = `Editing Asset: ${this.activeScriptAsset.name}`;
                this.filenameInput.value = this.activeScriptAsset.name.replace(/\.js$/, ''); // Allow renaming asset
                this.saveToCurrentAssetButton.style.display = 'inline-block';
                // If an object is selected, also allow attaching this asset script to it
                if (selectedObject) {
                    this.attachButton.style.display = 'inline-block';
                }
                this.saveAsNewAssetButton.style.display = 'inline-block'; // Also allow saving a *copy* as new asset
                break;

            default:
                console.warn(`CodeEditorManager: Unknown state mode '${mode}'. Falling back to 'create'.`);
                this.setState('create');
                return;
        }
        if(this.editor) this.editor.refresh(); // Refresh CodeMirror display
    }

    _compileAndInstantiate(sourceCode, targetObject = null) {
        // Clear previous console messages from script execution
        customConsole.clear();

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
            this.loadScriptForObject(object3D); // Load script for the newly created object
        } catch (e) {
            showEnhancedError(e);
        }
    }

    handleAttach() {
        let targetObject = EditorAccess.getSelectedObject();
        if (!targetObject) {
            showStatus("Please select an object in the scene to attach the script to.");
            return;
        }

        try {
            scriptManager.removeScriptForObject(targetObject); // Remove existing script if any

            let sourceCode;
            if (this.activeScriptAsset) {
                sourceCode = this.activeScriptAsset.data; // Use content from active script asset
            } else {
                sourceCode = this.editor.getValue(); // Use current editor content
            }

            const { object3D, scriptInstance } = this._compileAndInstantiate(sourceCode, targetObject);
            scriptManager.registerScript(scriptInstance);
            if(typeof window.updateHierarchy === 'function') window.updateHierarchy();

            // After attaching, the object is now considered the "active object"
            // and its script is being "edited" directly.
            this.activeScriptAsset = null; // No longer editing the asset directly
            this.activeObject = object3D; // Set the active object
            this.loadScriptForObject(object3D); // Reload for the object, which sets state to 'edit_object_script'

            showStatus(`Success! Script attached to '${object3D.name}'.`);
        } catch (e) {
            showEnhancedError(e);
            // If compilation fails, try to revert to the previous state of the object if possible
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
        scriptManager.removeScriptForObject(this.activeObject); // Remove old instance first
        try {
            const { object3D, scriptInstance } = this._compileAndInstantiate(this.editor.getValue(), this.activeObject);
            scriptManager.registerScript(scriptInstance);
            if(typeof window.updateHierarchy === 'function') window.updateHierarchy();
            // Re-load the script for the object to ensure state is correct
            this.loadScriptForObject(object3D);
            showStatus(`Success! Script changes applied to '${object3D.name}'.`);
        } catch (e) {
            showEnhancedError(e);
            // If compilation fails, restore the previous source code and instance if possible,
            // or at least revert UI to the 'attach' mode to signal a problem.
            if (this.activeObject.userData.scriptSourceCode) {
                // Try to restore the previous functional script if it existed
                try {
                    const { object3D, scriptInstance } = this._compileAndInstantiate(this.activeObject.userData.scriptSourceCode, this.activeObject);
                    scriptManager.registerScript(scriptInstance);
                    showStatus("Error applying changes. Reverted to previous working script.");
                } catch (revertError) {
                    // If even reverting fails, detach completely
                    console.error("Failed to revert to previous script:", revertError);
                    this.setAttachTemplate();
                    this.setState('attach_to_object');
                    showStatus("Error applying changes. Script detached due to severe error.");
                }
            } else {
                // If there was no previous script, just go to attach mode
                this.setAttachTemplate();
                this.setState('attach_to_object');
            }
        }
    }

    handleDetach() {
        if (!this.activeObject) return;
        customConsole.warn(`Detaching script from '${this.activeObject.name}'.`);
        scriptManager.removeScriptForObject(this.activeObject);
        if(typeof window.updateHierarchy === 'function') window.updateHierarchy();

        // After detaching, the object is selected but has no script.
        // Set the editor to the 'attach_to_object' state with the template.
        this.activeScriptAsset = null; // Ensure no asset is considered active
        this.setAttachTemplate();
        this.setState('attach_to_object');
    }

    /**
     * Handles saving the current editor content as a new script asset in the Assets Panel.
     */
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
                showStatus(`Script '${newAsset.name}' saved to Assets Panel.`);
                this.loadScriptFromAsset(newAsset); // Switch to editing the newly saved asset
            } else {
                showStatus("Failed to save script asset (name conflict?).");
            }
        } else {
            showStatus("AssetsPanel.addScriptAsset is not available. Assets Panel might not be initialized.");
            console.error("AssetsPanel.addScriptAsset is not available.");
        }
    }

    /**
     * Handles saving changes to the currently active script asset.
     */
    handleSaveToCurrentAsset() {
        if (!this.activeScriptAsset) {
            showStatus("No active script asset to save changes to.");
            return;
        }
        const newName = this.filenameInput.value.trim();
        if (!newName) {
            showStatus("Please enter a script name for the asset.");
            return;
        }
        const fullNewName = newName.endsWith('.js') ? newName : newName + '.js';
        const sourceCode = this.editor.getValue();

        if (typeof AssetsPanel !== 'undefined' && typeof AssetsPanel.updateScriptAsset === 'function') {
            const success = AssetsPanel.updateScriptAsset(this.activeScriptAsset.id, fullNewName, sourceCode);
            if (success) {
                showStatus(`Script asset '${fullNewName}' updated.`);
                // Update the local reference to activeScriptAsset in case its name changed
                this.activeScriptAsset = AssetsPanel._findById(this.activeScriptAsset.id);
                this.setState('edit_asset_script'); // Re-set state to update UI (e.g., filename input)
            } else {
                showStatus("Failed to update script asset (name conflict?).");
            }
        } else {
            showStatus("AssetsPanel.updateScriptAsset is not available. Assets Panel might not be initialized.");
            console.error("AssetsPanel.updateScriptAsset is not available.");
        }
    }

    setAttachTemplate() {
        this.editor.setValue(`// This script attaches to an object.
class Rotator {
    constructor(object) { this.object = object; }
    start() { customConsole.log("Rotator attached to " + this.object.name); }
    update(delta) { this.object.rotation.y += delta * 1.5; }
    onDestroy() { customConsole.log("Rotator destroyed on " + this.object.name); }
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

    /**
     * Loads the script for a selected THREE.Object3D into the editor.
     * @param {THREE.Object3D|null} object - The object to load the script for, or null for default state.
     */
    loadScriptForObject(object) {
        this.activeScriptAsset = null; // Clear asset context when dealing with scene objects
        if (object) {
            this.activeObject = object; // Set active object for context
            if (object.userData.scriptSourceCode) {
                this.editor.setValue(object.userData.scriptSourceCode);
                this.setState('edit_object_script');
            } else {
                this.setAttachTemplate();
                this.setState('attach_to_object');
            }
        } else {
            // No object selected in the scene
            this.activeObject = null;
            this.setCreateTemplate();
            this.setState('create');
        }
        if(this.editor) this.editor.refresh();
    }

    /**
     * Loads a script asset from the Assets Panel into the editor.
     * @param {object} asset - The asset object (must be type 'code').
     */
    loadScriptFromAsset(asset) {
        if (asset.type !== 'code' || !asset.data) {
            console.warn('Attempted to load non-code asset or asset with no data:', asset);
            return;
        }
        this.activeObject = null; // Clear object context when editing an asset
        this.activeScriptAsset = asset;
        this.editor.setValue(asset.data);
        this.setState('edit_asset_script');
        if(this.editor) this.editor.refresh();
        showStatus(`Loaded asset '${asset.name}' for editing.`);
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
let codeEditorManager; // Make codeEditorManager globally accessible

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
    codeEditorManager.setState('create'); // Ensure initial state is correctly set to 'create'

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
        // When opening the editor, make sure the state is correct for the currently selected object
        const currentSelected = EditorAccess.getSelectedObject();
        codeEditorManager.loadScriptForObject(currentSelected);
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

 */

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