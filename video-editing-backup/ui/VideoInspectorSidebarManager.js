/**
 * VideoInspectorSidebarManager.js — V2 HOTFIX
 *
 * IMPORTANT:
 * InspectorPanel.renderDefaultInspector() rebuilds #inspector-panel with innerHTML.
 * That destroys the old #video-inspector-sidebar-tools node.
 *
 * This V2 manager NEVER trusts an old DOM reference:
 * - it remounts against the current .inspector-sidebar
 * - it observes #inspector-panel rebuilds
 * - it restores the active video panel after a rebuild
 * - video buttons are visible whenever body.video-editing-mode is active
 */

(function (global) {
    'use strict';

    // Native SVG Icons (No external library needed)
    const PANEL_ICONS = {
        sliders: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
        wand: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 4-2 4-4 2 4 2 2 4 2-4 4-2-4-2z"/><path d="m9 15-6 6"/><path d="M2 20l2 2"/><path d="M5 3v4M3 5h4M19 15v4M17 17h4"/></svg>`,
        transitions: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.6-8.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l2 2.6"/><path d="m14.7 13.7 1.9 2.6c.8 1.1 2 1.7 3.4 1.7H22"/><path d="m18 22 4-4-4-4"/></svg>`,
        palette: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.5-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.6-10-9.6z"/></svg>`,
        audio: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
        gear: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        export: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
        warning: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };

    class VideoInspectorSidebarManager {
        constructor() {
            this.panels = new Map();
            this.activePanelId = null;
            this.lastPanelId = 'clip';

            this.sidebarTools = null;
            this.host = null;
            this.inspectorRoot = null;

            this.initialized = false;
            this._observer = null;
            this._repairRaf = 0;
            this._isRenderingButtons = false;
            this._isOpeningPanel = false;

            this._onVideoMode = this._onVideoMode.bind(this);
            this._onSelectionChanged = this._onSelectionChanged.bind(this);

            this._registerBuiltins();
            this.init();
        }

        init() {
            if (this.initialized) return;
            this.initialized = true;

            const boot = () => {
                this.ensureMount(true);
                this._observeInspectorRebuilds();

                this.syncMode(
                    document.body.classList.contains('video-editing-mode')
                );
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', boot, { once: true });
            } else {
                boot();
            }

            global.addEventListener('sm:video-mode', this._onVideoMode);

            global.addEventListener(
                'videoCanvasTransformChanged',
                this._onSelectionChanged
            );

            global.addEventListener('videoToolPanelRequest', event => {
                const id = event?.detail?.tab;

                if (
                    document.body.classList.contains('video-editing-mode') &&
                    this.panels.has(id)
                ) {
                    this.openPanel(id);
                }
            });
        }

        /**
         * Re-acquire the CURRENT Inspector DOM.
         *
         * InspectorPanel.renderDefaultInspector() uses innerHTML, so any
         * previously stored sidebar/host nodes may become detached.
         */
        ensureMount(renderButtons = false) {
            const root = document.getElementById('inspector-panel');
            const sidebar = root?.querySelector('.inspector-sidebar') ||
                document.querySelector('.inspector-sidebar');

            const host = root?.querySelector('#inspector-main-content') ||
                document.getElementById('inspector-main-content');

            if (!sidebar) {
                this.sidebarTools = null;
                this.host = host || null;
                this.inspectorRoot = root || null;
                return false;
            }

            let tools = sidebar.querySelector('#video-inspector-sidebar-tools');

            if (!tools) {
                tools = document.createElement('div');
                tools.id = 'video-inspector-sidebar-tools';
                tools.className = 'video-inspector-sidebar-tools';
                tools.setAttribute(
                    'aria-label',
                    'Video Editing Inspector Tools'
                );
                sidebar.appendChild(tools);
            }

            const changed =
                tools !== this.sidebarTools ||
                host !== this.host ||
                root !== this.inspectorRoot;

            this.sidebarTools = tools;
            this.host = host || null;
            this.inspectorRoot = root || null;

            if (
                (changed || renderButtons) &&
                !this._isRenderingButtons
            ) {
                this._renderButtonsIntoCurrentNode();
            }

            return true;
        }

        _observeInspectorRebuilds() {
            this._observer?.disconnect?.();

            // Observe the stable #inspector-panel shell if possible.
            // If it does not exist yet, observe document.body.
            const target =
                document.getElementById('inspector-panel') ||
                document.body;

            if (!target) return;

            this._observer = new MutationObserver(() => {
                if (this._repairRaf) return;

                this._repairRaf = requestAnimationFrame(() => {
                    this._repairRaf = 0;

                    const oldTools = this.sidebarTools;
                    const oldHost = this.host;

                    this.ensureMount(false);

                    const rebuilt =
                        oldTools !== this.sidebarTools ||
                        oldHost !== this.host ||
                        !this.sidebarTools?.isConnected;

                    if (rebuilt) {
                        this._renderButtonsIntoCurrentNode();
                    }

                    if (
                        document.body.classList.contains('video-editing-mode')
                    ) {
                        this.sidebarTools?.classList.add('video-sidebar-active');

                        // If InspectorPanel rebuilt while Video Editing is active,
                        // restore the video panel into the NEW host.
                        const desired =
                            this.activePanelId ||
                            this.lastPanelId ||
                            'clip';

                        if (
                            this.host &&
                            !this._isOpeningPanel
                        ) {
                            this.openPanel(desired);
                        }
                    }
                });
            });

            this._observer.observe(target, {
                childList: true,
                subtree: true
            });
        }



        _registerBuiltins() {
            this.registerPanel({
                id: 'clip',
                title: 'Clip / Transform',
                icon: PANEL_ICONS.sliders,
                order: 10,
                render: host => {
                    const seq = global.sequencerManager;
                    const clip =
                        seq?.state?.primarySelection ||
                        seq?.state?.clips?.find(c => c.selected) ||
                        null;

                    global.videoTabbedInspector?.releaseInspectorHost?.();

                    if (global.ensureVideoClipInspector && seq) {
                        const inspector = global.ensureVideoClipInspector(seq);

                        if (clip) {
                            inspector.open(clip);
                        } else {
                            host.innerHTML = this.emptyState(
                                'Clip / Transform',
                                'Select a clip in the timeline to edit its transform, timing and keyframes.',
                                PANEL_ICONS.sliders
                            );
                        }
                    } else {
                        host.innerHTML = this.emptyState(
                            'Clip / Transform',
                            'VideoClipInspector.js is not loaded.',
                            PANEL_ICONS.warning
                        );
                    }
                }
            });

            this.registerPanel({
                id: 'effects',
                title: 'Effects',
                icon: PANEL_ICONS.wand,
                order: 20,
                render: host => {
                    this._openAdvancedTab('effects', host);
                }
            });

            this.registerPanel({
                id: 'transitions',
                title: 'Transitions',
                icon: PANEL_ICONS.transitions,
                order: 30,
                render: host => {
                    this._openAdvancedTab('transitions', host);
                }
            });

            this.registerPanel({
                id: 'color',
                title: 'Color',
                icon: PANEL_ICONS.palette,
                order: 40,
                render: host => {
                    this._openAdvancedTab('color', host);
                }
            });

            this.registerPanel({
                id: 'audio',
                title: 'Audio',
                icon: PANEL_ICONS.audio,
                order: 50,
                render: host => {
                    this._openAdvancedTab('audio', host);
                }
            });

            this.registerPanel({
                id: 'project',
                title: 'Project',
                icon: PANEL_ICONS.gear,
                order: 60,
                render: host => {
                    this._openAdvancedTab('project', host);
                }
            });

            this.registerPanel({
                id: 'render',
                title: 'Deliver / Export',
                icon: PANEL_ICONS.export,
                order: 70,
                render: host => {
                    this._openAdvancedTab('render', host);
                }
            });
        }

        registerPanel(definition) {
            if (
                !definition ||
                !definition.id ||
                typeof definition.render !== 'function'
            ) {
                return false;
            }

            const panel = {
                id: definition.id,
                title: definition.title || definition.id,
                icon: definition.icon || 'fa-square',
                order: Number(definition.order ?? 100),
                render: definition.render
            };

            this.panels.set(panel.id, panel);

            if (this.initialized) {
                this.ensureMount(false);
                this._renderButtonsIntoCurrentNode();
            }

            return true;
        }

        unregisterPanel(id) {
            const removed = this.panels.delete(id);

            if (removed) {
                this.ensureMount(false);
                this._renderButtonsIntoCurrentNode();
            }

            if (this.activePanelId === id) {
                this.openPanel('clip');
            }

            return removed;
        }

        renderButtons() {
            this.ensureMount(false);
            this._renderButtonsIntoCurrentNode();
        }

        _renderButtonsIntoCurrentNode() {
            if (!this.sidebarTools || this._isRenderingButtons) return;

            this._isRenderingButtons = true;

            try {
                const panels =
                    Array.from(this.panels.values())
                        .sort((a, b) => a.order - b.order);

                this.sidebarTools.innerHTML =
                    panels.map(panel => `
                        <button
                            type="button"
                            class="tool-btn video-inspector-side-btn"
                            data-video-inspector-panel="${panel.id}"
                            title="${panel.title}"
                            aria-label="${panel.title}">
                            ${PANEL_ICONS[panel.id] || panel.icon}
                        </button>
                    `).join('');

                this.sidebarTools
                    .querySelectorAll('[data-video-inspector-panel]')
                    .forEach(button => {
                        button.addEventListener('click', event => {
                            event.preventDefault();
                            event.stopPropagation();

                            this.openPanel(
                                button.dataset.videoInspectorPanel
                            );
                        });
                    });

                if (
                    document.body.classList.contains('video-editing-mode')
                ) {
                    this.sidebarTools.classList.add('video-sidebar-active');
                } else {
                    this.sidebarTools.classList.remove('video-sidebar-active');
                }

                this._syncActiveButton();
            } finally {
                this._isRenderingButtons = false;
            }
        }

        getHost() {
            this.ensureMount(false);
            return this.host;
        }

        openPanel(id) {
            if (
                !document.body.classList.contains('video-editing-mode')
            ) {
                return false;
            }

            if (this._isOpeningPanel) return false;

            this.ensureMount(false);

            const panel = this.panels.get(id);
            const host = this.host;

            if (!panel || !host) return false;

            this._isOpeningPanel = true;

            try {
                global.setInspectorCollapsed?.(false);

                this._hideLegacyVideoDock();

                this.activePanelId = id;
                this.lastPanelId = id;

                this.sidebarTools?.classList.add('video-sidebar-active');
                host.classList.add('video-inspector-panel-host');

                try {
                    panel.render(host);
                } catch (error) {
                    console.error(
                        `[VideoInspectorSidebar] Failed to render "${id}"`,
                        error
                    );

                    host.innerHTML = this.emptyState(
                        panel.title,
                        error?.message || 'Panel failed to render.',
                        'fa-triangle-exclamation'
                    );
                }

                this._syncActiveButton();

                global.dispatchEvent(
                    new CustomEvent('videoInspectorPanelChanged', {
                        detail: {
                            id,
                            panel
                        }
                    })
                );
            } finally {
                this._isOpeningPanel = false;
            }

            return true;
        }

        refresh() {
            if (
                !this.activePanelId ||
                !document.body.classList.contains('video-editing-mode')
            ) {
                return;
            }

            this.ensureMount(false);

            const panel = this.panels.get(this.activePanelId);

            if (panel && this.host) {
                panel.render(this.host);
            }
        }

        syncMode(active) {
            this.ensureMount(false);

            if (!this.sidebarTools) return;

            this.sidebarTools.classList.toggle(
                'video-sidebar-active',
                !!active
            );

            if (active) {
                this._renderButtonsIntoCurrentNode();

                requestAnimationFrame(() => {
                    this.ensureMount(false);

                    this.openPanel(
                        this.lastPanelId || 'clip'
                    );
                });
            } else {
                this.activePanelId = null;
                this._syncActiveButton();

                this.host?.classList.remove(
                    'video-inspector-panel-host'
                );

                global.videoTabbedInspector
                    ?.releaseInspectorHost?.();

                global.videoClipInspector
                    ?.close?.(false);

                if (
                    global.InspectorPanel
                        ?.renderDefaultInspector
                ) {
                    global.InspectorPanel
                        .renderDefaultInspector();

                    // renderDefaultInspector() just rebuilt the DOM,
                    // so immediately bind to the new sidebar again.
                    requestAnimationFrame(() => {
                        this.ensureMount(true);
                    });
                }
            }
        }

        _onVideoMode(event) {
            const active =
                event?.detail?.active ??
                document.body.classList.contains('video-editing-mode');

            this.syncMode(!!active);
        }

        _onSelectionChanged() {
            if (
                !document.body.classList.contains('video-editing-mode')
            ) {
                return;
            }

            if (
                this.activePanelId === 'clip' ||
                this.activePanelId === 'effects'
            ) {
                this.refresh();
            }
        }

        _openAdvancedTab(tab, host) {
            global.videoClipInspector?.close?.(false);

            const advanced = global.videoTabbedInspector;

            if (advanced?.openInInspector) {
                advanced.openInInspector(tab, host);
                return;
            }

            if (
                tab === 'effects' &&
                global.videoEffectsManager?.renderPanel
            ) {
                global.videoEffectsManager.renderPanel(
                    host,
                    global.videoEditingManager
                );
                return;
            }

            if (
                tab === 'transitions' &&
                global.videoTransitionsManager?.renderPanel
            ) {
                global.videoTransitionsManager.renderPanel(
                    host,
                    global.sequencerManager
                );
                return;
            }

            if (
                tab === 'render' &&
                global.veaExportEngine?.renderPanel
            ) {
                global.veaExportEngine.renderPanel(
                    host,
                    global.videoEditingManager
                );
                return;
            }

            host.innerHTML = this.emptyState(
                tab,
                'The requested video panel module is not loaded yet.',
                'fa-circle-info'
            );
        }

        _hideLegacyVideoDock() {
            const dock =
                document.getElementById('video-timeline-dock');

            const resizer =
                document.querySelector('.video-timeline-dock-resizer');

            if (dock) dock.style.display = 'none';
            if (resizer) resizer.style.display = 'none';
        }

        _syncActiveButton() {
            this.sidebarTools
                ?.querySelectorAll('.video-inspector-side-btn')
                .forEach(button => {
                    const active =
                        button.dataset.videoInspectorPanel ===
                        this.activePanelId;

                    button.classList.toggle('active', active);

                    button.setAttribute(
                        'aria-pressed',
                        active ? 'true' : 'false'
                    );
                });
        }

        emptyState(
            title,
            message,
            icon = 'fa-circle-info'
        ) {
            return `
                <div class="video-inspector-empty-state">
                    <i class="fas ${icon}"></i>
                    <strong>${title}</strong>
                    <span>${message}</span>
                </div>
            `;
        }
    }

    global.VideoInspectorSidebarManager =
        VideoInspectorSidebarManager;

    global.videoInspectorSidebar =
        global.videoInspectorSidebar ||
        new VideoInspectorSidebarManager();

})(window);