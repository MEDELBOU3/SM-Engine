// SM Engine Panel: CodeEditorPanel
window.CodeEditorPanel = {
    init() {
        const el = document.getElementById('code-editor-panel');
        if (el) {
            // Do not wipe out or duplicate the panel if HTML is already populated
            if (el.children && el.children.length > 0) {
                console.log('CodeEditorPanel: #code-editor-panel already populated from DOM');
                return;
            }
            el.innerHTML = `
            <section class="scripting-left-dock" aria-label="Scripting preview and console">
                <header class="scripting-region-header">
                    <div class="scripting-region-title"><i class="fas fa-cube"></i><span>3D Viewport</span></div>
                    <div class="scripting-region-actions">
                        <button type="button" class="icon-btn-small" id="scripting-frame-selected" title="Frame selected object"><i class="fas fa-expand"></i></button>
                    </div>
                </header>
                <div id="scripting-viewport-slot" class="scripting-viewport-slot"></div>
                <div id="scripting-console-slot" class="scripting-console-slot"></div>
            </section>
            <div id="scripting-column-resizer" class="scripting-column-resizer" role="separator" aria-orientation="vertical" aria-label="Resize 3D preview"></div>
            <!-- 1. ACTIVITY BAR (Extreme Left) -->
            <div class="vs-activity-bar">
                <div class="activity-btn active" title="Explorer">
                    <i class="fas fa-file"></i>
                </div>
                <div class="activity-btn" title="Search">
                    <i class="fas fa-search"></i>
                </div>
                <div class="activity-btn" title="Source Control">
                    <i class="fas fa-code-branch"></i>
                </div>
                <div class="activity-btn" title="Extensions">
                    <i class="fas fa-th-large"></i>
                </div>
                <div style="flex: 1;"></div>
                <div class="activity-btn" title="Settings">
                    <i class="fas fa-cog"></i>
                </div>
            </div>

            <!-- 2. SIDEBAR (EXPLORER) -->
            <div class="vs-sidebar">
                <div class="vs-sidebar-header">
                    <span class="sidebar-title">Explorer</span>
                    <div class="sidebar-icons">
                        <button class="icon-btn" id="new-file-btn" title="New File"><i
                                class="fas fa-file-alt"></i></button>
                        <button class="icon-btn" id="new-folder-btn" title="New Folder"><i
                                class="fas fa-folder-plus"></i></button>
                        <button class="icon-btn" id="upload-files-btn" title="Upload Files"><i
                                class="fas fa-upload"></i></button>
                        <button class="icon-btn" id="refresh-explorer-btn" title="Refresh"><i
                                class="fas fa-sync-alt"></i></button>
                        <button class="icon-btn" id="collapse-explorer-btn" title="Collapse All"><i
                                class="fas fa-layer-group"></i></button>
                    </div>
                </div>

                <!-- Search Area -->
                <div class="vs-search-box">
                    <i class="fas fa-search search-icon"></i>
                    <input type="text" placeholder="Search Files..." id="explorer-search">
                </div>

                <!-- Solution Tree -->
                <div class="vs-tree-view" id="explorer-tree">
                    <!-- Root / src folder -->
                    <div class="tree-node expanded">
                        <span class="tree-arrow">▾</span>
                        <span class="tree-icon"><i class="fas fa-folder-open" style="color: #dcb67a;"></i></span>
                        <span class="tree-label">src</span>
                    </div>
                    <div style="padding-left: 20px;" id="tree-root-content">
                        <div class="tree-node selected">
                            <span class="tree-icon"><i class="fab fa-js" style="color: #f1e05a;"></i></span>
                            <span class="tree-label">Logic.js</span>
                        </div>
                    </div>
                </div>

            </div>

            <!-- 3. MAIN CONTENT COLUMN -->
            <div class="vs-main-column">

                <!-- TOP ACTION TOOLBAR -->
                <div class="vs-top-toolbar">
                    <div class="toolbar-group left">
                        <!-- Standard File Actions -->
                        <button id="save-file-btn" title="Save / Apply (Ctrl+S)" class="icon-btn primary-action">
                            <i class="fas fa-save"></i>
                        </button>
                        <div class="vs-divider"></div>
                        <button id="undo-btn" title="Undo (Ctrl+Z)" class="icon-btn"><i
                                class="fas fa-undo"></i></button>
                        <button id="redo-btn" title="Redo (Ctrl+Y)" class="icon-btn"><i
                                class="fas fa-redo"></i></button>
                        <div class="vs-divider"></div>

                        <!-- Engine Logic Buttons (Context Sensitive) -->
                        <button id="create-object-btn" class="vs-btn-primary">
                            <i class="fas fa-cube"></i> Create Object
                        </button>

                        <button id="attach-script-btn" class="vs-btn-action" style="display:none;">
                            <i class="fas fa-link"></i> Attach
                        </button>

                        <button id="apply-changes-btn" class="vs-btn-success" style="display:none;">
                            <i class="fas fa-check-double"></i> Apply
                        </button>

                        <button id="detach-script-btn" class="vs-btn-danger" style="display:none;">
                            <i class="fas fa-unlink"></i> Detach
                        </button>

                        <div class="vs-divider"></div>

                        <!-- Asset Management -->
                        <button id="save-as-new-asset-btn" class="vs-btn-secondary" style="display:none;">Save
                            Asset</button>
                        <button id="save-to-current-asset-btn" class="vs-btn-secondary" style="display:none;">Update
                            Asset</button>
                    </div>

                    <div class="toolbar-group right">
                        <!-- Dynamic Filename -->
                        <input type="text" id="filename-input" placeholder="ScriptName" class="vs-input-field">
                        <div class="vs-divider"></div>
                        <!-- Close Button -->
                        <button id="close-editor" title="Close Workspace" class="vs-close-btn">
                            <i class="fas fa-window-close"></i>
                        </button>
                    </div>
                </div>

                <!-- TABS & BREADCRUMBS -->
                <div class="vs-editor-header">
                    <!-- DYNAMIC TABS CONTAINER -->
                    <div class="vs-tabs-container" id="editor-tabs">
                        <!-- Tabs will be rendered here via JS -->
                    </div>
                    <div class="vs-breadcrumbs">
                        <i class="fas fa-chevron-right" style="font-size: 9px; margin: 0 10px; opacity: 0.5;"></i>
                        <span id="editing-status" class="crumb-file">Ready</span>
                    </div>
                </div>

                <!-- MAIN EDITOR WRAPPER -->
                <div class="vs-code-wrapper">
                    <div class="vs-minimap-overlay"></div>
                    <!-- Editor Areas -->
                    <textarea id="js-editor"></textarea>
                    <textarea id="json-editor" style="display:none;"></textarea>
                    <textarea id="html-editor" style="display:none;"></textarea>
                    <textarea id="css-editor" style="display:none;"></textarea>
                </div>

                <!-- BOTTOM OUTPUT PANEL (RESIZEABLE) -->
                <div class="vs-bottom-panel">
                    <div class="vs-resize-handle-horz resize-handle-console-code"></div>
                    <div class="vs-panel-header">
                        <div class="panel-tabs">
                            <div class="console-tab active" data-console="output">Output</div>
                            <div class="console-tab" data-console="problems">Problems <span class="badge"
                                    id="error-count">0
                                    Errors</span></div>
                            <div class="console-tab">Terminal</div>
                        </div>
                        <div class="panel-actions">
                            <span id="last-run"
                                style="font-size: 10px; color: var(--vs-text-dim); margin-right: 15px;">Last
                                run: --:--:--</span>
                            <button id="clear-console-vs" title="Clear Console" class="icon-btn-small"
                                style="background:transparent; border:none; color:white; cursor:pointer;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                    <div class="vs-output-content" id="console-content">
                        <div class="log-line info"><i class="fas fa-info-circle"></i> Workspace ready...</div>
                    </div>
                </div>

                <!-- REAL-TIME STATUS BAR -->
                <div class="vs-status-bar">
                    <div class="status-left">
                        <div class="status-item" title="Git Branch"><i class="fas fa-code-branch"></i> main</div>
                        <div id="selection-info" class="status-item">No Object Selected</div>
                        <div id="editor-runtime-status" class="status-item" style="font-weight: 500;">Ready</div>
                        <div id="warning-count" class="status-item" style="color:#ffe066;"><i
                                class="fas fa-exclamation-triangle"></i> 0</div>
                        <div id="error-count-status" class="status-item" style="color:#ff6b6b;"><i
                                class="fas fa-times-circle"></i> 0</div>
                    </div>
                    <div class="status-right">
                        <div id="cursor-pos" class="status-item">Ln 1, Col 1</div>
                        <div id="lang-mode" class="status-item">JavaScript</div>
                        <div class="status-item">UTF-8</div>
                        <div class="status-item" title="Notifications"><i class="fas fa-bell"></i></div>
                    </div>
                </div>
            </div>`;
            console.log('CodeEditorPanel initialized');
        } else {
            console.warn('CodeEditorPanel element not found: code-editor-panel');
        }
    }
};
