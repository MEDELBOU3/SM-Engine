/**
 * VideoEffectsDockManager.js
 * SM Engine — professional Effects Studio dock.
 *
 * Shared right-side slot:
 * Viewport / Sequencer | Effects Studio | Inspector
 *
 * Tabs:
 * EFFECTS | STACK | MASKS | PRESETS
 */
(function (global) {
    'use strict';
    class VideoEffectsDockManager {
        constructor() {
            this.manager = global.videoEffectsManager;
            this.panel = null; this.host = null; this.content = null; this.opened = false;
            this.activeTab = global.videoProject?.workspace?.perWorkspace?.edit?.effectsDockTab || 'effects';
            this.width = Number(global.videoProject?.workspace?.perWorkspace?.edit?.effectsDockWidth || 430);
            this.instance = null; this._resizeState = null; this._layoutSnapshot = null;
            this._stackUnsub = this.manager?.stack?.subscribe?.(() => { if (this.opened) { this.refresh(); global.videoEffectsInspectorPanel?.render?.() } });
            this._styles();
        }
        isOpen() { return !!(this.opened && this.panel?.isConnected) }
        open(options = {}) {
            if (!document.body.classList.contains('video-editing-mode')) global.videoEditingManager?.enter?.();

            global.videoNodeEditorManager?.close?.();
            global.audioStudioDockManager?.close?.();
            global.colorStudioDockManager?.close?.();
            global.videoTransitionsDockManager?.close?.();
            global.videoProjectDockManager?.close?.();
            global.videoDeliverDockManager?.close?.();

            this.manager = global.videoEffectsManager || this.manager;
            this.host = document.getElementById('editor-scene');
            if (!this.host) { console.warn('[EffectsStudioDock] #editor-scene not found'); return false }

            this._ensurePanel();
            if (this.panel.parentElement === this.host && this.host.lastElementChild !== this.panel) this.host.appendChild(this.panel);

            this.opened = true; this.panel.hidden = false; this.panel.style.display = 'grid'; this.panel.style.visibility = 'visible'; this.panel.style.opacity = '1'; this.panel.style.pointerEvents = 'auto';
            document.body.classList.add('video-effects-dock-open');
            document.body.classList.remove('video-node-editor-open', 'video-audio-dock-open', 'video-color-dock-open');

            this._applyWidth(); this._applyDockLayout();
            this.setTab(options.tab || this.activeTab || 'effects');
            this._syncHeader(); this._refreshLayout();
            return true;
        }
        close() {
            this.opened = false; document.body.classList.remove('video-effects-dock-open', 'video-effects-dock-resizing');
            this._destroyInstance();
            if (this.panel) { this.panel.hidden = true; this.panel.style.removeProperty('display'); this.panel.style.removeProperty('visibility'); this.panel.style.removeProperty('opacity'); this.panel.style.removeProperty('pointer-events') }
            this._restoreDockLayout(); this._refreshLayout(); return true;
        }
        toggle(options = {}) { return this.isOpen() ? this.close() : this.open(options) }
        setTab(tab) {
            const allowed = ['effects', 'stack', 'masks', 'presets'];
            this.activeTab = allowed.includes(tab) ? tab : 'effects';
            this._renderActiveTab(); this._syncTabs();
            global.videoProject?.setWorkspaceState?.('edit', { effectsDockTab: this.activeTab }, { dirty: false });
        }
        refresh() { if (!this.opened) return; this._syncHeader(); this._renderActiveTab() }
        _ensurePanel() {
            if (this.panel?.isConnected) return;
            const panel = document.createElement('section'); panel.id = 'video-effects-studio-dock'; panel.className = 'video-effects-studio-dock';
            panel.innerHTML = `
   <div class="video-effects-dock-resize"></div>
   <header class="video-effects-dock-header">
    <div class="video-effects-dock-title"><span>${this.manager.library.icon('effects')}</span><div><strong>Effects Studio</strong><em data-effects-dock-subtitle>No clip selected</em></div></div>
    <div class="video-effects-dock-actions">
     <button data-effects-action="copy" title="Copy selected effect">${this._svg('copy')}</button>
     <button data-effects-action="paste" title="Paste effect">${this._svg('paste')}</button>
     <button data-effects-action="close" title="Close">${this._svg('close')}</button>
    </div>
   </header>
   <nav class="video-effects-dock-tabs">
    <button data-effects-tab="effects">${this.manager.library.icon('effects')}<span>EFFECTS</span></button>
    <button data-effects-tab="stack">${this._svg('stack')}<span>STACK</span></button>
    <button data-effects-tab="masks">${this._svg('mask')}<span>MASKS</span></button>
    <button data-effects-tab="presets">${this._svg('preset')}<span>PRESETS</span></button>
   </nav>
   <div class="video-effects-dock-content"></div>
   <footer class="video-effects-dock-status"><span data-effects-status>Ready</span><span data-effects-count>0 effects</span></footer>`;
            this.host.appendChild(panel); this.panel = panel; this.content = panel.querySelector('.video-effects-dock-content'); this._bindPanel();
        }
        _renderActiveTab() {
            if (!this.content || !this.manager) return;
            this._destroyInstance(); this.content.innerHTML = '';

            if (this.activeTab === 'effects') {
                this.instance = new global.VideoEffectsBrowserPanel(this.manager); this.instance.mount(this.content);
            } else if (this.activeTab === 'stack') {
                this._renderStack();
            } else if (this.activeTab === 'masks') {
                this.instance = new global.VideoEffectsMaskPanel(this.manager); this.instance.mount(this.content);
            } else {
                this._renderPresets();
            }
            this._syncHeader();
        }
        _renderStack() {
            const clip = this.manager.stack.selectedClip();
            if (!clip) { this.content.innerHTML = '<div class="vefx-dock-empty"><strong>No clip selected</strong><span>Select a clip to edit its effect stack.</span></div>'; return }
            const stack = this.manager.stack.ensure(clip);

            this.content.innerHTML = `<div class="vefx-stack-panel">
   <header><div><strong>EFFECT STACK</strong><span>${this._esc(clip.name || 'Selected Clip')}</span></div><button data-stack-add>${this._svg('plus')} ADD EFFECT</button></header>
   <div class="vefx-stack-list">${stack.length ? stack.map((fx, index) => this._stackCard(fx, index)).join('') : '<div class="vefx-dock-empty"><strong>No effects</strong><span>Add an effect from the Effects tab.</span></div>'}</div>
  </div>`;

            this.content.querySelector('[data-stack-add]')?.addEventListener('click', () => this.setTab('effects'));
            this.content.querySelectorAll('[data-stack-card]').forEach(card => this._bindStackCard(card, clip));
        }
        _stackCard(fx, index) {
            const def = this.manager.library.get(fx.id);
            return `<article class="vefx-stack-card ${fx.uid === this.manager.stack.selectedEffectUid ? 'selected' : ''}" draggable="true" data-stack-card="${fx.uid}" data-stack-index="${index}">
   <header>
    <span class="vefx-stack-drag">${this._svg('drag')}</span>
    <button data-stack-enable class="${fx.enabled !== false ? 'active' : ''}" title="Enable">${this._svg('power')}</button>
    <span class="vefx-stack-icon">${this.manager.library.icon(def?.icon || 'effects')}</span>
    <div><strong>${this._esc(def?.name || fx.name || fx.id)}</strong><em>${def?.renderer === 'gpu' ? 'GPU EFFECT' : this._esc(def?.category || 'Effect')}</em></div>
    <button data-stack-solo class="${fx.solo ? 'active' : ''}" title="Solo">S</button>
    <button data-stack-duplicate title="Duplicate">${this._svg('copy')}</button>
    <button data-stack-remove title="Remove">${this._svg('trash')}</button>
   </header>
   <label class="vefx-stack-mix"><span>Mix</span><input data-stack-mix type="range" min="0" max="1" step="0.01" value="${Number(fx.mix ?? 1)}"><output>${Math.round(Number(fx.mix ?? 1) * 100)}%</output></label>
  </article>`;
        }
        _bindStackCard(card, clip) {
            const uid = card.dataset.stackCard;
            card.addEventListener('click', event => { if (event.target.closest('button,input')) return; this.manager.stack.select(uid); this._renderStack(); global.videoEffectsInspectorPanel?.render?.() });
            card.querySelector('[data-stack-enable]')?.addEventListener('click', () => { this.manager.stack.toggle(uid, clip); this._renderStack() });
            card.querySelector('[data-stack-solo]')?.addEventListener('click', () => { this.manager.stack.solo(uid, clip); this._renderStack() });
            card.querySelector('[data-stack-duplicate]')?.addEventListener('click', () => { this.manager.stack.duplicate(uid, clip); this._renderStack() });
            card.querySelector('[data-stack-remove]')?.addEventListener('click', () => { this.manager.stack.remove(uid, clip); this._renderStack() });
            const mix = card.querySelector('[data-stack-mix]'); mix?.addEventListener('input', () => { const v = Number(mix.value); this.manager.stack.setMix(uid, v, clip); mix.nextElementSibling.textContent = `${Math.round(v * 100)}%` });

            card.addEventListener('dragstart', event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', uid); card.classList.add('dragging') });
            card.addEventListener('dragend', () => card.classList.remove('dragging'));
            card.addEventListener('dragover', event => { event.preventDefault(); card.classList.add('drag-over') });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
            card.addEventListener('drop', event => { event.preventDefault(); card.classList.remove('drag-over'); const moving = event.dataTransfer.getData('text/plain'); if (moving) this.manager.stack.move(moving, Number(card.dataset.stackIndex), clip); this._renderStack() });
        }
        _renderPresets() {
            const presets = global.ensureVideoEffectsPresetManager?.();
            const list = presets?.list?.() || [];
            this.content.innerHTML = `<div class="vefx-presets-panel">
   <header><div><strong>PRESETS</strong><span>Project-local effect presets</span></div><div><button data-save-effect>${this._svg('save')} EFFECT</button><button data-save-stack>${this._svg('save')} STACK</button></div></header>
   <div class="vefx-preset-list">${list.length ? list.map(p => `<article class="vefx-preset-card" data-preset="${p.id}"><span>${this._svg('preset')}</span><div><strong>${this._esc(p.name)}</strong><em>${String(p.kind).toUpperCase()}</em></div><button data-apply>APPLY</button><button data-delete>${this._svg('trash')}</button></article>`).join('') : '<div class="vefx-dock-empty"><strong>No presets</strong><span>Save the selected effect or complete stack.</span></div>'}</div>
  </div>`;

            this.content.querySelector('[data-save-effect]')?.addEventListener('click', () => { const name = prompt('Effect preset name'); if (name) { presets.saveEffect(name); this._renderPresets() } });
            this.content.querySelector('[data-save-stack]')?.addEventListener('click', () => { const name = prompt('Stack preset name'); if (name) { presets.saveStack(name); this._renderPresets() } });
            this.content.querySelectorAll('[data-preset]').forEach(card => {
                const id = card.dataset.preset;
                card.querySelector('[data-apply]')?.addEventListener('click', () => { presets.apply(id); this.setTab('stack') });
                card.querySelector('[data-delete]')?.addEventListener('click', () => { presets.remove(id); this._renderPresets() });
            });
        }
        _destroyInstance() { this.instance?.destroy?.(); this.instance = null }
        _syncHeader() {
            const clip = this.manager?.stack?.selectedClip?.(), stack = clip ? this.manager.stack.ensure(clip) : [];
            const sub = this.panel?.querySelector('[data-effects-dock-subtitle]'); if (sub) sub.textContent = clip ? clip.name || 'Selected Clip' : 'No clip selected';
            const count = this.panel?.querySelector('[data-effects-count]'); if (count) count.textContent = `${stack.length} effect${stack.length === 1 ? '' : 's'}`;
            const status = this.panel?.querySelector('[data-effects-status]'); if (status) status.textContent = this.activeTab === 'effects' ? 'Effects Browser' : this.activeTab === 'stack' ? 'Effect Stack' : this.activeTab === 'masks' ? 'Effect Masks' : 'Effect Presets';
        }
        _syncTabs() { this.panel?.querySelectorAll('[data-effects-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.effectsTab === this.activeTab)) }
        _bindPanel() {
            this.panel.addEventListener('click', event => {
                const tab = event.target.closest('[data-effects-tab]')?.dataset?.effectsTab; if (tab) { this.setTab(tab); return }
                const action = event.target.closest('[data-effects-action]')?.dataset?.effectsAction;
                if (action === 'close') this.close();
                if (action === 'copy') this.manager.stack.copy();
                if (action === 'paste') { this.manager.stack.paste(); this.setTab('stack') }
            });

            const handle = this.panel.querySelector('.video-effects-dock-resize');
            handle?.addEventListener('pointerdown', event => {
                event.preventDefault(); this._resizeState = { startX: event.clientX, width: this.width }; document.body.classList.add('video-effects-dock-resizing');
                const move = e => { if (!this._resizeState) return; this.width = Math.max(320, Math.min(760, this._resizeState.width + (this._resizeState.startX - e.clientX))); this._applyWidth(); this._applyDockLayout(); this._refreshLayout() };
                const up = () => { global.removeEventListener('pointermove', move); document.body.classList.remove('video-effects-dock-resizing'); this._resizeState = null; global.videoProject?.setWorkspaceState?.('edit', { effectsDockWidth: this.width }, { dirty: false }) };
                global.addEventListener('pointermove', move); global.addEventListener('pointerup', up, { once: true });
            });
        }
        _capture(el, name) { return el ? { value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name) } : null }
        _restore(el, name, snap) { if (!el || snap == null) return; if (snap.value) el.style.setProperty(name, snap.value, snap.priority || ''); else el.style.removeProperty(name) }
        _captureDockLayout() {
            if (this._layoutSnapshot) return;
            const video = document.getElementById('video-editing-container'), seq = document.getElementById('sequencer-root'), split = document.querySelector('.sequencer-splitter');
            this._layoutSnapshot = { video: { el: video, right: this._capture(video, 'right'), width: this._capture(video, 'width'), max: this._capture(video, 'max-width') }, seq: { el: seq, right: this._capture(seq, 'right'), width: this._capture(seq, 'width'), max: this._capture(seq, 'max-width') }, split: { el: split, right: this._capture(split, 'right') } };
        }
        _applyDockLayout() {
            if (!this.opened) return; this._captureDockLayout();
            const width = `${Math.round(this.width)}px`, remain = `calc(100% - ${width})`;
            const video = document.getElementById('video-editing-container'), seq = document.getElementById('sequencer-root'), split = document.querySelector('.sequencer-splitter');
            [video, seq].forEach(el => { if (!el) return; el.style.setProperty('right', width, 'important'); el.style.setProperty('width', 'auto', 'important'); el.style.setProperty('max-width', remain, 'important') });
            split?.style.setProperty('right', width, 'important');
        }
        _restoreDockLayout() {
            const s = this._layoutSnapshot; if (!s) return;
            this._restore(s.video.el, 'right', s.video.right); this._restore(s.video.el, 'width', s.video.width); this._restore(s.video.el, 'max-width', s.video.max);
            this._restore(s.seq.el, 'right', s.seq.right); this._restore(s.seq.el, 'width', s.seq.width); this._restore(s.seq.el, 'max-width', s.seq.max); this._restore(s.split.el, 'right', s.split.right); this._layoutSnapshot = null;
        }
        _applyWidth() { document.documentElement.style.setProperty('--video-effects-dock-width', `${Math.round(this.width)}px`); if (this.panel) this.panel.style.width = `${Math.round(this.width)}px` }
        _refreshLayout() { requestAnimationFrame(() => { global.videoEditingManager?.resizeCanvas?.(); global.sequencerManager?.renderer?.refreshLayout?.(); global.sequencerManager?.renderer?.render?.(); global.dispatchEvent(new CustomEvent('sm:layout-resized', { detail: { source: 'effects-studio-dock', open: this.opened, width: this.width } })) }) }
        _svg(n) { const m = { close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11"/><path d="M16 8V5H5v11h3"/></svg>', paste: '<svg viewBox="0 0 24 24"><path d="M9 5h6M9 3h6v4H9z"/><rect x="5" y="5" width="14" height="16"/></svg>', stack: '<svg viewBox="0 0 24 24"><path d="M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4"/></svg>', mask: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><ellipse cx="12" cy="12" rx="5" ry="4"/></svg>', preset: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h7"/></svg>', plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', power: '<svg viewBox="0 0 24 24"><path d="M12 3v8M7 6a8 8 0 1 0 10 0"/></svg>', trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>', drag: '<svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="8" cy="17" r="1"/><circle cx="16" cy="7" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="16" cy="17" r="1"/></svg>', save: '<svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 16h8"/></svg>' }; return m[n] || m.stack }
        _esc(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }
        _styles() {
            if (document.getElementById('video-effects-dock-style')) return;
            const s = document.createElement('style'); s.id = 'video-effects-dock-style'; s.textContent = `
  :root{--video-effects-dock-width:430px}.video-effects-studio-dock{position:absolute;top:0;right:0;bottom:0;width:var(--video-effects-dock-width);min-width:320px;max-width:760px;display:grid;grid-template-rows:34px 29px minmax(0,1fr) 22px;box-sizing:border-box;border-left:1px solid var(--border-color,#4d4d4d81);background:var(--panel-bg,var(--primary-dark,#333));color:#fff;overflow:visible;z-index:40}.video-effects-studio-dock[hidden]{display:none!important}
  body.video-effects-dock-open #editor-scene>canvas,body.video-effects-dock-open #editor-scene>.renderer-container,body.video-effects-dock-open #editor-scene>.viewport-canvas,body.video-effects-dock-open #editor-scene>.scene-canvas{z-index:0!important}body.video-effects-dock-open #video-effects-studio-dock{z-index:40!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
  .video-effects-dock-resize{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize}.video-effects-dock-resize::after{content:'';position:absolute;left:3px;top:0;bottom:0;width:1px;background:var(--border-color,#4d4d4d81)}body.video-effects-dock-resizing{cursor:col-resize!important;user-select:none!important}
  .video-effects-dock-header{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 5px 0 7px;border-bottom:1px solid var(--border-color,#4d4d4d81);background:var(--header-bg,var(--secondary-dark,#3c3c3c))}.video-effects-dock-title{display:flex;align-items:center;gap:7px;min-width:0}.video-effects-dock-title>span{width:18px;height:18px;color:var(--text-secondary,#b0b0b0)}.video-effects-studio-dock svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}.video-effects-dock-title>div{min-width:0}.video-effects-dock-title strong,.video-effects-dock-title em{display:block}.video-effects-dock-title strong{font-size:9px}.video-effects-dock-title em{margin-top:1px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal;color:var(--text-secondary,#b0b0b0);font-size:7px}.video-effects-dock-actions{display:flex;gap:1px}.video-effects-dock-actions button{width:24px;height:22px;padding:5px;border:0;background:transparent;color:var(--text-secondary,#b0b0b0)}.video-effects-dock-actions button:hover{background:var(--accent-blue-dark,#474747);color:#fff}
  .video-effects-dock-tabs{display:flex;align-items:center;gap:2px;padding:0 4px;border-bottom:1px solid var(--border-color,#4d4d4d81);background:var(--secondary-dark,#3c3c3c)}.video-effects-dock-tabs button{height:21px;display:flex;align-items:center;gap:4px;padding:0 6px;border:1px solid transparent;border-radius:0;background:transparent;color:var(--text-secondary,#b0b0b0);font-size:7px}.video-effects-dock-tabs button svg{width:13px;height:13px}.video-effects-dock-tabs button:hover,.video-effects-dock-tabs button.active{border-color:var(--border-color,#4d4d4d81);background:var(--accent-blue-dark,#474747);color:#fff}.video-effects-dock-content{min-width:0;min-height:0;overflow:hidden;background:var(--primary-dark,#333)}.video-effects-dock-status{display:flex;align-items:center;justify-content:space-between;padding:0 6px;border-top:1px solid var(--border-color,#4d4d4d81);background:var(--header-bg,var(--secondary-dark,#3c3c3c));color:var(--text-secondary,#b0b0b0);font-size:6px}
  .vefx-stack-panel,.vefx-presets-panel{height:100%;display:grid;grid-template-rows:36px minmax(0,1fr);overflow:hidden}.vefx-stack-panel>header,.vefx-presets-panel>header{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 6px;border-bottom:1px solid var(--border-color,#4d4d4d81);background:var(--header-bg,var(--secondary-dark,#3c3c3c))}.vefx-stack-panel>header strong,.vefx-stack-panel>header span,.vefx-presets-panel>header strong,.vefx-presets-panel>header span{display:block}.vefx-stack-panel>header strong,.vefx-presets-panel>header strong{font-size:8px}.vefx-stack-panel>header span,.vefx-presets-panel>header span{margin-top:2px;color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-stack-panel>header button,.vefx-presets-panel>header button{height:21px;display:inline-flex;align-items:center;gap:4px;padding:0 6px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--bg-button,#363636);color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-stack-panel>header svg,.vefx-presets-panel>header svg{width:12px;height:12px}
  .vefx-stack-list,.vefx-preset-list{overflow:auto;padding:6px}.vefx-stack-card{margin-bottom:5px;border:1px solid var(--border-color,#4d4d4d81);background:var(--panel-bg,#333)}.vefx-stack-card.selected{outline:1px solid var(--text-primary,#fff);outline-offset:1px}.vefx-stack-card.drag-over{border-top-color:var(--text-primary,#fff)}.vefx-stack-card>header{height:29px;display:grid;grid-template-columns:15px 22px 18px minmax(0,1fr) 22px 22px 22px;align-items:center;gap:3px;padding:0 4px;border-bottom:1px solid var(--border-color,#4d4d4d40);background:var(--secondary-dark,#3c3c3c)}.vefx-stack-drag,.vefx-stack-icon{width:14px;height:14px;color:var(--text-secondary,#b0b0b0)}.vefx-stack-card header button{height:20px;padding:4px;border:0;background:transparent;color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-stack-card header button.active,.vefx-stack-card header button:hover{background:var(--accent-blue-dark,#474747);color:#fff}.vefx-stack-card header div{min-width:0}.vefx-stack-card header strong,.vefx-stack-card header em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vefx-stack-card header strong{font-size:8px}.vefx-stack-card header em{margin-top:1px;color:var(--text-secondary,#b0b0b0);font-style:normal;font-size:6px}.vefx-stack-mix{height:28px;display:grid;grid-template-columns:35px minmax(0,1fr) 38px;align-items:center;gap:5px;padding:0 6px;color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-stack-mix input{width:100%;accent-color:var(--accent-blue,#5f5f5f)}.vefx-stack-mix output{text-align:right;color:#fff}
  .vefx-presets-panel>header>div:last-child{display:flex;gap:2px}.vefx-preset-card{min-height:38px;display:grid;grid-template-columns:18px minmax(0,1fr) 42px 22px;align-items:center;gap:5px;padding:4px 5px;border:1px solid var(--border-color,#4d4d4d81);margin-bottom:4px;background:var(--panel-bg,#333)}.vefx-preset-card>span{width:15px;height:15px;color:var(--text-secondary,#b0b0b0)}.vefx-preset-card div{min-width:0}.vefx-preset-card strong,.vefx-preset-card em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vefx-preset-card strong{font-size:8px}.vefx-preset-card em{font-size:6px;color:var(--text-secondary,#b0b0b0);font-style:normal}.vefx-preset-card button{height:20px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--bg-button,#363636);color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-preset-card button:last-child{width:20px;padding:4px;border:0;background:transparent}.vefx-dock-empty{min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:var(--text-secondary,#b0b0b0);font-size:7px;text-align:center}.vefx-dock-empty strong{font-size:9px;color:#fff}
  `; document.head.appendChild(s)
        }
    }
    global.VideoEffectsDockManager = VideoEffectsDockManager;
    global.ensureVideoEffectsDockManager = function () { if (!global.videoEffectsDockManager) global.videoEffectsDockManager = new VideoEffectsDockManager(); return global.videoEffectsDockManager };
    global.ensureVideoEffectsDockManager();
})(window);