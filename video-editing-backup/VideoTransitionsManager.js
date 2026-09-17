/**
 * VideoTransitionsManager.js
 * Transition metadata + browser/panel. Preview supports fade/dissolve via opacity.
 */
(function (global) {
    'use strict';

    const PRESETS = [
        { id: 'cross-dissolve', name: 'Cross Dissolve', cat: 'Dissolve', icon: 'fa-circle-half-stroke' },
        { id: 'fade-black', name: 'Fade Through Black', cat: 'Dissolve', icon: 'fa-circle' },
        { id: 'fade-white', name: 'Fade Through White', cat: 'Dissolve', icon: 'fa-circle' },
        { id: 'dip-color', name: 'Dip to Color', cat: 'Dissolve', icon: 'fa-fill-drip' },
        { id: 'slide-left', name: 'Slide Left', cat: 'Movement', icon: 'fa-arrow-left' },
        { id: 'slide-right', name: 'Slide Right', cat: 'Movement', icon: 'fa-arrow-right' },
        { id: 'wipe-left', name: 'Linear Wipe', cat: 'Wipe', icon: 'fa-eraser' }
    ];

    class VideoTransitionsManager {
        constructor() {
            this.search = '';
            this.duration = 0.5;
            this._style();
        }

        _style() {
            if (document.getElementById('vetr-style')) return;
            const s = document.createElement('style');
            s.id = 'vetr-style';
            s.textContent = `
                .vetr-shell {
                    background: #414040;
                    color: var(--video-text, #eee);
                    display: grid;
                    grid-template-columns: 180px 1fr;
                    gap: 7px;
                    padding: 6px;
                    border-radius: 4px;
                }
                .vetr-browser, .vetr-editor {
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    background: #414040;
                    border-radius: 3px;
                    overflow: hidden;
                }
                .vetr-head {
                    height: 27px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 0 7px;
                    background: #3c3c3c;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    font-size: 9px;
                    font-weight: 700;
                    color: var(--video-text-muted, #aaa);
                }
                .vetr-search {
                    margin: 6px;
                    width: calc(100% - 12px);
                    height: 23px;
                    background: #2b2b2b;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    color: var(--video-text, #fff);
                    padding: 0 6px;
                    box-sizing: border-box;
                    outline: none;
                }
                .vetr-search:focus {
                    border-color: rgba(255, 255, 255, 0.25);
                }
                .vetr-list {
                    padding: 4px;
                    max-height: 350px;
                    overflow: auto;
                    background: #333;
                }
                .vetr-item {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    min-height: 29px;
                    padding: 2px 6px;
                    font-size: 9px;
                    color: var(--video-text-muted, #bbb);
                    border: 1px solid transparent;
                    border-radius: 3px;
                    cursor: pointer;
                }
                .vetr-item:hover {
                    background: #444;
                    color: #fff;
                }
                .vetr-item i {
                    color: var(--video-accent, #6f8ea8);
                    width: 13px;
                }
                .vetr-item small {
                    margin-left: auto;
                    font-size: 7px;
                    color: var(--video-text-soft, #888);
                }
                .vetr-body {
                    padding: 8px;
                    background: #414040;
                }
                .vetr-row {
                    display: grid;
                    grid-template-columns: 80px 1fr;
                    gap: 6px;
                    align-items: center;
                    margin-bottom: 7px;
                    font-size: 9px;
                    color: var(--video-text-muted, #aaa);
                }
                .vetr-row input, .vetr-row select {
                    width: 100%;
                    height: 23px;
                    background: #2b2b2b;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    color: var(--video-text, #fff);
                    padding: 0 4px;
                    box-sizing: border-box;
                    outline: none;
                }
                .vetr-actions {
                    display: flex;
                    gap: 5px;
                    margin-top: 10px;
                }
                .vetr-btn {
                    height: 25px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    background: #3c3c3c;
                    color: var(--video-text-muted, #ddd);
                    font-size: 8px;
                    padding: 0 8px;
                    cursor: pointer;
                }
                .vetr-btn:hover {
                    background: #4a4a4a;
                    color: #fff;
                }
                .vetr-note {
                    font-size: 8px;
                    color: var(--video-text-soft, #888);
                    line-height: 1.5;
                    margin-top: 8px;
                }
                @media (max-width: 650px) {
                    .vetr-shell { grid-template-columns: 1fr; }
                }
            `;
            document.head.appendChild(s);
        }

        _selectedClip(mgr = global.sequencerManager) {
            return mgr?.state?.primarySelection || null;
        }

        ensure(clip) {
            if (!clip) return null;
            if (!clip.transitions) clip.transitions = { in: null, out: null };
            return clip.transitions;
        }

        apply(clip, presetId, edge = 'in', duration = this.duration) {
            if (!clip) return;
            const t = this.ensure(clip);
            t[edge] = { id: presetId, duration: Math.max(0.03, Number(duration) || 0.5), color: '#000000' };
            global.sequencerManager?.renderer?.updateClip?.(clip);
            global.videoEditingManager?.renderCanvas?.();
        }

        remove(clip, edge) {
            const t = this.ensure(clip);
            if (t) t[edge] = null;
            global.videoEditingManager?.renderCanvas?.();
        }

        opacityMultiplier(clip, globalTime) {
            const t = this.ensure(clip);
            if (!t) return 1;
            const local = globalTime - clip.start;
            let m = 1;
            if (t.in) {
                const d = Math.max(0.001, t.in.duration || 0.5);
                if (local >= 0 && local < d) m *= Math.max(0, Math.min(1, local / d));
            }
            if (t.out) {
                const d = Math.max(0.001, t.out.duration || 0.5), from = Math.max(0, clip.duration - d);
                if (local > from && local <= clip.duration) m *= Math.max(0, Math.min(1, (clip.duration - local) / d));
            }
            return m;
        }

        renderPanel(container, manager = global.sequencerManager) {
            if (!container) return;
            const clip = this._selectedClip(manager);
            const q = this.search.toLowerCase();
            const presets = PRESETS.filter(p => !q || `${p.name} ${p.cat}`.toLowerCase().includes(q));

            container.innerHTML = `
                <div class="vetr-shell">
                    <section class="vetr-browser">
                        <div class="vetr-head"><i class="fas fa-shuffle"></i> TRANSITIONS</div>
                        <input class="vetr-search" placeholder="Search transitions" value="${this.search}">
                        <div class="vetr-list">
                            ${presets.map(p => `
                                <div class="vetr-item" data-transition="${p.id}">
                                    <i class="fas ${p.icon}"></i>
                                    <span>${p.name}</span>
                                    <small>${p.cat}</small>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                    <section class="vetr-editor">
                        <div class="vetr-head"><i class="fas fa-sliders"></i> TRANSITION CONTROLS</div>
                        <div class="vetr-body">
                            ${clip ? this._editorHTML(clip) : '<div class="vetr-note">Select a clip first. Apply IN or OUT transitions from this panel.</div>'}
                        </div>
                    </section>
                </div>
            `;

            container.querySelector('.vetr-search')?.addEventListener('input', e => {
                this.search = e.target.value;
                this.renderPanel(container, manager);
            });

            container.querySelectorAll('.vetr-item').forEach(row => row.addEventListener('dblclick', () => {
                if (!clip) return;
                this.apply(clip, row.dataset.transition, 'in', this.duration);
                this.renderPanel(container, manager);
            }));

            if (clip) this._bindEditor(container, clip, manager);
        }

        _editorHTML(clip) {
            const tr = this.ensure(clip);
            return `
                <div class="vetr-row">
                    <label>Duration</label>
                    <input id="vetr-duration" type="number" min="0.03" max="10" step="0.05" value="${this.duration}">
                </div>
                <div class="vetr-row">
                    <label>IN</label>
                    <select id="vetr-in">
                        <option value="">None</option>
                        ${PRESETS.map(p => `<option value="${p.id}" ${tr.in?.id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                </div>
                <div class="vetr-row">
                    <label>OUT</label>
                    <select id="vetr-out">
                        <option value="">None</option>
                        ${PRESETS.map(p => `<option value="${p.id}" ${tr.out?.id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                </div>
                <div class="vetr-actions">
                    <button class="vetr-btn" id="vetr-clear">Clear Transitions</button>
                    <button class="vetr-btn" id="vetr-pair">Cross Dissolve to Next</button>
                </div>
                <div class="vetr-note">Fade/dissolve transitions preview immediately. Movement/wipe presets are stored now and are ready for the compositor pass in the next renderer phase.</div>
            `;
        }

        _bindEditor(container, clip, manager) {
            const dur = container.querySelector('#vetr-duration');
            dur?.addEventListener('input', () => this.duration = Math.max(0.03, Number(dur.value) || 0.5));

            ['in', 'out'].forEach(edge => container.querySelector(`#vetr-${edge}`)?.addEventListener('change', e => {
                if (e.target.value) this.apply(clip, e.target.value, edge, this.duration);
                else this.remove(clip, edge);
            }));

            container.querySelector('#vetr-clear')?.addEventListener('click', () => {
                clip.transitions = { in: null, out: null };
                global.videoEditingManager?.renderCanvas?.();
                this.renderPanel(container, manager);
            });

            container.querySelector('#vetr-pair')?.addEventListener('click', () => {
                const clips = manager?.state?.clips || [];
                const same = clips.filter(c => c.trackId === clip.trackId).sort((a, b) => a.start - b.start);
                const i = same.findIndex(c => c.id === clip.id);
                const next = same[i + 1];
                if (!next) return;
                this.apply(clip, 'cross-dissolve', 'out', this.duration);
                this.apply(next, 'cross-dissolve', 'in', this.duration);
                this.renderPanel(container, manager);
            });
        }
    }

    global.VideoTransitionsManager = VideoTransitionsManager;
    global.videoTransitionsManager = global.videoTransitionsManager || new VideoTransitionsManager();
})(window);