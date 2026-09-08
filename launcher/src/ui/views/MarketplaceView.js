import {
    MarketplaceAssetCard
} from "../components/MarketplaceAssetCard.js";

import {
    BlendSwapService
} from "../../services/BlendSwapService.js";

function escapeHTML(value) {
    return String(
        value ??
        ""
    )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function ensureMarketplaceStyles() {
    const id =
        "sm-marketplace-styles";

    if (
        document.getElementById(
            id
        )
    ) {
        return;
    }

    const link =
        document.createElement(
            "link"
        );

    link.id =
        id;

    link.rel =
        "stylesheet";

    link.href =
        "./css/marketplace.css";

    document.head.appendChild(
        link
    );
}

export class MarketplaceView {
    constructor(app) {
        this.app = app;

        this.manager =
            app.marketplaceManager;
    }

    render() {
        ensureMarketplaceStyles();

        const library =
            this.app
                .assetLibraryManager;

        const cards =
            this.manager.assets
                .map(
                    asset =>
                        MarketplaceAssetCard
                            .render(
                                asset,
                                {
                                    installed:
                                        library
                                            .isInstalled(
                                                asset.id
                                            ),

                                    progress:
                                        library
                                            .getProgress(
                                                asset.id
                                            )
                                }
                            )
                )
                .join("");

        const currentPage =
            Number(
                this.manager
                    .pagination
                    ?.page ||
                this.manager.page ||
                1
            );

        const pages =
            Number(
                this.manager
                    .pagination
                    ?.pages ||
                1
            );

        return `
            <section class="sm-marketplace-view">
                <div class="sm-view-heading">
                    <div>
                        <span class="sm-eyebrow">
                            SM Marketplace
                        </span>

                        <h1>
                            BlendSwap Assets
                        </h1>

                        <p>
                            Search Blender assets, download them once to your global SM Library,
                            then add them to any SM Engine project.
                        </p>
                    </div>

                    <button
                        class="sm-button"
                        type="button"
                        data-route="library"
                    >
                        Open My Library
                    </button>
                </div>

                <form
                    id="sm-market-search-form"
                    class="sm-market-toolbar"
                >
                    <input
                        id="sm-market-search"
                        class="sm-market-search"
                        type="search"
                        value="${escapeHTML(
                            this.manager.query
                        )}"
                        placeholder="Search BlendSwap assets..."
                        autocomplete="off"
                    />

                    <select
                        id="sm-market-license"
                        class="sm-market-select"
                    >
                        <option
                            value="cc0"
                            ${
                                this.manager.license ===
                                "cc0"
                                    ? "selected"
                                    : ""
                            }
                        >
                            CC0
                        </option>

                        <option
                            value="cc-by"
                            ${
                                this.manager.license ===
                                "cc-by"
                                    ? "selected"
                                    : ""
                            }
                        >
                            CC BY
                        </option>

                        <option
                            value=""
                            ${
                                this.manager.license ===
                                ""
                                    ? "selected"
                                    : ""
                            }
                        >
                            All licenses
                        </option>
                    </select>

                    <button
                        class="sm-button sm-button-primary"
                        type="submit"
                    >
                        Search
                    </button>
                </form>

                ${
                    this.manager.loading
                        ? `
                            <div class="sm-market-status">
                                Loading BlendSwap assets...
                            </div>
                        `
                        : ""
                }

                ${
                    this.manager.error
                        ? `
                            <div class="sm-market-error">
                                ${escapeHTML(
                                    this.manager.error
                                )}
                            </div>
                        `
                        : ""
                }

                <div class="sm-market-grid">
                    ${
                        cards ||
                        (
                            this.manager.hasLoaded &&
                            !this.manager.loading
                                ? `
                                    <div class="sm-market-empty">
                                        No BlendSwap assets found.
                                    </div>
                                `
                                : ""
                        )
                    }
                </div>

                ${
                    this.manager.hasLoaded &&
                    !this.manager.loading &&
                    pages > 1
                        ? `
                            <div class="sm-market-pagination">
                                <button
                                    id="sm-market-prev"
                                    class="sm-button"
                                    type="button"
                                    ${
                                        currentPage <= 1
                                            ? "disabled"
                                            : ""
                                    }
                                >
                                    Previous
                                </button>

                                <span>
                                    Page ${currentPage} of ${pages}
                                </span>

                                <button
                                    id="sm-market-next"
                                    class="sm-button"
                                    type="button"
                                    ${
                                        currentPage >= pages
                                            ? "disabled"
                                            : ""
                                    }
                                >
                                    Next
                                </button>
                            </div>
                        `
                        : ""
                }
            </section>
        `;
    }

    async loadPreview(
        image
    ) {
        const assetId =
            Number(
                image?.dataset
                    ?.marketPreview ||
                0
            );

        if (!assetId) {
            return;
        }

        const shell =
            image.closest(
                ".sm-market-thumbnail"
            );

        if (!shell) {
            return;
        }

        if (
            shell.dataset
                .previewState ===
            "loaded"
        ) {
            return;
        }

        shell.dataset
            .previewState =
            "loading";

        shell.classList.add(
            "is-loading"
        );

        try {
            const result =
                await BlendSwapService
                    .getPreview(
                        assetId
                    );

            if (
                !result?.ok ||
                !result?.dataURL
            ) {
                throw new Error(
                    result?.error ||
                    "Preview unavailable."
                );
            }

            await new Promise(
                (
                    resolve,
                    reject
                ) => {
                    image.onload =
                        () =>
                            resolve();

                    image.onerror =
                        () =>
                            reject(
                                new Error(
                                    "Preview image could not be decoded."
                                )
                            );

                    image.src =
                        result.dataURL;
                }
            );

            shell.dataset
                .previewState =
                "loaded";

            shell.classList
                .remove(
                    "is-loading",
                    "is-missing"
                );

            shell.classList.add(
                "has-image"
            );
        } catch (_) {
            shell.dataset
                .previewState =
                "missing";

            shell.classList
                .remove(
                    "is-loading",
                    "has-image"
                );

            shell.classList.add(
                "is-missing"
            );
        }
    }


    setupPreviewLoading() {
        const images = [
            ...document.querySelectorAll(
                "[data-market-preview]"
            )
        ];

        if (!images.length) {
            return;
        }

        if (
            !(
                "IntersectionObserver"
                in window
            )
        ) {
            images.forEach(
                image =>
                    this.loadPreview(
                        image
                    )
            );

            return;
        }

        const observer =
            new IntersectionObserver(
                entries => {
                    for (
                        const entry
                        of entries
                    ) {
                        if (
                            !entry.isIntersecting
                        ) {
                            continue;
                        }

                        observer.unobserve(
                            entry.target
                        );

                        this.loadPreview(
                            entry.target
                        );
                    }
                },
                {
                    rootMargin:
                        "260px 0px"
                }
            );

        images.forEach(
            image =>
                observer.observe(
                    image
                )
        );
    }


    bind() {
        ensureMarketplaceStyles();

        this.setupPreviewLoading();

        const form =
            document.getElementById(
                "sm-market-search-form"
            );

        form?.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const query =
                    document
                        .getElementById(
                            "sm-market-search"
                        )
                        ?.value ||
                    "";

                const license =
                    document
                        .getElementById(
                            "sm-market-license"
                        )
                        ?.value ??
                    "cc0";

                await this.manager
                    .search({
                        q:
                            query,

                        license,

                        page:
                            1
                    });

                this.app
                    .router
                    .refresh();
            }
        );

        document
            .querySelectorAll(
                "[data-market-add]"
            )
            .forEach(
                button => {
                    button.addEventListener(
                        "click",
                        async () => {
                            const assetId =
                                Number(
                                    button
                                        .dataset
                                        .marketAdd
                                );

                            const asset =
                                this.manager
                                    .getAsset(
                                        assetId
                                    );

                            if (!asset) {
                                return;
                            }

                            button.disabled =
                                true;

                            button.textContent =
                                "Starting...";

                            try {
                                await this.app
                                    .assetLibraryManager
                                    .add(
                                        asset
                                    );

                                this.app.notify(
                                    "Added to Library",
                                    asset.title
                                );

                                this.app
                                    .router
                                    .refresh();
                            } catch (error) {
                                button.disabled =
                                    false;

                                button.textContent =
                                    "Add to Library";

                                this.app.notify(
                                    "Library download failed",
                                    error?.message ||
                                    String(error)
                                );
                            }
                        }
                    );
                }
            );

        document
            .querySelectorAll(
                "[data-market-open-url]"
            )
            .forEach(
                button => {
                    button.addEventListener(
                        "click",
                        () => {
                            const url =
                                button
                                    .dataset
                                    .marketOpenUrl;

                            if (url) {
                                window
                                    .launcherAPI
                                    ?.openPath?.(
                                        url
                                    );
                            }
                        }
                    );
                }
            );

        document
            .getElementById(
                "sm-market-prev"
            )
            ?.addEventListener(
                "click",
                async () => {
                    await this.manager
                        .previousPage();

                    this.app
                        .router
                        .refresh();
                }
            );

        document
            .getElementById(
                "sm-market-next"
            )
            ?.addEventListener(
                "click",
                async () => {
                    await this.manager
                        .nextPage();

                    this.app
                        .router
                        .refresh();
                }
            );

        if (
            !this.manager
                .hasLoaded &&
            !this.manager
                .loading
        ) {
            this.manager
                .search()
                .then(
                    () =>
                        this.app
                            .router
                            .refresh()
                );
        }

        if (
            !this.app
                .assetLibraryManager
                .hasLoaded &&
            !this.app
                .assetLibraryManager
                .loading
        ) {
            this.app
                .assetLibraryManager
                .load()
                .then(
                    () =>
                        this.app
                            .router
                            .refresh()
                );
        }
    }
}
