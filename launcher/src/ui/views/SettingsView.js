export class SettingsView {
    constructor(app) {
        this.app = app;
    }

    render() {
        const engine = this.app?.state?.engine || {};
        const enginePath = this.app?.state?.engines?.[0]?.path || "";

        return `
            <div class="sm-page">
                <div class="sm-page-head">
                    <div>
                        <h1 class="sm-page-title">Settings</h1>
                        <p class="sm-page-subtitle">
                            Launcher preferences and SM Engine startup behavior.
                        </p>
                    </div>
                </div>

                <section class="sm-section">
                    <div class="sm-section-head">
                        <h2 class="sm-section-title">Engine</h2>
                    </div>

                    <div class="sm-surface sm-setting-group">
                        ${this.selectRow(
                            "Graphics Backend",
                            "Default renderer mode used when launching SM Engine.",
                            ["Automatic","Hardware / D3D11","Software / SwiftShader"],
                            engine.gpuMode || "Automatic"
                        )}

                        ${this.toggleRow(
                            "Open last project",
                            "Reopen the most recently used project.",
                            true
                        )}

                        ${this.toggleRow(
                            "Check for updates",
                            "Look for newer launcher and engine releases.",
                            true
                        )}

                        ${this.toggleRow(
                            "Development tools",
                            "Enable additional diagnostics during development.",
                            false
                        )}
                    </div>
                </section>

                <section class="sm-section">
                    <div class="sm-section-head">
                        <h2 class="sm-section-title">Storage</h2>
                    </div>

                    <div class="sm-surface sm-setting-group">
                        ${this.fieldRow(
                            "Default project directory",
                            "Used when creating new SM Engine projects.",
                            "C:\\Users\\PC\\Documents\\SM Engine Projects"
                        )}

                        ${this.fieldRow(
                            "Engine development path",
                            "Current local SM Engine development installation.",
                            enginePath
                        )}
                    </div>
                </section>
            </div>
        `;
    }

    toggleRow(title, description, checked) {
        return `
            <div class="sm-setting-row">
                <div class="sm-setting-label">
                    <strong>${title}</strong>
                    <span>${description}</span>
                </div>

                <label class="sm-toggle">
                    <input type="checkbox" ${checked ? "checked" : ""} />
                    <span class="sm-toggle-track"></span>
                </label>
            </div>
        `;
    }

    selectRow(title, description, options, selected) {
        return `
            <div class="sm-setting-row">
                <div class="sm-setting-label">
                    <strong>${title}</strong>
                    <span>${description}</span>
                </div>

                <select class="sm-select">
                    ${options.map(option => `
                        <option ${option === selected ? "selected" : ""}>
                            ${option}
                        </option>
                    `).join("")}
                </select>
            </div>
        `;
    }

    fieldRow(title, description, value) {
        return `
            <div class="sm-setting-row">
                <div class="sm-setting-label">
                    <strong>${title}</strong>
                    <span>${description}</span>
                </div>

                <input class="sm-field" value="${value || ""}" />
            </div>
        `;
    }
}