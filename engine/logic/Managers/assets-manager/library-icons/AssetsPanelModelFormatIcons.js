// engine/logic/Managers/assets-manager/AssetsPanelModelFormatIcons.js
// SM Engine — REAL file-format logos in AssetsPanel.
//
// IMPORTANT:
// This version does NOT use AssetsPanel's old generic `model` SVG.
// It overrides the visible card thumbnail AFTER every AssetsPanel.render(),
// based on the REAL file extension.
//
// .blend -> Blender logo
// .glb/.gltf -> official glTF logo
// .fbx -> File Icons FBX mark
// .obj -> 3D/OBJ file mark + OBJ badge
(function () {
    'use strict';

    const INSTALL_KEY =
        '__smAssetsPanelRealModelFormatLogosInstalled';

    /*
     * Logo sources:
     * - Blender: Blender mark hosted on Wikimedia Commons.
     * - glTF: Khronos glTF mark hosted on Wikimedia Commons.
     * - FBX: open-source File Icons glyph exposed by Iconify.
     * - OBJ: open-source File Icons 3D-model glyph. OBJ has no single
     *   universally-standard vendor logo, therefore the extension badge is
     *   kept visible so it is unmistakably an OBJ asset.
     *
     * The URLs are presentation-only. The model asset itself remains local.
     */
    const FORMAT_LOGOS = Object.freeze({
        blend: {
            label: 'BLEND',
            title: 'Blender',
            logo:
                'https://upload.wikimedia.org/wikipedia/commons/0/0c/Blender_logo_no_text.svg',
            background:
                'linear-gradient(145deg, #262a31 0%, #17191f 100%)',
            badge: '#e87d0d',
            fit: 'contain',
            scale: 0.72
        },

        glb: {
            label: 'GLB',
            title: 'glTF Binary',
            logo:
                'https://upload.wikimedia.org/wikipedia/commons/d/da/GlTF_Logo.svg',
            background:
                'linear-gradient(145deg, #202a27 0%, #151b19 100%)',
            badge: '#78b82a',
            fit: 'contain',
            scale: 0.83
        },

        gltf: {
            label: 'GLTF',
            title: 'glTF',
            logo:
                'https://upload.wikimedia.org/wikipedia/commons/d/da/GlTF_Logo.svg',
            background:
                'linear-gradient(145deg, #202a27 0%, #151b19 100%)',
            badge: '#78b82a',
            fit: 'contain',
            scale: 0.83
        },

        fbx: {
            label: 'FBX',
            title: 'FBX',
            logo:
                'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRv__0nJC8cae4rRGmCTQDnmJcCV9qCgwfWulr2viiRXw&s=10',
            background:
                'linear-gradient(145deg, #29251f 0%, #181614 100%)',
            badge: '#f05a28',
            fit: 'contain',
            scale: 0.68
        },

        obj: {
            label: 'OBJ',
            title: 'Wavefront OBJ',
            logo:
                'https://api.iconify.design/file-icons:3d-model.svg?color=%23c5ced8',
            background:
                'linear-gradient(145deg, #242931 0%, #15181e 100%)',
            badge: '#9daabd',
            fit: 'contain',
            scale: 0.64
        },

        uasset: {
            label: 'UASSET',
            title: 'Unreal Asset',
            logo:
                'https://upload.wikimedia.org/wikipedia/commons/2/20/UE_Logo_Black_Centred.svg',
            background:
                'linear-gradient(145deg, #18202d 0%, #0d1219 100%)',
            badge: '#0070e0',
            fit: 'contain',
            scale: 0.72
        },

        umap: {
            label: 'UMAP',
            title: 'Unreal Map',
            logo:
                'https://upload.wikimedia.org/wikipedia/commons/2/20/UE_Logo_Black_Centred.svg',
            background:
                'linear-gradient(145deg, #18231d 0%, #0c1510 100%)',
            badge: '#10a37f',
            fit: 'contain',
            scale: 0.72
        }
    });

    function getExtension(name = '') {
        const match =
            String(name || '')
                .trim()
                .toLowerCase()
                .match(/\.([a-z0-9]+)$/);

        return match?.[1] || '';
    }

    function getFormat(asset) {
        if (
            !asset ||
            String(asset.type || '')
                .toLowerCase() !== 'model'
        ) {
            return null;
        }

        const ext =
            getExtension(
                asset.name
            );

        return FORMAT_LOGOS[ext]
            ? {
                ext,
                ...FORMAT_LOGOS[ext]
            }
            : null;
    }

    function injectStyles() {
        if (
            document.getElementById(
                'sm-real-model-format-logo-styles'
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id =
            'sm-real-model-format-logo-styles';

        style.textContent = `
            .sm-real-format-logo {
                position: relative;
                width: 100%;
                height: 100%;
                min-height: 62px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                border-radius: 4px;
                user-select: none;
            }

            .sm-real-format-logo__image {
                display: block;
                max-width: 78%;
                max-height: 64%;
                object-position: center;
                filter:
                    drop-shadow(
                        0 4px 8px
                        rgba(0, 0, 0, 0.28)
                    );
                pointer-events: none;
            }

            .sm-real-format-logo__badge {
                position: absolute;
                right: 5px;
                bottom: 5px;
                min-width: 27px;
                height: 17px;
                padding: 0 5px;
                box-sizing: border-box;

                display: inline-flex;
                align-items: center;
                justify-content: center;

                border-radius: 4px;
                border: 1px solid
                    color-mix(
                        in srgb,
                        var(--sm-format-accent)
                        70%,
                        white 10%
                    );

                background:
                    color-mix(
                        in srgb,
                        var(--sm-format-accent)
                        27%,
                        #0c0e12 73%
                    );

                color: #ffffff;
                font:
                    700 8px/1
                    Inter,
                    "Segoe UI",
                    Arial,
                    sans-serif;
                letter-spacing: .55px;

                box-shadow:
                    0 2px 7px
                    rgba(0,0,0,.35);

                pointer-events: none;
            }

            .sm-real-format-logo__fallback {
                width: 42px;
                height: 50px;

                display: none;
                align-items: center;
                justify-content: center;

                border-radius: 6px 6px 4px 4px;
                border: 1px solid
                    rgba(255,255,255,.18);

                background:
                    linear-gradient(
                        145deg,
                        rgba(255,255,255,.13),
                        rgba(255,255,255,.035)
                    );

                color:
                    var(--sm-format-accent);

                font:
                    800 10px/1
                    Inter,
                    "Segoe UI",
                    Arial,
                    sans-serif;

                letter-spacing: .5px;

                box-shadow:
                    0 5px 12px
                    rgba(0,0,0,.22);
            }

            .sm-real-format-logo__image.is-error {
                display: none;
            }

            .sm-real-format-logo__image.is-error
                + .sm-real-format-logo__fallback {
                    display: flex;
            }
        `;

        document.head.appendChild(
            style
        );
    }

    function createLogoElement(format) {
        const root =
            document.createElement(
                'div'
            );

        root.className =
            'sm-real-format-logo';

        root.dataset.format =
            format.ext;

        root.title =
            `${format.title} (.${format.ext})`;

        root.style.background =
            format.background;

        root.style.setProperty(
            '--sm-format-accent',
            format.badge
        );

        const img =
            document.createElement(
                'img'
            );

        img.className =
            'sm-real-format-logo__image';

        img.alt =
            `${format.title} logo`;

        img.draggable =
            false;

        img.loading =
            'eager';

        img.src =
            format.logo;

        img.style.objectFit =
            format.fit || 'contain';

        img.style.transform =
            `scale(${Number(format.scale) || 1})`;

        /*
         * Never fall back to the old stack/model icon.
         * If the web logo cannot load, show a clean extension file badge.
         */
        img.addEventListener(
            'error',
            () => {
                img.classList.add(
                    'is-error'
                );
            },
            {
                once: true
            }
        );

        const fallback =
            document.createElement(
                'div'
            );

        fallback.className =
            'sm-real-format-logo__fallback';

        fallback.textContent =
            format.label;

        const badge =
            document.createElement(
                'div'
            );

        badge.className =
            'sm-real-format-logo__badge';

        badge.textContent =
            format.label;

        root.append(
            img,
            fallback,
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
        if (!card) {
            return false;
        }

        const asset =
            findAssetById(
                panel,
                card.dataset.id
            );

        const format =
            getFormat(
                asset
            );

        if (!format) {
            return false;
        }

        const thumbnail =
            card.querySelector(
                '.asset-thumbnail'
            );

        if (!thumbnail) {
            return false;
        }

        /*
         * Already correct for this exact format.
         */
        const current =
            thumbnail.querySelector(
                '.sm-real-format-logo'
            );

        if (
            current &&
            current.dataset.format ===
                format.ext
        ) {
            return true;
        }

        /*
         * Force-replace old:
         *   this._svgIcon("model")
         * stack icons / stale rendered thumbnails.
         */
        thumbnail.replaceChildren(
            createLogoElement(
                format
            )
        );

        card.dataset.modelFormat =
            format.ext;

        return true;
    }

    function applyAll(
        panel
    ) {
        const root =
            panel?.dom?.grid ||
            document.getElementById(
                'assetsGrid'
            );

        if (!root) {
            return 0;
        }

        let changed = 0;

        root
            .querySelectorAll(
                '.asset-item[data-id]'
            )
            .forEach(
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
                .smRealFormatObserver ===
                '1'
        ) {
            return;
        }

        grid.dataset
            .smRealFormatObserver =
            '1';

        let queued =
            false;

        const queueApply =
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
            };

        const observer =
            new MutationObserver(
                queueApply
            );

        observer.observe(
            grid,
            {
                childList: true,
                subtree: true
            }
        );

        window
            .SMAssetsPanelModelFormatIconsObserver =
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

        /*
         * Critical fix:
         * do not rely on asset.thumbnail anymore.
         * The visible icon is selected from asset.name AFTER every render.
         */
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

        /*
         * Existing cards already on screen.
         */
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

        /*
         * New Blender import completed.
         */
        window.addEventListener(
            'sm:assets-blender-import-complete',
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

        window.SMAssetsPanelModelFormatIcons = {
            installed: true,
            realLogos: true,
            formats:
                FORMAT_LOGOS,
            getExtension,
            getFormat,
            applyAll:
                () =>
                    applyAll(
                        panel
                    )
        };

        console.log(
            '[AssetsPanelModelFormatIcons] Real file-format logos active.'
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
