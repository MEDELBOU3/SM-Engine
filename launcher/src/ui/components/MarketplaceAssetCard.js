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

function formatBytes(bytes) {
    const value =
        Number(
            bytes ||
            0
        );

    if (
        !Number.isFinite(value) ||
        value <= 0
    ) {
        return "Unknown size";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB"
    ];

    let size =
        value;

    let unit =
        0;

    while (
        size >= 1024 &&
        unit <
            units.length - 1
    ) {
        size /= 1024;
        unit += 1;
    }

    return `${
        size.toFixed(
            unit === 0
                ? 0
                : 1
        )
    } ${units[unit]}`;
}

function readTag(tag) {
    if (
        typeof tag ===
        "string"
    ) {
        return tag;
    }

    return (
        tag?.name ||
        tag?.slug ||
        ""
    );
}

function getInitials(
    title
) {
    const words =
        String(
            title ||
            "3D"
        )
            .trim()
            .split(/\s+/)
            .filter(Boolean);

    if (!words.length) {
        return "3D";
    }

    if (
        words.length ===
        1
    ) {
        return words[0]
            .slice(0, 2)
            .toUpperCase();
    }

    return (
        words[0][0] +
        words[1][0]
    ).toUpperCase();
}

export class MarketplaceAssetCard {
    static render(
        asset,
        options = {}
    ) {
        const installed =
            options.installed ===
            true;

        const progress =
            options.progress ||
            null;

        const license =
            asset?.license?.name ||
            asset?.license?.key ||
            "Unknown license";

        const author =
            asset?.author?.username ||
            "Unknown author";

        const category =
            asset?.category?.name ||
            "3D Asset";

        const version =
            Array.isArray(
                asset?.blender_versions
            )
                ? asset
                    .blender_versions
                    .join(", ")
                : "";

        const tags =
            Array.isArray(
                asset?.tags
            )
                ? asset.tags
                    .map(readTag)
                    .filter(Boolean)
                    .slice(0, 5)
                : [];

        const assetId =
            Number(
                asset?.id ||
                0
            );

        const title =
            asset?.title ||
            "Untitled";

        const initials =
            getInitials(
                title
            );

        let buttonText =
            "Add to Library";

        let disabled =
            false;

        if (installed) {
            buttonText =
                "In Library";

            disabled =
                true;
        } else if (progress) {
            const phase =
                progress.phase ||
                "downloading";

            if (
                phase ===
                "downloading"
            ) {
                buttonText =
                    progress.percentage ==
                    null
                        ? "Downloading..."
                        : `Downloading ${progress.percentage}%`;
            } else if (
                phase ===
                "extracting"
            ) {
                buttonText =
                    "Extracting...";
            } else {
                buttonText =
                    "Processing...";
            }

            disabled =
                true;
        }

        return `
            <article class="sm-market-card">
                <div
                    class="sm-market-thumbnail"
                    data-preview-shell="${assetId}"
                >
                    <div class="sm-market-thumbnail-placeholder">
                        <span class="sm-market-thumbnail-orb sm-market-thumbnail-orb-a"></span>
                        <span class="sm-market-thumbnail-orb sm-market-thumbnail-orb-b"></span>

                        <span class="sm-market-thumbnail-grid"></span>

                        <div class="sm-market-thumbnail-center">
                            <span class="sm-market-thumbnail-mark">
                                ${escapeHTML(initials)}
                            </span>

                            <span class="sm-market-thumbnail-category">
                                ${escapeHTML(category)}
                            </span>
                        </div>

                        <span class="sm-market-thumbnail-status">
                            3D PREVIEW
                        </span>
                    </div>

                    <img
                        class="sm-market-thumbnail-image"
                        data-market-preview="${assetId}"
                        alt="${escapeHTML(
                            `${title} preview`
                        )}"
                        loading="lazy"
                        decoding="async"
                    />
                </div>

                <div class="sm-market-card-top">
                    <span class="sm-market-badge">
                        ${escapeHTML(category)}
                    </span>

                    <span class="sm-market-license">
                        ${escapeHTML(license)}
                    </span>
                </div>

                <h3 class="sm-market-title">
                    ${escapeHTML(title)}
                </h3>

                <p class="sm-market-description">
                    ${escapeHTML(
                        asset?.description ||
                        "BlendSwap Blender asset."
                    )}
                </p>

                <div class="sm-market-meta">
                    <span>
                        by ${escapeHTML(author)}
                    </span>

                    <span>
                        ${escapeHTML(
                            formatBytes(
                                asset?.size_bytes
                            )
                        )}
                    </span>

                    ${
                        version
                            ? `
                                <span>
                                    Blender ${escapeHTML(version)}
                                </span>
                            `
                            : ""
                    }
                </div>

                ${
                    tags.length
                        ? `
                            <div class="sm-market-tags">
                                ${tags
                                    .map(
                                        tag =>
                                            `<span>${escapeHTML(tag)}</span>`
                                    )
                                    .join("")}
                            </div>
                        `
                        : ""
                }

                <div class="sm-market-actions">
                    <button
                        class="sm-button sm-button-primary"
                        type="button"
                        data-market-add="${assetId}"
                        ${
                            disabled
                                ? "disabled"
                                : ""
                        }
                    >
                        ${buttonText}
                    </button>

                    ${
                        asset?.url
                            ? `
                                <button
                                    class="sm-button"
                                    type="button"
                                    data-market-open-url="${escapeHTML(asset.url)}"
                                >
                                    Details
                                </button>
                            `
                            : ""
                    }
                </div>
            </article>
        `;
    }
}
