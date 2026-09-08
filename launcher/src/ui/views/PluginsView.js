export class PluginsView {
    constructor(app) {
        this.app = app;
    }

    render() {
        const plugins = this.app?.state?.plugins || [];

        return `
            <div class="sm-page">
                <div class="sm-page-head">
                    <div>
                        <h1 class="sm-page-title">Plugins</h1>
                        <p class="sm-page-subtitle">
                            Manage installed engine extensions and plugin packages.
                        </p>
                    </div>
                </div>

                <div class="sm-grid sm-grid-3">
                    ${plugins.map(plugin => this.card(plugin)).join("")}
                </div>
            </div>
        `;
    }

    card(plugin = {}) {
        const enabled = plugin.status === "Enabled";

        return `
            <article class="sm-card sm-plugin-card">
                <div class="sm-card-title-row">
                    <div>
                        <h3 class="sm-card-title">${plugin.name || "Plugin"}</h3>
                        <div class="sm-card-meta">
                            v${plugin.version || "0.0.0"}${plugin.builtIn ? " · Built-in" : ""}
                        </div>
                    </div>

                    <span class="sm-tag ${enabled ? "sm-tag-success" : ""}">
                        ${plugin.status || "Disabled"}
                    </span>
                </div>

                <div class="sm-card-actions">
                    <button
                        class="sm-btn"
                        data-action="toggle-plugin"
                        data-plugin-id="${plugin.id || ""}"
                        type="button"
                    >
                        ${enabled ? "Disable" : "Enable"}
                    </button>

                    <button class="sm-btn sm-btn-ghost" type="button">
                        Details
                    </button>
                </div>
            </article>
        `;
    }
}