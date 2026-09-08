// src/ui/components/AnalyticsCharts.js
// SM Engine Launcher Analytics — dependency-free SVG charts.

export class AnalyticsCharts {
    static #uid = 0;

    static renderActivityChart(points = [], options = {}) {
        const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
        if (safePoints.length === 0) {
            return `<div class="sm-chart-empty">No activity data for this time period.</div>`;
        }

        const width = this.#positiveNumber(options.width, 960);
        const height = this.#positiveNumber(options.height, 280);
        const metric = ['sessions', 'devTime', 'projectOpens'].includes(options.metric)
            ? options.metric
            : 'sessions';

        const pad = {
            left: 52,
            right: 22,
            top: 22,
            bottom: 38
        };
        const chartW = Math.max(1, width - pad.left - pad.right);
        const chartH = Math.max(1, height - pad.top - pad.bottom);

        const getVal = (p) => {
            if (metric === 'devTime') return this.#finiteNumber(p?.devMinutes, 0);
            if (metric === 'projectOpens') return this.#finiteNumber(p?.projectOpens, 0);
            return this.#finiteNumber(p?.sessions, 0);
        };

        const values = safePoints.map(getVal);
        const scale = this.#niceScale(Math.max(...values, 0), metric);
        const maxVal = scale.max;
        const stepVal = scale.step;
        const gridSteps = scale.steps;

        const coords = safePoints.map((point, index) => {
            const x = pad.left + (index / Math.max(1, safePoints.length - 1)) * chartW;
            const ratio = Math.max(0, Math.min(1, getVal(point) / Math.max(1, maxVal)));
            const y = pad.top + chartH - ratio * chartH;
            return { x, y, point, val: getVal(point) };
        });

        const pathD = this.buildSmoothPath(coords, { minY: pad.top, maxY: pad.top + chartH });
        const first = coords[0];
        const last = coords[coords.length - 1];
        const baseline = pad.top + chartH;
        const areaD = `${pathD} L ${last.x.toFixed(2)} ${baseline.toFixed(2)} L ${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`;

        const uid = `sm-chart-${Date.now().toString(36)}-${++this.#uid}`;
        const gradId = `${uid}-area`;
        const glowId = `${uid}-glow`;

        let gridHtml = '';
        for (let i = 0; i <= gridSteps; i++) {
            const value = i * stepVal;
            const ratio = value / Math.max(1, maxVal);
            const y = baseline - ratio * chartH;
            gridHtml += `
                <line class="sm-chart-grid-line" x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}" />
                <text class="sm-chart-axis-label sm-chart-axis-y" x="${pad.left - 11}" y="${(y + 3.5).toFixed(2)}" text-anchor="end">${this.#escapeHtml(this.#formatAxisValue(value, metric))}</text>
            `;
        }

        const labelIndexes = this.#labelIndexes(coords.length, 7);
        const xLabelsHtml = [...labelIndexes].map((index) => {
            const c = coords[index];
            return `
                <text class="sm-chart-axis-label sm-chart-axis-x" x="${c.x.toFixed(2)}" y="${height - 11}" text-anchor="middle">${this.#escapeHtml(c.point?.date ?? '')}</text>
            `;
        }).join('');

        const pointsHtml = coords.map((c, index) => {
            const p = c.point || {};
            const date = this.#escapeAttr(p.date ?? '');
            const sessions = this.#escapeAttr(this.#finiteNumber(p.sessions, 0));
            const dev = this.#escapeAttr(p.devTimeStr || this.#formatDuration(this.#finiteNumber(p.devMinutes, 0)));
            const opens = this.#escapeAttr(this.#finiteNumber(p.projectOpens, 0));

            return `
                <g class="sm-chart-point-group" data-point-index="${index}">
                    <circle class="sm-chart-node" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="3.5"
                        data-date="${date}" data-sessions="${sessions}" data-dev="${dev}" data-opens="${opens}" />
                    <circle class="sm-chart-hit" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="11" tabindex="0"
                        role="img" aria-label="${date}: ${sessions} sessions, ${dev} development, ${opens} project opens"
                        data-date="${date}" data-sessions="${sessions}" data-dev="${dev}" data-opens="${opens}" />
                </g>
            `;
        }).join('');

        return `
            <svg class="sm-activity-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"
                role="img" aria-label="Engine activity chart" data-viewbox-width="${width}" data-viewbox-height="${height}">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.22" />
                        <stop offset="68%" stop-color="#f59e0b" stop-opacity="0.045" />
                        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
                    </linearGradient>
                    <filter id="${glowId}" x="-12%" y="-30%" width="124%" height="160%">
                        <feDropShadow dx="0" dy="1" stdDeviation="2.2" flood-color="#f59e0b" flood-opacity="0.30" />
                    </filter>
                </defs>

                <g class="sm-chart-grid">${gridHtml}</g>
                <g class="sm-chart-axis">${xLabelsHtml}</g>
                <path class="sm-chart-area" d="${areaD}" fill="url(#${gradId})" />
                <path class="sm-chart-line" d="${pathD}" filter="url(#${glowId})" />
                <g class="sm-chart-points">${pointsHtml}</g>
            </svg>
        `;
    }

    static buildSmoothPath(points = [], bounds = {}) {
        if (!Array.isArray(points) || points.length === 0) return '';
        if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
        if (points.length === 2) {
            return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
        }

        const minY = Number.isFinite(bounds.minY) ? bounds.minY : -Infinity;
        const maxY = Number.isFinite(bounds.maxY) ? bounds.maxY : Infinity;
        const clampY = (y) => Math.max(minY, Math.min(maxY, y));
        const tension = 0.16;

        let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];

            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = clampY(p1.y + (p2.y - p0.y) * tension);
            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = clampY(p2.y - (p3.y - p1.y) * tension);

            d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
        }
        return d;
    }

    static renderSparkline(values = [], options = {}) {
        const safeValues = Array.isArray(values)
            ? values.map((v) => Number(v)).filter(Number.isFinite)
            : [];
        if (safeValues.length < 2) return '';

        const width = this.#positiveNumber(options.width, 72);
        const height = this.#positiveNumber(options.height, 24);
        const color = typeof options.color === 'string' ? options.color : '#f59e0b';

        const max = Math.max(...safeValues);
        const min = Math.min(...safeValues);
        const range = max === min ? 1 : max - min;

        const coords = safeValues.map((value, index) => ({
            x: (index / (safeValues.length - 1)) * (width - 6) + 3,
            y: height - 3 - ((value - min) / range) * (height - 6)
        }));

        const d = this.buildSmoothPath(coords, { minY: 2, maxY: height - 2 });
        const end = coords[coords.length - 1];

        return `
            <svg class="sm-sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
                <path class="sm-sparkline-path" d="${d}" fill="none" stroke="${this.#escapeAttr(color)}" />
                <circle class="sm-sparkline-end" cx="${end.x.toFixed(2)}" cy="${end.y.toFixed(2)}" r="2" fill="${this.#escapeAttr(color)}" />
            </svg>
        `;
    }

    static #niceScale(rawMax, metric) {
        const targetSteps = 4;
        const minimum = metric === 'devTime' ? 60 : 4;
        const max = Math.max(minimum, this.#finiteNumber(rawMax, 0));
        const roughStep = max / targetSteps;
        const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1e-9)));
        const normalized = roughStep / magnitude;
        let nice = 1;
        if (normalized > 5) nice = 10;
        else if (normalized > 2) nice = 5;
        else if (normalized > 1) nice = 2;
        const step = nice * magnitude;
        const niceMax = Math.ceil(max / step) * step;
        const steps = Math.max(1, Math.round(niceMax / step));
        return { max: niceMax, step, steps };
    }

    static #labelIndexes(length, maxLabels) {
        const result = new Set();
        if (length <= 0) return result;
        if (length === 1) {
            result.add(0);
            return result;
        }
        const count = Math.min(maxLabels, length);
        for (let i = 0; i < count; i++) {
            result.add(Math.round((i / (count - 1)) * (length - 1)));
        }
        return result;
    }

    static #formatAxisValue(value, metric) {
        if (metric !== 'devTime') return String(Math.round(value));
        if (value >= 60) {
            const hours = value / 60;
            return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
        }
        return `${Math.round(value)}m`;
    }

    static #formatDuration(minutes) {
        const mins = Math.max(0, Math.round(minutes));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

    static #positiveNumber(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    static #finiteNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    static #escapeAttr(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    static #escapeHtml(value) {
        return this.#escapeAttr(value);
    }
}
