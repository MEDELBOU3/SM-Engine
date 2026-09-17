/**
 * SM Engine - EngineSentinel
 * Classic non-module build.
 *
 * Diagnostic and control layer for PerformanceManager.
 * Sentinel DOES NOT directly modify renderer pixel ratio, shadows, LOD or scene visibility.
 * All quality changes are routed through PerformanceManager.
 */
class EngineSentinel {
    constructor(performanceManager, options = {}) {
        if (!performanceManager) {
            throw new Error("EngineSentinel: PerformanceManager instance is required.");
        }

        this.performanceManager = performanceManager;
        this.scene = performanceManager.scene;
        this.renderer = performanceManager.renderer;
        this.camera = performanceManager.camera;

        this.options = {
            targetMenuId: "statsMenu",
            analysisIntervalMs: 1200,
            showUI: true,
            ...options
        };

        this.analysis = {
            bottleneck: "Analyzing...",
            heavyCulprit: "None",
            meshCount: 0,
            lightCount: 0
        };

        this.targetMenu = document.getElementById(this.options.targetMenuId);
        this.sentinelContainer = null;
        this.analysisInterval = null;
        this._keydownHandler = null;

        this.init();
    }

    init() {
        if (this.options.showUI) this._injectIntoMenu();
        this._startAnalysisLoop();
        this._setupKeyboardShortcuts();

        console.log("🛡️ EngineSentinel initialized.");
    }

    _injectIntoMenu() {
        if (!this.targetMenu) {
            console.warn(`EngineSentinel: #${this.options.targetMenuId} not found.`);
            return;
        }

        const previous = document.getElementById("sentinel-hud");
        if (previous) previous.remove();

        this.sentinelContainer = document.createElement("div");
        this.sentinelContainer.id = "sentinel-hud";
        this.sentinelContainer.style.cssText = `
            border-top:1px solid rgba(255,255,255,.10);
            margin-top:10px;
            padding-top:10px;
            color:#ddd;
            font-family:Consolas,monospace;
            font-size:11px;
            line-height:1.55;
        `;

        this.targetMenu.appendChild(this.sentinelContainer);
        this.renderUI();
    }

    _startAnalysisLoop() {
        if (this.analysisInterval) clearInterval(this.analysisInterval);

        this.analysisInterval = setInterval(() => {
            this.performAnalysis();
            this.renderUI();
        }, Math.max(250, this.options.analysisIntervalMs));
    }

    _setupKeyboardShortcuts() {
        this._keydownHandler = event => {
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "o") {
                event.preventDefault();
                this.toggleAutoOptimization();
            }
        };

        window.addEventListener("keydown", this._keydownHandler);
    }

    performAnalysis() {
        const report = this.performanceManager.getReport();

        this.analysis.meshCount = report.geometry.meshCount || 0;

        let lightCount = 0;
        this.scene.traverse(object => {
            if (object?.isLight) lightCount++;
        });
        this.analysis.lightCount = lightCount;

        const heavy = this.performanceManager.getHeavyMeshes(1);
        if (heavy.length > 0) {
            const item = heavy[0];
            this.analysis.heavyCulprit =
                `${item.name || "Unnamed"} (${this._formatNumber(item.triangles)} tris)`;
        } else {
            this.analysis.heavyCulprit = "No heavy mesh detected";
        }

        const p = report.performance;
        const g = report.geometry;
        const m = report.memory;
        const s = report.shadows;

        if (p.averageFPS < 35) {
            this.analysis.bottleneck = "Severe frame-time pressure";
        } else if (g.pressureLevel === "CRITICAL") {
            this.analysis.bottleneck = "Critical polygon pressure";
        } else if (p.drawCalls > 1800) {
            this.analysis.bottleneck = "Very high draw-call count";
        } else if (m.possibleTextureLeak || m.possibleGeometryLeak) {
            this.analysis.bottleneck = "Possible memory leak";
        } else if (s.disabledByBudget > 0) {
            this.analysis.bottleneck = "Shadow budget pressure";
        } else if (g.pressureLevel === "HIGH") {
            this.analysis.bottleneck = "High polygon pressure";
        } else if (p.averageFPS < 52) {
            this.analysis.bottleneck = "GPU / renderer pressure";
        } else {
            this.analysis.bottleneck = "Scene OK";
        }

        return this.analysis;
    }

    renderUI() {
        if (!this.sentinelContainer) return;

        const report = this.performanceManager.getReport();
        const perf = report.performance;
        const geo = report.geometry;
        const vis = report.visibility;
        const lod = report.lod;
        const dyn = report.dynamicResolution;
        const mem = report.memory;

        const autoEnabled = this.performanceManager.options.autoOptimize;
        const quality = this.performanceManager.qualityLevel.toUpperCase();

        this.sentinelContainer.innerHTML = `
            <div style="display:flex;gap:4px;margin-bottom:8px;">
                ${this._buttonHTML("sentinel-auto-btn", autoEnabled ? "AUTO ON" : "AUTO OFF")}
                ${this._buttonHTML("sentinel-quality-up", "QUALITY +")}
                ${this._buttonHTML("sentinel-quality-down", "QUALITY -")}
                ${this._buttonHTML("sentinel-reset", "RESET")}
            </div>

            ${this._row("FPS", `${perf.fps.toFixed(1)} / avg ${perf.averageFPS.toFixed(1)}`)}
            ${this._row("Frame", `${perf.frameTimeMs.toFixed(2)} ms`)}
            ${this._row("Draw Calls", this._formatNumber(perf.drawCalls))}
            ${this._row("Rendered Tris", this._formatNumber(perf.triangles))}
            ${this._row("Scene Tris", this._formatNumber(geo.totalTriangles))}
            ${this._row("Visible Tris", this._formatNumber(geo.visibleTriangles))}
            ${this._row("Poly Pressure", geo.pressureLevel)}
            ${this._row("LOD", `L0 ${lod.lod0} | L1 ${lod.lod1} | L2 ${lod.lod2}`)}
            ${this._row("Visible", `${vis.visible}/${vis.registered}`)}
            ${this._row("Resolution", `${Math.round(dyn.scale * 100)}%`)}
            ${this._row("Textures", this._formatNumber(mem.textures))}
            ${this._row("Geometries", this._formatNumber(mem.geometries))}
            ${this._row("Quality", quality)}

            <div style="
                margin-top:8px;
                padding:7px;
                background:rgba(255,255,255,.035);
                border-left:2px solid rgba(255,255,255,.16);
            ">
                <div style="font-size:10px;color:#aaa;">ANALYSIS</div>
                <div style="color:#fff;">${this.analysis.bottleneck}</div>
                <div style="color:#999;font-size:10px;margin-top:2px;">
                    ${this.analysis.heavyCulprit}
                </div>
            </div>
        `;

        this._bindUIEvents();
    }

    _buttonHTML(id, text) {
        return `
            <button id="${id}" style="
                flex:1;
                min-width:0;
                padding:4px 5px;
                background:#414141;
                border:0;
                color:#ddd;
                cursor:pointer;
                font-size:9px;
            ">${text}</button>
        `;
    }

    _row(label, value) {
        return `
            <div style="display:flex;justify-content:space-between;gap:10px;">
                <span style="color:#999;">${label}</span>
                <span style="color:#eee;">${value}</span>
            </div>
        `;
    }

    _bindUIEvents() {
        const auto = document.getElementById("sentinel-auto-btn");
        const up = document.getElementById("sentinel-quality-up");
        const down = document.getElementById("sentinel-quality-down");
        const reset = document.getElementById("sentinel-reset");

        if (auto) auto.onclick = () => this.toggleAutoOptimization();
        if (up) up.onclick = () => this.manualUpgrade();
        if (down) down.onclick = () => this.manualDowngrade();
        if (reset) reset.onclick = () => this.resetOptimizations();
    }

    toggleAutoOptimization() {
        this.performanceManager.options.autoOptimize =
            !this.performanceManager.options.autoOptimize;

        this.renderUI();
    }

    manualUpgrade() {
        const levels = ["low", "medium", "high", "ultra"];
        const current = levels.indexOf(this.performanceManager.qualityLevel);
        const next = Math.min(levels.length - 1, current + 1);
        this.performanceManager.setQualityLevel(levels[next]);
        this.renderUI();
    }

    manualDowngrade() {
        const levels = ["low", "medium", "high", "ultra"];
        const current = levels.indexOf(this.performanceManager.qualityLevel);
        const next = Math.max(0, current - 1);
        this.performanceManager.setQualityLevel(levels[next]);
        this.renderUI();
    }

    resetOptimizations() {
        this.performanceManager.resetOptimizations();
        this.renderUI();
    }

    generateReport() {
        return {
            analysis: { ...this.analysis },
            engine: this.performanceManager.getReport()
        };
    }

    _formatNumber(value) {
        const number = Number(value) || 0;

        if (number >= 1_000_000_000) {
            return `${(number / 1_000_000_000).toFixed(2)}B`;
        }

        if (number >= 1_000_000) {
            return `${(number / 1_000_000).toFixed(2)}M`;
        }

        if (number >= 1_000) {
            return `${(number / 1_000).toFixed(1)}K`;
        }

        return String(Math.round(number));
    }

    destroy() {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }

        if (this._keydownHandler) {
            window.removeEventListener("keydown", this._keydownHandler);
            this._keydownHandler = null;
        }

        if (this.sentinelContainer?.parentNode) {
            this.sentinelContainer.parentNode.removeChild(this.sentinelContainer);
        }

        this.sentinelContainer = null;
    }
}

window.EngineSentinel = EngineSentinel;