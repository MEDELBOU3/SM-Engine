// SM Engine - Inspector panel for player animation and collision diagnostics.
(function () {
    'use strict';
    const PANEL_ID = 'player-debug-panel';
    const DOCK_ID = 'player-debug';

    const getOverlay = () => window.SMPlayerDebugOverlay || null;

    const panel = {
        registered: false,
        _register() {
            if (this.registered || !window.PanelDockManager) return false;
            window.PanelDockManager.registerPanel({
                id: DOCK_ID,
                title: 'Player Debug',
                icon: 'fas fa-person-running',
                elementId: PANEL_ID,
                className: 'sm-player-debug-panel',
                render: element => this.render(element),
                onActivate: element => this.refresh(element)
            });
            this.registered = true;
            return true;
        },
        render(element) {
            if (!element) return;
            const overlay = getOverlay();
            element.innerHTML = `
                <header class="sm-player-debug-title"><span><i class="fas fa-person-running"></i> Player Debug</span><small>runtime diagnostics</small></header>
                <section class="sm-player-debug-section">
                    <div class="sm-player-debug-section-title"><span>Viewport overlays</span><small>Game modes only</small></div>
                    <label class="sm-player-debug-toggle"><input type="checkbox" data-player-debug="collision" ${overlay?.collisionEnabled ? 'checked' : ''}><span>Collision shapes &amp; world bounds</span></label>
                    <label class="sm-player-debug-toggle"><input type="checkbox" data-player-debug="animation" ${overlay?.animationEnabled ? 'checked' : ''}><span>Animation telemetry HUD</span></label>
                </section>
                <section class="sm-player-debug-section">
                    <div class="sm-player-debug-section-title"><span>Live state</span><small data-player-debug-status>Waiting for player</small></div>
                    <dl class="sm-player-debug-metrics" data-player-debug-metrics></dl>
                </section>
                <section class="sm-player-debug-section sm-player-debug-actions">
                    <button type="button" data-player-debug-action="spawn"><i class="fas fa-location-crosshairs"></i> Reset Spawn</button>
                    <button type="button" data-player-debug-action="refresh"><i class="fas fa-arrows-rotate"></i> Refresh Collision</button>
                </section>`;
            element.querySelectorAll('[data-player-debug]').forEach(input => {
                input.addEventListener('change', () => {
                    const overlay = getOverlay();
                    if (input.dataset.playerDebug === 'collision') overlay?.setCollisionEnabled(input.checked);
                    if (input.dataset.playerDebug === 'animation') overlay?.setAnimationEnabled(input.checked);
                    this.refresh(element);
                });
            });
            element.querySelector('[data-player-debug-action="spawn"]')?.addEventListener('click', () => {
                window.playerSystem?.resetToSpawn?.();
                this.refresh(element);
            });
            element.querySelector('[data-player-debug-action="refresh"]')?.addEventListener('click', () => {
                getOverlay()?.refreshCollision?.();
                this.refresh(element);
            });
            this.refresh(element);
        },
        refresh(element = document.getElementById(PANEL_ID)) {
            if (!element) return;
            const state = window.playerSystem?.getDebugState?.() || null;
            const status = element.querySelector('[data-player-debug-status]');
            const metrics = element.querySelector('[data-player-debug-metrics]');
            if (!state) {
                if (status) status.textContent = 'Waiting for player';
                if (metrics) metrics.innerHTML = '<div><dt>Player</dt><dd>Not loaded</dd></div>';
                return;
            }
            const rows = [
                ['Animation', state.animation?.current || 'None'],
                ['State', state.animation?.state || 'None'],
                ['Speed', `${Number(state.movement?.speed || 0).toFixed(2)} m/s`],
                ['Grounded', state.physics?.grounded === true ? 'Yes' : 'No'],
                ['Vertical velocity', `${Number(state.physics?.verticalVelocity || 0).toFixed(2)} m/s`],
                ['Ground object', state.physics?.groundObject || 'None'],
                ['Input', `${state.input?.forward || 0}, ${state.input?.right || 0}`],
                ['Graph runtime', window.playerAnimationGraphActive === true ? 'Enabled' : 'Legacy locomotion']
            ];
            if (status) status.textContent = state.player?.enabled ? 'Live' : 'Editor standby';
            if (metrics) metrics.innerHTML = rows.map(([label, value]) => `<div><dt>${label}</dt><dd title="${String(value)}">${String(value)}</dd></div>`).join('');
        },
        open() {
            const inspector = document.getElementById('inspector-panel');
            if (inspector?.classList.contains('closed')) window.setInspectorCollapsed?.(false);
            if (!this._register()) return false;
            const element = window.PanelDockManager.openPanel(DOCK_ID);
            this.refresh(element);
            return !!element;
        },
        init() {
            this._register();
            window.setInterval(() => {
                const element = document.getElementById(PANEL_ID);
                if (element && !element.hidden) this.refresh(element);
            }, 180);
        }
    };

    window.SMPlayerDebugPanel = panel;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => panel.init(), { once: true });
    } else {
        panel.init();
    }
}());
