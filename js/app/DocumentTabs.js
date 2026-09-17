// SM Engine — document-style workspace tabs for the sub toolbar.
// Keeps existing viewport controls intact and gives editor surfaces one
// predictable place to open, focus, and close.
(() => {
    const DOCUMENTS = {
        viewport: { label: '3D Viewport', icon: 'fa-cube', pinned: true },
        scripting: { label: 'Scripting', icon: 'fa-code' },
        assets: { label: 'Content Browser', icon: 'fa-folder' },
        camera: { label: 'Cine Camera', icon: 'fa-video' },
        insights: { label: 'Insights', icon: 'fa-chart-line' },
        history: { label: 'History', icon: 'fa-clock-rotate-left' },
        settings: { label: 'Preferences', icon: 'fa-gear' },
        colliderEditor: {
            label: 'Collider Editor',
            icon: 'fa-cubes-stacked',
            onActivate: () => window.openColliderEditorDocument?.(),
            onDeactivate: () => window.hideColliderEditorDocument?.(),
            onClose: () => window.closeColliderEditorDocument?.()
        }
    };

    const state = { open: ['viewport'], active: 'viewport', initialized: false };

    function setInsightsVisible(visible) {
        if (window.SMInsightsPanel?.setVisible) {
            window.SMInsightsPanel.setVisible(visible);
            return;
        }

        const panel = document.getElementById('statsMenu');
        if (!panel) return;

        panel.classList.toggle('open', visible);
        panel.style.display = visible ? 'flex' : '';
        panel.setAttribute('aria-hidden', String(!visible));
        window.dispatchEvent(new Event('resize'));
    }

    function runDocumentAction(id) {
        if (typeof DOCUMENTS[id]?.onActivate === 'function') {
            DOCUMENTS[id].onActivate();
            return;
        }

        switch (id) {
            case 'viewport':
                window.SMViewportSystem?.activatePrimaryViewport?.();
                setInsightsVisible(false);
                window.closeCodeEditor?.();
                window.dispatchEvent(new Event('resize'));
                window.dispatchEvent(new Event('sm:sync-layout'));
                break;
            case 'scripting':
                window.openCodeEditor?.();
                break;
            case 'assets':
                window.closeCodeEditor?.();
                window.toggleAssetsPanelSafe?.(true);
                break;
            case 'camera':
                window.closeCodeEditor?.();
                window.CameraPanel?.open?.(window.cameraSystem?.activeCamera || window.camera);
                break;
            case 'insights':
                window.closeCodeEditor?.();
                setInsightsVisible(true);
                break;
            case 'history':
                window.closeCodeEditor?.();
                window.SecondarySidebar?.open?.('history');
                break;
            case 'settings':
                openPreferencesDocument();
                break;
        }
    }

    function closeDocumentSurface(id) {
        if (typeof DOCUMENTS[id]?.onClose === 'function') {
            DOCUMENTS[id].onClose();
            return;
        }

        switch (id) {
            case 'scripting': window.closeCodeEditor?.(); break;
            case 'assets': window.toggleAssetsPanelSafe?.(false); break;
            case 'camera': window.CameraPanel?.close?.(); break;
            case 'insights': setInsightsVisible(false); break;
            case 'history': window.SecondarySidebar?.close?.('history'); break;
            case 'settings': closePreferencesDocument(); break;
        }
    }

    function getBar() {
        return document.getElementById('subToolBar');
    }

    function openPreferencesDocument() {
        /*
         * Preferences is a real editor document.
         * Close the code editor surface if it was active, then mount the
         * SettingsPanel inside #editor-scene instead of opening a modal.
         */
        window.closeCodeEditor?.();

        if (typeof window.openSettingsDocument === 'function') {
            window.openSettingsDocument();
            return;
        }

        /*
         * Compatibility fallback for older SettingsPanel versions.
         */
        window.openSettingsPanel?.();
    }

    function hidePreferencesDocument() {
        window.hideSettingsDocument?.();
    }

    function closePreferencesDocument() {
        if (typeof window.closeSettingsDocument === 'function') {
            window.closeSettingsDocument();
            return;
        }

        window.closeSettingsPanel?.();
    }

    function deactivateDocumentSurface(previousId, nextId) {
        const previousDocument = DOCUMENTS[previousId];

        if (
            previousDocument &&
            typeof previousDocument.onDeactivate === 'function'
        ) {
            previousDocument.onDeactivate(nextId);
            return;
        }

        if (
            previousId === 'settings' &&
            nextId !== 'settings'
        ) {
            hidePreferencesDocument();
        }
    }

    function render() {
        const bar = getBar();
        const list = bar?.querySelector('#sm-document-tab-list');
        if (!list) return;

        list.innerHTML = state.open.map(id => {
            const doc = DOCUMENTS[id];
            const active = id === state.active;
            const close = doc.pinned ? '' : `<button type="button" class="sm-document-tab-close" data-close-document="${id}" aria-label="Close ${doc.label}" title="Close ${doc.label}"><i class="fas fa-xmark"></i></button>`;
            return `<div class="sm-document-tab${active ? ' active' : ''}" data-document-tab="${id}" role="tab" tabindex="0" aria-selected="${active}">
                <i class="fas ${doc.icon}" aria-hidden="true"></i><span>${doc.label}</span>${close}
            </div>`;
        }).join('');
    }

    function activate(id, { runAction = true } = {}) {
        if (!DOCUMENTS[id]) return;

        const previousId = state.active;

        if (
            previousId &&
            previousId !== id
        ) {
            deactivateDocumentSurface(
                previousId,
                id
            );
        }

        if (!state.open.includes(id)) {
            state.open.push(id);
        }

        if (id !== 'insights') {
            setInsightsVisible(false);
        }

        state.active = id;

        render();

        if (runAction) {
            runDocumentAction(id);
        }

        window.dispatchEvent(
            new CustomEvent(
                'sm:document-tab-changed',
                {
                    detail: {
                        previous:
                            previousId,
                        active:
                            id
                    }
                }
            )
        );
    }

    function open(id) {
        activate(id, { runAction: true });
    }

    function close(id) {
        const doc = DOCUMENTS[id];
        if (!doc || doc.pinned) return;

        const index = state.open.indexOf(id);
        if (index < 0) return;

        const wasActive = state.active === id;
        state.open.splice(index, 1);
        closeDocumentSurface(id);

        if (wasActive) {
            const next = state.open[Math.max(0, index - 1)] || 'viewport';
            activate(next, { runAction: true });
        } else {
            render();
        }
    }

    function bind(bar) {
        bar.addEventListener('click', event => {
            const closeButton = event.target.closest('[data-close-document]');
            if (closeButton) {
                event.preventDefault();
                event.stopPropagation();
                close(closeButton.dataset.closeDocument);
                return;
            }

            const tab = event.target.closest('[data-document-tab]');
            if (tab) {
                activate(tab.dataset.documentTab);
                return;
            }

            const addButton = event.target.closest('#sm-document-tab-add');
            if (addButton) {
                const menu = bar.querySelector('#sm-document-tab-menu');
                const expanded = menu?.classList.toggle('open');
                addButton.setAttribute('aria-expanded', String(Boolean(expanded)));
                return;
            }

            const menuItem = event.target.closest('[data-open-document]');
            if (menuItem) {
                open(menuItem.dataset.openDocument);
                bar.querySelector('#sm-document-tab-menu')?.classList.remove('open');
                bar.querySelector('#sm-document-tab-add')?.setAttribute('aria-expanded', 'false');
                return;
            }

            if (event.target.closest('[data-new-viewport]')) {
                window.SMViewportSystem?.createViewportWindow?.();
                bar.querySelector('#sm-document-tab-menu')?.classList.remove('open');
                bar.querySelector('#sm-document-tab-add')?.setAttribute('aria-expanded', 'false');
            }
        });

        bar.addEventListener('keydown', event => {
            const tab = event.target.closest?.('[data-document-tab]');
            if (!tab || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            activate(tab.dataset.documentTab);
        });

        document.addEventListener('pointerdown', event => {
            if (!bar.contains(event.target)) {
                bar.querySelector('#sm-document-tab-menu')?.classList.remove('open');
                bar.querySelector('#sm-document-tab-add')?.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function bindExistingTriggers() {
        const openInsights = event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            open('insights');
        };

        // The timeline Insights button now opens a document tab instead of a
        // detached overlay. The compact toolbar icon uses the same surface.
        document.getElementById('statsToggle')?.addEventListener('click', openInsights, true);
        document.getElementById('toggle-stats')?.addEventListener('click', openInsights, true);

        /*
         * Preferences menu/button integration.
         *
         * Capture phase intentionally runs before the inline:
         *     onclick="window.openSettingsPanel?.()"
         *
         * This prevents the old floating modal from being opened and routes
         * the action through the document-tab system.
         */
        document.addEventListener(
            'click',
            event => {
                const trigger =
                    event.target.closest?.(
                        '.stm-row[data-target="preferences"], ' +
                        '[data-action="secondary"][data-target="preferences"]'
                    );

                if (!trigger) return;

                event.preventDefault();
                event.stopImmediatePropagation();

                open('settings');
            },
            true
        );

        /*
         * The UI already advertises Shift+F4 for Preferences.
         * Make the shortcut open/focus the same document tab.
         */
        window.addEventListener(
            'keydown',
            event => {
                if (
                    event.shiftKey &&
                    !event.ctrlKey &&
                    !event.altKey &&
                    !event.metaKey &&
                    event.key === 'F4'
                ) {
                    event.preventDefault();
                    open('settings');
                }
            }
        );
    }

    function init() {
        if (state.initialized) return;
        const bar = getBar();
        if (!bar) return;

        const legacyControls = document.createElement('div');
        legacyControls.className = 'sm-document-context-controls';
        while (bar.firstChild) legacyControls.appendChild(bar.firstChild);

        const tabs = document.createElement('div');
        tabs.className = 'sm-document-tabs';
        tabs.innerHTML = `
            <div id="sm-document-tab-list" class="sm-document-tab-list" role="tablist" aria-label="Open editor windows"></div>
            <div class="sm-document-tab-add-wrap">
                <button id="sm-document-tab-add" class="sm-document-tab-add" type="button" title="Open editor window" aria-label="Open editor window" aria-expanded="false"><i class="fas fa-plus"></i></button>
                <div id="sm-document-tab-menu" class="sm-document-tab-menu" role="menu">
                    <button type="button" data-new-viewport="true" role="menuitem"><i class="fas fa-cube"></i><span>New Viewport</span></button>
                    ${Object.entries(DOCUMENTS).filter(([id]) => id !== 'viewport').map(([id, doc]) => `<button type="button" data-open-document="${id}" role="menuitem"><i class="fas ${doc.icon}"></i><span>${doc.label}</span></button>`).join('')}
                </div>
            </div>`;

        bar.classList.add('sm-document-tabbar');
        bar.append(tabs, legacyControls);
        bind(bar);
        bindExistingTriggers();
        state.initialized = true;
        render();
    }

    function register(id, definition) {
        if (!id || !definition?.label || DOCUMENTS[id]) return false;
        DOCUMENTS[id] = { icon: 'fa-window-maximize', ...definition };
        return true;
    }

    function unregister(id) {
        if (!DOCUMENTS[id] || DOCUMENTS[id].pinned) return false;
        delete DOCUMENTS[id];
        const index = state.open.indexOf(id);
        if (index >= 0) state.open.splice(index, 1);
        if (state.active === id) state.active = 'viewport';
        render();
        return true;
    }

    window.SMDocumentTabs = { init, open, activate, close, register, unregister, get active() { return state.active; } };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();