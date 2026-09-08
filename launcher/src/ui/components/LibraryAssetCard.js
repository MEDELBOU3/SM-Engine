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

export class LibraryAssetCard {
    static render(
        asset,
        projects = []
    ) {
        const author =
            asset?.author?.username ||
            "Unknown author";

        const license =
            asset?.license?.name ||
            asset?.license?.key ||
            "Unknown license";

        const projectOptions =
            projects
                .map(
                    project => `
                        <option value="${escapeHTML(project.id)}">
                            ${escapeHTML(project.name)}
                        </option>
                    `
                )
                .join("");

        return `
            <article class="sm-market-card sm-library-card">
                <div class="sm-market-card-top">
                    <span class="sm-market-badge">
                        BlendSwap
                    </span>

                    <span class="sm-market-license">
                        ${escapeHTML(license)}
                    </span>
                </div>

                <h3 class="sm-market-title">
                    ${escapeHTML(
                        asset?.title ||
                        "Untitled"
                    )}
                </h3>

                <p class="sm-market-description">
                    ${escapeHTML(
                        asset?.description ||
                        "Installed BlendSwap asset."
                    )}
                </p>

                <div class="sm-market-meta">
                    <span>
                        by ${escapeHTML(author)}
                    </span>

                    <span>
                        ${
                            asset?.primaryBlendPath
                                ? "Blender source ready"
                                : "Downloaded"
                        }
                    </span>
                </div>

                <div class="sm-library-project-row">
                    <select
                        class="sm-market-select"
                        data-library-project="${Number(
                            asset?.assetId ||
                            0
                        )}"
                        ${
                            projects.length
                                ? ""
                                : "disabled"
                        }
                    >
                        ${
                            projects.length
                                ? projectOptions
                                : `
                                    <option>
                                        No projects available
                                    </option>
                                `
                        }
                    </select>

                    <button
                        class="sm-button sm-button-primary"
                        type="button"
                        data-library-add-project="${Number(
                            asset?.assetId ||
                            0
                        )}"
                        ${
                            projects.length
                                ? ""
                                : "disabled"
                        }
                    >
                        Add to Project
                    </button>
                </div>

                <div class="sm-market-actions">
                    ${
                        asset?.sourceUrl
                            ? `
                                <button
                                    class="sm-button"
                                    type="button"
                                    data-library-open-url="${escapeHTML(
                                        asset.sourceUrl
                                    )}"
                                >
                                    BlendSwap Page
                                </button>
                            `
                            : ""
                    }

                    <button
                        class="sm-button sm-button-danger"
                        type="button"
                        data-library-remove="${Number(
                            asset?.assetId ||
                            0
                        )}"
                    >
                        Remove
                    </button>
                </div>
            </article>
        `;
    }
}
