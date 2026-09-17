/**
 * FusionModelingUI.js
 * UI bridge for the Fusion-inspired tools used by SM Engine.
 *
 * Mounts as a regular section inside #modeling-studio-panel.
 *
 * Public helpers:
 *   window.FusionModelingUI.open()
 *   window.FusionModelingUI.mount()
 *   window.FusionModelingUI.refresh()
 *
 * Load AFTER:
 *   advanced_modeling_tools.js
 *   FusionLoftTool.js
 *   FusionFilletTool.js
 *   FusionShellTool.js
 *   FusionDraftTool.js
 *   FusionPatternTool.js
 */
(function (root) {
    "use strict";
    const FusionModelingUI = {
        activeTool: "loft",
        patternType: "circular",
        mounted: false,
        observer: null,
        statusTimer: null,
        init() {
            if (this._initialized) return;
            this._initialized = true;
            this._startObserver();
            this.mount();
            document.addEventListener("click", e => {
                const target = e.target.closest?.("#toggle-modeling,[data-model-action],#modeling-toolbar-btn");
                if (target) setTimeout(() => this.mount(), 0);
            }, true);
            window.addEventListener("sm:modeling-mode-changed", () => setTimeout(() => this.mount(), 0));
        },
        open() {
            root.InspectorPanel?.showModelingView?.();
            setTimeout(() => {
                this.mount();
                document.getElementById("fusion-cad-section")?.scrollIntoView?.({ block: "nearest" });
            }, 0);
        },
        _startObserver() {
            if (this.observer || typeof MutationObserver === "undefined") return;
            this.observer = new MutationObserver(() => this.mount());
            this.observer.observe(document.body, { childList: true, subtree: true });
        },
        mount() {
            const panel = document.getElementById("modeling-studio-panel");
            if (!panel) return false;
            let host = document.getElementById("fusion-cad-section");
            if (!host) {
                host = document.createElement("section");
                host.id = "fusion-cad-section";
                host.className = "modeling-inspector-section fusion-cad-section";
                const meshOperations = panel.querySelector(".modeling-inspector-section");
                if (meshOperations) panel.insertBefore(host, meshOperations);
                else panel.appendChild(host);
            }
            if (host.dataset.built !== "1") {
                host.dataset.built = "1";
                host.innerHTML = this._html();
                this._bind(host);
            }
            this.mounted = true;
            this.refresh();
            return true;
        },
        _html() {
            return `
<div class="fusion-section-header modeling-section-title">
<div class="fusion-section-title"><i class="fas fa-cubes"></i><span>Fusion CAD Tools</span></div>
<div class="fusion-section-actions"><span class="fusion-mode-pill" id="fusion-mode-pill">Object Mode</span><button class="fusion-collapse" data-fusion-collapse type="button" title="Collapse Fusion tools"><i class="fas fa-chevron-up"></i></button></div>
</div>
<div class="fusion-section-body">
<div class="fusion-help" id="fusion-selection-help">Enter Edit Mode, then choose a Fusion tool.</div>
<div class="fusion-tool-grid" id="fusion-tool-grid">
<button class="fusion-tool active" data-fusion-tool="loft" type="button"><i class="fas fa-layer-group"></i><span>Loft</span></button>
<button class="fusion-tool" data-fusion-tool="fillet" type="button"><i class="fas fa-bezier-curve"></i><span>Fillet</span></button>
<button class="fusion-tool" data-fusion-tool="shell" type="button"><i class="fas fa-cube"></i><span>Shell</span></button>
<button class="fusion-tool" data-fusion-tool="draft" type="button"><i class="fas fa-drafting-compass"></i><span>Draft</span></button>
<button class="fusion-tool" data-fusion-tool="pattern" type="button"><i class="fas fa-border-all"></i><span>Pattern</span></button>
</div>
<div id="fusion-tool-settings" class="fusion-tool-settings"></div>
<div class="fusion-selection-summary" id="fusion-selection-summary">
<span>V <b data-fusion-count="vertices">0</b></span>
<span>E <b data-fusion-count="edges">0</b></span>
<span>F <b data-fusion-count="faces">0</b></span>
</div>
<div class="fusion-footer">
<button class="fusion-btn secondary" id="fusion-reset-btn" type="button">Reset</button>
<button class="fusion-btn primary" id="fusion-apply-btn" type="button"><i class="fas fa-check"></i> Apply</button>
</div>
<div class="fusion-status" id="fusion-ui-status">Ready.</div>
</div>`;
        },
        _bind(host) {
            host.querySelector("[data-fusion-collapse]")?.addEventListener("click", () => {
                const collapsed = host.classList.toggle("is-collapsed");
                const icon = host.querySelector("[data-fusion-collapse] i");
                if (icon) icon.className = collapsed ? "fas fa-chevron-down" : "fas fa-chevron-up";
            });
            host.querySelector("#fusion-tool-grid")?.addEventListener("click", e => {
                const btn = e.target.closest("[data-fusion-tool]");
                if (!btn) return;
                this.activeTool = btn.dataset.fusionTool;
                host.querySelectorAll("[data-fusion-tool]").forEach(b => b.classList.toggle("active", b === btn));
                this._renderSettings();
            });
            host.querySelector("#fusion-reset-btn")?.addEventListener("click", () => this._renderSettings(true));
            host.querySelector("#fusion-apply-btn")?.addEventListener("click", () => this.apply());
            this._renderSettings();
            if (!this.statusTimer) this.statusTimer = setInterval(() => this.refresh(), 400);
        },
        _renderSettings(reset = false) {
            const wrap = document.getElementById("fusion-tool-settings");
            if (!wrap) return;
            const t = this.activeTool;
            if (t === "loft") wrap.innerHTML = this._loftUI();
            else if (t === "fillet") wrap.innerHTML = this._filletUI();
            else if (t === "shell") wrap.innerHTML = this._shellUI();
            else if (t === "draft") wrap.innerHTML = this._draftUI();
            else wrap.innerHTML = this._patternUI();
            this._bindSettingInteractions(wrap);
            this.refresh();
        },
        _field(label, control, hint = "") {
            return `<label class="fusion-field"><span class="fusion-label">${label}</span>${control}${hint ? `<small>${hint}</small>` : ""}</label>`;
        },
        _num(id, value, min, max, step) {
            return `<input class="fusion-input" id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}">`;
        },
        _select(id, items, value) {
            return `<select class="fusion-select" id="${id}">${items.map(v => `<option value="${v[0]}" ${v[0] === value ? "selected" : ""}>${v[1]}</option>`).join("")}</select>`;
        },
        _check(id, label, checked = true) {
            return `<label class="fusion-check"><input id="${id}" type="checkbox" ${checked ? "checked" : ""}><span>${label}</span></label>`;
        },
        _loftUI() {
            return `<div class="fusion-tool-head"><b>Advanced Loft</b><span>Select 2+ profile faces</span></div>
<div class="fusion-fields two-col">
${this._field("Profile Samples", this._num("fusion-loft-segments", 24, 3, 128, 1))}
${this._field("Subdivisions", this._num("fusion-loft-subdivisions", 4, 1, 32, 1))}
${this._field("Interpolation", this._select("fusion-loft-interpolation", [["catmullrom", "Smooth / Catmull-Rom"], ["linear", "Linear"]], "catmullrom"))}
</div>
<div class="fusion-check-row">
${this._check("fusion-loft-cap-start", "Cap Start", true)}
${this._check("fusion-loft-cap-end", "Cap End", true)}
${this._check("fusion-loft-remove", "Replace Profiles", true)}
</div>`;
        },
        _filletUI() {
            return `<div class="fusion-tool-head"><b>Edge Fillet</b><span>Select one or more edges</span></div>
<div class="fusion-fields two-col">
${this._field("Radius", this._num("fusion-fillet-radius", 0.15, 0.0001, 10000, 0.01))}
${this._field("Segments", this._num("fusion-fillet-segments", 5, 1, 16, 1))}
</div>
<div class="fusion-note">Use smaller radius on dense or short edges. Multi-segment fillets produce a smoother rounded transition.</div>`;
        },
        _shellUI() {
            return `<div class="fusion-tool-head"><b>Shell</b><span>Selected faces become openings</span></div>
<div class="fusion-fields two-col">
${this._field("Thickness", this._num("fusion-shell-thickness", 0.12, 0.0001, 10000, 0.01))}
${this._field("Direction", this._select("fusion-shell-direction", [["inside", "Inside"], ["outside", "Outside"]], "inside"))}
</div>
<div class="fusion-note">If no faces are selected, the complete closed body is shelled.</div>`;
        },
        _draftUI() {
            return `<div class="fusion-tool-head"><b>Draft / Taper</b><span>Select faces to taper</span></div>
<div class="fusion-fields two-col">
${this._field("Angle", this._num("fusion-draft-angle", 8, -80, 80, 0.5))}
${this._field("Pull Direction", this._select("fusion-draft-direction", [["x", "+X"], ["-x", "-X"], ["y", "+Y"], ["-y", "-Y"], ["z", "+Z"], ["-z", "-Z"]], "y"))}
${this._field("Neutral Plane", this._select("fusion-draft-neutral", [["min", "Minimum"], ["center", "Center"], ["max", "Maximum"]], "min"))}
</div>
<div class="fusion-check-row">${this._check("fusion-draft-symmetric", "Symmetric", false)}</div>`;
        },
        _patternUI() {
            return `<div class="fusion-tool-head"><b>Pattern</b><span>Duplicate selected face geometry</span></div>
<div class="fusion-segmented">
<button type="button" data-pattern-type="circular" class="${this.patternType === "circular" ? "active" : ""}">Circular</button>
<button type="button" data-pattern-type="rectangular" class="${this.patternType === "rectangular" ? "active" : ""}">Rectangular</button>
<button type="button" data-pattern-type="path" class="${this.patternType === "path" ? "active" : ""}">Path</button>
</div>
<div id="fusion-pattern-options">${this._patternOptions()}</div>`;
        },
        _patternOptions() {
            if (this.patternType === "rectangular") return `
<div class="fusion-fields two-col">
${this._field("Count X", this._num("fusion-pattern-count-x", 4, 1, 64, 1))}
${this._field("Count Y", this._num("fusion-pattern-count-y", 3, 1, 64, 1))}
${this._field("Spacing X", this._num("fusion-pattern-spacing-x", 1, -10000, 10000, 0.1))}
${this._field("Spacing Y", this._num("fusion-pattern-spacing-y", 1, -10000, 10000, 0.1))}
${this._field("Direction X", this._select("fusion-pattern-dir-x", [["x", "X"], ["y", "Y"], ["z", "Z"]], "x"))}
${this._field("Direction Y", this._select("fusion-pattern-dir-y", [["x", "X"], ["y", "Y"], ["z", "Z"]], "z"))}
</div>
<div class="fusion-check-row">${this._check("fusion-pattern-whole", "Whole Mesh", false)}</div>`;
            if (this.patternType === "path") return `
<div class="fusion-fields two-col">
${this._field("Count", this._num("fusion-pattern-count", 10, 2, 128, 1))}
</div>
<div class="fusion-check-row">
${this._check("fusion-pattern-align", "Align to Path", true)}
${this._check("fusion-pattern-closed", "Closed Path", false)}
${this._check("fusion-pattern-whole", "Whole Mesh", false)}
</div>
<div class="fusion-note">Uses the active spline chosen by your Extrude Along Spline picker.</div>`;
            return `
<div class="fusion-fields two-col">
${this._field("Count", this._num("fusion-pattern-count", 8, 2, 128, 1))}
${this._field("Axis", this._select("fusion-pattern-axis", [["x", "X"], ["y", "Y"], ["z", "Z"], ["-x", "-X"], ["-y", "-Y"], ["-z", "-Z"]], "y"))}
${this._field("Angle", this._num("fusion-pattern-angle", 360, -3600, 3600, 1))}
</div>
<div class="fusion-check-row">${this._check("fusion-pattern-whole", "Whole Mesh", false)}</div>`;
        },
        _bindSettingInteractions(wrap) {
            wrap.querySelectorAll("[data-pattern-type]").forEach(btn => {
                btn.addEventListener("click", () => {
                    this.patternType = btn.dataset.patternType;
                    this._renderSettings();
                });
            });
        },
        _numValue(id, fallback = 0) {
            const v = Number(document.getElementById(id)?.value);
            return Number.isFinite(v) ? v : fallback;
        },
        _checked(id) { return !!document.getElementById(id)?.checked; },
        _value(id, fallback = "") { return document.getElementById(id)?.value ?? fallback; },
        setStatus(message, isError = false) {
            const el = document.getElementById("fusion-ui-status");
            if (el) {
                el.textContent = String(message || "");
                el.classList.toggle("error", !!isError);
            }
            root.updateModelingStatus?.(message);
        },
        _requireSystem(method) {
            const sys = root.UnifiedModelingSystem;
            if (!sys) {
                this.setStatus("UnifiedModelingSystem is not loaded.", true);
                return null;
            }
            if (!sys.isEditMode || !sys.editableMesh) {
                this.setStatus("Enter Edit Mode first.", true);
                return null;
            }
            if (typeof sys[method] !== "function") {
                this.setStatus(`${method} is not loaded. Check your Fusion tool script order.`, true);
                return null;
            }
            return sys;
        },
        apply() {
            try {
                let sys, result;
                if (this.activeTool === "loft") {
                    sys = this._requireSystem("fusionLoft"); if (!sys) return;
                    result = sys.fusionLoft({
                        segments: this._numValue("fusion-loft-segments", 24),
                        subdivisions: this._numValue("fusion-loft-subdivisions", 4),
                        interpolation: this._value("fusion-loft-interpolation", "catmullrom"),
                        capStart: this._checked("fusion-loft-cap-start"),
                        capEnd: this._checked("fusion-loft-cap-end"),
                        removeProfiles: this._checked("fusion-loft-remove")
                    });
                } else if (this.activeTool === "fillet") {
                    sys = this._requireSystem("fusionFillet"); if (!sys) return;
                    result = sys.fusionFillet({
                        radius: this._numValue("fusion-fillet-radius", 0.15),
                        segments: this._numValue("fusion-fillet-segments", 5)
                    });
                } else if (this.activeTool === "shell") {
                    sys = this._requireSystem("fusionShell"); if (!sys) return;
                    result = sys.fusionShell({
                        thickness: this._numValue("fusion-shell-thickness", 0.12),
                        direction: this._value("fusion-shell-direction", "inside")
                    });
                } else if (this.activeTool === "draft") {
                    sys = this._requireSystem("fusionDraft"); if (!sys) return;
                    result = sys.fusionDraft({
                        angle: this._numValue("fusion-draft-angle", 8),
                        direction: this._value("fusion-draft-direction", "y"),
                        neutral: this._value("fusion-draft-neutral", "min"),
                        symmetric: this._checked("fusion-draft-symmetric")
                    });
                } else {
                    if (this.patternType === "rectangular") {
                        sys = this._requireSystem("fusionRectangularPattern"); if (!sys) return;
                        result = sys.fusionRectangularPattern({
                            countX: this._numValue("fusion-pattern-count-x", 4),
                            countY: this._numValue("fusion-pattern-count-y", 3),
                            spacingX: this._numValue("fusion-pattern-spacing-x", 1),
                            spacingY: this._numValue("fusion-pattern-spacing-y", 1),
                            directionX: this._value("fusion-pattern-dir-x", "x"),
                            directionY: this._value("fusion-pattern-dir-y", "z"),
                            wholeMesh: this._checked("fusion-pattern-whole")
                        });
                    } else if (this.patternType === "path") {
                        sys = this._requireSystem("fusionPathPattern"); if (!sys) return;
                        result = sys.fusionPathPattern({
                            count: this._numValue("fusion-pattern-count", 10),
                            align: this._checked("fusion-pattern-align"),
                            closed: this._checked("fusion-pattern-closed"),
                            wholeMesh: this._checked("fusion-pattern-whole")
                        });
                    } else {
                        sys = this._requireSystem("fusionCircularPattern"); if (!sys) return;
                        result = sys.fusionCircularPattern({
                            count: this._numValue("fusion-pattern-count", 8),
                            axis: this._value("fusion-pattern-axis", "y"),
                            angle: this._numValue("fusion-pattern-angle", 360),
                            wholeMesh: this._checked("fusion-pattern-whole")
                        });
                    }
                }
                const message = sys?.architectureMessage || `${this.activeTool} operation complete.`;
                this.setStatus(message, result === false);
                this.refresh();
            } catch (err) {
                console.error("[FusionModelingUI]", err);
                this.setStatus(err?.message || String(err), true);
            }
        },
        refresh() {
            const host = document.getElementById("fusion-cad-section");
            if (!host) return;
            const sys = root.UnifiedModelingSystem;
            const em = sys?.editableMesh;
            const mode = document.getElementById("fusion-mode-pill");
            if (mode) {
                mode.textContent = sys?.isEditMode ? "Edit Mode" : "Object Mode";
                mode.classList.toggle("active", !!sys?.isEditMode);
            }
            const counts = {
                vertices: em?.selectedVertices?.size || 0,
                edges: em?.selectedEdges?.size || 0,
                faces: em?.selectedFaces?.size || 0
            };
            for (const [k, v] of Object.entries(counts)) {
                const el = host.querySelector(`[data-fusion-count="${k}"]`);
                if (el) el.textContent = String(v);
            }
            const help = document.getElementById("fusion-selection-help");
            if (help) {
                if (!sys?.isEditMode) help.textContent = "Enter Edit Mode first.";
                else if (this.activeTool === "loft") help.textContent = "Face mode: select 2 or more separated profile faces, then Apply.";
                else if (this.activeTool === "fillet") help.textContent = "Edge mode: select the edges that should become rounded.";
                else if (this.activeTool === "shell") help.textContent = "Face mode: optionally select faces to remove as shell openings.";
                else if (this.activeTool === "draft") help.textContent = "Face mode: select the faces to taper relative to the pull direction.";
                else help.textContent = "Face mode: select the geometry to duplicate. Pattern can optionally use the whole mesh.";
            }
            const apply = host.querySelector("#fusion-apply-btn");
            if (apply) apply.disabled = !sys?.isEditMode;
        }
    };
    root.FusionModelingUI = FusionModelingUI;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => FusionModelingUI.init(), { once: true });
    else FusionModelingUI.init();
    console.log("[FusionModelingUI] ready");
})(window);
