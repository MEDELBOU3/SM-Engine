// engine/logic/Managers/assets-manager/AssetsPanelPackageIcon.js
// SM Engine — PACKAGE logo for AssetsPanel.
//
// Works with your existing package bridge:
//   .smpackage / .sm-package -> asset.type = "package"
//
// Behavior:
// - If a package has a real custom thumbnail image, keep it.
// - Otherwise replace the old generic gray file/package SVG with the SM package logo.
// - The SM package logo is embedded, so it works offline.
(function () {
    'use strict';

    const INSTALL_KEY =
        '__smAssetsPanelPackageIconInstalled';

    const PACKAGE_RE =
        /\.(smpackage|sm-package)$/i;

    const PACKAGE_LOGO =
        'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20128%20128%22%3E%0A%3Cdefs%3E%0A%20%20%3ClinearGradient%20id%3D%22box%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%20%20%20%20%3Cstop%20stop-color%3D%22%23f2b45f%22%2F%3E%0A%20%20%20%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d77a2c%22%2F%3E%0A%20%20%3C%2FlinearGradient%3E%0A%20%20%3ClinearGradient%20id%3D%22lid%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%20%20%20%20%3Cstop%20stop-color%3D%22%23ffd08a%22%2F%3E%0A%20%20%20%20%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e89b48%22%2F%3E%0A%20%20%3C%2FlinearGradient%3E%0A%3C%2Fdefs%3E%0A%3Crect%20x%3D%228%22%20y%3D%228%22%20width%3D%22112%22%20height%3D%22112%22%20rx%3D%2224%22%20fill%3D%22%23171b22%22%20stroke%3D%22%23323a48%22%20stroke-width%3D%224%22%2F%3E%0A%3Cpath%20d%3D%22M28%2047%2064%2028l36%2019-36%2020z%22%20fill%3D%22url%28%23lid%29%22%2F%3E%0A%3Cpath%20d%3D%22M28%2047v35l36%2020V67z%22%20fill%3D%22%23c96d28%22%2F%3E%0A%3Cpath%20d%3D%22M100%2047v35l-36%2020V67z%22%20fill%3D%22url%28%23box%29%22%2F%3E%0A%3Cpath%20d%3D%22M47%2038%2082%2057%22%20stroke%3D%22%23fff3cf%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20opacity%3D%22.55%22%2F%3E%0A%3Crect%20x%3D%2251%22%20y%3D%2270%22%20width%3D%2226%22%20height%3D%2218%22%20rx%3D%225%22%20fill%3D%22%23171b22%22%20opacity%3D%22.82%22%2F%3E%0A%3Ctext%20x%3D%2264%22%20y%3D%2283%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2CSegoe%20UI%2Csans-serif%22%20font-size%3D%2211%22%20font-weight%3D%22800%22%20fill%3D%22%23ffffff%22%3ESM%3C%2Ftext%3E%0A%3C%2Fsvg%3E';

    function isPackageAsset(asset) {
        if (!asset) return false;

        return (
            String(asset.type || '')
                .toLowerCase() ===
                'package' ||
            asset.isPackage === true ||
            PACKAGE_RE.test(
                String(asset.name || '')
            )
        );
    }

    function hasRealThumbnail(asset) {
        const thumbnail =
            String(
                asset?.thumbnail ||
                ''
            );

        /*
         * Keep an actual preview image supplied by a package.
         * Generic inline SVG strings are not considered real package artwork.
         */
        return (
            thumbnail.startsWith(
                'data:image/'
            ) &&
            !thumbnail.includes(
                '<svg'
            )
        ) || (
            /^https?:\/\//i.test(
                thumbnail
            )
        );
    }

    function injectStyles() {
        if (
            document.getElementById(
                'sm-package-icon-styles'
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id =
            'sm-package-icon-styles';

        style.textContent = `
            .sm-package-logo {
                --sm-package-accent: #e89b48;

                position: relative;
                width: 100%;
                height: 100%;
                min-height: 62px;

                display: flex;
                align-items: center;
                justify-content: center;

                overflow: hidden;
                border-radius: 4px;

                background:
                    radial-gradient(
                        circle at 50% 38%,
                        rgba(232,155,72,.17),
                        transparent 63%
                    ),
                    linear-gradient(
                        145deg,
                        #2a2520,
                        #191613
                    );
            }

            .sm-package-logo__image {
                display: block;
                max-width: 68%;
                max-height: 68%;
                object-fit: contain;

                filter:
                    drop-shadow(
                        0 5px 11px
                        rgba(0,0,0,.34)
                    );

                pointer-events: none;
            }

            .sm-package-logo__badge {
                position: absolute;
                right: 5px;
                bottom: 5px;

                min-width: 42px;
                height: 17px;
                padding: 0 5px;

                box-sizing: border-box;

                display: inline-flex;
                align-items: center;
                justify-content: center;

                border-radius: 4px;
                border:
                    1px solid
                    rgba(232,155,72,.55);

                background:
                    rgba(105,60,26,.82);

                color: #fff4e5;

                font:
                    700 8px/1
                    Inter,
                    "Segoe UI",
                    Arial,
                    sans-serif;

                letter-spacing: .45px;

                box-shadow:
                    0 2px 7px
                    rgba(0,0,0,.34);

                pointer-events: none;
            }
        `;

        document.head.appendChild(
            style
        );
    }

    function createPackageLogo() {
        const root =
            document.createElement(
                'div'
            );

        root.className =
            'sm-package-logo';

        root.title =
            'SM Engine Package';

        const image =
            document.createElement(
                'img'
            );

        image.className =
            'sm-package-logo__image';

        image.src =
            PACKAGE_LOGO;

        image.alt =
            'SM Engine Package';

        image.draggable =
            false;

        const badge =
            document.createElement(
                'div'
            );

        badge.className =
            'sm-package-logo__badge';

        badge.textContent =
            'PACKAGE';

        root.append(
            image,
            badge
        );

        return root;
    }

    function findAssetById(
        panel,
        id
    ) {
        if (!id) return null;

        if (
            typeof panel._findById ===
            'function'
        ) {
            const found =
                panel._findById(
                    id
                );

            if (found) {
                return found;
            }
        }

        return (
            panel.assets ||
            []
        ).find(
            asset =>
                String(asset?.id) ===
                String(id)
        ) || null;
    }

    function applyToCard(
        panel,
        card
    ) {
        if (!card) return false;

        const asset =
            findAssetById(
                panel,
                card.dataset.id
            );

        if (
            !isPackageAsset(
                asset
            )
        ) {
            return false;
        }

        /*
         * Respect a real custom thumbnail included by the package.
         */
        if (
            hasRealThumbnail(
                asset
            )
        ) {
            return false;
        }

        const thumbnail =
            card.querySelector(
                '.asset-thumbnail'
            );

        if (!thumbnail) {
            return false;
        }

        if (
            thumbnail.querySelector(
                '.sm-package-logo'
            )
        ) {
            return true;
        }

        thumbnail.replaceChildren(
            createPackageLogo()
        );

        card.dataset.packageAsset =
            '1';

        return true;
    }

    function applyAll(
        panel
    ) {
        const grid =
            panel?.dom?.grid ||
            document.getElementById(
                'assetsGrid'
            );

        if (!grid) {
            return 0;
        }

        let changed =
            0;

        grid.querySelectorAll(
            '.asset-item[data-id]'
        ).forEach(
            card => {
                if (
                    applyToCard(
                        panel,
                        card
                    )
                ) {
                    changed += 1;
                }
            }
        );

        return changed;
    }

    function installObserver(
        panel
    ) {
        const grid =
            panel?.dom?.grid ||
            document.getElementById(
                'assetsGrid'
            );

        if (
            !grid ||
            grid.dataset
                .smPackageIconObserver ===
                '1'
        ) {
            return;
        }

        grid.dataset
            .smPackageIconObserver =
            '1';

        let queued =
            false;

        const observer =
            new MutationObserver(
                () => {
                    if (queued) return;

                    queued =
                        true;

                    requestAnimationFrame(
                        () => {
                            queued =
                                false;

                            applyAll(
                                panel
                            );
                        }
                    );
                }
            );

        observer.observe(
            grid,
            {
                childList: true,
                subtree: true
            }
        );

        window.SMAssetsPanelPackageIconObserver =
            observer;
    }

    function install() {
        if (
            window[INSTALL_KEY] ===
            true
        ) {
            return true;
        }

        const panel =
            window.AssetsPanel;

        if (
            !panel ||
            typeof panel.render !==
                'function'
        ) {
            return false;
        }

        injectStyles();

        const originalRender =
            panel.render
                .bind(panel);

        panel.render =
            function (
                ...args
            ) {
                const result =
                    originalRender(
                        ...args
                    );

                requestAnimationFrame(
                    () => {
                        applyAll(
                            panel
                        );

                        installObserver(
                            panel
                        );
                    }
                );

                return result;
            };

        requestAnimationFrame(
            () => {
                applyAll(
                    panel
                );

                installObserver(
                    panel
                );
            }
        );

        window.addEventListener(
            'sm-google-drive-sync-complete',
            () => {
                requestAnimationFrame(
                    () =>
                        applyAll(
                            panel
                        )
                );
            }
        );

        window[INSTALL_KEY] =
            true;

        window.SMAssetsPanelPackageIcon = {
            installed: true,
            packageLogo:
                PACKAGE_LOGO,
            isPackageAsset,
            applyAll:
                () =>
                    applyAll(
                        panel
                    )
        };

        console.log(
            '[AssetsPanelPackageIcon] SM PACKAGE logo active.'
        );

        return true;
    }

    if (!install()) {
        let attempts =
            0;

        const timer =
            setInterval(
                () => {
                    attempts += 1;

                    if (
                        install() ||
                        attempts >= 150
                    ) {
                        clearInterval(
                            timer
                        );
                    }
                },
                100
            );
    }
})();