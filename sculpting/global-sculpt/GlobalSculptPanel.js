/* Global Sculpt inspector panel — built on roots.css tokens. */
(function () {
    'use strict';

    const BRUSHES = [
        ['draw', 'fa-pen-nib', 'Draw'], ['clay', 'fa-mountain', 'Clay'],
        ['smooth', 'fa-water', 'Smooth'], ['inflate', 'fa-expand', 'Inflate'],
        ['flatten', 'fa-ruler-horizontal', 'Flatten'], ['pinch', 'fa-compress', 'Pinch'],
        ['grab', 'fa-hand', 'Grab'], ['crease', 'fa-bolt', 'Crease'], ['mask', 'fa-mask-face', 'Mask'],
    ];

    const panel = {
        element: null,
        open() {
            const inspector = document.getElementById('inspector-panel');
            const host = document.getElementById('inspector-main-content') || inspector;
            if (!host) return false;
            inspector?.classList.remove('closed', 'hidden', 'mode-hidden');
            if (inspector) { inspector.hidden = false; inspector.style.display = 'flex'; }
            window.setInspectorCollapsed?.(false);
            if (!this.element) {
                this.element = document.createElement('section');
                this.element.id = 'global-sculpt-panel';
                this.element.className = 'gsm-panel';
            }
            this.element.hidden = false;
            const mounted = window.PanelDockManager?.mountPanel?.({
                id: 'global-sculpt', title: 'Global Sculpt', icon: 'fas fa-fingerprint',
                elementId: 'global-sculpt-panel', className: 'gsm-panel', element: this.element,
            });
            if (!mounted) host.appendChild(this.element);
            window.PanelDockManager?.openPanel?.('global-sculpt');
            this.render();
            return true;
        },
        close() {
            if (this.element) window.PanelDockManager?.closePanel?.('global-sculpt');
        },
        setStatus(message) {
            const label = this.element?.querySelector('[data-gsm-status]');
            if (label) label.textContent = message;
        },
        refresh() { if (this.element && !this.element.hidden) this.render(); },
        render() {
            const sculpt = window.GlobalSculptMode;
            if (!sculpt || !this.element) return;
            const status = sculpt.getStatus();
            this.element.innerHTML = `
                <header class="gsm-header">
                    <div><i class="fa-solid fa-fingerprint"></i><span>Global Sculpt</span></div>
                    <button type="button" data-gsm-action="close" title="Close sculpt panel">×</button>
                </header>
                <div class="gsm-body">
                    <div class="gsm-status ${status.active ? 'is-active' : ''}" data-gsm-status>
                        ${status.active ? `Sculpting ${status.mesh}` : 'Select any mesh, then activate sculpting.'}
                    </div>
                    <div class="gsm-actions">
                        <button class="gsm-btn is-primary" data-gsm-action="activate"><i class="fa-solid fa-play"></i> ${status.active ? 'Re-arm selected' : 'Activate selected'}</button>
                        <button class="gsm-btn" data-gsm-action="exit" ${status.active ? '' : 'disabled'}><i class="fa-solid fa-stop"></i> Exit</button>
                    </div>
                    <section class="gsm-section">
                        <div class="gsm-section-title">Brushes <span>${status.brush.toUpperCase()}</span></div>
                        <div class="gsm-brush-grid">
                            ${BRUSHES.map(([id, icon, label]) => `<button class="gsm-brush ${status.brush === id ? 'is-active' : ''}" data-gsm-brush="${id}" title="${label}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`).join('')}
                        </div>
                    </section>
                    <section class="gsm-section">
                        <div class="gsm-section-title">Brush settings <span>Shift + wheel: radius</span></div>
                        <label class="gsm-range">Radius <output>${status.radius.toFixed(2)} m</output><input data-gsm-setting="radius" type="range" min="0.01" max="10" step="0.01" value="${status.radius}"></label>
                        <label class="gsm-range">Strength <output>${status.strength.toFixed(2)}</output><input data-gsm-setting="strength" type="range" min="0.01" max="2" step="0.01" value="${status.strength}"></label>
                        <label class="gsm-range">Falloff <output>${status.falloff.toFixed(2)}</output><input data-gsm-setting="falloff" type="range" min="0" max="1" step="0.01" value="${status.falloff}"></label>
                    </section>
                    <section class="gsm-section">
                        <div class="gsm-section-title">Sculpt space <span>non-destructive session</span></div>
                        <div class="gsm-toggle-row"><label><input data-gsm-toggle="symmetry" type="checkbox" ${sculpt.symmetry ? 'checked' : ''}> Mirror</label><select data-gsm-setting="axis"><option value="x" ${sculpt.symmetryAxis === 'x' ? 'selected' : ''}>X axis</option><option value="y" ${sculpt.symmetryAxis === 'y' ? 'selected' : ''}>Y axis</option><option value="z" ${sculpt.symmetryAxis === 'z' ? 'selected' : ''}>Z axis</option></select></div>
                        <div class="gsm-toggle-row"><label><input data-gsm-toggle="isolate" type="checkbox" ${sculpt.isolate ? 'checked' : ''}> Isolate mesh</label><span>Right drag orbit · middle pan</span></div>
                    </section>
                    <section class="gsm-section gsm-history">
                        <div class="gsm-section-title">History <span>${status.history} / ${status.historyMax}</span></div>
                        <div class="gsm-actions"><button class="gsm-btn" data-gsm-action="undo" ${status.history ? '' : 'disabled'}><i class="fa-solid fa-rotate-left"></i> Undo</button><button class="gsm-btn" data-gsm-action="redo" ${status.history < status.historyMax ? '' : 'disabled'}><i class="fa-solid fa-rotate-right"></i> Redo</button><button class="gsm-btn" data-gsm-action="clear-mask">Clear mask</button></div>
                    </section>
                    <p class="gsm-help">LMB sculpts · Ctrl/Cmd + LMB subtracts · Shift + LMB smooths · [ / ] changes radius · Esc exits. Grid and transform gizmo stay hidden during sculpting.</p>
                </div>`;
            this._bind();
        },
        _bind() {
            const sculpt = window.GlobalSculptMode;
            this.element.querySelectorAll('[data-gsm-brush]').forEach((button) => button.addEventListener('click', () => sculpt.setBrush(button.dataset.gsmBrush)));
            this.element.querySelectorAll('[data-gsm-setting]').forEach((input) => input.addEventListener('input', () => {
                const key = input.dataset.gsmSetting;
                if (key === 'axis') sculpt.symmetryAxis = input.value;
                else if (key === 'radius') sculpt.setRadius(input.value);
                else if (key === 'strength') sculpt.setStrength(input.value);
                else if (key === 'falloff') sculpt.setFalloff(input.value);
                this.refresh();
            }));
            this.element.querySelectorAll('[data-gsm-toggle]').forEach((input) => input.addEventListener('change', () => {
                if (input.dataset.gsmToggle === 'symmetry') sculpt.symmetry = input.checked;
                else sculpt.setIsolation(input.checked);
                this.refresh();
            }));
            this.element.querySelectorAll('[data-gsm-action]').forEach((button) => button.addEventListener('click', () => {
                const action = button.dataset.gsmAction;
                if (action === 'activate') sculpt.activate();
                else if (action === 'exit') sculpt.exit({ keepPanel: true });
                else if (action === 'undo') sculpt.undo();
                else if (action === 'redo') sculpt.redo();
                else if (action === 'clear-mask') sculpt.clearMask();
                else if (action === 'close') { sculpt.exit(); this.close(); }
                this.refresh();
            }));
        },
    };
    window.GlobalSculptPanel = panel;
}());
