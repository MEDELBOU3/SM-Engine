import { UserProfileMenu } from './UserProfileMenu.js';

const icons = {
    store: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    marketplace: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    archive: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>`,
    library: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>`,
    engine: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    vault: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="15" y2="15"/></svg>`,
    analytics: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    downloads: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.35.4.66.7.9.3.24.68.37 1.06.37H21v4h-.1A1.7 1.7 0 0 0 19.4 15z"/></svg>`,
    profile: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
};

export class Sidebar {
    static render(root, options = {}) {
        if (!root) return;

        const activeRoute =
            options.activeRoute ||
            "engines";

        const isDownloading =
            options.isDownloading ||
            false;

        root.innerHTML = `
            <div class="sm-brand">
                <img
                    class="sm-brand-logo-img"
                    src="./assets/icons/logo.png"
                    alt="SM Engine Logo"
                />

                <div class="sm-brand-copy">
                    <strong class="sm-brand-heading">
                        SM Engine
                    </strong>

                    <span class="sm-brand-tagline">
                        Studio Hub
                    </span>
                </div>
            </div>

            <nav class="sm-nav">
                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "home"
                            ? "is-active"
                            : ""
                    }"
                    data-route="home"
                    type="button"
                >
                    <span class="sm-nav-icon">
                        ${icons.store}
                    </span>

                    <span class="sm-nav-label">
                        Store
                    </span>
                </button>

                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "marketplace"
                            ? "is-active"
                            : ""
                    }"
                    data-route="marketplace"
                    type="button"
                >
                    <span class="sm-nav-icon">
                        ${icons.marketplace}
                    </span>

                    <span class="sm-nav-label">
                        Marketplace
                    </span>
                </button>

                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "library"
                            ? "is-active"
                            : ""
                    }"
                    data-route="library"
                    type="button"
                >
                    <span class="sm-nav-icon">
                        ${icons.archive}
                    </span>

                    <span class="sm-nav-label">
                        My Library
                    </span>
                </button>

                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "projects"
                            ? "is-active"
                            : ""
                    }"
                    data-route="projects"
                    type="button"
                >
                    <span class="sm-nav-icon">
                        ${icons.library}
                    </span>

                    <span class="sm-nav-label">
                        Projects
                    </span>
                </button>

                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "engines"
                            ? "is-active"
                            : ""
                    }"
                    data-route="engines"
                    type="button"
                >
                    <span class="sm-nav-icon">
                        ${icons.engine}
                    </span>

                    <span class="sm-nav-label">
                        SM Engine
                    </span>

                    <span class="sm-epic-dot"></span>
                </button>

                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "plugins"
                            ? "is-active"
                            : ""
                    }"
                    data-route="plugins"
                    type="button"
                >
                    <span class="sm-nav-icon">
                        ${icons.vault}
                    </span>

                    <span class="sm-nav-label">
                        SM Vault
                    </span>
                </button>

                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "analytics"
                            ? "is-active"
                            : ""
                    }"
                    data-route="analytics"
                    type="button"
                >
                    <span class="sm-nav-icon">
                        ${icons.analytics}
                    </span>

                    <span class="sm-nav-label">
                        Analytics
                    </span>
                </button>
            </nav>

            <div class="sm-sidebar-footer">
                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "downloads"
                            ? "is-active"
                            : ""
                    }"
                    data-route="engines"
                    type="button"
                    title="Downloads"
                >
                    <span class="sm-nav-icon">
                        ${icons.downloads}
                    </span>

                    <span class="sm-nav-label">
                        Downloads
                    </span>

                    ${
                        isDownloading
                            ? `<span class="sm-epic-dot is-pulsing"></span>`
                            : ""
                    }
                </button>

                <button
                    class="sm-nav-item ${
                        activeRoute ===
                        "settings"
                            ? "is-active"
                            : ""
                    }"
                    data-route="settings"
                    type="button"
                    title="Settings"
                >
                    <span class="sm-nav-icon">
                        ${icons.settings}
                    </span>

                    <span class="sm-nav-label">
                        Settings
                    </span>
                </button>
            </nav>

            <div class="sm-sidebar-footer">
                ${UserProfileMenu.render(options.user)}
            </div>
        `;

        Sidebar.renderMobile(
            document.getElementById(
                "mobile-nav"
            ),
            activeRoute
        );
    }

    static renderMobile(
        root,
        activeRoute
    ) {
        if (!root) return;

        root.innerHTML = `
            <button
                class="sm-nav-item ${
                    activeRoute ===
                    "marketplace"
                        ? "is-active"
                        : ""
                }"
                data-route="marketplace"
                type="button"
                title="Marketplace"
            >
                <span class="sm-nav-icon">
                    ${icons.marketplace}
                </span>
            </button>

            <button
                class="sm-nav-item ${
                    activeRoute ===
                    "library"
                        ? "is-active"
                        : ""
                }"
                data-route="library"
                type="button"
                title="My Library"
            >
                <span class="sm-nav-icon">
                    ${icons.archive}
                </span>
            </button>

            <button
                class="sm-nav-item ${
                    activeRoute ===
                    "engines"
                        ? "is-active"
                        : ""
                }"
                data-route="engines"
                type="button"
                title="SM Engine"
            >
                <span class="sm-nav-icon">
                    ${icons.engine}
                </span>
            </button>

            <button
                class="sm-nav-item ${
                    activeRoute ===
                    "projects"
                        ? "is-active"
                        : ""
                }"
                data-route="projects"
                type="button"
                title="Projects"
            >
                <span class="sm-nav-icon">
                    ${icons.library}
                </span>
            </button>

            <button
                class="sm-nav-item ${
                    activeRoute ===
                    "analytics"
                        ? "is-active"
                        : ""
                }"
                data-route="analytics"
                type="button"
                title="Analytics"
            >
                <span class="sm-nav-icon">
                    ${icons.analytics}
                </span>
            </button>

            <button
                class="sm-nav-item ${
                    activeRoute ===
                    "settings"
                        ? "is-active"
                        : ""
                }"
                data-route="settings"
                type="button"
                title="Settings"
            >
                <span class="sm-nav-icon">
                    ${icons.settings}
                </span>
            </button>
        `;
    }

    static bind(root, app) {
        if (!root) return;
        UserProfileMenu.bind(root, app);
    }
}
