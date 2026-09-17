(function (global) {
    'use strict';

    const SMColorGradingShader = {
        uniforms: {
            tDiffuse: { value: null },
            exposure: { value: 1 },
            contrast: { value: 1 },
            saturation: { value: 1 },
            brightness: { value: 0 },
            temperature: { value: 0 },
            tint: { value: 0 },
            shadows: { value: 0 },
            highlights: { value: 0 },
            gamma: { value: 1 },
            vignette: { value: 0.08 },
            vignetteFeather: { value: 0.45 },
            grain: { value: 0.004 },
            localExposure: { value: 0.1 },
            localExposureRadius: { value: 18 },
            time: { value: 0 },
            resolution: { value: new THREE.Vector2(1, 1) }
        },

        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,

        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float exposure;
            uniform float contrast;
            uniform float saturation;
            uniform float brightness;
            uniform float temperature;
            uniform float tint;
            uniform float shadows;
            uniform float highlights;
            uniform float gamma;
            uniform float vignette;
            uniform float vignetteFeather;
            uniform float grain;
            uniform float localExposure;
            uniform float localExposureRadius;
            uniform float time;
            uniform vec2 resolution;
            varying vec2 vUv;

            float luminance(vec3 color) {
                return dot(color, vec3(0.2126, 0.7152, 0.0722));
            }

            float hash12(vec2 point) {
                vec3 p3 = fract(vec3(point.xyx) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.x + p3.y) * p3.z);
            }

            vec3 whiteBalance(vec3 color, float warmth, float greenTint) {
                vec3 balance = vec3(
                    1.0 + warmth * 0.08,
                    1.0 + greenTint * 0.045,
                    1.0 - warmth * 0.08
                );
                return color * max(balance, vec3(0.01));
            }

            void main() {
                vec4 source = texture2D(tDiffuse, vUv);
                vec3 color = max(source.rgb, vec3(0.0));

                // Lightweight local exposure: compare each pixel with a broad
                // cross-shaped neighbourhood, then gently dodge/burn it. This
                // preserves silhouettes in backlight without flattening the
                // whole frame or introducing another full-resolution blur.
                vec2 localStep = (1.0 / max(resolution, vec2(1.0))) * max(localExposureRadius, 1.0);
                vec3 localAverage =
                    texture2D(tDiffuse, vUv + vec2(localStep.x, 0.0)).rgb +
                    texture2D(tDiffuse, vUv - vec2(localStep.x, 0.0)).rgb +
                    texture2D(tDiffuse, vUv + vec2(0.0, localStep.y)).rgb +
                    texture2D(tDiffuse, vUv - vec2(0.0, localStep.y)).rgb;
                localAverage *= 0.25;
                float localLuma = luminance(color);
                float neighbourhoodLuma = luminance(localAverage);
                float localDifference = clamp(
                    log2((neighbourhoodLuma + 0.025) / (localLuma + 0.025)),
                    -1.25,
                    1.25
                );
                color *= exp2(localDifference * clamp(localExposure, 0.0, 0.5));

                color *= max(exposure, 0.0);
                color += brightness;
                color = whiteBalance(color, temperature, tint);

                float luma = luminance(color);
                float shadowMask = 1.0 - smoothstep(0.02, 0.48, luma);
                float highlightMask = smoothstep(0.52, 1.0, luma);
                color += shadows * shadowMask;
                color += highlights * highlightMask;

                // A display-referred contrast pivot close to photographic mid-grey.
                color = (color - 0.18) * max(contrast, 0.0) + 0.18;
                luma = luminance(color);
                color = mix(vec3(luma), color, max(saturation, 0.0));
                color = pow(max(color, vec3(0.0)), vec3(1.0 / max(gamma, 0.01)));

                float aspectRatio = resolution.x / max(resolution.y, 1.0);
                vec2 aspect = aspectRatio >= 1.0
                    ? vec2(aspectRatio, 1.0)
                    : vec2(1.0, 1.0 / max(aspectRatio, 0.001));
                vec2 centered = (vUv - 0.5) * aspect;
                float edge = length(centered);
                float vignetteMask = smoothstep(
                    max(0.15, 0.78 - vignetteFeather * 0.25),
                    0.82,
                    edge
                );
                color *= 1.0 - vignetteMask * clamp(vignette, 0.0, 1.0);

                // Subtle luma-shaped film grain and sub-8-bit dither reduce banding.
                float midtoneMask = 1.0 - abs(clamp(luminance(color), 0.0, 1.0) * 2.0 - 1.0);
                float noise = hash12(gl_FragCoord.xy + vec2(time * 37.0, time * 17.0)) - 0.5;
                color += noise * grain * (0.35 + 0.65 * midtoneMask);
                color += (hash12(gl_FragCoord.yx + 19.19) - 0.5) / 255.0;

                gl_FragColor = vec4(max(color, vec3(0.0)), source.a);
            }
        `
    };

    class SMColorGrading {
        constructor(options = {}) {
            this.settings = {
                enabled: options.enabled !== false,
                exposure: options.exposure ?? 1,
                contrast: options.contrast ?? 1.03,
                saturation: options.saturation ?? 1,
                brightness: options.brightness ?? 0,
                temperature: options.temperature ?? 0,
                tint: options.tint ?? 0,
                shadows: options.shadows ?? 0,
                highlights: options.highlights ?? 0,
                gamma: options.gamma ?? 1,
                vignette: options.vignette ?? 0.08,
                vignetteFeather: options.vignetteFeather ?? 0.45,
                grain: options.grain ?? 0.004,
                localExposure: options.localExposure ?? 0.1,
                localExposureRadius: options.localExposureRadius ?? 18
            };
            this.pass = null;
            this.width = 1;
            this.height = 1;
            this.time = 0;
        }

        create() {
            if (typeof THREE.ShaderPass === 'undefined') {
                console.warn('[SMColorGrading] THREE.ShaderPass is unavailable.');
                return null;
            }

            this.pass = new THREE.ShaderPass(SMColorGradingShader);
            this.apply(this.settings);
            this.setSize(this.width, this.height);
            return this.pass;
        }

        apply(settings = {}) {
            Object.assign(this.settings, settings);
            if (!this.pass) return this;

            const uniforms = this.pass.material.uniforms;
            [
                'exposure',
                'contrast',
                'saturation',
                'brightness',
                'temperature',
                'tint',
                'shadows',
                'highlights',
                'gamma',
                'vignette',
                'vignetteFeather',
                'grain',
                'localExposure',
                'localExposureRadius'
            ].forEach(key => {
                if (uniforms[key] && this.settings[key] != null) {
                    uniforms[key].value = Number(this.settings[key]);
                }
            });

            this.pass.enabled = this.settings.enabled !== false;
            return this;
        }

        setSize(width, height) {
            this.width = Math.max(1, width | 0);
            this.height = Math.max(1, height | 0);
            this.pass?.material?.uniforms?.resolution?.value?.set?.(this.width, this.height);
            return this;
        }

        update(delta = 0) {
            this.time += Math.max(0, Number(delta) || 0);
            if (this.pass?.material?.uniforms?.time) {
                this.pass.material.uniforms.time.value = this.time;
            }
        }

        dispose() {
            this.pass?.dispose?.();
            this.pass = null;
        }
    }

    global.SMColorGradingShader = SMColorGradingShader;
    global.SMColorGrading = SMColorGrading;
})(window);
