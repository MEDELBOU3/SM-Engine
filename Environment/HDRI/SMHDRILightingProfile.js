// Environment/HDRI/SMHDRILightingProfile.js
(function () {
    'use strict';

    class SMHDRILightingProfile {
        constructor() {
            this.installed = false;
            this.lastMode = null;
        }

        get config() {
            return window.SMHDRIEnvironmentConfig || {};
        }

        get sky() {
            return window.skyLightingSystem || null;
        }

        isHDRIActive() {
            const sky = this.sky;

            return !!(
                sky?._externalEnv &&
                sky?._externalEnvTexture
            );
        }

        apply(mode = null) {
            const sky = this.sky;
            const renderer = window.renderer;
            const cfg = this.config;

            if (!sky || !cfg.enabled) {
                return false;
            }

            const workspace = String(
                mode ||
                sky.currentWorkspaceMode ||
                window.workspaceManager?.currentMode ||
                'GAME_DEV'
            ).toUpperCase();

            this.lastMode = workspace;

            if (!this.isHDRIActive()) {
                return false;
            }

            /*
             * HDRI-FIRST LIGHTING CONTRACT
             * ----------------------------
             * The HDRI supplies broad diffuse/specular energy.
             * The directional sun exists mainly for contact/sharp shadows.
             * Hemisphere/Ambient/BackFill remain low to avoid double-lighting.
             */
            sky._intensity ||= {};

            sky._intensity.sunMax =
                Number(cfg.sunMax ?? 1.85);

            sky._intensity.hemiDay =
                Number(cfg.hemisphereDay ?? 0.34);

            sky._intensity.hemiNight =
                Number(cfg.hemisphereNight ?? 0.05);

            sky._intensity.ambient =
                Number(cfg.ambient ?? 0.045);

            sky._intensity.backFill =
                workspace === 'GAME_DEV'
                    ? Number(cfg.backFill ?? 0.08)
                    : 0;

            sky.cfg.exposure =
                Number(cfg.exposure ?? 0.82);

            sky.cfg.exposureFloor =
                Number(cfg.exposureFloor ?? 0.66);

            sky.cfg.exposureCeiling =
                Number(cfg.exposureCeiling ?? 1.0);

            sky.cfg.fogHeightDensity =
                workspace === 'GAME_DEV'
                    ? Number(cfg.fogDensityGameDev ?? 0.00035)
                    : sky.cfg.fogHeightDensity;

            if (sky._fog) {
                if (workspace === 'GAME_DEV') {
                    sky._fog.dayNear =
                        Number(cfg.fogNear ?? 900);

                    sky._fog.dayFar =
                        Number(cfg.fogFar ?? 7000);
                }

                if (sky._externalHorizonColor) {
                    sky._fog.dayColor
                        ?.copy?.(
                            sky._externalHorizonColor
                        );
                }
            }

            sky._externalSunIntensityScale =
                THREE.MathUtils.clamp(
                    Number(
                        cfg.sunIntensityScale ??
                        0.82
                    ),
                    0,
                    3
                );

            sky._externalSkyInfluence = 0;
            sky._externalEnvHideSkyVisuals = true;

            sky.setEnvironmentIntensity?.(
                Number(
                    cfg.environmentIntensity ??
                    0.72
                ),
                {
                    save: false
                }
            );

            /*
             * Reassert the HDRI as the actual background. This is important
             * after workspace switches because older workspace code may write
             * a solid background colour.
             */
            if (
                sky.scene &&
                sky._externalEnvTexture
            ) {
                sky.scene.background =
                    sky._externalEnvTexture;

                if (
                    window.smHDRIEnvironmentEnabled !==
                    false &&
                    window.smGlobalIBLAllowed !== false
                ) {
                    if (
                        !sky.scene.environment
                    ) {
                        sky.scene.environment =
                            sky._buildExternalEnvironmentPMREM?.(
                                sky._externalEnvTexture
                            ) ||
                            sky._externalEnvTexture;
                    }

                    if (
                        'environmentIntensity' in
                        sky.scene
                    ) {
                        sky.scene.environmentIntensity =
                            Number(
                                cfg.environmentIntensity ??
                                0.72
                            );
                    }
                }

                if (
                    'backgroundIntensity' in
                    sky.scene
                ) {
                    sky.scene.backgroundIntensity =
                        Number(
                            cfg.backgroundIntensity ??
                            1
                        );
                }
            }

            sky._applyExternalEnvironmentVisualState?.();
            sky._pushSkyUniforms?.();

            /*
             * Let the HDRI analysis drive the sun direction/colour.
             * update(0) applies the new intensity contract immediately.
             */
            sky.update?.(0);

            // update() can apply workspace defaults; reassert exposure after it.
            if (renderer) {
                renderer.toneMapping =
                    THREE.ACESFilmicToneMapping;

                renderer.outputColorSpace =
                    THREE.SRGBColorSpace;

                renderer.toneMappingExposure =
                    Number(
                        cfg.exposure ??
                        0.82
                    );

                renderer.shadowMap.enabled =
                    true;

                renderer.shadowMap.type =
                    THREE.PCFShadowMap;

                renderer.shadowMap.needsUpdate =
                    true;
            }

            this._suppressProceduralVisuals();

            window.dispatchEvent(
                new CustomEvent(
                    'sm:hdri-lighting-profile-applied',
                    {
                        detail: {
                            workspace,
                            intensity:
                                cfg.environmentIntensity,
                            exposure:
                                cfg.exposure
                        }
                    }
                )
            );

            return true;
        }

        _suppressProceduralVisuals() {
            const sky = this.sky;

            if (!sky) return;

            const objects = [
                sky._sky,
                sky._cloudMesh,
                sky._starsMesh,
                sky.sky,
                sky.skyMesh,
                sky.skySphere,
                sky.atmosphere,
                sky.clouds,
                sky.stars,
                window.sky,
                window.AdvancedSky
            ].filter(Boolean);

            objects.forEach(
                object => {
                    object.visible = false;

                    object.traverse?.(
                        child => {
                            child.visible = false;
                        }
                    );
                }
            );
        }

        installHooks() {
            if (this.installed) {
                return true;
            }

            const sky = this.sky;

            if (!sky) {
                return false;
            }

            /*
             * WorkspaceManager/SkyLightingSystem can reapply their own profile.
             * Wrap setWorkspaceMode once so HDRI tuning always wins last.
             */
            if (
                typeof sky.setWorkspaceMode ===
                    'function' &&
                !sky.setWorkspaceMode
                    .__smHDRIProfilePatched
            ) {
                const original =
                    sky.setWorkspaceMode.bind(
                        sky
                    );

                const profile = this;

                const wrapped =
                    function (...args) {
                        const result =
                            original(...args);

                        setTimeout(
                            () => {
                                profile.apply(
                                    args[0]
                                );
                            },
                            0
                        );

                        setTimeout(
                            () => {
                                profile.apply(
                                    args[0]
                                );
                            },
                            80
                        );

                        return result;
                    };

                wrapped.__smHDRIProfilePatched =
                    true;

                sky.setWorkspaceMode =
                    wrapped;
            }

            this.installed = true;

            return true;
        }
    }

    window.SMHDRILightingProfile =
        window.SMHDRILightingProfile ||
        new SMHDRILightingProfile();
})();
