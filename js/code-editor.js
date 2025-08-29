/*let editors = {};

const customConsole = {
    log: function(message) {
        appendToConsole(message, 'info');
    },
    error: function(message) {
        appendToConsole(message, 'error');
    },
    warn: function(message) {
        appendToConsole(message, 'warning');
    },
    clear: function() {
        document.getElementById('console-content').innerHTML = '';
    }
};

function appendToConsole(message, type = 'info') {
    const consoleContent = document.getElementById('console-content');
    const line = document.createElement('div');
    line.className = `console-line console-${type}`;
    line.textContent = typeof message === 'object' ? 
        JSON.stringify(message, null, 2) : message;
    consoleContent.appendChild(line);
    consoleContent.scrollTop = consoleContent.scrollHeight;
}
        
// JavaScript editor
editors.js = CodeMirror.fromTextArea(document.getElementById('js-editor'), {
    mode: 'javascript',
    theme: 'monokai',
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    extraKeys: {
        'Ctrl-Space': 'autocomplete',
        'Ctrl-Enter': function(cm) {
            document.getElementById('run-code').click();
        },
        'Ctrl-V': function(cm) {
            navigator.clipboard.readText().then(text => {
                cm.replaceSelection(text);
            });
        }
    },
    hintOptions: {
        completeSingle: false,
        hint: CodeMirror.hint.javascript
    }
});


// HTML editor
editors.html = CodeMirror.fromTextArea(document.getElementById('html-editor'), {
    mode: 'xml',
    theme: 'monokai',
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    extraKeys: {
        'Ctrl-Space': 'autocomplete'
    }
});

// CSS editor
editors.css = CodeMirror.fromTextArea(document.getElementById('css-editor'), {
    mode: 'css',
    theme: 'monokai',
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    extraKeys: {
        'Ctrl-Space': 'autocomplete'
    }
});

// Tab switching logic
const tabs = document.querySelectorAll('.editor-tab');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const editorType = tab.dataset.tab;
        Object.keys(editors).forEach(key => {
            editors[key].getWrapperElement().style.display = 
                key === editorType ? 'block' : 'none';
        });
        editors[editorType].refresh();
    });
});

// Initialize with example code
editors.js.setValue(`
    function init() {
        // Create a basic cube
        const geometry = new THREE.BoxGeometry();
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x00ff00,
            metalness: 0.5,
            roughness: 0.5
        });
        const cube = new THREE.Mesh(geometry, material);

        // Add custom properties
        cube.userData.selectable = true;
        cube.userData.type = 'Cube';

        return cube;
    }
`);

// Editor toggle logic
document.getElementById('toggle-editor').addEventListener('click', () => {
    const editorPanel = document.getElementById('code-editor-panel');
    editorPanel.classList.toggle('open');
    Object.values(editors).forEach(editor => editor.refresh());
});

// Run code logic
document.getElementById('run-code').addEventListener('click', () => {
    const filename = document.getElementById('filename-input').value || 'unnamed_object';
    const jsCode = editors.js.getValue();

    try {
        const wrappedCode = `
            (function() {
                ${jsCode}
                if (typeof init === 'function') {
                    const result = init();
                    if (result instanceof THREE.Object3D) {
                        addObjectToScene(result, '${filename}');
                    }
                }
            })();
        `;
        
        eval(wrappedCode);
        showStatus('Code executed successfully');
    } catch (error) {
        showError(error.message);
    }
});

// Status and error display functions
function showStatus(message) {
    document.querySelector('.status-bar-code').textContent = message;
}

function showError(message) {
    const errorDisplay = document.getElementById('error-display');
    errorDisplay.textContent = message;
    errorDisplay.style.display = 'block';
    setTimeout(() => {
        errorDisplay.style.display = 'none';
    }, 5000);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        document.getElementById('code-editor-panel').classList.toggle('open');
        Object.values(editors).forEach(editor => editor.refresh());
    }
});

let isResizingEdit = false;
const resizeHandleEditor = document.querySelector('.resize-handle-Editor');

resizeHandleEditor.addEventListener('mousedown', (e) => {
    isResizingEdit = true;
    document.addEventListener('mousemove', handleMouseMoveEdit);
    document.addEventListener('mouseup', stopResizeEdit);
});

function handleMouseMoveEdit(e) {
    if (!isResizingEdit) return;
    
    const editorPanel = document.getElementById('code-editor-panel');
    const newWidth = window.innerWidth - e.clientX;
    editorPanel.style.width = `${newWidth}px`;
    Object.values(editors).forEach(editor => editor.refresh());
}

function stopResizeEdit() {
    isResizingEdit = false;
    document.removeEventListener('mousemove', handleMouseMoveEdit);
}


document.getElementById('close-editor').addEventListener('click', () => {
    document.getElementById('code-editor-panel').classList.remove('open');
});

// Clear console button
document.getElementById('clear-console').addEventListener('click', () => {
    customConsole.clear();
});

// Override console methods
const originalConsole = window.console;
window.console = {
    ...originalConsole,
    log: (...args) => {
        originalConsole.log(...args);
        customConsole.log(...args);
    },
    error: (...args) => {
        originalConsole.error(...args);
        customConsole.error(...args);
    },
    warn: (...args) => {
        originalConsole.warn(...args);
        customConsole.warn(...args);
    }
};
*/


// MAINTAINING YOUR ORIGINAL EDITOR TOGGLE FUNCTIONALITY
let editors = {};

const customConsole = {
    log: function(message) {
        appendToConsole(message, 'info');
    },
    error: function(message) {
        appendToConsole(message, 'error');
    },
    warn: function(message) {
        appendToConsole(message, 'warning');
    },
    clear: function() {
        document.getElementById('console-content').innerHTML = '';
    }
};

function appendToConsole(message, type = 'info') {
    const consoleContent = document.getElementById('console-content');
    const line = document.createElement('div');
    line.className = `console-line console-${type}`;
    line.textContent = typeof message === 'object' ? 
        JSON.stringify(message, null, 2) : message;
    consoleContent.appendChild(line);
    consoleContent.scrollTop = consoleContent.scrollHeight;
}

// ENHANCED EDITOR INITIALIZATION WITH YOUR ORIGINAL STRUCTURE
function initializeEditors() {
    // JavaScript editor (with your original config plus small enhancements)
    editors.js = CodeMirror.fromTextArea(document.getElementById('js-editor'), {
        mode: 'javascript',
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        extraKeys: {
            'Ctrl-Space': 'autocomplete',
            'Ctrl-Enter': function(cm) {
                document.getElementById('run-code').click();
            },
            'Ctrl-V': function(cm) {
                navigator.clipboard.readText().then(text => {
                    cm.replaceSelection(text);
                });
            },
            // New: Add save shortcut
            'Ctrl-S': function() {
                const code = editors.js.getValue();
                const blob = new Blob([code], {type: 'text/javascript'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'code.js';
                a.click();
                showStatus('Code saved successfully');
            }
        },
        hintOptions: {
            completeSingle: false,
            hint: CodeMirror.hint.javascript
        }
    });

    // HTML editor (unchanged)
    editors.html = CodeMirror.fromTextArea(document.getElementById('html-editor'), {
        mode: 'xml',
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        extraKeys: {
            'Ctrl-Space': 'autocomplete'
        }
    });

    // CSS editor (unchanged)
    editors.css = CodeMirror.fromTextArea(document.getElementById('css-editor'), {
        mode: 'css',
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        extraKeys: {
            'Ctrl-Space': 'autocomplete'
        }
    });

    // Initialize with BOTH your cube example AND capsule player
    editors.js.setValue(`// Example 1: Basic Cube
function init() {
    // Create a basic cube
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshPhongMaterial({ 
        color: 0x00ff00,
        metalness: 0.5,
        roughness: 0.5
    });
    const cube = new THREE.Mesh(geometry, material);

    // Add custom properties
    cube.userData.selectable = true;
    cube.userData.type = 'Cube';

    return cube;
}

class PulsatingCube {
    
    // constructor is called when the script is attached.
    // It receives the newly created empty THREE.Group as 'object'.
    constructor(object) {
        // The 3D object this script is attached to.
        this.object = object;
        
        // --- Create your mesh(es) here and add them to the object ---
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            metalness: 0.5,
            roughness: 0.1
        });
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Add the mesh to the parent group.
        this.object.add(this.mesh);

        // You can set initial properties
        this.object.position.y = 0.5;
    }
    
    // start() is called once the object is ready and in the scene.
    start() {
        console.log("PulsatingCube has started!");
        // You could find other objects here, e.g.
        // const player = scene.getObjectByName("Player");
    }
    
    // update() is called on every single frame.
    // 'delta' is the time in seconds since the last frame.
    // 'time' is the total elapsed time since the editor started.
    update(delta, time) {
        // Example 1: Make it rotate
        this.object.rotation.y += delta * 0.5; // Rotate 0.5 radians per second
        this.object.rotation.x += delta * 0.2;
        
        // Example 2: Make it pulsate (scale up and down)
        const scale = 1 + Math.sin(time * 2) * 0.2; // Pulsate between 0.8 and 1.2
        this.object.scale.set(scale, scale, scale);
        
        // Example 3: Change color over time
        this.mesh.material.color.setHSL(time * 0.1 % 1, 0.5, 0.5);
    }
}

// VERY IMPORTANT: Return the class definition.
return PulsatingCube;


/* 
// Example 2: Advanced Capsule Player
function init() {
    // Create capsule player container
    const capsule = new THREE.Group();
    capsule.name = "MusicCapsule";
    
    // Create capsule geometry
    const radius = 1;
    const length = 2;
    const cylinderGeo = new THREE.CylinderGeometry(radius, radius, length, 32);
    cylinderGeo.rotateX(Math.PI/2);
    
    const sphereGeo = new THREE.SphereGeometry(radius, 16, 16);
    
    // Create capsule parts
    const topCap = new THREE.Mesh(sphereGeo, new THREE.MeshPhongMaterial({color: 0x3498db}));
    topCap.position.y = length/2;
    
    const bottomCap = new THREE.Mesh(sphereGeo, new THREE.MeshPhongMaterial({color: 0x3498db}));
    bottomCap.position.y = -length/2;
    bottomCap.rotation.x = Math.PI;
    
    const body = new THREE.Mesh(cylinderGeo, new THREE.MeshPhongMaterial({color: 0x2980b9}));
    
    // Add all parts to capsule
    capsule.add(topCap);
    capsule.add(bottomCap);
    capsule.add(body);
    
    // Position in scene
    capsule.position.set(0, 1, -5);
    
    return capsule;
}
*/`);
}

// YOUR ORIGINAL PANEL TOGGLE LOGIC (UNCHANGED)
document.getElementById('toggle-editor').addEventListener('click', () => {
    const editorPanel = document.getElementById('code-editor-panel');
    editorPanel.classList.toggle('open');
    Object.values(editors).forEach(editor => editor.refresh());
});

// IMPROVED RUN CODE FUNCTION (MAINTAINING YOUR STRUCTURE)
/*
document.getElementById('run-code').addEventListener('click', () => {
    const filename = document.getElementById('filename-input').value || 'unnamed_object';
    const jsCode = editors.js.getValue();

    try {
        const wrappedCode = `
            (function() {
                ${jsCode}
                if (typeof init === 'function') {
                    const result = init();
                    if (result instanceof THREE.Object3D) {
                        addObjectToScene(result, '${filename}');
                    }
                }
            })();
        `;
        
        // New: Better error catching
        try {
            eval(wrappedCode);
            showStatus('Code executed successfully');
        } catch (e) {
            showEnhancedError(e);
        }
    } catch (error) {
        showEnhancedError(error);
    }
});*/

document.getElementById('run-code').addEventListener('click', () => {
    const objectName = document.getElementById('filename-input').value || `ScriptedObject_${Date.now()}`;
    const jsCode = editors.js.getValue();
    
    customConsole.clear();
    showStatus('Executing code...');

    try {
        // This is a safer way to evaluate code and get a return value.
        // It wraps the user's code in a function and executes it.
        const scriptFactory = new Function(jsCode);
        const ScriptClass = scriptFactory();

        // --- VALIDATION ---
        if (typeof ScriptClass !== 'function' || !ScriptClass.prototype) {
            throw new Error("Execution failed: The code must return a class.");
        }
        if (!ScriptClass.prototype.constructor) {
             throw new Error("Execution failed: The returned class is missing a constructor.");
        }

        // --- OBJECT CREATION AND SCRIPT ATTACHMENT ---
        
        // 1. Create a container object (a THREE.Group) for the script.
        //    The script will then populate this group with meshes in its constructor.
        const containerObject = new THREE.Group();
        containerObject.name = objectName;

        // 2. Add the empty object to the scene FIRST.
        scene.add(containerObject);
        addObjectToScene(containerObject, objectName);

        // 3. Attach the script. This will call the constructor, which builds the object's contents.
        scriptManager.attachScript(containerObject, ScriptClass);

        showStatus(`Success! Created and attached script to '${objectName}'`);

    } catch (e) {
        console.error("Script Execution Error:", e);
        customConsole.error(e.stack); // Show full error with line numbers
        showEnhancedError(e); // Use your existing error display
        showStatus('Execution failed. Check console.');
    }
});

// ENHANCED ERROR DISPLAY (WORKS WITH YOUR EXISTING UI)
function showEnhancedError(error) {
    const errorDisplay = document.getElementById('error-display');
    
    // Improved error message formatting
    let errorMessage = error.message;
    if (error.stack) {
        errorMessage += '\n\nStack trace:\n' + error.stack;
    }
    
    errorDisplay.textContent = errorMessage;
    errorDisplay.style.display = 'block';
    
    // Highlight error line in editor if available
    const lineMatch = error.stack.match(/<anonymous>:(\d+):\d+/);
    if (lineMatch) {
        const lineNumber = parseInt(lineMatch[1]) - 1;
        editors.js.addLineClass(lineNumber, 'background', 'error-line');
        editors.js.scrollIntoView({line: lineNumber, ch: 0}, 100);
    }
    
    setTimeout(() => {
        errorDisplay.style.display = 'none';
        document.querySelectorAll('.error-line').forEach(el => {
            el.classList.remove('error-line');
        });
    }, 8000);
}

// YOUR ORIGINAL STATUS FUNCTION (UNCHANGED)
function showStatus(message) {
    document.querySelector('.status-bar-code').textContent = message;
}

// REST OF YOUR ORIGINAL CODE REMAINS THE SAME
const tabs = document.querySelectorAll('.editor-tab');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const editorType = tab.dataset.tab;
        Object.keys(editors).forEach(key => {
            editors[key].getWrapperElement().style.display = 
                key === editorType ? 'block' : 'none';
        });
        editors[editorType].refresh();
    });
});

let isResizingEdit = false;
const resizeHandleEditor = document.querySelector('.resize-handle-Editor');

resizeHandleEditor.addEventListener('mousedown', (e) => {
    isResizingEdit = true;
    document.addEventListener('mousemove', handleMouseMoveEdit);
    document.addEventListener('mouseup', stopResizeEdit);
});

function handleMouseMoveEdit(e) {
    if (!isResizingEdit) return;
    
    const editorPanel = document.getElementById('code-editor-panel');
    const newWidth = window.innerWidth - e.clientX;
    editorPanel.style.width = `${newWidth}px`;
    Object.values(editors).forEach(editor => editor.refresh());
}

function stopResizeEdit() {
    isResizingEdit = false;
    document.removeEventListener('mousemove', handleMouseMoveEdit);
}

document.getElementById('close-editor').addEventListener('click', () => {
    document.getElementById('code-editor-panel').classList.remove('open');
});

document.getElementById('clear-console').addEventListener('click', () => {
    customConsole.clear();
});

// Initialize everything
initializeEditors();


// SCRIPT MANAGER - The heart of our new system
const scriptManager = {
    scripts: [], // Holds all active script instances

    /**
     * Adds a script to an object and initializes it.
     * @param {THREE.Object3D} object - The 3D object to attach the script to.
     * @param {class} ScriptClass - The class definition from the user's code.
     */
    attachScript: function(object, ScriptClass) {
        // 1. Create an instance of the script class
        // We pass the object itself to the script's constructor
        const scriptInstance = new ScriptClass(object);

        // 2. Attach the instance to the object for easy access
        object.userData.script = scriptInstance;

        // 3. Add the instance to our list for updates
        this.scripts.push(scriptInstance);

        // 4. Call the 'start' method if it exists (one-time setup)
        if (typeof scriptInstance.start === 'function') {
            try {
                scriptInstance.start();
            } catch (e) {
                console.error(`Error in start() for ${object.name}:`, e);
                customConsole.error(`Error in start() for ${object.name}: ${e.message}`);
            }
        }
        
        console.log(`Successfully attached script to '${object.name}'`);
        customConsole.log(`Successfully attached script to '${object.name}'`);
    },

    /**
     * This will be called every frame from our main animate() loop.
     * @param {number} delta - Time since the last frame.
     * @param {number} time - Total elapsed time.
     */
    update: function(delta, time) {
        for (const script of this.scripts) {
            // Call the 'update' method if it exists
            if (typeof script.update === 'function') {
                try {
                    script.update(delta, time);
                } catch (e) {
                    // Prevent one bad script from crashing the whole editor
                    console.error(`Error in update() for ${script.object.name}:`, e);
                    customConsole.error(`Error in update() for ${script.object.name}: ${e.message}`);
                    // Optional: remove the broken script to prevent further errors
                    // this.removeScript(script); 
                }
            }
        }
    },
    
    // Optional: Function to remove scripts if an object is deleted
    removeScriptForObject: function(object) {
        if (object.userData.script) {
            this.scripts = this.scripts.filter(script => script !== object.userData.script);
            delete object.userData.script;
            console.log(`Removed script from '${object.name}'`);
        }
    }
};

// Add this CSS for the error highlighting:
/*
.error-line {
    background-color: #ffebee !important;
}
*/