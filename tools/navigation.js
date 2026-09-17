// ============================================================================
// Navigator.js
// ============================================================================

class Navigator {
    constructor() {
        this.container = document.getElementById('navigator-container');
        this.tabsContainer = document.getElementById('navigator-tabs');
        this.contentContainer = document.getElementById('navigator-content');
        this.closeBtn = document.getElementById('navigator-close-btn');

        this.tabs = []; 
        this.activeTabId = null;
        this.storageKey = 'sm_engine_navigator_session';

        // Expose instance so dynamic panels can dock themselves programmatically
        window.navigatorInstance = this;

        if (!this.container || !this.tabsContainer || !this.contentContainer) return;

        this.bindEvents();
        
        // Delay restore slightly to ensure all other systems (like MetaSound, NodeEditor,
        // CameraPanel, and LightingPanel) have placed their elements/DOM nodes.
        setTimeout(() => this.restoreSession(), 200);
    }

    bindEvents() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hide());
        }
    }

    /** 
     * PERSISTENCE: Save the current state to LocalStorage
     */
    saveSession() {
        const sessionData = {
            activeTabId: this.activeTabId,
            openedTabs: this.tabs.map(t => ({ id: t.id, title: t.title }))
        };
        localStorage.setItem(this.storageKey, JSON.stringify(sessionData));
    }

    /**
     * PERSISTENCE: Restore the tabs that were open before refresh
     */
    restoreSession() {
        const saved = localStorage.getItem(this.storageKey);
        if (!saved) return;

        try {
            const { activeTabId, openedTabs } = JSON.parse(saved);
            if (openedTabs && openedTabs.length > 0) {
                // Ensure dynamic components are initialized in the DOM first
                if (window.CameraPanel && typeof window.CameraPanel.init === 'function') {
                    window.CameraPanel.init();
                }
                if (window.LightingPanel && typeof window.LightingPanel.init === 'function') {
                    window.LightingPanel.init();
                }

                openedTabs.forEach(t => this.open(t.id, t.title, false)); // false = don't save during loop
                if (activeTabId) this.switchTab(activeTabId);
                this.show();
            }
        } catch (e) {
            console.error("Navigator: Session restore failed", e);
        }
    }

    initializeExpandButtons() {
        this.panelMap = [
            { id: 'expandNodeEditorBtn', contentId: 'node-editor-panel-terrain', title: 'Terrain Editor' },
            { id: 'expand-curve-modifier-btn', contentId: 'curve-modifier-content', title: 'Curve Modifier' },
            { id: 'expand-water-system-btn', contentId: 'water-system-content', title: 'Water System' },
            { id: 'expand-modelingTools-system-btn', contentId: 'modelingTools', title: 'Modeling Tools' },
            { id: 'expand-hierarchy-system-btn', contentId: 'hierarchy-list-content', title: 'Hierarchy' },
            { id: 'expand-materialEditor-system-btn', contentId: 'material-editor', title: 'Material Editor' },
            { id: 'expand-physics-system-btn', contentId: 'physics-controls', title: 'Physics Editor' },
            { id: 'expand-camera-btn', contentId: 'camera-editor-container', title: 'Cinematic Camera' },
            { id: 'expand-lighting-btn', contentId: 'lighting-editor-container', title: 'Light Component' }
        ];

        this.panelMap.forEach(btnInfo => {
            const btn = document.getElementById(btnInfo.id);
            if (btn) {
                btn.addEventListener('click', () => {
                    const dockPanels = {
                        'physics-controls': 'physics',
                        'camera-editor-container': 'camera',
                        'lighting-editor-container': 'lighting',
                    };
                    const dockPanel = dockPanels[btnInfo.contentId];
                    if (dockPanel && window.PanelDockManager) {
                        window.PanelDockManager.openPanel(dockPanel);
                        return;
                    }
                    this.open(btnInfo.contentId, btnInfo.title);
                });
            }
        });
    }

    open(contentElementId, title, shouldSave = true) {
        const existingTab = this.tabs.find(tab => tab.id === contentElementId);
        if (existingTab) {
            this.switchTab(contentElementId);
            this.show();
            return;
        }

        const contentElement = document.getElementById(contentElementId);
        if (!contentElement) return;

        const originalParent = contentElement.parentElement;
        const originalNextSibling = contentElement.nextSibling;

        // Enhanced interactive placeholder with a "Return to Inspector" link
        const placeholder = document.createElement('div');
        placeholder.className = 'navigator-placeholder-hint';
        placeholder.style.margin = '10px 0';
        placeholder.innerHTML = `
            <div style="padding: 10px; background: #1a1a24; border: 1px dashed #2196f3; border-radius: 4px; color: #2196f3; font-size: 11px; display: flex; flex-direction: column; gap: 6px;">
                <span style="display: flex; align-items: center; gap: 6px; font-weight: bold;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                    ${title} is open in Navigator
                </span>
                <button class="return-to-inspector-btn" style="background: #111a2e; border: 1px solid #2196f3; color: #90caf9; padding: 4px 8px; font-size: 10px; cursor: pointer; border-radius: 3px; font-weight: bold; width: fit-content; text-transform: uppercase;" onclick="window.navigatorInstance.closeTab('${contentElementId}')">
                    Return to Inspector
                </button>
            </div>
        `;
        originalParent.insertBefore(placeholder, contentElement);

        this.tabs.push({
            id: contentElementId,
            title: title,
            contentElement,
            originalParent,
            originalNextSibling,
            placeholder
        });

        this.switchTab(contentElementId);
        this.show();
        
        if (shouldSave) this.saveSession();
    }

    switchTab(tabId) {
        this.activeTabId = tabId;
        const activeTab = this.tabs.find(tab => tab.id === tabId);
        
        if (activeTab) {
            this.contentContainer.innerHTML = '';
            this.contentContainer.appendChild(activeTab.contentElement);
            activeTab.contentElement.style.display = 'block';
        }

        this.renderTabs();
        this.saveSession();
        this.triggerEngineResize();
    }

    closeTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        const tab = this.tabs[index];
        
        // Restore DOM element to its original home (Inspector or Sidebar)
        tab.originalParent.insertBefore(tab.contentElement, tab.originalNextSibling);
        if (tab.placeholder) tab.placeholder.remove();

        this.tabs.splice(index, 1);

        if (this.tabs.length > 0) {
            this.switchTab(this.tabs[this.tabs.length - 1].id);
        } else {
            this.activeTabId = null;
            this.hide();
        }
        
        this.saveSession();
        this.triggerEngineResize();
    }

    triggerEngineResize() {
        window.dispatchEvent(new Event('resize'));
        if (window.onWindowResize) window.onWindowResize();
    }

    show() {
        this.container.classList.add('is-visible');
        this.container.style.display = 'flex';
        this.triggerEngineResize();
    }

    hide() {
        this.container.classList.remove('is-visible');
        this.container.style.display = 'none';
        this.triggerEngineResize();
    }

    renderTabs() {
        this.tabsContainer.innerHTML = '';
        this.tabs.forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = `navigator-tab ${tab.id === this.activeTabId ? 'active' : ''}`;
            
            tabEl.innerHTML = `
                <span class="tab-title">${tab.title}</span>
                <span class="tab-close-icon">&times;</span>
            `;

            tabEl.querySelector('.tab-title').addEventListener('click', () => this.switchTab(tab.id));
            tabEl.querySelector('.tab-close-icon').addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tab.id);
            });

            this.tabsContainer.appendChild(tabEl);
        });
    }
}
