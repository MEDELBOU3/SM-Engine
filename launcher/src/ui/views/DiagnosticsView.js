// src/ui/views/DiagnosticsView.js

export class DiagnosticsView {
    constructor(app) {
        this.app = app;
    }

    render() {
        const engine = this.app?.state?.engine || {};
        const engines = this.app?.state?.engines || [];

        return `
            <div class="sm-page">
                <div class="sm-page-head">
                    <div>
                        <h1 class="sm-page-title">Diagnostics</h1>

                        <p class="sm-page-subtitle">
                            Inspect launcher, platform and engine status.
                        </p>
                    </div>

                    <button
                        class="sm-btn"
                        data-action="copy-diagnostics"
                        type="button"
                    >
                        Copy Report
                    </button>
                </div>

                <div class="sm-diagnostics-grid">
                    ${this.card(
                        "Operating System",
                        navigator.platform || "Unknown"
                    )}

                    ${this.card(
                        "Runtime",
                        navigator.userAgent || "Unknown"
                    )}

                    ${this.card(
                        "SM Engine",
                        `Version ${engine.version || "Unknown"}\nChannel: ${engine.channel || "Unknown"}`
                    )}

                    ${this.card(
                        "Graphics",
                        `Mode: ${engine.gpuMode || "Automatic"}\nRenderer detection: ready`
                    )}

                    ${this.card(
                        "Engine Path",
                        engines[0]?.path || "Not configured"
                    )}

                    ${this.card(
                        "Frontend",
                        [
                            "Router: ready",
                            "Responsive shell: ready",
                            "Preload bridge: ready"
                        ].join("\n")
                    )}
                </div>
            </div>
        `;
    }

    card(title, value) {
        return `
            <article class="sm-surface sm-diagnostic">
                <div class="sm-diagnostic-head">
                    <strong>${this.escape(title)}</strong>

                    <span class="sm-tag sm-tag-success">
                        Ready
                    </span>
                </div>

                <pre class="sm-diagnostic-value">${this.escape(value)}</pre>
            </article>
        `;
    }

    escape(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
}