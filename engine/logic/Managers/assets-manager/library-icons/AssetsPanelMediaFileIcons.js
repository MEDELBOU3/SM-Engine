(function () {
    'use strict';

    const INSTALL_KEY =
        '__smAssetsPanelMediaFileIconsInstalled';


    // =========================================================
    // INLINE SVG ICONS
    // =========================================================

    function svgData(svg) {
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }


    const SVG_ICONS = Object.freeze({

        // -----------------------------------------------------
        // HDR
        // -----------------------------------------------------

        hdr: svgData(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 128 128"
            >
                <defs>
                    <linearGradient
                        id="gold"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                    >
                        <stop
                            offset="0"
                            stop-color="#fff1a8"
                        />
                        <stop
                            offset="0.45"
                            stop-color="#f2c14e"
                        />
                        <stop
                            offset="1"
                            stop-color="#b87918"
                        />
                    </linearGradient>

                    <linearGradient
                        id="sky"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                    >
                        <stop
                            offset="0"
                            stop-color="#15191f"
                        />
                        <stop
                            offset="1"
                            stop-color="#44391f"
                        />
                    </linearGradient>
                </defs>

                <rect
                    x="7"
                    y="7"
                    width="114"
                    height="114"
                    rx="22"
                    fill="#121316"
                    stroke="url(#gold)"
                    stroke-width="4"
                />

                <rect
                    x="19"
                    y="22"
                    width="90"
                    height="58"
                    rx="10"
                    fill="url(#sky)"
                    stroke="url(#gold)"
                    stroke-width="3"
                />

                <!-- sun -->
                <circle
                    cx="82"
                    cy="47"
                    r="11"
                    fill="#ffeaa0"
                />

                <g
                    stroke="#f2c14e"
                    stroke-width="3"
                    stroke-linecap="round"
                >
                    <path d="M82 29v-7"/>
                    <path d="M82 65v7"/>
                    <path d="M64 47h-7"/>
                    <path d="M100 47h7"/>
                    <path d="M69 34l-5-5"/>
                    <path d="M95 60l5 5"/>
                    <path d="M95 34l5-5"/>
                    <path d="M69 60l-5 5"/>
                </g>

                <!-- mountains -->
                <path
                    d="
                        M20 76
                        L39 57
                        L49 67
                        L65 45
                        L82 66
                        L94 54
                        L108 76
                        Z
                    "
                    fill="#090b0e"
                />

                <!-- horizon -->
                <path
                    d="
                        M20 76
                        Q45 70 64 76
                        Q84 82 109 75
                        V80
                        H20
                        Z
                    "
                    fill="#f2c14e"
                    opacity=".22"
                />

                <!-- HDR -->
                <text
                    x="64"
                    y="106"
                    text-anchor="middle"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="25"
                    font-weight="900"
                    letter-spacing="3"
                    fill="url(#gold)"
                >
                    HDR
                </text>
            </svg>
        `),


        // -----------------------------------------------------
        // EXR
        // -----------------------------------------------------

        exr: svgData(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 128 128"
            >
                <rect
                    x="9"
                    y="9"
                    width="110"
                    height="110"
                    rx="22"
                    fill="#11171d"
                    stroke="#6ec8ff"
                    stroke-width="4"
                />

                <rect
                    x="23"
                    y="25"
                    width="82"
                    height="78"
                    rx="10"
                    fill="#17232c"
                    stroke="#6ec8ff"
                    stroke-width="2"
                />

                <circle
                    cx="64"
                    cy="49"
                    r="14"
                    fill="none"
                    stroke="#6ec8ff"
                    stroke-width="4"
                />

                <path
                    d="M34 83 L50 65 L62 78 L76 59 L94 83"
                    fill="none"
                    stroke="#6ec8ff"
                    stroke-width="5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />

                <text
                    x="64"
                    y="99"
                    text-anchor="middle"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="14"
                    font-weight="900"
                    fill="#6ec8ff"
                >
                    EXR
                </text>
            </svg>
        `),


        // -----------------------------------------------------
        // MP3
        // -----------------------------------------------------

        mp3: svgData(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 128 128"
            >
                <rect
                    x="10"
                    y="10"
                    width="108"
                    height="108"
                    rx="24"
                    fill="#121a20"
                    stroke="#5ac8fa"
                    stroke-width="4"
                />

                <path
                    d="M76 29v53"
                    stroke="#5ac8fa"
                    stroke-width="8"
                    stroke-linecap="round"
                />

                <path
                    d="M76 30 L101 23 V73"
                    fill="none"
                    stroke="#5ac8fa"
                    stroke-width="8"
                    stroke-linejoin="round"
                />

                <circle
                    cx="61"
                    cy="88"
                    r="13"
                    fill="#5ac8fa"
                />

                <circle
                    cx="88"
                    cy="78"
                    r="13"
                    fill="#5ac8fa"
                />
            </svg>
        `),


        // -----------------------------------------------------
        // WAV
        // -----------------------------------------------------

        wav: svgData(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 128 128"
            >
                <rect
                    x="10"
                    y="10"
                    width="108"
                    height="108"
                    rx="24"
                    fill="#121b17"
                    stroke="#6dd58c"
                    stroke-width="4"
                />

                <path
                    d="
                        M20 64
                        H31
                        L38 42
                        L48 87
                        L58 30
                        L68 96
                        L78 48
                        L87 75
                        L96 57
                        H108
                    "
                    fill="none"
                    stroke="#6dd58c"
                    stroke-width="5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `),


        // -----------------------------------------------------
        // OGG
        // -----------------------------------------------------

        ogg: svgData(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 128 128"
            >
                <rect
                    x="10"
                    y="10"
                    width="108"
                    height="108"
                    rx="24"
                    fill="#18131f"
                    stroke="#c79cff"
                    stroke-width="4"
                />

                <circle
                    cx="64"
                    cy="64"
                    r="31"
                    fill="none"
                    stroke="#c79cff"
                    stroke-width="5"
                />

                <path
                    d="M67 39v37"
                    stroke="#c79cff"
                    stroke-width="7"
                    stroke-linecap="round"
                />

                <path
                    d="M67 40 L88 34 V69"
                    fill="none"
                    stroke="#c79cff"
                    stroke-width="7"
                    stroke-linejoin="round"
                />

                <circle
                    cx="55"
                    cy="83"
                    r="10"
                    fill="#c79cff"
                />

                <circle
                    cx="76"
                    cy="75"
                    r="10"
                    fill="#c79cff"
                />
            </svg>
        `),


        // -----------------------------------------------------
        // FLAC
        // -----------------------------------------------------

        flac: svgData(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 128 128"
            >
                <rect
                    x="10"
                    y="10"
                    width="108"
                    height="108"
                    rx="24"
                    fill="#211713"
                    stroke="#ff8a65"
                    stroke-width="4"
                />

                <path
                    d="
                        M20 64
                        H31
                        L38 45
                        L47 82
                        L56 34
                        L65 94
                        L74 45
                        L83 76
                        L92 54
                        H108
                    "
                    fill="none"
                    stroke="#ff8a65"
                    stroke-width="5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />

                <text
                    x="64"
                    y="104"
                    text-anchor="middle"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="12"
                    font-weight="900"
                    fill="#ff8a65"
                >
                    FLAC
                </text>
            </svg>
        `),


        // -----------------------------------------------------
        // M4A
        // -----------------------------------------------------

        m4a: svgData(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 128 128"
            >
                <rect
                    x="10"
                    y="10"
                    width="108"
                    height="108"
                    rx="24"
                    fill="#21131b"
                    stroke="#ff6fae"
                    stroke-width="4"
                />

                <path
                    d="M73 29v52"
                    stroke="#ff6fae"
                    stroke-width="8"
                    stroke-linecap="round"
                />

                <path
                    d="M73 30 L99 24 V70"
                    fill="none"
                    stroke="#ff6fae"
                    stroke-width="8"
                    stroke-linejoin="round"
                />

                <circle
                    cx="58"
                    cy="86"
                    r="13"
                    fill="#ff6fae"
                />

                <circle
                    cx="86"
                    cy="77"
                    r="13"
                    fill="#ff6fae"
                />
            </svg>
        `),


        // -----------------------------------------------------
        // AAC
        // -----------------------------------------------------

        aac: svgData(`
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 128 128"
            >
                <rect
                    x="10"
                    y="10"
                    width="108"
                    height="108"
                    rx="24"
                    fill="#211c12"
                    stroke="#ffd166"
                    stroke-width="4"
                />

                <path
                    d="M64 31v48"
                    stroke="#ffd166"
                    stroke-width="8"
                    stroke-linecap="round"
                />

                <path
                    d="M64 32 L91 25 V68"
                    fill="none"
                    stroke="#ffd166"
                    stroke-width="8"
                    stroke-linejoin="round"
                />

                <circle
                    cx="50"
                    cy="84"
                    r="13"
                    fill="#ffd166"
                />

                <circle
                    cx="78"
                    cy="75"
                    r="13"
                    fill="#ffd166"
                />
            </svg>
        `)
    });


    // =========================================================
    // FILE TYPE DEFINITIONS
    // =========================================================

    const ICONS = Object.freeze({

        hdr: {
            label: 'HDR',
            title: 'Radiance HDR',
            logo: SVG_ICONS.hdr,
            accent: '#f2c14e',
            background:
                'linear-gradient(145deg,#292720 0%,#171613 100%)'
        },

        exr: {
            label: 'EXR',
            title: 'OpenEXR',
            logo: SVG_ICONS.exr,
            accent: '#6ec8ff',
            background:
                'linear-gradient(145deg,#202830 0%,#14191e 100%)'
        },

        mp3: {
            label: 'MP3',
            title: 'MP3 Audio',
            logo: SVG_ICONS.mp3,
            accent: '#5ac8fa',
            background:
                'linear-gradient(145deg,#1d2830 0%,#12181d 100%)'
        },

        wav: {
            label: 'WAV',
            title: 'Wave Audio',
            logo: SVG_ICONS.wav,
            accent: '#6dd58c',
            background:
                'linear-gradient(145deg,#1d2c25 0%,#121a16 100%)'
        },

        ogg: {
            label: 'OGG',
            title: 'Ogg Audio',
            logo: SVG_ICONS.ogg,
            accent: '#c79cff',
            background:
                'linear-gradient(145deg,#292134 0%,#17131d 100%)'
        },

        flac: {
            label: 'FLAC',
            title: 'FLAC Lossless Audio',
            logo: SVG_ICONS.flac,
            accent: '#ff8a65',
            background:
                'linear-gradient(145deg,#30221d 0%,#1b1512 100%)'
        },

        m4a: {
            label: 'M4A',
            title: 'M4A Audio',
            logo: SVG_ICONS.m4a,
            accent: '#ff6fae',
            background:
                'linear-gradient(145deg,#30202a 0%,#1b1318 100%)'
        },

        aac: {
            label: 'AAC',
            title: 'AAC Audio',
            logo: SVG_ICONS.aac,
            accent: '#ffd166',
            background:
                'linear-gradient(145deg,#302a1d 0%,#1b1812 100%)'
        }
    });


    // =========================================================
    // EXTENSION
    // =========================================================

    function getExtension(name = '') {
        const match =
            String(name || '')
                .trim()
                .toLowerCase()
                .match(/\.([a-z0-9]+)$/);

        return match?.[1] || '';
    }


    // =========================================================
    // ASSET INFO
    // =========================================================

    function getInfo(asset) {
        if (!asset) {
            return null;
        }

        const ext =
            getExtension(
                asset.name
            );

        const info =
            ICONS[ext];

        if (!info) {
            return null;
        }

        const type =
            String(
                asset.type || ''
            ).toLowerCase();

        if (
            (ext === 'hdr' || ext === 'exr') &&
            type !== 'hdri'
        ) {
            return null;
        }

        if (
            !['hdr', 'exr'].includes(ext) &&
            type !== 'audio'
        ) {
            return null;
        }

        return {
            ext,
            ...info
        };
    }


    // =========================================================
    // STYLES
    // =========================================================

    function injectStyles() {

        if (
            document.getElementById(
                'sm-media-file-icon-styles'
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id =
            'sm-media-file-icon-styles';

        style.textContent = `
            .sm-media-file-logo {
                --sm-media-accent: #9fb2c8;

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
                    linear-gradient(
                        145deg,
                        #252930,
                        #181b20
                    );
            }

            .sm-media-file-logo::before {
                content: "";

                position: absolute;
                inset: 0;

                background:
                    radial-gradient(
                        circle at 50% 36%,
                        color-mix(
                            in srgb,
                            var(--sm-media-accent) 18%,
                            transparent
                        ),
                        transparent 63%
                    );

                pointer-events: none;
            }

            .sm-media-file-logo__image {
                position: relative;
                z-index: 1;

                display: block;

                width: 72%;
                height: 72%;

                max-width: 72%;
                max-height: 72%;

                object-fit: contain;

                filter:
                    drop-shadow(
                        0 5px 10px
                        rgba(0,0,0,.3)
                    );

                pointer-events: none;
            }

            .sm-media-file-logo__fallback {
                position: relative;
                z-index: 1;

                width: 44px;
                height: 52px;

                display: none;

                align-items: center;
                justify-content: center;

                border-radius: 7px;

                border:
                    1px solid
                    color-mix(
                        in srgb,
                        var(--sm-media-accent) 52%,
                        rgba(255,255,255,.12)
                    );

                background:
                    linear-gradient(
                        145deg,
                        color-mix(
                            in srgb,
                            var(--sm-media-accent) 17%,
                            #292d34
                        ),
                        #15181d
                    );

                color:
                    var(--sm-media-accent);

                font:
                    800 10px/1
                    Inter,
                    "Segoe UI",
                    Arial,
                    sans-serif;

                letter-spacing: .45px;
            }

            .sm-media-file-logo__image.is-error {
                display: none;
            }

            .sm-media-file-logo__image.is-error
                + .sm-media-file-logo__fallback {
                    display: flex;
            }

            .sm-media-file-logo__badge {
                position: absolute;
                z-index: 2;

                right: 5px;
                bottom: 5px;

                min-width: 28px;
                height: 17px;
                padding: 0 5px;

                box-sizing: border-box;

                display: inline-flex;
                align-items: center;
                justify-content: center;

                border-radius: 4px;

                border:
                    1px solid
                    color-mix(
                        in srgb,
                        var(--sm-media-accent) 56%,
                        transparent
                    );

                background:
                    color-mix(
                        in srgb,
                        var(--sm-media-accent) 24%,
                        #0d1014 76%
                    );

                color: #fff;

                font:
                    700 8px/1
                    Inter,
                    "Segoe UI",
                    Arial,
                    sans-serif;

                letter-spacing: .45px;

                box-shadow:
                    0 2px 7px
                    rgba(0,0,0,.32);

                pointer-events: none;
            }
        `;

        document.head.appendChild(
            style
        );
    }


    // =========================================================
    // CREATE ICON
    // =========================================================

    function createIconElement(info) {

        const root =
            document.createElement(
                'div'
            );

        root.className =
            'sm-media-file-logo';

        root.dataset.extension =
            info.ext;

        root.title =
            `${info.title} (.${info.ext})`;

        root.style.background =
            info.background;

        root.style.setProperty(
            '--sm-media-accent',
            info.accent
        );


        // -----------------------------------------------------
        // SVG DATA URL
        // -----------------------------------------------------

        const image =
            document.createElement(
                'img'
            );

        image.className =
            'sm-media-file-logo__image';

        image.src =
            info.logo;

        image.alt =
            `${info.title} icon`;

        image.draggable =
            false;

        image.decoding =
            'async';

        image.loading =
            'eager';


        // -----------------------------------------------------
        // Fallback
        // -----------------------------------------------------

        image.addEventListener(
            'error',
            () => {
                image.classList.add(
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
            'sm-media-file-logo__fallback';

        fallback.textContent =
            info.label;


        // -----------------------------------------------------
        // Badge
        // -----------------------------------------------------

        const badge =
            document.createElement(
                'div'
            );

        badge.className =
            'sm-media-file-logo__badge';

        badge.textContent =
            info.label;


        root.append(
            image,
            fallback,
            badge
        );

        return root;
    }


    // =========================================================
    // FIND ASSET
    // =========================================================

    function findAssetById(
        panel,
        id
    ) {
        if (!id) {
            return null;
        }

        if (
            typeof panel._findById ===
            'function'
        ) {
            const result =
                panel._findById(
                    id
                );

            if (result) {
                return result;
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


    // =========================================================
    // APPLY TO CARD
    // =========================================================

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

        const info =
            getInfo(asset);

        if (!info) {
            return false;
        }

        const thumbnail =
            card.querySelector(
                '.asset-thumbnail'
            );

        if (!thumbnail) {
            return false;
        }

        const current =
            thumbnail.querySelector(
                '.sm-media-file-logo'
            );

        if (
            current?.dataset?.extension ===
            info.ext
        ) {
            return true;
        }

        thumbnail.replaceChildren(
            createIconElement(
                info
            )
        );

        card.dataset.mediaFormat =
            info.ext;

        return true;
    }


    // =========================================================
    // APPLY ALL
    // =========================================================

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

        let changed = 0;

        grid
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


    // =========================================================
    // OBSERVER
    // =========================================================

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
                .smMediaIconObserver ===
            '1'
        ) {
            return;
        }

        grid.dataset
            .smMediaIconObserver =
            '1';

        let queued =
            false;

        const observer =
            new MutationObserver(
                () => {

                    if (queued) {
                        return;
                    }

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

        window.SMAssetsPanelMediaFileIconsObserver =
            observer;
    }


    // =========================================================
    // INSTALL
    // =========================================================

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
            panel.render.bind(panel);

        panel.render =
            function (...args) {

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


        window[INSTALL_KEY] =
            true;


        window.SMAssetsPanelMediaFileIcons = {

            installed: true,

            formats:
                ICONS,

            getExtension,

            getInfo,

            applyAll:
                () =>
                    applyAll(
                        panel
                    )
        };


        console.log(
            '[AssetsPanelMediaFileIcons] HDR/EXR + audio format icons active.'
        );

        return true;
    }


    // =========================================================
    // WAIT FOR ASSETS PANEL
    // =========================================================

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