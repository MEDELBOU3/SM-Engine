export class EngineCard {
    static render(engine = {}) {
        const isInstalled = engine.isInstalled !== false;
        const isDownloading = engine.status === 'Downloading';
        const progress = engine.downloadProgress || 0;
        const speed = engine.downloadSpeed || '';
        const transferred = engine.downloadTransferred || '';
        const total = engine.downloadTotal || '';
        const version = engine.version || '1.0.1';

        return `
            <div class="sm-epic-engine-card ${isInstalled ? 'is-installed' : 'not-installed'} ${isDownloading ? 'is-downloading' : ''}" data-version="${version}">
                <div class="sm-epic-card-backdrop"></div>
                <div class="sm-epic-card-glow"></div>

                <div class="sm-epic-card-inner">
                    <div class="sm-epic-logo-circle">
                        <img class="sm-epic-engine-emblem-img" src="./assets/icons/logo.png" alt="SM Engine Logo" />
                    </div>

                    <div class="sm-epic-card-body">
                        <div class="sm-epic-version-title">${version}</div>

                        ${isDownloading ? `
                            <div class="sm-epic-download-status">
                                <div class="sm-download-meta">
                                    <span>Downloading... ${progress}%</span>
                                    <span>${speed}</span>
                                </div>
                                <div class="sm-progress-bar-wrap">
                                    <div class="sm-progress-fill" style="width: ${progress}%"></div>
                                </div>
                                <div class="sm-download-sub">
                                    <span>${transferred} / ${total}</span>
                                    <button class="sm-btn-link" data-action="cancel-download" data-version="${version}" type="button">Cancel</button>
                                </div>
                            </div>
                        ` : `
                            <div class="sm-epic-action-group">
                                ${isInstalled ? `
                                    <button class="sm-epic-btn-main sm-btn-launch" data-action="launch-engine" data-version="${version}" data-path="${engine.path || ''}" type="button">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                        Launch
                                    </button>
                                ` : `
                                    <button class="sm-epic-btn-main sm-btn-install" data-action="install-engine" data-version="${version}" data-url="${engine.downloadUrl || ''}" type="button">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                        Install
                                    </button>
                                `}

                                <button class="sm-epic-btn-dropdown" data-action="toggle-engine-menu" data-version="${version}" type="button" title="Options">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                                </button>
                            </div>
                        `}
                    </div>
                </div>

                <div class="sm-epic-menu-dropdown sm-hidden" id="engine-menu-${version.replace(/\./g, '-')}">
                    ${isInstalled ? `
                        <button class="sm-dropdown-item" data-action="launch-engine" data-version="${version}" data-path="${engine.path || ''}">Launch SM Engine</button>
                        <button class="sm-dropdown-item" data-action="set-default-engine" data-path="${engine.path || ''}">Set as Default</button>
                        <button class="sm-dropdown-item" data-action="open-engine-dir" data-path="${engine.path || ''}">Browse Installation Files</button>
                        <hr class="sm-dropdown-divider"/>
                        <button class="sm-dropdown-item sm-item-danger" data-action="uninstall-engine" data-version="${version}">Uninstall</button>
                    ` : `
                        <button class="sm-dropdown-item" data-action="install-engine" data-version="${version}" data-url="${engine.downloadUrl || ''}">Install to Default Directory</button>
                        <button class="sm-dropdown-item" data-action="view-release-notes" data-url="${engine.htmlUrl || 'https://github.com/MEDELBOU3/SM-Engine/releases'}">View Release Notes</button>
                    `}
                </div>
            </div>
        `;
    }
}