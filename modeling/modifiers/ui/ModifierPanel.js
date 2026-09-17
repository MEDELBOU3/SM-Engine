/**
 * MODIFIER PANEL UI - Inspector right sidebar modifications
 * Displays and manages modifier controls
 */
(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class ModifierPanel {
        constructor() {
            this.container = null;
            this.selectedObject = null;
            this.modifierElements = new Map();
            this.init();
        }

        init() {
            // Create modifier panel in inspector if it doesn't exist
            this.setupHTML();
            this.setupStyles();
            this.attachEventListeners();
            
            // Listen for modifier events
            root.modifierManager.events.addEventListener('modifierAdded', () => this.refresh());
            root.modifierManager.events.addEventListener('modifierRemoved', () => this.refresh());
            root.modifierManager.events.addEventListener('modifierUpdated', () => this.refresh());
            root.modifierManager.events.addEventListener('selectedObjectChanged', (e) => {
                this.setSelectedObject(e.detail.object);
            });
        }

        setupHTML() {
            const inspectorMain = document.querySelector('.inspector-main-content');
            if (!inspectorMain) return;

            // Create modifier panel section
            this.container = document.createElement('div');
            this.container.id = 'modifier-panel';
            this.container.className = 'modifier-panel';
            this.container.innerHTML = `
                <div class="modifier-panel-header">
                    <div class="modifier-panel-title">
                        <i class="fas fa-cogs"></i>
                        <span>Modifiers</span>
                    </div>
                    <button class="modifier-add-btn" title="Add Modifier">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="modifier-stack-container">
                    <div class="modifier-empty-state">
                        <p>No modifiers</p>
                        <p class="text-muted">Select object and add a modifier</p>
                    </div>
                </div>
            `;

            inspectorMain.appendChild(this.container);
            this.stackContainer = this.container.querySelector('.modifier-stack-container');
        }

        setupStyles() {
            if (document.getElementById('modifier-panel-styles')) return;

            const style = document.createElement('style');
            style.id = 'modifier-panel-styles';
            style.textContent = `
                .modifier-panel {
                    background: #1e1e1e;
                    border: 1px solid #333;
                    border-radius: 4px;
                    margin: 8px 0;
                    overflow: hidden;
                }

                .modifier-panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    background: #252525;
                    border-bottom: 1px solid #333;
                }

                .modifier-panel-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                    color: #fff;
                    font-size: 13px;
                }

                .modifier-add-btn {
                    background: #0d47a1;
                    border: none;
                    color: #fff;
                    width: 28px;
                    height: 28px;
                    border-radius: 3px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    transition: all 0.2s;
                }

                .modifier-add-btn:hover {
                    background: #1565c0;
                    transform: scale(1.05);
                }

                .modifier-stack-container {
                    padding: 8px;
                    max-height: 500px;
                    overflow-y: auto;
                }

                .modifier-empty-state {
                    text-align: center;
                    padding: 20px 10px;
                    color: #888;
                    font-size: 12px;
                }

                .modifier-item {
                    background: #2d2d2d;
                    border: 1px solid #3d3d3d;
                    border-radius: 3px;
                    margin-bottom: 6px;
                    overflow: hidden;
                }

                .modifier-item-header {
                    display: flex;
                    align-items: center;
                    padding: 8px;
                    background: #333;
                    cursor: pointer;
                    user-select: none;
                }

                .modifier-item-header:hover {
                    background: #3a3a3a;
                }

                .modifier-eye-btn {
                    background: none;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    padding: 4px;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    transition: color 0.2s;
                }

                .modifier-eye-btn:hover,
                .modifier-eye-btn.active {
                    color: #0d47a1;
                }

                .modifier-name {
                    flex: 1;
                    padding: 0 8px;
                    font-size: 12px;
                    font-weight: 500;
                    color: #ddd;
                }

                .modifier-menu-btn {
                    background: none;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    padding: 4px;
                    font-size: 12px;
                }

                .modifier-menu-btn:hover {
                    color: #fff;
                }

                .modifier-controls {
                    display: none;
                    padding: 12px;
                    background: #2a2a2a;
                    border-top: 1px solid #3d3d3d;
                }

                .modifier-controls.expanded {
                    display: block;
                }

                .modifier-control-group {
                    margin-bottom: 12px;
                }

                .modifier-control-label {
                    display: block;
                    font-size: 11px;
                    color: #aaa;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .modifier-control-input {
                    width: 100%;
                    padding: 6px;
                    background: #1e1e1e;
                    border: 1px solid #444;
                    border-radius: 2px;
                    color: #ddd;
                    font-size: 12px;
                    box-sizing: border-box;
                }

                .modifier-control-input:focus {
                    outline: none;
                    border-color: #0d47a1;
                    box-shadow: 0 0 0 2px rgba(13, 71, 161, 0.1);
                }

                .modifier-control-slider {
                    width: 100%;
                    height: 4px;
                    cursor: pointer;
                }

                .add-modifier-menu {
                    position: absolute;
                    background: #2d2d2d;
                    border: 1px solid #444;
                    border-radius: 4px;
                    min-width: 200px;
                    z-index: 1000;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                }

                .add-modifier-category {
                    padding: 0;
                    margin: 0;
                }

                .add-modifier-category-title {
                    padding: 8px 12px;
                    font-size: 11px;
                    color: #888;
                    background: #333;
                    text-transform: uppercase;
                    font-weight: 600;
                    border-bottom: 1px solid #3d3d3d;
                }

                .add-modifier-item {
                    background: none;
                    border: none;
                    width: 100%;
                    padding: 8px 12px;
                    text-align: left;
                    color: #ddd;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .add-modifier-item:hover {
                    background: #3a3a3a;
                    color: #fff;
                }

                .add-modifier-item-icon {
                    width: 16px;
                    height: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                }
            `;

            document.head.appendChild(style);
        }

        attachEventListeners() {
            this.container.querySelector('.modifier-add-btn').addEventListener('click', (e) => {
                this.showAddModifierMenu(e);
            });
        }

        setSelectedObject(object) {
            this.selectedObject = object;
            this.refresh();
        }

        refresh() {
            if (!this.selectedObject || !this.selectedObject.isMesh) {
                this.showEmptyState();
                return;
            }

            const modifiers = root.modifierManager.getModifiers(this.selectedObject);
            
            if (modifiers.length === 0) {
                this.showEmptyState();
            } else {
                this.renderModifiers(modifiers);
            }
        }

        showEmptyState() {
            this.stackContainer.innerHTML = `
                <div class="modifier-empty-state">
                    <p>No modifiers</p>
                    <p class="text-muted">Select object and add a modifier</p>
                </div>
            `;
            this.modifierElements.clear();
        }

        renderModifiers(modifiers) {
            this.stackContainer.innerHTML = '';
            this.modifierElements.clear();

            modifiers.forEach((modifier, index) => {
                const modItem = this.createModifierItem(modifier, index);
                this.stackContainer.appendChild(modItem);
                this.modifierElements.set(modifier.id, modItem);
            });
        }

        createModifierItem(modifier, index) {
            const item = document.createElement('div');
            item.className = 'modifier-item';
            item.dataset.modifierId = modifier.id;

            const header = document.createElement('div');
            header.className = 'modifier-item-header';

            // Eye toggle button
            const eyeBtn = document.createElement('button');
            eyeBtn.className = `modifier-eye-btn ${modifier.enabled ? 'active' : ''}`;
            eyeBtn.innerHTML = modifier.enabled ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
            eyeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                root.modifierManager.toggleModifier(this.selectedObject, modifier.id);
            });

            // Modifier name
            const name = document.createElement('div');
            name.className = 'modifier-name';
            name.textContent = modifier.name || modifier.type;

            // Menu button
            const menuBtn = document.createElement('button');
            menuBtn.className = 'modifier-menu-btn';
            menuBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
            menuBtn.addEventListener('click', (e) => {
                this.showModifierMenu(e, modifier, index);
            });

            header.appendChild(eyeBtn);
            header.appendChild(name);
            header.appendChild(menuBtn);

            // Controls section
            const controls = document.createElement('div');
            controls.className = 'modifier-controls';

            // Render modifier-specific controls
            const paramDefs = modifier.getParamDefinitions?.() || [];
            paramDefs.forEach(paramDef => {
                const control = this.createControlForParam(modifier, paramDef);
                controls.appendChild(control);
            });

            header.addEventListener('click', () => {
                controls.classList.toggle('expanded');
            });

            item.appendChild(header);
            item.appendChild(controls);

            return item;
        }

        createControlForParam(modifier, paramDef) {
            const group = document.createElement('div');
            group.className = 'modifier-control-group';

            const label = document.createElement('label');
            label.className = 'modifier-control-label';
            label.textContent = paramDef.name;
            group.appendChild(label);

            const value = modifier.params[paramDef.key];

            if (paramDef.type === 'number') {
                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'modifier-control-input';
                input.value = value || 0;
                input.min = paramDef.min || 0;
                input.max = paramDef.max || 100;
                input.step = paramDef.step || 0.1;
                input.addEventListener('change', (e) => {
                    root.modifierManager.updateModifier(
                        this.selectedObject,
                        modifier.id,
                        { [paramDef.key]: parseFloat(e.target.value) }
                    );
                });
                group.appendChild(input);
            } else if (paramDef.type === 'boolean') {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = value || false;
                checkbox.addEventListener('change', (e) => {
                    root.modifierManager.updateModifier(
                        this.selectedObject,
                        modifier.id,
                        { [paramDef.key]: e.target.checked }
                    );
                });
                group.appendChild(checkbox);
            } else if (paramDef.type === 'select') {
                const select = document.createElement('select');
                select.className = 'modifier-control-input';
                paramDef.options.forEach(opt => {
                    const el = document.createElement('option');
                    el.value = opt;
                    el.textContent = opt;
                    select.appendChild(el);
                });
                select.value = value || '';
                select.addEventListener('change', (e) => {
                    root.modifierManager.updateModifier(
                        this.selectedObject,
                        modifier.id,
                        { [paramDef.key]: e.target.value }
                    );
                });
                group.appendChild(select);
            }

            return group;
        }

        showAddModifierMenu(event) {
            if (!this.selectedObject) {
                alert('Please select an object first');
                return;
            }

            const menu = document.createElement('div');
            menu.className = 'add-modifier-menu';

            const categories = {
                'Generate': ['array', 'mirror', 'subdivision'],
                'Deform': ['bend', 'twist', 'taper', 'lattice'],
                'Modify': ['bevel', 'solidify', 'weld', 'decimate'],
                'Simulate': ['cloth', 'softbody'],
                'Procedural': ['noisedisplace', 'terrain', 'fractal']
            };

            Object.entries(categories).forEach(([categoryName, modifiers]) => {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'add-modifier-category';

                const categoryTitle = document.createElement('div');
                categoryTitle.className = 'add-modifier-category-title';
                categoryTitle.textContent = categoryName;
                categoryDiv.appendChild(categoryTitle);

                modifiers.forEach(modType => {
                    const btn = document.createElement('button');
                    btn.className = 'add-modifier-item';
                    btn.innerHTML = `
                        <span class="add-modifier-item-icon"><i class="fas fa-cube"></i></span>
                        <span>${this.formatModifierName(modType)}</span>
                    `;
                    btn.addEventListener('click', () => {
                        root.modifierManager.addModifier(this.selectedObject, modType);
                        menu.remove();
                    });
                    categoryDiv.appendChild(btn);
                });

                menu.appendChild(categoryDiv);
            });

            menu.style.position = 'fixed';
            menu.style.top = event.clientY + 'px';
            menu.style.left = event.clientX + 'px';

            document.body.appendChild(menu);

            // Close on outside click
            const closeHandler = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeHandler);
            }, 0);
        }

        showModifierMenu(event, modifier, index) {
            event.stopPropagation();

            const menu = document.createElement('div');
            menu.className = 'add-modifier-menu';
            menu.style.position = 'fixed';
            menu.style.top = event.clientY + 'px';
            menu.style.left = event.clientX + 'px';

            const items = [
                { text: 'Duplicate', action: () => {
                    // Clone modifier
                    const cloned = new modifier.constructor(modifier.serialize());
                    root.modifierManager.getStack(this.selectedObject).add(cloned);
                }},
                { text: 'Move Up', disabled: index === 0, action: () => {
                    root.modifierManager.moveModifier(this.selectedObject, modifier.id, -1);
                }},
                { text: 'Move Down', disabled: index >= root.modifierManager.getModifiers(this.selectedObject).length - 1, action: () => {
                    root.modifierManager.moveModifier(this.selectedObject, modifier.id, 1);
                }},
                { text: 'Remove', action: () => {
                    root.modifierManager.removeModifier(this.selectedObject, modifier.id);
                }}
            ];

            items.forEach(item => {
                if (item.disabled) {
                    const div = document.createElement('div');
                    div.className = 'add-modifier-item';
                    div.style.opacity = '0.5';
                    div.style.cursor = 'not-allowed';
                    div.textContent = item.text;
                    menu.appendChild(div);
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'add-modifier-item';
                    btn.textContent = item.text;
                    btn.addEventListener('click', () => {
                        item.action();
                        menu.remove();
                    });
                    menu.appendChild(btn);
                }
            });

            document.body.appendChild(menu);

            const closeHandler = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeHandler);
            }, 0);
        }

        formatModifierName(type) {
            return type.split(/[-_]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
    }

    root.ModifierPanel = ModifierPanel;
    root.modifierPanel = new ModifierPanel();
})();
