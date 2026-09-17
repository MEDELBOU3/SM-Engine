// SM Engine Panel Registry — Coordinates initialization of all panels
// This file should be loaded AFTER all individual panel scripts but BEFORE index.js and app-bootstrap.js
window.PanelRegistry = {
    _initialized: false,
    _initPanel(name) {
        const panel = window[name];
        if (!panel || typeof panel.init !== 'function') return;
        try {
            panel.init();
        } catch (error) {
            console.error('[PanelRegistry] ' + name + ' failed to initialize:', error);
        }
    },
    initAll() {
        if (this._initialized) return;
        this._initialized = true;
        console.log('[PanelRegistry] Initializing all UI panels...');
        [
            'WelcomeModal',
            'ToolbarPanel',
            'HierarchyPanel',
            'InspectorPanel',
            'ModelingPanel',
            'TimelinePanel',
            'SidebarPanel',
            'SculptingPanel',
            'AssetPanel',
            'CodeEditorPanel',
            'BoneRigPanel',
            'NodeEditorPanel',
            'VFXPanel',
            'AIAssistantPanel',
            'SecondaryPanels'
        ].forEach((name) => this._initPanel(name));
        console.log('[PanelRegistry] All panels initialized successfully.');
    }
};

// Auto-initialize immediately — the placeholder divs already exist in the DOM
// when this script runs (scripts execute after HTML is parsed synchronously)
window.PanelRegistry.initAll();
