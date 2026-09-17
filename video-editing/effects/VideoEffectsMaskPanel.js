/**
 * VideoEffectsMaskPanel.js
 * SM Engine — effect mask metadata editor.
 *
 * Mask metadata is persistent and ready for the GPU effect evaluator.
 */
(function (global) {
    'use strict';
    class VideoEffectsMaskPanel {
        constructor(manager) { this.manager = manager || global.videoEffectsManager; this.host = null; this._styles() }
        mount(host) { this.host = host; this.render() }
        render() {
            if (!this.host) return;
            const clip = this.manager.stack.selectedClip(), fx = this.manager.stack.selectedEffect(clip);
            if (!clip || !fx) {
                this.host.innerHTML = '<div class="vefx-mask-empty"><strong>No effect selected</strong><span>Select an effect from the Stack tab.</span></div>'; return;
            }
            if (!Array.isArray(fx.masks)) fx.masks = [];

            this.host.innerHTML = `
   <div class="vefx-mask-panel">
    <header><div><strong>MASKS</strong><span>${this._esc(fx.name || this.manager.library.get(fx.id)?.name || 'Effect')}</span></div><div><button data-add-mask="rectangle">${this._svg('rect')} RECT</button><button data-add-mask="ellipse">${this._svg('ellipse')} ELLIPSE</button></div></header>
    <div class="vefx-mask-list">
     ${fx.masks.length ? fx.masks.map((m, index) => this._card(m, index)).join('') : '<div class="vefx-mask-empty"><strong>No masks</strong><span>Add a Rectangle or Ellipse mask.</span></div>'}
    </div>
   </div>`;

            this.host.querySelectorAll('[data-add-mask]').forEach(button => button.addEventListener('click', () => this._add(button.dataset.addMask, fx, clip)));
            this.host.querySelectorAll('[data-mask-card]').forEach(card => this._bindCard(card, fx, clip));
        }
        _add(type, fx, clip) {
            fx.masks.push({
                id: `mask-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                type, enabled: true, invert: false,
                centerX: .5, centerY: .5, width: .5, height: .5, rotation: 0, feather: .05, opacity: 1
            });
            this.manager.stack.syncRuntime(clip); this.render();
        }
        _card(mask, index) {
            return `<article class="vefx-mask-card" data-mask-card="${mask.id}">
   <header><input type="checkbox" data-mask-enable ${mask.enabled !== false ? 'checked' : ''}><strong>Mask ${index + 1} · ${mask.type}</strong><button data-mask-delete title="Delete">${this._svg('trash')}</button></header>
   ${this._row('centerX', 'Center X', 0, 1, .001, mask.centerX)}
   ${this._row('centerY', 'Center Y', 0, 1, .001, mask.centerY)}
   ${this._row('width', 'Width', 0, 1, .001, mask.width)}
   ${this._row('height', 'Height', 0, 1, .001, mask.height)}
   ${this._row('rotation', 'Rotation', -180, 180, .1, mask.rotation)}
   ${this._row('feather', 'Feather', 0, 1, .001, mask.feather)}
   ${this._row('opacity', 'Opacity', 0, 1, .01, mask.opacity)}
   <label class="vefx-mask-check"><input type="checkbox" data-mask-invert ${mask.invert ? 'checked' : ''}><span>Invert Mask</span></label>
  </article>`;
        }
        _row(key, label, min, max, step, value) {
            return `<label class="vefx-mask-row"><span>${label}</span><input type="range" data-mask-param="${key}" min="${min}" max="${max}" step="${step}" value="${Number(value || 0)}"><input type="number" data-mask-number="${key}" min="${min}" max="${max}" step="${step}" value="${Number(value || 0)}"></label>`;
        }
        _bindCard(card, fx, clip) {
            const mask = fx.masks.find(m => m.id === card.dataset.maskCard); if (!mask) return;
            card.querySelector('[data-mask-enable]')?.addEventListener('change', e => { mask.enabled = e.target.checked; this.manager.stack.syncRuntime(clip) });
            card.querySelector('[data-mask-invert]')?.addEventListener('change', e => { mask.invert = e.target.checked; this.manager.stack.syncRuntime(clip) });
            card.querySelector('[data-mask-delete]')?.addEventListener('click', () => { fx.masks = fx.masks.filter(m => m.id !== mask.id); this.manager.stack.syncRuntime(clip); this.render() });
            card.querySelectorAll('[data-mask-param]').forEach(range => range.addEventListener('input', () => {
                const key = range.dataset.maskParam, value = Number(range.value); mask[key] = value;
                const number = card.querySelector(`[data-mask-number="${key}"]`); if (number) number.value = value;
                this.manager.stack.syncRuntime(clip);
            }));
            card.querySelectorAll('[data-mask-number]').forEach(number => number.addEventListener('change', () => {
                const key = number.dataset.maskNumber, value = Number(number.value); mask[key] = value;
                const range = card.querySelector(`[data-mask-param="${key}"]`); if (range) range.value = value;
                this.manager.stack.syncRuntime(clip);
            }));
        }
        _svg(n) { const m = { rect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12"/></svg>', ellipse: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>', trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>' }; return m[n] || m.rect }
        _esc(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }
        _styles() {
            if (document.getElementById('vefx-mask-style')) return;
            const s = document.createElement('style'); s.id = 'vefx-mask-style'; s.textContent = `
  .vefx-mask-panel{height:100%;display:grid;grid-template-rows:36px minmax(0,1fr);overflow:hidden;background:var(--primary-dark,#333);color:#fff}.vefx-mask-panel>header{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 6px;border-bottom:1px solid var(--border-color,#4d4d4d81);background:var(--header-bg,var(--secondary-dark,#3c3c3c))}.vefx-mask-panel>header strong,.vefx-mask-panel>header span{display:block}.vefx-mask-panel>header strong{font-size:8px}.vefx-mask-panel>header span{margin-top:2px;color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-mask-panel>header>div:last-child{display:flex;gap:2px}.vefx-mask-panel>header button{height:21px;display:flex;align-items:center;gap:3px;padding:0 5px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--bg-button,#363636);color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-mask-panel svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.6}
  .vefx-mask-list{overflow:auto;padding:6px}.vefx-mask-card{margin-bottom:6px;border:1px solid var(--border-color,#4d4d4d81);background:var(--panel-bg,#333)}.vefx-mask-card>header{height:25px;display:grid;grid-template-columns:18px minmax(0,1fr) 22px;align-items:center;gap:4px;padding:0 5px;border-bottom:1px solid var(--border-color,#4d4d4d81);background:var(--secondary-dark,#3c3c3c)}.vefx-mask-card>header strong{font-size:7px}.vefx-mask-card>header button{width:20px;height:20px;padding:4px;border:0;background:transparent;color:var(--text-secondary,#b0b0b0)}
  .vefx-mask-row{min-height:28px;display:grid;grid-template-columns:62px minmax(0,1fr) 50px;align-items:center;gap:5px;padding:0 6px;color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-mask-row input[type=range]{width:100%;accent-color:var(--accent-blue,#5f5f5f)}.vefx-mask-row input[type=number]{width:50px;height:19px;box-sizing:border-box;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--secondary-dark,#3c3c3c);color:#fff;font-size:7px}.vefx-mask-check{min-height:28px;display:flex;align-items:center;gap:5px;padding:0 6px;color:var(--text-secondary,#b0b0b0);font-size:7px}.vefx-mask-empty{min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:var(--text-secondary,#b0b0b0);font-size:7px;text-align:center}.vefx-mask-empty strong{font-size:9px;color:#fff}
  `; document.head.appendChild(s)
        }
    }
    global.VideoEffectsMaskPanel = VideoEffectsMaskPanel;
})(window);