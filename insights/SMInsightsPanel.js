// SM Engine Insights — live editor profiler workspace.
// Uses renderer/performance data when present; it never invents network values.
(() => {
    const SAMPLE_LIMIT = 90;
    const EVENT_LIMIT = 40;

    class SMInsightsPanel {
        constructor() {
            this.root = document.getElementById('statsMenu');
            this.samples = [];
            this.events = [];
            this.paused = false;
            this.selectedEvent = null;
            this.timer = null;
            this.lastSampleAt = 0;
            this.initialized = false;
        }

        init() {
            if (this.initialized || !this.root) return;
            this.root.className = 'sm-insights-panel';
            this.root.innerHTML = this._template();
            this._bind();
            this.initialized = true;
            this._sample(true);
            this._render();
        }

        setVisible(visible) {
            this.init();
            if (!this.root) return;
            this.root.classList.toggle('open', visible);
            this.root.style.display = visible ? 'flex' : '';
            this.root.setAttribute('aria-hidden', String(!visible));

            if (visible) {
                this._sample();
                this._render();
                this._start();
            } else {
                this._stop();
            }
        }

        _template() {
            return `
                <header class="sm-insights-header">
                    <div class="sm-insights-title">
                        <i class="fas fa-chart-line" aria-hidden="true"></i>
                        <div><strong>Insights</strong><span>EDITOR PROFILER</span></div>
                    </div>
                    <div class="sm-insights-header-actions">
                        <button type="button" class="sm-insights-action" data-insights-action="capture" title="Capture a profiler sample"><i class="fas fa-camera"></i><span>Capture</span></button>
                        <button type="button" class="sm-insights-action" data-insights-action="pause" title="Pause sampling"><i class="fas fa-pause"></i><span>Pause</span></button>
                        <button type="button" class="sm-insights-icon" data-insights-action="clear" title="Clear profiler history"><i class="fas fa-trash"></i></button>
                        <button type="button" class="sm-insights-icon" data-insights-action="close" title="Return to 3D Viewport"><i class="fas fa-xmark"></i></button>
                    </div>
                </header>
                <div class="sm-insights-toolbar">
                    <label class="sm-insights-search"><i class="fas fa-search"></i><input id="sm-insights-search" type="search" placeholder="Filter counters and events" autocomplete="off"></label>
                    <label class="sm-insights-field"><span>Range</span><select id="sm-insights-range"><option value="90">Last 45 seconds</option><option value="60">Last 30 seconds</option><option value="30">Last 15 seconds</option></select></label>
                    <div class="sm-insights-live"><i></i><span id="sm-insights-live-text">LIVE</span><output id="sm-insights-sample-count">0 samples</output></div>
                </div>
                <section class="sm-insights-kpis" aria-label="Live performance metrics">
                    <article><span>FPS</span><strong id="sm-insights-fps">—</strong><small id="sm-insights-fps-note">renderer sample</small></article>
                    <article><span>FRAME</span><strong id="sm-insights-frame">—</strong><small>milliseconds</small></article>
                    <article><span>DRAW CALLS</span><strong id="sm-insights-draws">—</strong><small>current frame</small></article>
                    <article><span>TRIANGLES</span><strong id="sm-insights-tris">—</strong><small>renderer info</small></article>
                    <article><span>MEMORY</span><strong id="sm-insights-memory">—</strong><small>GPU resources</small></article>
                </section>
                <main class="sm-insights-workspace">
                    <section class="sm-insights-pane sm-insights-chart-pane">
                        <header><div><strong>Frame Time</strong><span>Recent sampled frame budget</span></div><div class="sm-insights-legend"><span><i></i> Frame time</span><b id="sm-insights-chart-max">16.7 ms target</b></div></header>
                        <div class="sm-insights-chart-wrap"><canvas id="sm-insights-chart" aria-label="Frame time chart"></canvas><div id="sm-insights-chart-empty">Collecting renderer samples…</div></div>
                    </section>
                    <aside class="sm-insights-pane sm-insights-counters-pane">
                        <header><div><strong>Metric Counters</strong><span>Live renderer and scene telemetry</span></div></header>
                        <div class="sm-insights-table-wrap"><table class="sm-insights-table"><thead><tr><th>Metric</th><th>Current</th><th>Average</th><th>Peak</th></tr></thead><tbody id="sm-insights-metrics"></tbody></table></div>
                    </aside>
                </main>
                <section class="sm-insights-events-pane">
                    <header><div><strong>Trace Events</strong><span>Warnings and profiler captures</span></div><span id="sm-insights-event-count">0 events</span></header>
                    <div class="sm-insights-events-body"><div id="sm-insights-events" class="sm-insights-events"></div><aside id="sm-insights-detail" class="sm-insights-detail">Select an event to inspect its profiler context.</aside></div>
                </section>
                <footer class="sm-insights-footer"><span id="sm-insights-status">Waiting for renderer telemetry</span><span>Data source: editor renderer / performance manager</span></footer>`;
        }

        _bind() {
            this.root.addEventListener('click', event => {
                const action = event.target.closest('[data-insights-action]')?.dataset.insightsAction;
                if (action === 'capture') this._capture();
                if (action === 'pause') this._togglePause();
                if (action === 'clear') this._clear();
                if (action === 'close') window.SMDocumentTabs?.activate?.('viewport');

                const eventRow = event.target.closest('[data-insights-event]');
                if (eventRow) {
                    this.selectedEvent = Number(eventRow.dataset.insightsEvent);
                    this._renderEvents();
                }
            });

            this.root.querySelector('#sm-insights-search')?.addEventListener('input', () => this._render());
            this.root.querySelector('#sm-insights-range')?.addEventListener('change', () => this._render());
            window.addEventListener('resize', () => this._drawChart());
        }

        _start() {
            if (this.timer) return;
            this.timer = window.setInterval(() => this._sample(), 500);
        }

        _stop() {
            if (!this.timer) return;
            window.clearInterval(this.timer);
            this.timer = null;
        }

        _readSample() {
            const report = window.performanceManager?.getReport?.() || {};
            const perf = report.performance || {};
            const geometry = report.geometry || {};
            const memory = report.memory || {};
            const info = window.renderer?.info || {};
            const render = info.render || {};
            const infoMemory = info.memory || {};
            const fps = Number(perf.fps || perf.averageFPS || 0);
            const frame = Number(perf.frameTimeMs || (fps > 0 ? 1000 / fps : 0));
            const calls = Number(perf.drawCalls ?? render.calls ?? 0);
            const triangles = Number(perf.triangles ?? geometry.totalTriangles ?? render.triangles ?? 0);
            const meshes = Number(geometry.meshCount ?? 0);
            const textures = Number(memory.textures ?? infoMemory.textures ?? 0);
            const geometries = Number(memory.geometries ?? infoMemory.geometries ?? 0);
            return { at: Date.now(), fps, frame, calls, triangles, meshes, textures, geometries };
        }

        _sample(force = false) {
            if (this.paused && !force) return;
            const now = Date.now();
            if (!force && now - this.lastSampleAt < 300) return;
            this.lastSampleAt = now;
            const sample = this._readSample();
            this.samples.push(sample);
            if (this.samples.length > SAMPLE_LIMIT) this.samples.shift();

            const previous = this.samples[this.samples.length - 2];
            if (!previous) this._addEvent('capture', 'Renderer sample started', sample);
            if (sample.frame > 33 && (!previous || previous.frame <= 33)) this._addEvent('warning', 'Frame time exceeded 33 ms', sample);
            if (sample.calls > 1500 && (!previous || previous.calls <= 1500)) this._addEvent('warning', 'Draw-call budget exceeded', sample);
            if (sample.triangles > 2_000_000 && (!previous || previous.triangles <= 2_000_000)) this._addEvent('warning', 'Triangle budget exceeded', sample);
            this._render();
        }

        _addEvent(kind, label, sample) {
            this.events.unshift({ kind, label, sample, at: Date.now() });
            if (this.events.length > EVENT_LIMIT) this.events.pop();
        }

        _capture() {
            const sample = this.samples.at(-1) || this._readSample();
            this._addEvent('capture', 'Manual profiler capture', sample);
            this._render();
        }

        _togglePause() {
            this.paused = !this.paused;
            this.root.querySelector('[data-insights-action="pause"] span').textContent = this.paused ? 'Resume' : 'Pause';
            this.root.querySelector('[data-insights-action="pause"] i').className = this.paused ? 'fas fa-play' : 'fas fa-pause';
            this._render();
        }

        _clear() {
            this.samples = [];
            this.events = [];
            this.selectedEvent = null;
            this._sample(true);
        }

        _visibleSamples() {
            const count = Number(this.root.querySelector('#sm-insights-range')?.value || SAMPLE_LIMIT);
            return this.samples.slice(-count);
        }

        _format(value) {
            if (!Number.isFinite(value)) return '—';
            return Math.abs(value) >= 1000 ? Math.round(value).toLocaleString() : String(Math.round(value * 10) / 10);
        }

        _average(samples, key) {
            if (!samples.length) return 0;
            return samples.reduce((total, sample) => total + (Number(sample[key]) || 0), 0) / samples.length;
        }

        _render() {
            if (!this.initialized) return;
            const samples = this._visibleSamples();
            const latest = samples.at(-1) || this._readSample();
            const byId = id => this.root.querySelector(id);
            byId('#sm-insights-fps').textContent = latest.fps ? this._format(latest.fps) : '—';
            byId('#sm-insights-frame').textContent = latest.frame ? `${this._format(latest.frame)} ms` : '—';
            byId('#sm-insights-draws').textContent = this._format(latest.calls);
            byId('#sm-insights-tris').textContent = this._format(latest.triangles);
            byId('#sm-insights-memory').textContent = `${this._format(latest.textures + latest.geometries)} res`;
            byId('#sm-insights-sample-count').textContent = `${samples.length} samples`;
            byId('#sm-insights-live-text').textContent = this.paused ? 'PAUSED' : 'LIVE';
            byId('#sm-insights-status').textContent = this.paused ? 'Sampling paused — showing last captured values' : `Last sample ${new Date(latest.at).toLocaleTimeString()}`;
            this._renderMetrics(samples, latest);
            this._renderEvents();
            this._drawChart(samples);
        }

        _renderMetrics(samples, latest) {
            const query = this.root.querySelector('#sm-insights-search')?.value.trim().toLowerCase() || '';
            const metrics = [
                ['Frame Time', 'frame', 'ms'], ['FPS', 'fps', ''], ['Draw Calls', 'calls', ''],
                ['Triangles', 'triangles', ''], ['Scene Meshes', 'meshes', ''], ['Textures', 'textures', ''], ['Geometries', 'geometries', '']
            ].filter(([label]) => !query || label.toLowerCase().includes(query));
            const rows = metrics.map(([label, key, suffix]) => {
                const values = samples.map(sample => Number(sample[key]) || 0);
                const peak = values.length ? Math.max(...values) : 0;
                return `<tr><td>${label}</td><td>${this._format(latest[key])}${suffix ? ` ${suffix}` : ''}</td><td>${this._format(this._average(samples, key))}${suffix ? ` ${suffix}` : ''}</td><td>${this._format(peak)}${suffix ? ` ${suffix}` : ''}</td></tr>`;
            }).join('');
            this.root.querySelector('#sm-insights-metrics').innerHTML = rows || '<tr><td colspan="4" class="sm-insights-empty-row">No matching metrics</td></tr>';
        }

        _renderEvents() {
            const query = this.root.querySelector('#sm-insights-search')?.value.trim().toLowerCase() || '';
            const events = this.events.filter(event => !query || event.label.toLowerCase().includes(query));
            this.root.querySelector('#sm-insights-event-count').textContent = `${events.length} events`;
            this.root.querySelector('#sm-insights-events').innerHTML = events.length ? events.map(event => {
                const index = this.events.indexOf(event);
                return `<button type="button" class="sm-insights-event ${event.kind}${this.selectedEvent === index ? ' active' : ''}" data-insights-event="${index}"><i class="fas ${event.kind === 'warning' ? 'fa-triangle-exclamation' : 'fa-camera'}"></i><span>${event.label}</span><time>${new Date(event.at).toLocaleTimeString()}</time></button>`;
            }).join('') : '<div class="sm-insights-empty">No events match the current filter.</div>';
            const selected = this.events[this.selectedEvent];
            this.root.querySelector('#sm-insights-detail').innerHTML = selected
                ? `<strong>${selected.label}</strong><span>${new Date(selected.at).toLocaleString()}</span><dl><dt>Frame</dt><dd>${this._format(selected.sample.frame)} ms</dd><dt>Draw calls</dt><dd>${this._format(selected.sample.calls)}</dd><dt>Triangles</dt><dd>${this._format(selected.sample.triangles)}</dd></dl>`
                : 'Select an event to inspect its profiler context.';
        }

        _drawChart(samples = this._visibleSamples()) {
            const canvas = this.root?.querySelector('#sm-insights-chart');
            const empty = this.root?.querySelector('#sm-insights-chart-empty');
            if (!canvas) return;
            const bounds = canvas.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(bounds.width * ratio);
            canvas.height = Math.round(bounds.height * ratio);
            const ctx = canvas.getContext('2d');
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.clearRect(0, 0, bounds.width, bounds.height);
            if (empty) empty.hidden = samples.length > 1;
            if (samples.length < 2) return;

            const max = Math.max(34, ...samples.map(sample => sample.frame || 0));
            const padding = { top: 12, right: 12, bottom: 18, left: 35 };
            const width = bounds.width - padding.left - padding.right;
            const height = bounds.height - padding.top - padding.bottom;
            ctx.strokeStyle = 'rgba(255,255,255,.11)';
            ctx.lineWidth = 1;
            for (let line = 0; line < 4; line++) {
                const y = padding.top + (height / 3) * line;
                ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + width, y); ctx.stroke();
            }
            ctx.fillStyle = 'rgba(255,255,255,.52)';
            ctx.font = '10px Segoe UI';
            ctx.fillText(`${Math.round(max)} ms`, 2, padding.top + 4);
            ctx.fillText('0', 18, padding.top + height + 3);
            ctx.strokeStyle = 'rgba(230,230,230,.92)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            samples.forEach((sample, index) => {
                const x = padding.left + (index / (samples.length - 1)) * width;
                const y = padding.top + height - Math.min(sample.frame || 0, max) / max * height;
                index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            });
            ctx.stroke();
            this.root.querySelector('#sm-insights-chart-max').textContent = `${Math.round(max)} ms peak`;
        }
    }

    window.SMInsightsPanel = new SMInsightsPanel();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.SMInsightsPanel.init(), { once: true });
    else window.SMInsightsPanel.init();
})();
