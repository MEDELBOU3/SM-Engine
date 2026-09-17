/*
 * Inspector Panel Dock
 *
 * Tools register a view and receive its private content element.  They do not
 * decide where it is placed and never hide sibling inspector views themselves.
 */
(function () {
    'use strict';

    class PanelRegistry {
        constructor() { this.items = new Map(); }
        register(definition) {
            if (!definition?.id) throw new Error('PanelDockManager.registerPanel requires an id.');
            const previous = this.items.get(definition.id) || {};
            const entry = { dock: 'inspector', display: 'flex', ...previous, ...definition };
            this.items.set(entry.id, entry);
            return entry;
        }
        get(id) { return this.items.get(id) || null; }
        values() { return [...this.items.values()]; }
    }

    class PanelState {
        constructor() { this.open = []; this.active = null; }
        openPanel(id) { if (!this.open.includes(id)) this.open.push(id); }
        closePanel(id) {
            this.open = this.open.filter((panelId) => panelId !== id);
            if (this.active === id) this.active = this.open.length ? this.open[this.open.length - 1] : null;
        }
        snapshot() { return { dock: 'inspector', open: [...this.open], active: this.active }; }
    }

    class DockArea {
        constructor(manager) { this.manager = manager; }
        get root() { return document.getElementById('inspector-tool-dock'); }
        get tabs() { return document.getElementById('inspector-dock-tabs'); }
        get content() { return document.getElementById('inspector-dock-content'); }
        ensure() {
            if (this.root && this.tabs && this.content) return this;
            const anchor = document.getElementById('transformContainer');
            const main = document.getElementById('inspector-main-content');
            if (!main) return null;
            const root = document.createElement('section');
            root.id = 'inspector-tool-dock';
            root.className = 'inspector-tool-dock';
            root.innerHTML = '<div class="inspector-dock-tabs" id="inspector-dock-tabs" role="tablist" aria-label="Inspector tool panels"></div><div class="inspector-dock-content" id="inspector-dock-content"></div>';
            if (anchor?.parentElement === main) anchor.insertAdjacentElement('afterend', root);
            else main.appendChild(root);
            return this;
        }
    }

    class DockTabs {
        constructor(manager) { this.manager = manager; }
        render() {
            const tabs = this.manager.area.ensure()?.tabs;
            if (!tabs) return;
            const { open, active } = this.manager.state;
            tabs.replaceChildren();
            tabs.hidden = open.length === 0;
            open.forEach((id) => {
                const panel = this.manager.registry.get(id);
                if (!panel) return;
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = `inspector-dock-tab${id === active ? ' is-active' : ''}`;
                tab.dataset.dockPanel = id;
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-selected', String(id === active));
                tab.innerHTML = `${panel.icon ? `<i class="${panel.icon}"></i>` : ''}<span>${panel.title || id}</span>`;
                tab.addEventListener('click', () => this.manager.activatePanel(id));
                tabs.appendChild(tab);
            });
        }
    }

    class PanelDockManager {
        constructor() {
            this.registry = new PanelRegistry();
            this.state = new PanelState();
            this.area = new DockArea(this);
            this.tabs = new DockTabs(this);
        }

        registerPanel(definition) {
            const exists = !!this.registry.get(definition?.id);
            const panel = this.registry.register(definition);
            if (!exists) panel.onRegister?.(this);
            return panel;
        }

        mountPanel(definition) {
            const panel = this.registerPanel(definition);
            const content = this.area.ensure()?.content;
            if (!content) return null;
            let element = panel.element || document.getElementById(panel.elementId || panel.id);
            if (!element) {
                element = document.createElement(panel.tagName || 'section');
                element.id = panel.elementId || panel.id;
                if (panel.className) element.className = panel.className;
            }
            if (element.parentElement !== content) content.appendChild(element);
            element.classList.add('panel-dock-view');
            element.dataset.dockPanel = panel.id;
            if (!this.state.open.includes(panel.id)) element.hidden = true;
            return element;
        }

        openPanel(id, options = {}) {
            const panel = this.registry.get(id) || this.registerPanel({ id, ...options });
            const element = this.mountPanel(panel);
            if (!element) return null;
            const wasOpen = this.state.open.includes(id);
            this.state.openPanel(id);
            if (!wasOpen) {
                panel.render?.(element, this);
                panel.onOpen?.(element, this);
            }
            this.activatePanel(id);
            return element;
        }

        activatePanel(id) {
            const panel = this.registry.get(id);
            if (!panel) return null;
            const element = this.mountPanel(panel);
            if (!element) return null;
            const previousId = this.state.active;
            if (!this.state.open.includes(id)) this.state.openPanel(id);
            if (previousId && previousId !== id) {
                const previous = this.registry.get(previousId);
                previous?.onDeactivate?.(document.getElementById(previous.elementId || previous.id), this);
            }
            this.state.active = id;
            this.state.open.forEach((panelId) => {
                const item = this.registry.get(panelId);
                const view = document.getElementById(item?.elementId || panelId);
                if (!view) return;
                const active = panelId === id;
                view.hidden = !active;
                if (active) view.style.display = item?.display || 'flex';
            });
            panel.onActivate?.(element, this);
            this.tabs.render();
            window.dispatchEvent(new CustomEvent('sm:panel-dock-changed', { detail: this.getLayout() }));
            return element;
        }

        closePanel(id) {
            const panel = this.registry.get(id);
            const view = document.getElementById(panel?.elementId || id);
            const wasActive = this.state.active === id;
            if (wasActive) panel?.onDeactivate?.(view, this);
            panel?.onClose?.(view, this);
            this.state.closePanel(id);
            if (view) { view.hidden = true; view.style.display = 'none'; }
            this.tabs.render();
            if (wasActive && this.state.active) this.activatePanel(this.state.active);
            window.dispatchEvent(new CustomEvent('sm:panel-dock-changed', { detail: this.getLayout() }));
        }

        getPanelElement(id) {
            const panel = this.registry.get(id);
            return document.getElementById(panel?.elementId || id);
        }
        getLayout() { return { inspector: this.state.snapshot() }; }
    }

    window.PanelRegistry = PanelRegistry;
    window.PanelState = PanelState;
    window.DockArea = DockArea;
    window.DockTabs = DockTabs;
    window.PanelDockManager = new PanelDockManager();
}());
