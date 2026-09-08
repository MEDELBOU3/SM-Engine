export class TopBar {
    static render(root, options = {}) {
        if (!root) return;

        const route = options.route || "engines";
        const engine = options.engine || {};
        const engines = options.engines || [];
        const currentEngine = engines.find(e => e.current) || engines[0] || { version: '1.0.1', isInstalled: true };
        const isInstalled = currentEngine.isInstalled !== false;

        const tabs = [
            { id: "home", label: "News" },
            { id: "templates", label: "Samples" },
            { id: "engines", label: "Library" },
            { id: "plugins", label: "SM Vault" },
            { id: "analytics", label: "Analytics" },
            { id: "diagnostics", label: "Diagnostics" }
        ];

        root.innerHTML = `
            <div class="sm-epic-tabs">
                ${tabs.map(t => `
                    <button
                        class="sm-epic-tab ${route === t.id ? 'is-active' : ''}"
                        data-route="${t.id}"
                        type="button"
                    >
                        ${t.label}
                        ${t.id === 'engines' ? '<span class="sm-tab-dot"></span>' : ''}
                    </button>
                `).join('')}
            </div>

            <div class="sm-topbar-right">
                <div class="sm-quick-launch-widget">
                    <button class="sm-epic-quick-btn ${isInstalled ? 'is-installed' : 'not-installed'}" data-action="${isInstalled ? 'launch-engine' : 'install-engine'}" data-version="${currentEngine.version}" type="button">
                        <div class="sm-quick-btn-copy">
                            <span class="sm-quick-status">${isInstalled ? 'Installed' : 'Not Installed'}</span>
                            <strong class="sm-quick-name">SM Engine ${currentEngine.version || '1.0.1'}</strong>
                        </div>
                        <span class="sm-quick-btn-icon">${isInstalled ? '▶' : '▼'}</span>
                    </button>
                </div>
            </div>
        `;
    }
}