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
