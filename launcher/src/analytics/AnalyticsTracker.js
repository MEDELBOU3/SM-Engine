// src/analytics/AnalyticsTracker.js
// SM Engine Launcher — local analytics telemetry and persistence.
'use strict';

const fs = require('fs');
const path = require('path');

class AnalyticsTracker {
    constructor(app, options = {}) {
        this.app = app;
        this.maxRetentionDays = this._positiveInt(options.maxRetentionDays, 180);
        this.maxEvents = this._positiveInt(options.maxEvents, 2000);
        this.maxPerformance = this._positiveInt(options.maxPerformance, 1200);
        this.maxSessions = this._positiveInt(options.maxSessions, 2500);

        let basePath;
        try {
            basePath = app?.getPath ? app.getPath('userData') : process.cwd();
        } catch (_) {
            basePath = process.cwd();
        }

        this.filePath = path.join(basePath, 'sm_analytics.json');
        this.data = this._load();
        this._prune(this.maxRetentionDays, { persist: true });
    }

    _emptyData() {
        return {
            schemaVersion: 2,
            sessions: [],
            events: [],
            performance: []
        };
    }

    _load() {
        if (!fs.existsSync(this.filePath)) return this._emptyData();

        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            if (!raw.trim()) return this._emptyData();
            const parsed = JSON.parse(raw);
            return {
                schemaVersion: Number(parsed.schemaVersion) || 1,
                sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
                events: Array.isArray(parsed.events) ? parsed.events : [],
                performance: Array.isArray(parsed.performance) ? parsed.performance : []
            };
        } catch (err) {
            console.error('[AnalyticsTracker] Failed to load analytics data:', err);
            try {
                const backup = `${this.filePath}.corrupt-${Date.now()}.bak`;
                fs.copyFileSync(this.filePath, backup);
                console.warn(`[AnalyticsTracker] Corrupt telemetry backed up to ${backup}`);
            } catch (_) {
                // Best effort only.
            }
            return this._emptyData();
        }
    }

    _save() {
        try {
            const dir = path.dirname(this.filePath);
            fs.mkdirSync(dir, { recursive: true });

            const tmpPath = `${this.filePath}.tmp`;
            const payload = JSON.stringify({ ...this.data, schemaVersion: 2 }, null, 2);
            fs.writeFileSync(tmpPath, payload, 'utf8');
            fs.renameSync(tmpPath, this.filePath);
            return true;
        } catch (err) {
            console.error('[AnalyticsTracker] Failed to save analytics data:', err);
            return false;
        }
    }

    _prune(maxDays, { persist = false } = {}) {
        const days = this._positiveInt(maxDays, this.maxRetentionDays);
        const cutoff = Date.now() - days * 86400000;
        const before = {
            sessions: this.data.sessions.length,
            events: this.data.events.length,
            performance: this.data.performance.length
        };

        this.data.sessions = this.data.sessions
            .filter((s) => this._finite(s?.startedAt) >= cutoff)
            .slice(-this.maxSessions);
        this.data.events = this.data.events
            .filter((e) => this._finite(e?.timestamp) >= cutoff)
            .slice(-this.maxEvents);
        this.data.performance = this.data.performance
            .filter((p) => this._finite(p?.timestamp) >= cutoff)
            .slice(-this.maxPerformance);

        const changed = before.sessions !== this.data.sessions.length ||
            before.events !== this.data.events.length ||
            before.performance !== this.data.performance.length;

        if (persist && changed) this._save();
        return changed;
    }

    startSession({
        projectName = null,
        engineVersion = 'SM Engine 1.0.0',
        projectPath = null,
        mode = 'engine'
    } = {}) {
        const now = Date.now();
        const session = {
            id: `sess_${now}_${Math.random().toString(36).slice(2, 8)}`,
            projectName: this._cleanString(projectName),
            engineVersion: this._cleanString(engineVersion) || 'SM Engine 1.0.0',
            projectPath: this._cleanString(projectPath),
            mode: this._cleanString(mode) || 'engine',
            startedAt: now,
            endedAt: null,
            durationMs: null,
            crashed: false,
            exitCode: null
        };

        this.data.sessions.push(session);
        if (this.data.sessions.length > this.maxSessions) {
            this.data.sessions = this.data.sessions.slice(-Math.floor(this.maxSessions * 0.85));
        }

        this._addEvent({
            type: 'session_start',
            sessionId: session.id,
            label: session.projectName
                ? `Launched project "${session.projectName}"`
                : `Launched Engine (${session.engineVersion})`,
            projectName: session.projectName,
            engineVersion: session.engineVersion
        }, { persist: false });

        this._save();
        return session.id;
    }

    endSession(sessionId, { exitCode = 0, crashed = false } = {}) {
        const session = this.data.sessions.find((s) => s.id === sessionId);
        if (!session) return false;
        if (session.endedAt !== null) return true;

        const now = Date.now();
        session.endedAt = now;
        session.durationMs = Math.max(0, now - this._finite(session.startedAt, now));
        session.exitCode = Number.isFinite(Number(exitCode)) ? Number(exitCode) : null;
        session.crashed = Boolean(crashed) || (
            session.exitCode !== 0 &&
            session.exitCode !== null &&
            session.exitCode !== 130
        );

        this._addEvent({
            type: session.crashed ? 'crash' : 'session_end',
            sessionId,
            label: session.crashed
                ? `Abnormal termination: ${session.projectName || 'Engine'}${session.exitCode !== null ? ` (Exit code: ${session.exitCode})` : ''}`
                : `Closed session: ${session.projectName || 'Engine'} (${Math.round(session.durationMs / 1000)}s)`,
            projectName: session.projectName,
            engineVersion: session.engineVersion,
            durationMs: session.durationMs,
            exitCode: session.exitCode
        }, { persist: false });

        this._save();
        return true;
    }

    logEvent({
        type = 'custom',
        label = '',
        projectName = null,
        engineVersion = null,
        metadata = {}
    } = {}) {
        return this._addEvent({
            type: this._cleanString(type) || 'custom',
            label: this._cleanString(label) || '',
            projectName: this._cleanString(projectName),
            engineVersion: this._cleanString(engineVersion),
            metadata: metadata && typeof metadata === 'object' ? metadata : {}
        });
    }

    _addEvent(eventObj, { persist = true } = {}) {
        const event = {
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            ...eventObj
        };

        this.data.events.push(event);
        if (this.data.events.length > this.maxEvents) {
            this.data.events = this.data.events.slice(-Math.floor(this.maxEvents * 0.8));
        }
        if (persist) this._save();
        return event.id;
    }

    logPerformance({
        fps = null,
        frameTimeMs = null,
        memoryMb = null,
        gpuMemoryMb = null,
        startupMs = null,
        projectLoadMs = null,
        engineVersion = null,
        projectName = null
    } = {}) {
        const sample = {
            timestamp: Date.now(),
            fps: this._nullableNumber(fps, { min: 0, max: 10000, round: true }),
            frameTimeMs: this._nullableNumber(frameTimeMs, { min: 0, max: 60000, decimals: 2 }),
            memoryMb: this._nullableNumber(memoryMb, { min: 0, max: 1048576, round: true }),
            gpuMemoryMb: this._nullableNumber(gpuMemoryMb, { min: 0, max: 1048576, round: true }),
            startupMs: this._nullableNumber(startupMs, { min: 0, max: 3600000, round: true }),
            projectLoadMs: this._nullableNumber(projectLoadMs, { min: 0, max: 3600000, round: true }),
            engineVersion: this._cleanString(engineVersion) || 'SM Engine 1.0.0',
            projectName: this._cleanString(projectName)
        };

        const hasMetric = ['fps', 'frameTimeMs', 'memoryMb', 'gpuMemoryMb', 'startupMs', 'projectLoadMs']
            .some((key) => sample[key] !== null);
        if (!hasMetric) return false;

        this.data.performance.push(sample);
        if (this.data.performance.length > this.maxPerformance) {
            this.data.performance = this.data.performance.slice(-Math.floor(this.maxPerformance * 0.8));
        }
        this._save();
        return true;
    }

    /**
     * Explicit demo seeding. Kept compatible with older code that calls seedIfEmpty().
     * Demo data is never mixed in if real sessions already exist.
     */
    seedIfEmpty(existingProjects = []) {
        if (this.data.sessions.length > 0) return false;
        return this.seedDemoData(existingProjects);
    }

    seedDemoData(existingProjects = []) {
        const now = Date.now();
        const DAY_MS = 86400000;
        const names = Array.isArray(existingProjects) && existingProjects.length
            ? existingProjects.map((p) => this._cleanString(p?.name)).filter(Boolean)
            : ['Sunset Forest', 'AetherForge', 'Water Prototype', 'Physics Playground'];
        const versions = ['SM Engine 1.0.1', 'SM Engine 1.0.0'];

        for (let day = 14; day >= 0; day--) {
            const dayBase = now - day * DAY_MS;
            const sessionsCount = 1 + ((day * 7 + 3) % 3);

            for (let i = 0; i < sessionsCount; i++) {
                const projectName = names[(day + i) % names.length];
                const engineVersion = versions[(day + i) % versions.length];
                const startedAt = dayBase + (i + 1) * 2.5 * 3600000;
                const durationMs = (18 + ((day * 13 + i * 17) % 78)) * 60000;
                const crashed = ((day * 11 + i * 5) % 29) === 0;

                this.data.sessions.push({
                    id: `demo_${startedAt}_${i}`,
                    projectName,
                    engineVersion,
                    projectPath: null,
                    mode: 'project',
                    startedAt,
                    endedAt: startedAt + durationMs,
                    durationMs,
                    crashed,
                    exitCode: crashed ? 1 : 0,
                    demo: true
                });

                this.data.events.push({
                    id: `evt_demo_${startedAt}_${i}`,
                    timestamp: startedAt,
                    type: 'project_open',
                    label: `Opened project "${projectName}"`,
                    projectName,
                    engineVersion,
                    metadata: { demo: true }
                });

                if (crashed) {
                    this.data.events.push({
                        id: `evt_demo_crash_${startedAt}_${i}`,
                        timestamp: startedAt + durationMs,
                        type: 'crash',
                        label: `Abnormal engine exit during "${projectName}" session`,
                        projectName,
                        engineVersion,
                        metadata: { demo: true }
                    });
                }
            }

            const fps = 56 + ((day * 3) % 17);
            this.data.performance.push({
                timestamp: dayBase + 3600000,
                fps,
                frameTimeMs: Number((1000 / fps).toFixed(2)),
                memoryMb: 1800 + ((day * 97) % 780),
                gpuMemoryMb: 1200 + ((day * 83) % 620),
                startupMs: 1750 + ((day * 71) % 650),
                projectLoadMs: 1050 + ((day * 53) % 500),
                engineVersion: 'SM Engine 1.0.1',
                projectName: names[day % names.length],
                demo: true
            });
        }

        this._prune(this.maxRetentionDays);
        this._save();
        return true;
    }

    clear() {
        this.data = this._emptyData();
        return this._save();
    }

    getRawData() {
        return JSON.parse(JSON.stringify(this.data));
    }

    getSummary(rangeDays = 30) {
        // IMPORTANT: 0 means All Time. Do not use `Number(rangeDays) || 30` here.
        const parsedDays = Number(rangeDays);
        const days = Number.isFinite(parsedDays) && parsedDays >= 0 ? parsedDays : 30;
        const now = Date.now();
        const cutoff = days > 0 ? now - days * 86400000 : 0;

        const sessions = this.data.sessions.filter((s) => this._finite(s?.startedAt) >= cutoff);
        const completed = sessions.filter((s) => s?.endedAt !== null && this._finite(s?.durationMs) > 0);
        const crashes = sessions.filter((s) => s?.crashed === true);

        const effectiveDuration = (s) => {
            if (this._finite(s?.durationMs) > 0) return this._finite(s.durationMs);
            if (s?.endedAt === null && this._finite(s?.startedAt) > 0) {
                return Math.max(0, now - this._finite(s.startedAt));
            }
            return 0;
        };

        const totalDurationMs = sessions.reduce((sum, s) => sum + effectiveDuration(s), 0);
        const avgSessionMs = completed.length
            ? Math.round(completed.reduce((sum, s) => sum + this._finite(s.durationMs), 0) / completed.length)
            : 0;

        const projectSet = new Set(sessions.filter((s) => s?.projectName).map((s) => s.projectName));
        const projectStats = {};
        const versionMap = {};
        const versionDurationMap = {};

        for (const s of sessions) {
            const name = this._cleanString(s?.projectName) || 'SM Engine Standalone';
            if (!projectStats[name]) {
                projectStats[name] = {
                    name,
                    path: this._cleanString(s?.projectPath),
                    sessions: 0,
                    totalMs: 0,
                    crashes: 0,
                    lastAt: 0,
                    engineVersion: this._cleanString(s?.engineVersion) || 'SM Engine 1.0.0'
                };
            }

            const duration = effectiveDuration(s);
            const version = this._cleanString(s?.engineVersion) || 'SM Engine 1.0.0';
            const stat = projectStats[name];
            stat.sessions += 1;
            stat.totalMs += duration;
            stat.crashes += s?.crashed ? 1 : 0;
            if (this._finite(s?.startedAt) > stat.lastAt) {
                stat.lastAt = this._finite(s.startedAt);
                stat.engineVersion = version;
                stat.path = this._cleanString(s?.projectPath) || stat.path;
            }

            versionMap[version] = (versionMap[version] || 0) + 1;
            versionDurationMap[version] = (versionDurationMap[version] || 0) + duration;
        }

        const displayDays = days === 0
            ? Math.min(90, Math.max(1, this._daysSpanned(sessions, now)))
            : Math.min(90, Math.max(1, Math.ceil(days)));

        const dailyMap = {};
        for (let i = displayDays - 1; i >= 0; i--) {
            const d = new Date(now - i * 86400000);
            const key = this._localDateKey(d);
            dailyMap[key] = {
                date: key,
                label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                sessions: 0,
                durationMs: 0,
                durationHours: 0,
                projectOpens: 0,
                crashes: 0
            };
        }

        for (const s of sessions) {
            const key = this._localDateKey(new Date(this._finite(s?.startedAt)));
            const day = dailyMap[key];
            if (!day) continue;
            day.sessions += 1;
            day.projectOpens += s?.projectName ? 1 : 0;
            day.durationMs += effectiveDuration(s);
            day.durationHours = Number((day.durationMs / 3600000).toFixed(2));
            if (s?.crashed) day.crashes += 1;
        }

        const perfSamples = this.data.performance.filter((p) => this._finite(p?.timestamp) >= cutoff);
        const fpsValues = this._numericValues(perfSamples, 'fps');
        const frameValues = this._numericValues(perfSamples, 'frameTimeMs');
        const memValues = this._numericValues(perfSamples, 'memoryMb');
        const gpuValues = this._numericValues(perfSamples, 'gpuMemoryMb');
        const startupValues = this._numericValues(perfSamples, 'startupMs');
        const loadValues = this._numericValues(perfSamples, 'projectLoadMs');

        const totalSessionCount = sessions.length;
        const crashCount = crashes.length;
        const crashFreeRate = totalSessionCount > 0
            ? Number((((totalSessionCount - crashCount) / totalSessionCount) * 100).toFixed(1))
            : 100;

        const recentEvents = [...this.data.events]
            .filter((e) => this._finite(e?.timestamp) >= cutoff)
            .sort((a, b) => this._finite(b?.timestamp) - this._finite(a?.timestamp))
            .slice(0, 30);

        return {
            rangeDays: days,
            totalSessions: totalSessionCount,
            completedSessions: completed.length,
            activeSessions: sessions.filter((s) => s?.endedAt === null).length,
            crashes: crashCount,
            crashFreeRate,
            totalDurationMs,
            totalDurationHours: Number((totalDurationMs / 3600000).toFixed(1)),
            avgSessionMs,
            avgSessionMinutes: Math.round(avgSessionMs / 60000),
            uniqueProjects: projectSet.size,
            projectStats: Object.values(projectStats).sort((a, b) => b.totalMs - a.totalMs),
            versionMap,
            versionDurationMap,
            dailyActivity: Object.values(dailyMap),
            performance: {
                avgFps: this._average(fpsValues),
                avgFrameTimeMs: this._average(frameValues, 2),
                avgMemMb: this._average(memValues),
                peakMemMb: memValues.length ? Math.max(...memValues) : 0,
                avgGpuMemoryMb: this._average(gpuValues),
                peakGpuMemoryMb: gpuValues.length ? Math.max(...gpuValues) : 0,
                avgStartupMs: this._average(startupValues),
                avgProjectLoadMs: this._average(loadValues),
                samples: perfSamples.length
            },
            recentEvents
        };
    }

    _numericValues(items, key) {
        return items
            .map((item) => Number(item?.[key]))
            .filter((value) => Number.isFinite(value) && value >= 0);
    }

    _average(values, decimals = 0) {
        if (!values.length) return 0;
        const value = values.reduce((sum, n) => sum + n, 0) / values.length;
        return decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
    }

    _daysSpanned(sessions, now) {
        if (!sessions.length) return 30;
        const oldest = Math.min(...sessions.map((s) => this._finite(s?.startedAt, now)));
        return Math.ceil((now - oldest) / 86400000) + 1;
    }

    _localDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    _nullableNumber(value, { min = -Infinity, max = Infinity, round = false, decimals = null } = {}) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        if (!Number.isFinite(n) || n < min || n > max) return null;
        if (round) return Math.round(n);
        if (Number.isInteger(decimals) && decimals >= 0) return Number(n.toFixed(decimals));
        return n;
    }

    _cleanString(value) {
        if (typeof value !== 'string') return value == null ? null : String(value);
        const clean = value.trim();
        return clean || null;
    }

    _positiveInt(value, fallback) {
        const n = Math.floor(Number(value));
        return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    _finite(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }
}

module.exports = { AnalyticsTracker };
