(function () {
    'use strict';

    class SMWaterShoreFoamMaterialFactory {
        static defaults() {
            return {
                foamColor: '#eefcff',
                riverbankFoamOpacity: 0.92,
                riverbankFoamFlow: 1.0,
                riverbankFoamNoiseScale: 1.25,
                riverbankFoamBreakup: 0.58,
                riverbankFoamEdgeSoftness: 0.18,
                riverbankFoamTextureScale: 1.0,
                riverbankFoamTextureA: 'assets/water/foam/shore_foam_lace.png',
                riverbankFoamTextureB: 'assets/water/foam/shore_foam_cells.png',
                riverbankFoamUseTextures: true
            };
        }

        static _makeProceduralTexture(seed = 0) {
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', { alpha: true });
            const image = ctx.createImageData(size, size);

            const hash = (x, y) => {
                const n = Math.sin(
                    (x + seed * 17.13) * 12.9898 +
                    (y - seed * 9.71) * 78.233
                ) * 43758.5453;
                return n - Math.floor(n);
            };

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    const v = y / size;
                    const n0 = hash(Math.floor(u * 22), Math.floor(v * 28));
                    const n1 = hash(Math.floor(u * 46) + 7, Math.floor(v * 38) - 3);
                    const wave =
                        0.5 +
                        0.5 *
                        Math.sin(
                            u * Math.PI * (18 + seed * 2) +
                            Math.sin(v * 17 + seed) * 2.2
                        );
                    const cells = Math.abs(n0 - n1);
                    let a = THREE.MathUtils.clamp(
                        wave * 0.48 + cells * 0.90 - 0.28,
                        0,
                        1
                    );
                    a = Math.pow(a, 1.6);
                    const i = (y * size + x) * 4;
                    image.data[i] = 255;
                    image.data[i + 1] = 255;
                    image.data[i + 2] = 255;
                    image.data[i + 3] = Math.round(a * 255);
                }
            }

            ctx.putImageData(image, 0, 0);
            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            return texture;
        }

        static _loadTexture(path, fallback, onLoaded = null) {
            if (!path) return fallback;
            const loader = new THREE.TextureLoader();
            const texture = fallback;
            loader.load(
                path,
                loaded => {
                    loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
                    loaded.minFilter = THREE.LinearMipmapLinearFilter;
                    loaded.magFilter = THREE.LinearFilter;
                    loaded.generateMipmaps = true;
                    onLoaded?.(loaded);
                },
                undefined,
                () => {}
            );
            return texture;
        }

        static create(options = {}) {
            const o = { ...this.defaults(), ...options };
            const fallbackA = this._makeProceduralTexture(1);
            const fallbackB = this._makeProceduralTexture(2);

            const material = new THREE.ShaderMaterial({
                name: 'SMWaterShoreFoamMaterial',
                transparent: true,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
                blending: THREE.NormalBlending,
                toneMapped: false,
                uniforms: {
                    uTime: { value: 0 },
                    uColor: { value: new THREE.Color(o.foamColor) },
                    uOpacity: { value: Number(o.riverbankFoamOpacity) || 0.92 },
                    uFlow: { value: Number(o.riverbankFoamFlow) || 1 },
                    uNoiseScale: { value: Number(o.riverbankFoamNoiseScale) || 1.25 },
                    uBreakup: { value: Number(o.riverbankFoamBreakup) || 0.58 },
                    uEdgeSoftness: { value: Number(o.riverbankFoamEdgeSoftness) || 0.18 },
                    uTextureScale: { value: Number(o.riverbankFoamTextureScale) || 1 },
                    uTexA: { value: fallbackA },
                    uTexB: { value: fallbackB },
                    uUseTextures: { value: o.riverbankFoamUseTextures === false ? 0 : 1 }
                },
                vertexShader: `
                    attribute float aFoamIntensity;
                    attribute float aCrown;
                    varying vec2 vUv;
                    varying float vFoamIntensity;
                    varying float vCrown;
                    varying vec3 vWorldPosition;

                    void main() {
                        vUv = uv;
                        vFoamIntensity = aFoamIntensity;
                        vCrown = aCrown;
                        vec4 world = modelMatrix * vec4(position, 1.0);
                        vWorldPosition = world.xyz;
                        gl_Position = projectionMatrix * viewMatrix * world;
                    }
                `,
                fragmentShader: `
                    precision highp float;

                    uniform float uTime;
                    uniform vec3 uColor;
                    uniform float uOpacity;
                    uniform float uFlow;
                    uniform float uNoiseScale;
                    uniform float uBreakup;
                    uniform float uEdgeSoftness;
                    uniform float uTextureScale;
                    uniform sampler2D uTexA;
                    uniform sampler2D uTexB;
                    uniform float uUseTextures;

                    varying vec2 vUv;
                    varying float vFoamIntensity;
                    varying float vCrown;
                    varying vec3 vWorldPosition;

                    float hash(vec2 p) {
                        return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
                    }

                    float noise(vec2 p) {
                        vec2 i = floor(p);
                        vec2 f = fract(p);
                        f = f * f * (3.0 - 2.0 * f);
                        float a = hash(i);
                        float b = hash(i + vec2(1.0,0.0));
                        float c = hash(i + vec2(0.0,1.0));
                        float d = hash(i + vec2(1.0,1.0));
                        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
                    }

                    void main() {
                        float across = clamp(vUv.x, 0.0, 1.0);
                        float bankEdge = smoothstep(
                            0.0,
                            max(uEdgeSoftness, 0.001),
                            across
                        );
                        float innerEdge = 1.0 - smoothstep(
                            0.70,
                            1.0,
                            across
                        );
                        float widthMask = bankEdge * innerEdge;

                        vec2 uvA = vec2(
                            across * 2.2,
                            vUv.y * uTextureScale - uTime * (0.10 + uFlow * 0.12)
                        );
                        vec2 uvB = vec2(
                            across * 3.7 + 0.17,
                            vUv.y * uTextureScale * 1.37 - uTime * (0.16 + uFlow * 0.18)
                        );

                        float texA = texture2D(uTexA, uvA).a;
                        float texB = texture2D(uTexB, uvB).a;
                        float procedural =
                            noise(vWorldPosition.xz * uNoiseScale + vec2(uTime * 0.03, -uTime * 0.05));

                        float textureFoam = mix(
                            0.55 + procedural * 0.45,
                            max(texA, texB * 0.86),
                            step(0.5, uUseTextures)
                        );

                        float breakup = smoothstep(
                            uBreakup - 0.22,
                            uBreakup + 0.18,
                            textureFoam * (0.72 + procedural * 0.48)
                        );

                        float crownBoost = mix(0.88, 1.15, clamp(vCrown, 0.0, 1.0));
                        float alpha =
                            widthMask *
                            breakup *
                            clamp(vFoamIntensity, 0.0, 1.35) *
                            uOpacity *
                            crownBoost;

                        if (alpha < 0.012) discard;

                        vec3 color = uColor * (
                            0.90 +
                            procedural * 0.10 +
                            vCrown * 0.08
                        );

                        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.98));
                    }
                `
            });

            material.userData.smShoreFoamOptions = { ...o };
            material.userData.smFallbackTextures = [fallbackA, fallbackB];

            if (o.riverbankFoamUseTextures !== false) {
                this._loadTexture(
                    o.riverbankFoamTextureA,
                    fallbackA,
                    loaded => {
                        const old = material.uniforms.uTexA.value;
                        material.uniforms.uTexA.value = loaded;
                        if (old && old !== fallbackA) old.dispose?.();
                    }
                );
                this._loadTexture(
                    o.riverbankFoamTextureB,
                    fallbackB,
                    loaded => {
                        const old = material.uniforms.uTexB.value;
                        material.uniforms.uTexB.value = loaded;
                        if (old && old !== fallbackB) old.dispose?.();
                    }
                );
            }

            return material;
        }

        static apply(material, patch = {}) {
            if (!material?.uniforms) return;
            const u = material.uniforms;

            if (patch.foamColor !== undefined) u.uColor.value.set(patch.foamColor);
            if (patch.riverbankFoamOpacity !== undefined) u.uOpacity.value = Number(patch.riverbankFoamOpacity);
            if (patch.riverbankFoamFlow !== undefined) u.uFlow.value = Number(patch.riverbankFoamFlow);
            if (patch.riverbankFoamNoiseScale !== undefined) u.uNoiseScale.value = Number(patch.riverbankFoamNoiseScale);
            if (patch.riverbankFoamBreakup !== undefined) u.uBreakup.value = Number(patch.riverbankFoamBreakup);
            if (patch.riverbankFoamEdgeSoftness !== undefined) u.uEdgeSoftness.value = Number(patch.riverbankFoamEdgeSoftness);
            if (patch.riverbankFoamTextureScale !== undefined) u.uTextureScale.value = Number(patch.riverbankFoamTextureScale);
            if (patch.riverbankFoamUseTextures !== undefined) u.uUseTextures.value = patch.riverbankFoamUseTextures === false ? 0 : 1;

            Object.assign(
                material.userData.smShoreFoamOptions ||
                (material.userData.smShoreFoamOptions = {}),
                patch
            );
        }

        static update(material, time = 0) {
            if (material?.uniforms?.uTime) {
                material.uniforms.uTime.value = Number(time) || 0;
            }
        }

        static dispose(material) {
            const textures = new Set([
                material?.uniforms?.uTexA?.value,
                material?.uniforms?.uTexB?.value,
                ...(material?.userData?.smFallbackTextures || [])
            ]);
            for (const texture of textures) texture?.dispose?.();
            material?.dispose?.();
        }
    }

    window.SMWaterShoreFoamMaterialFactory = SMWaterShoreFoamMaterialFactory;
})();