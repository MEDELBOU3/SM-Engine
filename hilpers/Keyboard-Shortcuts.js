// Data for the shortcuts panel
const keyboardShortcuts = {
    general: [
        { key: 'B', description: 'Toggle box selection mode' },
        { key: 'Esc', description: 'Cancel current selection' },
        { key: 'Shift+A / Ctrl+A', description: 'Select all visible objects' },
        { key: 'Delete / Backspace', description: 'Delete selected objects' },
        { key: 'Tab', description: 'Toggle selection panel visibility' }
    ],
    transform: [
        { key: 'G', description: 'Grab/move objects' },
        { key: 'R', description: 'Rotate objects' },
        { key: 'S', description: 'Scale objects' },
        { key: 'X/Y/Z', description: 'Constrain to axis (after G/R/S)' }
    ],
    selection: [
        { key: 'Alt+Click', description: 'Select faces/edges (in modeling mode)' },
        { key: 'Shift+Click', description: 'Add to selection' },
        { key: 'Ctrl+Click', description: 'Remove from selection' }
    ],
    view: [
        { key: 'Numpad 1', description: 'Front view' },
        { key: 'Numpad 3', description: 'Side view' },
        { key: 'Numpad 7', description: 'Top view' },
        { key: 'Numpad 0', description: 'Camera view' }
    ],
    editor: [
        { key: 'Ctrl+E', description: 'Toggle code editor visibility' },
        { key: 'Ctrl+Enter', description: 'Run current code in editor' },
        { key: 'Ctrl+Space', description: 'Trigger autocomplete in editor' },
        { key: 'Ctrl+S', description: 'Save current code' },
        { key: 'Ctrl+Shift+S', description: 'Save code as new file' },
        { key: 'Ctrl+V', description: 'Paste code from clipboard' },
        { key: 'Ctrl+/', description: 'Toggle comment for selected lines' },
        { key: 'F1', description: 'Show editor documentation' },
        { key: 'Ctrl+F', description: 'Find in editor' },
        { key: 'Ctrl+H', description: 'Replace in editor' },
        { key: 'Ctrl+G', description: 'Go to line' },
        { key: 'Ctrl+D', description: 'Select current word' },
        { key: 'Ctrl+L', description: 'Select current line' },
        { key: 'Shift+Tab', description: 'Reindent selected code' }
    ]
};

// Global reference to the panel element
let shortcutsPanel = null;

/**
 * Creates and appends the shortcuts panel to the DOM.
 * This function is idempotent; it won't create a new panel if one already exists.
 */
function createShortcutsPanel() {
    if (shortcutsPanel && document.body.contains(shortcutsPanel)) {
        return shortcutsPanel;
    }

    const panel = document.createElement('div');
    panel.id = 'shortcuts-panel';
    panel.className = 'shortcuts-panel';

    const header = document.createElement('div');
    header.className = 'shortcuts-header';
    header.innerHTML = `
        <h3>Keyboard Shortcuts</h3>
        <button id="close-shortcuts" class="close-btn" title="Close (Esc)">×</button>
    `;
    panel.appendChild(header);

    const tabs = document.createElement('div');
    tabs.className = 'shortcuts-tabs';
    tabs.innerHTML = `
        <button class="tab-btn active" data-tab="general">General</button>
        <button class="tab-btn" data-tab="transform">Transform</button>
        <button class="tab-btn" data-tab="selection">Selection</button>
        <button class="tab-btn" data-tab="view">View</button>
        <button class="tab-btn" data-tab="editor">Editor</button>
        <button class="tab-btn" data-tab="customize">Customize</button>
    `;
    panel.appendChild(tabs);

    // This wrapper is crucial for the flexbox layout to work correctly.
    // It allows the header/search to be fixed while the content scrolls.
    const tabContentsWrapper = document.createElement('div');
    tabContentsWrapper.className = 'tab-contents-wrapper';
    
    const tabContents = document.createElement('div');
    tabContents.className = 'tab-contents';

    for (const [category, shortcuts] of Object.entries(keyboardShortcuts)) {
        const tabContent = document.createElement('div');
        tabContent.className = `tab-content ${category === 'general' ? 'active' : ''}`;
        tabContent.dataset.tab = category;

        if (category === 'editor') {
            tabContent.innerHTML = `
                <div class="editor-guide">
                    <h3>Code Editor Guide</h3>
                    <p>Use the code editor to write JavaScript, HTML, and CSS for creating and manipulating 3D objects.</p>
                    <h4>Accessing the Editor</h4>
                    <ul>
                        <li><kbd>Ctrl+E</kbd>: Show/hide the editor panel.</li>
                        <li>Click the "Toggle Editor" button in the toolbar.</li>
                    </ul>
                    <h4>Editor Tabs</h4>
                    <p>Switch between tabs to edit:</p>
                    <ul>
                        <li><strong>JS</strong>: Create 3D objects with Three.js.</li>
                        <li><strong>HTML</strong>: Edit HTML content.</li>
                        <li><strong>CSS</strong>: Style the scene or interface.</li>
                    </ul>
                    <p>Click a tab to switch; only the active editor is shown.</p>
                    <h4>Writing & Running Code</h4>
                    <p><strong>JavaScript</strong>:</p>
                    <ul>
                        <li>Define an <code>init()</code> function returning a <code>THREE.Object3D</code>.</li>
                        <li>Press <kbd>Ctrl+Enter</kbd> or click "Run Code".</li>
                        <li>Set object name in "Filename" input (default: <code>unnamed_object</code>).</li>
                        <li>Errors appear briefly in the error display.</li>
                    </ul>
                    <p><strong>HTML/CSS</strong>: Support syntax highlighting and auto-completion.</p>
                    <h4>Console</h4>
                    <p>View <code>console.log</code>, <code>console.error</code>, and <code>console.warn</code> output.</p>
                    <ul>
                        <li>Clear with "Clear Console" button or <code>console.clear()</code>.</li>
                        <li>Auto-scrolls to latest message.</li>
                    </ul>
                    <h4>Editor Shortcuts</h4>
                    <table class="shortcuts-table">
                        ${shortcuts.map(shortcut => `
                            <tr>
                                <td class="key-cell"><kbd>${shortcut.key}</kbd></td>
                                <td class="desc-cell">${shortcut.description}</td>
                            </tr>
                        `).join('')}
                    </table>
                    <h4>Resizing</h4>
                    <p>Drag the resize handle to adjust panel width.</p>
                    <h4>Tips</h4>
                    <ul>
                        <li>Use <kbd>Ctrl+Space</kbd> for code completion.</li>
                        <li>Fold code blocks in JS editor using fold gutters.</li>
                        <li>Check console for errors.</li>
                        <li>Customize shortcuts in the "Customize" tab.</li>
                    </ul>
                </div>
            `;
        } else {
            const table = document.createElement('table');
            table.className = 'shortcuts-table';
            table.innerHTML = shortcuts.map(shortcut => `
                <tr>
                    <td class="key-cell"><kbd>${shortcut.key}</kbd></td>
                    <td class="desc-cell">${shortcut.description}</td>
                </tr>
            `).join('');
            tabContent.appendChild(table);
        }
        tabContents.appendChild(tabContent);
    }
    
    const customizeContent = document.createElement('div');
    customizeContent.className = 'tab-content';
    customizeContent.dataset.tab = 'customize';
    customizeContent.innerHTML = `
        <div class="customize-panel">
            <div class="customize-intro">
                <p>Customize keyboard shortcuts by editing key combinations.</p>
                <div class="customize-buttons">
                    <button id="reset-shortcuts" class="outline-btn">Reset to Defaults</button>
                    <button id="add-shortcut" class="primary-btn">Add New Shortcut</button>
                    <button id="export-shortcuts" class="outline-btn">Export Shortcuts</button>
                    <button id="import-shortcuts" class="primary-btn">Import Shortcuts</button>
                </div>
            </div>
            <div class="category-select">
                <label for="category-dropdown">Category:</label>
                <select id="category-dropdown">
                    ${Object.keys(keyboardShortcuts).map(cat => 
                        `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="shortcut-editor-container"></div>
        </div>
    `;
    tabContents.appendChild(customizeContent);
    
    tabContentsWrapper.appendChild(tabContents);
    panel.appendChild(tabContentsWrapper);

    // BUG FIX: The line `panel.appendChild(tabContents)` was here. It was removed
    // because it broke the layout by pulling the content out of its scrollable wrapper.

    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <input type="text" id="shortcut-search" placeholder="Search shortcuts...">
        <div id="search-results" class="search-results"></div>
    `;
    panel.appendChild(searchContainer);

    document.body.appendChild(panel);
    shortcutsPanel = panel;
    return panel;
}

// --- CSS styles are defined here for encapsulation ---
const shortcutsCSS = `
/*──────────────────
  TOKENS
──────────────────*/
:root{
  --bg-panel      : #2B2B2B;
  --bg-header     : #363636;
  --bg-surface    : #404040;
  --bg-hover      : rgba(255,255,255,.06);
  --accent-orange : #FF9D2A;
  --accent-blue   : #6A9BFF;
  --txt-main      : #E2E2E2;
  --txt-muted     : #9B9B9B;
  --radius        : 8px;
  --shadow        : 0 6px 22px rgba(0,0,0,.46);
  --easing        : .18s cubic-bezier(.4,0,.2,1);
}

/*──────────────────
  OUTER PANEL
──────────────────*/
.shortcuts-panel{
  position:fixed;inset:50% auto auto 50%;
  transform:translate(-50%,-50%);
  width:min(780px,92vw);height:min(76vh,92vh);
  background:var(--bg-panel);
  border:1px solid #1f1f1f;
  border-radius:var(--radius);
  box-shadow:var(--shadow);
  z-index:10000;
  
  /* IMPROVEMENT: Always use flex and control visibility with opacity. */
  display:flex;flex-direction:column;
  overflow:hidden;
  opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .25s ease,visibility .25s ease;
}
/* IMPROVEMENT: Use a class for visibility instead of checking style attributes */
.shortcuts-panel.is-visible{
  opacity:1;visibility:visible;pointer-events:auto;
}

/*──────────────────
  HEADER
──────────────────*/
.shortcuts-header{
  flex:0 0 auto;
  display:flex;justify-content:space-between;align-items:center;
  padding:16px 20px;
  background:var(--bg-header);
  border-bottom:1px solid #1f1f1f;
}
.shortcuts-header h3{
  margin:0;font-size:1rem;font-weight:600;color:var(--txt-main);
  letter-spacing:.04em;text-transform:uppercase;
}
.close-btn{
  width:34px;height:34px;display:grid;place-items:center;
  font-size:1.4rem;color:var(--txt-muted);
  border:none;background:none;border-radius:50%;cursor:pointer;
  transition:background var(--easing),color var(--easing);
}
.close-btn:hover,
.close-btn:focus-visible{color:#fff;background:var(--bg-hover);outline:none;}

/*──────────────────
  TAB BAR
──────────────────*/
.shortcuts-tabs{
  flex:0 0 auto;
  display:flex;overflow-x:auto;scrollbar-width:none;
  background:var(--bg-header);
}
.shortcuts-tabs::-webkit-scrollbar{display:none;}
.tab-btn{
  position:relative;flex:0 0 auto;
  padding:12px 22px;font-size:.88rem;font-weight:500;
  color:var(--txt-muted);background:none;border:none;cursor:pointer;
  white-space:nowrap;transition:color var(--easing);
}
.tab-btn:hover{color:var(--txt-main);}
.tab-btn.active{color:#fff;}
.tab-btn.active::after{
  content:'';position:absolute;left:0;bottom:0;
  width:100%;height:3px;border-radius:3px 3px 0 0;
  background:var(--accent-orange);
}

/*──────────────────
  MAIN CONTENT AREA
──────────────────*/
.tab-contents-wrapper{
  flex:1 1 auto;
  display:flex;flex-direction:column;
  position:relative;
  overflow:hidden;
}
.tab-contents{
  flex:1 1 auto; /* This element will grow and scroll */
  overflow-y:auto;
  padding:20px 22px 24px;
}
@media (hover:hover){
  .tab-contents::-webkit-scrollbar{width:8px;}
  .tab-contents::-webkit-scrollbar-thumb{
    background:rgba(255,255,255,.25);border-radius:8px;
  }
  .tab-contents{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent;}
}
.tab-content{display:none;animation:fade .22s ease;}
.tab-content.active{display:block;}
@keyframes fade{from{opacity:.6;transform:translateY(4px);}
                to  {opacity:1;transform:none;}}

/*──────────────────
  SHORTCUT TABLE
──────────────────*/
.shortcuts-table{width:100%;border-collapse:collapse;table-layout:fixed;}
.shortcuts-table tr:not(:last-child){border-bottom:1px solid #1f1f1f;}
.shortcuts-table tr{transition:background var(--easing);}
.shortcuts-table tr:hover{background:var(--bg-hover);}
.key-cell{
  width:180px;padding:12px 0;color:#fff;font-weight:600;
}
.desc-cell{padding:12px 0;color:var(--txt-muted);}
kbd{
  display:inline-block;min-width:24px;
  padding:4px 10px;border-radius:6px;
  font:500 .8rem/1 'Segoe UI',sans-serif;
  background:var(--bg-surface);color:#fff;
  box-shadow:inset 0 -2px 0 rgba(0,0,0,.35);
}

/*──────────────────
  SEARCH BAR (fixed at bottom)
──────────────────*/
.search-container{
  flex:0 0 auto;
  padding:16px 22px;background:var(--bg-header);
  border-top:1px solid #1f1f1f;
}
#shortcut-search{
  width:100%;padding:11px 14px;font-size:.9rem;
  border-radius:6px;border:1px solid #555;
  background:var(--bg-surface);color:var(--txt-main);
  transition:border var(--easing);
  box-sizing: border-box;
}
#shortcut-search:focus{border-color:var(--accent-blue);outline:none;}
.search-results{
  margin-top:10px;max-height:220px;overflow-y:auto;
  display:none;padding:8px;border-radius:6px;background:var(--bg-surface);
}
.search-result{
  display:flex;align-items:center;gap:10px;
  padding:10px 12px;border-radius:6px;cursor:pointer;
  transition:background var(--easing);
}
.search-result:hover{background:var(--bg-hover);}
.result-category{
  padding:3px 10px;border-radius:4px;
  background:var(--accent-orange);color:#000;
  font-size:.72rem;font-weight:600;text-transform:capitalize;
}
.no-results{padding:12px 0;text-align:center;color:var(--txt-muted);}

/*──────────────────
  EDITOR GUIDE STYLES (Replaces inline styles)
──────────────────*/
.editor-guide{
  padding: 16px;
}
.editor-guide h3 { font-size: 1rem; margin: 0 0 10px; }
.editor-guide h4 { font-size: .9rem; margin: 18px 0 8px; font-weight: 600; }
.editor-guide p, .editor-guide ul { margin: 0 0 12px; color: var(--txt-muted); line-height: 1.6; }
.editor-guide ul { padding-left: 20px; }
.editor-guide code {
  background: var(--bg-surface);
  padding: 2px 5px;
  border-radius: 4px;
  font-size: .85em;
  color: var(--txt-main);
}
.editor-guide kbd { margin-right: 4px; }


/*──────────────────
  CUSTOMIZE AREA (Replaces inline styles)
──────────────────*/
.customize-panel{display:flex;flex-direction:column;gap:18px;height:100%; padding: 16px;}
.customize-buttons{display:flex;flex-wrap:wrap;gap:10px;}
.primary-btn,.outline-btn{
  padding:9px 18px;font-size:.85rem;font-weight:600;
  border-radius:6px;cursor:pointer;
  transition:background var(--easing),border var(--easing);
}
.primary-btn{border:none;background:var(--accent-orange);color:#000;}
.primary-btn:hover{background:#e0851d;}
.outline-btn{background:none;border:1px solid #555;color:var(--txt-main);}
.outline-btn:hover{background:var(--bg-hover);}

.category-select { margin-bottom: 10px; }
.category-select label { margin-right: 8px; color: var(--txt-muted); }
#category-dropdown {
    padding: 8px 10px;
    border: 1px solid #555;
    background: var(--bg-surface);
    color: var(--txt-main);
    border-radius: 6px;
}
.shortcut-editor-container{flex:1;overflow-y:auto;}
.shortcut-editor{
  display:flex;align-items:center;gap:14px;
  padding:14px 16px;margin-bottom:10px;
  background:var(--bg-surface);border-radius:var(--radius);
}
.shortcut-desc { flex: 1; }
.desc-input{
  width:100%;box-sizing:border-box;
  padding:10px 12px;font-size:.88rem;
  border-radius:6px;border:1px solid #4e4e4e;
  background:#2c2c2c;color:var(--txt-main);
}
.key-capture-btn{
  flex:0 0 auto;min-width:120px;text-align:center;cursor:pointer;
  padding:10px 12px;font-size:.88rem;
  border-radius:6px;border:1px solid #4e4e4e;
  background:#2c2c2c;color:var(--txt-main);
  transition:background var(--easing),border var(--easing);
}
.key-capture-btn:hover{background:#373737;}
.key-capture-btn.listening{
  background:var(--accent-blue);border-color:var(--accent-blue);
  color: #fff;
}
.listening-indicator { display: none; color: var(--txt-muted); }
.key-capture-btn.listening + .listening-indicator { display: inline; }

.delete-shortcut{
  width:32px;height:32px;display:grid;place-items:center;
  background:none;border:none;color:var(--txt-muted);border-radius:6px;
  cursor:pointer;transition:color var(--easing),background var(--easing);
}
.delete-shortcut:hover{color:#ff5454;background:var(--bg-hover);}
.delete-shortcut svg { width: 16px; height: 16px; }

/*──────────────────
  MOBILE
──────────────────*/
@media (max-width:540px){
  .shortcuts-panel{width:96vw;height:90vh;}
  .tab-btn{padding:10px 16px;font-size:.78rem;}
  .key-cell{width:150px;}
}
`;


// --- Helper Functions and Initialization ---

/**
 * Creates the "Keyboard Shortcuts" button in the toolbar.
 */
function createShortcutsButton() {
    if (document.getElementById('toggle-shortcuts')) return;
    const button = document.createElement('button');
    button.id = 'toggle-shortcuts';
    button.className = 'tool-btn';
    button.title = 'Keyboard Shortcuts (?)';
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 8h4M9 12h6M9 16h2M12 4h.01M16 4h.01M20 4h.01M20 8h.01M20 12h.01M4 20h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"></path>
        </svg>
    `;
    const target = document.querySelector('.toolbar') || document.body;
    target.appendChild(button);
    return button;
}

/**
 * Main function to initialize the panel and its event listeners.
 */
function initShortcutsPanel() {
    const panel = createShortcutsPanel();
    const button = createShortcutsButton();

    const togglePanel = (forceState) => {
        panel.classList.toggle('is-visible', forceState);
    };

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel();
    });

    panel.querySelector('#close-shortcuts').addEventListener('click', () => togglePanel(false));

    panel.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            panel.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            const content = panel.querySelector(`.tab-content[data-tab="${tabName}"]`);
            if (content) {
                content.classList.add('active');
                if (tabName === 'customize') {
                    const dropdown = document.getElementById('category-dropdown');
                    createShortcutEditors(dropdown.value);
                }
            }
        });
    });

    const searchInput = document.getElementById('shortcut-search');
    const searchResults = document.getElementById('search-results');
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        searchResults.innerHTML = '';
        searchResults.style.display = query.length < 2 ? 'none' : 'block';
        if (query.length < 2) return;

        const results = Object.entries(keyboardShortcuts).flatMap(([category, shortcuts]) =>
            shortcuts.filter(s => s.key.toLowerCase().includes(query) || s.description.toLowerCase().includes(query))
            .map(s => ({ ...s, category }))
        );

        searchResults.innerHTML = results.length > 0 ?
            results.map(r => `
                <div class="search-result" data-category="${r.category}">
                    <span class="result-category">${r.category}</span>
                    <kbd>${r.key}</kbd>
                    <span>${r.description}</span>
                </div>
            `).join('') :
            '<div class="no-results">No matching shortcuts found</div>';

        searchResults.querySelectorAll('.search-result').forEach(result => {
            result.addEventListener('click', () => {
                const category = result.dataset.category;
                panel.querySelector(`.tab-btn[data-tab="${category}"]`)?.click();
                searchInput.value = '';
                searchResults.style.display = 'none';
            });
        });
    });

    document.addEventListener('click', e => {
        if (panel.classList.contains('is-visible') && !panel.contains(e.target) && e.target !== button && !button.contains(e.target)) {
            togglePanel(false);
        }
    });

    document.addEventListener('keydown', e => {
        if (panel.classList.contains('is-visible') && e.key === 'Escape') {
            togglePanel(false);
        } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                togglePanel();
            }
        }
    });
}

function loadCustomShortcuts() {
    try {
        const saved = localStorage.getItem('userKeyboardShortcuts');
        if (saved) {
            const custom = JSON.parse(saved);
            Object.assign(keyboardShortcuts, custom);
        }
    } catch (error) {
        console.error('Failed to load custom shortcuts:', error);
    }
}

function saveCustomShortcuts() {
    try {
        localStorage.setItem('userKeyboardShortcuts', JSON.stringify(keyboardShortcuts));
    } catch (error) {
        console.error('Failed to save custom shortcuts:', error);
    }
}

function createShortcutEditors(category) {
    const container = document.querySelector('.shortcut-editor-container');
    if (!container) return;
    
    container.innerHTML = ''; // Clear previous editors
    if (!keyboardShortcuts[category]) return;

    keyboardShortcuts[category].forEach((shortcut, index) => {
        const row = document.createElement('div');
        row.className = 'shortcut-editor';
        row.dataset.index = index;
        row.innerHTML = `
            <div class="shortcut-desc">
                <input type="text" class="desc-input" value="${shortcut.description}" placeholder="Description">
            </div>
            <div class="shortcut-key">
                <button class="key-capture-btn">${shortcut.key}</button>
                <span class="listening-indicator">Press any key...</span>
            </div>
            <div class="shortcut-actions">
                <button class="delete-shortcut" title="Remove Shortcut">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        container.appendChild(row);

        const keyButton = row.querySelector('.key-capture-btn');
        keyButton.addEventListener('click', () => {
            keyButton.classList.add('listening');
            keyButton.textContent = 'Listening...';
            
            const keydownHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const keyCombo = [
                    e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift',
                    !['Control', 'Alt', 'Shift'].includes(e.key) && (e.key.length === 1 ? e.key.toUpperCase() : e.key)
                ].filter(Boolean).join('+');
                
                keyButton.textContent = keyCombo;
                keyboardShortcuts[category][index].key = keyCombo;
                saveCustomShortcuts();
                
                keyButton.classList.remove('listening');
                document.removeEventListener('keydown', keydownHandler, { capture: true });
            };
            
            document.addEventListener('keydown', keydownHandler, { once: true, capture: true });
        });

        row.querySelector('.delete-shortcut').addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete the shortcut "${shortcut.description}"?`)) {
                keyboardShortcuts[category].splice(index, 1);
                saveCustomShortcuts();
                createShortcutEditors(category);
            }
        });

        row.querySelector('.desc-input').addEventListener('change', e => {
            keyboardShortcuts[category][index].description = e.target.value;
            saveCustomShortcuts();
        });
    });
}

function setupCustomizationEvents() {
    const panel = document.getElementById('shortcuts-panel');
    if (!panel) return;

    panel.addEventListener('click', (e) => {
        const resetBtn = e.target.closest('#reset-shortcuts');
        const addBtn = e.target.closest('#add-shortcut');
        const exportBtn = e.target.closest('#export-shortcuts');
        const importBtn = e.target.closest('#import-shortcuts');

        if (resetBtn) {
            if (confirm('Are you sure you want to reset all shortcuts to their defaults? This cannot be undone.')) {
                localStorage.removeItem('userKeyboardShortcuts');
                window.location.reload();
            }
        } else if (addBtn) {
            const dropdown = document.getElementById('category-dropdown');
            const category = dropdown.value;
            keyboardShortcuts[category].push({ key: 'Click to Set', description: 'New Shortcut' });
            saveCustomShortcuts();
            createShortcutEditors(category);
            const container = document.querySelector('.shortcut-editor-container');
            container.scrollTop = container.scrollHeight;
        } else if (exportBtn) {
            const blob = new Blob([JSON.stringify(keyboardShortcuts, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'keyboard_shortcuts.json';
            a.click();
            URL.revokeObjectURL(url);
        } else if (importBtn) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = e => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const imported = JSON.parse(event.target.result);
                            Object.assign(keyboardShortcuts, imported); // Simple merge
                            saveCustomShortcuts();
                            alert('Shortcuts imported successfully! The panel will now refresh.');
                            window.location.reload();
                        } catch (err) {
                            alert('Failed to import shortcuts: Invalid file format.');
                        }
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        }
    });

    const categoryDropdown = document.getElementById('category-dropdown');
    if (categoryDropdown) {
        categoryDropdown.addEventListener('change', (e) => createShortcutEditors(e.target.value));
    }
}

/**
 * The main entry point for the entire system.
 */
function initializeShortcutsSystem() {
    const style = document.createElement('style');
    style.textContent = shortcutsCSS;
    document.head.appendChild(style);

    loadCustomShortcuts();
    initShortcutsPanel();
    setupCustomizationEvents();
}

// --- Initialization ---
// Ensures the setup runs only once, after the DOM is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeShortcutsSystem);
} else {
    initializeShortcutsSystem();
}

/*

const keyboardShortcuts = {
    general: [
        { key: 'B', description: 'Toggle box selection mode' },
        { key: 'Esc', description: 'Cancel current selection' },
        { key: 'Shift+A / Ctrl+A', description: 'Select all visible objects' },
        { key: 'Delete / Backspace', description: 'Delete selected objects' },
        { key: 'Tab', description: 'Toggle selection panel visibility' }
    ],
    transform: [
        { key: 'G', description: 'Grab/move objects' },
        { key: 'R', description: 'Rotate objects' },
        { key: 'S', description: 'Scale objects' },
        { key: 'X/Y/Z', description: 'Constrain to axis (after G/R/S)' }
    ],
    selection: [
        { key: 'Alt+Click', description: 'Select faces/edges (in modeling mode)' },
        { key: 'Shift+Click', description: 'Add to selection' },
        { key: 'Ctrl+Click', description: 'Remove from selection' }
    ],
    view: [
        { key: 'Numpad 1', description: 'Front view' },
        { key: 'Numpad 3', description: 'Side view' },
        { key: 'Numpad 7', description: 'Top view' },
        { key: 'Numpad 0', description: 'Camera view' }
    ],
    editor: [
        { key: 'Ctrl+E', description: 'Toggle code editor visibility' },
        { key: 'Ctrl+Enter', description: 'Run current code in editor' },
        { key: 'Ctrl+Space', description: 'Trigger autocomplete in editor' },
        { key: 'Ctrl+S', description: 'Save current code' },
        { key: 'Ctrl+Shift+S', description: 'Save code as new file' },
        { key: 'Ctrl+V', description: 'Paste code from clipboard' },
        { key: 'Ctrl+/', description: 'Toggle comment for selected lines' },
        { key: 'F1', description: 'Show editor documentation' },
        { key: 'Ctrl+F', description: 'Find in editor' },
        { key: 'Ctrl+H', description: 'Replace in editor' },
        { key: 'Ctrl+G', description: 'Go to line' },
        { key: 'Ctrl+D', description: 'Select current word' },
        { key: 'Ctrl+L', description: 'Select current line' },
        { key: 'Shift+Tab', description: 'Reindent selected code' }
    ]
};

let shortcutsPanel = null;

function createShortcutsPanel() {
     if (shortcutsPanel && document.body.contains(shortcutsPanel)) {
        return shortcutsPanel;
    }


    const panel = document.createElement('div');
    panel.id = 'shortcuts-panel';
    panel.className = 'shortcuts-panel';
    panel.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'shortcuts-header';
    header.innerHTML = `
        <h3>Keyboard Shortcuts</h3>
        <button id="close-shortcuts" class="close-btn">×</button>
    `;
    panel.appendChild(header);

    const tabs = document.createElement('div');
    tabs.className = 'shortcuts-tabs';
    tabs.innerHTML = `
        <button class="tab-btn active" data-tab="general">General</button>
        <button class="tab-btn" data-tab="transform">Transform</button>
        <button class="tab-btn" data-tab="selection">Selection</button>
        <button class="tab-btn" data-tab="view">View</button>
        <button class="tab-btn" data-tab="editor">Editor</button>
        <button class="tab-btn" data-tab="customize">Customize</button>
    `;
    panel.appendChild(tabs);

    const tabContentsWrapper = document.createElement('div');
    tabContentsWrapper.className = 'tab-contents-wrapper';
    
    const tabContents = document.createElement('div');
    tabContents.className = 'tab-contents';
  

    for (const [category, shortcuts] of Object.entries(keyboardShortcuts)) {
        const tabContent = document.createElement('div');
        tabContent.className = `tab-content ${category === 'general' ? 'active' : ''}`;
        tabContent.dataset.tab = category;
        tabContent.style.display = category === 'general' ? 'block' : 'none';

        if (category === 'editor') {
            tabContent.innerHTML = `
                <div style="padding: 16px;">
                    <h3 style="font-size: 16px; margin: 0 0 10px;">Code Editor Guide</h3>
                    <p style="margin: 0 0 10px;">Use the code editor to write JavaScript, HTML, and CSS for creating and manipulating 3D objects.</p>
                    <h4 style="font-size: 14px; margin: 15px 0 5px;">Accessing the Editor</h4>
                    <ul style="margin: 0 0 10px; padding-left: 20px;">
                        <li><kbd>Ctrl+E</kbd>: Show/hide the editor panel.</li>
                        <li>Click the "Toggle Editor" button in the toolbar.</li>
                    </ul>
                    <h4 style="font-size: 14px; margin: 15px 0 5px;">Editor Tabs</h4>
                    <p style="margin: 0 0 10px;">Switch between tabs to edit:</p>
                    <ul style="margin: 0 0 10px; padding-left: 20px;">
                        <li><strong>JS</strong>: Create 3D objects with Three.js.</li>
                        <li><strong>HTML</strong>: Edit HTML content.</li>
                        <li><strong>CSS</strong>: Style the scene or interface.</li>
                    </ul>
                    <p style="margin: 0 0 10px;">Click a tab to switch; only the active editor is shown.</p>
                    <h4 style="font-size: 14px; margin: 15px 0 5px;">Writing & Running Code</h4>
                    <p style="margin: 0 0 5px;"><strong>JavaScript</strong>:</p>
                    <ul style="margin: 0 0 10px; padding-left: 20px;">
                        <li>Define an <code style="background: #444; padding: 2px 4px; border-radius: 3px;">init()</code> function returning a <code style="background: #444; padding: 2px 4px; border-radius: 3px;">THREE.Object3D</code>.</li>
                        <li>Press <kbd>Ctrl+Enter</kbd> or click "Run Code".</li>
                        <li>Set object name in "Filename" input (default: <code style="background: #444; padding: 2px 4px; border-radius: 3px;">unnamed_object</code>).</li>
                        <li>Errors appear briefly in the error display.</li>
                    </ul>
                    <p style="margin: 0 0 10px;"><strong>HTML/CSS</strong>: Support syntax highlighting and auto-completion.</p>
                    <h4 style="font-size: 14px; margin: 15px 0 5px;">Console</h4>
                    <p style="margin: 0 0 10px;">View <code style="background: #444; padding: 2px 4px; border-radius: 3px;">console.log</code>, <code style="background: #444; padding: 2px 4px; border-radius: 3px;">console.error</code>, and <code style="background: #444; padding: 2px 4px; border-radius: 3px;">console.warn</code> output.</p>
                    <ul style="margin: 0 0 10px; padding-left: 20px;">
                        <li>Clear with "Clear Console" button or <code style="background: #444; padding: 2px 4px; border-radius: 3px;">console.clear()</code>.</li>
                        <li>Auto-scrolls to latest message.</li>
                    </ul>
                    <h4 style="font-size: 14px; margin: 15px 0 5px;">Editor Shortcuts</h4>
                    <table class="shortcuts-table">
                        ${shortcuts.map(shortcut => `
                            <tr>
                                <td class="key-cell"><kbd>${shortcut.key}</kbd></td>
                                <td class="desc-cell">${shortcut.description}</td>
                            </tr>
                        `).join('')}
                    </table>
                    <h4 style="font-size: 14px; margin: 15px 0 5px;">Resizing</h4>
                    <p style="margin: 0 0 10px;">Drag the resize handle to adjust panel width.</p>
                    <h4 style="font-size: 14px; margin: 15px 0 5px;">Tips</h4>
                    <ul style="margin: 0 0 10px; padding-left: 20px;">
                        <li>Use <kbd>Ctrl+Space</kbd> for code completion.</li>
                        <li>Fold code blocks in JS editor using fold gutters.</li>
                        <li>Check console for errors.</li>
                        <li>Customize shortcuts in the "Customize" tab.</li>
                    </ul>
                </div>
            `;
        } else {
            const table = document.createElement('table');
            table.className = 'shortcuts-table';
            shortcuts.forEach(shortcut => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="key-cell"><kbd>${shortcut.key}</kbd></td>
                    <td class="desc-cell">${shortcut.description}</td>
                `;
                table.appendChild(row);
            });
            tabContent.appendChild(table);
        }
        tabContents.appendChild(tabContent);
    }

    tabContentsWrapper.appendChild(tabContents);
    panel.appendChild(tabContentsWrapper);

    const customizeContent = document.createElement('div');
    customizeContent.className = 'tab-content';
    customizeContent.dataset.tab = 'customize';
    customizeContent.style.display = 'none';
    customizeContent.innerHTML = `
        <div class="customize-panel" style="padding: 16px;">
            <div class="customize-intro">
                <p style="margin: 0 0 10px;">Customize keyboard shortcuts by editing key combinations.</p>
                <div class="customize-buttons" style="display: flex; gap: 8px; margin-bottom: 10px;">
                    <button id="reset-shortcuts" class="outline-btn" style="padding: 6px 12px; border: 1px solid #555; background: none; color: #fff; border-radius: 4px; cursor: pointer;">Reset to Defaults</button>
                    <button id="add-shortcut" class="primary-btn" style="padding: 6px 12px; background: #4285F4; border: none; color: #fff; border-radius: 4px; cursor: pointer;">Add New Shortcut</button>
                    <button id="export-shortcuts" class="outline-btn" style="padding: 6px 12px; border: 1px solid #555; background: none; color: #fff; border-radius: 4px; cursor: pointer;">Export Shortcuts</button>
                    <button id="import-shortcuts" class="primary-btn" style="padding: 6px 12px; background: #4285F4; border: none; color: #fff; border-radius: 4px; cursor: pointer;">Import Shortcuts</button>
                </div>
            </div>
            <div class="category-select" style="margin-bottom: 10px;">
                <label for="category-dropdown" style="margin-right: 8px;">Category:</label>
                <select id="category-dropdown" style="padding: 6px; border: 1px solid #555; background: #444; color: #fff; border-radius: 4px;">
                    ${Object.keys(keyboardShortcuts).map(cat => 
                        `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="shortcut-editor-container"></div>
        </div>
    `;
    tabContents.appendChild(customizeContent);

    panel.appendChild(tabContents);

    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <input type="text" id="shortcut-search" placeholder="Search shortcuts...">
        <div id="search-results" class="search-results"></div>
    `;
    panel.appendChild(searchContainer);

    document.body.appendChild(panel);
    shortcutsPanel = panel;
    return panel;
}

const shortcutsCSS = `

:root{
  --bg-panel      : #2B2B2B;
  --bg-header     : #363636;
  --bg-surface    : #404040;
  --bg-hover      : rgba(255,255,255,.06);
  --accent-orange : #FF9D2A;  
  --accent-blue   : #6A9BFF;
  --txt-main      : #E2E2E2;
  --txt-muted     : #9B9B9B;
  --radius        : 8px;
  --shadow        : 0 6px 22px rgba(0,0,0,.46);
  --easing        : .18s cubic-bezier(.4,0,.2,1);
}


.shortcuts-panel{
  position:fixed;inset:50% auto auto 50%;
  transform:translate(-50%,-50%);
  width:min(780px,92vw);height:min(76vh,92vh);
  background:var(--bg-panel);
  border:1px solid #1f1f1f;
  border-radius:var(--radius);
  box-shadow:var(--shadow);
  display:flex;flex-direction:column;overflow:hidden;
  z-index:10000;
  opacity:0;visibility:hidden;
  transition:opacity .25s ease,visibility .25s ease;
}
.shortcuts-panel[style*="block"]{opacity:1;visibility:visible;}


.shortcuts-header{
  flex:0 0 auto;
  display:flex;justify-content:space-between;align-items:center;
  padding:16px 20px;
  background:var(--bg-header);
  border-bottom:1px solid #1f1f1f;
}
.shortcuts-header h3{
  margin:0;font-size:1rem;font-weight:600;color:var(--txt-main);
  letter-spacing:.04em;text-transform:uppercase;
}
.close-btn{
  width:34px;height:34px;display:grid;place-items:center;
  font-size:1.4rem;color:var(--txt-muted);
  border:none;background:none;border-radius:50%;cursor:pointer;
  transition:background var(--easing),color var(--easing);
}
.close-btn:hover,
.close-btn:focus-visible{color:#fff;background:var(--bg-hover);outline:none;}


.shortcuts-tabs{
  flex:0 0 auto;
  display:flex;overflow-x:auto;scrollbar-width:none;
  background:var(--bg-header);
}
.shortcuts-tabs::-webkit-scrollbar{display:none;}
.tab-btn{
  position:relative;flex:0 0 auto;
  padding:12px 22px;font-size:.88rem;font-weight:500;
  color:var(--txt-muted);background:none;border:none;cursor:pointer;
  white-space:nowrap;transition:color var(--easing);
}
.tab-btn:hover{color:var(--txt-main);}
.tab-btn.active{color:#fff;}
.tab-btn.active::after{
  content:'';position:absolute;left:0;bottom:0;
  width:100%;height:3px;border-radius:3px 3px 0 0;
  background:var(--accent-orange);
}


.tab-contents-wrapper{    
  flex:1 1 auto;
  display:flex;flex-direction:column;overflow:hidden;
}


.tab-contents{
  flex:1 1 auto;
  overflow-y:auto;
  padding:20px 22px 24px;
}
@media (hover:hover){
  .tab-contents::-webkit-scrollbar{width:8px;}
  .tab-contents::-webkit-scrollbar-thumb{
    background:rgba(255,255,255,.25);border-radius:8px;
  }
  .tab-contents{-ms-overflow-style:none;scrollbar-width:thin;}
}

.tab-content{display:none;animation:fade .22s ease;}
.tab-content.active{display:block;}
@keyframes fade{from{opacity:.6;transform:translateY(4px);}
                to  {opacity:1;transform:none;}}


.shortcuts-table{width:100%;border-collapse:collapse;table-layout:fixed;}
.shortcuts-table tr:not(:last-child){border-bottom:1px solid #1f1f1f;}
.shortcuts-table tr{transition:background var(--easing);}
.shortcuts-table tr:hover{background:var(--bg-hover);}
.key-cell{
  width:180px;padding:12px 0;color:#fff;font-weight:600;
}
.desc-cell{padding:12px 0;color:var(--txt-muted);}
kbd{
  display:inline-block;min-width:24px;
  padding:4px 10px;border-radius:6px;
  font:500 .8rem/1 'Segoe UI',sans-serif;
  background:var(--bg-surface);color:#fff;
  box-shadow:inset 0 -2px 0 rgba(0,0,0,.35);
}


.search-container{
  flex:0 0 auto;
  padding:16px 22px;background:var(--bg-header);
  border-top:1px solid #1f1f1f;
}
#shortcut-search{
  width:100%;padding:11px 14px;font-size:.9rem;
  border-radius:6px;border:1px solid #555;
  background:var(--bg-surface);color:var(--txt-main);
  transition:border var(--easing);
}
#shortcut-search:focus{border-color:var(--accent-blue);outline:none;}
.search-results{
  margin-top:10px;max-height:220px;overflow-y:auto;
  display:none;padding:8px;border-radius:6px;background:var(--bg-surface);
}
.search-result{
  display:flex;align-items:center;gap:10px;
  padding:10px 12px;border-radius:6px;cursor:pointer;
  transition:background var(--easing);
}
.search-result:hover{background:var(--bg-hover);}
.result-category{
  padding:3px 10px;border-radius:4px;
  background:var(--accent-orange);color:#000;
  font-size:.72rem;font-weight:600;text-transform:capitalize;
}
.no-results{padding:12px 0;text-align:center;color:var(--txt-muted);}


.customize-panel{display:flex;flex-direction:column;gap:18px;height:100%;}
.customize-buttons{display:flex;flex-wrap:wrap;gap:10px;}
.primary-btn,.outline-btn{
  padding:9px 18px;font-size:.85rem;font-weight:600;
  border-radius:6px;cursor:pointer;
  transition:background var(--easing),border var(--easing);
}
.primary-btn{border:none;background:var(--accent-orange);color:#000;}
.primary-btn:hover{background:#e0851d;}
.outline-btn{background:none;border:1px solid #555;color:var(--txt-main);}
.outline-btn:hover{background:var(--bg-hover);}
.shortcut-editor-container{flex:1;overflow-y:auto;}
.shortcut-editor{
  display:flex;align-items:center;gap:14px;
  padding:14px 16px;margin-bottom:10px;
  background:var(--bg-surface);border-radius:var(--radius);
}
.desc-input,.key-capture-btn{
  flex:1;padding:10px 12px;font-size:.88rem;
  border-radius:6px;border:1px solid #4e4e4e;
  background:#2c2c2c;color:var(--txt-main);
}
.key-capture-btn{
  flex:0 0 auto;min-width:120px;text-align:center;cursor:pointer;
  transition:background var(--easing),border var(--easing);
}
.key-capture-btn:hover{background:#373737;}
.key-capture-btn.listening{
  background:var(--accent-blue);border-color:var(--accent-blue);
}
.delete-shortcut{
  width:32px;height:32px;display:grid;place-items:center;
  background:none;border:none;color:var(--txt-muted);border-radius:6px;
  cursor:pointer;transition:color var(--easing),background var(--easing);
}
.delete-shortcut:hover{color:#ff5454;background:var(--bg-hover);}


@media (max-width:540px){
  .shortcuts-panel{width:96vw;height:90vh;}
  .tab-btn{padding:10px 16px;font-size:.78rem;}
  .key-cell{width:150px;}
}
`;



const style = document.createElement('style');
style.textContent = shortcutsCSS;
document.head.appendChild(style);


function createShortcutsButton() {
    // Check if button already exists
    const existingBtn = document.getElementById('toggle-shortcuts');
    if (existingBtn) return existingBtn;

    const button = document.createElement('button');
    button.id = 'toggle-shortcuts';
    button.className = 'tool-btn';
    button.title = 'Keyboard Shortcuts (?)';
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 8h4M9 12h6M9 16h2M12 4h.01M16 4h.01M20 4h.01M20 8h.01M20 12h.01M4 20h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"></path>
        </svg>
       
    `;

    const target = document.querySelector('.toolbar') || 
                   document.getElementById('renderer-container')?.parentNode || 
                   document.body;
    target.appendChild(button);
    return button;
}

function initShortcutsPanel() {
    const panel = createShortcutsPanel();
    const button = createShortcutsButton();

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        
        // Initialize the first tab if not already done
        if (panel.style.display === 'block') {
            const firstTab = panel.querySelector('.tab-btn.active');
            if (firstTab) {
                const tabName = firstTab.dataset.tab;
                const content = panel.querySelector(`.tab-content[data-tab="${tabName}"]`);
                if (content) {
                    content.style.display = 'block';
                }
            }
        }
    });

    document.getElementById('close-shortcuts').addEventListener('click', () => {
        panel.style.display = 'none';
    });

    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabButtons.forEach(t => t.classList.remove('active'));
            
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(t => {
                t.classList.remove('active');
                t.style.display = 'none';
            });
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Show corresponding content
            const tabName = tab.dataset.tab;
            const content = document.querySelector(`.tab-content[data-tab="${tabName}"]`);
            if (content) {
                content.classList.add('active');
                content.style.display = 'block';
                
                // If it's the customize tab, initialize the editors
                if (tabName === 'customize') {
                    const dropdown = document.getElementById('category-dropdown');
                    createShortcutEditors(dropdown.value);
                }
            }
        });
    });

    const searchInput = document.getElementById('shortcut-search');
    const searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        searchResults.innerHTML = '';
        searchResults.style.display = query.length < 2 ? 'none' : 'block';

        if (query.length < 2) return;

        const results = Object.entries(keyboardShortcuts).flatMap(([category, shortcuts]) =>
            shortcuts.filter(s => 
                s.key.toLowerCase().includes(query) || 
                s.description.toLowerCase().includes(query)
            ).map(s => ({ ...s, category }))
        );

        searchResults.innerHTML = results.length > 0 ? 
            results.map(r => `
                <div class="search-result" data-category="${r.category}">
                    <span class="result-category">${r.category}</span>
                    <kbd>${r.key}</kbd>
                    <span>${r.description}</span>
                </div>
            `).join('') : 
            '<div class="no-results">No matching shortcuts found</div>';

        document.querySelectorAll('.search-result').forEach(result => {
            result.addEventListener('click', () => {
                const category = result.dataset.category;
                tabButtons.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => {
                    t.classList.remove('active');
                    t.style.display = 'none';
                });
                const tab = document.querySelector(`.tab-btn[data-tab="${category}"]`);
                const content = document.querySelector(`.tab-content[data-tab="${category}"]`);
                if (tab && content) {
                    tab.classList.add('active');
                    content.classList.add('active');
                    content.style.display = 'block';
                }
                searchInput.value = '';
                searchResults.style.display = 'none';
            });
        });
    });

    document.addEventListener('click', e => {
        if (panel.style.display === 'block' && 
            !panel.contains(e.target) && 
            e.target !== button && 
            !button.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === '?' || (e.key === '/' && e.shiftKey) || 
            (e.key === 'Tab' && typeof selectionEnabled !== 'undefined' && selectionEnabled)) {
            e.preventDefault();
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    });

     const closeBtn = panel.querySelector('#close-shortcuts');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }
}

function loadCustomShortcuts() {
    try {
        const saved = localStorage.getItem('userKeyboardShortcuts');
        if (saved) {
            const custom = JSON.parse(saved);
            for (const category in custom) {
                if (keyboardShortcuts[category]) {
                    custom[category].forEach(cs => {
                        const index = keyboardShortcuts[category].findIndex(s => s.description === cs.description);
                        if (index !== -1) {
                            keyboardShortcuts[category][index].key = cs.key;
                        } else {
                            keyboardShortcuts[category].push(cs);
                        }
                    });
                } else {
                    keyboardShortcuts[category] = custom[category];
                }
            }
        }
    } catch (error) {
        console.error('Failed to load custom shortcuts:', error);
    }
}

function saveCustomShortcuts() {
    try {
        localStorage.setItem('userKeyboardShortcuts', JSON.stringify(keyboardShortcuts));
    } catch (error) {
        console.error('Failed to save custom shortcuts:', error);
    }
}

function createShortcutEditors(category) {
    const container = document.querySelector('.shortcut-editor-container');
    if (!container) return;
    
    container.innerHTML = '';

    keyboardShortcuts[category].forEach((shortcut, index) => {
        const row = document.createElement('div');
        row.className = 'shortcut-editor';
        row.dataset.index = index;
        row.innerHTML = `
            <div class="shortcut-desc" style="flex: 1;">
                <input type="text" class="desc-input" value="${shortcut.description}" placeholder="Description" style="width: 100%; padding: 6px; border: 1px solid #555; background: #444; color: #fff; border-radius: 4px;">
            </div>
            <div class="shortcut-key" style="display: flex; align-items: center; gap: 8px;">
                <button class="key-capture-btn" style="padding: 6px 12px; border: 1px solid #555; background: #444; color: #fff; border-radius: 4px;">${shortcut.key}</button>
                <span class="listening-indicator" style="display: none; color: #999;">Press any key...</span>
            </div>
            <div class="shortcut-actions">
                <button class="delete-shortcut" title="Remove Shortcut" style="background: none; border: none; color: #aaa; cursor: pointer;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        container.appendChild(row);

        const keyButton = row.querySelector('.key-capture-btn');
        const indicator = row.querySelector('.listening-indicator');

        keyButton.addEventListener('click', () => {
            indicator.style.display = 'inline';
            keyButton.classList.add('listening');
            
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const keyCombo = [
                    e.ctrlKey && 'Ctrl',
                    e.altKey && 'Alt',
                    e.shiftKey && 'Shift',
                    !['Control', 'Alt', 'Shift'].includes(e.key) && (
                        { ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' }[e.key] || 
                        e.key.charAt(0).toUpperCase() + e.key.slice(1)
                    )
                ].filter(Boolean).join('+');
                keyButton.textContent = keyCombo;
                keyboardShortcuts[category][index].key = keyCombo;
                saveCustomShortcuts();
                indicator.style.display = 'none';
                keyButton.classList.remove('listening');
                document.removeEventListener('keydown', handler);
            };
            
            document.addEventListener('keydown', handler, { once: true });
        });

        row.querySelector('.delete-shortcut').addEventListener('click', () => {
            if (confirm('Delete this shortcut?')) {
                keyboardShortcuts[category].splice(index, 1);
                saveCustomShortcuts();
                createShortcutEditors(category);
            }
        });

        row.querySelector('.desc-input').addEventListener('change', e => {
            keyboardShortcuts[category][index].description = e.target.value;
            saveCustomShortcuts();
        });
    });
}

function setupCustomizationEvents() {
    const dropdown = document.getElementById('category-dropdown');
    if (!dropdown) return;
    
    dropdown.addEventListener('change', () => createShortcutEditors(dropdown.value));

    const resetBtn = document.getElementById('reset-shortcuts');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset all shortcuts to defaults?')) {
                localStorage.removeItem('userKeyboardShortcuts');
                window.location.reload();
            }
        });
    }

    const addBtn = document.getElementById('add-shortcut');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const category = dropdown.value;
            keyboardShortcuts[category].push({ key: 'Click to set', description: 'New Shortcut' });
            saveCustomShortcuts();
            createShortcutEditors(category);
            const container = document.querySelector('.shortcut-editor-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });
    }

    const exportBtn = document.getElementById('export-shortcuts');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(keyboardShortcuts, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'keyboard_shortcuts.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    const importBtn = document.getElementById('import-shortcuts');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.addEventListener('change', () => {
                if (input.files.length > 0) {
                    const reader = new FileReader();
                    reader.onload = e => {
                        try {
                            const imported = JSON.parse(e.target.result);
                            const isValid = Object.values(imported).every(cat => 
                                Array.isArray(cat) && cat.every(s => typeof s.key === 'string' && typeof s.description === 'string')
                            );
                            if (!isValid) throw new Error('Invalid shortcuts format');
                            for (const category in imported) {
                                if (keyboardShortcuts[category]) {
                                    imported[category].forEach(cs => {
                                        const index = keyboardShortcuts[category].findIndex(s => s.description === cs.description);
                                        if (index !== -1) {
                                            keyboardShortcuts[category][index].key = cs.key;
                                        } else {
                                            keyboardShortcuts[category].push(cs);
                                        }
                                    });
                                } else {
                                    keyboardShortcuts[category] = imported[category];
                                }
                            }
                            saveCustomShortcuts();
                            alert('Shortcuts imported successfully!');
                            window.location.reload();
                        } catch (error) {
                            alert('Failed to import shortcuts: ' + error.message);
                        }
                    };
                    reader.readAsText(input.files[0]);
                }
            });
            input.click();
        });
    }
}

function initializeShortcutsSystem() {
    loadCustomShortcuts();
    initShortcutsPanel();
    setupCustomizationEvents();
}

initializeShortcutsSystem();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeShortcutsSystem);
} else {
    initializeShortcutsSystem();
}


*/