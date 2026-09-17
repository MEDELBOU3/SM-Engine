(function () {
    'use strict';

    const MAX_VOLUMETRIC_LIGHTS = 4;

    class SMWaterUnderwaterRenderer {
        constructor(
            renderer,
            options = {}
        ) {
            if (!renderer) {
                throw new Error(
                    'SMWaterUnderwaterRenderer requires a THREE.WebGLRenderer'
                );
            }

            if (
                !window
                    .SMWaterUnderwaterMaterialFactory
            ) {
                throw new Error(
                    'Load WaterUnderwaterMaterial.js before WaterUnderwaterRenderer.js'
                );
            }

            this.renderer =
                renderer;

            this.enabled =
                options.enabled !==
                false;

            this.time = 0;

            this._size =
                new THREE.Vector2();

            this._savedViewport =
                new THREE.Vector4();

            this._savedScissor =
                new THREE.Vector4();

            this._cameraWorld =
                new THREE.Vector3();

            this._sunPosition =
                new THREE.Vector3();

            this._sunTarget =
                new THREE.Vector3();

            this._sunDirection =
                new THREE.Vector3(
                    0.32,
                    0.92,
                    0.22
                ).normalize();

            this._localLightPosition =
                new THREE.Vector3();

            this._localLightTarget =
                new THREE.Vector3();

            this._localLightDirection =
                new THREE.Vector3();

            this._volumetricLightRefs =
                [];

            this._lastVolumetricLightScanAt =
                -Infinity;

            this._lastVolumetricLightRootCount =
                -1;

            this._volumetricLightScene =
                null;

            this.target =
                this._createTarget(
                    2,
                    2
                );

            this.material =
                SMWaterUnderwaterMaterialFactory
                    .create(
                        options
                    );

            this._validateMaterialContract();

            this.quadScene =
                new THREE.Scene();

            this.quadCamera =
                new THREE.OrthographicCamera(
                    -1,
                    1,
                    1,
                    -1,
                    0,
                    1
                );

            this.quad =
                new THREE.Mesh(
                    new THREE.PlaneGeometry(
                        2,
                        2
                    ),
                    this.material
                );

            this.quad.frustumCulled =
                false;

            this.quadScene.add(
                this.quad
            );
        }

        _validateMaterialContract() {
            const uniforms =
                this.material?.uniforms ||
                {};

            const requiredUniforms = [
                'tSceneColor',
                'tSceneDepth',
                'uProjectionInverse',
                'uCameraMatrixWorld',
                'uCameraWorldPosition',
                'uResolution',
                'uTime',
                'uScatteringColor',
                'uDeepColor',
                'uAbsorption',
                'uDensity',
                'uOpticalDensity',
                'uVisibility',
                'uScatterStrength',
                'uDistortion',
                'uCausticsStrength',
                'uCausticsScale',
                'uCausticsSpeed',
                'uSurfaceGlow',
                'uSunScatterStrength',
                'uAnisotropy',
                'uTurbidity',
                'uDepthDarkening',
                'uVignette',
                'uBrightness',
                'uContrast',
                'uUseLogDepth',
                'uLogDepthBufFC',
                'uCameraDepth',
                'uSurfaceY',
                'uWaterDepth',
                'uSunDirection',
                'uSunColor',
                'uSunIntensity',
                'uGodRayStrength',
                'uGodRayQuality',
                'uGodRayDepthFalloff',
                'uGodRayNoiseScale',
                'uGodRayNoiseSpeed',
                'uLocalLightStrength',
                'uLocalLightLimit',
                'uVolumetricLightCount',
                'uVolumetricLightPositionRange',
                'uVolumetricLightDirectionCone',
                'uVolumetricLightColorIntensity'
            ];

            const missing =
                requiredUniforms.filter(
                    name =>
                        !uniforms[name]
                );

            if (missing.length) {
                const message =
                    '[SMWaterUnderwaterRenderer] Incompatible ' +
                    'WaterUnderwaterMaterial.js. Missing uniforms: ' +
                    missing.join(', ');

                console.error(message);

                throw new Error(message);
            }

            console.info(
                '[SMWaterUnderwaterRenderer] Shader contract OK:',
                requiredUniforms.length,
                'uniforms validated.'
            );

            return true;
        }

        _chooseTargetType() {
            const renderer =
                this.renderer;

            const isWebGL2 =
                !!renderer
                    ?.capabilities
                    ?.isWebGL2;

            const hasFloatColor =
                !!renderer
                    ?.extensions
                    ?.has?.(
                        'EXT_color_buffer_float'
                    );

            if (
                isWebGL2 &&
                hasFloatColor &&
                THREE.HalfFloatType !==
                undefined
            ) {
                return THREE.HalfFloatType;
            }

            return THREE.UnsignedByteType;
        }

        _createTarget(
            width,
            height
        ) {
            const target =
                new THREE.WebGLRenderTarget(
                    width,
                    height,
                    {
                        minFilter:
                            THREE.LinearFilter,

                        magFilter:
                            THREE.LinearFilter,

                        format:
                            THREE.RGBAFormat,

                        type:
                            this._chooseTargetType(),

                        depthBuffer: true,
                        stencilBuffer: false
                    }
                );

            target.texture.name =
                'SMWaterUnderwaterSceneColor';

            target.texture.generateMipmaps =
                false;

            if (
                'colorSpace' in
                target.texture &&
                THREE.LinearSRGBColorSpace !==
                undefined
            ) {
                target.texture.colorSpace =
                    THREE.LinearSRGBColorSpace;
            } else if (
                'encoding' in
                target.texture &&
                THREE.LinearEncoding !==
                undefined
            ) {
                target.texture.encoding =
                    THREE.LinearEncoding;
            }

            target.depthTexture =
                new THREE.DepthTexture(
                    width,
                    height,
                    THREE.UnsignedIntType
                );

            target.depthTexture.name =
                'SMWaterUnderwaterSceneDepth';

            target.depthTexture.format =
                THREE.DepthFormat;

            target.depthTexture.type =
                THREE.UnsignedIntType;

            return target;
        }

        resizeToRenderer() {
            this.renderer
                .getDrawingBufferSize(
                    this._size
                );

            const width =
                Math.max(
                    1,
                    Math.floor(
                        this._size.x
                    )
                );

            const height =
                Math.max(
                    1,
                    Math.floor(
                        this._size.y
                    )
                );

            if (
                this.target.width !==
                    width ||
                this.target.height !==
                    height
            ) {
                this.target.setSize(
                    width,
                    height
                );
            }

            this.material.uniforms
                .uResolution
                .value
                .set(
                    width,
                    height
                );
        }

        setOptions(
            patch = {}
        ) {
            SMWaterUnderwaterMaterialFactory
                .apply(
                    this.material,
                    patch
                );
        }

        _applyBody(
            body
        ) {
            if (!body) {
                return;
            }

            const config = {
                ...(
                    body.material
                        ?.userData
                        ?.smWaterOptions ||
                    {}
                ),

                ...(
                    body.config ||
                    {}
                )
            };

            if (
                config.underwaterScatteringColor ===
                    undefined &&
                config.underwaterFogColor !==
                    undefined
            ) {
                config.underwaterScatteringColor =
                    config
                        .underwaterFogColor;
            }

            if (
                config.underwaterDeepColor ===
                    undefined &&
                config.deepColor !==
                    undefined
            ) {
                config.underwaterDeepColor =
                    config.deepColor;
            }

            SMWaterUnderwaterMaterialFactory
                .apply(
                    this.material,
                    config
                );
        }

        _resolveSun(
            scene
        ) {
            let best = null;
            let bestScore = -Infinity;

            scene?.traverse?.(
                object => {
                    if (
                        !object
                            ?.isDirectionalLight ||
                        object.visible ===
                            false
                    ) {
                        return;
                    }

                    const score =
                        Math.max(
                            0,
                            Number(
                                object.intensity
                            ) ||
                            0
                        );

                    if (
                        score >
                        bestScore
                    ) {
                        bestScore =
                            score;

                        best =
                            object;
                    }
                }
            );

            if (!best) {
                const fallback =
                    window
                        .skyLightingSystem
                        ?.sunLight ||
                    window.sunLight ||
                    null;

                if (
                    fallback
                        ?.isDirectionalLight
                ) {
                    best =
                        fallback;
                }
            }

            if (!best) {
                return {
                    direction:
                        this
                            ._sunDirection
                            .set(
                                0.32,
                                0.92,
                                0.22
                            )
                            .normalize(),

                    color:
                        new THREE.Color(
                            0xffefd2
                        ),

                    intensity:
                        1.0
                };
            }

            best.getWorldPosition?.(
                this._sunPosition
            );

            if (
                best.target
                    ?.getWorldPosition
            ) {
                best.target
                    .getWorldPosition(
                        this._sunTarget
                    );
            } else {
                this._sunTarget
                    .set(
                        0,
                        0,
                        0
                    );
            }

            this._sunDirection
                .copy(
                    this._sunPosition
                )
                .sub(
                    this._sunTarget
                );

            if (
                this._sunDirection
                    .lengthSq() <
                1e-8
            ) {
                this._sunDirection
                    .set(
                        0.32,
                        0.92,
                        0.22
                    );
            }

            this._sunDirection
                .normalize();

            return {
                direction:
                    this._sunDirection,

                color:
                    best.color ||
                    new THREE.Color(
                        0xffefd2
                    ),

                intensity:
                    Math.max(
                        0,
                        Number(
                            best.intensity
                        ) ||
                        0
                    )
            };
        }

        _refreshVolumetricLightRefs(
            scene
        ) {
            const rootCount =
                scene?.children?.length ||
                0;

            // Scene traversal is deliberately throttled. Light transforms are
            // still read every frame below, while discovering added/removed
            // Point and Spot lights happens a few times per second.
            if (
                this._volumetricLightScene ===
                    scene &&
                this.time -
                    this._lastVolumetricLightScanAt <
                    0.75 &&
                rootCount ===
                    this._lastVolumetricLightRootCount
            ) {
                return;
            }

            this._volumetricLightRefs = [];

            scene?.traverse?.(
                object => {
                    if (
                        !(
                            object?.isPointLight ||
                            object?.isSpotLight
                        ) ||
                        object.userData
                            ?.underwaterGodRays ===
                            false
                    ) {
                        return;
                    }

                    this._volumetricLightRefs.push(
                        object
                    );
                }
            );

            this._volumetricLightScene =
                scene;
            this._lastVolumetricLightScanAt =
                this.time;
            this._lastVolumetricLightRootCount =
                rootCount;
        }

        _updateVolumetricLocalLights(
            scene,
            surfaceY
        ) {
            const uniforms =
                this.material.uniforms;
            const positions =
                uniforms
                    .uVolumetricLightPositionRange
                    .value;
            const directions =
                uniforms
                    .uVolumetricLightDirectionCone
                    .value;
            const colors =
                uniforms
                    .uVolumetricLightColorIntensity
                    .value;

            for (
                let i = 0;
                i < MAX_VOLUMETRIC_LIGHTS;
                i++
            ) {
                positions[i].set(
                    0,
                    -999999,
                    0,
                    0
                );
                directions[i].set(
                    0,
                    -1,
                    0,
                    -1
                );
                colors[i].set(
                    0,
                    0,
                    0,
                    0
                );
            }

            this._refreshVolumetricLightRefs(
                scene
            );

            const authoredLimit =
                Number(
                    uniforms
                        .uLocalLightLimit
                        .value
                );
            const limit =
                THREE.MathUtils.clamp(
                    Math.round(
                        Number.isFinite(
                            authoredLimit
                        )
                            ? authoredLimit
                            : MAX_VOLUMETRIC_LIGHTS
                    ),
                    0,
                    MAX_VOLUMETRIC_LIGHTS
                );

            if (limit <= 0) {
                uniforms.uVolumetricLightCount.value =
                    0;
                return;
            }

            const candidates = [];

            for (
                const light of
                this._volumetricLightRefs
            ) {
                if (
                    !light?.parent ||
                    light.visible === false
                ) {
                    continue;
                }

                const intensity =
                    Math.max(
                        0,
                        Number(
                            light.intensity
                        ) ||
                        0
                    );

                if (intensity <= 0.0001) {
                    continue;
                }

                light.getWorldPosition?.(
                    this._localLightPosition
                );

                const authoredRange =
                    Number(light.distance);
                const range =
                    authoredRange > 0
                        ? THREE.MathUtils.clamp(
                            authoredRange,
                            2,
                            140
                        )
                        : THREE.MathUtils.clamp(
                            14 +
                            Math.sqrt(
                                intensity
                            ) *
                            16,
                            14,
                            72
                        );

                const cameraDistance =
                    this._localLightPosition
                        .distanceTo(
                            this._cameraWorld
                        );
                const surfaceDistance =
                    Math.abs(
                        this._localLightPosition.y -
                        surfaceY
                    );

                const score =
                    intensity *
                    (
                        light.isSpotLight
                            ? 1.25
                            : 1.0
                    ) *
                    Math.max(
                        0.18,
                        1.0 -
                        surfaceDistance /
                        Math.max(
                            range * 3.0,
                            1.0
                        )
                    ) /
                    (
                        1.0 +
                        cameraDistance *
                        0.025
                    );

                candidates.push({
                    light,
                    score,
                    range,
                    position:
                        this._localLightPosition.clone()
                });
            }

            candidates.sort(
                (a, b) =>
                    b.score -
                    a.score
            );

            const selected =
                candidates.slice(
                    0,
                    limit
                );

            selected.forEach(
                (
                    entry,
                    index
                ) => {
                    const { light, range, position } =
                        entry;
                    const intensity =
                        Math.max(
                            0,
                            Number(
                                light.intensity
                            ) ||
                            0
                        );

                    positions[index].set(
                        position.x,
                        position.y,
                        position.z,
                        range
                    );

                    if (light.isSpotLight) {
                        light.target
                            ?.getWorldPosition?.(
                                this._localLightTarget
                            );

                        this._localLightDirection
                            .copy(
                                this._localLightTarget
                            )
                            .sub(position);

                        if (
                            this._localLightDirection
                                .lengthSq() <
                            1e-8
                        ) {
                            this._localLightDirection.set(
                                0,
                                -1,
                                0
                            );
                        } else {
                            this._localLightDirection
                                .normalize();
                        }

                        directions[index].set(
                            this._localLightDirection.x,
                            this._localLightDirection.y,
                            this._localLightDirection.z,
                            Math.cos(
                                THREE.MathUtils.clamp(
                                    Number(
                                        light.angle
                                    ) ||
                                    Math.PI /
                                    6,
                                    0.02,
                                    Math.PI *
                                    0.49
                                )
                            )
                        );
                    }

                    const color =
                        light.color ||
                        new THREE.Color(
                            0xffffff
                        );

                    colors[index].set(
                        color.r,
                        color.g,
                        color.b,
                        THREE.MathUtils.clamp(
                            Math.sqrt(
                                intensity
                            ) *
                            0.62,
                            0,
                            3.5
                        )
                    );
                }
            );

            uniforms.uVolumetricLightCount.value =
                selected.length;
        }

        _updateCameraAndWaterUniforms(
            camera,
            body,
            scene
        ) {
            const uniforms =
                this.material.uniforms;

            camera.updateMatrixWorld?.(
                true
            );

            uniforms.uProjectionInverse
                .value
                .copy(
                    camera
                        .projectionMatrixInverse
                );

            uniforms.uCameraMatrixWorld
                .value
                .copy(
                    camera.matrixWorld
                );

            camera.getWorldPosition?.(
                this._cameraWorld
            );

            uniforms.uCameraWorldPosition
                .value
                .copy(
                    this._cameraWorld
                );

            const surfaceY =
                body.surfaceYAt?.(
                    this._cameraWorld.x,
                    this._cameraWorld.z,
                    true,
                    this.time
                ) ??
                this._cameraWorld.y;

            const cameraDepth =
                Math.max(
                    0,
                    surfaceY -
                    this._cameraWorld.y
                );

            const waterDepth =
                Math.max(
                    0.5,
                    Number(
                        body.depthAt?.(
                            this._cameraWorld.x,
                            this._cameraWorld.z
                        ) ??
                        body.config
                            ?.volumeDepth ??
                        body.config
                            ?.bedDepth ??
                        4
                    )
                );

            uniforms.uSurfaceY.value =
                Number(surfaceY) ||
                0;

            uniforms.uCameraDepth.value =
                cameraDepth;

            uniforms.uWaterDepth.value =
                waterDepth;

            const usesLogDepth =
                !!(
                    camera
                        .isPerspectiveCamera &&
                    this.renderer
                        ?.capabilities
                        ?.logarithmicDepthBuffer
                );

            uniforms.uUseLogDepth.value =
                usesLogDepth
                    ? 1
                    : 0;

            const far =
                Math.max(
                    1.0,
                    Number(
                        camera.far
                    ) ||
                    3000
                );

            uniforms.uLogDepthBufFC.value =
                2.0 /
                (
                    Math.log(
                        far + 1.0
                    ) /
                    Math.LN2
                );

            const sun =
                this._resolveSun(
                    scene
                );

            uniforms.uSunDirection
                .value
                .copy(
                    sun.direction
                );

            uniforms.uSunColor
                .value
                .copy(
                    sun.color
                );

            uniforms.uSunIntensity.value =
                sun.intensity;

            this._updateVolumetricLocalLights(
                scene,
                Number(surfaceY) || 0
            );
        }

        render(
            scene,
            camera,
            body,
            time = 0
        ) {
            if (
                !this.enabled ||
                !scene ||
                !camera ||
                !body
            ) {
                this.renderer.render(
                    scene,
                    camera
                );

                return false;
            }

            this.resizeToRenderer();

            this.time =
                Number(time) ||
                0;

            this._applyBody(
                body
            );

            this._updateCameraAndWaterUniforms(
                camera,
                body,
                scene
            );

            const renderer =
                this.renderer;

            const uniforms =
                this.material.uniforms;

            uniforms.uTime.value =
                this.time;

            uniforms.tSceneColor.value =
                this.target.texture;

            uniforms.tSceneDepth.value =
                this.target.depthTexture;

            const oldTarget =
                renderer.getRenderTarget();

            const oldAutoClear =
                renderer.autoClear;

            const oldScissorTest =
                renderer.getScissorTest();

            renderer.getViewport(
                this._savedViewport
            );

            renderer.getScissor(
                this._savedScissor
            );

            renderer.autoClear =
                true;

            renderer.setRenderTarget(
                this.target
            );

            renderer.setScissorTest(
                false
            );

            renderer.setViewport(
                0,
                0,
                this.target.width,
                this.target.height
            );

            renderer.clear(
                true,
                true,
                true
            );

            renderer.render(
                scene,
                camera
            );

            renderer.setRenderTarget(
                oldTarget
            );

            renderer.setViewport(
                this._savedViewport
            );

            if (
                oldScissorTest
            ) {
                renderer.setScissor(
                    this._savedScissor
                );

                renderer.setScissorTest(
                    true
                );
            } else {
                renderer.setScissorTest(
                    false
                );
            }

            renderer.render(
                this.quadScene,
                this.quadCamera
            );

            renderer.autoClear =
                oldAutoClear;

            return true;
        }

        dispose() {
            this.quad
                ?.geometry
                ?.dispose?.();

            this.material
                ?.dispose?.();

            this.target
                ?.depthTexture
                ?.dispose?.();

            this.target
                ?.dispose?.();

            this.quadScene
                ?.remove?.(
                    this.quad
                );

            this.quad = null;
            this.material = null;
            this.target = null;
        }
    }

    window.SMWaterUnderwaterRenderer =
        SMWaterUnderwaterRenderer;
})();
