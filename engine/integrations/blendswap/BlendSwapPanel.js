(function (global) {
    'use strict';

    function bytes(value) {
        const n = Number(value || 0);
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
        return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function shortText(value, max = 210) {
        const text = String(value || '')
            .replace(/\s+/g, ' ')
            .trim();

        return text.length > max
            ? `${text.slice(0, max - 1)}…`
            : text;
    }

    class BlendSwapPanel {
        constructor(options = {}) {
            this.client =
                options.client ||
                global.smBlendSwapClient;

            this.importer =
                options.importer ||
                global.smBlendSwapAssetImporter;

            this.root = null;
            this.results = [];
            this.pagination = null;
            this.query = 'forest';
            this.page = 1;
            this.busy = false;
            this.progressOff = null;
            this.importingAssetId = null;
        }

        _status(message, tone = '') {
            const el =
                this.root?.querySelector('[data-bs-status]');

            if (!el) return;

            el.textContent = String(message || '');
            el.dataset.tone = tone;
        }

        _busy(value) {
            this.busy = !!value;
            this.root?.classList.toggle('is-busy', this.busy);
        }

        async _ensureKey() {
            const status =
                await this.client?.keyStatus?.();

            const keyBox =
                this.root?.querySelector('[data-bs-key-box]');

            const configured =
                !!status?.configured;

            if (keyBox) {
                keyBox.hidden = configured;
            }

            const source =
                this.root?.querySelector('[data-bs-key-source]');

            if (source) {
                source.textContent =
                    configured
                        ? `API key: configured (${status.source || 'secure'})`
                        : 'API key: not configured';
            }

            return configured;
        }

        _settings() {
            const license =
                this.root
                    ?.querySelector('[data-bs-license]')
                    ?.value ||
                'cc0';

            const scenesOnly =
                !!this.root
                    ?.querySelector('[data-bs-scenes-only]')
                    ?.checked;

            const addToScene =
                !!this.root
                    ?.querySelector('[data-bs-add-scene]')
                    ?.checked;

            return {
                license,
                scenesOnly,
                addToScene
            };
        }

        async search(page = 1) {
            if (this.busy) return;

            const configured =
                await this._ensureKey();

            if (!configured) {
                this._status(
                    'Set your BlendSwap API key first.',
                    'warn'
                );
                return;
            }

            const input =
                this.root?.querySelector('[data-bs-search]');

            const q =
                String(
                    input?.value ||
                    this.query ||
                    ''
                ).trim();

            if (!q) return;

            this.query = q;
            this.page = page;

            const settings =
                this._settings();

            this._busy(true);
            this._status(`Searching BlendSwap for "${q}"…`);

            try {
                const result =
                    await this.client.search(
                        q,
                        {
                            page,
                            license: settings.license,
                            format: 'blender',
                            scenesOnly: settings.scenesOnly
                        }
                    );

                this.results = result.assets || [];
                this.pagination = result.pagination || null;
                this._renderResults();

                const total =
                    this.pagination?.count ??
                    this.results.length;

                this._status(
                    `${this.results.length} result(s) shown · catalog count ${total}.`,
                    'ok'
                );
            } catch (error) {
                console.error('[SM BlendSwap Panel]', error);
                this.results = [];
                this._renderResults();

                this._status(
                    error.message,
                    'error'
                );
            } finally {
                this._busy(false);
            }
        }

        _renderResults() {
            const host =
                this.root?.querySelector('[data-bs-results]');

            if (!host) return;

            if (!this.results.length) {
                host.innerHTML = `
                    <div class="sm-bs-empty">
                        No matching assets. Disable “Complete scenes only”
                        or try another query.
                    </div>
                `;
            } else {
                host.innerHTML = this.results
                    .map((asset) => this._card(asset))
                    .join('');
            }

            const pager =
                this.root?.querySelector('[data-bs-pagination]');

            if (pager) {
                const page = Number(
                    this.pagination?.page ||
                    this.page ||
                    1
                );

                const pages = Number(
                    this.pagination?.pages ||
                    1
                );

                pager.innerHTML = `
                    <button
                        type="button"
                        data-bs-page="${Math.max(1, page - 1)}"
                        ${page <= 1 ? 'disabled' : ''}
                    >‹</button>

                    <span>Page ${page} / ${pages}</span>

                    <button
                        type="button"
                        data-bs-page="${Math.min(pages, page + 1)}"
                        ${page >= pages ? 'disabled' : ''}
                    >›</button>
                `;
            }
        }

        _card(asset) {
            const license =
                global.SMBlendSwapLicense
                    ?.describe?.(asset) ||
                {
                    label:
                        asset.license?.name ||
                        asset.license?.key ||
                        'Unknown'
                };

            const file =
                asset.primaryFile ||
                {};

            const versions =
                asset.blenderVersions?.join(', ') ||
                file.software_version ||
                'unknown';

            const engine =
                file.render_engine_label ||
                file.render_engine ||
                'unknown';

            const tags =
                (asset.tags || [])
                    .slice(0, 6)
                    .map(
                        (tag) =>
                            `<span>${escapeHTML(tag)}</span>`
                    )
                    .join('');

            return `
                <article
                    class="sm-bs-card"
                    data-bs-asset-id="${asset.id}"
                >
                    <div class="sm-bs-card-top">
                        <div class="sm-bs-category">
                            ${escapeHTML(
                                asset.category?.name ||
                                asset.assetTypeLabel ||
                                '3D Asset'
                            )}
                        </div>

                        <div class="sm-bs-license">
                            ${escapeHTML(license.label)}
                        </div>
                    </div>

                    <h3>${escapeHTML(asset.title)}</h3>

                    <div class="sm-bs-author">
                        by
                        <b>
                            ${escapeHTML(
                                asset.author?.username ||
                                'unknown'
                            )}
                        </b>
                        ·
                        ${bytes(asset.sizeBytes)}
                    </div>

                    <p>
                        ${escapeHTML(
                            shortText(asset.description)
                        )}
                    </p>

                    <div class="sm-bs-meta">
                        <span>Blender ${escapeHTML(versions)}</span>
                        <span>${escapeHTML(engine)}</span>
                        <span>${Number(asset.counts?.downloads || 0).toLocaleString()} downloads</span>
                    </div>

                    <div class="sm-bs-tags">
                        ${tags}
                    </div>

                    <div class="sm-bs-card-actions">
                        <button
                            type="button"
                            class="secondary"
                            data-bs-view="${asset.id}"
                        >
                            View source
                        </button>

                        <button
                            type="button"
                            class="primary"
                            data-bs-import="${asset.id}"
                        >
                            Import Scene
                        </button>
                    </div>

                    <div
                        class="sm-bs-card-progress"
                        data-bs-card-progress="${asset.id}"
                    >
                        <i></i>
                    </div>
                </article>
            `;
        }

        _assetById(id) {
            const numeric = Number(id);

            return (
                this.results.find(
                    (asset) =>
                        Number(asset.id) === numeric
                ) ||
                null
            );
        }

        async importAsset(asset) {
            if (!asset || this.busy) return;

            this._busy(true);
            this.importingAssetId = asset.id;

            this._status(
                `Downloading "${asset.title}"…`
            );

            try {
                const result =
                    await this.importer.importAsset(
                        asset,
                        {
                            addToScene:
                                this._settings().addToScene,
                            registerAsset: true,
                            client: this.client
                        }
                    );

                const record = result.assetRecord;

                this._status(
                    record
                        ? `"${asset.title}" imported into AssetsPanel${result.sceneImport ? ' and viewport' : ''}.`
                        : `"${asset.title}" imported.`,
                    'ok'
                );
            } catch (error) {
                console.error('[SM BlendSwap Import]', error);

                this._status(
                    error.message,
                    'error'
                );
            } finally {
                this.importingAssetId = null;
                this._busy(false);
            }
        }

        _installProgress() {
            this.progressOff?.();

            this.progressOff =
                this.client?.onDownloadProgress?.(
                    (detail) => {
                        const id = Number(detail?.assetId);
                        const percent = Number(detail?.percent);

                        const bar =
                            this.root?.querySelector(
                                `[data-bs-card-progress="${id}"] i`
                            );

                        if (
                            bar &&
                            Number.isFinite(percent)
                        ) {
                            bar.style.width =
                                `${Math.max(
                                    0,
                                    Math.min(100, percent)
                                )}%`;
                        }

                        if (
                            this.importingAssetId === id &&
                            Number.isFinite(percent)
                        ) {
                            this._status(
                                `Downloading… ${percent.toFixed(1)}%`
                            );
                        }
                    }
                );
        }

        _bind() {
            this.root
                .querySelector('[data-bs-close]')
                .addEventListener(
                    'click',
                    () => this.close()
                );

            const input =
                this.root.querySelector('[data-bs-search]');

            input.addEventListener(
                'keydown',
                (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        this.search(1);
                    }
                }
            );

            this.root
                .querySelector('[data-bs-search-btn]')
                .addEventListener(
                    'click',
                    () => this.search(1)
                );

            this.root
                .querySelector('[data-bs-save-key]')
                .addEventListener(
                    'click',
                    async () => {
                        const keyInput =
                            this.root.querySelector('[data-bs-key]');

                        const key =
                            String(
                                keyInput?.value ||
                                ''
                            ).trim();

                        if (!key) return;

                        try {
                            await this.client.setApiKey(key);

                            keyInput.value = '';

                            await this._ensureKey();

                            this._status(
                                'BlendSwap API key stored securely.',
                                'ok'
                            );
                        } catch (error) {
                            this._status(
                                error.message,
                                'error'
                            );
                        }
                    }
                );

            this.root.addEventListener(
                'click',
                (event) => {
                    const chip =
                        event.target.closest('[data-bs-chip]');

                    if (chip) {
                        input.value = chip.dataset.bsChip;
                        this.search(1);
                        return;
                    }

                    const page =
                        event.target.closest('[data-bs-page]');

                    if (page && !page.disabled) {
                        this.search(
                            Number(page.dataset.bsPage)
                        );
                        return;
                    }

                    const view =
                        event.target.closest('[data-bs-view]');

                    if (view) {
                        const asset =
                            this._assetById(
                                view.dataset.bsView
                            );

                        if (asset?.url) {
                            global.open(
                                asset.url,
                                '_blank',
                                'noopener'
                            );
                        }

                        return;
                    }

                    const importButton =
                        event.target.closest('[data-bs-import]');

                    if (importButton) {
                        const asset =
                            this._assetById(
                                importButton.dataset.bsImport
                            );

                        this.importAsset(asset);
                    }
                }
            );

            this._installProgress();
        }

        _markup() {
            return `
                <div class="sm-bs-window">
                    <header class="sm-bs-header">
                        <div>
                            <span class="sm-bs-kicker">SM ENGINE · ONLINE ASSETS</span>
                            <h2>BlendSwap Browser</h2>
                            <p>
                                Search Blender assets, preserve the license,
                                download to disk and import through SM BlenderImporter.
                            </p>
                        </div>

                        <button
                            type="button"
                            class="sm-bs-close"
                            data-bs-close
                        >×</button>
                    </header>

                    <section
                        class="sm-bs-key-box"
                        data-bs-key-box
                    >
                        <div>
                            <b>Connect BlendSwap API</b>
                            <span>
                                The key goes directly to Electron main and is encrypted with safeStorage.
                            </span>
                        </div>

                        <input
                            type="password"
                            autocomplete="off"
                            data-bs-key
                            placeholder="bsk_live_…"
                        />

                        <button
                            type="button"
                            data-bs-save-key
                        >
                            Save key
                        </button>
                    </section>

                    <div class="sm-bs-key-source" data-bs-key-source></div>

                    <section class="sm-bs-searchbar">
                        <input
                            data-bs-search
                            value="forest"
                            placeholder="Search BlendSwap…"
                            autocomplete="off"
                        />

                        <select data-bs-license>
                            <option value="cc0" selected>CC0</option>
                            <option value="cc-by">CC BY</option>
                            <option value="cc-by-sa">CC BY-SA</option>
                            <option value="">Any license</option>
                        </select>

                        <button
                            type="button"
                            class="primary"
                            data-bs-search-btn
                        >
                            Search
                        </button>
                    </section>

                    <div class="sm-bs-chips">
                        <button data-bs-chip="forest">Forest</button>
                        <button data-bs-chip="environment">Environment</button>
                        <button data-bs-chip="landscape">Landscape</button>
                        <button data-bs-chip="interior">Interior</button>
                        <button data-bs-chip="city scene">City</button>
                        <button data-bs-chip="castle scene">Castle</button>
                    </div>

                    <section class="sm-bs-options">
                        <label>
                            <input
                                type="checkbox"
                                data-bs-scenes-only
                                checked
                            />
                            Complete scenes only
                        </label>

                        <label>
                            <input
                                type="checkbox"
                                data-bs-add-scene
                                checked
                            />
                            Add to viewport after import
                        </label>
                    </section>

                    <div
                        class="sm-bs-results"
                        data-bs-results
                    >
                        <div class="sm-bs-empty">
                            Search for a Blender environment.
                        </div>
                    </div>

                    <footer class="sm-bs-footer">
                        <div data-bs-status>
                            Ready.
                        </div>

                        <div
                            class="sm-bs-pagination"
                            data-bs-pagination
                        ></div>
                    </footer>
                </div>
            `;
        }

        async open() {
            if (this.root?.isConnected) {
                this.root.hidden = false;
                this.root.classList.add('is-open');
                await this._ensureKey();
                return this;
            }

            const overlay = document.createElement('div');
            overlay.className = 'sm-bs-overlay';
            overlay.innerHTML = this._markup();

            document.body.appendChild(overlay);

            this.root = overlay;
            this._bind();

            requestAnimationFrame(
                () => overlay.classList.add('is-open')
            );

            await this._ensureKey();

            return this;
        }

        close() {
            if (!this.root) return;

            this.root.classList.remove('is-open');

            setTimeout(
                () => {
                    if (this.root) {
                        this.root.hidden = true;
                    }
                },
                160
            );
        }
    }

    global.SMBlendSwapPanel = BlendSwapPanel;

    global.openSMBlendSwap =
        async function openSMBlendSwap(options = {}) {
            global.smBlendSwapPanel =
                global.smBlendSwapPanel ||
                new BlendSwapPanel(options);

            return global.smBlendSwapPanel.open();
        };
})(typeof window !== 'undefined' ? window : globalThis);
