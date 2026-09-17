/* Dedicated UI for mesh sculpting. Terrain continues to use ScultpingPanel. */
(function () {
    'use strict';

    const BRUSHES = [
        ['draw', '✚', 'Draw'], ['clay', '◒', 'Clay'], ['inflate', '◉', 'Inflate'], ['smooth', '≈', 'Smooth'],
        ['flatten', '▬', 'Flatten'], ['scrape', '⌁', 'Scrape'], ['pinch', '◀▶', 'Pinch'], ['grab', '✥', 'Grab'],
        ['snake-hook', '〰', 'Snake'], ['crease', '⌄', 'Crease'], ['expand', '⊕', 'Expand'], ['mask', '◐', 'Mask']
    ];

    const panel = {
        element: null,
        notice: '',

        open() {
            const inspector = document.getElementById('inspector-panel');
            const fallback = document.getElementById('inspector-main-content') || inspector;
            if (!fallback) return false;
            inspector?.classList.remove('closed', 'hidden', 'mode-hidden');
            if (inspector) { inspector.hidden = false; inspector.style.display = 'flex'; }
            window.setInspectorCollapsed?.(false);
            if (!this.element) {
                this.element = document.createElement('section');
                this.element.id = 'advanced-mesh-sculpt-panel';
                this.element.className = 'sm-mesh-sculpt-panel';
            }
            const mounted = window.PanelDockManager?.mountPanel?.({
                id: 'mesh-sculpt', title: 'Mesh Sculpt', icon: 'fas fa-fingerprint',
                elementId: this.element.id, className: this.element.className, element: this.element
            });
            if (!mounted && !this.element.parentElement) fallback.appendChild(this.element);
            this.element.hidden = false;
            window.PanelDockManager?.openPanel?.('mesh-sculpt');
            this.render();
            return true;
        },

        close() { window.PanelDockManager?.closePanel?.('mesh-sculpt'); },
        setStatus(message) { this.notice = String(message || ''); this.refresh(); },
        refresh() { if (this.element && !this.element.hidden) this.render(); },

        render() {
            const sculpt = window.SMAdvancedMeshSculptWorkspace;
            if (!sculpt || !this.element) return;
            const status = sculpt.getStatus();
            const enabled = status.active ? '' : 'disabled';
            const state = this.notice || (status.active
                ? `Sculpting ${status.mesh}`
                : 'Select a mesh, then activate. Terrain sculpting is separate.');
            this.element.innerHTML = `
                <header class="sms-header">
                    <div><i class="fa-solid fa-fingerprint"></i><span>Mesh Sculpt</span><em>Advanced</em></div>
                    <button type="button" data-sms-action="close" title="Exit sculpt workspace">×</button>
                </header>
                <div class="sms-body">
                    <div class="sms-status ${status.active ? 'is-active' : ''}" data-sms-status>${state}</div>
                    <div class="sms-actions sms-main-actions">
                        <button class="sms-btn is-primary" data-sms-action="activate"><i class="fa-solid fa-play"></i> ${status.active ? 'Re-arm selected' : 'Activate selected'}</button>
                        <button class="sms-btn" data-sms-action="sphere"><i class="fa-solid fa-circle"></i> Sculpt sphere</button>
                        <button class="sms-btn" data-sms-action="exit" ${enabled}>Exit</button>
                    </div>
                    <section class="sms-section">
                        <div class="sms-section-title"><span>Brushes</span><output>${status.brush.toUpperCase()}</output></div>
                        <div class="sms-brush-grid">
                            ${BRUSHES.map(([id, icon, label]) => `<button class="sms-brush ${status.brush === id ? 'is-active' : ''}" data-sms-brush="${id}" title="${label}" ${enabled}><b>${icon}</b><span>${label}</span></button>`).join('')}
                        </div>
                    </section>
                    <section class="sms-section">
                        <div class="sms-section-title"><span>Stroke</span><output>Shift smooth · Ctrl subtract</output></div>
                        ${this._range('radius', 'Radius', status.radius, 0.01, 10, 0.01, 'm', enabled)}
                        ${this._range('strength', 'Strength', status.strength, 0.01, 2, 0.01, '', enabled)}
                        ${this._range('falloff', 'Falloff', status.falloff, 0, 1, 0.01, '', enabled)}
                        <label class="sms-select">Falloff profile<select data-sms-setting="profile" ${enabled}>
                            ${['smooth', 'sphere', 'linear', 'sharp'].map(value => `<option value="${value}" ${status.falloffProfile === value ? 'selected' : ''}>${value}</option>`).join('')}
                        </select></label>
                    </section>
                    <section class="sms-section">
                        <div class="sms-section-title"><span>Sculpt space</span><output>Mesh only</output></div>
                        <div class="sms-switch-row"><label><input type="checkbox" data-sms-toggle="symmetry" ${status.symmetry ? 'checked' : ''} ${enabled}> Mirror</label>
                            <select data-sms-setting="axis" ${enabled}>${['x', 'y', 'z'].map(axis => `<option value="${axis}" ${status.symmetryAxis === axis ? 'selected' : ''}>${axis.toUpperCase()} axis</option>`).join('')}</select></div>
                        <div class="sms-switch-row"><label><input type="checkbox" data-sms-toggle="isolate" ${status.isolate ? 'checked' : ''} ${enabled}> Isolate mesh</label><span>RMB orbit · MMB pan</span></div>
                    </section>
                    <section class="sms-section">
                        <div class="sms-section-title"><span>Topology</span><output>${status.vertices.toLocaleString()} verts · ${status.triangles.toLocaleString()} tris</output></div>
                        <div class="sms-actions"><button class="sms-btn" data-sms-action="refine" ${enabled}>Refine ×4</button><button class="sms-btn" data-sms-action="remesh" ${enabled}>Uniform remesh</button><button class="sms-btn" data-sms-action="relax" ${enabled}>Relax</button></div>
                        <p class="sms-note">Refine before fine details. Uniform remesh redistributes density and softens the surface.</p>
                    </section>
                    <section class="sms-section">
                        <div class="sms-section-title"><span>Mask & history</span><output>${status.history.position} / ${status.history.length}</output></div>
                        <div class="sms-actions"><button class="sms-btn" data-sms-action="undo" ${status.history.canUndo ? '' : 'disabled'}>Undo</button><button class="sms-btn" data-sms-action="redo" ${status.history.canRedo ? '' : 'disabled'}>Redo</button><button class="sms-btn" data-sms-action="clear-mask" ${enabled}>Clear mask</button></div>
                        <div class="sms-actions"><button class="sms-btn" data-sms-action="extract" ${enabled}>Extract mask</button><button class="sms-btn is-danger" data-sms-action="revert" ${enabled}>Revert source</button></div>
                    </section>
                    <p class="sms-help">LMB sculpt · RMB or Alt + LMB orbit · MMB pan · Shift + LMB smooth · Ctrl/Cmd + LMB subtract · Shift + wheel or [ ] radius · Ctrl/Cmd + Z undo.</p>
                </div>`;
            this._bind(sculpt);
        },

        _range(key, label, value, min, max, step, suffix, disabled) {
            const formatted = Number(value).toFixed(key === 'radius' ? 2 : 2);
            return `<label class="sms-range"><span>${label}</span><output>${formatted}${suffix ? ` ${suffix}` : ''}</output><input data-sms-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${disabled}></label>`;
        },

        _bind(sculpt) {
            this.element.querySelectorAll('[data-sms-brush]').forEach(button => button.addEventListener('click', () => sculpt.setBrush(button.dataset.smsBrush)));
            this.element.querySelectorAll('[data-sms-setting]').forEach(input => input.addEventListener('input', () => {
                const key = input.dataset.smsSetting;
                if (key === 'radius') sculpt.setRadius(input.value);
                else if (key === 'strength') sculpt.setStrength(input.value);
                else if (key === 'falloff') sculpt.setFalloff(input.value);
                else if (key === 'profile') sculpt.falloffProfile = input.value;
                else if (key === 'axis') sculpt.setSymmetry(sculpt.symmetry, input.value);
                this.refresh();
            }));
            this.element.querySelectorAll('[data-sms-toggle]').forEach(input => input.addEventListener('change', () => {
                if (input.dataset.smsToggle === 'symmetry') sculpt.setSymmetry(input.checked);
                else sculpt.setIsolation(input.checked);
            }));
            this.element.querySelectorAll('[data-sms-action]').forEach(button => button.addEventListener('click', () => {
                const action = button.dataset.smsAction;
                if (action === 'activate') sculpt.activate();
                else if (action === 'sphere') sculpt.createSculptSphere();
                else if (action === 'exit') sculpt.exit({ keepPanel: true });
                else if (action === 'refine') sculpt.refine();
                else if (action === 'remesh') sculpt.remesh();
                else if (action === 'relax') sculpt.relax();
                else if (action === 'undo') sculpt.undo();
                else if (action === 'redo') sculpt.redo();
                else if (action === 'clear-mask') sculpt.clearMask();
                else if (action === 'extract') sculpt.extractMasked();
                else if (action === 'revert') sculpt.revertToSource();
                else if (action === 'close') { sculpt.exit(); this.close(); }
                this.refresh();
            }));
        }
    };

    window.SMAdvancedMeshSculptPanel = panel;
}());
