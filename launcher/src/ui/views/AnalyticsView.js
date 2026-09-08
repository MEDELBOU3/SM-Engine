// src/ui/views/AnalyticsView.js
// SM Engine Launcher — black/gold analytics dashboard.

import { SMAnalyticsService } from "../../services/SMAnalyticsService.js";
import { AnalyticsCharts } from "../components/AnalyticsCharts.js";

export class AnalyticsView {
    constructor(app) {
        this.app = app;
        this.currentRange = "30d";
        this.currentMetric = "sessions";
        this.isRefreshing = false;

        this._realtimeTimer = null;
        this._unsubscribeAnalytics = null;
        this._hasRegisteredUpdateListener = false;
        this._instanceId = `analytics_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    render() {
        if (!this._hasData()) {
            return this.renderEmptyState();
        }

        const summary = this._summary();
        const activity = this._object(this._call('getEngineActivity', [this.currentRange, this.currentMetric], {}));
        const projects = this._array(this._call('getProjectUsage', [this.currentRange], []));
        const versions = this._array(this._call('getVersionUsage', [this.currentRange], []));
        const sessionBreakdown = this._object(this._call('getSessionBreakdown', [this.currentRange], {}));
        const performance = this._object(this._call('getPerformance', [this.currentRange], {}));
        const stability = this._object(this._call('getStability', [this.currentRange], {}));
        const recentActivity = this._array(this._call('getRecentActivity', [], []));

        const sessions = this._metric(summary.totalSessions, { value: 0, change: '—', sparkline: [] });
        const devTime = this._metric(summary.devTime, { value: '0m', change: '—', sparkline: [] });
        const projectsOpened = this._metric(summary.projectsOpened, { value: 0, change: '—', sparkline: [] });
        const avgSession = this._metric(summary.avgSession, { value: '0m', change: '—', sparkline: [] });
        const crashes = this._metric(summary.crashes, { value: 0, change: 'Healthy', sparkline: [], isWarning: false });

        return `
            <div class="sm-page sm-analytics-page">
                ${this.renderHeader()}

                <section class="sm-analytics-kpi-row" aria-label="Analytics overview">
                    ${this.renderKpiCard({
                        label: 'Total Sessions',
                        value: sessions.value,
                        unit: 'sessions',
                        change: sessions.change,
                        sparkline: sessions.sparkline,
                        accent: true
                    })}
                    ${this.renderKpiCard({
                        label: 'Development Time',
                        value: devTime.value,
                        change: devTime.change,
                        sparkline: devTime.sparkline,
                        accent: true
                    })}
                    ${this.renderKpiCard({
                        label: 'Projects Opened',
                        value: projectsOpened.value,
                        unit: 'projects',
                        change: projectsOpened.change,
                        sparkline: projectsOpened.sparkline,
                        accent: true
                    })}
                    ${this.renderKpiCard({
                        label: 'Average Session',
                        value: avgSession.value,
                        change: avgSession.change,
                        sparkline: avgSession.sparkline,
                        muted: true
                    })}
                    ${this.renderKpiCard({
                        label: 'Crashes',
                        value: crashes.value,
                        unit: 'events',
                        change: crashes.change,
                        sparkline: crashes.sparkline,
                        warning: Number(crashes.value) > 0 || crashes.isWarning === true
                    })}
                </section>

                <section class="sm-analytics-card sm-activity-card">
                    <div class="sm-analytics-card-head sm-activity-card-header">
                        <div>
                            <div class="sm-section-kicker">Timeline</div>
                            <h2 class="sm-analytics-card-title">Engine Activity</h2>
                            <span class="sm-analytics-card-note">Sessions and project work across the selected period</span>
                        </div>

                        <div class="sm-metric-switcher" role="group" aria-label="Activity metric">
                            ${this.renderMetricButton('sessions', 'Sessions')}
                            ${this.renderMetricButton('devTime', 'Development Time')}
                            ${this.renderMetricButton('projectOpens', 'Project Opens')}
                        </div>
                    </div>

                    <div class="sm-chart-shell">
                        <div class="sm-chart-container" id="sm-analytics-chart-container">
                            ${AnalyticsCharts.renderActivityChart(this._array(activity.points), {
                                metric: this.currentMetric,
                                width: 960,
                                height: 280
                            })}
                            <div class="sm-chart-tooltip" id="sm-chart-tooltip" role="tooltip" hidden></div>
                        </div>
                    </div>
                </section>

                <div class="sm-analytics-row-split sm-analytics-row-primary">
                    <section class="sm-analytics-card sm-projects-table-card">
                        <div class="sm-analytics-card-head sm-card-head-compact">
                            <div>
                                <div class="sm-section-kicker">Workspace</div>
                                <h2 class="sm-analytics-card-title">Most Active Projects</h2>
                                <span class="sm-analytics-card-note">Ranked by development activity</span>
                            </div>
                            <span class="sm-card-count">${projects.length}</span>
                        </div>
                        ${this.renderProjects(projects)}
                    </section>

                    <section class="sm-analytics-card sm-versions-card">
                        <div class="sm-analytics-card-head sm-card-head-compact">
                            <div>
                                <div class="sm-section-kicker">Runtime</div>
                                <h2 class="sm-analytics-card-title">Engine Versions</h2>
                                <span class="sm-analytics-card-note">Usage share for this period</span>
                            </div>
                        </div>
                        ${this.renderVersions(versions)}
                    </section>
                </div>

                <div class="sm-analytics-row-split">
                    <section class="sm-analytics-card sm-breakdown-card">
                        <div class="sm-analytics-card-head sm-card-head-compact">
                            <div>
                                <div class="sm-section-kicker">Time</div>
                                <h2 class="sm-analytics-card-title">Session Breakdown</h2>
                                <span class="sm-analytics-card-note">How editor time is distributed</span>
                            </div>
                        </div>
                        ${this.renderBreakdown(sessionBreakdown)}
                    </section>

                    <section class="sm-analytics-card sm-stability-card">
                        <div class="sm-analytics-card-head sm-card-head-compact">
                            <div>
                                <div class="sm-section-kicker">Health</div>
                                <h2 class="sm-analytics-card-title">Stability</h2>
                                <span class="sm-analytics-card-note">Crash-free sessions and recoveries</span>
                            </div>
                        </div>
                        ${this.renderStability(stability)}
                    </section>
                </div>

                <div class="sm-analytics-row-split">
                    <section class="sm-analytics-card sm-performance-card">
                        <div class="sm-analytics-card-head sm-card-head-compact">
                            <div>
                                <div class="sm-section-kicker">Runtime</div>
                                <h2 class="sm-analytics-card-title">Performance</h2>
                                <span class="sm-analytics-card-note">Engine responsiveness and memory telemetry</span>
                            </div>
                        </div>
                        ${this.renderPerformance(performance)}
                    </section>

                    <section class="sm-analytics-card sm-activity-feed-card">
                        <div class="sm-analytics-card-head sm-card-head-compact">
                            <div>
                                <div class="sm-section-kicker">Events</div>
                                <h2 class="sm-analytics-card-title">Recent Activity</h2>
                                <span class="sm-analytics-card-note">Latest launcher and engine events</span>
                            </div>
                        </div>
                        ${this.renderRecentActivity(recentActivity)}
                    </section>
                </div>

                <footer class="sm-analytics-footer-note">
                    <span class="sm-local-lock" aria-hidden="true">●</span>
                    Analytics are stored locally by SM Engine. No microphone, camera, browsing, or unrelated app activity is collected.
                </footer>
            </div>
        `;
    }

    renderHeader() {
        return `
            <header class="sm-analytics-header">
                <div class="sm-analytics-title-group">
                    <div class="sm-analytics-title-row">
                        <h1 class="sm-analytics-title">Analytics</h1>
                        <span class="sm-analytics-badge">Local Telemetry</span>
                    </div>
                    <p class="sm-analytics-subtitle">Monitor engine usage, project activity, performance and stability.</p>
                </div>

                <div class="sm-analytics-controls">
                    <div class="sm-live-badge" title="Local analytics listener is available">
                        <span class="sm-live-dot"></span>
                        <span>Live</span>
                    </div>

                    <div class="sm-date-range-group" role="group" aria-label="Select analytics date range">
                        ${this.renderRangeButton('today', 'Today')}
                        ${this.renderRangeButton('7d', '7D')}
                        ${this.renderRangeButton('30d', '30D')}
                        ${this.renderRangeButton('90d', '90D')}
                        ${this.renderRangeButton('all', 'All')}
                    </div>

                    <button class="sm-analytics-icon-btn sm-analytics-ping-btn" data-action="simulate-ping" type="button" title="Write a diagnostic telemetry sample" aria-label="Test analytics telemetry">
                        ${this.icon('pulse')}
                    </button>

                    <button class="sm-analytics-icon-btn sm-analytics-refresh-btn ${this.isRefreshing ? 'is-spinning' : ''}" data-action="refresh-analytics" type="button" title="Refresh analytics" aria-label="Refresh analytics">
                        ${this.icon('refresh')}
                    </button>
                </div>
            </header>
        `;
    }

    renderKpiCard({ label, value, unit = '', change = '—', sparkline = [], warning = false, muted = false, accent = false }) {
        const safeValue = this.e(value ?? 0);
        const safeUnit = this.e(unit);
        const safeChange = this.e(change ?? '—');
        const sparkColor = warning ? '#ef4444' : (muted ? '#9a9a9a' : '#f59e0b');
        const stateClass = warning ? 'has-warning' : (accent ? 'has-accent' : '');
        const trendClass = warning ? 'is-warning' : (muted ? 'is-neutral' : 'is-positive');

        return `
            <article class="sm-kpi-card ${stateClass}">
                <div class="sm-kpi-head">
                    <span class="sm-kpi-label">${this.e(label)}</span>
                    <span class="sm-kpi-trend ${trendClass}">${safeChange}</span>
                </div>
                <div class="sm-kpi-body">
                    <div class="sm-kpi-main-val">
                        <span class="sm-kpi-number">${safeValue}</span>
                        ${safeUnit ? `<span class="sm-kpi-unit">${safeUnit}</span>` : ''}
                    </div>
                    <div class="sm-kpi-chart">${AnalyticsCharts.renderSparkline(this._array(sparkline), { color: sparkColor })}</div>
                </div>
            </article>
        `;
    }

    renderMetricButton(metric, label) {
        const active = this.currentMetric === metric;
        return `
            <button class="sm-metric-btn ${active ? 'is-active' : ''}" data-action="switch-chart-metric" data-metric="${metric}" type="button" aria-pressed="${active}">
                ${this.e(label)}
            </button>
        `;
    }

    renderProjects(projects) {
        if (!projects.length) {
            return `<div class="sm-panel-empty">No project activity in this period.</div>`;
        }

        return `
            <div class="sm-table-wrap">
                <table class="sm-analytics-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Engine</th>
                            <th class="text-right">Sessions</th>
                            <th class="text-right">Time</th>
                            <th class="text-right">Last Opened</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${projects.slice(0, 8).map((project) => {
                            const thumb = this.eAttr(project?.thumb || '');
                            return `
                                <tr class="sm-project-row">
                                    <td class="sm-td-project">
                                        <div class="sm-project-mini-thumb-wrap">
                                            ${thumb ? `<img class="sm-project-mini-thumb" src="${thumb}" alt="" loading="lazy" />` : ''}
                                            <span class="sm-project-mini-fallback">SM</span>
                                        </div>
                                        <div class="sm-project-name-group">
                                            <strong class="sm-project-name">${this.e(project?.name || 'Untitled Project')}</strong>
                                            <span class="sm-project-sub">${this.e(project?.path || 'Local project')}</span>
                                        </div>
                                    </td>
                                    <td><span class="sm-version-pill">${this.e(project?.engineVersion || 'SM Engine')}</span></td>
                                    <td class="text-right font-mono">${this.e(project?.sessions ?? 0)}</td>
                                    <td class="text-right font-mono color-gold">${this.e(project?.timeSpent || '0m')}</td>
                                    <td class="text-right text-muted">${this.e(project?.lastOpened || '—')}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderVersions(versions) {
        if (!versions.length) {
            return `<div class="sm-panel-empty">No engine version usage recorded.</div>`;
        }

        return `
            <div class="sm-version-bars-list">
                ${versions.slice(0, 6).map((version) => {
                    const percentage = Math.max(0, Math.min(100, Number(version?.percentage) || 0));
                    return `
                        <div class="sm-version-bar-item">
                            <div class="sm-version-bar-label-row">
                                <div class="sm-v-name">
                                    <strong>${this.e(version?.version || 'Unknown Version')}</strong>
                                    ${version?.isCurrent ? '<span class="sm-tag-current">Current</span>' : ''}
                                </div>
                                <span class="sm-v-pct">${percentage}%</span>
                            </div>
                            <div class="sm-version-bar-track" aria-hidden="true">
                                <div class="sm-version-bar-fill" style="width:${percentage}%"></div>
                            </div>
                            <div class="sm-version-bar-sub">${this.e(version?.sessions ?? 0)} sessions</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderBreakdown(data) {
        const items = [
            ['Longest Session', data.longestSession || '—'],
            ['Average Session', data.avgSession || '—'],
            ['Shortest Session', data.shortestSession || '—'],
            ['Total Editor Time', data.totalEditorTime || '—', true],
            ['Play Mode Time', data.playModeTime || '—'],
            ['Build Time', data.buildTime || '—']
        ];

        return `
            <div class="sm-breakdown-grid">
                ${items.map(([label, value, highlight]) => `
                    <div class="sm-breakdown-item ${highlight ? 'is-highlight' : ''}">
                        <span class="sm-breakdown-label">${this.e(label)}</span>
                        <strong class="sm-breakdown-value ${highlight ? 'color-gold' : ''}">${this.e(value)}</strong>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderStability(stability) {
        const rateRaw = String(stability.crashFreeRate ?? '100%');
        const rateNumber = Math.max(0, Math.min(100, parseFloat(rateRaw) || 0));
        const rateText = rateRaw.includes('%') ? rateRaw : `${rateRaw}%`;

        return `
            <div class="sm-stability-body">
                <div class="sm-stability-score">
                    <div class="sm-stability-ring" style="--sm-stability-pct:${rateNumber}">
                        <div class="sm-stability-ring-inner">
                            <strong>${this.e(rateText)}</strong>
                            <span>Crash-free</span>
                        </div>
                    </div>
                </div>

                <div class="sm-stability-stats-grid">
                    ${this.statBox('Successful', stability.successfulSessions ?? 0, 'good')}
                    ${this.statBox('Crashes', stability.crashes ?? 0, Number(stability.crashes) > 0 ? 'bad' : 'good')}
                    ${this.statBox('Forced Stops', stability.forcedShutdowns ?? 0)}
                    ${this.statBox('Recoveries', stability.recoveryLaunches ?? 0, 'gold')}
                </div>
            </div>
        `;
    }

    statBox(label, value, tone = '') {
        return `
            <div class="sm-stat-box ${tone ? `tone-${tone}` : ''}">
                <span class="sm-stat-box-label">${this.e(label)}</span>
                <strong class="sm-stat-box-val">${this.e(value)}</strong>
            </div>
        `;
    }

    renderPerformance(performance) {
        const avgFps = this._metric(performance.avgFps, { value: '—', unit: 'FPS', change: '', sparkline: [] });
        const frameTime = this._metric(performance.frameTime, { value: '—', unit: 'ms', change: '', sparkline: [] });
        const avgMemory = this._metric(performance.avgMemory, { value: '—', unit: '', sparkline: [] });
        const peakMemory = this._metric(performance.peakMemory, { value: '—', unit: '' });
        const startupTime = this._metric(performance.startupTime, { value: '—', unit: '', change: '', sparkline: [] });
        const shader = this._object(performance.shaderCompileTime);

        return `
            <div class="sm-perf-grid">
                ${this.renderPerfBox('Average FPS', avgFps, '#f59e0b')}
                ${this.renderPerfBox('Frame Time', frameTime, '#10b981')}
                ${this.renderPerfBox('Average RAM', avgMemory, '#9a9a9a')}
                ${this.renderPerfBox('Peak RAM', peakMemory, null, 'Session high')}
                ${this.renderPerfBox('Startup Time', startupTime, '#f59e0b')}
                <div class="sm-perf-box is-placeholder">
                    <div class="sm-perf-top"><span class="sm-perf-label">Shader Compile</span></div>
                    <div class="sm-perf-val-row"><strong class="sm-perf-placeholder">${this.e(shader.placeholder || 'Not connected')}</strong></div>
                    <span class="sm-perf-subtext">Awaiting engine diagnostic hook</span>
                </div>
            </div>
        `;
    }

    renderPerfBox(label, metric, color = null, subtext = '') {
        return `
            <div class="sm-perf-box">
                <div class="sm-perf-top">
                    <span class="sm-perf-label">${this.e(label)}</span>
                    ${metric.change ? `<span class="sm-kpi-trend is-neutral">${this.e(metric.change)}</span>` : ''}
                </div>
                <div class="sm-perf-val-row">
                    <strong>${this.e(metric.value ?? '—')}</strong>
                    ${metric.unit ? `<span class="sm-perf-unit">${this.e(metric.unit)}</span>` : ''}
                </div>
                ${color && this._array(metric.sparkline).length > 1
                    ? AnalyticsCharts.renderSparkline(metric.sparkline, { color, width: 96, height: 22 })
                    : `<span class="sm-perf-subtext">${this.e(subtext || 'Telemetry sample')}</span>`}
            </div>
        `;
    }

    renderRecentActivity(items) {
        if (!items.length) {
            return `<div class="sm-panel-empty">No recent analytics events.</div>`;
        }

        return `
            <div class="sm-activity-list">
                ${items.slice(0, 8).map((item) => `
                    <div class="sm-activity-item status-${this.safeToken(item?.status || 'neutral')}">
                        <div class="sm-activity-icon type-${this.safeToken(item?.type || 'default')}">${this.getActivityIcon(item?.type)}</div>
                        <div class="sm-activity-content">
                            <strong class="sm-activity-item-title">${this.e(item?.title || 'Engine activity')}</strong>
                            <span class="sm-activity-item-time">${this.e(item?.time || 'Just now')}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderEmptyState() {
        return `
            <div class="sm-page sm-analytics-empty-page">
                <div class="sm-analytics-empty-box">
                    <div class="sm-empty-icon-wrap">${this.icon('bars')}</div>
                    <span class="sm-analytics-badge">Local Telemetry</span>
                    <h2 class="sm-empty-heading">No analytics data yet</h2>
                    <p class="sm-empty-text">Analytics will appear automatically as SM Engine sessions, projects and performance samples are recorded.</p>
                    <div class="sm-empty-actions">
                        <button class="sm-btn sm-btn-primary" data-action="new-project" type="button">Open a Project</button>
                        <button class="sm-btn sm-btn-ghost" data-action="refresh-analytics" type="button">Refresh</button>
                    </div>
                    <p class="sm-empty-privacy">Stored locally in your launcher data directory.</p>
                </div>
            </div>
        `;
    }

    renderRangeButton(rangeKey, label) {
        const active = this.currentRange === rangeKey;
        return `
            <button class="sm-range-btn ${active ? 'is-active' : ''}" data-action="change-analytics-range" data-range="${rangeKey}" type="button" aria-pressed="${active}">
                ${this.e(label)}
            </button>
        `;
    }

    getActivityIcon(type) {
        switch (type) {
            case 'open':
            case 'project_open':
                return this.icon('folder');
            case 'engine':
            case 'session_start':
                return this.icon('engine');
            case 'build':
            case 'build_completed':
                return this.icon('check');
            case 'crash':
                return this.icon('alert');
            case 'update':
                return this.icon('download');
            default:
                return this.icon('clock');
        }
    }

    icon(name) {
        const common = `viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
        const paths = {
            refresh: '<path d="M20 11a8 8 0 1 0 2 5.3"/><path d="M20 4v7h-7"/>',
            pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
            bars: '<path d="M5 20V11M12 20V4M19 20v-7"/>',
            folder: '<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
            engine: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>',
            check: '<path d="m5 12 4 4L19 6"/>',
            alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
            download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
            clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
        };
        return `<svg ${common}>${paths[name] || paths.clock}</svg>`;
    }

    bind() {
        const container = document.getElementById('view-root');
        if (!container) return;

        // IMPORTANT:
        // Bind only inside the current view. Never attach handlers to the whole document,
        // sidebar, or topbar from AnalyticsView.
        this.bindEvents(container);

        // Keep the currently selected range on the long-lived app object so that a
        // realtime listener never depends on an old AnalyticsView instance.
        if (this.app) {
            this.app.__smAnalyticsRange = this.currentRange;
        }

        this._registerRealtimeListener();
        this._ensureInitialTelemetryFetch();
    }

    bindEvents(container) {
        container.querySelectorAll('[data-action="change-analytics-range"]').forEach((button) => {
            button.addEventListener('click', async (event) => {
                const range = event.currentTarget?.dataset?.range;
                if (!range || range === this.currentRange) return;

                this.currentRange = range;
                if (this.app) this.app.__smAnalyticsRange = range;

                await this.refreshAnalytics({ notify: false });
            });
        });

        container.querySelectorAll('[data-action="switch-chart-metric"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                const metric = event.currentTarget?.dataset?.metric;
                if (!['sessions', 'devTime', 'projectOpens'].includes(metric) || metric === this.currentMetric) return;

                this.currentMetric = metric;
                if (this._isActive()) {
                    this.app?.router?.refresh?.();
                }
            });
        });

        container.querySelectorAll('[data-action="refresh-analytics"]').forEach((button) => {
            button.addEventListener('click', () => this.refreshAnalytics({ notify: true }));
        });

        container.querySelectorAll('[data-action="simulate-ping"]').forEach((button) => {
            if (!window.launcherAPI?.logAnalyticsEvent) {
                button.disabled = true;
                button.title = 'Analytics write bridge is not connected';
                return;
            }

            button.addEventListener('click', async () => {
                if (button.disabled) return;
                button.disabled = true;

                try {
                    const project = this.app?.state?.projects?.[0];
                    const fps = 60 + Math.floor(Math.random() * 16);

                    // Suppress the realtime listener briefly because this action already
                    // performs its own explicit refresh below.
                    if (this.app) {
                        this.app.__smAnalyticsSuppressRealtimeUntil = Date.now() + 900;
                    }

                    await window.launcherAPI.logAnalyticsEvent({
                        type: 'engine_ping',
                        label: 'Manual telemetry verification',
                        projectName: project?.name || 'SM Engine',
                        engineVersion: 'SM Engine 1.0.1'
                    });

                    if (window.launcherAPI?.logAnalyticsPerf) {
                        await window.launcherAPI.logAnalyticsPerf({
                            fps,
                            frameTimeMs: Number((1000 / fps).toFixed(2)),
                            memoryMb: 2200,
                            gpuMemoryMb: 1500,
                            startupMs: 2100,
                            engineVersion: 'SM Engine 1.0.1'
                        });
                    }

                    await this.refreshAnalytics({ notify: false });
                    this.app?.notify?.('Telemetry Verified', 'A local analytics test sample was recorded.');
                } catch (error) {
                    console.error('[AnalyticsView] Test telemetry failed:', error);
                    this.app?.notify?.('Telemetry Error', 'Could not write the local test sample.');
                } finally {
                    button.disabled = false;
                }
            });
        });

        container.querySelectorAll('.sm-project-mini-thumb').forEach((img) => {
            img.addEventListener('error', () => {
                img.hidden = true;
            }, { once: true });
        });

        this.bindChartTooltip(container);
    }

    bindChartTooltip(container) {
        const tooltip = container.querySelector('#sm-chart-tooltip');
        const chartContainer = container.querySelector('#sm-analytics-chart-container');
        if (!tooltip || !chartContainer) return;

        const hitTargets = chartContainer.querySelectorAll('.sm-chart-hit');
        hitTargets.forEach((hit) => {
            const group = hit.closest('.sm-chart-point-group');
            const node = group?.querySelector('.sm-chart-node');

            const show = () => {
                tooltip.innerHTML = `
                    <div class="sm-tooltip-date">${this.e(hit.dataset.date || '—')}</div>
                    <div class="sm-tooltip-row"><span>Sessions</span><strong>${this.e(hit.dataset.sessions || '0')}</strong></div>
                    <div class="sm-tooltip-row"><span>Development</span><strong class="color-gold">${this.e(hit.dataset.dev || '0m')}</strong></div>
                    <div class="sm-tooltip-row"><span>Project opens</span><strong>${this.e(hit.dataset.opens || '0')}</strong></div>
                `;
                tooltip.hidden = false;
                node?.classList.add('is-hovered');

                const containerRect = chartContainer.getBoundingClientRect();
                const hitRect = hit.getBoundingClientRect();
                const tipRect = tooltip.getBoundingClientRect();
                const centerX = hitRect.left - containerRect.left + hitRect.width / 2;
                const topY = hitRect.top - containerRect.top;

                const left = Math.max(
                    10,
                    Math.min(containerRect.width - tipRect.width - 10, centerX - tipRect.width / 2)
                );
                const top = Math.max(10, topY - tipRect.height - 12);

                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
            };

            const hide = () => {
                tooltip.hidden = true;
                node?.classList.remove('is-hovered');
            };

            hit.addEventListener('pointerenter', show);
            hit.addEventListener('pointerleave', hide);
            hit.addEventListener('focus', show);
            hit.addEventListener('blur', hide);
        });
    }

    /**
     * Fetch telemetry only once for the launcher app lifecycle.
     *
     * Router implementations commonly create a fresh AnalyticsView instance on every
     * router.refresh(). An instance-local `_initialFetchDone` flag therefore causes:
     *
     *   new AnalyticsView -> fetch -> refresh -> new AnalyticsView -> fetch -> refresh ...
     *
     * That render loop makes the sidebar/topbar appear completely unclickable.
     * The guard below lives on `app`, which survives view re-creation.
     */
    _ensureInitialTelemetryFetch() {
        const host = this.app || window;
        const state = host.__smAnalyticsInitialFetchState || {
            pending: false,
            done: false,
            hydratedOnce: false
        };

        host.__smAnalyticsInitialFetchState = state;

        if (state.pending || state.done) return;

        state.pending = true;

        Promise.resolve(this._call('fetchTelemetry', [this.currentRange], null))
            .then(() => {
                state.pending = false;
                state.done = true;

                // One single hydration refresh is allowed. Never refresh repeatedly from bind().
                if (!state.hydratedOnce && this._isActive()) {
                    state.hydratedOnce = true;
                    queueMicrotask(() => {
                        if (this._isActive()) {
                            this.app?.router?.refresh?.();
                        }
                    });
                }
            })
            .catch((error) => {
                state.pending = false;
                // Allow a later manual re-entry to retry after a failed fetch.
                state.done = false;
                console.warn('[AnalyticsView] Initial telemetry fetch failed:', error);
            });
    }

    async refreshAnalytics({ notify = false } = {}) {
        if (this.isRefreshing) return;

        this.isRefreshing = true;
        const root = document.getElementById('view-root');
        const currentButton = root?.querySelector('[data-action="refresh-analytics"]');
        currentButton?.classList.add('is-spinning');

        try {
            await Promise.resolve(this._call('fetchTelemetry', [this.currentRange], null));

            // A user may click another sidebar/topbar route while the async fetch is in flight.
            // Only redraw if Analytics is STILL the mounted view.
            if (this._isActive()) {
                this.app?.router?.refresh?.();
            }

            if (notify && this._isActive()) {
                this.app?.notify?.('Analytics Updated', 'Latest local telemetry has been loaded.');
            }
        } catch (error) {
            console.error('[AnalyticsView] Refresh failed:', error);
            if (notify && this._isActive()) {
                this.app?.notify?.('Analytics Error', 'Could not refresh local telemetry.');
            }
        } finally {
            this.isRefreshing = false;
            currentButton?.classList.remove('is-spinning');
        }
    }

    /**
     * Register one realtime listener per launcher app, not one per AnalyticsView instance.
     * This prevents listener accumulation when the router reconstructs views.
     */
    _registerRealtimeListener() {
        if (!window.launcherAPI?.onAnalyticsUpdated) return;

        const host = this.app || window;
        const existing = host.__smAnalyticsRealtimeState;

        if (existing?.registered) {
            return;
        }

        const state = {
            registered: true,
            timer: null,
            unsubscribe: null
        };

        host.__smAnalyticsRealtimeState = state;

        const isAnalyticsMounted = () => this._isAnalyticsMounted();

        const maybeUnsubscribe = window.launcherAPI.onAnalyticsUpdated(() => {
            if (!isAnalyticsMounted()) return;

            if ((host.__smAnalyticsSuppressRealtimeUntil || 0) > Date.now()) {
                return;
            }

            clearTimeout(state.timer);

            state.timer = setTimeout(async () => {
                if (!isAnalyticsMounted()) return;

                try {
                    const range = host.__smAnalyticsRange || '30d';
                    await Promise.resolve(this._call('fetchTelemetry', [range], null));

                    // Check AGAIN after awaiting. This is critical: the user may have
                    // navigated away while telemetry was being fetched.
                    if (isAnalyticsMounted()) {
                        this.app?.router?.refresh?.();
                    }
                } catch (error) {
                    console.warn('[AnalyticsView] Realtime refresh failed:', error);
                }
            }, 450);
        });

        if (typeof maybeUnsubscribe === 'function') {
            state.unsubscribe = maybeUnsubscribe;
        }

        this._hasRegisteredUpdateListener = true;
    }

    destroy() {
        clearTimeout(this._realtimeTimer);
        this._realtimeTimer = null;

        // Do NOT blindly remove the app-level realtime listener here. Some routers call
        // destroy() during an in-place refresh before the replacement AnalyticsView binds.
        // The single app-level listener is intentionally kept for the launcher lifetime and
        // becomes inert whenever Analytics is not mounted.
    }

    /**
     * DOM truth is safer than guessing the router's state property name.
     * Some launchers use activeRoute, currentRoute, route, currentView, etc.
     * Previously `!route || route === 'analytics'` treated an undefined activeRoute as
     * "Analytics is active", so stale async callbacks could keep refreshing after navigation.
     */
    _isAnalyticsMounted() {
        const root = document.getElementById('view-root');
        if (!root || !root.isConnected) return false;

        return Boolean(
            root.querySelector('.sm-analytics-page, .sm-analytics-empty-page')
        );
    }

    _isActive() {
        return this._isAnalyticsMounted();
    }

    _hasData() {
        try {
            return typeof SMAnalyticsService?.hasData === 'function' ? Boolean(SMAnalyticsService.hasData()) : true;
        } catch (_) {
            return false;
        }
    }

    _summary() {
        return this._object(this._call('getSummary', [this.currentRange], {}));
    }

    _call(method, args = [], fallback = null) {
        try {
            const fn = SMAnalyticsService?.[method];
            return typeof fn === 'function' ? fn.apply(SMAnalyticsService, args) : fallback;
        } catch (error) {
            console.warn(`[AnalyticsView] ${method} failed:`, error);
            return fallback;
        }
    }

    _metric(value, fallback = {}) {
        return { ...fallback, ...this._object(value) };
    }

    _object(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    _array(value) {
        return Array.isArray(value) ? value : [];
    }

    safeToken(value) {
        return String(value || 'neutral').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'neutral';
    }

    e(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    eAttr(value) {
        return this.e(value);
    }
}
