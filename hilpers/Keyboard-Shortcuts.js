// Keyboard Shortcuts Panel Implementation

// Full list of keyboard shortcuts for the application
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
    ]
};

// Create the shortcuts panel HTML
function createShortcutsPanel() {
    // Create container
    const shortcutsPanel = document.createElement('div');
    shortcutsPanel.id = 'shortcuts-panel';
    shortcutsPanel.className = 'shortcuts-panel';
    
    // Add header with close button
    const header = document.createElement('div');
    header.className = 'shortcuts-header';
    header.innerHTML = `
        <h3>Keyboard Shortcuts</h3>
        <button id="close-shortcuts" class="close-btn">×</button>
    `;
    shortcutsPanel.appendChild(header);
    
    // Add tabs for different categories
    const tabs = document.createElement('div');
    tabs.className = 'shortcuts-tabs';
    tabs.innerHTML = `
        <button class="tab-btn active" data-tab="general">General</button>
        <button class="tab-btn" data-tab="transform">Transform</button>
        <button class="tab-btn" data-tab="selection">Selection</button>
        <button class="tab-btn" data-tab="view">View</button>
    `;
    shortcutsPanel.appendChild(tabs);
    
    // Create content for each tab
    const tabContents = document.createElement('div');
    tabContents.className = 'tab-contents';
    
    // Loop through each category
    for (const [category, shortcuts] of Object.entries(keyboardShortcuts)) {
        const tabContent = document.createElement('div');
        tabContent.className = `tab-content ${category === 'general' ? 'active' : ''}`;
        tabContent.dataset.tab = category;
        
        // Create table for shortcuts
        const table = document.createElement('table');
        table.className = 'shortcuts-table';
        
        // Add each shortcut to table
        shortcuts.forEach(shortcut => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="key-cell"><kbd>${shortcut.key}</kbd></td>
                <td class="desc-cell">${shortcut.description}</td>
            `;
            table.appendChild(row);
        });
        
        tabContent.appendChild(table);
        tabContents.appendChild(tabContent);
    }
    
    shortcutsPanel.appendChild(tabContents);
    
    // Add search box
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <input type="text" id="shortcut-search" placeholder="Search shortcuts...">
        <div id="search-results" class="search-results"></div>
    `;
    shortcutsPanel.appendChild(searchContainer);
    
    // Add to document
    document.body.appendChild(shortcutsPanel);
    
    // Hide by default
    shortcutsPanel.style.display = 'none';
    
    return shortcutsPanel;
}

// Function to create the keyboard shortcuts button
function createShortcutsButton() {
    const button = document.createElement('button');
    button.id = 'toggle-shortcuts';
    button.className = 'tool-btn';
    button.title = 'Keyboard Shortcuts (?)';
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
            <path d="M6 8h.01"></path>
            <path d="M10 8h.01"></path>
            <path d="M14 8h.01"></path>
            <path d="M18 8h.01"></path>
            <path d="M6 12h.01"></path>
            <path d="M10 12h.01"></path>
            <path d="M14 12h.01"></path>
            <path d="M18 12h.01"></path>
            <path d="M6 16h.01"></path>
            <path d="M10 16h.01"></path>
            <path d="M14 16h.01"></path>
            <path d="M18 16h.01"></path>
        </svg>
    `;
    
    // Add button to the toolbar or wherever your other buttons are
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
        toolbar.appendChild(button);
    } else {
        // If toolbar doesn't exist, add it near the renderer
        const rendererContainer = document.getElementById('renderer-container');
        if (rendererContainer) {
            rendererContainer.parentNode.insertBefore(button, rendererContainer.nextSibling);
        } else {
            // Fall back to adding it to the body
            document.body.appendChild(button);
        }
    }
    
    return button;
}

// Function to initialize the shortcuts panel and button
function initShortcutsPanel() {
    const shortcutsPanel = createShortcutsPanel();
    const shortcutsButton = createShortcutsButton();
    
    // Toggle panel visibility when button is clicked
    shortcutsButton.addEventListener('click', () => {
        shortcutsPanel.style.display = shortcutsPanel.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close panel when close button is clicked
    document.getElementById('close-shortcuts').addEventListener('click', () => {
        shortcutsPanel.style.display = 'none';
    });
    
    // Tab switching functionality
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all tabs
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            // Activate clicked tab
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            document.querySelector(`.tab-content[data-tab="${tabName}"]`).classList.add('active');
        });
    });
    
    // Search functionality
    const searchInput = document.getElementById('shortcut-search');
    const searchResults = document.getElementById('search-results');
    
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        
        if (query.length < 2) {
            searchResults.innerHTML = '';
            searchResults.style.display = 'none';
            return;
        }
        
        // Search through all shortcuts
        let results = [];
        for (const [category, shortcuts] of Object.entries(keyboardShortcuts)) {
            shortcuts.forEach(shortcut => {
                if (shortcut.key.toLowerCase().includes(query) || 
                    shortcut.description.toLowerCase().includes(query)) {
                    results.push({
                        category: category,
                        key: shortcut.key,
                        description: shortcut.description
                    });
                }
            });
        }
        
        // Display results
        if (results.length > 0) {
            searchResults.style.display = 'block';
            searchResults.innerHTML = results.map(result => `
                <div class="search-result">
                    <span class="result-category">${result.category}</span>
                    <kbd>${result.key}</kbd>
                    <span>${result.description}</span>
                </div>
            `).join('');
            
            // Add click handlers to search results
            document.querySelectorAll('.search-result').forEach((resultEl, index) => {
                resultEl.addEventListener('click', () => {
                    const category = results[index].category;
                    
                    // Switch to the appropriate tab
                    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                    
                    document.querySelector(`.tab-btn[data-tab="${category}"]`).classList.add('active');
                    document.querySelector(`.tab-content[data-tab="${category}"]`).classList.add('active');
                    
                    // Clear search
                    searchInput.value = '';
                    searchResults.style.display = 'none';
                });
            });
        } else {
            searchResults.style.display = 'block';
            searchResults.innerHTML = '<div class="no-results">No matching shortcuts found</div>';
        }
    });
    
    // Close panel when clicking outside
    document.addEventListener('click', (event) => {
        if (!shortcutsPanel.contains(event.target) && 
            event.target !== shortcutsButton && 
            !shortcutsButton.contains(event.target) &&
            shortcutsPanel.style.display === 'block') {
            shortcutsPanel.style.display = 'none';
        }
    });
    
    // Add keyboard shortcut for the panel itself (?)
    document.addEventListener('keydown', (event) => {
        if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
            event.preventDefault();
            shortcutsPanel.style.display = shortcutsPanel.style.display === 'none' ? 'block' : 'none';
        }
        
        // Toggle with Tab key if in selection mode
        if (event.key === 'Tab' && selectionEnabled) {
            event.preventDefault();
            shortcutsPanel.style.display = shortcutsPanel.style.display === 'none' ? 'block' : 'none';
        }
    });
}

// Keyboard Shortcuts Customization System

// Load user-defined shortcuts from localStorage
function loadCustomShortcuts() {
    try {
        const savedShortcuts = localStorage.getItem('userKeyboardShortcuts');
        if (savedShortcuts) {
            const customShortcuts = JSON.parse(savedShortcuts);
            
            // Merge custom shortcuts with default shortcuts
            for (const category in customShortcuts) {
                if (keyboardShortcuts[category]) {
                    // For existing categories, look for overrides
                    customShortcuts[category].forEach(customShortcut => {
                        const existingIndex = keyboardShortcuts[category].findIndex(
                            s => s.description === customShortcut.description
                        );
                        
                        if (existingIndex !== -1) {
                            // Override existing shortcut
                            keyboardShortcuts[category][existingIndex].key = customShortcut.key;
                        } else {
                            // Add new shortcut
                            keyboardShortcuts[category].push(customShortcut);
                        }
                    });
                } else {
                    // For new categories, just add them
                    keyboardShortcuts[category] = customShortcuts[category];
                }
            }
        }
    } catch (error) {
        console.error('Error loading custom shortcuts:', error);
    }
}

// Save user-defined shortcuts to localStorage
function saveCustomShortcuts() {
    try {
        localStorage.setItem('userKeyboardShortcuts', JSON.stringify(keyboardShortcuts));
    } catch (error) {
        console.error('Error saving custom shortcuts:', error);
    }
}

// Add customization options to the shortcuts panel
function addCustomizationOptions() {
    // Add "Customize" tab button
    const tabsElement = document.querySelector('.shortcuts-tabs');
    const customizeTab = document.createElement('button');
    customizeTab.className = 'tab-btn';
    customizeTab.dataset.tab = 'customize';
    customizeTab.textContent = 'Customize';
    tabsElement.appendChild(customizeTab);
    
    // Add customize tab content
    const tabContents = document.querySelector('.tab-contents');
    const customizeContent = document.createElement('div');
    customizeContent.className = 'tab-content';
    customizeContent.dataset.tab = 'customize';
    
    customizeContent.innerHTML = `
        <div class="customize-panel">
            <div class="customize-intro">
                <p>Customize your keyboard shortcuts by editing the key combinations.</p>
                <div class="customize-buttons">
                    <button id="reset-shortcuts" class="outline-btn">Reset to Defaults</button>
                    <button id="add-shortcut" class="primary-btn">Add New Shortcut</button>
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
            
            <div class="shortcut-editor-container">
                <!-- Shortcut editors will be added here dynamically -->
            </div>
        </div>
    `;
    
    tabContents.appendChild(customizeContent);
    
    // Setup event listeners for customize tab
    setupCustomizationEvents();
}

// Create shortcut editor UI for a specific category
function createShortcutEditors(category) {
    const container = document.querySelector('.shortcut-editor-container');
    container.innerHTML = ''; // Clear existing editors
    
    keyboardShortcuts[category].forEach((shortcut, index) => {
        const editorRow = document.createElement('div');
        editorRow.className = 'shortcut-editor';
        editorRow.dataset.index = index;
        
        editorRow.innerHTML = `
            <div class="shortcut-desc">
                <input type="text" class="desc-input" value="${shortcut.description}" 
                  placeholder="Description">
            </div>
            <div class="shortcut-key">
                <button class="key-capture-btn">${shortcut.key}</button>
                <span class="listening-indicator">Press any key...</span>
            </div>
            <div class="shortcut-actions">
                <button class="delete-shortcut" title="Remove Shortcut">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        
        container.appendChild(editorRow);
        
        // Set up key capture button
        const keyButton = editorRow.querySelector('.key-capture-btn');
        const listeningIndicator = editorRow.querySelector('.listening-indicator');
        
        keyButton.addEventListener('click', function() {
            // Enter listening mode
            listeningIndicator.style.display = 'block';
            keyButton.classList.add('listening');
            
            // Function to handle key press
            const keyListener = function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Build the key combination string
                let keyCombination = [];
                if (e.ctrlKey) keyCombination.push('Ctrl');
                if (e.altKey) keyCombination.push('Alt');
                if (e.shiftKey) keyCombination.push('Shift');
                
                // Add the actual key if it's not a modifier
                if (!['Control', 'Alt', 'Shift'].includes(e.key)) {
                    // Format special keys nicely
                    const keyMap = {
                        ' ': 'Space',
                        'ArrowUp': '↑',
                        'ArrowDown': '↓',
                        'ArrowLeft': '←',
                        'ArrowRight': '→',
                        'Escape': 'Esc'
                    };
                    
                    const keyName = keyMap[e.key] || e.key.charAt(0).toUpperCase() + e.key.slice(1);
                    keyCombination.push(keyName);
                }
                
                // Update the button text
                const keyString = keyCombination.join('+');
                keyButton.textContent = keyString;
                
                // Update the shortcut in the data structure
                const categoryName = document.getElementById('category-dropdown').value;
                const index = parseInt(editorRow.dataset.index);
                keyboardShortcuts[categoryName][index].key = keyString;
                
                // Save changes
                saveCustomShortcuts();
                
                // Exit listening mode
                listeningIndicator.style.display = 'none';
                keyButton.classList.remove('listening');
                
                // Remove the event listener
                document.removeEventListener('keydown', keyListener);
            };
            
            // Add temporary global event listener
            document.addEventListener('keydown', keyListener, { once: true });
        });
        
        // Set up delete button
        const deleteBtn = editorRow.querySelector('.delete-shortcut');
        deleteBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to delete this shortcut?')) {
                const categoryName = document.getElementById('category-dropdown').value;
                const index = parseInt(editorRow.dataset.index);
                
                // Remove the shortcut
                keyboardShortcuts[categoryName].splice(index, 1);
                
                // Save changes
                saveCustomShortcuts();
                
                // Refresh editors
                createShortcutEditors(categoryName);
            }
        });
        
        // Setup description input
        const descInput = editorRow.querySelector('.desc-input');
        descInput.addEventListener('change', function() {
            const categoryName = document.getElementById('category-dropdown').value;
            const index = parseInt(editorRow.dataset.index);
            
            // Update description
            keyboardShortcuts[categoryName][index].description = descInput.value;
            
            // Save changes
            saveCustomShortcuts();
        });
    });
}

// Setup event listeners for the customization panel
function setupCustomizationEvents() {
    // Setup category dropdown change
    document.getElementById('category-dropdown').addEventListener('change', function() {
        createShortcutEditors(this.value);
    });
    
    // Setup reset button
    document.getElementById('reset-shortcuts').addEventListener('click', function() {
        if (confirm('This will reset all keyboard shortcuts to their default values. Continue?')) {
            // Clear localStorage
            localStorage.removeItem('userKeyboardShortcuts');
            
            // Reload page to reset shortcuts
            window.location.reload();
        }
    });
    
    // Setup add shortcut button
    document.getElementById('add-shortcut').addEventListener('click', function() {
        const category = document.getElementById('category-dropdown').value;
        
        // Add new empty shortcut
        keyboardShortcuts[category].push({
            key: 'Click to set',
            description: 'New Shortcut'
        });
        
        // Save changes
        saveCustomShortcuts();
        
        // Refresh editors
        createShortcutEditors(category);
        
        // Scroll to bottom to show new shortcut
        const container = document.querySelector('.shortcut-editor-container');
        container.scrollTop = container.scrollHeight;
    });
}

// Export shortcuts as JSON file
function exportShortcuts() {
    const shortcutsJson = JSON.stringify(keyboardShortcuts, null, 2);
    const blob = new Blob([shortcutsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keyboard_shortcuts.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import shortcuts from JSON file
function importShortcuts(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedShortcuts = JSON.parse(e.target.result);
            
            // Validate structure
            let isValid = true;
            for (const category in importedShortcuts) {
                                if (!Array.isArray(importedShortcuts[category])) {
                    isValid = false;
                    break;
                }
                importedShortcuts[category].forEach(shortcut => {
                    if (typeof shortcut.key !== 'string' || typeof shortcut.description !== 'string') {
                        isValid = false;
                    }
                });
            }

            if (!isValid) {
                throw new Error('Invalid shortcuts format.');
            }

            // Merge imported shortcuts with existing ones
            for (const category in importedShortcuts) {
                if (keyboardShortcuts[category]) {
                    importedShortcuts[category].forEach(importedShortcut => {
                        const existingIndex = keyboardShortcuts[category].findIndex(
                            s => s.description === importedShortcut.description
                        );

                        if (existingIndex !== -1) {
                            // Override existing shortcut
                            keyboardShortcuts[category][existingIndex].key = importedShortcut.key;
                        } else {
                            // Add new shortcut
                            keyboardShortcuts[category].push(importedShortcut);
                        }
                    });
                } else {
                    // Add new category
                    keyboardShortcuts[category] = importedShortcuts[category];
                }
            }

            // Save the merged shortcuts
            saveCustomShortcuts();

            // Refresh the UI
            alert('Shortcuts imported successfully!');
            window.location.reload();
        } catch (error) {
            alert('Failed to import shortcuts: ' + error.message);
        }
    };

    reader.readAsText(file);
}

// Add import/export buttons to the customization panel
function addImportExportButtons() {
    const customizePanel = document.querySelector('.customize-panel .customize-buttons');

    const exportButton = document.createElement('button');
    exportButton.id = 'export-shortcuts';
    exportButton.className = 'outline-btn';
    exportButton.textContent = 'Export Shortcuts';
    exportButton.addEventListener('click', exportShortcuts);

    const importButton = document.createElement('button');
    importButton.id = 'import-shortcuts';
    importButton.className = 'primary-btn';
    importButton.textContent = 'Import Shortcuts';
    importButton.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                importShortcuts(fileInput.files[0]);
            }
        });
        fileInput.click();
    });

    customizePanel.appendChild(exportButton);
    customizePanel.appendChild(importButton);
}

// Initialize the shortcuts system
function initializeShortcutsSystem() {
    loadCustomShortcuts();
    initShortcutsPanel();
    addCustomizationOptions();
    addImportExportButtons();
}

