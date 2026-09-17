/*
 * SM Engine - Blender-style modifier workspace panel.
 *
 * This file intentionally uses the ModifiersToolbox stack.  The older
 * ModifierManager implementation in this project uses a different stack
 * shape, so keeping the Modeling UI on one API prevents modifiers from being
 * added to a UI-only/invalid stack.
 */
(function () {
    'use strict';

    const root = window.SMModifiers = window.SMModifiers || {};
    const PANEL_ID = 'modeling-modifiers-panel';
    const BUTTON_ID = 'modeling-modifiers-btn';
    const MENU_ID = 'modeling-add-modifier-menu';

    const MENU = [
        {
            name: 'Edit',
            items: [
                ['data-transfer', 'Data Transfer'], ['mesh-cache', 'Mesh Cache'],
                ['mesh-sequence-cache', 'Mesh Sequence Cache'], ['uv-project', 'UV Project'],
                ['uv-warp', 'UV Warp'], ['vertex-weight-edit', 'Vertex Weight Edit'],
                ['vertex-weight-mix', 'Vertex Weight Mix'], ['vertex-weight-proximity', 'Vertex Weight Proximity']
            ]
        },
        {
            name: 'Generate',
            items: [
                ['array', 'Array'], ['bevel', 'Bevel'], ['boolean', 'Boolean'], ['build', 'Build'],
                ['decimate', 'Decimate'], ['edge-split', 'Edge Split'], ['geometry-nodes', 'Geometry Nodes'],
                ['mask', 'Mask'], ['mirror', 'Mirror'], ['remesh', 'Remesh'], ['screw', 'Screw'],
                ['skin', 'Skin'], ['solidify', 'Solidify'], ['subdivision', 'Subdivision Surface'],
                ['triangulate', 'Triangulate'], ['weld', 'Weld'], ['wireframe', 'Wireframe'],
                ['noise-displace', 'Noise Displace'], ['terrain', 'Terrain'], ['fractal', 'Fractal']
            ]
        },
        {
            name: 'Deform',
            items: [
                ['armature', 'Armature'], ['cast', 'Cast'], ['corrective-smooth', 'Corrective Smooth'],
                ['curve', 'Curve'], ['deform', 'Deform'], ['displace', 'Displace'],
                ['laplacian-smooth', 'Laplacian Smooth'], ['lattice', 'Lattice'], ['simple-deform', 'Simple Deform'],
                ['shrinkwrap', 'Shrinkwrap'], ['smooth', 'Smooth'], ['smooth-by-angle', 'Smooth by Angle'],
                ['taper', 'Taper'], ['twist', 'Twist']
            ]
        },
        {
            name: 'Normals',
            items: [['normal-edit', 'Normal Edit'], ['weighted-normal', 'Weighted Normal']]
        },
        {
            name: 'Physics',
            items: [
                ['cloth', 'Cloth'], ['collision', 'Collision'], ['fluid', 'Fluid'],
                ['ocean', 'Ocean'], ['particle-system', 'Particle System'], ['softbody', 'Soft Body']
            ]
        },
        {
            name: 'Hair',
            items: [['hair-nodes', 'Hair Nodes'], ['hair-simulation', 'Hair Simulation']]
        }
    ];

    const categoryById = new Map();
    MENU.forEach(group => group.items.forEach(([id]) => categoryById.set(id, group.name)));

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function icon(name) {
        return '<i class="fas ' + name + '" aria-hidden="true"></i>';
    }

    function primitive(value) {
        if (Array.isArray(value) || (value && typeof value === 'object')) return false;
        return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string';
    }

    const panel = {
        active: false,
        visible: false,
        initialized: false,
        eventsBound: false,
        selectedObject: null,
        mesh: null,
        selectionTimer: null,

        init() {
            this.ensureStyles();
            this.ensureButton();
            this.ensurePanel();
            if (!document.getElementById(BUTTON_ID) || !document.getElementById(PANEL_ID)) return;
            if (!this.eventsBound) {
                this.bindEvents();
                this.eventsBound = true;
            }
            this.initialized = true;
            this.close();
            this.syncSelection();
        },

        ensureStyles() {
            if (document.getElementById('modeling-modifiers-styles')) return;
            const style = document.createElement('style');
            style.id = 'modeling-modifiers-styles';
            style.textContent = `
                #${PANEL_ID}{display:none;flex-direction:column;gap:8px;margin:0 0 8px;padding:8px;background:var(--cad-panel-bg,var(--panel-inner-bg,#202124));border:1px solid var(--cad-border-strong,var(--border-color,#3b3d42));border-radius:3px;min-height:0;overflow:visible;order:-10;box-sizing:border-box}
                body.modeling-workspace-active #${PANEL_ID}.is-visible{display:flex!important}
                body.modeling-workspace-active.modifiers-inspector-active #modeling-studio-panel.modeling-workspace-inspector{display:none!important}
                #${PANEL_ID} .sm-mod-header{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2px 0 7px;border-bottom:1px solid var(--cad-border,var(--border-color,#3b3d42))}
                #${PANEL_ID} .sm-mod-title{display:flex;align-items:center;gap:7px;color:var(--cad-text,var(--text-primary,#eee));font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
                #${PANEL_ID} .sm-mod-title>i{color:var(--accent-cyan,var(--accent-info,#66c7d4))}
                #${PANEL_ID} .sm-mod-title small{font-size:9px;color:var(--cad-muted,var(--text-secondary,#8d939c));font-weight:500;text-transform:none;letter-spacing:0}
                #${PANEL_ID} .sm-mod-add{border:1px solid var(--cad-accent-border,var(--accent-blue-dark,#4b84c8));background:var(--active-bg,var(--accent-blue-dark,#2563a6));color:var(--text-primary,#fff);border-radius:3px;padding:5px 8px;font-size:11px;cursor:pointer}
                #${PANEL_ID} .sm-mod-add:hover{background:var(--hover-bg,#347bc0);border-color:var(--accent-info,var(--cad-accent-border,#4b84c8))}
                #${PANEL_ID} .sm-mod-status{padding:8px;color:var(--cad-muted,var(--text-secondary,#9aa0aa));font-size:11px;line-height:1.35;background:var(--cad-chip-bg,rgba(0,0,0,.14));border-radius:2px}
                #${PANEL_ID} .sm-mod-stack{display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 220px);overflow:auto;padding-right:2px}
                #${PANEL_ID} .sm-mod-card{border:1px solid var(--cad-border-strong,var(--border-color,#42454b));border-radius:3px;background:var(--cad-card-bg,var(--panel-bg,#2a2c30));overflow:hidden}
                #${PANEL_ID} .sm-mod-card-head{display:flex;align-items:center;gap:5px;padding:6px;background:var(--cad-chip-bg,var(--header-bg,#33363b));cursor:pointer;user-select:none}
                #${PANEL_ID} .sm-mod-card-head:hover{background:var(--cad-button-hover,var(--hover-bg,#3b3f45))}
                #${PANEL_ID} .sm-mod-name{flex:1;color:var(--cad-text,var(--text-primary,#f0f1f2));font-size:11px;font-weight:600}
                #${PANEL_ID} .sm-mod-category{color:var(--cad-muted,var(--text-secondary,#8e98a5));font-size:9px;text-transform:uppercase;margin-left:3px}
                #${PANEL_ID} .sm-mod-icon,#${PANEL_ID} .sm-mod-more{border:0;background:transparent;color:var(--cad-muted,var(--text-secondary,#aeb5bf));cursor:pointer;width:22px;height:22px;border-radius:2px}
                #${PANEL_ID} .sm-mod-icon:hover,#${PANEL_ID} .sm-mod-more:hover{background:var(--cad-button-hover,var(--hover-bg,#4b4f56));color:var(--cad-text,var(--text-primary,#fff))}
                #${PANEL_ID} .sm-mod-body{display:none;padding:8px;border-top:1px solid var(--cad-border-strong,var(--border-color,#42454b));background:var(--cad-field-bg,var(--input-bg,#25272b))}
                #${PANEL_ID} .sm-mod-card.expanded .sm-mod-body{display:block}
                #${PANEL_ID} .sm-mod-field{display:grid;grid-template-columns:minmax(0,1fr) 90px;align-items:center;gap:8px;margin:5px 0;color:var(--cad-muted,var(--text-secondary,#afb5bf));font-size:10px}
                #${PANEL_ID} .sm-mod-field input,#${PANEL_ID} .sm-mod-field select{min-width:0;width:100%;height:23px;padding:2px 5px;border:1px solid var(--input-border,var(--cad-border-strong,#454951));background:var(--cad-field-bg,var(--input-bg,#17191c));color:var(--cad-text,var(--text-primary,#e6e8eb));border-radius:2px;font:10px Consolas,monospace}
                #${PANEL_ID} .sm-mod-field input[type=checkbox]{width:15px;justify-self:end}
                .${MENU_ID}{position:fixed;z-index:100000;display:flex;flex-direction:column;width:min(390px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 24px));background:var(--cad-panel-bg,var(--panel-bg,#202225));border:1px solid var(--cad-border-strong,var(--border-color,#4a4e55));border-radius:4px;box-shadow:var(--shadow-heavy,0 12px 34px rgba(0,0,0,.55));color:var(--cad-text,var(--text-primary,#e9eaec));overflow:hidden}
                .${MENU_ID} .sm-menu-search{padding:8px;border-bottom:1px solid var(--cad-border,var(--border-color,#3b3e44))}
                .${MENU_ID} .sm-menu-search input{width:100%;box-sizing:border-box;height:28px;border:1px solid var(--input-border,var(--cad-border-strong,#4b5058));border-radius:3px;background:var(--cad-field-bg,var(--input-bg,#141619));color:var(--cad-text,var(--text-primary,#fff));padding:4px 8px;font-size:11px}
                .${MENU_ID} .sm-menu-body{overflow:auto;padding:5px}
                .${MENU_ID} .sm-menu-category{margin-bottom:7px}
                .${MENU_ID} .sm-menu-category-title{padding:5px 7px;color:var(--accent-cyan,var(--accent-info,#7faee2));font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em}
                .${MENU_ID} .sm-menu-items{display:grid;grid-template-columns:1fr 1fr;gap:2px}
                .${MENU_ID} .sm-menu-item{display:flex;align-items:center;gap:7px;min-height:28px;padding:4px 7px;border:0;border-radius:2px;background:transparent;color:var(--cad-text,var(--text-primary,#d7dbe0));text-align:left;font-size:11px;cursor:pointer}
                .${MENU_ID} .sm-menu-item:hover{background:var(--cad-accent-active,var(--active-bg,#315d8f));color:var(--text-primary,#fff)}
                .${MENU_ID} .sm-menu-item small{display:block;color:var(--cad-muted,var(--text-secondary,#8f98a3));font-size:8px;margin-left:auto}
                .${MENU_ID} .sm-menu-empty{padding:16px;color:var(--cad-muted,var(--text-secondary,#9299a3));font-size:11px;text-align:center}
                .sm-mod-context{position:fixed;z-index:100001;display:flex;flex-direction:column;min-width:132px;background:var(--cad-panel-bg,var(--panel-bg,#25272a));border:1px solid var(--cad-border-strong,var(--border-color,#4a4e55));box-shadow:var(--shadow-medium,0 8px 22px rgba(0,0,0,.5));border-radius:3px;padding:3px}
                .sm-mod-context button{border:0;background:transparent;color:var(--cad-text,var(--text-primary,#e4e6e9));text-align:left;padding:6px 8px;font-size:10px;cursor:pointer;border-radius:2px}
                .sm-mod-context button:hover{background:var(--cad-accent-active,var(--active-bg,#315d8f))}
            `;
            document.head.appendChild(style);
        },

        ensureButton() {
            const sidebar = document.querySelector('.inspector-sidebar');
            if (!sidebar || document.getElementById(BUTTON_ID)) return;
            const button = document.createElement('button');
            button.id = BUTTON_ID;
            button.className = 'tool-btn';
            button.type = 'button';
            button.title = 'Modifiers (Modeling only)';
            button.setAttribute('aria-label', 'Modifiers');

            // Modern SVG Sliders Icon
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                    <path d="M4 6h16M4 12h16M4 18h16"/>
                    <rect x="7" y="4" width="4" height="4" rx="1" fill="currentColor"/>
                    <rect x="13" y="10" width="4" height="4" rx="1" fill="currentColor"/>
                    <rect x="9" y="16" width="4" height="4" rx="1" fill="currentColor"/>
                </svg>
            `;

            button.style.display = 'none';
            button.addEventListener('click', () => this.toggle());
            const anchor = document.getElementById('sculptingLandscapeBtn') || document.getElementById('vegetationPainterBtn');
            if (anchor?.parentNode === sidebar) anchor.insertAdjacentElement('afterend', button);
            else sidebar.appendChild(button);
        },

        ensurePanel() {
            const main = document.getElementById('inspector-main-content') || document.querySelector('.inspector-main-content');
            if (!main || document.getElementById(PANEL_ID)) return;
            const el = document.createElement('section');
            el.id = PANEL_ID;
            el.innerHTML = `
                <div class="sm-mod-header">
                    <div class="sm-mod-title">${icon('fa-sliders-h')} <span>Modifiers</span><small>Object stack</small></div>
                    <button type="button" class="sm-mod-add" title="Add Modifier">${icon('fa-plus')} Add</button>
                </div>
                <div class="sm-mod-status" data-mod-status>Select a mesh to edit its modifier stack.</div>
                <div class="sm-mod-stack" data-mod-stack></div>
            `;
            main.appendChild(el);
            el.querySelector('.sm-mod-add').addEventListener('click', event => this.showMenu(event));
            this.panel = el;
            this.stackEl = el.querySelector('[data-mod-stack]');
            this.statusEl = el.querySelector('[data-mod-status]');
            this.refreshOrder();
        },

        refreshOrder() {
            const main = document.getElementById('inspector-main-content');
            const el = document.getElementById(PANEL_ID);
            const modelingPanel = document.getElementById('modeling-studio-panel');
            if (main && el && modelingPanel && modelingPanel.parentNode === main && el.nextElementSibling !== modelingPanel) {
                main.insertBefore(el, modelingPanel);
            }
        },

        bindEvents() {
            window.addEventListener('objectSelected', event => {
                this.selectedObject = event.detail?.object || event.detail || window.selectedObject || null;
                this.syncSelection();
            });
            ['selectionChanged', 'sm:selection-changed'].forEach(type => window.addEventListener(type, event => {
                this.selectedObject = event.detail?.object || event.detail?.activeObject || event.activeObject || window.selectedObject || null;
                this.syncSelection();
            }));
            window.addEventListener('sm-modeling-tools-opened', () => this.open());
            document.addEventListener('click', event => {
                const tab = event.target.closest('.workspace-tab');
                if (tab && tab.id !== 'modelingControls') this.close();
            }, true);
        },

        getToolbox() {
            if (root.toolbox) return root.toolbox;
            if (window.modifiersToolbox) return window.modifiersToolbox;
            if (root.ModifiersToolbox) {
                root.toolbox = new root.ModifiersToolbox();
                root.toolbox.initialize?.();
                return root.toolbox;
            }
            return null;
        },

        ensureFallbackTypes() {
            const toolbox = this.getToolbox();
            if (!toolbox?.registry || !root.ModifierTool) return;
            MENU.forEach(group => group.items.forEach(([id, label]) => {
                if (toolbox.registry.has(id)) return;
                const Fallback = class extends root.ModifierTool {
                    constructor(params = {}) {
                        super(id, label, group.name.toLowerCase(), {
                            icon: 'fas fa-cube',
                            description: label + ' modifier',
                            params: { ...params }
                        });
                    }
                };
                toolbox.register(id, Fallback, group.name);
            }));
        },

        resolveMesh(object) {
            if (object?.isMesh && object.geometry) return object;
            if (object?.traverse) {
                let found = null;
                object.traverse(child => { if (!found && child.isMesh && child.geometry) found = child; });
                if (found) return found;
            }
            const candidate = window.UnifiedModelingSystem?.activeMesh || window.selectedObject;
            return candidate?.isMesh ? candidate : null;
        },

        syncSelection() {
            const source = this.selectedObject || window.selectedObject || window.UnifiedModelingSystem?.activeMesh || null;
            this.mesh = this.resolveMesh(source);
            if (this.panel && this.visible) this.renderStack();
        },

        open() {
            this.init();
            this.active = true;
            this.ensureButton();
            this.ensurePanel();
            this.refreshOrder();
            this.ensureFallbackTypes();
            const button = document.getElementById(BUTTON_ID);
            if (button) button.style.display = 'flex';
            this.syncSelection();
            clearInterval(this.selectionTimer);
            this.selectionTimer = setInterval(() => {
                const current = window.UnifiedModelingSystem?.activeMesh || window.selectedObject || null;
                if (current !== this.selectedObject) {
                    this.selectedObject = current;
                    this.syncSelection();
                }
            }, 250);
        },

        close() {
            this.active = false;
            this.visible = false;
            document.body.classList.remove('modifiers-inspector-active');
            clearInterval(this.selectionTimer);
            this.selectionTimer = null;
            document.getElementById(BUTTON_ID)?.classList.remove('active');
            const button = document.getElementById(BUTTON_ID);
            if (button) button.style.display = 'none';
            document.getElementById(PANEL_ID)?.classList.remove('is-visible');
            this.removeMenu();
        },

        toggle() {
            if (!this.active) return;
            this.visible = !this.visible;
            document.body.classList.toggle('modifiers-inspector-active', this.visible);
            const button = document.getElementById(BUTTON_ID);
            button?.classList.toggle('active', this.visible);
            document.getElementById(PANEL_ID)?.classList.toggle('is-visible', this.visible);
            if (this.visible) this.renderStack();
        },

        renderStack() {
            if (!this.stackEl || !this.statusEl) return;
            const toolbox = this.getToolbox();
            const mesh = this.mesh;
            if (!mesh || !toolbox) {
                this.statusEl.textContent = 'Select a mesh in the viewport or hierarchy.';
                this.stackEl.innerHTML = '';
                return;
            }
            const stack = toolbox.getStack(mesh);
            this.statusEl.textContent = (mesh.name || 'Selected mesh') + '  •  ' + stack.length + ' modifier' + (stack.length === 1 ? '' : 's');
            if (!stack.length) {
                this.stackEl.innerHTML = '<div class="sm-mod-status">No modifiers yet. Click <b>Add</b> to build a non-destructive stack.</div>';
                return;
            }
            this.stackEl.innerHTML = '';
            stack.forEach((modifier, index) => this.stackEl.appendChild(this.createCard(modifier, index, stack, toolbox)));
        },

        createCard(modifier, index, stack, toolbox) {
            const card = document.createElement('article');
            card.className = 'sm-mod-card';
            const category = modifier.category || categoryById.get(modifier.id) || 'Modifier';
            card.innerHTML = `
                <div class="sm-mod-card-head">
                    <button type="button" class="sm-mod-icon" title="Toggle modifier">${modifier.enabled !== false ? icon('fa-eye') : icon('fa-eye-slash')}</button>
                    <span class="sm-mod-name">${esc(modifier.name || modifier.id)}</span>
                    <span class="sm-mod-category">${esc(category)}</span>
                    <button type="button" class="sm-mod-more" title="Modifier options">${icon('fa-ellipsis-v')}</button>
                </div>
                <div class="sm-mod-body"></div>
            `;
            const head = card.querySelector('.sm-mod-card-head');
            const body = card.querySelector('.sm-mod-body');
            head.addEventListener('click', event => {
                if (event.target.closest('button')) return;
                card.classList.toggle('expanded');
            });
            card.querySelector('.sm-mod-icon').addEventListener('click', event => {
                event.stopPropagation();
                modifier.enabled = modifier.enabled === false;
                toolbox._applyStack?.(this.mesh, stack);
                this.renderStack();
            });
            card.querySelector('.sm-mod-more').addEventListener('click', event => this.showContextMenu(event, modifier, index, stack, toolbox));
            Object.entries(modifier.params || {}).forEach(([key, value]) => {
                if (!primitive(value) || key === 'object' || key === 'texture') return;
                const field = document.createElement('label');
                field.className = 'sm-mod-field';
                field.innerHTML = '<span>' + esc(key.replace(/([A-Z])/g, ' $1')) + '</span>';
                let input;
                if (typeof value === 'boolean') {
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = value;
                } else if (typeof value === 'string' && value.length < 32) {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.value = value;
                } else {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.step = 'any';
                    input.value = Number.isFinite(value) ? value : 0;
                }
                input.addEventListener('change', () => {
                    modifier.params[key] = input.type === 'checkbox' ? input.checked : (input.type === 'number' ? Number(input.value) : input.value);
                    toolbox._applyStack?.(this.mesh, stack);
                });
                field.appendChild(input);
                body.appendChild(field);
            });
            return card;
        },

        showMenu(event) {
            event.preventDefault();
            event.stopPropagation();
            this.removeMenu();
            if (!this.mesh) {
                if (this.statusEl) this.statusEl.textContent = 'Select a mesh before adding a modifier.';
                return;
            }
            this.ensureFallbackTypes();
            const menu = document.createElement('div');
            menu.id = MENU_ID;
            menu.className = MENU_ID;
            menu.innerHTML = '<div class="sm-menu-search"><input type="search" placeholder="Search modifiers..." aria-label="Search modifiers"></div><div class="sm-menu-body"></div>';
            document.body.appendChild(menu);
            const rect = event.currentTarget.getBoundingClientRect();
            const width = Math.min(390, window.innerWidth - 24);
            menu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px';
            menu.style.top = Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - Math.min(620, window.innerHeight - 24) - 12)) + 'px';
            const body = menu.querySelector('.sm-menu-body');
            const render = query => {
                body.innerHTML = '';
                let visible = 0;
                MENU.forEach(group => {
                    const items = group.items.filter(([, label]) => !query || label.toLowerCase().includes(query));
                    if (!items.length) return;
                    visible += items.length;
                    const section = document.createElement('section');
                    section.className = 'sm-menu-category';
                    section.innerHTML = '<div class="sm-menu-category-title">' + esc(group.name) + '</div><div class="sm-menu-items"></div>';
                    const itemsEl = section.querySelector('.sm-menu-items');
                    items.forEach(([id, label]) => {
                        const item = document.createElement('button');
                        item.type = 'button';
                        item.className = 'sm-menu-item';
                        item.innerHTML = icon('fa-cube') + '<span>' + esc(label) + '</span>' + (!this.getToolbox()?.registry?.has(id) ? '<small>basic</small>' : '');
                        item.addEventListener('click', () => {
                            const modifier = this.getToolbox()?.addModifier?.(this.mesh, id);
                            if (modifier) {
                                menu.remove();
                                this.renderStack();
                            }
                        });
                        itemsEl.appendChild(item);
                    });
                    body.appendChild(section);
                });
                if (!visible) body.innerHTML = '<div class="sm-menu-empty">No matching modifiers</div>';
            };
            render('');
            menu.querySelector('input').addEventListener('input', event2 => render(event2.target.value.trim().toLowerCase()));
            this.menu = menu;
            setTimeout(() => document.addEventListener('pointerdown', this._outsideMenu, true), 0);
        },

        showContextMenu(event, modifier, index, stack, toolbox) {
            event.preventDefault();
            event.stopPropagation();
            document.querySelector('.sm-mod-context')?.remove();
            const menu = document.createElement('div');
            menu.className = 'sm-mod-context';
            menu.style.left = Math.min(event.clientX, window.innerWidth - 150) + 'px';
            menu.style.top = Math.min(event.clientY, window.innerHeight - 145) + 'px';
            const action = (label, handler) => {
                const button = document.createElement('button');
                button.type = 'button'; button.textContent = label;
                button.addEventListener('click', () => { handler(); menu.remove(); this.renderStack(); });
                menu.appendChild(button);
            };
            action('Move Up', () => {
                if (index > 0) {
                    [stack[index - 1], stack[index]] = [stack[index], stack[index - 1]];
                    toolbox._applyStack?.(this.mesh, stack);
                }
            });
            action('Move Down', () => {
                if (index < stack.length - 1) {
                    [stack[index + 1], stack[index]] = [stack[index], stack[index + 1]];
                    toolbox._applyStack?.(this.mesh, stack);
                }
            });
            action('Duplicate', () => { const copy = toolbox.create(modifier.id, { ...(modifier.params || {}) }); if (copy) { stack.splice(index + 1, 0, copy); toolbox._applyStack?.(this.mesh, stack); } });
            action('Remove', () => {
                stack.splice(index, 1);
                toolbox._applyStack?.(this.mesh, stack);
            });
            document.body.appendChild(menu);
            const close = pointerEvent => { if (!menu.contains(pointerEvent.target)) { menu.remove(); document.removeEventListener('pointerdown', close, true); } };
            setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
        },

        _outsideMenu: null,
        removeMenu() {
            this.menu?.remove();
            this.menu = null;
            if (this._outsideMenu) document.removeEventListener('pointerdown', this._outsideMenu, true);
        }
    };

    panel._outsideMenu = event => {
        if (!panel.menu?.contains(event.target)) panel.removeMenu();
    };
    window.ModelingModifiersPanel = panel;

    function boot() {
        if (document.body) panel.init();
        else document.addEventListener('DOMContentLoaded', () => panel.init(), { once: true });
    }
    boot();
})();
