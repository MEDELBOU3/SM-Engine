/**
 * SM Engine — ModifiersUIController.js
 * ────────────────────────────────────────────────────────────────────────────
 * Context menu integration and UI control for modifiers:
 *   • Dynamic context menu filtering based on selection mode
 *   • Properties panel for modifier parameters
 *   • Modifier stack visualization
 *   • Real-time parameter editing with live preview
 * ────────────────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    const root = window.SMModifiers = window.SMModifiers || {};

    /* ═══════════════════════════════════════════════════════════════════════
       CONTEXT MENU MANAGER
    ═══════════════════════════════════════════════════════════════════════ */

    class ModifiersContextMenuManager {
        constructor(applicationEngine) {
            this.engine = applicationEngine;
            this.menuOpen = false;
            this.currentMenu = null;
        }

        /**
         * Build and show context menu based on selection
         */
        showContextMenu(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            const detection = root.SelectionDetector.detect();
            const available = this.engine.getAvailableModifiers(detection.mode);
            const catalog = this.engine.getModifierCatalog();

            // Get existing menu or create new one
            let menu = document.getElementById('modifiers-context-menu-v2');
            if (!menu) {
                menu = this._createMenuDOM();
            }

            // Update content based on available modifiers
            this._updateMenuContent(menu, available, catalog, detection);

            // Position and show
            this._positionMenu(menu, event);
            menu.style.display = 'flex';
            this.menuOpen = true;
            this.currentMenu = menu;

            // Close on outside click
            document.addEventListener('click', this._onOutsideClick.bind(this), { once: true });
        }

        /**
         * Create menu DOM structure
         */
        _createMenuDOM() {
            const menu = document.createElement('div');
            menu.id = 'modifiers-context-menu-v2';
            menu.className = 'modifiers-context-menu-v2';
            menu.innerHTML = `
                <div class="mod-menu-header">
                    <span class="mod-menu-title">Add Modifier</span>
                    <span class="mod-menu-mode" id="mod-menu-mode">Object</span>
                </div>
                <div class="mod-menu-categories" id="mod-menu-categories"></div>
            `;
            document.body.appendChild(menu);
            this._injectMenuStyles();
            return menu;
        }

        /**
         * Inject menu styles if not already present
         */
        _injectMenuStyles() {
            if (document.getElementById('modifiers-context-menu-v2-styles')) return;

            const style = document.createElement('style');
            style.id = 'modifiers-context-menu-v2-styles';
            style.textContent = `
                .modifiers-context-menu-v2 {
                    position: fixed;
                    display: none;
                    flex-direction: column;
                    min-width: 280px;
                    background: rgba(35, 35, 35, 0.98);
                    border: 1px solid rgba(80, 80, 80, 0.9);
                    border-radius: 8px;
                    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.6),
                                0 0 0 1px rgba(255, 155, 0, 0.2);
                    z-index: 999999;
                    color: #e0e0e0;
                    font-family: 'Segoe UI', sans-serif;
                    user-select: none;
                    max-height: 600px;
                    overflow-y: auto;
                }

                .mod-menu-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 14px;
                    border-bottom: 1px solid rgba(100, 100, 100, 0.5);
                    background: rgba(25, 25, 25, 0.8);
                }

                .mod-menu-title {
                    font-weight: 600;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .mod-menu-mode {
                    font-size: 11px;
                    background: rgba(255, 155, 0, 0.15);
                    color: #ffaa00;
                    padding: 3px 8px;
                    border-radius: 3px;
                    font-family: monospace;
                }

                .mod-menu-category {
                    padding: 0;
                }

                .mod-menu-category-header {
                    display: flex;
                    align-items: center;
                    padding: 8px 12px;
                    font-size: 11px;
                    font-weight: bold;
                    text-transform: uppercase;
                    color: #999;
                    cursor: pointer;
                    transition: background 0.1s, color 0.1s;
                }

                .mod-menu-category-header:hover {
                    background: rgba(255, 155, 0, 0.1);
                    color: #ffaa00;
                }

                .mod-menu-category-header i {
                    margin-right: 6px;
                }

                .mod-menu-items {
                    display: flex;
                    flex-direction: column;
                    padding: 2px 0;
                }

                .mod-menu-item {
                    display: flex;
                    align-items: center;
                    padding: 8px 16px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background 0.1s, color 0.1s, padding-left 0.1s;
                    border-left: 3px solid transparent;
                }

                .mod-menu-item:hover {
                    background: rgba(255, 155, 0, 0.15);
                    color: #ffd080;
                    padding-left: 20px;
                    border-left-color: #ffaa00;
                }

                .mod-menu-item.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .mod-menu-item.disabled:hover {
                    background: transparent;
                    color: #999;
                    padding-left: 16px;
                    border-left-color: transparent;
                }

                .mod-menu-item i {
                    width: 18px;
                    text-align: center;
                    margin-right: 10px;
                    opacity: 0.8;
                }

                .mod-menu-item:hover i {
                    opacity: 1;
                }

                /* Scrollbar styling */
                .modifiers-context-menu-v2::-webkit-scrollbar {
                    width: 8px;
                }

                .modifiers-context-menu-v2::-webkit-scrollbar-track {
                    background: transparent;
                }

                .modifiers-context-menu-v2::-webkit-scrollbar-thumb {
                    background: rgba(100, 100, 100, 0.5);
                    border-radius: 4px;
                }

                .modifiers-context-menu-v2::-webkit-scrollbar-thumb:hover {
                    background: rgba(120, 120, 120, 0.7);
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Update menu with available modifiers
         */
        _updateMenuContent(menu, availableModifiers, catalog, detection) {
            const modeDisplay = document.getElementById('mod-menu-mode');
            if (modeDisplay) {
                modeDisplay.textContent = root.SelectionDetector.getModeLabel();
            }

            const categoriesContainer = document.getElementById('mod-menu-categories');
            if (!categoriesContainer) return;
            categoriesContainer.innerHTML = '';

            for (const [category, modifiers] of Object.entries(catalog)) {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'mod-menu-category';

                const header = document.createElement('div');
                header.className = 'mod-menu-category-header';

                // Get icon for category
                const icons = {
                    'Generate': 'fas fa-cube',
                    'Deform': 'fas fa-wave-square',
                    'Modify': 'fas fa-tools',
                    'Physics': 'fas fa-wind'
                };

                header.innerHTML = `<i class="${icons[category] || 'fas fa-star'}"></i> ${category}`;
                categoryDiv.appendChild(header);

                const itemsContainer = document.createElement('div');
                itemsContainer.className = 'mod-menu-items';

                modifiers.forEach(modInfo => {
                    const isAvailable = availableModifiers.includes(modInfo.id);
                    const item = document.createElement('div');
                    item.className = `mod-menu-item ${!isAvailable ? 'disabled' : ''}`;
                    item.title = modInfo.description || modInfo.name;

                    item.innerHTML = `<i class="${modInfo.icon}"></i> <span>${modInfo.name}</span>`;

                    if (isAvailable) {
                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this._applyModifier(modInfo.id);
                            this.hideContextMenu();
                        });
                    }

                    itemsContainer.appendChild(item);
                });

                categoryDiv.appendChild(itemsContainer);
                categoriesContainer.appendChild(categoryDiv);
            }
        }

        /**
         * Position menu near cursor/element
         */
        _positionMenu(menu, event) {
            let x = event?.clientX || window.innerWidth / 2;
            let y = event?.clientY || window.innerHeight / 2;

            menu.style.left = x + 'px';
            menu.style.top = y + 'px';

            // Adjust if menu goes off-screen
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
            }
        }

        /**
         * Handle click outside menu
         */
        _onOutsideClick(e) {
            if (this.currentMenu && !this.currentMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        }

        /**
         * Apply modifier from menu
         */
        _applyModifier(modifierId) {
            const result = this.engine.applyModifier(modifierId);
            
            if (result.success) {
                this._showNotification(`Added ${modifierId} modifier`, 'success');
                // Dispatch update event
                window.dispatchEvent(new CustomEvent('modifierStackUpdated', {
                    detail: { modifierId, results: result.results }
                }));
            } else {
                this._showNotification(`Failed: ${result.error}`, 'error');
            }
        }

        /**
         * Hide context menu
         */
        hideContextMenu() {
            if (this.currentMenu) {
                this.currentMenu.style.display = 'none';
                this.menuOpen = false;
            }
        }

        /**
         * Show notification toast
         */
        _showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 18px;
                background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196F3'};
                color: white;
                border-radius: 4px;
                font-size: 12px;
                z-index: 1000000;
                animation: slideIn 0.3s ease-out;
            `;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       PROPERTIES PANEL MANAGER
    ═══════════════════════════════════════════════════════════════════════ */

    class ModifiersPropertiesPanel {
        constructor() {
            this.panelId = 'modifiers-properties-panel-v2';
            this.panel = null;
            this.currentModifier = null;
        }

        /**
         * Show properties for modifier
         */
        showProperties(object, modifierId) {
            if (!object || !root.SMModifiers || !root.SMModifiers.toolbox) {
                console.warn('Cannot show modifier properties');
                return;
            }

            const modifier = root.SMModifiers.toolbox.create(modifierId);
            if (!modifier) return;

            this.currentModifier = modifier;
            let panel = document.getElementById(this.panelId);
            if (!panel) {
                panel = this._createPanel();
            }

            this._populateProperties(panel, modifier, object);
            panel.style.display = 'block';
        }

        /**
         * Create properties panel DOM
         */
        _createPanel() {
            const panel = document.createElement('div');
            panel.id = this.panelId;
            panel.className = 'modifiers-properties-panel-v2';
            panel.innerHTML = `
                <div class="mod-props-header">
                    <h3 class="mod-props-title" id="mod-props-title">Modifier Properties</h3>
                    <button class="mod-props-close" onclick="this.parentElement.parentElement.style.display='none'">×</button>
                </div>
                <div class="mod-props-content" id="mod-props-content"></div>
            `;
            document.body.appendChild(panel);
            this._injectPanelStyles();
            return panel;
        }

        /**
         * Inject panel styles
         */
        _injectPanelStyles() {
            if (document.getElementById('modifiers-properties-panel-v2-styles')) return;

            const style = document.createElement('style');
            style.id = 'modifiers-properties-panel-v2-styles';
            style.textContent = `
                .modifiers-properties-panel-v2 {
                    position: fixed;
                    right: 20px;
                    top: 180px;
                    width: 320px;
                    max-height: 500px;
                    background: rgba(35, 35, 35, 0.98);
                    border: 1px solid rgba(80, 80, 80, 0.9);
                    border-radius: 8px;
                    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
                    z-index: 1000;
                    color: #e0e0e0;
                    font-family: 'Segoe UI', sans-serif;
                    display: none;
                    flex-direction: column;
                }

                .mod-props-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 14px;
                    border-bottom: 1px solid rgba(100, 100, 100, 0.5);
                    background: rgba(25, 25, 25, 0.8);
                }

                .mod-props-title {
                    margin: 0;
                    font-size: 13px;
                    font-weight: 600;
                }

                .mod-props-close {
                    background: none;
                    border: none;
                    color: #999;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                }

                .mod-props-close:hover {
                    color: #fff;
                }

                .mod-props-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                }

                .mod-prop-group {
                    margin-bottom: 12px;
                }

                .mod-prop-label {
                    display: block;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    color: #999;
                    margin-bottom: 4px;
                    letter-spacing: 0.5px;
                }

                .mod-prop-input {
                    width: 100%;
                    padding: 6px 8px;
                    background: rgba(60, 60, 60, 0.8);
                    border: 1px solid rgba(100, 100, 100, 0.6);
                    border-radius: 4px;
                    color: #e0e0e0;
                    font-size: 12px;
                    font-family: monospace;
                }

                .mod-prop-input:focus {
                    outline: none;
                    border-color: #ffaa00;
                    box-shadow: 0 0 0 2px rgba(255, 155, 0, 0.2);
                }

                .mod-prop-range {
                    width: 100%;
                    height: 4px;
                }

                .mod-prop-value-display {
                    display: inline-block;
                    font-size: 11px;
                    color: #ffaa00;
                    margin-left: 6px;
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Populate properties for modifier
         */
        _populateProperties(panel, modifier, object) {
            const titleEl = panel.querySelector('.mod-props-title');
            const contentEl = document.getElementById('mod-props-content');

            titleEl.textContent = modifier.name;
            contentEl.innerHTML = '';

            // Add parameter controls
            Object.entries(modifier.params).forEach(([key, value]) => {
                const group = document.createElement('div');
                group.className = 'mod-prop-group';

                const label = document.createElement('label');
                label.className = 'mod-prop-label';
                label.textContent = key.replace(/([A-Z])/g, ' $1').toLowerCase();
                group.appendChild(label);

                let control;

                if (typeof value === 'number') {
                    control = document.createElement('input');
                    control.type = 'range'; 
                    if(key.includes('strength') || key.includes('amount') || key.includes('ratio'))  {
                    } else { 'number'};
                    control.className = 'mod-prop-input mod-prop-range';
                    control.value = value;
                    control.min = 0;
                    control.max = 10;
                    control.step = 0.1;
                } else if (typeof value === 'string') {
                    control = document.createElement('input');
                    control.type = 'text';
                    control.className = 'mod-prop-input';
                    control.value = value;
                } else if (typeof value === 'boolean') {
                    control = document.createElement('input');
                    control.type = 'checkbox';
                    control.checked = value;
                } else {
                    control = null;
                }

                if (control) {
                    control.addEventListener('change', (e) => {
                        modifier.params[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                        window.dispatchEvent(new CustomEvent('modifierParamsChanged', {
                            detail: { modifier, params: modifier.params }
                        }));
                    });
                    group.appendChild(control);
                }

                contentEl.appendChild(group);
            });
        }

        hideProperties() {
            if (this.panel) {
                this.panel.style.display = 'none';
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       EXPORT
    ═══════════════════════════════════════════════════════════════════════ */

    root.ModifiersContextMenuManager = ModifiersContextMenuManager;
    root.ModifiersPropertiesPanel = ModifiersPropertiesPanel;

    // Auto-initialize
    if (document.readyState !== 'loading') {
        if (root.applicationEngine) {
            root.contextMenuManager = new ModifiersContextMenuManager(root.applicationEngine);
            root.propertiesPanel = new ModifiersPropertiesPanel();
            console.log('%c[ModifiersUIController] Initialized', 'color:#0f0;font-weight:bold');
        }
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (root.applicationEngine && !root.contextMenuManager) {
                root.contextMenuManager = new ModifiersContextMenuManager(root.applicationEngine);
                root.propertiesPanel = new ModifiersPropertiesPanel();
                console.log('%c[ModifiersUIController] Initialized', 'color:#0f0;font-weight:bold');
            }
        });
    }

})();
