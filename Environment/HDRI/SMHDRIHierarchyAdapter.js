// Environment/HDRI/SMHDRIHierarchyAdapter.js
(function () {
    'use strict';

    class SMHDRIHierarchyAdapter {
        constructor() {
            this.root = null;
            this.item = null;
        }

        suppressProceduralSkyHierarchy() {
            const scene =
                window.scene;

            if (!scene) {
                return;
            }

            const candidates = [
                window.skyFolder,
                scene
                    .getObjectByName?.(
                        'Environment'
                    ),
                scene
                    .getObjectByName?.(
                        'Sky'
                    )
            ].filter(Boolean);

            candidates.forEach(
                object => {
                    if (
                        object ===
                        this.root
                    ) {
                        return;
                    }

                    if (
                        object.userData
                            ?.isSkyEditorFolder ||
                        object.name ===
                            'Sky'
                    ) {
                        object.userData ||= {};
                        object.userData
                            .ignoreInHierarchy =
                            true;
                    }
                }
            );
        }

        ensureObjects() {
            const scene =
                window.scene;

            if (!scene) {
                return false;
            }

            const cfg =
                window.SMHDRIEnvironmentConfig ||
                {};

            if (
                !this.root ||
                this.root.parent !==
                    scene
            ) {
                // Reuse the real HDR sky root when it already exists. The
                // previous adapter created a second `Environment` group,
                // which made the hierarchy show a hidden empty folder while
                // the visible sky lived in another root.
                const skyRoot =
                    window.smHDRSkySystem?.root ||
                    scene.getObjectByName?.('Environment');

                if (skyRoot?.parent === scene) {
                    this.root = skyRoot;
                } else {
                    const root =
                        new THREE.Group();

                    root.name =
                        cfg.hierarchyRootName ||
                        'Environment';

                    root.userData = {
                        ...(root.userData || {}),
                        isSystemObject: false,
                        ignoreInHierarchy: false,
                        ignoreInTimeline: true,
                        editorOnly: true,
                        selectable: false,
                        isHDRIEnvironmentFolder:
                            true,
                        excludeFromNanite: true,
                        excludeFromStaticMerge: true
                    };

                    /* No geometry = no render cost. */
                    THREE.Object3D
                        .prototype
                        .add
                        .call(
                            scene,
                            root
                        );

                    this.root =
                        root;
                }
            }

            if (
                !this.item ||
                this.item.parent !==
                    this.root
            ) {
                const item =
                    new THREE.Object3D();

                item.name =
                    'HDRI Environment';

                item.userData = {
                    ...(item.userData || {}),
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    ignoreInTimeline: true,
                    editorOnly: true,
                    selectable: true,
                    isHDRIEnvironmentItem:
                        true,
                    excludeFromNanite: true,
                    excludeFromStaticMerge: true
                };

                this.root.add(
                    item
                );

                this.item =
                    item;
            }

            return true;
        }

        sync() {
            if (
                !window.THREE ||
                !this.ensureObjects()
            ) {
                return false;
            }

            this
                .suppressProceduralSkyHierarchy();

            const active =
                window.smActiveHDRI;

            const sky =
                window.skyLightingSystem;

            const cfg =
                window.SMHDRIEnvironmentConfig ||
                {};

            const name =
                active?.name ||
                sky?._externalEnvSource
                    ?.split?.('/')
                    ?.pop?.() ||
                'Default HDRI';

            this.item.name =
                `${cfg.hierarchyItemPrefix || 'HDRI Environment'} • ${name}`;

            this.item.userData = {
                ...(this.item.userData || {}),

                assetId:
                    active?.assetId ||
                    sky?._externalEnvAssetId ||
                    null,

                source:
                    active?.source ||
                    sky?._externalEnvSource ||
                    null,

                intensity:
                    sky?._externalEnvIntensity ??
                    cfg.environmentIntensity ??
                    0.72,

                active:
                    !!(
                        sky?._externalEnv ||
                        sky?.hdrTexture
                    )
            };

            window.hierarchyManager
                ?.renderAll?.();

            window.updateHierarchy?.();

            return true;
        }
    }

    window.SMHDRIHierarchyAdapter =
        window.SMHDRIHierarchyAdapter ||
        new SMHDRIHierarchyAdapter();

    [
        'sm:hdri-lighting-profile-applied',
        'sm:workspace-changed',
        'sm:scene-loaded',
        'sm:project-loaded'
    ].forEach(
        eventName => {
            window.addEventListener(
                eventName,
                () => {
                    setTimeout(
                        () =>
                            window
                                .SMHDRIHierarchyAdapter
                                ?.sync?.(),
                        0
                    );
                }
            );
        }
    );
})();
