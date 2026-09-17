// ============================================================================
// assets/addObject/scene-objects/light-volumetrics.js
// SM Engine — Cinematic Light Visuals
//
// Editor visual helper only.
// The real illumination remains the Three.js light.
//
// IMPORTANT:
//   - Point lights: soft glow only
//   - Spot / directional lights: cone-first glow
//   - NO white sphere around lights
//   - NO lens-flare hexagons / streaks
// ============================================================================

(function () {
    "use strict";

    const LAYER = 30;

    const CONFIG = {
        // Small source glow. This is a sprite, NOT a sphere.
        sourceGlowSize: 0.42,
        sourceGlowOpacity: 0.34,

        // Main beam.
        coneLength: 5.0,
        coneOpacity: 0.075,
        coneSegments: 48,

        // Beam edge / atmosphere.
        edgeOpacity: 0.035,

        // Subtle breathing only.
        pulseAmount: 0.012,
        pulseSpeed: 0.65,

        maxUpdateLights: 64
    };

    let _sourceTexture = null;
    let _coneTexture = null;

    // ========================================================================
    // TEXTURES
    // ========================================================================

    function makeSourceTexture(size = 128) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        const g = ctx.createRadialGradient(
            size * 0.5,
            size * 0.5,
            0,
            size * 0.5,
            size * 0.5,
            size * 0.5
        );

        g.addColorStop(0.00, "rgba(255,255,255,0.95)");
        g.addColorStop(0.08, "rgba(255,252,242,0.72)");
        g.addColorStop(0.22, "rgba(255,242,215,0.28)");
        g.addColorStop(0.48, "rgba(255,225,185,0.075)");
        g.addColorStop(1.00, "rgba(255,210,170,0.00)");

        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);

        if ("colorSpace" in texture && THREE.SRGBColorSpace) {
            texture.colorSpace = THREE.SRGBColorSpace;
        }

        texture.needsUpdate = true;
        return texture;
    }

    function makeConeTexture(size = 256) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        // Radial gradient gives the beam a soft center-to-edge falloff.
        const radial = ctx.createRadialGradient(
            size * 0.5,
            size * 0.5,
            0,
            size * 0.5,
            size * 0.5,
            size * 0.5
        );

        radial.addColorStop(0.00, "rgba(255,255,255,0.90)");
        radial.addColorStop(0.16, "rgba(255,250,235,0.54)");
        radial.addColorStop(0.38, "rgba(255,238,210,0.19)");
        radial.addColorStop(0.65, "rgba(255,220,185,0.055)");
        radial.addColorStop(1.00, "rgba(255,205,165,0.00)");

        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);

        if ("colorSpace" in texture && THREE.SRGBColorSpace) {
            texture.colorSpace = THREE.SRGBColorSpace;
        }

        texture.needsUpdate = true;
        return texture;
    }

    function getSourceTexture() {
        if (!_sourceTexture) {
            _sourceTexture = makeSourceTexture();
        }
        return _sourceTexture;
    }

    function getConeTexture() {
        if (!_coneTexture) {
            _coneTexture = makeConeTexture();
        }
        return _coneTexture;
    }

    // ========================================================================
    // SOURCE GLOW — sprite only, never a sphere
    // ========================================================================

    function createSourceGlow(light) {
        const color = light.color?.clone?.() || new THREE.Color(0xffffff);

        const material = new THREE.SpriteMaterial({
            map: getSourceTexture(),
            color,
            transparent: true,
            opacity: CONFIG.sourceGlowOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            fog: false,
            sizeAttenuation: true
        });

        const sprite = new THREE.Sprite(material);

        sprite.name = "LightSourceGlow";
        sprite.scale.set(
            CONFIG.sourceGlowSize,
            CONFIG.sourceGlowSize,
            1
        );

        sprite.layers.set(LAYER);
        sprite.renderOrder = -12;
        sprite.userData.isLightSourceGlow = true;

        return sprite;
    }

    // ========================================================================
    // VOLUMETRIC SPOT / DIRECTIONAL CONE
    // ========================================================================

    function createCone(light) {
        const isSpot = !!light.isSpotLight;

        const angle = isSpot
            ? Math.min(
                Math.PI * 0.48,
                Math.max(0.035, light.angle || Math.PI / 6)
            )
            : Math.PI / 12;

        let length = CONFIG.coneLength;

        if (Number.isFinite(light.distance) && light.distance > 0) {
            length = Math.min(
                CONFIG.coneLength,
                Math.max(0.5, light.distance * 0.45)
            );
        }

        const radius = Math.max(
            0.025,
            Math.tan(angle) * length
        );

        const geometry = new THREE.CylinderGeometry(
            radius,
            0.008,
            length,
            CONFIG.coneSegments,
            1,
            true
        );

        // Three.js cylinder axis is Y.
        // Convert it to the light's forward -Z direction.
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, 0, -length * 0.5);

        const color = light.color?.clone?.() || new THREE.Color(0xffffff);

        const material = new THREE.MeshBasicMaterial({
            map: getConeTexture(),
            color,
            transparent: true,
            opacity: CONFIG.coneOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            fog: false
        });

        const cone = new THREE.Mesh(geometry, material);

        cone.name = "LightVolumetricCone";
        cone.layers.set(LAYER);
        cone.renderOrder = -11;

        cone.userData.isLightVolumetricCone = true;
        cone.userData.smConeLength = length;
        cone.userData.smConeAngle = angle;

        return cone;
    }

    // ========================================================================
    // VERY SOFT OUTER BEAM
    // ========================================================================

    function createOuterBeam(light) {
        const isSpot = !!light.isSpotLight;

        const angle = isSpot
            ? Math.min(
                Math.PI * 0.48,
                Math.max(0.035, light.angle || Math.PI / 6)
            )
            : Math.PI / 12;

        const length = CONFIG.coneLength;
        const radius = Math.max(
            0.04,
            Math.tan(angle) * length
        );

        const geometry = new THREE.CylinderGeometry(
            radius * 1.015,
            0.01,
            length,
            CONFIG.coneSegments,
            1,
            true
        );

        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, 0, -length * 0.5);

        const color = light.color?.clone?.() || new THREE.Color(0xffffff);

        const material = new THREE.MeshBasicMaterial({
            map: getConeTexture(),
            color,
            transparent: true,
            opacity: CONFIG.edgeOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            fog: false
        });

        const beam = new THREE.Mesh(geometry, material);

        beam.name = "LightVolumetricOuter";
        beam.layers.set(LAYER);
        beam.renderOrder = -10;
        beam.userData.isLightVolumetricOuter = true;

        return beam;
    }

    // ========================================================================
    // ATTACH
    // ========================================================================

    function attach(light) {
        if (!light?.isLight) return null;

        detach(light);

        const group = new THREE.Group();

        group.name = `LightVisual_${light.name || light.type || "Light"}`;

        group.userData = {
            isSystemObject: true,
            isEditorHelper: true,
            editorOnly: true,
            isLightVisual: true,
            ignoreInHierarchy: true,
            ignoreInTimeline: true,
            ignoreSelection: true,
            ignoreRaycast: true
        };

        group.layers.set(LAYER);

        // No SphereGeometry here.
        const sourceGlow = createSourceGlow(light);
        group.add(sourceGlow);

        let cone = null;
        let outer = null;

        if (light.isSpotLight || light.isDirectionalLight) {
            cone = createCone(light);
            outer = createOuterBeam(light);

            group.add(cone, outer);
        }

        light.add(group);

        light.userData = light.userData || {};

        light.userData.lightVisual = group;
        light.userData.lightVisualGlow = sourceGlow;
        light.userData.lightVisualCone = cone;
        light.userData.lightVisualOuter = outer;
        light.userData.lightVisualColor =
            light.color?.getHex?.() ?? 0xffffff;

        return group;
    }

    // ========================================================================
    // DETACH / DISPOSE
    // ========================================================================

    function disposeObject(root) {
        root?.traverse?.((object) => {
            object.geometry?.dispose?.();

            const material = object.material;

            if (!material) return;

            if (Array.isArray(material)) {
                material.forEach((m) => m.dispose?.());
            } else {
                material.dispose?.();
            }
        });
    }

    function detach(light) {
        const group = light?.userData?.lightVisual;

        if (!group) return false;

        group.parent?.remove(group);
        disposeObject(group);

        delete light.userData.lightVisual;
        delete light.userData.lightVisualGlow;
        delete light.userData.lightVisualCone;
        delete light.userData.lightVisualOuter;
        delete light.userData.lightVisualColor;

        return true;
    }

    // ========================================================================
    // UPDATE
    // ========================================================================

    let _clock = 0;

    function update(deltaTime) {
        _clock += deltaTime;

        const scene = window.scene;

        if (!scene) return;

        let count = 0;

        scene.traverse((light) => {
            if (count >= CONFIG.maxUpdateLights) return;
            if (!light?.isLight) return;

            const group = light.userData?.lightVisual;

            if (!group) return;

            count++;

            const glow = light.userData.lightVisualGlow;

            if (glow) {
                const pulse =
                    1 +
                    Math.sin(
                        _clock * CONFIG.pulseSpeed +
                        light.id * 0.31
                    ) *
                    CONFIG.pulseAmount;

                glow.scale.set(
                    CONFIG.sourceGlowSize * pulse,
                    CONFIG.sourceGlowSize * pulse,
                    1
                );

                glow.material.opacity =
                    CONFIG.sourceGlowOpacity;
            }

            // If the user changes light color, rebuild the visual materials.
            const currentColor =
                light.color?.getHex?.() ?? 0xffffff;

            if (
                light.userData.lightVisualColor !== currentColor
            ) {
                refresh(light);
            }
        });
    }

    // ========================================================================
    // HOOK
    // ========================================================================

    function hook() {
        const creators = [
            "createManagedPointLight",
            "createManagedSunLight",
            "createManagedSpotLight",
            "createManagedDirectionalLight",
            "createManagedHemisphereLight",
            "createManagedAreaLight"
        ];

        const missing = creators.some(
            (name) => typeof window[name] !== "function"
        );

        if (missing) {
            setTimeout(hook, 100);
            return;
        }

        creators.forEach((name) => {
            const original = window[name];

            if (
                typeof original !== "function" ||
                original.__smLightVisualHooked
            ) {
                return;
            }

            const wrapped = function (...args) {
                const light = original.apply(this, args);

                if (
                    light &&
                    !light.userData?.lightVisual
                ) {
                    requestAnimationFrame(() => attach(light));
                }

                return light;
            };

            wrapped.__smLightVisualHooked = true;
            wrapped.__original = original;

            window[name] = wrapped;
        });

        window.scene?.traverse?.((object) => {
            if (
                object?.isLight &&
                !object.userData?.lightVisual
            ) {
                attach(object);
            }
        });

        console.log(
            "[Light Visual] Cinematic cone presentation hooked"
        );
    }

    // ========================================================================
    // LOOP
    // ========================================================================

    let _lastTime = performance.now();
    let _rafHandle = 0;

    function loop() {
        const now = performance.now();

        const dt = Math.min(
            (now - _lastTime) / 1000,
            0.1
        );

        _lastTime = now;

        try {
            update(dt);
        } catch {}

        _rafHandle = requestAnimationFrame(loop);
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    window.SMLightVisual = {
        config: CONFIG,

        attach,
        detach,

        refresh(light) {
            if (!light?.isLight) return null;
            detach(light);
            return attach(light);
        },

        setGlowVisible(light, visible) {
            const glow = light?.userData?.lightVisualGlow;
            if (glow) glow.visible = !!visible;
        },

        setConeVisible(light, visible) {
            const cone = light?.userData?.lightVisualCone;
            const outer = light?.userData?.lightVisualOuter;

            if (cone) cone.visible = !!visible;
            if (outer) outer.visible = !!visible;
        },

        setGlowStrength(light, value) {
            const glow = light?.userData?.lightVisualGlow;

            if (!glow?.material) return;

            glow.material.opacity = Math.max(
                0,
                Math.min(2, Number(value) || 0)
            );
        },

        setConeStrength(light, value) {
            const cone = light?.userData?.lightVisualCone;
            const outer = light?.userData?.lightVisualOuter;

            const v = Math.max(
                0,
                Math.min(1, Number(value) || 0)
            );

            if (cone?.material) {
                cone.material.opacity = v;
            }

            if (outer?.material) {
                outer.material.opacity = v * 0.45;
            }
        },

        dispose() {
            window.scene?.traverse?.((object) => {
                if (object?.isLight) {
                    detach(object);
                }
            });

            if (_rafHandle) {
                cancelAnimationFrame(_rafHandle);
                _rafHandle = 0;
            }
        }
    };

    // ========================================================================
    // BOOT
    // ========================================================================

    function boot() {
        // Remove legacy helper visuals.
        window.scene?.traverse?.((object) => {
            if (object.userData?.lightVolumetrics) {
                try {
                    object.userData.lightVolumetrics.parent?.remove(
                        object.userData.lightVolumetrics
                    );
                    delete object.userData.lightVolumetrics;
                } catch {}
            }

            if (object.userData?.lightLensFlare) {
                try {
                    object.userData.lightLensFlare.parent?.remove(
                        object.userData.lightLensFlare
                    );
                    delete object.userData.lightLensFlare;
                } catch {}
            }

            // Remove old LightCore objects created by previous versions.
            if (object.userData?.isLightCore) {
                object.parent?.remove(object);
            }
        });

        hook();

        _rafHandle = requestAnimationFrame(loop);

        console.log(
            "[Light Visual] Cinematic spotlight visuals ready"
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            boot,
            { once: true }
        );
    } else {
        setTimeout(boot, 150);
    }
})();
