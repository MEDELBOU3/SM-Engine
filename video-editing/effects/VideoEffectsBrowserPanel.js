/**
 * VideoEffectsBrowserPanel.js
 * SM Engine — searchable effects browser.
 */
(function (global) {
    'use strict';
    class VideoEffectsBrowserPanel {
        constructor(manager) {
            this.manager = manager || global.videoEffectsManager;
            this.host = null;
            this.search = '';
            this.category = 'All';
            this._styles();
        }
        mount(host) { this.host = host; this.render() }
        render() {
            if (!this.host) return;
            const lib = this.manager.library;
            const cats = lib.categories();
            const q = this.search.trim().toLowerCase();
            const defs = lib.list(this.category).filter(def => !q || `${def.name} ${def.category}`.toLowerCase().includes(q));

            this.host.innerHTML = `
   <div class="vefx-browser-panel">
    <div class="vefx-browser-search">
     <span>${lib.icon('effects')}</span>
     <input type="text" value="${this._esc(this.search)}" placeholder="Search effects">
    </div>
    <div class="vefx-browser-categories">
     ${cats.map(cat => `<button type="button" data-cat="${this._esc(cat)}" class="${cat === this.category ? 'active' : ''}">${this._esc(cat)}</button>`).join('')}
    </div>
    <div class="vefx-browser-list">
     ${defs.map(def => `
      <button type="button" class="vefx-browser-item" data-effect="${def.id}" title="Double click to add">
       <span class="vefx-browser-icon">${lib.icon(def.icon)}</span>
       <span class="vefx-browser-copy">
        <strong>${this._esc(def.name)}</strong>
        <em>${this._esc(def.category)}</em>
       </span>
       <span class="vefx-render-badge ${def.renderer === 'gpu' ? 'gpu' : ''}">${def.renderer === 'gpu' ? 'GPU' : 'LIVE'}</span>
      </button>`).join('')}
    </div>
   </div>`;

            const input = this.host.querySelector('input');
            input?.addEventListener('input', () => { this.search = input.value; this.render() });
            this.host.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click', () => { this.category = btn.dataset.cat; this.render() }));
            this.host.querySelectorAll('[data-effect]').forEach(btn => {
                btn.addEventListener('dblclick', () => this._add(btn.dataset.effect));
                btn.addEventListener('click', event => {
                    if (event.detail === 1) global.dispatchEvent(new CustomEvent('videoEffectBrowserPreview', { detail: { effectId: btn.dataset.effect } }));
                });
            });
        }
        _add(id) {
            const fx = this.manager.stack.add(id);
            if (fx) {
                global.videoEffectsDockManager?.setTab?.('stack');
                global.videoEffectsInspectorPanel?.render?.();
            }
        }
        _esc(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }
        _styles() {
            if (document.getElementById('vefx-browser-panel-style')) return;
            const s = document.createElement('style'); s.id = 'vefx-browser-panel-style'; s.textContent = `
  .vefx-browser-panel{height:100%;display:grid;grid-template-rows:34px auto minmax(0,1fr);overflow:hidden;background:var(--primary-dark,#333);color:var(--text-primary,#fff)}
  .vefx-browser-search{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:center;gap:6px;padding:0 6px;border-bottom:1px solid var(--border-color,#4d4d4d81);background:var(--header-bg,var(--secondary-dark,#3c3c3c))}
  .vefx-browser-search>span{width:16px;height:16px;color:var(--text-secondary,#b0b0b0)}.vefx-browser-search svg,.vefx-browser-icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .vefx-browser-search input{height:21px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--primary-dark,#333);color:var(--text-primary,#fff);padding:0 6px;font-size:8px}
  .vefx-browser-categories{display:flex;gap:2px;padding:5px;overflow-x:auto;border-bottom:1px solid var(--border-color,#4d4d4d81)}.vefx-browser-categories button{height:20px;padding:0 6px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:transparent;color:var(--text-secondary,#b0b0b0);font-size:7px;white-space:nowrap}.vefx-browser-categories button.active,.vefx-browser-categories button:hover{background:var(--accent-blue-dark,#474747);color:#fff}
  .vefx-browser-list{overflow:auto;padding:5px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;align-content:start}.vefx-browser-item{min-height:45px;display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:6px;padding:5px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--panel-bg,#333);color:var(--text-primary,#fff);text-align:left}.vefx-browser-item:hover{background:var(--secondary-dark,#3c3c3c)}.vefx-browser-icon{width:18px;height:18px;color:var(--text-secondary,#b0b0b0)}.vefx-browser-copy{min-width:0}.vefx-browser-copy strong,.vefx-browser-copy em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vefx-browser-copy strong{font-size:8px}.vefx-browser-copy em{margin-top:2px;color:var(--text-secondary,#b0b0b0);font-size:6px;font-style:normal}.vefx-render-badge{font-size:6px;color:var(--text-secondary,#b0b0b0)}.vefx-render-badge.gpu{opacity:.55}
  `; document.head.appendChild(s)
        }
    }
    global.VideoEffectsBrowserPanel = VideoEffectsBrowserPanel;
})(window);