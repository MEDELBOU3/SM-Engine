/**
 * VideoEffectsInspectorPanel.js
 * SM Engine — quick right-side inspector for the selected effect.
 */
(function (global) {
    'use strict';
    class VideoEffectsInspectorPanel {
        constructor(manager = null) {
            this.manager = manager || global.videoEffectsManager;
            this.host = null;
            this._unsub = this.manager?.stack?.subscribe?.(event => {
                if (!this.host) return;
                /*
                 * Do not rebuild the Inspector while a range/number control is being
                 * dragged. Structural changes still refresh immediately.
                 */
                if (['param', 'mix'].includes(event?.type)) return;
                this.render();
            });
            this._styles();
        }
        render(host = null) {
            this.host = host || this.host;
            if (!this.host) return false;

            const clip = this.manager?.stack?.selectedClip?.();
            const fx = this.manager?.stack?.selectedEffect?.(clip);

            if (!clip) {
                this.host.innerHTML = `<div class="vefx-inspector"><div class="vefx-inspector-title"><span>${this.manager.library.icon('effects')}</span><div><strong>Effects</strong><em>Clip Effects</em></div></div><div class="vefx-inspector-empty"><strong>No clip selected</strong><span>Select a video, image, text or solid clip.</span></div><button class="vefx-open-dock" data-open-effects>${this.manager.library.icon('effects')}<span>OPEN EFFECTS STUDIO</span></button></div>`;
                this._bindOpen();
                return true;
            }

            if (!fx) {
                this.host.innerHTML = `<div class="vefx-inspector"><div class="vefx-inspector-title"><span>${this.manager.library.icon('effects')}</span><div><strong>Effects</strong><em>${this._esc(clip.name || 'Selected Clip')}</em></div></div><div class="vefx-inspector-empty"><strong>No effect selected</strong><span>Add an effect from Effects Studio.</span></div><button class="vefx-open-dock" data-open-effects>${this.manager.library.icon('effects')}<span>BROWSE EFFECTS</span></button></div>`;
                this._bindOpen('effects');
                return true;
            }

            const def = this.manager.library.get(fx.id);
            const params = Object.entries(def?.params || {}).map(([key, p]) => {
                const value = fx.params?.[key] ?? p.def;
                return `<label class="vefx-inspector-param"><span>${this._esc(p.label)}</span><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}" data-fx-param="${key}"><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}" data-fx-number="${key}"><button type="button" data-fx-keyframe="${key}" title="Keyframe parameter">${this._svg('diamond')}</button></label>`;
            }).join('');

            this.host.innerHTML = `
   <div class="vefx-inspector">
    <div class="vefx-inspector-top">
     <div class="vefx-inspector-title">
      <span>${this.manager.library.icon(def?.icon || 'effects')}</span>
      <div><strong>${this._esc(def?.name || fx.name || 'Effect')}</strong><em>${this._esc(clip.name || 'Selected Clip')}</em></div>
     </div>
     <button class="vefx-open-dock compact" data-open-effects title="Open Effects Studio">${this.manager.library.icon('effects')}</button>
    </div>

    <section class="vefx-inspector-section">
     <header><span>EFFECT</span><em>${def?.renderer === 'gpu' ? 'GPU PIPELINE' : 'LIVE'}</em></header>
     <div class="vefx-inspector-actions">
      <button data-fx-enable class="${fx.enabled !== false ? 'active' : ''}">${this._svg('power')}<span>${fx.enabled !== false ? 'ENABLED' : 'DISABLED'}</span></button>
      <button data-fx-solo class="${fx.solo ? 'active' : ''}">${this._svg('solo')}<span>SOLO</span></button>
     </div>
     <label class="vefx-inspector-mix"><span>Mix</span><input type="range" min="0" max="1" step="0.01" value="${Number(fx.mix ?? 1)}" data-fx-mix><output>${Math.round(Number(fx.mix ?? 1) * 100)}%</output></label>
    </section>

    <section class="vefx-inspector-section">
     <header><span>PARAMETERS</span><em>${Object.keys(def?.params || {}).length}</em></header>
     <div class="vefx-inspector-params">${params || '<div class="vefx-no-params">No parameters.</div>'}</div>
    </section>

    <section class="vefx-inspector-section">
     <header><span>TOOLS</span><em>${fx.masks?.length || 0} MASKS</em></header>
     <div class="vefx-inspector-actions three">
      <button data-fx-reset>${this._svg('reset')}<span>RESET</span></button>
      <button data-fx-duplicate>${this._svg('copy')}<span>DUPLICATE</span></button>
      <button data-fx-remove>${this._svg('trash')}<span>REMOVE</span></button>
     </div>
    </section>

    <button class="vefx-open-dock" data-open-effects>${this.manager.library.icon('effects')}<span>EFFECTS / STACK / MASKS / PRESETS</span></button>
   </div>`;

            this._bind(fx, clip);
            return true;
        }
        _bind(fx, clip) {
            this._bindOpen('stack');

            this.host.querySelector('[data-fx-enable]')?.addEventListener('click', () => { this.manager.stack.toggle(fx.uid, clip); this.render() });
            this.host.querySelector('[data-fx-solo]')?.addEventListener('click', () => { this.manager.stack.solo(fx.uid, clip); this.render() });
            this.host.querySelector('[data-fx-reset]')?.addEventListener('click', () => { this.manager.stack.reset(fx.uid, clip); this.render() });
            this.host.querySelector('[data-fx-duplicate]')?.addEventListener('click', () => { this.manager.stack.duplicate(fx.uid, clip); this.render() });
            this.host.querySelector('[data-fx-remove]')?.addEventListener('click', () => { this.manager.stack.remove(fx.uid, clip); this.render() });

            const mix = this.host.querySelector('[data-fx-mix]');
            mix?.addEventListener('input', () => {
                const value = Number(mix.value);
                this.manager.stack.setMix(fx.uid, value, clip);
                mix.nextElementSibling.textContent = `${Math.round(value * 100)}%`;
            });

            this.host.querySelectorAll('[data-fx-param]').forEach(range => {
                range.addEventListener('input', () => {
                    const key = range.dataset.fxParam, value = Number(range.value);
                    const number = this.host.querySelector(`[data-fx-number="${key}"]`);
                    if (number) number.value = value;
                    this.manager.stack.setParam(fx.uid, key, value, clip);
                });
            });

            this.host.querySelectorAll('[data-fx-number]').forEach(number => {
                number.addEventListener('change', () => {
                    const key = number.dataset.fxNumber, value = Number(number.value);
                    const range = this.host.querySelector(`[data-fx-param="${key}"]`);
                    if (range) range.value = value;
                    this.manager.stack.setParam(fx.uid, key, value, clip);
                });
            });

            this.host.querySelectorAll('[data-fx-keyframe]').forEach(button => {
                button.addEventListener('click', () => {
                    const key = button.dataset.fxKeyframe, value = fx.params?.[key];
                    if (global.sequencerManager?.toggleEffectKeyframe) {
                        global.sequencerManager.toggleEffectKeyframe(clip.id, fx.uid, key, value);
                    } else {
                        global.dispatchEvent(new CustomEvent('videoEffectKeyframeRequested', { detail: { clipId: clip.id, effectUid: fx.uid, param: key, value } }));
                    }
                });
            });
        }
        _bindOpen(tab = 'effects') {
            this.host?.querySelectorAll('[data-open-effects]').forEach(button => button.addEventListener('click', () => global.ensureVideoEffectsDockManager?.()?.open?.({ tab })));
        }
        _svg(name) {
            const icons = {
                power: '<svg viewBox="0 0 24 24"><path d="M12 3v8"/><path d="M7 6a8 8 0 1 0 10 0"/></svg>',
                solo: '<svg viewBox="0 0 24 24"><path d="M8 7c0-2 2-3 4-3s4 1 4 3-2 3-4 3-4 1-4 3 2 3 4 3 4-1 4-3"/></svg>',
                reset: '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>',
                copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11"/><path d="M16 8V5H5v11h3"/></svg>',
                trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>',
                diamond: '<svg viewBox="0 0 24 24"><path d="M12 5l7 7-7 7-7-7z"/></svg>'
            }; return icons[name] || icons.diamond;
        }
        _esc(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }
        _styles() {
            if (document.getElementById('vefx-inspector-style')) return;
            const s = document.createElement('style'); s.id = 'vefx-inspector-style'; s.textContent = `
  .vefx-inspector{display:flex;flex-direction:column;gap:6px;padding:6px;color:var(--text-primary,#fff)}.vefx-inspector-top{display:flex;align-items:center;justify-content:space-between;gap:6px}.vefx-inspector-title{display:flex;align-items:center;gap:7px;min-width:0}.vefx-inspector-title>span{width:18px;height:18px;flex:0 0 18px;color:var(--text-secondary,#b0b0b0)}.vefx-inspector svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}.vefx-inspector-title>div{min-width:0}.vefx-inspector-title strong,.vefx-inspector-title em{display:block}.vefx-inspector-title strong{font-size:9px}.vefx-inspector-title em{margin-top:2px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal;color:var(--text-secondary,#b0b0b0);font-size:7px}
  .vefx-inspector-section{border:1px solid var(--border-color,#4d4d4d81);background:var(--panel-bg,#333)}.vefx-inspector-section>header{height:23px;display:flex;align-items:center;justify-content:space-between;padding:0 6px;border-bottom:1px solid var(--border-color,#4d4d4d81);background:var(--header-bg,var(--secondary-dark,#3c3c3c));font-size:7px;color:var(--text-secondary,#b0b0b0);font-weight:700}.vefx-inspector-section>header em{font-style:normal;font-weight:500}
  .vefx-inspector-actions{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:6px}.vefx-inspector-actions.three{grid-template-columns:repeat(3,1fr)}.vefx-inspector-actions button,.vefx-open-dock{min-height:23px;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--bg-button,#363636);color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-inspector-actions button:hover,.vefx-open-dock:hover,.vefx-inspector-actions button.active{background:var(--accent-blue-dark,#474747);color:#fff}.vefx-inspector-actions svg,.vefx-open-dock svg{width:12px;height:12px}
  .vefx-inspector-mix{min-height:30px;display:grid;grid-template-columns:42px 1fr 38px;align-items:center;gap:5px;padding:0 6px;color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-inspector-mix input,.vefx-inspector-param input[type=range]{width:100%;min-width:0;accent-color:var(--accent-blue,#5f5f5f)}.vefx-inspector-mix output{text-align:right;color:#fff}
  .vefx-inspector-params{padding:4px 0}.vefx-inspector-param{min-height:28px;display:grid;grid-template-columns:58px minmax(0,1fr) 50px 20px;align-items:center;gap:4px;padding:0 6px;color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-inspector-param input[type=number]{width:50px;height:19px;box-sizing:border-box;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--secondary-dark,#3c3c3c);color:#fff;font-size:7px;text-align:right}.vefx-inspector-param button{width:19px;height:19px;padding:4px;border:0;background:transparent;color:var(--text-secondary,#b0b0b0)}.vefx-inspector-param button:hover{background:var(--accent-blue-dark,#474747);color:#fff}.vefx-no-params{padding:10px;color:var(--text-secondary,#b0b0b0);font-size:7px;text-align:center}
  .vefx-open-dock{width:100%;min-height:25px}.vefx-open-dock.compact{width:25px;min-height:23px;padding:5px;flex:0 0 25px}.vefx-inspector-empty{min-height:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--text-secondary,#b0b0b0);text-align:center}.vefx-inspector-empty strong{font-size:9px;color:#fff}.vefx-inspector-empty span{font-size:7px}
  `; document.head.appendChild(s)
        }
    }
    global.VideoEffectsInspectorPanel = VideoEffectsInspectorPanel;
    global.ensureVideoEffectsInspectorPanel = function () { if (!global.videoEffectsInspectorPanel) global.videoEffectsInspectorPanel = new VideoEffectsInspectorPanel(global.videoEffectsManager); return global.videoEffectsInspectorPanel };
})(window);