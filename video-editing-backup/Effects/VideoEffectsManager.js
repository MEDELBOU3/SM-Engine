/**
 * VideoEffectsManager.js
 * Non-destructive clip effects stack + professional Effects panel.
 * Native SVG icons + Gray theme palette.
 */
(function (global) {
    'use strict';

    const ICONS = {
        wand: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 4-2 4-4 2 4 2 2 4 2-4 4-2-4-2z"/><path d="m9 15-6 6"/><path d="M2 20l2 2"/></svg>`,
        layers: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
        droplet: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
        sun: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
        contrast: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg>`,
        palette: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.5-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.6-10-9.6z"/></svg>`,
        hue: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`,
        circle: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`,
        leaf: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
        invert: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 3l18 18"/></svg>`,
        eye: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
        up: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
        trash: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
    };

    const EFFECTS = [
        { id:'gaussian-blur', name:'Gaussian Blur', category:'Blur & Sharpen', icon: ICONS.droplet, params:{ amount:{label:'Blur',min:0,max:40,step:.1,def:0,unit:'px'} } },
        { id:'brightness', name:'Brightness', category:'Color Correction', icon: ICONS.sun, params:{ amount:{label:'Brightness',min:0,max:200,step:1,def:100,unit:'%'} } },
        { id:'contrast', name:'Contrast', category:'Color Correction', icon: ICONS.contrast, params:{ amount:{label:'Contrast',min:0,max:250,step:1,def:100,unit:'%'} } },
        { id:'saturation', name:'Saturation', category:'Color Correction', icon: ICONS.palette, params:{ amount:{label:'Saturation',min:0,max:300,step:1,def:100,unit:'%'} } },
        { id:'hue', name:'Hue Rotate', category:'Color Correction', icon: ICONS.hue, params:{ amount:{label:'Hue',min:-180,max:180,step:1,def:0,unit:'°'} } },
        { id:'grayscale', name:'Black & White', category:'Stylize', icon: ICONS.circle, params:{ amount:{label:'Amount',min:0,max:100,step:1,def:100,unit:'%'} } },
        { id:'sepia', name:'Sepia', category:'Stylize', icon: ICONS.leaf, params:{ amount:{label:'Amount',min:0,max:100,step:1,def:100,unit:'%'} } },
        { id:'invert', name:'Invert', category:'Stylize', icon: ICONS.invert, params:{ amount:{label:'Amount',min:0,max:100,step:1,def:100,unit:'%'} } },
        { id:'opacity-fx', name:'Effect Opacity', category:'Utility', icon: ICONS.eye, params:{ amount:{label:'Opacity',min:0,max:100,step:1,def:100,unit:'%'} } }
    ];

    class VideoEffectsManager {
        constructor() {
            this.registry = new Map(EFFECTS.map(e => [e.id, e]));
            this.search = '';
            this.category = 'All';
            this._style();
        }

        _style() {
            if (document.getElementById('vefx-style')) return;
            const s = document.createElement('style');
            s.id = 'vefx-style';
            s.textContent = `
            .vefx-shell {
                display: grid;
                grid-template-columns: minmax(160px, 0.75fr) minmax(220px, 1.25fr);
                gap: 7px;
                min-width: 0;
                min-height: 220px;
                width: 100%;
                box-sizing: border-box;
                color: var(--text-primary, #ffffff);
                background: #333333;
                padding: 6px;
                border-radius: 4px;
                overflow: hidden;
            }

            .vefx-browser,
            .vefx-stack {
                min-width: 0;
                width: 100%;
                overflow: hidden;
                box-sizing: border-box;
                border: 1px solid var(--border-color, #4d4d4d);
                background: var(--secondary-dark, #3c3c3c);
                border-radius: 3px;
            }

            .vefx-head {
                min-width: 0;
                height: 27px;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 0 7px;
                box-sizing: border-box;
                background: #383838;
                border-bottom: 1px solid var(--border-color, #4d4d4d);
                color: var(--text-secondary, #b0b0b0);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: .045em;
                white-space: nowrap;
                overflow: hidden;
            }

            .vefx-head > span {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vefx-search-wrap {
                padding: 5px 6px 4px;
            }

            .vefx-search {
                display: block;
                width: 100%;
                height: 23px;
                margin: 0;
                padding: 0 6px;
                box-sizing: border-box;
                border: 1px solid var(--input-border, #565656);
                border-radius: 3px;
                outline: none;
                background: var(--primary-dark, #333333);
                color: var(--text-primary, #ffffff);
                font-size: 9.5px;
            }

            .vefx-search:focus {
                border-color: var(--border-color, #777);
            }

            .vefx-cats {
                display: flex;
                flex-wrap: wrap;
                gap: 3px;
                padding: 0 6px 5px;
            }

            .vefx-cat {
                flex: 0 0 auto;
                min-height: 19px;
                padding: 0 6px;
                border: 1px solid var(--input-border, #565656);
                border-radius: 2px;
                background: var(--primary-dark, #333333);
                color: var(--text-secondary, #b0b0b0);
                font-size: 8px;
                font-weight: 600;
                line-height: 17px;
                white-space: nowrap;
                cursor: pointer;
                transition: all 0.12s ease;
            }

            .vefx-cat:hover {
                color: var(--text-primary, #ffffff);
                background: var(--hover-bg, #4b4b4b);
            }

            .vefx-cat.active {
                border-color: var(--border-color, #777);
                color: #ffffff;
                background: var(--hover-bg, #4b4b4b);
            }

            .vefx-list {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
                max-height: 350px;
                padding: 3px 4px 5px;
                overflow: auto;
                box-sizing: border-box;
                background: #333333;
            }

            .vefx-item {
                display: grid;
                grid-template-columns: 18px minmax(0, 1fr);
                grid-template-areas:
                    "icon name"
                    "icon category";
                column-gap: 5px;
                row-gap: 0;
                min-width: 0;
                min-height: 30px;
                padding: 3px 5px;
                box-sizing: border-box;
                border: 1px solid transparent;
                border-radius: 3px;
                color: var(--text-secondary, #b0b0b0);
                cursor: pointer;
            }

            .vefx-item:hover,
            .vefx-item.selected {
                border-color: var(--border-color, #555);
                background: var(--hover-bg, #4b4b4b);
                color: #ffffff;
            }

            .vefx-item.selected {
                border-color: var(--border-color, #777);
            }

            .vefx-item-icon {
                grid-area: icon;
                align-self: center;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-secondary, #b0b0b0);
            }

            .vefx-item:hover .vefx-item-icon,
            .vefx-item.selected .vefx-item-icon {
                color: #ffffff;
            }

            .vefx-item .vefx-item-name {
                grid-area: name;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: inherit;
                font-size: 9.5px;
                font-weight: 600;
                line-height: 13px;
            }

            .vefx-item small {
                grid-area: category;
                min-width: 0;
                margin: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--text-muted, #8e8e96);
                font-size: 7.5px;
                line-height: 10px;
            }

            .vefx-stack-body {
                min-width: 0;
                max-height: 430px;
                overflow: auto;
                padding: 5px;
                box-sizing: border-box;
                background: #333333;
            }

            .vefx-empty {
                min-height: 80px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 12px 8px;
                box-sizing: border-box;
                text-align: center;
                color: var(--text-muted, #8e8e96);
                font-size: 9px;
                line-height: 1.4;
            }

            .vefx-card {
                min-width: 0;
                overflow: hidden;
                margin-bottom: 5px;
                border: 1px solid var(--border-color, #4d4d4d);
                border-radius: 3px;
                background: var(--secondary-dark, #3c3c3c);
            }

            .vefx-card-top {
                min-width: 0;
                height: 27px;
                display: grid;
                grid-template-columns: 18px minmax(0, 1fr) 22px 22px;
                align-items: center;
                gap: 3px;
                padding: 0 5px;
                box-sizing: border-box;
                border-bottom: 1px solid var(--border-color, #4d4d4d);
                background: #383838;
            }

            .vefx-enable {
                margin: 0;
                accent-color: var(--text-secondary, #888);
            }

            .vefx-name {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--text-primary, #ffffff);
                font-size: 9.5px;
                font-weight: 600;
            }

            .vefx-icon-btn {
                width: 20px;
                height: 20px;
                padding: 0;
                border: 1px solid transparent;
                border-radius: 2px;
                background: transparent;
                color: var(--text-secondary, #b0b0b0);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .vefx-icon-btn:hover {
                background: var(--hover-bg, #4b4b4b);
                border-color: var(--border-color, #555);
                color: var(--text-primary, #ffffff);
            }

            .vefx-icon-btn:disabled {
                opacity: .3;
                cursor: default;
            }

            .vefx-controls {
                min-width: 0;
                padding: 6px 7px;
                box-sizing: border-box;
            }

            .vefx-param {
                display: grid;
                grid-template-columns: 70px minmax(50px, 1fr) 42px;
                align-items: center;
                gap: 5px;
                min-width: 0;
                margin-bottom: 5px;
                color: var(--text-secondary, #b0b0b0);
                font-size: 8.5px;
            }

            .vefx-param label {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vefx-param input[type="range"] {
                min-width: 0;
                width: 100%;
                height: 6px;
                accent-color: var(--text-secondary, #888);
            }

            .vefx-number {
                width: 42px;
                min-width: 0;
                height: 20px;
                padding: 0 3px;
                box-sizing: border-box;
                border: 1px solid var(--input-border, #565656);
                border-radius: 2px;
                outline: none;
                background: var(--primary-dark, #333333);
                color: var(--text-primary, #ffffff);
                font-size: 8.5px;
            }

            .vefx-number:focus {
                border-color: var(--border-color, #777);
            }

            #video-inspector-content .vefx-shell,
            #inspector-main-content.video-inspector-panel-host .vefx-shell,
            .video-tool-pane-main .vefx-shell {
                grid-template-columns: 1fr;
            }

            #video-inspector-content .vefx-list,
            #inspector-main-content.video-inspector-panel-host .vefx-list,
            .video-tool-pane-main .vefx-list {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 2px;
                max-height: 190px;
            }

            #video-inspector-content .vefx-stack-body,
            #inspector-main-content.video-inspector-panel-host .vefx-stack-body,
            .video-tool-pane-main .vefx-stack-body {
                max-height: 300px;
            }

            .video-timeline-dock-content .vefx-shell {
                grid-template-columns: minmax(160px, .75fr) minmax(220px, 1.25fr);
            }

            @media (max-width: 760px) {
                .vefx-shell,
                .video-timeline-dock-content .vefx-shell {
                    grid-template-columns: 1fr;
                }
                .vefx-list {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 2px;
                    max-height: 190px;
                }
            }

            @media (max-width: 420px) {
                .vefx-list,
                #video-inspector-content .vefx-list,
                #inspector-main-content.video-inspector-panel-host .vefx-list,
                .video-tool-pane-main .vefx-list {
                    grid-template-columns: 1fr;
                }
                .vefx-param {
                    grid-template-columns: 60px minmax(0, 1fr) 38px;
                }
            }
            `;
            document.head.appendChild(s);
        }

        selectedItem(mgr = global.videoEditingManager) {
            return mgr?.selectedItem || mgr?.items?.find(i => i.selected) || null;
        }

        ensure(item) {
            if (!item) return [];
            if (!Array.isArray(item.effects)) item.effects = [];
            return item.effects;
        }

        definition(id) {
            return this.registry.get(id) || null;
        }

        add(item, id) {
            const def = this.definition(id);
            if (!item || !def) return null;
            const fx = {
                uid: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                id,
                enabled: true,
                params: {}
            };
            Object.entries(def.params || {}).forEach(([k, p]) => fx.params[k] = p.def);
            this.ensure(item).push(fx);
            global.veHistory?.record?.(`Add Effect: ${def.name}`, 'effects', () => {});
            global.videoEditingManager?.renderCanvas?.();
            return fx;
        }

        remove(item, uid) {
            if (!item) return;
            item.effects = this.ensure(item).filter(f => f.uid !== uid);
            global.videoEditingManager?.renderCanvas?.();
        }

        move(item, uid, dir) {
            const stack = this.ensure(item);
            const i = stack.findIndex(f => f.uid === uid);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= stack.length) return;
            [stack[i], stack[j]] = [stack[j], stack[i]];
            global.videoEditingManager?.renderCanvas?.();
        }

        buildCanvasFilter(item, existing = 'none') {
            const parts = [];
            if (existing && existing !== 'none') parts.push(existing);
            for (const fx of this.ensure(item)) {
                if (!fx.enabled) continue;
                const a = Number(fx.params?.amount ?? 0);
                if (fx.id === 'gaussian-blur' && a > 0) parts.push(`blur(${a}px)`);
                else if (fx.id === 'brightness') parts.push(`brightness(${a / 100})`);
                else if (fx.id === 'contrast') parts.push(`contrast(${a / 100})`);
                else if (fx.id === 'saturation') parts.push(`saturate(${a / 100})`);
                else if (fx.id === 'hue') parts.push(`hue-rotate(${a}deg)`);
                else if (fx.id === 'grayscale') parts.push(`grayscale(${a / 100})`);
                else if (fx.id === 'sepia') parts.push(`sepia(${a / 100})`);
                else if (fx.id === 'invert') parts.push(`invert(${a / 100})`);
                else if (fx.id === 'opacity-fx') parts.push(`opacity(${a / 100})`);
            }
            return parts.length ? parts.join(' ') : 'none';
        }

        renderPanel(container, mgr = global.videoEditingManager) {
            if (!container) return;
            const item = this.selectedItem(mgr);
            const cats = ['All', ...new Set(EFFECTS.map(e => e.category))];
            const q = this.search.trim().toLowerCase();
            const defs = EFFECTS.filter(e =>
                (this.category === 'All' || e.category === this.category) &&
                (!q || `${e.name} ${e.category}`.toLowerCase().includes(q))
            );

            container.innerHTML = `
            <div class="vefx-shell">
                <section class="vefx-browser">
                    <div class="vefx-head">
                        <span style="display:flex;align-items:center;">${ICONS.wand}</span>
                        <span>EFFECTS BROWSER</span>
                    </div>
                    <div class="vefx-search-wrap">
                        <input class="vefx-search" placeholder="Search effects" value="${this.search.replace(/"/g, '&quot;')}">
                    </div>
                    <div class="vefx-cats">
                        ${cats.map(c => `<button class="vefx-cat ${c === this.category ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('')}
                    </div>
                    <div class="vefx-list">
                        ${defs.map(e => `
                            <div class="vefx-item" data-effect="${e.id}" title="Double-click to add ${e.name}">
                                <div class="vefx-item-icon">${e.icon}</div>
                                <span class="vefx-item-name">${e.name}</span>
                                <small>${e.category}</small>
                            </div>
                        `).join('')}
                    </div>
                </section>
                <section class="vefx-stack">
                    <div class="vefx-head">
                        <span style="display:flex;align-items:center;">${ICONS.layers}</span>
                        <span>EFFECT STACK${item ? ` · ${item.name || 'Selected clip'}` : ''}</span>
                    </div>
                    <div class="vefx-stack-body"></div>
                </section>
            </div>`;

            const stackHost = container.querySelector('.vefx-stack-body');
            if (!item) {
                stackHost.innerHTML = '<div class="vefx-empty">Select a clip to edit its effects.</div>';
            } else {
                this._renderStack(stackHost, item, mgr);
            }

            const search = container.querySelector('.vefx-search');
            search?.addEventListener('input', () => {
                this.search = search.value;
                this.renderPanel(container, mgr);
            });

            container.querySelectorAll('.vefx-cat').forEach(b => b.addEventListener('click', () => {
                this.category = b.dataset.cat;
                this.renderPanel(container, mgr);
            }));

            container.querySelectorAll('.vefx-item').forEach(row => {
                row.addEventListener('click', () => {
                    container.querySelectorAll('.vefx-item').forEach(x => x.classList.remove('selected'));
                    row.classList.add('selected');
                });
                row.addEventListener('dblclick', () => {
                    if (!item) return;
                    this.add(item, row.dataset.effect);
                    this.renderPanel(container, mgr);
                });
            });
        }

        _renderStack(host, item, mgr) {
            const stack = this.ensure(item);
            if (!stack.length) {
                host.innerHTML = '<div class="vefx-empty">No effects. Double-click an effect from the browser to add.</div>';
                return;
            }

            host.innerHTML = stack.map((fx, index) => {
                const def = this.definition(fx.id);
                if (!def) return '';
                const controls = Object.entries(def.params || {}).map(([key, p]) => {
                    const v = fx.params?.[key] ?? p.def;
                    return `
                        <div class="vefx-param">
                            <label>${p.label}</label>
                            <input type="range" data-fx-range="${fx.uid}" data-param="${key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">
                            <input class="vefx-number" type="number" data-fx-num="${fx.uid}" data-param="${key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">
                        </div>`;
                }).join('');

                return `
                    <article class="vefx-card" data-uid="${fx.uid}">
                        <div class="vefx-card-top">
                            <input class="vefx-enable" type="checkbox" ${fx.enabled ? 'checked' : ''}>
                            <span class="vefx-name">${def.name}</span>
                            <button class="vefx-icon-btn" data-move="-1" title="Move up" ${index === 0 ? 'disabled' : ''}>${ICONS.up}</button>
                            <button class="vefx-icon-btn" data-remove title="Remove">${ICONS.trash}</button>
                        </div>
                        <div class="vefx-controls">${controls}</div>
                    </article>`;
            }).join('');

            host.querySelectorAll('.vefx-card').forEach(card => {
                const uid = card.dataset.uid;
                const fx = stack.find(f => f.uid === uid);

                card.querySelector('.vefx-enable')?.addEventListener('change', e => {
                    fx.enabled = e.target.checked;
                    mgr.renderCanvas?.();
                });

                card.querySelector('[data-remove]')?.addEventListener('click', () => {
                    this.remove(item, uid);
                    this._renderStack(host, item, mgr);
                });

                card.querySelector('[data-move]')?.addEventListener('click', e => {
                    this.move(item, uid, Number(e.currentTarget.dataset.move));
                    this._renderStack(host, item, mgr);
                });

                card.querySelectorAll('[data-fx-range],[data-fx-num]').forEach(inp => inp.addEventListener('input', e => {
                    const key = e.target.dataset.param;
                    const v = Number(e.target.value);
                    fx.params[key] = v;
                    card.querySelectorAll(`[data-param="${key}"]`).forEach(other => {
                        if (other !== e.target) other.value = v;
                    });
                    mgr.renderCanvas?.();
                }));
            });
        }
    }

    global.VideoEffectsManager = VideoEffectsManager;
    global.videoEffectsManager = global.videoEffectsManager || new VideoEffectsManager();
})(window);