// engine/workspace/integration/SMWorkspaceEnvironmentAdapter.js
// Workspace <-> HDR-only sky / Sun Rig adapter.
//
// This adapter deliberately knows NOTHING about the old procedural
// SkyLightingSystem implementation.
(function () {
    'use strict';

    class SMWorkspaceEnvironmentAdapter {
        constructor() {
            this.mode = null;
        }

        get sky() {
            return (
                window.smHDRSkySystem ||
                null
            );
        }

        get sunController() {
            return (
                window.smSunController ||
                null
            );
        }

        get environmentBridge() {
            return (
                window.smSunEnvironmentBridge ||
                null
            );
        }

        get sunLight() {
            return (
                this.sunController
                    ?.light ||
                this.sky
                    ?.sunLight ||
                null
            );
        }

        get hemiLight() {
            return (
                this.sky
                    ?.hemiLight ||
                null
            );
        }

        isEnvironmentObject(
            object
        ) {
            if (!object) {
                return false;
            }

            const sky =
                this.sky;

            const sun =
                this.sunController;

            const data =
                object.userData ||
                {};

            return !!(
                object === sky?.root ||
                object === sky?.hdriProxy ||
                object === sky?.sunLight ||
                object === sky?.sunTarget ||
                object === sky?.hemiLight ||
                object === sun?.light ||
                object === sun?.targetObject ||
                object === sun?.rigProxy ||
                data.isHDRSkyRoot === true ||
                data.isHDRSkyProxy === true ||
                data.isHDRSkyLight === true ||
                data.isHDRSkyTarget === true ||
                data.isSMSunLight === true ||
                data.isSMSunTarget === true ||
                data.isSMSunRigProxy === true
            );
        }

        ensureAttached(
            scene =
                window.scene
        ) {
            const sky =
                this.sky;

            if (
                !sky ||
                !scene
            ) {
                return false;
            }

            if (
                sky.root &&
                sky.root.parent !==
                    scene
            ) {
                scene.add(
                    sky.root
                );
            }

            return true;
        }

        restoreHDR(
            scene =
                window.scene
        ) {
            const sky =
                this.sky;

            const active =
                window.smActiveHDRI;

            if (!scene) {
                return false;
            }

            const hdrTexture =
                sky?.hdrTexture ||
                active?.texture ||
                null;

            const environmentTexture =
                sky?.environmentTexture ||
                active?.environmentTexture ||
                hdrTexture ||
                null;

            if (!hdrTexture) {
                return false;
            }

            hdrTexture.mapping =
                THREE
                    .EquirectangularReflectionMapping;

            hdrTexture.needsUpdate =
                true;

            scene.background =
                hdrTexture;

            if (
                window.smHDRIEnvironmentEnabled !==
                false &&
                window.smGlobalIBLAllowed !== false
            ) {
                scene.environment =
                    environmentTexture;

                if (
                    'environmentIntensity' in
                    scene
                ) {
                    scene.environmentIntensity =
                        Number(
                            sky?.config
                                ?.environmentIntensity ??
                            active?.intensity ??
                            0.82
                        );
                }
            }

            if (
                'backgroundIntensity' in
                scene
            ) {
                scene.backgroundIntensity =
                    Number(
                        sky?.config
                            ?.backgroundIntensity ??
                        1
                    );
            }

            return true;
        }

        setLightRigVisible(
            visible
        ) {
            const state =
                !!visible;

            const sky =
                this.sky;

            const sun =
                this.sunLight;

            const hemi =
                this.hemiLight;

            // The HDR-only sky has no separate dome mesh. Its Environment
            // group is therefore part of the render contract: hide/show the
            // group together with its lights so a Film -> Terrain transition
            // cannot leave a blank viewport behind.
            sky?.root && (sky.root.visible = state);
            sky?.hdriProxy && (sky.hdriProxy.visible = state);

            if (sun) {
                sun.visible =
                    state;
            }

            if (hemi) {
                hemi.visible =
                    state;
            }

            if (
                sky?.sunTarget
            ) {
                sky.sunTarget.visible =
                    state;
            }

            if (
                this.sunController
                    ?.rigProxy
            ) {
                this.sunController
                    .rigProxy
                    .visible =
                    state;
            }

            if (!state) {
                window.smSunGizmo
                    ?.setVisible?.(
                        false
                    );
            }

            return true;
        }

        /**
         * Landscape editing needs a readable, stable key/fill balance. Apply
         * this after workspace/settings restoration because those paths may
         * reapply the global HDRI slider or the Sun controller defaults.
         */
        applyTerrainBalance(scene = window.scene) {
            if (this.mode !== 'TERRAIN') return false;

            const sky = this.sky;
            const controller = this.sunController;

            sky?.setVisible?.(true);
            sky?.setEnvironmentIntensity?.(0.78);
            sky?.setBackgroundIntensity?.(1.0);
            sky?.setExposure?.(1.02);

            if (controller) {
                controller.configureShadows?.({
                    mapSize: 2048,
                    area: 70,
                    near: 0.5,
                    far: 420,
                    bias: -0.00005,
                    normalBias: 0.0015,
                    radius: 1.0
                });
                controller.intensity = Math.max(2.25, Number(controller.intensity) || 0);
                controller.apply?.(true);
            }

            if (sky?.sunLight) {
                sky.sunLight.visible = true;
                sky.sunLight.intensity = Math.max(2.25, Number(sky.sunLight.intensity) || 0);
                sky.sunLight.castShadow = true;
            }

            if (sky?.hemiLight) {
                sky.hemiLight.visible = true;
                sky.hemiLight.intensity = Math.max(0.32, Number(sky.hemiLight.intensity) || 0);
            }

            this.ensureAttached(scene);
            sky?.refreshShadows?.();
            sky?.update?.(0);
            return true;
        }

        apply(
            mode,
            scene =
                window.scene
        ) {
            const activeMode =
                String(
                    mode ||
                    'FILM'
                ).toUpperCase();

            this.mode =
                activeMode;

            this.ensureAttached(
                scene
            );

            this.restoreHDR(
                scene
            );

            const editorSunEnabled =
                activeMode ===
                    'GAME_DEV' ||
                activeMode ===
                    'TERRAIN';

            /*
             * Gameplay Sample owns its own light rig.
             * FILM owns its studio-light rig.
             */
            this.sky?.setVisible?.(
                editorSunEnabled
            );
            this.setLightRigVisible(
                editorSunEnabled
            );

            if (
                editorSunEnabled
            ) {
                this.sunController
                    ?.apply?.(
                        true
                    );

                this.environmentBridge
                    ?.applyFromElevation?.(
                        this.sunController
                            ?.elevation ??
                        30
                    );
            }

            if (activeMode === 'TERRAIN') {
                this.applyTerrainBalance(scene);
            }

            if (
                window.renderer
                    ?.shadowMap
            ) {
                window.renderer
                    .shadowMap
                    .enabled =
                    true;

                window.renderer
                    .shadowMap
                    .needsUpdate =
                    true;
            }

            window.dispatchEvent(
                new CustomEvent(
                    'sm:workspace-environment-applied',
                    {
                        detail: {
                            mode:
                                activeMode,
                            hdr:
                                !!this.sky
                                    ?.hdrTexture,
                            sunVisible:
                                !!this
                                    .sunLight
                                    ?.visible
                        }
                    }
                )
            );

            return true;
        }

        debug() {
            console.table({
                Mode:
                    this.mode,

                HDR:
                    !!this.sky
                        ?.hdrTexture,

                'HDR source':
                    this.sky
                        ?.config
                        ?.hdrPath ||
                    window.smActiveHDRI
                        ?.source ||
                    'n/a',

                'Sun visible':
                    !!this.sunLight
                        ?.visible,

                'Hemi visible':
                    !!this.hemiLight
                        ?.visible
            });
        }
    }

    window.SMWorkspaceEnvironmentAdapter =
        SMWorkspaceEnvironmentAdapter;

    window.smWorkspaceEnvironmentAdapter =
        window.smWorkspaceEnvironmentAdapter ||
        new SMWorkspaceEnvironmentAdapter();
})();
