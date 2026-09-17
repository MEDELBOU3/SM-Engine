class PhysicsUI {
    constructor(system, containerId) {
        this.sys = system;
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`UI container #${containerId} not found.`);
        this.els = {};
    }

    build() {
        this.container = document.getElementById('physics-controls') || this.container;
        if (!this.container) { console.error('Physics container missing'); return; }

        const content = this.container.querySelector('.physics-content');
        if (!content) { console.error('.physics-content missing'); return; }
        content.innerHTML = '';

        const workspace = this._el('div', 'ph-workspace');

        // Software-style compact status header
        const hero = this._el('div', 'ph-dashboard');
        hero.innerHTML = `
            <div class="ph-dash-row">
                <div class="ph-dash-stat"><span class="ph-label">Engine</span><strong id="ph-runtime-ammo">Loading…</strong></div>
                <div class="ph-dash-stat"><span class="ph-label">Local</span><strong id="ph-runtime-local">Checking…</strong></div>
                <div class="ph-dash-stat"><span class="ph-label">Profile</span><strong id="ph-runtime-profile">RBD</strong></div>
                <div class="ph-dash-stat"><span class="ph-label">State</span><strong id="ph-runtime-world" class="ph-status-indicator">Idle</strong></div>
            </div>
        `;
        workspace.appendChild(hero);

        const labPane = this._el('div', 'ph-lab-pane');
        workspace.appendChild(labPane);
        this._buildLabPane(labPane);

        // ── Root tabs ────────────────────────────────────────────────────────────
        const tabs = this._el('div', 'phys-tab-bar');
        const bodies = this._el('div', 'phys-tab-pane');
        const windTab = this._el('div', 'phys-tab-pane', 'display:none');
        const liqTab = this._el('div', 'phys-tab-pane', 'display:none');
        const advTab = this._el('div', 'phys-tab-pane', 'display:none');
        const ragTab = this._el('div', 'phys-tab-pane', 'display:none');

        [['Simulation', 'bodies'], ['Wind', 'wind'], ['Liquid', 'liquid'], ['Advanced', 'adv'], ['Ragdoll', 'rag']].forEach(([lbl, key], idx) => {
            const btn = this._el('button', idx === 0 ? 'phys-tab active' : 'phys-tab');
            btn.textContent = lbl;
            btn.onclick = () => {
                tabs.querySelectorAll('.phys-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                [bodies, windTab, liqTab, advTab, ragTab].forEach(p => p.style.display = 'none');
                [bodies, windTab, liqTab, advTab, ragTab][idx].style.display = 'block';
            };
            tabs.appendChild(btn);
        });

        workspace.appendChild(tabs);
        workspace.appendChild(bodies);
        workspace.appendChild(windTab);
        workspace.appendChild(liqTab);
        workspace.appendChild(advTab);
        workspace.appendChild(ragTab);
        content.appendChild(workspace);

        this._buildSimTab(bodies);
        this._buildWindTab(windTab);
        this._buildLiquidTab(liqTab);
        this._buildAdvTab(advTab);
        this._buildRagdollTab(ragTab);

        this._injectStyles();
        this.refreshWorkbench();
    }

    _buildLabPane(parent) {
        const domains = this._card('Simulation Domains');
        const domainGrid = this._el('div', 'ph-domain-grid');
        domainGrid.innerHTML = `
            <div class="ph-domain-item"><span>RBD</span><strong id="ph-domain-rbd">0 active</strong></div>
            <div class="ph-domain-item"><span>FLIP</span><strong id="ph-domain-flip">0 zones</strong></div>
            <div class="ph-domain-item"><span>Vellum</span><strong id="ph-domain-vellum">0 bodies</strong></div>
            <div class="ph-domain-item"><span>POP</span><strong id="ph-domain-pop">0 fields</strong></div>
            <div class="ph-domain-item"><span>Joints</span><strong id="ph-domain-constraints">0 links</strong></div>
            <div class="ph-domain-item"><span>Stats</span><strong id="ph-domain-runtime">Idle</strong></div>
        `;
        domains.appendChild(domainGrid);
        parent.appendChild(domains);
    }

    // ── TAB 1: Simulation + Object props ──────────────────────────────
    _buildSimTab(parent) {
        // Simulation Card
        const sim = this._card('Simulation Control');
        sim.appendChild(this._row([
            this._switch('Run Physics', 'ph-run', false, v => this.sys.toggleSimulation(v)),
            this._btn('Reset World', () => this.sys.resetAll(), 'ph-reset-all', 'ph-btn-secondary')
        ]));
        sim.appendChild(this._slider('Gravity Y', 'ph-gravity', -30, 10, 0.1, -9.81, v => this.sys.setGravity(v)));
        sim.appendChild(this._slider('Time Scale', 'ph-timescale', 0.05, 4, 0.01, 1, v => this.sys.setTimeScale(v)));
        sim.appendChild(this._slider('Iterations', 'ph-solver-iter', 4, 64, 1, 12, v => this.sys.setSolverIterations(v)));
        sim.appendChild(this._slider('Substeps', 'ph-substeps', 1, 32, 1, 10, v => this.sys.setMaxSubSteps(v)));
        sim.appendChild(this._slider('Fixed Hz', 'ph-fixed-hz', 30, 240, 1, 60, v => this.sys.setSolverHz(v)));
        parent.appendChild(sim);

        // Object Properties Card
        const obj = this._card('Object Properties');
        obj.id = 'ph-obj-card';
        obj.appendChild(this._sectionTitle('No object selected', 'ph-obj-name'));

        // Add Physics button
        const addPane = this._el('div'); addPane.id = 'ph-add-pane';
        addPane.appendChild(this._bigBtn('Add Rigid Body', () => this.sys.enablePhysicsForSelection(), 'primary'));
        obj.appendChild(addPane);

        // Edit pane
        const editPane = this._el('div'); editPane.id = 'ph-edit-pane'; editPane.style.display = 'none';

        const matOpts = Object.entries(PHYSICS_MATERIALS).map(([k, v]) => ({ v: k, t: v.label }));
        editPane.appendChild(this._select('Material', 'ph-material', matOpts, () => this._applyMaterialPreset()));
        editPane.appendChild(this._select('Motion Type', 'ph-body-type', [
            { v: 'dynamic', t: 'Dynamic (Moving)' },
            { v: 'kinematic', t: 'Kinematic (Anim)' },
            { v: 'static', t: 'Static (Fixed)' },
        ], () => this.sys.rebuildSelected()));
        editPane.appendChild(this._select('Collider', 'ph-shape', [
            { v: 'box', t: 'Box' }, { v: 'sphere', t: 'Sphere' },
            { v: 'capsule', t: 'Capsule' }, { v: 'cylinder', t: 'Cylinder' },
            { v: 'cone', t: 'Cone' }, { v: 'convex', t: 'Convex Hull' },
        ], () => this.sys.rebuildSelected()));

        // Advanced collider authoring.
        // This opens physics/ui/ColliderEditorPanel.js for the selected object.
        editPane.appendChild(this._bigBtn('Edit Collider', () => {
            const target =
                this.sys?.selectedObject ||
                window.selectedObject ||
                window.physicsSystem?.selectedObject ||
                null;
            if (!target) {
                console.warn('[PhysicsUI] Select an object before opening Collider Editor.');
                return;
            }
            if (typeof window.openColliderEditorPanel !== 'function') {
                console.error('[PhysicsUI] Inline ColliderEditorPanel is not loaded.');
                return;
            }
            window.openColliderEditorPanel(target);
        }, 'secondary'));

        editPane.appendChild(this._divider());
        editPane.appendChild(this._slider('Mass (kg)', 'ph-mass', 0.01, 2000, 0.01, 1, () => this.sys.updateBodyProps()));
        editPane.appendChild(this._slider('Lin Damp', 'ph-ldamp', 0, 1, 0.01, 0.05, () => this.sys.updateBodyProps()));
        editPane.appendChild(this._slider('Ang Damp', 'ph-adamp', 0, 1, 0.01, 0.05, () => this.sys.updateBodyProps()));
        editPane.appendChild(this._slider('Friction', 'ph-friction', 0, 2, 0.01, 0.50, () => this.sys.updateBodyProps()));
        editPane.appendChild(this._slider('Bounciness', 'ph-bounce', 0, 1.5, 0.01, 0.10, () => this.sys.updateBodyProps()));
        editPane.appendChild(this._slider('Grav Scale', 'ph-gravscale', 0, 3, 0.01, 1.00, () => this.sys.updateBodyProps()));

        editPane.appendChild(this._divider());
        editPane.appendChild(this._checkRow([
            { lbl: 'Gravity', id: 'ph-flag-grav', val: true },
            { lbl: 'CCD', id: 'ph-flag-ccd', val: false },
            { lbl: 'No Sleep', id: 'ph-flag-wake', val: true },
            { lbl: 'Wind AffX', id: 'ph-flag-wind', val: true },
        ], () => this.sys.updateBodyProps()));

        editPane.appendChild(this._divider());
        editPane.appendChild(this._sectionTitle('Live State'));
        editPane.appendChild(this._liveRow('ph-vel', 'Velocity'));
        editPane.appendChild(this._liveRow('ph-angvel', 'Ang Vel'));

        editPane.appendChild(this._divider());
        editPane.appendChild(this._sectionTitle('Impulse'));
        editPane.appendChild(this._vector3('Vector', 'ph-imp-x', 'ph-imp-y', 'ph-imp-z', 0, 5, 0));
        editPane.appendChild(this._btn('Apply Impulse', () => this.sys.applyImpulseToSelected(), '', 'ph-btn-action'));

        editPane.appendChild(this._divider());
        editPane.appendChild(this._sectionTitle('Constraints'));
        const jGrid = this._el('div', 'ph-joint-grid');
        [
            ['Hinge', () => this.sys.linkSelected('hinge')],
            ['Chain', () => this.sys.linkSelected('point')],
            ['Lock', () => this.sys.linkSelected('lock')],
            ['Spring', () => this.sys.linkSelected('spring')],
            ['Slider', () => this.sys.linkSelected('slider')],
            ['6-DOF', () => this.sys.linkSelected('6dof')],
        ].forEach(([lbl, fn]) => jGrid.appendChild(this._btn(lbl, fn, 'ph-joint-btn', '')));
        editPane.appendChild(jGrid);

        editPane.appendChild(this._divider());
        editPane.appendChild(this._bigBtn('Remove Physics', () => this.sys.removePhysicsFromSelection(), 'danger'));

        obj.appendChild(editPane);
        parent.appendChild(obj);
    }

    _buildWindTab(parent) {
        const card = this._card('Wind Nodes');
        card.appendChild(this._bigBtn('+ Add Wind Node', () => this.sys.addWindZone(), 'primary'));
        card.appendChild(this._divider());

        const list = this._el('div'); list.id = 'ph-wind-list';
        card.appendChild(list);
        parent.appendChild(card);

        this.refreshWindList = () => {
            list.innerHTML = '';
            this.sys.windZones.forEach((wz, i) => {
                const item = this._el('div', 'ph-list-item');
                item.appendChild(this._sectionTitle(`Wind Zone [${i}]`));
                item.appendChild(this._switch('Enabled', 'wz-en-' + wz.id, wz.enabled, v => { wz.enabled = v; wz.updateHelper(); }));
                item.appendChild(this._select('Mode', 'wz-mode-' + wz.id, [
                    { v: 'directional', t: 'Directional' }, { v: 'radial', t: 'Radial' }, { v: 'vortex', t: 'Vortex' }
                ], e => { wz.mode = e.target.value; wz.updateHelper(); }));

                item.appendChild(this._slider('Strength', 'wz-str-' + wz.id, 0, 200, 0.5, wz.strength, v => { wz.strength = v; }));
                item.appendChild(this._slider('Turbulence', 'wz-turb-' + wz.id, 0, 3, 0.01, wz.turbulence, v => { wz.turbulence = v; }));
                item.appendChild(this._slider('Frequency', 'wz-freq-' + wz.id, 0, 8, 0.01, wz.frequency, v => { wz.frequency = v; }));
                item.appendChild(this._slider('Radius', 'wz-rad-' + wz.id, 0, 100, 0.5, wz.radius, v => { wz.radius = v; wz.updateHelper(); }));

                item.appendChild(this._divider());
                item.appendChild(this._vector3('Direction', 'wz-dx-' + wz.id, 'wz-dy-' + wz.id, 'wz-dz-' + wz.id, wz.direction.x, wz.direction.y, wz.direction.z));
                item.appendChild(this._vector3('Position', 'wz-px-' + wz.id, 'wz-py-' + wz.id, 'wz-pz-' + wz.id, wz.position.x, wz.position.y, wz.position.z));

                item.appendChild(this._btn('Delete Node', () => { this.sys.removeWindZone(wz.id); this.refreshWindList(); }, '', 'ph-btn-danger'));
                list.appendChild(item);
            });
        };
        this.refreshWindList();
    }

    _buildLiquidTab(parent) {
        const card = this._card('Fluid Domains');
        card.appendChild(this._select('Preset', 'ph-liq-type', [
            { v: 'water', t: 'Water' }, { v: 'oil', t: 'Oil' },
            { v: 'lava', t: 'Lava' }, { v: 'mercury', t: 'Mercury' },
            { v: 'custom', t: 'Custom' },
        ], () => this._applyLiquidPreset()));

        card.appendChild(this._slider('Density', 'ph-liq-density', 0, 15000, 10, 1000, () => { }));
        card.appendChild(this._slider('Viscosity', 'ph-liq-viscosity', 0, 5, 0.01, 0.9, () => { }));
        card.appendChild(this._slider('Wave Height', 'ph-liq-waveh', 0, 2, 0.01, 0.15, () => { }));
        card.appendChild(this._slider('Wave Speed', 'ph-liq-waves', 0, 5, 0.01, 1.0, () => { }));
        card.appendChild(this._divider());
        card.appendChild(this._vector3('Bounds (W/H/D)', 'ph-liq-hw', 'ph-liq-hd', 'ph-liq-dep', 8, 8, 4));
        card.appendChild(this._slider('Surface Y', 'ph-liq-y', -20, 20, 0.5, 0, () => { }));

        card.appendChild(this._colorPicker('Color', 'ph-liq-color', '#0055cc'));

        card.appendChild(this._bigBtn('+ Create Fluid Domain', () => {
            const cpick = document.getElementById('ph-liq-color');
            this.sys.addLiquidZone({
                liquidType: this._val('ph-liq-type'),
                density: parseFloat(this._val('ph-liq-density')),
                viscosity: parseFloat(this._val('ph-liq-viscosity')),
                waveHeight: parseFloat(this._val('ph-liq-waveh')),
                waveSpeed: parseFloat(this._val('ph-liq-waves')),
                y: parseFloat(this._val('ph-liq-y')),
                halfW: parseFloat(this._val('ph-liq-hw')),
                halfD: parseFloat(this._val('ph-liq-hd')),
                depth: parseFloat(this._val('ph-liq-dep')),
                color: parseInt(cpick.value.replace('#', ''), 16),
            });
            this.refreshLiquidList();
        }, 'primary'));

        card.appendChild(this._divider());
        const list = this._el('div'); list.id = 'ph-liq-list';
        card.appendChild(list);
        parent.appendChild(card);

        this.refreshLiquidList = () => {
            list.innerHTML = '';
            this.sys.liquidZones.forEach((lz, i) => {
                const item = this._el('div', 'ph-list-item');
                item.appendChild(this._sectionTitle(`Fluid Domain [${i}]`));
                item.appendChild(this._switch('Enabled', 'lz-en-' + lz.id, lz.enabled, v => { lz.enabled = v; }));
                item.appendChild(this._slider('Surface Y', 'lz-y-' + lz.id, -20, 20, 0.5, lz.surfaceY, v => { lz.surfaceY = v; if (lz._mesh) lz._mesh.position.y = v; }));
                item.appendChild(this._slider('Density', 'lz-d-' + lz.id, 0, 15000, 10, lz.density, v => { lz.density = v; }));
                item.appendChild(this._btn('Delete Domain', () => { this.sys.removeLiquidZone(lz.id); this.refreshLiquidList(); }, '', 'ph-btn-danger'));
                list.appendChild(item);
            });
        };
        this.refreshLiquidList();
    }

    _buildAdvTab(parent) {
        const expCard = this._card('Explosion Tools');
        expCard.appendChild(this._slider('Radius', 'ph-exp-radius', 0.5, 50, 0.5, 10, () => { }));
        expCard.appendChild(this._slider('Strength', 'ph-exp-strength', 10, 5000, 10, 800, () => { }));
        expCard.appendChild(this._bigBtn('Detonate at Origin', () => {
            this.sys.applyExplosion(
                new THREE.Vector3(0, 0, 0),
                parseFloat(this._val('ph-exp-radius')),
                parseFloat(this._val('ph-exp-strength'))
            );
        }, 'danger'));

        const forceCard = this._card('Force Fields');
        forceCard.appendChild(this._select('Type', 'ph-ff-type', [
            { v: 'attractor', t: 'Attractor (Pull)' }, { v: 'repulsor', t: 'Repulsor (Push)' },
            { v: 'vortex', t: 'Vortex' }, { v: 'turbulence', t: 'Turbulence' },
        ], () => { }));
        forceCard.appendChild(this._slider('Strength', 'ph-ff-strength', 0, 500, 1, 50, () => { }));
        forceCard.appendChild(this._vector3('Position', 'ph-ff-x', 'ph-ff-y', 'ph-ff-z', 0, 0, 0));
        forceCard.appendChild(this._btn('Add Field', () => {
            this.sys.addForceField(
                this._val('ph-ff-type'),
                new THREE.Vector3(parseFloat(this._val('ph-ff-x')), parseFloat(this._val('ph-ff-y')), parseFloat(this._val('ph-ff-z'))),
                parseFloat(this._val('ph-ff-strength'))
            );
        }, '', 'ph-btn-action'));
        forceCard.appendChild(this._btn('Clear All Fields', () => this.sys.clearForceFields(), '', 'ph-btn-danger'));

        const debugCard = this._card('Diagnostics');
        debugCard.appendChild(this._switch('Draw Colliders', 'ph-debug-col', false, v => this.sys.setDebug(v)));
        debugCard.appendChild(this._switch('Draw Sleep States', 'ph-debug-sleep', false, v => this.sys.debugSleep = v));
        debugCard.appendChild(this._btn('Wake All Bodies', () => this.sys.wakeAll(), '', 'ph-btn-secondary'));
        debugCard.appendChild(this._btn('Dump State', () => this.sys.dumpState(), '', 'ph-btn-secondary'));

        parent.appendChild(expCard);
        parent.appendChild(forceCard);
        parent.appendChild(debugCard);
    }

    updateObjectPanel(obj) {
        const nameEl = document.getElementById('ph-obj-name');
        const addPane = document.getElementById('ph-add-pane');
        const editPane = document.getElementById('ph-edit-pane');
        if (!nameEl) return;

        if (!obj) {
            nameEl.textContent = 'No selection';
            addPane.style.display = 'block';
            editPane.style.display = 'none';
            return;
        }

        nameEl.textContent = obj.name || 'Unnamed Object';
        const props = obj.userData.physics;

        if (!props) {
            addPane.style.display = 'block';
            editPane.style.display = 'none';
        } else {
            addPane.style.display = 'none';
            editPane.style.display = 'block';

            const type = props.isKinematic ? 'kinematic' : props.mass === 0 ? 'static' : 'dynamic';
            this._set('ph-body-type', type);
            this._set('ph-shape', props.shapeType || 'box');
            this._set('ph-material', props.material || 'DEFAULT');
            this._set('ph-mass', props.mass ?? 1);
            this._set('ph-ldamp', props.linearDamping ?? 0.05);
            this._set('ph-adamp', props.angularDamping ?? 0.05);
            this._set('ph-friction', props.friction ?? 0.5);
            this._set('ph-bounce', props.restitution ?? 0.1);
            this._set('ph-gravscale', props.gravityScale ?? 1);
            this._setCB('ph-flag-grav', props.flags?.enableGravity ?? true);
            this._setCB('ph-flag-ccd', props.flags?.ccd ?? false);
            this._setCB('ph-flag-wake', props.flags?.noSleep ?? true);
            this._setCB('ph-flag-wind', props.flags?.windAffected ?? true);
        }
    }

    updateLiveState(vel, angVel) {
        const velEl = document.getElementById('ph-vel');
        const angvelEl = document.getElementById('ph-angvel');
        if (velEl) velEl.textContent = `${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)}`;
        if (angvelEl) angvelEl.textContent = `${angVel.x.toFixed(2)}, ${angVel.y.toFixed(2)}, ${angVel.z.toFixed(2)}`;
    }

    refreshWorkbench() {
        const report = this.sys.getRuntimeReport ? this.sys.getRuntimeReport() : null;
        if (!report) return;
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        setText('ph-runtime-ammo', report.ammoBackend);
        setText('ph-runtime-local', report.localBackend);
        setText('ph-runtime-profile', report.activePreset);

        const worldEl = document.getElementById('ph-runtime-world');
        if (worldEl) {
            worldEl.textContent = report.worldReady ? (this.sys.simulationRunning ? 'Running' : 'Ready') : 'Offline';
            worldEl.style.color = this.sys.simulationRunning ? '#4caf50' : '#f39c12';
        }

        setText('ph-domain-rbd', `${report.rigidBodies} active`);
        setText('ph-domain-flip', `${report.liquidZones} zones`);
        setText('ph-domain-vellum', `${report.softBodies} bodies`);
        setText('ph-domain-pop', `${report.forceFields} fields`);
        setText('ph-domain-constraints', `${report.constraints} links`);
        setText('ph-domain-runtime', report.localDetails);
        this._refreshRagdollStatus();
    }

    _applyLiquidPreset() {
        const presets = {
            water: { density: 1000, viscosity: 0.90, color: '#0055cc' },
            oil: { density: 870, viscosity: 2.50, color: '#886600' },
            lava: { density: 3100, viscosity: 4.50, color: '#cc3300' },
            mercury: { density: 13600, viscosity: 1.20, color: '#aabbcc' },
            custom: null,
        };
        const p = presets[this._val('ph-liq-type')];
        if (!p) return;
        this._set('ph-liq-density', p.density);
        this._set('ph-liq-viscosity', p.viscosity);
        const cpick = document.getElementById('ph-liq-color');
        if (cpick) cpick.value = p.color;
    }

    // ── Ragdoll tab ────────────────────────────────────────────────────────

    _ragdoll() {
        return window.ragdollSystem ||
            (window.ragdollSystem = new RagdollSystem(this.sys));
    }

    _buildRagdollTab(parent) {
        const status = this._card('Ragdoll Status');
        status.appendChild(this._sectionTitle('Inactive — ragdoll the player character', 'ph-rag-status'));
        status.appendChild(this._liveRow('ph-rag-parts', 'Parts'));
        status.appendChild(this._liveRow('ph-rag-joints', 'Joints'));
        parent.appendChild(status);

        const control = this._card('Ragdoll Control');
        control.appendChild(this._row([
            this._btn('Enable Ragdoll', () => this._ragdollToggle(true), 'ph-rag-enable', 'ph-btn-action'),
            this._btn('Revive', () => this._ragdollToggle(false), 'ph-rag-disable', 'ph-btn-secondary'),
        ]));
        control.appendChild(this._divider());
        control.appendChild(this._slider('Explosion Radius', 'ph-rag-radius', 1, 25, 0.5, 8, () => {}));
        control.appendChild(this._slider('Explosion Strength', 'ph-rag-strength', 1, 80, 1, 25, () => {}));
        control.appendChild(this._btn('Apply Explosion at Player', () => this._ragdollExplosion(), 'ph-rag-boom', 'ph-btn-action'));
        parent.appendChild(control);

        this._refreshRagdollStatus();
    }

    _ragdollToggle(enable) {
        const rs = this._ragdoll();
        const target = window.player || null;
        if (enable) {
            if (rs.active) rs.disableRagdoll();
            rs.enableRagdoll(target);
        } else {
            rs.disableRagdoll();
        }
        this._refreshRagdollStatus();
    }

    _ragdollExplosion() {
        const rs = this._ragdoll();
        if (!rs.active) return;
        const player = window.player;
        const origin = player?.model?.position
            ? player.model.position.clone()
            : new THREE.Vector3(0, 1, 0);
        rs.applyExplosionForce(
            origin,
            Number(this._val('ph-rag-radius')) || 8,
            Number(this._val('ph-rag-strength')) || 25
        );
    }

    _refreshRagdollStatus() {
        const rs = window.ragdollSystem;
        if (!rs) return;
        const statusEl = document.getElementById('ph-rag-status');
        const partsEl = document.getElementById('ph-rag-parts');
        const jointsEl = document.getElementById('ph-rag-joints');
        if (statusEl) {
            statusEl.textContent = rs.active
                ? 'ACTIVE — ragdolling'
                : 'Inactive — ragdoll the player character';
            statusEl.style.color = rs.active ? '#4caf50' : '';
        }
        if (partsEl) partsEl.textContent = String(rs.parts.length);
        if (jointsEl) jointsEl.textContent = String(rs.joints.length);
    }

    _applyMaterialPreset() {
        const k = this._val('ph-material');
        const m = PHYSICS_MATERIALS[k];
        if (!m) return;
        this._set('ph-friction', m.friction);
        this._set('ph-bounce', m.restitution);
        this.sys.updateBodyProps();
    }

    // ── DOM Software-style Component Helpers ─────────────────────────────────

    _el(tag, cls = '', style = '') {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (style) e.style.cssText = style;
        return e;
    }

    _card(title) {
        const d = this._el('div', 'ph-card');
        const h = this._el('div', 'ph-card-title'); h.textContent = title;
        d.appendChild(h); return d;
    }

    _sectionTitle(txt, id = '') {
        const e = this._el('div', 'ph-sec-title');
        if (id) e.id = id;
        e.textContent = txt; return e;
    }

    _divider() { return this._el('div', 'ph-divider'); }

    _row(children) {
        const d = this._el('div', 'ph-row');
        children.forEach(c => d.appendChild(c)); return d;
    }

    // Two-column layout: Label | Control
    _propRow(lbl) {
        const wrap = this._el('div', 'ph-prop-row');
        const label = this._el('label', 'ph-prop-label'); label.textContent = lbl;
        wrap.appendChild(label);
        return { wrap, controlContainer: this._el('div', 'ph-prop-ctrl') };
    }

    _switch(lbl, id, checked, onChange) {
        const { wrap, controlContainer } = this._propRow(lbl);
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = id; cb.checked = checked; cb.className = 'ph-checkbox';
        cb.addEventListener('change', e => onChange(e.target.checked));
        controlContainer.appendChild(cb);
        wrap.appendChild(controlContainer);
        this.els[id] = cb; return wrap;
    }

    _slider(lbl, id, min, max, step, val, onChange) {
        const { wrap, controlContainer } = this._propRow(lbl);

        const s = document.createElement('input'); s.type = 'range'; s.id = id;
        s.min = min; s.max = max; s.step = step; s.value = val; s.className = 'ph-range';

        const n = document.createElement('input'); n.type = 'number';
        n.value = val; n.step = step; n.min = min; n.max = max; n.className = 'ph-num-input ph-num-small';

        const sync = v => {
            const vv = parseFloat(v);
            s.value = vv; n.value = vv;
            onChange(vv);
        };
        s.oninput = () => sync(s.value);
        n.onchange = () => sync(n.value);

        controlContainer.style.display = 'flex';
        controlContainer.style.gap = '4px';
        controlContainer.append(s, n);
        wrap.appendChild(controlContainer);

        this.els[id] = s; return wrap;
    }

    _select(lbl, id, opts, onChange) {
        const { wrap, controlContainer } = this._propRow(lbl);
        const sel = document.createElement('select'); sel.id = id; sel.className = 'ph-select';
        opts.forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.t; sel.appendChild(opt); });
        sel.addEventListener('change', onChange);
        controlContainer.appendChild(sel);
        wrap.appendChild(controlContainer);
        this.els[id] = sel; return wrap;
    }

    _vector3(lbl, idX, idY, idZ, vX, vY, vZ, onChange) {
        const { wrap, controlContainer } = this._propRow(lbl);
        controlContainer.style.display = 'flex';
        controlContainer.style.gap = '2px';

        const createInput = (id, val, axis) => {
            const wrapper = this._el('div', 'ph-vec-input-wrap');
            const prefix = this._el('span', 'ph-vec-axis'); prefix.textContent = axis;
            const inp = document.createElement('input');
            inp.type = 'number'; inp.id = id; inp.value = val; inp.className = 'ph-num-input ph-vec-input';
            wrapper.append(prefix, inp);
            this.els[id] = inp;
            return wrapper;
        };

        controlContainer.append(createInput(idX, vX, 'X'), createInput(idY, vY, 'Y'), createInput(idZ, vZ, 'Z'));
        wrap.appendChild(controlContainer);

        if (typeof onChange === 'function') {
            const read = () => {
                const num = id => {
                    const e = document.getElementById(id);
                    return e ? (parseFloat(e.value) || 0) : 0;
                };
                onChange({ x: num(idX), y: num(idY), z: num(idZ) });
            };
            [idX, idY, idZ].forEach(id => {
                const e = document.getElementById(id);
                if (e) e.addEventListener('input', read);
            });
        }
        return wrap;
    }

    _colorPicker(lbl, id, val) {
        const { wrap, controlContainer } = this._propRow(lbl);
        const cpick = document.createElement('input');
        cpick.type = 'color'; cpick.value = val; cpick.id = id; cpick.className = 'ph-color-picker';
        controlContainer.appendChild(cpick);
        wrap.appendChild(controlContainer);
        return wrap;
    }

    _checkRow(items, onChange) {
        const wrap = this._el('div', 'ph-check-row');
        items.forEach(({ lbl, id, val }) => {
            const l = this._el('label', 'ph-check-item');
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = val; cb.className = 'ph-checkbox';
            cb.addEventListener('change', onChange);
            const sp = this._el('span'); sp.textContent = lbl;
            l.append(cb, sp); wrap.appendChild(l);
            this.els[id] = cb;
        });
        return wrap;
    }

    _btn(lbl, fn, id = '', cls = '') {
        const b = document.createElement('button');
        b.textContent = lbl; b.id = id; b.className = 'ph-btn ' + cls;
        b.onclick = fn; return b;
    }

    _bigBtn(lbl, fn, variant = '') {
        const b = document.createElement('button');
        b.textContent = lbl; b.className = 'ph-btn ph-btn-large ph-btn-' + variant;
        b.onclick = fn; return b;
    }

    _liveRow(id, lbl) {
        const { wrap, controlContainer } = this._propRow(lbl);
        const v = this._el('span', 'ph-live-val');
        v.id = id; v.textContent = '—';
        controlContainer.appendChild(v);
        wrap.appendChild(controlContainer);
        return wrap;
    }

    _val(id) { const e = document.getElementById(id) || this.els[id]; if (!e) return ''; return e.type === 'checkbox' ? e.checked : e.value; }
    getVal(id) { return this._val(id); }
    _set(id, v) { const e = document.getElementById(id) || this.els[id]; if (e) e.value = v; }
    _setCB(id, v) { const e = document.getElementById(id) || this.els[id]; if (e) e.checked = v; }

    // ── Software App Theme CSS Injection ─────────────────────────────────────
    // ── Fixed #333 Surface Styling & Label Fix ───────────────────────────────
    _injectStyles() {
        if (document.getElementById('ph-app-styles')) return;
        const s = document.createElement('style');
        s.id = 'ph-app-styles';
        s.textContent = `
        :root {
            --ph-bg: #333333;
            --ph-panel-bg: #333333;
            --ph-panel-bg-soft: #2d2d2d;
            --ph-header-bg: #333333;
            --ph-border: #444444;
            --ph-border-light: #484848;
            --ph-border-subtle: #3a3a3a;
            --ph-text: #ffffff;
            --ph-text-secondary: #cccccc;
            --ph-text-dim: #a0a0a0;
            --ph-accent: #00bcd4;
            --ph-input-bg: #262626;
            --ph-input-border: #444444;
            --ph-input-focus: #00bcd4;
            --ph-hover-bg: #3d3d3d;
            --ph-radius-sm: 3px;
            --ph-radius-md: 4px;
        }

        #physics-controls,
        .physics-controls,
        .physics-lab-panel {
            width: 100%;
            min-width: 0;
            background: #333333 !important;
            color: var(--ph-text);
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 11px;
            box-sizing: border-box;
        }

        #physics-controls {
            margin: 0;
            padding: 0;
            border-radius: 0;
            flex-direction: column;
            overflow-y: auto;
            overflow-x: hidden;
        }

        #physics-controls > .panel-header {
            display: flex;
            align-items: center;
            gap: 6px;
            min-height: 28px;
            flex-shrink: 0;
            padding: 0 8px;
            background: #333333 !important;
            border-bottom: 1px solid #444444 !important;
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .04em;
            position: sticky;
            top: 0;
            z-index: 2;
        }

        #physics-controls > .panel-header i {
            color: #00bcd4 !important;
        }

        .physics-content {
            display: flex;
            flex-direction: column;
            width: 100%;
            padding: 6px;
            background: #333333 !important;
            color: var(--ph-text);
            box-sizing: border-box;
            overflow-x: hidden;
            overflow-y: visible;
        }

        .ph-workspace {
            display: flex;
            flex-direction: column;
            width: 100%;
            background: #333333 !important;
        }

        /* All Cards & Dashboard use #333 */
        .ph-dashboard,
        .ph-card {
            background: #333333 !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 8px;
            margin-bottom: 6px;
            box-sizing: border-box;
        }


        .ph-dash-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
        }

        .ph-dash-stat {
            display: flex;
            flex: 1;
            min-width: 0;
            flex-direction: column;
            font-size: 10px;
        }

        .ph-dash-stat .ph-label {
            color: #a0a0a0;
            text-transform: uppercase;
            margin-bottom: 2px;
            font-size: 9px;
        }

        .ph-dash-stat strong {
            font-weight: 600;
            color: #ffffff;
        }

        .ph-lab-pane {
           width: 100%;
           background-color: #333333 !important;
           border: none !important;
           border-radius: 0 !important;
        }

        .ph-domain-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 4px;
            background-color: #333333 !important;
            padding: 4px;
        }

        .ph-domain-item {
            display: flex;
            flex-direction: column;
            padding: 5px 6px;
        
            background: #3b3b3b !important;
            border: none !important;
            border-radius: 0 !important;
        }

        .ph-domain-item span {
            color: #a0a0a0;
            font-size: 9px;
            text-transform: uppercase;
        }

        .ph-domain-item strong {
            color: #ffffff;
            font-size: 10px;
            font-weight: 600;
        }

        /* Tabs Bar */
        .phys-tab-bar {
            display: flex;
            align-items: stretch;
            width: 100%;
            margin-bottom: 8px;
            background: #333333 !important;
            border-bottom: 1px solid #444444 !important;
        }

        .phys-tab {
            flex: 1;
            height: 28px;
            padding: 0 4px;
            background: #333333 !important;
            border: 0;
            border-bottom: 2px solid transparent;
            color: #a0a0a0;
            font-size: 10px;
            font-weight: 600;
            cursor: pointer;
        }

        .phys-tab.active {
            color: #ffffff;
            background: rgba(0, 188, 212, 0.15) !important;
            border-bottom-color: #00bcd4 !important;
        }

        .ph-card-title {
            display: flex;
            align-items: center;
            min-height: 22px;
            margin-bottom: 7px;
            padding-bottom: 5px;
            border-bottom: 1px solid #444444;
            color: #ffffff;
            font-weight: 700;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: .04em;
        }

        .ph-divider {
            width: 100%;
            height: 1px;
            margin: 8px 0;
            background: #444444;
        }

        /* Label Truncation Fix (No GRAV..) */
        .ph-prop-row {
            display: flex;
            align-items: center;
            width: 100%;
            min-height: 24px;
            margin-bottom: 4px;
        }

        .ph-prop-label {
            flex: 0 0 85px !important;
            min-width: 85px !important;
            padding-right: 6px;
            color: #cccccc;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: visible;
        }

        .ph-prop-ctrl {
            display: flex;
            flex: 1;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }

        .ph-range {
            flex: 1;
            height: 16px;
            accent-color: #00bcd4;
            cursor: pointer;
        }

        .ph-num-input,
        .ph-select,
        .ph-color-picker {
            height: 22px;
            padding: 2px 6px;
        
            background: #3d3d3d !important;
            border: none !important;
            border-radius: 0 !important;
        
            color: #ffffff !important;
            font-size: 10px;
            outline: none;
        }
        
        .ph-num-input:hover,
        .ph-select:hover,
        .ph-color-picker:hover {
            background: #454545 !important;
        }
        
        .ph-num-input:focus,
        .ph-select:focus {
            background: #4a4a4a !important;
        }


        .ph-num-small {
            width: 55px !important;
            min-width: 55px !important;
            text-align: right;
            font-family: 'Cascadia Code', 'Consolas', monospace;
        }

        /* Buttons on #333 */
        .ph-btn {
           display: inline-flex;
           align-items: center;
           justify-content: center;
       
           min-height: 24px;
           padding: 4px 8px;
       
           background: #4a4a4a !important;
           border: none !important;
           border-radius: 0 !important;
       
           color: #f5f5f5 !important;
       
           font-size: 10px;
           font-weight: 500;
       
           cursor: pointer;
       
           transition: background 0.12s ease;
        }

        .ph-btn:hover {
            background: #5a5a5a !important;
        }
        
        .ph-btn:active {
            background: #666666 !important;
        }
        
        .ph-btn:disabled {
            background: #3a3a3a !important;
            color: #777777 !important;
            cursor: default;
        }

        /* Large Button */
        .ph-btn-large {
            width: 100%;
            min-height: 28px;
            margin-top: 4px;
            font-weight: 600;
        }

        /* Primary Button */
        .ph-btn-primary {
            background: #5a5a5a !important;
            border: none !important;
            border-radius: 0 !important;
            color: #ffffff !important;
        }
        
        .ph-btn-primary:hover {
            background: #686868 !important;
        }
        
        .ph-btn-primary:active {
            background: #747474 !important;
        }

        /* Secondary / Danger Buttons */
        .ph-btn-danger,
        .ph-btn-secondary {
            background: #454545 !important;
            border: none !important;
            border-radius: 0 !important;
            color: #eeeeee !important;
        }
        
        .ph-btn-danger:hover,
        .ph-btn-secondary:hover {
            background: #555555 !important;
        }

        .ph-vec-input-wrap {
            display: flex;
            flex: 1;
            height: 22px;
        
            background: #3d3d3d;
        
            border: none !important;
            border-radius: 0 !important;
        
            overflow: hidden;
        }
        .ph-vec-axis {
            display: flex;
            align-items: center;
            justify-content: center;
        
            width: 18px;
        
            background: #4a4a4a;
        
            border: none !important;
            border-right: none !important;
        
            color: #bcbcbc;
            font-size: 9px;
            font-weight: 700;
        }
        .ph-vec-input {
            height: 100%;
            width: 100%;
            padding: 2px 4px;
            background: transparent;
            border: none;
            color: #ffffff;
            font-size: 10px;
            outline: none;
        }
        `;
        document.head.appendChild(s);
    }
}