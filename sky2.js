
/*
class AdvancedSkyLightingSystem {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.clock = new THREE.Clock(); // For managing delta time

        // --- ALL ORIGINAL PROPERTIES ARE RESPECTED ---
        this.skyParams = {
            turbidity: 10,
            rayleigh: 3,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.7,
            elevation: 80,   // FIX: Sun's vertical angle (0-90 degrees) - Set to a high value for "middle" day start
            azimuth: 180,   // Sun's horizontal angle (0-360 degrees)
            exposure: 0.9   // Renderer exposure, affects overall scene brightness
        };
        this.timeOfDay = 12; // Current hour (0-24) - This defaults to noon, but elevation above overrides visual
        this.daySpeed = 0.005; // How fast time progresses per second (e.g., 0.01 = 1 hour per 100 seconds)
        this.autoTimeProgress = true; // Whether time advances automatically
        this.sunLight = null;
        this.moonLight = null;
        this.ambientLight = null;
        this.hemiLight = null;
        this.sky = null;
        this.sun = new THREE.Vector3(); // Internal vector representing sun's world position
        this.atmosphereUniforms = null; // Uniforms for the sky shader
        this.fogParams = { near: 1, far: 1000, density: 0.00025 }; // For scene fog
        this.cloudSystem = null;
        this.cloudParams = { coverage: 0.3, speed: 0.5, height: 100, thickness: 50 };
        this.weatherSystem = { rainIntensity: 0, snowIntensity: 0, windStrength: 0.5, stormIntensity: 0 };

        // --- ENHANCEMENT: Add shadowFrustumSize to quality settings for easy control ---
        this.qualitySettings = {
            skyResolution: 512,            // Resolution for the generated environment map
            shadowMapSize: 4096,           // Resolution of shadow maps (256, 512, 1024, 2048, 4096, 8192)
            shadowFrustumSize: 50,         // Default frustum size for more coverage
            enableVolumetricLighting: true, // Toggle volumetric light visibility
            enableAtmosphericScattering: true, // Toggle custom sky shader (falls back to basic background)
            enableClouds: true             // Toggle cloud system visibility
        };

        // --- HELPER FOR ENVIRONMENT MAP ---
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.renderTarget = null;
        this.volumetricLight = null;

        this.init();
    }

    init() {
        // --- Renderer Settings ---
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.skyParams.exposure; // Initial exposure
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Keep PCFSoftShadowMap for smooth edges

        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true; // Forces an initial shadow map update

        this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Correct color space for modern rendering

        // --- Scene Element Creation ---
        this.createSky();
        this.createClouds();
        this.createAtmosphere();

        if (!this.sunLight) { 
            this.createDefaultLighting();
        }

        // Initialize sun position based on skyParams.elevation and azimuth
        // This will now use the new default elevation of 80, resulting in a "middle" day start.
        this.setSunPosition(this.skyParams.elevation, this.skyParams.azimuth, false); 
    }

    // --- YOUR PROVIDED createDefaultLighting METHOD (IMPROVED for better shadows and lighting balance) ---
    createDefaultLighting() {
        // Sun Light
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3.0); 
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize, this.qualitySettings.shadowMapSize);
        this.sunLight.shadow.camera.near = 0.5; 
        this.sunLight.shadow.camera.far = 1000;

        // Shadow parameters for PCFSoftShadowMap
        this.sunLight.shadow.bias = -0.0003; 
        this.sunLight.shadow.normalBias = 0.005; 
        this.sunLight.shadow.radius = 4; 

        // Initial frustum size
        const s = this.qualitySettings.shadowFrustumSize;
        this.sunLight.shadow.camera.left = -s;
        this.sunLight.shadow.camera.right = s;
        this.sunLight.shadow.camera.top = s;
        this.sunLight.shadow.camera.bottom = -s;
        this.sunLight.shadow.camera.updateProjectionMatrix();

        this.sunLight.name = "SunLight";
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target); 

        // Moon Light
        this.moonLight = new THREE.DirectionalLight(0x88aaff, 0.5); 
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize / 2, this.qualitySettings.shadowMapSize / 2); 
        this.moonLight.shadow.camera.near = 0.5;
        this.moonLight.shadow.camera.far = 1000;
        this.moonLight.shadow.bias = -0.0002;
        this.moonLight.shadow.normalBias = 0.004; 
        this.moonLight.shadow.radius = 3; 

        const ms = this.qualitySettings.shadowFrustumSize; 
        this.moonLight.shadow.camera.left = -ms;
        this.moonLight.shadow.camera.right = ms;
        this.moonLight.shadow.camera.top = ms;
        this.moonLight.shadow.camera.bottom = -ms;
        this.moonLight.shadow.camera.updateProjectionMatrix();

        this.moonLight.name = "MoonLight";
        this.scene.add(this.moonLight);
        this.scene.add(this.moonLight.target);

        // Ambient & Hemisphere Lights (IMPROVED for better fill light in shadows)
        this.hemiLight = new THREE.HemisphereLight(0xaaccff, 0x5b422a, 0.5); 
        this.hemiLight.name = "HemisphereLight";
        this.scene.add(this.hemiLight);

        this.ambientLight = new THREE.AmbientLight(0x404040, 0.35); 
        this.ambientLight.name = "AmbientLight";
        this.scene.add(this.ambientLight);
    }

    // --- YOUR PROVIDED updateShadowFrustum METHOD (IMPROVED for dynamic focus) ---
    updateShadowFrustum(light) {
        if (!light || !light.shadow || !light.shadow.camera) {
            console.warn("Invalid light or shadow camera for updateShadowFrustum.");
            return;
        }

        const size = this.qualitySettings.shadowFrustumSize;

        light.shadow.camera.left = -size;
        light.shadow.camera.right = size;
        light.shadow.camera.top = size;
        light.shadow.camera.bottom = -size;

        light.shadow.camera.updateProjectionMatrix();
        light.shadow.camera.updateMatrixWorld(); 
    }

    // --- YOUR PROVIDED createSky METHOD (Shader updated for sunIntensity uniform) ---
    createSky() {
        const skyVertexShader = `varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4( position, 1.0 ); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
        const skyFragmentShader = `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float offset;
            uniform float exponent;
            uniform vec3 sunPosition;
            uniform float time;
            uniform float turbidity;
            uniform float rayleigh;
            uniform float mieCoefficient;
            uniform float mieDirectionalG;
            uniform float sunIntensity; // IMPROVEMENT: Add sunIntensity uniform to shader
            
            varying vec3 vWorldPosition;

            // Utility functions for atmosphere (from THREE.Sky)
            vec3 totalRayleigh(vec3 lambda) {
                return (8.0 * pow(3.14159, 3.0) * pow(pow(1.0003, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * 0.0)) / (3.0 * 6.02214e23 * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * 0.0));
            }

            vec3 totalMie(vec3 lambda, vec3 K, float T) {
                float c = 0.2 * T * 1e-18;
                return 0.434 * c * 3.14159 * pow(2.0 * 3.14159 / lambda, vec3(2.0)) * K;
            }

            float rayleighPhase(float cosTheta) {
                return (3.0 / (16.0 * 3.14159)) * (1.0 + pow(cosTheta, 2.0));
            }

            float miePhase(float cosTheta, float g) {
                float g2 = pow(g, 2.0);
                return (1.0 / (4.0 * 3.14159)) * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5));
            }

            void main() {
                vec3 direction = normalize(vWorldPosition - cameraPosition);
                vec3 sunDir = normalize(sunPosition); 

                float cosTheta = dot(direction, sunDir);
                float sunDistance = distance(direction, sunDir);
                
                // IMPROVEMENT: Smoother sun disk with dynamic intensity
                float sunDisk = smoothstep(0.005, 0.000, sunDistance); 
                sunDisk *= sunIntensity; // Scale sun disk brightness by sunIntensity

                vec3 lambda = vec3(680e-9, 550e-9, 450e-9);
                vec3 K = vec3(0.686, 0.678, 0.666); 
                
                vec3 totalRayleighCoeff = totalRayleigh(lambda) * rayleigh;
                vec3 totalMieCoeff = totalMie(lambda, K, turbidity) * mieCoefficient;

                float rayleighPhaseFactor = rayleighPhase(cosTheta);
                float miePhaseFactor = miePhase(cosTheta, mieDirectionalG);

                vec3 scattering = totalRayleighCoeff * rayleighPhaseFactor + totalMieCoeff * miePhaseFactor;

                float h = normalize(vWorldPosition - cameraPosition).y;
                float mixFactor = pow(smoothstep(offset, exponent, h), 0.35); 

                vec3 skyColor = mix(bottomColor, topColor, mixFactor);
                
                skyColor += scattering * 0.1;
                skyColor += sunDisk * vec3(1.0, 0.9, 0.8) * 10.0; 

                gl_FragColor = vec4(skyColor, 1.0);
            }`;

        this.atmosphereUniforms = {
            topColor: { value: new THREE.Color(0x0077ff) },
            bottomColor: { value: new THREE.Color(0xffffff) },
            offset: { value: 0 }, 
            exponent: { value: 0.8 },
            sunPosition: { value: this.sun },
            time: { value: 0 },
            turbidity: { value: this.skyParams.turbidity },
            rayleigh: { value: this.skyParams.rayleigh },
            mieCoefficient: { value: this.skyParams.mieCoefficient },
            mieDirectionalG: { value: this.skyParams.mieDirectionalG },
            sunIntensity: { value: 0 } // IMPROVEMENT: Initialize sunIntensity uniform
        };
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: this.atmosphereUniforms,
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            side: THREE.BackSide
        });
        this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 15), skyMaterial);
        this.sky.name = "AdvancedSky";
        this.sky.userData.ignoreInTimeline = true;
        this.scene.add(this.sky);
        this.scene.background = this.sky; 
    }

    // --- YOUR PROVIDED createClouds METHOD (IMPROVED for more realistic cloud lighting) ---
    createClouds() {
        if (!this.qualitySettings.enableClouds) return;
        const cloudVertexShader = `varying vec2 vUv; varying vec3 vPosition; void main() { vUv = uv; vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
        const cloudFragmentShader = `
            uniform float time;
            uniform float coverage;
            uniform float speed;
            uniform vec3 sunPosition;
            uniform float thickness; // IMPROVEMENT: Add thickness uniform for depth
            varying vec2 vUv;
            varying vec3 vPosition;

            float noise(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
            float fbm(vec2 st) {
                float value = 0.0;
                float amplitude = 0.5;
                for (int i = 0; i < 4; i++) { 
                    value += amplitude * noise(st);
                    st *= 2.0;
                    amplitude *= 0.5;
                }
                return value;
            }

            void main() {
                vec2 st = vUv * 4.0;
                st.x += time * speed * 0.1;

                float cloudNoise1 = fbm(st);
                float cloudNoise2 = fbm(st * 1.5 + vec2(time * speed * 0.05, 0.0)); 
                float combinedNoise = (cloudNoise1 + cloudNoise2) * 0.5; 

                float cloudMask = smoothstep(coverage, coverage + 0.1, combinedNoise);
                
                vec3 cloudColor = vec3(0.9, 0.9, 0.95);
                vec3 normal = normalize(vPosition); 

                float lightFactor = dot(normal, normalize(sunPosition));
                cloudColor *= mix(0.6, 1.0, lightFactor + 0.5); 
                cloudColor = mix(cloudColor * 0.7, cloudColor, clamp(thickness / 100.0, 0.0, 1.0)); 

                float alpha = cloudMask * 0.8; 
                alpha = mix(0.0, alpha, clamp(thickness / 50.0, 0.0, 1.0)); 

                gl_FragColor = vec4(cloudColor, alpha);
            }`;

        const cloudMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                coverage: { value: this.cloudParams.coverage },
                speed: { value: this.cloudParams.speed },
                sunPosition: { value: this.sun },
                thickness: { value: this.cloudParams.thickness } 
            },
            vertexShader: cloudVertexShader,
            fragmentShader: cloudFragmentShader,
            transparent: true,
            side: THREE.DoubleSide
        });
        this.cloudSystem = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 32, 32), cloudMaterial);
        this.cloudSystem.position.y = this.cloudParams.height;
        this.cloudSystem.rotation.x = -Math.PI / 2;
        this.cloudSystem.name = "CloudSystem";
        this.cloudSystem.userData.ignoreInTimeline = true;
        this.scene.add(this.cloudSystem);
    }

    // --- YOUR PROVIDED createAtmosphere METHOD (used as is) ---
    createAtmosphere() {
        if (!this.scene.fog) { this.scene.fog = new THREE.Fog(0x87CEEB, 1, 1000); }
        if (this.qualitySettings.enableVolumetricLighting) { this.createVolumetricLighting(); }
    }

    // --- YOUR PROVIDED createVolumetricLighting METHOD (IMPROVED for better beam quality) ---
    createVolumetricLighting() {
        this.volumetricLight = new THREE.SpotLight(0xffffff, 1, 250, Math.PI / 6, 0.4, 3); 
        this.volumetricLight.castShadow = false; 
        this.volumetricLight.name = "VolumetricLight";
        this.volumetricLight.userData.ignoreInTimeline = true;
        this.scene.add(this.volumetricLight);
        this.scene.add(this.volumetricLight.target);
    }

    // --- YOUR PROVIDED updateTimeOfDay METHOD (COMPLETELY REFINED for optimal lighting and shadows) ---
    updateTimeOfDay(deltaTime) {
        if (this.autoTimeProgress) { this.timeOfDay = (this.timeOfDay + deltaTime * this.daySpeed) % 24; }

        const timeRatio = this.timeOfDay / 24;
        const sunAngle = timeRatio * Math.PI * 2 - Math.PI / 2; 
        const sunElevation = Math.sin(sunAngle); 

        const dayFactor = THREE.MathUtils.smoothstep(sunElevation, -0.3, 0.5); 
        const nightFactor = THREE.MathUtils.smoothstep(-sunElevation, -0.3, 0.5); 
        const dawnDuskFactor = Math.max(0, 1 - Math.abs(sunElevation)) * 
                               THREE.MathUtils.smoothstep(sunElevation, -0.3, 0.3); 

        // IMPROVEMENT: More precise sun vector based on derived elevation/azimuth from timeOfDay if autoTimeProgress is on
        if (this.autoTimeProgress) {
            const actualElevation = THREE.MathUtils.lerp(-20, 90, (sunElevation + 1) / 2); 
            const actualAzimuth = THREE.MathUtils.lerp(0, 360, timeRatio + 0.25); 
            
            const phi = THREE.MathUtils.degToRad(90 - actualElevation); 
            const theta = THREE.MathUtils.degToRad(actualAzimuth);     
            this.sun.setFromSphericalCoords(100, phi, theta); 
        }
        // If autoTimeProgress is false, this.sun is already set by setSunPosition

        const focusPoint = this.camera.position.clone();
        focusPoint.y = 0; 

        // --- Sun Light Positioning & Frustum Update ---
        const sunDirection = this.sun.clone().normalize();
        this.sunLight.position.copy(focusPoint).add(sunDirection.multiplyScalar(200));
        this.sunLight.target.position.copy(focusPoint); 
        this.updateShadowFrustum(this.sunLight); 

        // --- Moon Light Positioning & Frustum Update ---
        const moonDirection = this.sun.clone().negate().normalize(); 
        this.moonLight.position.copy(focusPoint).add(moonDirection.multiplyScalar(200));
        this.moonLight.target.position.copy(focusPoint); 
        this.updateShadowFrustum(this.moonLight); 

        // --- Light Visibility & Intensity (IMPROVED with smoother transitions and realistic ranges) ---
        // Sun Light
        const sunLightVisibilityFactor = THREE.MathUtils.smoothstep(sunElevation, -0.1, 0.2); 
        this.sunLight.visible = sunLightVisibilityFactor > 0.01; 
        this.sunLight.intensity = THREE.MathUtils.lerp(0.0, 4.5, sunLightVisibilityFactor); 

        // Moon Light
        const moonLightVisibilityFactor = THREE.MathUtils.smoothstep(-sunElevation, -0.1, 0.2); 
        this.moonLight.visible = moonLightVisibilityFactor > 0.01;
        this.moonLight.intensity = THREE.MathUtils.lerp(0.0, 0.8, moonLightVisibilityFactor); 
        const moonColor = new THREE.Color(0x88aaff);
        moonColor.lerp(new THREE.Color(0xb0d0ff), moonLightVisibilityFactor); 
        this.moonLight.color.copy(moonColor);
        
        // --- Ambient & Hemisphere Lights (CRUCIAL for brightening shadows and fill light) ---
        // Ambient Light
        const ambientDayIntensity = THREE.MathUtils.lerp(0.25, 0.5, dayFactor); 
        const ambientNightIntensity = THREE.MathUtils.lerp(0.15, 0.25, moonLightVisibilityFactor); 
        this.ambientLight.intensity = Math.max(ambientDayIntensity, ambientNightIntensity); 

        // Hemisphere Light (sky color, ground color)
        const hemiDayIntensity = THREE.MathUtils.lerp(0.4, 1.2, dayFactor); 
        const hemiNightIntensity = THREE.MathUtils.lerp(0.2, 0.5, moonLightVisibilityFactor); 
        this.hemiLight.intensity = Math.max(hemiDayIntensity, hemiNightIntensity);

        // Volumetric Light Update (IMPROVED intensity scaling)
        if (this.volumetricLight) {
            this.volumetricLight.visible = this.qualitySettings.enableVolumetricLighting && this.sunLight.visible && sunElevation > 0.05; 
            if (this.volumetricLight.visible) {
                this.volumetricLight.position.copy(this.sunLight.position);
                this.volumetricLight.target.position.copy(focusPoint);
                this.volumetricLight.intensity = THREE.MathUtils.smoothstep(sunElevation, 0.05, 0.5) * 0.8; 
            }
        }
        
        if (this.atmosphereUniforms && this.atmosphereUniforms.sunIntensity) {
            this.atmosphereUniforms.sunIntensity.value = this.sunLight.intensity / 4.5; 
        }
    }

    // --- YOUR PROVIDED update METHOD (used as is) ---
    update(deltaTime) {
        this.updateTimeOfDay(deltaTime);
        this.updateSkyColors();
        this.updateFog();
        this.updateClouds(deltaTime);

        if (this.renderTarget) this.renderTarget.dispose();
        this.renderTarget = this.pmremGenerator.fromScene(this.qualitySettings.enableAtmosphericScattering ? this.sky : null); 
        if (this.renderTarget) {
            this.scene.environment = this.renderTarget.texture;
        } else {
            this.scene.environment = null;
        }
        
        const sunElevation = this.sun.y / 100; 
        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.6, 1.5, THREE.MathUtils.smoothstep(sunElevation, -0.3, 0.8));
    }

    // IMPROVED: Smoother and more diverse sky color transitions
    updateFog() {
        const timeRatio = this.timeOfDay / 24;
        const sunElevation = Math.sin(timeRatio * Math.PI * 2 - Math.PI / 2);
        const dayFactor = (sunElevation + 1) / 2; 

        const dayFogColor = new THREE.Color(0x87CEEB);      
        const eveningFogColor = new THREE.Color(0xfa9d75);  
        const nightFogColor = new THREE.Color(0x101015);    
        const dawnFogColor = new THREE.Color(0xadc4d7);     

        let currentFogColor = new THREE.Color();

        if (sunElevation > 0.2) { 
            currentFogColor.copy(dayFogColor);
        } else if (sunElevation > 0.0) { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, 0.0, 0.2);
            currentFogColor.lerpColors(dawnFogColor, dayFogColor, factor);
        } else if (sunElevation > -0.2) { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, -0.2, 0.0);
            currentFogColor.lerpColors(eveningFogColor, dawnFogColor, factor); 
        } else { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, -1.0, -0.2);
            currentFogColor.lerpColors(nightFogColor, eveningFogColor, factor); 
        }

        if (this.scene.fog) {
            this.scene.fog.color.copy(currentFogColor);
            if (this.scene.fog.isFog) {
                this.scene.fog.near = THREE.MathUtils.lerp(20, 100, dayFactor); 
                this.scene.fog.far = THREE.MathUtils.lerp(300, 1200, dayFactor); 
            }
        }
    }

    // IMPROVED: Smoother sky color updates for a dynamic atmosphere
    updateSkyColors() {
        if (!this.atmosphereUniforms) return;

        const timeRatio = this.timeOfDay / 24;
        const sunElevation = Math.sin(timeRatio * Math.PI * 2 - Math.PI / 2); 
        
        const dayTopColor = new THREE.Color(0x56aaff);    
        const dayBottomColor = new THREE.Color(0xadd8e6); 

        const eveningTopColor = new THREE.Color(0xff4500); 
        const eveningBottomColor = new THREE.Color(0xffa500); 
        
        const nightTopColor = new THREE.Color(0x0a1a3a);  
        const nightBottomColor = new THREE.Color(0x1a3a6a); 
        
        const dawnTopColor = new THREE.Color(0x91a7b4);   
        const dawnBottomColor = new THREE.Color(0xbcceda); 

        let targetTopColor = new THREE.Color();
        let targetBottomColor = new THREE.Color();

        if (sunElevation > 0.2) { 
            targetTopColor.copy(dayTopColor);
            targetBottomColor.copy(dayBottomColor);
        } else if (sunElevation > 0.0) { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, 0.0, 0.2);
            targetTopColor.lerpColors(dawnTopColor, dayTopColor, factor);
            targetBottomColor.lerpColors(dawnBottomColor, dayBottomColor, factor);
        } else if (sunElevation > -0.2) { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, -0.2, 0.0);
            targetTopColor.lerpColors(eveningTopColor, dawnTopColor, factor); 
            targetBottomColor.lerpColors(eveningBottomColor, dawnBottomColor, factor);
        } else { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, -1.0, -0.2);
            targetTopColor.lerpColors(nightTopColor, eveningTopColor, factor); 
            targetBottomColor.lerpColors(nightBottomColor, eveningBottomColor, factor);
        }

        this.atmosphereUniforms.topColor.value.copy(targetTopColor);
        this.atmosphereUniforms.bottomColor.value.copy(targetBottomColor);
        this.atmosphereUniforms.sunPosition.value.copy(this.sun);
        this.atmosphereUniforms.time.value = this.timeOfDay; 

        this.atmosphereUniforms.rayleigh.value = THREE.MathUtils.lerp(1.5, 3.5, THREE.MathUtils.smoothstep(sunElevation, -0.3, 0.5)); 
        this.atmosphereUniforms.turbidity.value = THREE.MathUtils.lerp(5, 20, THREE.MathUtils.smoothstep(sunElevation, -0.5, 0.3)); 
    }

    updateClouds(deltaTime) {
        if (!this.cloudSystem || !this.qualitySettings.enableClouds) {
            if (this.cloudSystem) this.cloudSystem.visible = false;
            return;
        }
        this.cloudSystem.visible = true;
        const cloudUniforms = this.cloudSystem.material.uniforms;
        cloudUniforms.time.value += deltaTime;
        cloudUniforms.coverage.value = this.cloudParams.coverage;
        cloudUniforms.speed.value = this.cloudParams.speed;
        cloudUniforms.sunPosition.value.copy(this.sun);
        cloudUniforms.thickness.value = this.cloudParams.thickness; 
    }

    // --- GUI Setup (FIX: Target #skySettings div) ---
    setupGUI() {
        if (typeof dat === 'undefined') {
            console.warn('dat.GUI not available - skipping GUI setup');
            return;
        }

        if (window.mainGUI) {
            window.mainGUI.destroy();
            window.mainGUI = undefined;
        }

        const gui = new dat.GUI();
        window.mainGUI = gui; 

        // FIX: Target the specific div for sky settings
        const skySettingsContainer = document.getElementById('skySettings');
        if (skySettingsContainer) {
            // Ensure the container is visible
            skySettingsContainer.style.display = 'block'; 
            // Append the dat.GUI DOM element here
            skySettingsContainer.innerHTML = ''; // Clear existing content
            skySettingsContainer.appendChild(gui.domElement);
            gui.domElement.style.position = 'relative'; 
            gui.domElement.style.width = '100%'; 
        } else {
            console.warn("Element with id 'skySettings' not found. GUI might not be visible.");
            // Fallback to body or another general container if skySettings isn't found
            // You might want to remove this fallback if 'skySettings' is guaranteed to exist.
            document.body.appendChild(gui.domElement); 
        }

        // --- Sky & Lighting Folder (includes all skyParams) ---
        const skyFolder = gui.addFolder('Sky & Lighting');
        skyFolder.add(this, 'timeOfDay', 0, 24, 0.01).name('Time of Day (h)').onChange(value => {
            this.timeOfDay = value; 
            this.autoTimeProgress = false; 
            this.update(0); 
        });
        skyFolder.add(this, 'autoTimeProgress').name('Auto Time Progress');
        skyFolder.add(this, 'daySpeed', 0.001, 0.1, 0.001).name('Day Speed'); 
        
        // Sun position parameters
        skyFolder.add(this.skyParams, 'elevation', -30, 90, 0.1).name('Sun Elevation (°)').onChange(value => this.setSunPosition(value, this.skyParams.azimuth)); 
        skyFolder.add(this.skyParams, 'azimuth', 0, 360, 1).name('Sun Azimuth (°)').onChange(value => this.setSunPosition(this.skyParams.elevation, value));
        
        // Atmosphere scattering parameters
        skyFolder.add(this.skyParams, 'turbidity', 0, 40, 1).name('Turbidity').onChange(() => this.updateShaderUniforms()); 
        skyFolder.add(this.skyParams, 'rayleigh', 0, 10, 0.1).name('Rayleigh').onChange(() => this.updateShaderUniforms());
        skyFolder.add(this.skyParams, 'mieCoefficient', 0, 0.1, 0.001).name('Mie Coefficient').onChange(() => this.updateShaderUniforms());
        skyFolder.add(this.skyParams, 'mieDirectionalG', 0, 1, 0.01).name('Mie Directional G').onChange(() => this.updateShaderUniforms());
        
        // Renderer exposure (directly controlled by renderer.toneMappingExposure)
        skyFolder.add(this.renderer, 'toneMappingExposure', 0.1, 3.0, 0.01).name('Exposure').onChange(() => this.skyParams.exposure = this.renderer.toneMappingExposure);

        skyFolder.open();

        // --- Quality Settings Folder ---
        const qualityFolder = gui.addFolder('Quality Settings');
        qualityFolder.add(this.qualitySettings, 'shadowMapSize', { '1024': 1024, '2048': 2048, '4096': 4096, '8192': 8192 }).name('Shadow Map Size').onChange(value => this.setQualitySettings({ shadowMapSize: Number(value) }));
        qualityFolder.add(this.qualitySettings, 'shadowFrustumSize', 10, 500, 1).name('Shadow Frustum Size').onChange(value => this.setQualitySettings({ shadowFrustumSize: value })); 
        
        if (this.sunLight && this.sunLight.shadow) {
            qualityFolder.add(this.sunLight.shadow, 'radius', 0, 10, 0.1).name('Sun Shadow Softness');
            qualityFolder.add(this.sunLight.shadow, 'bias', -0.01, 0.01, 0.00005).name('Sun Shadow Bias');
            qualityFolder.add(this.sunLight.shadow, 'normalBias', 0.0, 0.01, 0.0001).name('Sun Shadow Normal Bias');
        }
        if (this.moonLight && this.moonLight.shadow) { 
            qualityFolder.add(this.moonLight.shadow, 'radius', 0, 10, 0.1).name('Moon Shadow Softness');
            qualityFolder.add(this.moonLight.shadow, 'bias', -0.01, 0.01, 0.00005).name('Moon Shadow Bias');
            qualityFolder.add(this.moonLight.shadow, 'normalBias', 0.0, 0.01, 0.0001).name('Moon Shadow Normal Bias');
        }

        qualityFolder.add(this.qualitySettings, 'enableVolumetricLighting').name('Volumetric Light').onChange(value => this.setQualitySettings({ enableVolumetricLighting: value }));
        qualityFolder.add(this.qualitySettings, 'enableClouds').name('Enable Clouds').onChange(value => this.setQualitySettings({ enableClouds: value }));
        qualityFolder.open();

        // --- Clouds Folder ---
        const cloudsFolder = gui.addFolder('Clouds');
        cloudsFolder.add(this.cloudParams, 'coverage', 0, 1, 0.01).name('Coverage');
        cloudsFolder.add(this.cloudParams, 'speed', 0, 2, 0.1).name('Speed');
        cloudsFolder.add(this.cloudParams, 'height', 50, 500, 1).name('Height');
        cloudsFolder.add(this.cloudParams, 'thickness', 1, 100, 1).name('Thickness'); 
        cloudsFolder.open();
        
        // --- Weather Folder ---
        const weatherFolder = gui.addFolder('Weather');
        weatherFolder.add(this.weatherSystem, 'rainIntensity', 0, 1, 0.01).name('Rain Intensity').onChange(value => this.setWeather('rainIntensity', value));
        weatherFolder.add(this.weatherSystem, 'snowIntensity', 0, 1, 0.01).name('Snow Intensity').onChange(value => this.setWeather('snowIntensity', value));
        weatherFolder.add(this.weatherSystem, 'windStrength', 0, 1, 0.01).name('Wind Strength').onChange(value => this.setWeather('windStrength', value));
        weatherFolder.add(this.weatherSystem, 'stormIntensity', 0, 1, 0.01).name('Storm Intensity').onChange(value => this.setWeather('stormIntensity', value));
        weatherFolder.open();
    }
   
    updateShaderUniforms() {
        if (!this.atmosphereUniforms) return;
        this.atmosphereUniforms.turbidity.value = this.skyParams.turbidity;
        this.atmosphereUniforms.rayleigh.value = this.skyParams.rayleigh;
        this.atmosphereUniforms.mieCoefficient.value = this.skyParams.mieCoefficient;
        this.atmosphereUniforms.mieDirectionalG.value = this.skyParams.mieDirectionalG;
    }

    setWeather(type, intensity) {
        this.weatherSystem[type] = intensity; 
        switch (type) {
            case 'rainIntensity':
                this.cloudParams.coverage = THREE.MathUtils.lerp(0.3, 0.9, intensity); 
                this.cloudParams.speed = THREE.MathUtils.lerp(0.5, 1.5, intensity); 
                this.cloudParams.thickness = THREE.MathUtils.lerp(50, 100, intensity); 
                if (this.cloudSystem && this.cloudSystem.material.uniforms) {
                    this.cloudSystem.material.uniforms.coverage.value = this.cloudParams.coverage;
                    this.cloudSystem.material.uniforms.speed.value = this.cloudParams.speed;
                    this.cloudSystem.material.uniforms.thickness.value = this.cloudParams.thickness;
                }
                break;
            case 'snowIntensity':
                this.cloudParams.coverage = THREE.MathUtils.lerp(0.3, 0.8, intensity); 
                this.cloudParams.thickness = THREE.MathUtils.lerp(50, 80, intensity); 
                this.skyParams.turbidity = THREE.MathUtils.lerp(10, 25, intensity); 
                this.skyParams.rayleigh = THREE.MathUtils.lerp(3, 1, intensity); 
                break;
            case 'stormIntensity':
                this.skyParams.turbidity = THREE.MathUtils.lerp(10, 40, intensity); 
                this.skyParams.mieCoefficient = THREE.MathUtils.lerp(0.005, 0.05, intensity); 
                this.cloudParams.coverage = THREE.MathUtils.lerp(0.3, 1.0, intensity); 
                this.cloudParams.speed = THREE.MathUtils.lerp(0.5, 3.0, intensity); 
                this.cloudParams.thickness = THREE.MathUtils.lerp(50, 100, intensity); 
                if (this.sunLight) this.sunLight.intensity *= (1 - intensity * 0.7); 
                if (this.moonLight) this.moonLight.intensity *= (1 - intensity * 0.7); 
                break;
            case 'windStrength':
                this.cloudParams.speed = THREE.MathUtils.lerp(0.5, 3.0, intensity);
                if (this.cloudSystem && this.cloudSystem.material.uniforms) {
                    this.cloudSystem.material.uniforms.speed.value = this.cloudParams.speed;
                }
                break;
            default:
                break;
        }
        this.updateShaderUniforms(); 
        this.update(0); 
    }

    setTimeOfDay(hours, triggerUpdate = true) {
        this.timeOfDay = hours % 24;
        this.autoTimeProgress = false; 
        if (triggerUpdate) this.update(0); 
    }

    setSunPosition(elevation, azimuth, triggerUpdate = true) {
        this.skyParams.elevation = elevation;
        this.skyParams.azimuth = azimuth;
        this.autoTimeProgress = false; 

        const phi = THREE.MathUtils.degToRad(90 - elevation); 
        const theta = THREE.MathUtils.degToRad(azimuth);     
        this.sun.setFromSphericalCoords(100, phi, theta); 
        if (triggerUpdate) this.update(0); 
    }

    // --- Quality Settings Management (IMPROVED to handle new cloud settings) ---
    setQualitySettings(newSettings) {
        Object.assign(this.qualitySettings, newSettings);

        if (this.sunLight && this.sunLight.shadow) {
            this.sunLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize, this.qualitySettings.shadowMapSize);
            this.sunLight.shadow.map = null; 
        }
        if (this.moonLight && this.moonLight.shadow) {
            this.moonLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize / 2, this.qualitySettings.shadowMapSize / 2); 
            this.moonLight.shadow.map = null;
        }

        if (this.sunLight && this.sunLight.shadow) {
            const s = this.qualitySettings.shadowFrustumSize;
            this.sunLight.shadow.camera.left = -s;
            this.sunLight.shadow.camera.right = s;
            this.sunLight.shadow.camera.top = s;
            this.sunLight.shadow.camera.bottom = -s;
            this.sunLight.shadow.camera.updateProjectionMatrix();
        }
        if (this.moonLight && this.moonLight.shadow) {
            const ms = this.qualitySettings.shadowFrustumSize;
            this.moonLight.shadow.camera.left = -ms;
            this.moonLight.shadow.camera.right = ms;
            this.moonLight.shadow.camera.top = ms;
            this.moonLight.shadow.camera.bottom = -ms;
            this.moonLight.shadow.camera.updateProjectionMatrix();
        }

        if (this.qualitySettings.enableClouds && !this.cloudSystem) {
            this.createClouds();
        } else if (!this.qualitySettings.enableClouds && this.cloudSystem) {
            this.cloudSystem.visible = false;
        }

        if (this.qualitySettings.enableVolumetricLighting && !this.volumetricLight) {
            this.createVolumetricLighting();
        } else if (!this.qualitySettings.enableVolumetricLighting && this.volumetricLight) {
            this.volumetricLight.visible = false;
        }
        
        this.update(0);
    }

    // --- Disposal Method (your original, enhanced with pmremGenerator dispose) ---
    dispose() {
        if (this.sky) {
            this.sky.geometry.dispose();
            this.sky.material.dispose();
            this.scene.remove(this.sky);
        }
        if (this.cloudSystem) {
            this.cloudSystem.geometry.dispose();
            this.cloudSystem.material.dispose();
            this.scene.remove(this.cloudSystem);
        }

        [this.sunLight, this.moonLight, this.hemiLight, this.ambientLight, this.volumetricLight].forEach(light => {
            if (light) {
                if (light.target) this.scene.remove(light.target); 
                this.scene.remove(light);
            }
        });

        if (this.pmremGenerator) {
            this.pmremGenerator.dispose();
        }
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }

        this.scene.environment = null;
        this.scene.background = null;
        this.scene.fog = null;

        if (window.mainGUI) {
            window.mainGUI.destroy();
            window.mainGUI = undefined;
        }

        // Hide GuiContainer if it was made visible
        const skySettingsContainer = document.getElementById('skySettings');
        if (skySettingsContainer) {
            skySettingsContainer.style.display = 'none';
        }

        console.log('AdvancedSkyLightingSystem disposed.');
    }
}

// Integration function for your existing init() function
function setupAdvancedSkyLighting(scene, renderer, camera) {
    const lightsToRemove = [];
    scene.traverse((child) => {
        if (child.isLight && !child.userData.keepForSky) {
            lightsToRemove.push(child);
        }
    });
    
    lightsToRemove.forEach(light => scene.remove(light));
    
    const skyLightingSystem = new AdvancedSkyLightingSystem(scene, renderer, camera);
    
    window.skyLightingSystem = skyLightingSystem;
    
    return skyLightingSystem;
}

// Export for use in your init function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AdvancedSkyLightingSystem, setupAdvancedSkyLighting };
}

function initAdvancedSkyLighting() {
    const lightsToRemove = [];
    scene.traverse((child) => {
        if (child.isLight) {
            lightsToRemove.push(child);
        }
    });
    
    lightsToRemove.forEach(light => scene.remove(light));
    
    scene.fog = null; 
    
    const skyLightingSystem = new AdvancedSkyLightingSystem(scene, renderer, camera);
    skyLightingSystem.isEnabled = true;

    window.addEventListener('keydown', (event) => {
        switch(event.key.toLowerCase()) {
            case '1':
                skyLightingSystem.setTimeOfDay(6); 
                break;
            case '2':
                skyLightingSystem.setTimeOfDay(12); 
                break;
            case '3':
                skyLightingSystem.setTimeOfDay(18); 
                break;
            case '4':
                skyLightingSystem.setTimeOfDay(0); 
                break;
            case 'r':
                skyLightingSystem.setWeather('rainIntensity', 0.8);
                break;
            case 't':
                skyLightingSystem.setWeather('stormIntensity', 0.6);
                break;
            case 'c':
                skyLightingSystem.setWeather('rainIntensity', 0);
                skyLightingSystem.setWeather('stormIntensity', 0);
                break;
        }
    });

    skyLightingSystem.originalBackground = null;
    skyLightingSystem.originalFog = null;
    skyLightingSystem.isEnabled = true;

    skyLightingSystem.setVisible = function(visible) {
        this.isEnabled = visible;

        if (this.sky) this.sky.visible = visible;
        if (this.sunLight) this.sunLight.visible = visible;
        if (this.moonLight) this.moonLight.visible = visible;
        if (this.ambientLight) this.ambientLight.visible = visible;
        if (this.hemiLight) this.hemiLight.visible = visible;
        if (this.volumetricLight) this.volumetricLight.visible = visible;
        if (this.cloudSystem) this.cloudSystem.visible = visible; 

        if (visible) {
            scene.background = this.originalBackground;
            scene.fog = this.originalFog;
            this.originalBackground = null;
            this.originalFog = null;
        } else {
            this.originalBackground = scene.background;
            this.originalFog = scene.fog;

            scene.background = new THREE.Color(0x3a3a3a);
            scene.fog = null;
        }
    };
    
    window.skyLightingSystem = skyLightingSystem;
    
    return skyLightingSystem;
}
*/

class AdvancedSkyLightingSystem {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.clock = new THREE.Clock(); // For managing delta time

        // --- ALL ORIGINAL PROPERTIES ARE RESPECTED ---
        this.skyParams = {
            turbidity: 10,
            rayleigh: 3,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.7,
            elevation: 80,   // FIX: Sun's vertical angle (0-90 degrees) - Set to a high value for "middle" day start
            azimuth: 180,   // Sun's horizontal angle (0-360 degrees)
            exposure: 0.9   // Renderer exposure, affects overall scene brightness
        };
        this.timeOfDay = 12; // Current hour (0-24) - This defaults to noon, but elevation above overrides visual
        this.daySpeed = 0.005; // How fast time progresses per second (e.g., 0.01 = 1 hour per 100 seconds)
        this.autoTimeProgress = true; // Whether time advances automatically
        this.sunLight = null;
        this.moonLight = null;
        this.ambientLight = null;
        this.hemiLight = null;
        this.sky = null;
        this.sun = new THREE.Vector3(); // Internal vector representing sun's world position
        this.atmosphereUniforms = null; // Uniforms for the sky shader
        this.fogParams = { near: 1, far: 1000, density: 0.00025 }; // For scene fog
        this.cloudSystem = null;
        this.cloudParams = { coverage: 0.3, speed: 0.5, height: 100, thickness: 50 };
        this.weatherSystem = { rainIntensity: 0, snowIntensity: 0, windStrength: 0.5, stormIntensity: 0 };

        // --- ENHANCEMENT: Add shadowFrustumSize to quality settings for easy control ---
        this.qualitySettings = {
            skyResolution: 512,            // Resolution for the generated environment map
            shadowMapSize: 4096,           // Resolution of shadow maps (256, 512, 1024, 2048, 4096, 8192)
            shadowFrustumSize: 50,         // Default frustum size for more coverage
            enableVolumetricLighting: true, // Toggle volumetric light visibility
            enableAtmosphericScattering: true, // Toggle custom sky shader (falls back to basic background)
            enableClouds: true             // Toggle cloud system visibility
        };

        // --- HELPER FOR ENVIRONMENT MAP ---
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.renderTarget = null;
        this.volumetricLight = null;

        this.init();
    }

    init() {
        // --- Renderer Settings ---
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.skyParams.exposure; // Initial exposure
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Keep PCFSoftShadowMap for smooth edges

        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true; // Forces an initial shadow map update

        this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Correct color space for modern rendering

        // --- Scene Element Creation ---
        this.createSky();
        this.createClouds();
        this.createAtmosphere();

        if (!this.sunLight) { 
            this.createDefaultLighting();
        }

        // Initialize sun position based on skyParams.elevation and azimuth
        // This will now use the new default elevation of 80, resulting in a "middle" day start.
        this.setSunPosition(this.skyParams.elevation, this.skyParams.azimuth, false); 
    }

    // --- YOUR PROVIDED createDefaultLighting METHOD (IMPROVED for better shadows and lighting balance) ---
    createDefaultLighting() {
        // Sun Light
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3.0); 
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize, this.qualitySettings.shadowMapSize);
        this.sunLight.shadow.camera.near = 0.5; 
        this.sunLight.shadow.camera.far = 1000;

        // Shadow parameters for PCFSoftShadowMap
        this.sunLight.shadow.bias = -0.0003; 
        this.sunLight.shadow.normalBias = 0.005; 
        this.sunLight.shadow.radius = 4; 

        // Initial frustum size
        const s = this.qualitySettings.shadowFrustumSize;
        this.sunLight.shadow.camera.left = -s;
        this.sunLight.shadow.camera.right = s;
        this.sunLight.shadow.camera.top = s;
        this.sunLight.shadow.camera.bottom = -s;
        this.sunLight.shadow.camera.updateProjectionMatrix();

        this.sunLight.name = "SunLight";
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target); 

        // Moon Light
        this.moonLight = new THREE.DirectionalLight(0x88aaff, 0.5); 
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize / 2, this.qualitySettings.shadowMapSize / 2); 
        this.moonLight.shadow.camera.near = 0.5;
        this.moonLight.shadow.camera.far = 1000;
        this.moonLight.shadow.bias = -0.0002;
        this.moonLight.shadow.normalBias = 0.004; 
        this.moonLight.shadow.radius = 3; 

        const ms = this.qualitySettings.shadowFrustumSize; 
        this.moonLight.shadow.camera.left = -ms;
        this.moonLight.shadow.camera.right = ms;
        this.moonLight.shadow.camera.top = ms;
        this.moonLight.shadow.camera.bottom = -ms;
        this.moonLight.shadow.camera.updateProjectionMatrix();

        this.moonLight.name = "MoonLight";
        this.scene.add(this.moonLight);
        this.scene.add(this.moonLight.target);

        // Ambient & Hemisphere Lights (IMPROVED for better fill light in shadows)
        this.hemiLight = new THREE.HemisphereLight(0xaaccff, 0x5b422a, 0.5); 
        this.hemiLight.name = "HemisphereLight";
        this.scene.add(this.hemiLight);

        this.ambientLight = new THREE.AmbientLight(0x404040, 0.35); 
        this.ambientLight.name = "AmbientLight";
        this.scene.add(this.ambientLight);
    }

    // --- YOUR PROVIDED updateShadowFrustum METHOD (IMPROVED for dynamic focus) ---
    updateShadowFrustum(light) {
        if (!light || !light.shadow || !light.shadow.camera) {
            console.warn("Invalid light or shadow camera for updateShadowFrustum.");
            return;
        }

        const size = this.qualitySettings.shadowFrustumSize;

        light.shadow.camera.left = -size;
        light.shadow.camera.right = size;
        light.shadow.camera.top = size;
        light.shadow.camera.bottom = -size;

        light.shadow.camera.updateProjectionMatrix();
        light.shadow.camera.updateMatrixWorld(); 
    }

    // --- YOUR PROVIDED createSky METHOD (Shader updated for sunIntensity uniform) ---
    createSky() {
        const skyVertexShader = `varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4( position, 1.0 ); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
        const skyFragmentShader = `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float offset;
            uniform float exponent;
            uniform vec3 sunPosition;
            uniform float time;
            uniform float turbidity;
            uniform float rayleigh;
            uniform float mieCoefficient;
            uniform float mieDirectionalG;
            uniform float sunIntensity; // IMPROVEMENT: Add sunIntensity uniform to shader
            
            varying vec3 vWorldPosition;

            // Utility functions for atmosphere (from THREE.Sky)
            vec3 totalRayleigh(vec3 lambda) {
                return (8.0 * pow(3.14159, 3.0) * pow(pow(1.0003, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * 0.0)) / (3.0 * 6.02214e23 * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * 0.0));
            }

            vec3 totalMie(vec3 lambda, vec3 K, float T) {
                float c = 0.2 * T * 1e-18;
                return 0.434 * c * 3.14159 * pow(2.0 * 3.14159 / lambda, vec3(2.0)) * K;
            }

            float rayleighPhase(float cosTheta) {
                return (3.0 / (16.0 * 3.14159)) * (1.0 + pow(cosTheta, 2.0));
            }

            float miePhase(float cosTheta, float g) {
                float g2 = pow(g, 2.0);
                return (1.0 / (4.0 * 3.14159)) * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5));
            }

            void main() {
                vec3 direction = normalize(vWorldPosition - cameraPosition);
                vec3 sunDir = normalize(sunPosition); 

                float cosTheta = dot(direction, sunDir);
                float sunDistance = distance(direction, sunDir);
                
                // IMPROVEMENT: Smoother sun disk with dynamic intensity
                float sunDisk = smoothstep(0.005, 0.000, sunDistance); 
                sunDisk *= sunIntensity; // Scale sun disk brightness by sunIntensity

                vec3 lambda = vec3(680e-9, 550e-9, 450e-9);
                vec3 K = vec3(0.686, 0.678, 0.666); 
                
                vec3 totalRayleighCoeff = totalRayleigh(lambda) * rayleigh;
                vec3 totalMieCoeff = totalMie(lambda, K, turbidity) * mieCoefficient;

                float rayleighPhaseFactor = rayleighPhase(cosTheta);
                float miePhaseFactor = miePhase(cosTheta, mieDirectionalG);

                vec3 scattering = totalRayleighCoeff * rayleighPhaseFactor + totalMieCoeff * miePhaseFactor;

                float h = normalize(vWorldPosition - cameraPosition).y;
                float mixFactor = pow(smoothstep(offset, exponent, h), 0.35); 

                vec3 skyColor = mix(bottomColor, topColor, mixFactor);
                
                skyColor += scattering * 0.1;
                skyColor += sunDisk * vec3(1.0, 0.9, 0.8) * 10.0; 

                gl_FragColor = vec4(skyColor, 1.0);
            }`;

        this.atmosphereUniforms = {
            topColor: { value: new THREE.Color(0x0077ff) },
            bottomColor: { value: new THREE.Color(0xffffff) },
            offset: { value: 0 }, 
            exponent: { value: 0.8 },
            sunPosition: { value: this.sun },
            time: { value: 0 },
            turbidity: { value: this.skyParams.turbidity },
            rayleigh: { value: this.skyParams.rayleigh },
            mieCoefficient: { value: this.skyParams.mieCoefficient },
            mieDirectionalG: { value: this.skyParams.mieDirectionalG },
            sunIntensity: { value: 0 } // IMPROVEMENT: Initialize sunIntensity uniform
        };
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: this.atmosphereUniforms,
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            side: THREE.BackSide
        });
        this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 15), skyMaterial);
        this.sky.name = "AdvancedSky";
        this.sky.userData.ignoreInTimeline = true;
        this.scene.add(this.sky);
        this.scene.background = this.sky; 
    }

    // --- YOUR PROVIDED createClouds METHOD (IMPROVED for more realistic cloud lighting) ---
    createClouds() {
        if (!this.qualitySettings.enableClouds) return;
        const cloudVertexShader = `varying vec2 vUv; varying vec3 vPosition; void main() { vUv = uv; vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
        const cloudFragmentShader = `
            uniform float time;
            uniform float coverage;
            uniform float speed;
            uniform vec3 sunPosition;
            uniform float thickness; // IMPROVEMENT: Add thickness uniform for depth
            varying vec2 vUv;
            varying vec3 vPosition;

            float noise(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
            float fbm(vec2 st) {
                float value = 0.0;
                float amplitude = 0.5;
                for (int i = 0; i < 4; i++) { 
                    value += amplitude * noise(st);
                    st *= 2.0;
                    amplitude *= 0.5;
                }
                return value;
            }

            void main() {
                vec2 st = vUv * 4.0;
                st.x += time * speed * 0.1;

                float cloudNoise1 = fbm(st);
                float cloudNoise2 = fbm(st * 1.5 + vec2(time * speed * 0.05, 0.0)); 
                float combinedNoise = (cloudNoise1 + cloudNoise2) * 0.5; 

                float cloudMask = smoothstep(coverage, coverage + 0.1, combinedNoise);
                
                vec3 cloudColor = vec3(0.9, 0.9, 0.95);
                vec3 normal = normalize(vPosition); 

                float lightFactor = dot(normal, normalize(sunPosition));
                cloudColor *= mix(0.6, 1.0, lightFactor + 0.5); 
                cloudColor = mix(cloudColor * 0.7, cloudColor, clamp(thickness / 100.0, 0.0, 1.0)); 

                float alpha = cloudMask * 0.8; 
                alpha = mix(0.0, alpha, clamp(thickness / 50.0, 0.0, 1.0)); 

                gl_FragColor = vec4(cloudColor, alpha);
            }`;

        const cloudMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                coverage: { value: this.cloudParams.coverage },
                speed: { value: this.cloudParams.speed },
                sunPosition: { value: this.sun },
                thickness: { value: this.cloudParams.thickness } 
            },
            vertexShader: cloudVertexShader,
            fragmentShader: cloudFragmentShader,
            transparent: true,
            side: THREE.DoubleSide
        });
        this.cloudSystem = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 32, 32), cloudMaterial);
        this.cloudSystem.position.y = this.cloudParams.height;
        this.cloudSystem.rotation.x = -Math.PI / 2;
        this.cloudSystem.name = "CloudSystem";
        this.cloudSystem.userData.ignoreInTimeline = true;
        this.scene.add(this.cloudSystem);
    }

    // --- YOUR PROVIDED createAtmosphere METHOD (used as is) ---
    createAtmosphere() {
        if (!this.scene.fog) { this.scene.fog = new THREE.Fog(0x87CEEB, 1, 1000); }
        if (this.qualitySettings.enableVolumetricLighting) { this.createVolumetricLighting(); }
    }

    // --- YOUR PROVIDED createVolumetricLighting METHOD (IMPROVED for better beam quality) ---
    createVolumetricLighting() {
        this.volumetricLight = new THREE.SpotLight(0xffffff, 1, 250, Math.PI / 6, 0.4, 3); 
        this.volumetricLight.castShadow = false; 
        this.volumetricLight.name = "VolumetricLight";
        this.volumetricLight.userData.ignoreInTimeline = true;
        this.scene.add(this.volumetricLight);
        this.scene.add(this.volumetricLight.target);
    }

    // --- YOUR PROVIDED updateTimeOfDay METHOD (COMPLETELY REFINED for optimal lighting and shadows) ---
    updateTimeOfDay(deltaTime) {
        if (this.autoTimeProgress) { this.timeOfDay = (this.timeOfDay + deltaTime * this.daySpeed) % 24; }

        const timeRatio = this.timeOfDay / 24;
        const sunAngle = timeRatio * Math.PI * 2 - Math.PI / 2; 
        const sunElevation = Math.sin(sunAngle); 

        const dayFactor = THREE.MathUtils.smoothstep(sunElevation, -0.3, 0.5); 
        const nightFactor = THREE.MathUtils.smoothstep(-sunElevation, -0.3, 0.5); 
        const dawnDuskFactor = Math.max(0, 1 - Math.abs(sunElevation)) * 
                               THREE.MathUtils.smoothstep(sunElevation, -0.3, 0.3); 

        // IMPROVEMENT: More precise sun vector based on derived elevation/azimuth from timeOfDay if autoTimeProgress is on
        if (this.autoTimeProgress) {
            const actualElevation = THREE.MathUtils.lerp(-20, 90, (sunElevation + 1) / 2); 
            const actualAzimuth = THREE.MathUtils.lerp(0, 360, timeRatio + 0.25); 
            
            const phi = THREE.MathUtils.degToRad(90 - actualElevation); 
            const theta = THREE.MathUtils.degToRad(actualAzimuth);     
            this.sun.setFromSphericalCoords(100, phi, theta); 
        }
        // If autoTimeProgress is false, this.sun is already set by setSunPosition

        const focusPoint = this.camera.position.clone();
        focusPoint.y = 0; 

        // --- Sun Light Positioning & Frustum Update ---
        const sunDirection = this.sun.clone().normalize();
        this.sunLight.position.copy(focusPoint).add(sunDirection.multiplyScalar(200));
        this.sunLight.target.position.copy(focusPoint); 
        this.updateShadowFrustum(this.sunLight); 

        // --- Moon Light Positioning & Frustum Update ---
        const moonDirection = this.sun.clone().negate().normalize(); 
        this.moonLight.position.copy(focusPoint).add(moonDirection.multiplyScalar(200));
        this.moonLight.target.position.copy(focusPoint); 
        this.updateShadowFrustum(this.moonLight); 

        // --- Light Visibility & Intensity (IMPROVED with smoother transitions and realistic ranges) ---
        // Sun Light
        const sunLightVisibilityFactor = THREE.MathUtils.smoothstep(sunElevation, -0.1, 0.2); 
        this.sunLight.visible = sunLightVisibilityFactor > 0.01; 
        this.sunLight.intensity = THREE.MathUtils.lerp(0.0, 4.5, sunLightVisibilityFactor); 

        // Moon Light
        const moonLightVisibilityFactor = THREE.MathUtils.smoothstep(-sunElevation, -0.1, 0.2); 
        this.moonLight.visible = moonLightVisibilityFactor > 0.01;
        this.moonLight.intensity = THREE.MathUtils.lerp(0.0, 0.8, moonLightVisibilityFactor); 
        const moonColor = new THREE.Color(0x88aaff);
        moonColor.lerp(new THREE.Color(0xb0d0ff), moonLightVisibilityFactor); 
        this.moonLight.color.copy(moonColor);
        
        // --- Ambient & Hemisphere Lights (CRUCIAL for brightening shadows and fill light) ---
        // Ambient Light
        const ambientDayIntensity = THREE.MathUtils.lerp(0.25, 0.5, dayFactor); 
        const ambientNightIntensity = THREE.MathUtils.lerp(0.15, 0.25, moonLightVisibilityFactor); 
        this.ambientLight.intensity = Math.max(ambientDayIntensity, ambientNightIntensity); 

        // Hemisphere Light (sky color, ground color)
        const hemiDayIntensity = THREE.MathUtils.lerp(0.4, 1.2, dayFactor); 
        const hemiNightIntensity = THREE.MathUtils.lerp(0.2, 0.5, moonLightVisibilityFactor); 
        this.hemiLight.intensity = Math.max(hemiDayIntensity, hemiNightIntensity);

        // Volumetric Light Update (IMPROVED intensity scaling)
        if (this.volumetricLight) {
            this.volumetricLight.visible = this.qualitySettings.enableVolumetricLighting && this.sunLight.visible && sunElevation > 0.05; 
            if (this.volumetricLight.visible) {
                this.volumetricLight.position.copy(this.sunLight.position);
                this.volumetricLight.target.position.copy(focusPoint);
                this.volumetricLight.intensity = THREE.MathUtils.smoothstep(sunElevation, 0.05, 0.5) * 0.8; 
            }
        }
        
        if (this.atmosphereUniforms && this.atmosphereUniforms.sunIntensity) {
            this.atmosphereUniforms.sunIntensity.value = this.sunLight.intensity / 4.5; 
        }
    }

    // --- YOUR PROVIDED update METHOD (used as is) ---
    update(deltaTime) {
        this.updateTimeOfDay(deltaTime);
        this.updateSkyColors();
        this.updateFog();
        this.updateClouds(deltaTime);

        if (this.renderTarget) this.renderTarget.dispose();
        this.renderTarget = this.pmremGenerator.fromScene(this.qualitySettings.enableAtmosphericScattering ? this.sky : null); 
        if (this.renderTarget) {
            this.scene.environment = this.renderTarget.texture;
        } else {
            this.scene.environment = null;
        }
        
        const sunElevation = this.sun.y / 100; 
        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.6, 1.5, THREE.MathUtils.smoothstep(sunElevation, -0.3, 0.8));
    }

    // IMPROVED: Smoother and more diverse sky color transitions
    updateFog() {
        const timeRatio = this.timeOfDay / 24;
        const sunElevation = Math.sin(timeRatio * Math.PI * 2 - Math.PI / 2);
        const dayFactor = (sunElevation + 1) / 2; 

        const dayFogColor = new THREE.Color(0x87CEEB);      
        const eveningFogColor = new THREE.Color(0xfa9d75);  
        const nightFogColor = new THREE.Color(0x101015);    
        const dawnFogColor = new THREE.Color(0xadc4d7);     

        let currentFogColor = new THREE.Color();

        if (sunElevation > 0.2) { 
            currentFogColor.copy(dayFogColor);
        } else if (sunElevation > 0.0) { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, 0.0, 0.2);
            currentFogColor.lerpColors(dawnFogColor, dayFogColor, factor);
        } else if (sunElevation > -0.2) { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, -0.2, 0.0);
            currentFogColor.lerpColors(eveningFogColor, dawnFogColor, factor); 
        } else { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, -1.0, -0.2);
            currentFogColor.lerpColors(nightFogColor, eveningFogColor, factor); 
        }

        if (this.scene.fog) {
            this.scene.fog.color.copy(currentFogColor);
            if (this.scene.fog.isFog) {
                this.scene.fog.near = THREE.MathUtils.lerp(20, 100, dayFactor); 
                this.scene.fog.far = THREE.MathUtils.lerp(300, 1200, dayFactor); 
            }
        }
    }

    // IMPROVED: Smoother sky color updates for a dynamic atmosphere
    updateSkyColors() {
        if (!this.atmosphereUniforms) return;

        const timeRatio = this.timeOfDay / 24;
        const sunElevation = Math.sin(timeRatio * Math.PI * 2 - Math.PI / 2); 
        
        const dayTopColor = new THREE.Color(0x56aaff);    
        const dayBottomColor = new THREE.Color(0xadd8e6); 

        const eveningTopColor = new THREE.Color(0xff4500); 
        const eveningBottomColor = new THREE.Color(0xffa500); 
        
        const nightTopColor = new THREE.Color(0x0a1a3a);  
        const nightBottomColor = new THREE.Color(0x1a3a6a); 
        
        const dawnTopColor = new THREE.Color(0x91a7b4);   
        const dawnBottomColor = new THREE.Color(0xbcceda); 

        let targetTopColor = new THREE.Color();
        let targetBottomColor = new THREE.Color();

        if (sunElevation > 0.2) { 
            targetTopColor.copy(dayTopColor);
            targetBottomColor.copy(dayBottomColor);
        } else if (sunElevation > 0.0) { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, 0.0, 0.2);
            targetTopColor.lerpColors(dawnTopColor, dayTopColor, factor);
            targetBottomColor.lerpColors(dawnBottomColor, dayBottomColor, factor);
        } else if (sunElevation > -0.2) { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, -0.2, 0.0);
            targetTopColor.lerpColors(eveningTopColor, dawnTopColor, factor); 
            targetBottomColor.lerpColors(eveningBottomColor, dawnBottomColor, factor);
        } else { 
            const factor = THREE.MathUtils.smoothstep(sunElevation, -1.0, -0.2);
            targetTopColor.lerpColors(nightTopColor, eveningTopColor, factor); 
            targetBottomColor.lerpColors(nightBottomColor, eveningBottomColor, factor);
        }

        this.atmosphereUniforms.topColor.value.copy(targetTopColor);
        this.atmosphereUniforms.bottomColor.value.copy(targetBottomColor);
        this.atmosphereUniforms.sunPosition.value.copy(this.sun);
        this.atmosphereUniforms.time.value = this.timeOfDay; 

        this.atmosphereUniforms.rayleigh.value = THREE.MathUtils.lerp(1.5, 3.5, THREE.MathUtils.smoothstep(sunElevation, -0.3, 0.5)); 
        this.atmosphereUniforms.turbidity.value = THREE.MathUtils.lerp(5, 20, THREE.MathUtils.smoothstep(sunElevation, -0.5, 0.3)); 
    }

    updateClouds(deltaTime) {
        if (!this.cloudSystem || !this.qualitySettings.enableClouds) {
            if (this.cloudSystem) this.cloudSystem.visible = false;
            return;
        }
        this.cloudSystem.visible = true;
        const cloudUniforms = this.cloudSystem.material.uniforms;
        cloudUniforms.time.value += deltaTime;
        cloudUniforms.coverage.value = this.cloudParams.coverage;
        cloudUniforms.speed.value = this.cloudParams.speed;
        cloudUniforms.sunPosition.value.copy(this.sun);
        cloudUniforms.thickness.value = this.cloudParams.thickness; 
    }

    // --- GUI Setup (FIX: Target #skySettings div) ---

    setupGUI() {
        if (typeof dat === 'undefined') {
            console.warn('dat.GUI not available - skipping GUI setup');
            return;
        }

        if (window.mainGUI) {
            window.mainGUI.destroy();
            window.mainGUI = undefined;
        }

        const gui = new dat.GUI();
        window.mainGUI = gui; 

        // FIX: Target the specific div for sky settings
        const skySettingsContainer = document.getElementById('gui-container');
        skySettingsContainer.appendChild(gui.domElement);
        if (skySettingsContainer) {
            skySettingsContainer.style.display = 'block';

            

            // clear old gui if any
            const oldGui = skySettingsContainer.querySelector('.dg.ac');
            if (oldGui) oldGui.remove();

            // fix dat.GUI positioning so it stays inside the div
            gui.domElement.style.position = 'relative';
            gui.domElement.style.top = 'unset';
            gui.domElement.style.right = 'unset';
            gui.domElement.style.left = 'unset';
            gui.domElement.style.width = '100%';
            gui.domElement.style.marginTop = '10px';
        } else {
            console.error("Element with id 'skySettings' not found. GUI will be appended to body.");
            document.body.appendChild(gui.domElement); 
        }


        // --- Sky & Lighting Folder (includes all skyParams) ---
        const skyFolder = gui.addFolder('Sky & Lighting');
        skyFolder.add(this, 'timeOfDay', 0, 24, 0.01).name('Time of Day (h)').onChange(value => {
            this.timeOfDay = value; 
            this.autoTimeProgress = false; 
            this.update(0); 
        });
        skyFolder.add(this, 'autoTimeProgress').name('Auto Time Progress');
        skyFolder.add(this, 'daySpeed', 0.001, 0.1, 0.001).name('Day Speed'); 
        
        // Sun position parameters
        skyFolder.add(this.skyParams, 'elevation', -30, 90, 0.1).name('Sun Elevation (°)').onChange(value => this.setSunPosition(value, this.skyParams.azimuth)); 
        skyFolder.add(this.skyParams, 'azimuth', 0, 360, 1).name('Sun Azimuth (°)').onChange(value => this.setSunPosition(this.skyParams.elevation, value));
        
        // Atmosphere scattering parameters
        skyFolder.add(this.skyParams, 'turbidity', 0, 40, 1).name('Turbidity').onChange(() => this.updateShaderUniforms()); 
        skyFolder.add(this.skyParams, 'rayleigh', 0, 10, 0.1).name('Rayleigh').onChange(() => this.updateShaderUniforms());
        skyFolder.add(this.skyParams, 'mieCoefficient', 0, 0.1, 0.001).name('Mie Coefficient').onChange(() => this.updateShaderUniforms());
        skyFolder.add(this.skyParams, 'mieDirectionalG', 0, 1, 0.01).name('Mie Directional G').onChange(() => this.updateShaderUniforms());
        
        // Renderer exposure (directly controlled by renderer.toneMappingExposure)
        skyFolder.add(this.renderer, 'toneMappingExposure', 0.1, 3.0, 0.01).name('Exposure').onChange(() => this.skyParams.exposure = this.renderer.toneMappingExposure);

        skyFolder.open();

        // --- Quality Settings Folder ---
        const qualityFolder = gui.addFolder('Quality Settings');
        qualityFolder.add(this.qualitySettings, 'shadowMapSize', { '1024': 1024, '2048': 2048, '4096': 4096, '8192': 8192 }).name('Shadow Map Size').onChange(value => this.setQualitySettings({ shadowMapSize: Number(value) }));
        qualityFolder.add(this.qualitySettings, 'shadowFrustumSize', 10, 500, 1).name('Shadow Frustum Size').onChange(value => this.setQualitySettings({ shadowFrustumSize: value })); 
        
        if (this.sunLight && this.sunLight.shadow) {
            qualityFolder.add(this.sunLight.shadow, 'radius', 0, 10, 0.1).name('Sun Shadow Softness');
            qualityFolder.add(this.sunLight.shadow, 'bias', -0.01, 0.01, 0.00005).name('Sun Shadow Bias');
            qualityFolder.add(this.sunLight.shadow, 'normalBias', 0.0, 0.01, 0.0001).name('Sun Shadow Normal Bias');
        }
        if (this.moonLight && this.moonLight.shadow) { 
            qualityFolder.add(this.moonLight.shadow, 'radius', 0, 10, 0.1).name('Moon Shadow Softness');
            qualityFolder.add(this.moonLight.shadow, 'bias', -0.01, 0.01, 0.00005).name('Moon Shadow Bias');
            qualityFolder.add(this.moonLight.shadow, 'normalBias', 0.0, 0.01, 0.0001).name('Moon Shadow Normal Bias');
        }

        qualityFolder.add(this.qualitySettings, 'enableVolumetricLighting').name('Volumetric Light').onChange(value => this.setQualitySettings({ enableVolumetricLighting: value }));
        qualityFolder.add(this.qualitySettings, 'enableClouds').name('Enable Clouds').onChange(value => this.setQualitySettings({ enableClouds: value }));
        qualityFolder.open();

        // --- Clouds Folder ---
        const cloudsFolder = gui.addFolder('Clouds');
        cloudsFolder.add(this.cloudParams, 'coverage', 0, 1, 0.01).name('Coverage');
        cloudsFolder.add(this.cloudParams, 'speed', 0, 2, 0.1).name('Speed');
        cloudsFolder.add(this.cloudParams, 'height', 50, 500, 1).name('Height');
        cloudsFolder.add(this.cloudParams, 'thickness', 1, 100, 1).name('Thickness'); 
        cloudsFolder.open();
        
        // --- Weather Folder ---
        const weatherFolder = gui.addFolder('Weather');
        weatherFolder.add(this.weatherSystem, 'rainIntensity', 0, 1, 0.01).name('Rain Intensity').onChange(value => this.setWeather('rainIntensity', value));
        weatherFolder.add(this.weatherSystem, 'snowIntensity', 0, 1, 0.01).name('Snow Intensity').onChange(value => this.setWeather('snowIntensity', value));
        weatherFolder.add(this.weatherSystem, 'windStrength', 0, 1, 0.01).name('Wind Strength').onChange(value => this.setWeather('windStrength', value));
        weatherFolder.add(this.weatherSystem, 'stormIntensity', 0, 1, 0.01).name('Storm Intensity').onChange(value => this.setWeather('stormIntensity', value));
        weatherFolder.open();
    }
   
    updateShaderUniforms() {
        if (!this.atmosphereUniforms) return;
        this.atmosphereUniforms.turbidity.value = this.skyParams.turbidity;
        this.atmosphereUniforms.rayleigh.value = this.skyParams.rayleigh;
        this.atmosphereUniforms.mieCoefficient.value = this.skyParams.mieCoefficient;
        this.atmosphereUniforms.mieDirectionalG.value = this.skyParams.mieDirectionalG;
    }

    setWeather(type, intensity) {
        this.weatherSystem[type] = intensity; 
        switch (type) {
            case 'rainIntensity':
                this.cloudParams.coverage = THREE.MathUtils.lerp(0.3, 0.9, intensity); 
                this.cloudParams.speed = THREE.MathUtils.lerp(0.5, 1.5, intensity); 
                this.cloudParams.thickness = THREE.MathUtils.lerp(50, 100, intensity); 
                if (this.cloudSystem && this.cloudSystem.material.uniforms) {
                    this.cloudSystem.material.uniforms.coverage.value = this.cloudParams.coverage;
                    this.cloudSystem.material.uniforms.speed.value = this.cloudParams.speed;
                    this.cloudSystem.material.uniforms.thickness.value = this.cloudParams.thickness;
                }
                break;
            case 'snowIntensity':
                this.cloudParams.coverage = THREE.MathUtils.lerp(0.3, 0.8, intensity); 
                this.cloudParams.thickness = THREE.MathUtils.lerp(50, 80, intensity); 
                this.skyParams.turbidity = THREE.MathUtils.lerp(10, 25, intensity); 
                this.skyParams.rayleigh = THREE.MathUtils.lerp(3, 1, intensity); 
                break;
            case 'stormIntensity':
                this.skyParams.turbidity = THREE.MathUtils.lerp(10, 40, intensity); 
                this.skyParams.mieCoefficient = THREE.MathUtils.lerp(0.005, 0.05, intensity); 
                this.cloudParams.coverage = THREE.MathUtils.lerp(0.3, 1.0, intensity); 
                this.cloudParams.speed = THREE.MathUtils.lerp(0.5, 3.0, intensity); 
                this.cloudParams.thickness = THREE.MathUtils.lerp(50, 100, intensity); 
                if (this.sunLight) this.sunLight.intensity *= (1 - intensity * 0.7); 
                if (this.moonLight) this.moonLight.intensity *= (1 - intensity * 0.7); 
                break;
            case 'windStrength':
                this.cloudParams.speed = THREE.MathUtils.lerp(0.5, 3.0, intensity);
                if (this.cloudSystem && this.cloudSystem.material.uniforms) {
                    this.cloudSystem.material.uniforms.speed.value = this.cloudParams.speed;
                }
                break;
            default:
                break;
        }
        this.updateShaderUniforms(); 
        this.update(0); 
    }

    setTimeOfDay(hours, triggerUpdate = true) {
        this.timeOfDay = hours % 24;
        this.autoTimeProgress = false; 
        if (triggerUpdate) this.update(0); 
    }

    setSunPosition(elevation, azimuth, triggerUpdate = true) {
        this.skyParams.elevation = elevation;
        this.skyParams.azimuth = azimuth;
        this.autoTimeProgress = false; 

        const phi = THREE.MathUtils.degToRad(90 - elevation); 
        const theta = THREE.MathUtils.degToRad(azimuth);     
        this.sun.setFromSphericalCoords(100, phi, theta); 
        if (triggerUpdate) this.update(0); 
    }

    // --- Quality Settings Management (IMPROVED to handle new cloud settings) ---
    setQualitySettings(newSettings) {
        Object.assign(this.qualitySettings, newSettings);

        if (this.sunLight && this.sunLight.shadow) {
            this.sunLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize, this.qualitySettings.shadowMapSize);
            this.sunLight.shadow.map = null; 
        }
        if (this.moonLight && this.moonLight.shadow) {
            this.moonLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize / 2, this.qualitySettings.shadowMapSize / 2); 
            this.moonLight.shadow.map = null;
        }

        if (this.sunLight && this.sunLight.shadow) {
            const s = this.qualitySettings.shadowFrustumSize;
            this.sunLight.shadow.camera.left = -s;
            this.sunLight.shadow.camera.right = s;
            this.sunLight.shadow.camera.top = s;
            this.sunLight.shadow.camera.bottom = -s;
            this.sunLight.shadow.camera.updateProjectionMatrix();
        }
        if (this.moonLight && this.moonLight.shadow) {
            const ms = this.qualitySettings.shadowFrustumSize;
            this.moonLight.shadow.camera.left = -ms;
            this.moonLight.shadow.camera.right = ms;
            this.moonLight.shadow.camera.top = ms;
            this.moonLight.shadow.camera.bottom = -ms;
            this.moonLight.shadow.camera.updateProjectionMatrix();
        }

        if (this.qualitySettings.enableClouds && !this.cloudSystem) {
            this.createClouds();
        } else if (!this.qualitySettings.enableClouds && this.cloudSystem) {
            this.cloudSystem.visible = false;
        }

        if (this.qualitySettings.enableVolumetricLighting && !this.volumetricLight) {
            this.createVolumetricLighting();
        } else if (!this.qualitySettings.enableVolumetricLighting && this.volumetricLight) {
            this.volumetricLight.visible = false;
        }
        
        this.update(0);
    }

    // --- Disposal Method (your original, enhanced with pmremGenerator dispose) ---
    dispose() {
        if (this.sky) {
            this.sky.geometry.dispose();
            this.sky.material.dispose();
            this.scene.remove(this.sky);
        }
        if (this.cloudSystem) {
            this.cloudSystem.geometry.dispose();
            this.cloudSystem.material.dispose();
            this.scene.remove(this.cloudSystem);
        }

        [this.sunLight, this.moonLight, this.hemiLight, this.ambientLight, this.volumetricLight].forEach(light => {
            if (light) {
                if (light.target) this.scene.remove(light.target); 
                this.scene.remove(light);
            }
        });

        if (this.pmremGenerator) {
            this.pmremGenerator.dispose();
        }
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }

        this.scene.environment = null;
        this.scene.background = null;
        this.scene.fog = null;

        if (window.mainGUI) {
            window.mainGUI.destroy();
            window.mainGUI = undefined;
        }

        // Hide GuiContainer if it was made visible
        const skySettingsContainer = document.getElementById('skySettings');
        if (skySettingsContainer) {
            skySettingsContainer.style.display = 'none';
        }

        console.log('AdvancedSkyLightingSystem disposed.');
    }
}


// Integration function for your existing init() function
function setupAdvancedSkyLighting(scene, renderer, camera) {
    const lightsToRemove = [];
    scene.traverse((child) => {
        if (child.isLight && !child.userData.keepForSky) {
            lightsToRemove.push(child);
        }
    });
    
    lightsToRemove.forEach(light => scene.remove(light));
    
    const skyLightingSystem = new AdvancedSkyLightingSystem(scene, renderer, camera);
    
    window.skyLightingSystem = skyLightingSystem;
    
    return skyLightingSystem;
}

// Export for use in your init function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AdvancedSkyLightingSystem, setupAdvancedSkyLighting };
}

function initAdvancedSkyLighting() {
    const lightsToRemove = [];
    scene.traverse((child) => {
        if (child.isLight) {
            lightsToRemove.push(child);
        }
    });
    
    lightsToRemove.forEach(light => scene.remove(light));
    
    scene.fog = null; 
    
    const skyLightingSystem = new AdvancedSkyLightingSystem(scene, renderer, camera);
    skyLightingSystem.isEnabled = true;
    skyLightingSystem.setupGUI();
    window.addEventListener('keydown', (event) => {
        switch(event.key.toLowerCase()) {
            case '1':
                skyLightingSystem.setTimeOfDay(6); 
                break;
            case '2':
                skyLightingSystem.setTimeOfDay(12); 
                break;
            case '3':
                skyLightingSystem.setTimeOfDay(18); 
                break;
            case '4':
                skyLightingSystem.setTimeOfDay(0); 
                break;
            case 'r':
                skyLightingSystem.setWeather('rainIntensity', 0.8);
                break;
            case 't':
                skyLightingSystem.setWeather('stormIntensity', 0.6);
                break;
            case 'c':
                skyLightingSystem.setWeather('rainIntensity', 0);
                skyLightingSystem.setWeather('stormIntensity', 0);
                break;
        }
    });

    skyLightingSystem.originalBackground = null;
    skyLightingSystem.originalFog = null;
    skyLightingSystem.isEnabled = true;

    skyLightingSystem.setVisible = function(visible) {
        this.isEnabled = visible;

        if (this.sky) this.sky.visible = visible;
        if (this.sunLight) this.sunLight.visible = visible;
        if (this.moonLight) this.moonLight.visible = visible;
        if (this.ambientLight) this.ambientLight.visible = visible;
        if (this.hemiLight) this.hemiLight.visible = visible;
        if (this.volumetricLight) this.volumetricLight.visible = visible;
        if (this.cloudSystem) this.cloudSystem.visible = visible; 

        if (visible) {
            scene.background = this.originalBackground;
            scene.fog = this.originalFog;
            this.originalBackground = null;
            this.originalFog = null;
        } else {
            this.originalBackground = scene.background;
            this.originalFog = scene.fog;

            scene.background = new THREE.Color(0x3a3a3a);
            scene.fog = null;
        }
    };
    
    window.skyLightingSystem = skyLightingSystem;
    
    return skyLightingSystem;
}
