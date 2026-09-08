import {
    LibraryAssetCard
} from "../components/LibraryAssetCard.js";

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

export class LibraryView {
    constructor(app) {
        this.app = app;

        this.manager =
            app.assetLibraryManager;
    }

    render() {
        ensureMarketplaceStyles();

        const cards =
            this.manager.assets
                .map(
                    asset =>
                        LibraryAssetCard
                            .render(
                                asset,
                                this.app
                                    .state
                                    .projects
                            )
                )
                .join("");

        return `
            <section class="sm-marketplace-view">
                <div class="sm-view-heading">
                    <div>
                        <span class="sm-eyebrow">
                            Global Asset Library
                        </span>

                        <h1>
                            My Library
                        </h1>

                        <p>
                            Assets downloaded from Marketplace are stored globally.
                            Add the same asset to different projects without downloading it again.
                        </p>
                    </div>

                    <button
                        class="sm-button sm-button-primary"
                        type="button"
                        data-route="marketplace"
                    >
                        Browse Marketplace
                    </button>
                </div>

                ${
                    this.manager.loading
                        ? `
                            <div class="sm-market-status">
                                Loading SM Asset Library...
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
                                        Your global asset library is empty.
                                        Open Marketplace and choose "Add to Library".
                                    </div>
                                `
                                : ""
                        )
                    }
                </div>
            </section>
        `;
    }

    bind() {
        ensureMarketplaceStyles();

        document
            .querySelectorAll(
                "[data-library-remove]"
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
                                        .libraryRemove
                                );

                            if (
                                !window.confirm(
                                    "Remove this asset from the global SM Library?"
                                )
                            ) {
                                return;
                            }

                            try {
                                await this.manager
                                    .remove(
                                        assetId
                                    );

                                this.app.notify(
                                    "Asset removed",
                                    "The asset was removed from the global library."
                                );

                                this.app
                                    .router
                                    .refresh();
                            } catch (error) {
                                this.app.notify(
                                    "Remove failed",
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
                "[data-library-add-project]"
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
                                        .libraryAddProject
                                );

                            const select =
                                document.querySelector(
                                    `[data-library-project="${assetId}"]`
                                );

                            const projectId =
                                select?.value;

                            if (!projectId) {
                                this.app.notify(
                                    "Project required",
                                    "Create or add a project first."
                                );

                                return;
                            }

                            button.disabled =
                                true;

                            button.textContent =
                                "Adding...";

                            try {
                                const result =
                                    await this.manager
                                        .addToProject(
                                            assetId,
                                            projectId
                                        );

                                this.app.notify(
                                    "Added to Project",
                                    `Asset copied to ${
                                        result
                                            .project
                                            ?.name ||
                                        "project"
                                    }.`
                                );

                                button.textContent =
                                    "Added";
                            } catch (error) {
                                button.disabled =
                                    false;

                                button.textContent =
                                    "Add to Project";

                                this.app.notify(
                                    "Add to project failed",
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
                "[data-library-open-url]"
            )
            .forEach(
                button => {
                    button.addEventListener(
                        "click",
                        () => {
                            const url =
                                button
                                    .dataset
                                    .libraryOpenUrl;

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

        if (
            !this.manager
                .hasLoaded &&
            !this.manager
                .loading
        ) {
            this.manager
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
