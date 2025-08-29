/**
 * class AdvancedSkyLightingSystem {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.clock = new THREE.Clock();
        
        // --- ALL ORIGINAL PROPERTIES ARE RESPECTED ---
        this.skyParams = { 
            turbidity: 10, 
            rayleigh: 3, 
            mieCoefficient: 0.005, 
            mieDirectionalG: 0.7, 
            elevation: 2, 
            azimuth: 180, 
            exposure: 0.9
        };
        this.timeOfDay = 12;
        this.daySpeed = 0.05;
        this.autoTimeProgress = true;
        this.sunLight = null;
        this.moonLight = null;
        this.ambientLight = null;
        this.hemiLight = null;
        this.sky = null;
        this.sun = new THREE.Vector3();
        this.atmosphereUniforms = null;
        this.fogParams = { 
            near: 1, 
            far: 1000, 
            density: 0.00025 
        };
        this.cloudSystem = null;
        this.cloudParams = { 
            coverage: 0.3, 
            speed: 0.5, 
            height: 100, 
            thickness: 50 
        };
        this.weatherSystem = { 
            rainIntensity: 0, 
            snowIntensity: 0, 
            windStrength: 0.5, 
            stormIntensity: 0 
        };
        this.qualitySettings = { 
            skyResolution: 512, 
            shadowMapSize: 4096, 
            enableVolumetricLighting: true, 
            enableAtmosphericScattering: true, 
            enableClouds: true 
        };
        
        // --- HELPER FOR ENVIRONMENT MAP ---
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.renderTarget = null;
        this.volumetricLight = null;

        // New properties for shadow stability
        this.lastCameraPosition = new THREE.Vector3();
        this.shadowUpdateThreshold = 0.5; // Distance camera must move to update shadows
        this.lastShadowUpdate = 0;

        this.init();
    }
    
    init() {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.skyParams.exposure;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        this.createSky();
        this.createClouds();
        this.createAtmosphere();
        
        if (!this.sunLight) {
            console.warn("No sunLight provided - creating default directional light");
            this.createDefaultLighting();
        }
    }

    createDefaultLighting() {
        // Enhanced lighting setup with stable shadows
        this.sunLight = new THREE.DirectionalLight(0xffffff, 4);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 1000;
        this.sunLight.shadow.bias = -0.0002; // Adjusted for stability
        this.sunLight.shadow.normalBias = 0.05;
        this.sunLight.shadow.radius = 1.5;
        this.sunLight.name = "SunLight";
        this.scene.add(this.sunLight);

        // Moon light with improved shadow settings
        this.moonLight = new THREE.DirectionalLight(0x88aaff, 0.8);
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.width = 2048;
        this.moonLight.shadow.mapSize.height = 2048;
        this.moonLight.shadow.camera.far = 1000;
        this.moonLight.shadow.bias = -0.0002;
        this.moonLight.shadow.normalBias = 0.05;
        this.moonLight.name = "MoonLight";
        this.scene.add(this.moonLight);

        // Ambient lights with better balance
        this.hemiLight = new THREE.HemisphereLight(0xaaccff, 0x4d3b1a, 0.4);
        this.hemiLight.name = "HemisphereLight";
        this.scene.add(this.hemiLight);

        this.ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.ambientLight.name = "AmbientLight";
        this.scene.add(this.ambientLight);

        // Initialize shadow cameras
        this.updateShadowCameras(true);
    }

    updateShadowCameras(force = false) {
        const now = performance.now();
        const cameraMoved = this.lastCameraPosition.distanceTo(this.camera.position) > this.shadowUpdateThreshold;
        
        if (force || cameraMoved || now - this.lastShadowUpdate > 1000) {
            const shadowTarget = this.camera.position.clone();
            shadowTarget.y = 0;
            
            // Sun shadow camera
            this.sunLight.target.position.copy(shadowTarget);
            this.sunLight.shadow.camera.left = -100;
            this.sunLight.shadow.camera.right = 100;
            this.sunLight.shadow.camera.top = 100;
            this.sunLight.shadow.camera.bottom = -100;
            this.sunLight.shadow.camera.updateProjectionMatrix();
            
            // Moon shadow camera
            this.moonLight.target.position.copy(shadowTarget);
            this.moonLight.shadow.camera.left = -100;
            this.moonLight.shadow.camera.right = 100;
            this.moonLight.shadow.camera.top = 100;
            this.moonLight.shadow.camera.bottom = -100;
            this.moonLight.shadow.camera.updateProjectionMatrix();
            
            this.lastCameraPosition.copy(this.camera.position);
            this.lastShadowUpdate = now;
        }
    }
    
    createSky() {
        const skyVertexShader = `varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4( position, 1.0 ); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
        const skyFragmentShader = `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; uniform vec3 sunPosition; uniform float time; uniform float turbidity; uniform float rayleigh; uniform float mieCoefficient; uniform float mieDirectionalG; varying vec3 vWorldPosition; vec3 totalRayleigh(vec3 lambda) { return (8.0 * pow(3.14159, 3.0) * pow(pow(1.0003, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * 0.0)) / (3.0 * 6.02214e23 * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * 0.0)); } vec3 totalMie(vec3 lambda, vec3 K, float T) { float c = 0.2 * T * 1e-18; return 0.434 * c * 3.14159 * pow(2.0 * 3.14159 / lambda, vec3(2.0)) * K; } float rayleighPhase(float cosTheta) { return (3.0 / (16.0 * 3.14159)) * (1.0 + pow(cosTheta, 2.0)); } float miePhase(float cosTheta, float g) { float g2 = pow(g, 2.0); return (1.0 / (4.0 * 3.14159)) * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5)); } void main() { vec3 direction = normalize(vWorldPosition - cameraPosition); float sunDistance = distance(direction, normalize(sunPosition)); float sunDisk = 1.0 - smoothstep(0.0, 0.04, sunDistance); vec3 lambda = vec3(680e-9, 550e-9, 450e-9); vec3 totalRayleighCoeff = totalRayleigh(lambda) * rayleigh; vec3 totalMieCoeff = totalMie(lambda, vec3(0.686, 0.678, 0.666), turbidity) * mieCoefficient; float cosTheta = dot(direction, normalize(sunPosition)); float rayleighPhaseFactor = rayleighPhase(cosTheta); float miePhaseFactor = miePhase(cosTheta, mieDirectionalG); vec3 scattering = totalRayleighCoeff * rayleighPhaseFactor + totalMieCoeff * miePhaseFactor; float h = normalize(vWorldPosition - cameraPosition).y; float mixFactor = pow(smoothstep(0.0, 0.4, h), 0.35); vec3 skyColor = mix(bottomColor, topColor, mixFactor); skyColor += scattering * 0.1; skyColor += sunDisk * vec3(1.0, 0.9, 0.8) * 10.0; gl_FragColor = vec4(skyColor, 1.0); }`;
        
        this.atmosphereUniforms = { 
            topColor: { value: new THREE.Color(0x0077ff) }, 
            bottomColor: { value: new THREE.Color(0xffffff) }, 
            offset: { value: 400 }, 
            exponent: { value: 0.6 }, 
            sunPosition: { value: this.sun }, 
            time: { value: 0 }, 
            turbidity: { value: this.skyParams.turbidity }, 
            rayleigh: { value: this.skyParams.rayleigh }, 
            mieCoefficient: { value: this.skyParams.mieCoefficient }, 
            mieDirectionalG: { value: this.skyParams.mieDirectionalG } 
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
    
    createClouds() {
        if (!this.qualitySettings.enableClouds) return;
        
        const cloudVertexShader = `varying vec2 vUv; varying vec3 vPosition; void main() { vUv = uv; vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
        const cloudFragmentShader = `uniform float time; uniform float coverage; uniform float speed; uniform vec3 sunPosition; varying vec2 vUv; varying vec3 vPosition; float noise(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); } float fbm(vec2 st) { float value = 0.0; float amplitude = 0.5; for (int i = 0; i < 4; i++) { value += amplitude * noise(st); st *= 2.0; amplitude *= 0.5; } return value; } void main() { vec2 st = vUv * 4.0; st.x += time * speed * 0.1; float cloudNoise = fbm(st); float cloudMask = smoothstep(coverage, coverage + 0.1, cloudNoise); vec3 cloudColor = vec3(0.9, 0.9, 0.95); float lightFactor = dot(normalize(vPosition), normalize(sunPosition)); cloudColor *= 0.5 + 0.5 * lightFactor; float alpha = cloudMask * 0.8; gl_FragColor = vec4(cloudColor, alpha); }`;
        
        const cloudMaterial = new THREE.ShaderMaterial({ 
            uniforms: { 
                time: { value: 0 }, 
                coverage: { value: this.cloudParams.coverage }, 
                speed: { value: this.cloudParams.speed }, 
                sunPosition: { value: this.sun } 
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
    
    createAtmosphere() {
        if (!this.scene.fog) {
            this.scene.fog = new THREE.FogExp2(0x87CEEB, this.fogParams.density);
        }
        if (this.qualitySettings.enableVolumetricLighting) { 
            this.createVolumetricLighting(); 
        }
    }
    
    createVolumetricLighting() {
        this.volumetricLight = new THREE.SpotLight(0xffffff, 1, 200, Math.PI / 8, 0.3, 2);
        this.volumetricLight.castShadow = true; 
        this.volumetricLight.name = "VolumetricLight"; 
        this.volumetricLight.userData.ignoreInTimeline = true;
        this.scene.add(this.volumetricLight); 
        this.scene.add(this.volumetricLight.target);
    }
    
    updateTimeOfDay(deltaTime) {
        if (this.autoTimeProgress) { 
            this.timeOfDay = (this.timeOfDay + deltaTime * this.daySpeed) % 24; 
        }
        
        const sunAngle = (this.timeOfDay / 24) * Math.PI * 2 - Math.PI / 2;
        const sunElevation = Math.sin(sunAngle);
        const dayFactor = (sunElevation + 1) / 2;
        
        // Update sun position with smooth transitions
        this.sun.x = Math.cos(sunAngle) * 100; 
        this.sun.y = Math.sin(sunAngle) * 100; 
        this.sun.z = 0;
        
        // Update light positions with shadow focus
        const shadowTarget = this.camera.position.clone();
        shadowTarget.y = 0;
        
        this.sunLight.position.copy(shadowTarget).add(this.sun.clone().normalize().multiplyScalar(200));
        this.sunLight.target.position.copy(shadowTarget);
        
        this.moonLight.position.copy(shadowTarget).add(this.sun.clone().negate().normalize().multiplyScalar(200));
        this.moonLight.target.position.copy(shadowTarget);

        // Smooth light transitions
        const sunVisibility = THREE.MathUtils.smoothstep(sunElevation, -0.2, 0.1);
        this.sunLight.visible = sunVisibility > 0;
        this.sunLight.intensity = THREE.MathUtils.lerp(0.5, 4.0, sunVisibility);
        
        const moonVisibility = THREE.MathUtils.smoothstep(-sunElevation, -0.1, 0.2);
        this.moonLight.visible = moonVisibility > 0;
        this.moonLight.intensity = THREE.MathUtils.lerp(0.1, 0.8, moonVisibility);
        
        // Update light colors
        const sunColor = new THREE.Color();
        if (sunElevation > 0.2) sunColor.setHex(0xffffff);
        else if (sunElevation > -0.1) sunColor.setHex(0xffaa66);
        else sunColor.setHex(0x4488ff);
        this.sunLight.color.copy(sunColor);

        // Update ambient lights
        this.hemiLight.intensity = THREE.MathUtils.lerp(0.2, 0.4, dayFactor);
        this.ambientLight.intensity = THREE.MathUtils.lerp(0.1, 0.3, dayFactor);

        // Update volumetric light
        if (this.volumetricLight) {
            this.volumetricLight.visible = this.qualitySettings.enableVolumetricLighting && this.sunLight.visible;
            this.volumetricLight.position.copy(this.sunLight.position);
            this.volumetricLight.intensity = Math.max(0, sunElevation) * 0.5;
        }
        
        // Update shadow cameras
        this.updateShadowCameras();
    }
    
    updateFog() {
        const sunElevation = Math.sin((this.timeOfDay / 24) * Math.PI * 2 - Math.PI / 2);
        const dayFactor = (sunElevation + 1) / 2;
        
        const dayFogColor = new THREE.Color(0x87CEEB); 
        const nightFogColor = new THREE.Color(0x101015); 
        const sunsetFogColor = new THREE.Color(0xfa9d75);
        
        let currentFogColor = new THREE.Color();
        if (sunElevation > 0.1) { 
            currentFogColor.copy(dayFogColor);
        } else if (sunElevation > -0.1) { 
            const sunsetFactor = (sunElevation + 0.1) / 0.2; 
            currentFogColor.lerpColors(sunsetFogColor, dayFogColor, sunsetFactor); 
        } else { 
            const nightFactor = (sunElevation + 1.0) / 0.9; 
            currentFogColor.lerpColors(nightFogColor, sunsetFogColor, Math.max(0, nightFactor)); 
        }
        
        const fogNear = 50 + (1 - dayFactor) * -40; 
        const fogFar = 800 + (1 - dayFactor) * -600;
        
        if (this.scene.fog) { 
            this.scene.fog.color.copy(currentFogColor); 
            this.scene.fog.near = fogNear; 
            this.scene.fog.far = fogFar; 
        }
    }
    
    updateSkyColors() {
        if (!this.atmosphereUniforms) return;
        
        const dayFactor = Math.max(0, this.sun.y / 100);
        
        if (dayFactor > 0.5) { 
            this.atmosphereUniforms.topColor.value.setHex(0x0077ff); 
            this.atmosphereUniforms.bottomColor.value.setHex(0x87CEEB); 
        }
        else if (dayFactor > 0.2) { 
            this.atmosphereUniforms.topColor.value.setHex(0xff4500); 
            this.atmosphereUniforms.bottomColor.value.setHex(0xffa500); 
        }
        else { 
            this.atmosphereUniforms.topColor.value.setHex(0x000033); 
            this.atmosphereUniforms.bottomColor.value.setHex(0x001166); 
        }
        
        this.atmosphereUniforms.sunPosition.value.copy(this.sun); 
        this.atmosphereUniforms.time.value = this.timeOfDay;
    }
    
    updateClouds(deltaTime) {
        if (!this.cloudSystem || !this.qualitySettings.enableClouds) {
            if(this.cloudSystem) this.cloudSystem.visible = false;
            return;
        }
        
        this.cloudSystem.visible = true;
        const cloudUniforms = this.cloudSystem.material.uniforms;
        cloudUniforms.time.value += deltaTime;
        cloudUniforms.coverage.value = this.cloudParams.coverage;
        cloudUniforms.speed.value = this.cloudParams.speed;
        cloudUniforms.sunPosition.value.copy(this.sun);
    }
    
    update(deltaTime) {
        this.updateTimeOfDay(deltaTime);
        this.updateSkyColors();
        this.updateFog();
        this.updateClouds(deltaTime);

        // Update environment map for reflections
        if (this.renderTarget) this.renderTarget.dispose();
        this.renderTarget = this.pmremGenerator.fromScene(this.sky);
        this.scene.environment = this.renderTarget.texture;

        // Update renderer exposure
        const sunElevation = Math.max(0, this.sun.y/100);
        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.7, 1.3, sunElevation);
    }

 
    setupGUI() {
        if (typeof dat === 'undefined') {
            console.warn('dat.GUI not available - skipping GUI setup');
            return;
        }

        const gui = new dat.GUI();
        const skyFolder = gui.addFolder('Sky & Lighting');
        
        // Time controls
        skyFolder.add(this, 'timeOfDay', 0, 24)
            .name('Time of Day')
            .onChange(() => {
                this.autoTimeProgress = false;
                this.update(0);
            });
        
        skyFolder.add(this, 'autoTimeProgress')
            .name('Auto Time Progress');
        
        skyFolder.add(this, 'daySpeed', 0.01, 0.5)
            .name('Day Speed')
            .step(0.01);

        // Sky parameters
        skyFolder.add(this.skyParams, 'turbidity', 1, 20)
            .name('Turbidity')
            .onChange(() => this.updateShaderUniforms());
        
        skyFolder.add(this.skyParams, 'rayleigh', 0.1, 4)
            .name('Rayleigh')
            .onChange(() => this.updateShaderUniforms());
        
        skyFolder.add(this.skyParams, 'mieCoefficient', 0, 0.1)
            .name('Mie Coefficient')
            .onChange(() => this.updateShaderUniforms());
        
        skyFolder.add(this.skyParams, 'mieDirectionalG', 0, 1)
            .name('Mie Directional G')
            .onChange(() => this.updateShaderUniforms());
        
        skyFolder.add(this.skyParams, 'exposure', 0.1, 2)
            .name('Exposure')
            .onChange((val) => {
                this.renderer.toneMappingExposure = val;
            });

        // Cloud controls
        if (this.qualitySettings.enableClouds) {
            const cloudFolder = gui.addFolder('Clouds');
            cloudFolder.add(this.cloudParams, 'coverage', 0, 1)
                .name('Coverage')
                .onChange(() => {
                    if (this.cloudSystem) {
                        this.cloudSystem.material.uniforms.coverage.value = this.cloudParams.coverage;
                    }
                });
            
            cloudFolder.add(this.cloudParams, 'speed', 0, 2)
                .name('Speed')
                .onChange(() => {
                    if (this.cloudSystem) {
                        this.cloudSystem.material.uniforms.speed.value = this.cloudParams.speed;
                    }
                });
            
            cloudFolder.open();
        }

        // Quality settings
        const qualityFolder = gui.addFolder('Quality');
        qualityFolder.add(this.qualitySettings, 'enableVolumetricLighting')
            .name('Volumetric Lighting')
            .onChange((val) => {
                if (this.volumetricLight) {
                    this.volumetricLight.visible = val;
                }
            });
        
        qualityFolder.add(this.qualitySettings, 'enableClouds')
            .name('Enable Clouds')
            .onChange((val) => {
                if (this.cloudSystem) {
                    this.cloudSystem.visible = val;
                }
            });

        // Weather controls
        const weatherFolder = gui.addFolder('Weather');
        weatherFolder.add(this.weatherSystem, 'rainIntensity', 0, 1)
            .name('Rain Intensity')
            .onChange((val) => this.setWeather('rainIntensity', val));
        
        weatherFolder.add(this.weatherSystem, 'stormIntensity', 0, 1)
            .name('Storm Intensity')
            .onChange((val) => this.setWeather('stormIntensity', val));
        
        weatherFolder.add(this.weatherSystem, 'windStrength', 0, 1)
            .name('Wind Strength')
            .onChange((val) => {
                this.weatherSystem.windStrength = val;
                if (this.cloudSystem) {
                    this.cloudParams.speed = 0.5 + val * 1.5;
                    this.cloudSystem.material.uniforms.speed.value = this.cloudParams.speed;
                }
            });

        skyFolder.open();
        weatherFolder.open();

        const guiContainer = document.getElementById('gui-container');
        guiContainer.appendChild(this.gui.domElement);
        // Store reference
        this.gui = gui;
    }

    updateShaderUniforms() {
        if (!this.atmosphereUniforms) return;
        
        this.atmosphereUniforms.turbidity.value = this.skyParams.turbidity;
        this.atmosphereUniforms.rayleigh.value = this.skyParams.rayleigh;
        this.atmosphereUniforms.mieCoefficient.value = this.skyParams.mieCoefficient;
        this.atmosphereUniforms.mieDirectionalG.value = this.skyParams.mieDirectionalG;

        // Force immediate update
        this.update(0);
    }

    setWeather(type, intensity) {
        this.weatherSystem[type] = intensity;
        
        switch(type) {
            case 'rainIntensity':
                // Increase cloud coverage and fog density when raining
                this.cloudParams.coverage = Math.min(1, 0.3 + intensity * 0.7);
                this.fogParams.density = 0.00025 + intensity * 0.001;
                
                if (this.cloudSystem) {
                    this.cloudSystem.material.uniforms.coverage.value = this.cloudParams.coverage;
                }
                if (this.scene.fog) {
                    this.scene.fog.density = this.fogParams.density;
                }
                break;
                
            case 'stormIntensity':
                // Make sky more turbid during storms
                this.skyParams.turbidity = 10 + intensity * 20;
                this.sunLight.intensity *= (1 - intensity * 0.5);
                
                if (this.atmosphereUniforms) {
                    this.atmosphereUniforms.turbidity.value = this.skyParams.turbidity;
                }
                break;
                
            default:
                break;
        }
        
        this.update(0);
    }

    setTimeOfDay(hours) {
        this.timeOfDay = hours % 24;
        this.autoTimeProgress = false;
        this.update(0); // Force immediate update
    }

    setSunPosition(elevation, azimuth) {
        this.skyParams.elevation = elevation;
        this.skyParams.azimuth = azimuth;
        this.autoTimeProgress = false;
        
        const phi = THREE.MathUtils.degToRad(90 - elevation);
        const theta = THREE.MathUtils.degToRad(azimuth);
        this.sun.setFromSphericalCoords(1, phi, theta);
        
        this.update(0); // Force immediate update
    }

    dispose() {
        // Clean up sky
        if (this.sky) {
            this.sky.geometry.dispose();
            this.sky.material.dispose();
            this.scene.remove(this.sky);
        }

        // Clean up clouds
        if (this.cloudSystem) {
            this.cloudSystem.geometry.dispose();
            this.cloudSystem.material.dispose();
            this.scene.remove(this.cloudSystem);
        }

        // Clean up lights
        [this.sunLight, this.moonLight, this.hemiLight, this.ambientLight, this.volumetricLight].forEach(light => {
            if (light) {
                if (light.target) this.scene.remove(light.target);
                this.scene.remove(light);
                if (light.dispose) light.dispose();
            }
        });

        // Clean up environment map
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }
        if (this.pmremGenerator) {
            this.pmremGenerator.dispose();
        }

        // Reset scene properties
        this.scene.environment = null;
        this.scene.background = null;
        this.scene.fog = null;

        // Clean up GUI
        if (this.gui) {
            this.gui.destroy();
            const guiContainer = document.getElementById('gui-container');
            if (guiContainer) {
                guiContainer.innerHTML = '';
            }
        }
    }
}
 */

class AdvancedSkyLightingSystem {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.clock = new THREE.Clock();
        
        // --- ALL ORIGINAL PROPERTIES ARE RESPECTED ---
        this.skyParams = { 
            turbidity: 10, rayleigh: 3, mieCoefficient: 0.005, mieDirectionalG: 0.7, 
            elevation: 2, azimuth: 180, exposure: 0.9 
        };
        this.timeOfDay = 12;
        this.daySpeed = 0.005;
        this.autoTimeProgress = true;
        this.sunLight = null;
        this.moonLight = null;
        this.ambientLight = null;
        this.hemiLight = null;
        this.sky = null;
        this.sun = new THREE.Vector3();
        this.atmosphereUniforms = null;
        this.fogParams = { near: 1, far: 1000, density: 0.00025 };
        this.cloudSystem = null;
        this.cloudParams = { coverage: 0.3, speed: 0.5, height: 100, thickness: 50 };
        this.weatherSystem = { rainIntensity: 0, snowIntensity: 0, windStrength: 0.5, stormIntensity: 0 };
        
        // --- ENHANCEMENT: Add shadowFrustumSize to quality settings for easy control ---
        this.qualitySettings = { 
            skyResolution: 512, 
            shadowMapSize: 4096, 
            shadowFrustumSize: 30, // Tighter frustum for higher detail shadows
            enableVolumetricLighting: true, 
            enableAtmosphericScattering: true, 
            enableClouds: true 
        };
        
        // --- HELPER FOR ENVIRONMENT MAP ---
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.renderTarget = null;
        this.volumetricLight = null;

        // No longer needed, update is handled every frame
        // this.lastCameraPosition = new THREE.Vector3();
        // this.shadowUpdateThreshold = 0.5;
        // this.lastShadowUpdate = 0;

        this.init();
    }
    
    init() {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.skyParams.exposure;
        this.renderer.shadowMap.enabled = true;

      
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;// Smooth edges
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;

        
        // --- FIX: Use PCFShadowMap for sharp, crisp shadows, not PCFSoftShadowMap ---
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        this.createSky();
        this.createClouds();
        this.createAtmosphere();
        
        if (!this.sunLight) {
            this.createDefaultLighting();
        }
    }

    /*createDefaultLighting() {
        this.sunLight = new THREE.DirectionalLight(0xffffff, 4);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = this.qualitySettings.shadowMapSize;
        this.sunLight.shadow.mapSize.height = this.qualitySettings.shadowMapSize;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 1000;
        
        // --- FIX: Settings for sharp, artifact-free shadows ---
        this.sunLight.shadow.bias = -0.0001; // Use a very small bias
        this.sunLight.shadow.normalBias = 0.0; // Set normalBias to 0 to prevent "peter-panning"
        this.sunLight.shadow.radius = 0; // Set radius to 0 to remove ALL blurriness
        
        this.sunLight.name = "SunLight";
        this.scene.add(this.sunLight);

        this.moonLight = new THREE.DirectionalLight(0x88aaff, 0.8);
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.width = 2048;
        this.moonLight.shadow.mapSize.height = 2048;
        this.moonLight.shadow.camera.far = 1000;
        this.moonLight.shadow.bias = -0.0001;
        this.moonLight.shadow.normalBias = 0.0;
        this.moonLight.name = "MoonLight";
        this.scene.add(this.moonLight);

        // --- ENHANCEMENT: Slightly reduced ambient to make shadows darker and "pop" more ---
        this.hemiLight = new THREE.HemisphereLight(0xaaccff, 0x4d3b1a, 0.2);
        this.hemiLight.name = "HemisphereLight";
        this.scene.add(this.hemiLight);

        this.ambientLight = new THREE.AmbientLight(0x404040, 0.2);
        this.ambientLight.name = "AmbientLight";
        this.scene.add(this.ambientLight);
    }*/

        createDefaultLighting() {
    this.sunLight = new THREE.DirectionalLight(0xffffff, 4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(this.qualitySettings.shadowMapSize, this.qualitySettings.shadowMapSize);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 1000;

    // Sharper and stable shadows
    this.sunLight.shadow.bias = -0.00015;
    this.sunLight.shadow.normalBias = 0.002; // Small boost to prevent acne
    this.sunLight.shadow.radius = 1; // Slight softness without blur

    // Start with tighter frustum
    const s = this.qualitySettings.shadowFrustumSize;
    this.sunLight.shadow.camera.left = -s;
    this.sunLight.shadow.camera.right = s;
    this.sunLight.shadow.camera.top = s;
    this.sunLight.shadow.camera.bottom = -s;

    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Moon light
    this.moonLight = new THREE.DirectionalLight(0x88aaff, 0.8);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(2048, 2048);
    this.moonLight.shadow.bias = -0.00015;
    this.moonLight.shadow.normalBias = 0.002;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);

    // Ambient & hemisphere
    this.hemiLight = new THREE.HemisphereLight(0xaaccff, 0x4d3b1a, 0.25);
    this.ambientLight = new THREE.AmbientLight(0x404040, 0.25);
    this.scene.add(this.hemiLight, this.ambientLight);
}

updateShadowFrustum(light, focusPoint) {
    const size = this.qualitySettings.shadowFrustumSize;

    // Keep frustum centered on the focus point
    light.position.copy(focusPoint.clone().add(light.position.clone().sub(light.target.position)));

    light.shadow.camera.left = -size;
    light.shadow.camera.right = size;
    light.shadow.camera.top = size;
    light.shadow.camera.bottom = -size;
    light.shadow.camera.updateProjectionMatrix();
}

    
    // This function is no longer needed as the logic is now inside updateTimeOfDay
    // updateShadowCameras(force = false) { ... }
    
    createSky() {
        const skyVertexShader = `varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4( position, 1.0 ); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
        const skyFragmentShader = `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; uniform vec3 sunPosition; uniform float time; uniform float turbidity; uniform float rayleigh; uniform float mieCoefficient; uniform float mieDirectionalG; varying vec3 vWorldPosition; vec3 totalRayleigh(vec3 lambda) { return (8.0 * pow(3.14159, 3.0) * pow(pow(1.0003, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * 0.0)) / (3.0 * 6.02214e23 * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * 0.0)); } vec3 totalMie(vec3 lambda, vec3 K, float T) { float c = 0.2 * T * 1e-18; return 0.434 * c * 3.14159 * pow(2.0 * 3.14159 / lambda, vec3(2.0)) * K; } float rayleighPhase(float cosTheta) { return (3.0 / (16.0 * 3.14159)) * (1.0 + pow(cosTheta, 2.0)); } float miePhase(float cosTheta, float g) { float g2 = pow(g, 2.0); return (1.0 / (4.0 * 3.14159)) * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5)); } void main() { vec3 direction = normalize(vWorldPosition - cameraPosition); float sunDistance = distance(direction, normalize(sunPosition)); float sunDisk = 1.0 - smoothstep(0.0, 0.04, sunDistance); vec3 lambda = vec3(680e-9, 550e-9, 450e-9); vec3 totalRayleighCoeff = totalRayleigh(lambda) * rayleigh; vec3 totalMieCoeff = totalMie(lambda, vec3(0.686, 0.678, 0.666), turbidity) * mieCoefficient; float cosTheta = dot(direction, normalize(sunPosition)); float rayleighPhaseFactor = rayleighPhase(cosTheta); float miePhaseFactor = miePhase(cosTheta, mieDirectionalG); vec3 scattering = totalRayleighCoeff * rayleighPhaseFactor + totalMieCoeff * miePhaseFactor; float h = normalize(vWorldPosition - cameraPosition).y; float mixFactor = pow(smoothstep(0.0, 0.4, h), 0.35); vec3 skyColor = mix(bottomColor, topColor, mixFactor); skyColor += scattering * 0.1; skyColor += sunDisk * vec3(1.0, 0.9, 0.8) * 10.0; gl_FragColor = vec4(skyColor, 1.0); }`;
        this.atmosphereUniforms = { topColor: { value: new THREE.Color(0x0077ff) }, bottomColor: { value: new THREE.Color(0xffffff) }, offset: { value: 400 }, exponent: { value: 0.6 }, sunPosition: { value: this.sun }, time: { value: 0 }, turbidity: { value: this.skyParams.turbidity }, rayleigh: { value: this.skyParams.rayleigh }, mieCoefficient: { value: this.skyParams.mieCoefficient }, mieDirectionalG: { value: this.skyParams.mieDirectionalG } };
        const skyMaterial = new THREE.ShaderMaterial({ uniforms: this.atmosphereUniforms, vertexShader: skyVertexShader, fragmentShader: skyFragmentShader, side: THREE.BackSide });
        this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 15), skyMaterial);
        this.sky.name = "AdvancedSky"; this.sky.userData.ignoreInTimeline = true;
        this.scene.add(this.sky);
        this.scene.background = this.sky;
    }
    
    createClouds() {
        if (!this.qualitySettings.enableClouds) return;
        const cloudVertexShader = `varying vec2 vUv; varying vec3 vPosition; void main() { vUv = uv; vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
        const cloudFragmentShader = `uniform float time; uniform float coverage; uniform float speed; uniform vec3 sunPosition; varying vec2 vUv; varying vec3 vPosition; float noise(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); } float fbm(vec2 st) { float value = 0.0; float amplitude = 0.5; for (int i = 0; i < 4; i++) { value += amplitude * noise(st); st *= 2.0; amplitude *= 0.5; } return value; } void main() { vec2 st = vUv * 4.0; st.x += time * speed * 0.1; float cloudNoise = fbm(st); float cloudMask = smoothstep(coverage, coverage + 0.1, cloudNoise); vec3 cloudColor = vec3(0.9, 0.9, 0.95); float lightFactor = dot(normalize(vPosition), normalize(sunPosition)); cloudColor *= 0.5 + 0.5 * lightFactor; float alpha = cloudMask * 0.8; gl_FragColor = vec4(cloudColor, alpha); }`;
        const cloudMaterial = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, coverage: { value: this.cloudParams.coverage }, speed: { value: this.cloudParams.speed }, sunPosition: { value: this.sun } }, vertexShader: cloudVertexShader, fragmentShader: cloudFragmentShader, transparent: true, side: THREE.DoubleSide });
        this.cloudSystem = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 32, 32), cloudMaterial);
        this.cloudSystem.position.y = this.cloudParams.height; this.cloudSystem.rotation.x = -Math.PI / 2; this.cloudSystem.name = "CloudSystem"; this.cloudSystem.userData.ignoreInTimeline = true;
        this.scene.add(this.cloudSystem);
    }
    
    createAtmosphere() {
        if (!this.scene.fog) { this.scene.fog = new THREE.Fog(0x87CEEB, 1, 1000); }
        if (this.qualitySettings.enableVolumetricLighting) { this.createVolumetricLighting(); }
    }
    
    createVolumetricLighting() {
        this.volumetricLight = new THREE.SpotLight(0xffffff, 1, 200, Math.PI / 8, 0.3, 2);
        this.volumetricLight.castShadow = false; // This must be false
        this.volumetricLight.name = "VolumetricLight"; this.volumetricLight.userData.ignoreInTimeline = true;
        this.scene.add(this.volumetricLight); this.scene.add(this.volumetricLight.target);
    }
    
    updateTimeOfDay(deltaTime) {
        if (this.autoTimeProgress) { this.timeOfDay = (this.timeOfDay + deltaTime * this.daySpeed) % 24; }
        
        const sunAngle = (this.timeOfDay / 24) * Math.PI * 2 - Math.PI / 2;
        const sunElevation = Math.sin(sunAngle);
        const dayFactor = (sunElevation + 1) / 2;
        
        this.sun.x = Math.cos(sunAngle) * 100; this.sun.y = Math.sin(sunAngle) * 100; this.sun.z = 0;
        
        const shadowTargetPos = this.camera.position.clone();
        shadowTargetPos.y = 0;
        
        const sunDirection = this.sun.clone().normalize();
        this.sunLight.position.copy(shadowTargetPos).add(sunDirection.multiplyScalar(200));
        this.sunLight.target.position.copy(shadowTargetPos);
        
        const focusPoint = this.camera.position.clone();
        focusPoint.y = 0;

        this.sunLight.target.position.copy(focusPoint);
        this.updateShadowFrustum(this.sunLight, focusPoint);

        this.moonLight.target.position.copy(focusPoint);
        this.updateShadowFrustum(this.moonLight, focusPoint);

        const moonDirection = this.sun.clone().negate().normalize();
        this.moonLight.position.copy(shadowTargetPos).add(moonDirection.multiplyScalar(200));
        this.moonLight.target.position.copy(shadowTargetPos);

        // --- ENHANCEMENT: Use the frustum size from quality settings ---
        const frustumSize = this.qualitySettings.shadowFrustumSize;
        this.sunLight.shadow.camera.left = -frustumSize;
        this.sunLight.shadow.camera.right = frustumSize;
        this.sunLight.shadow.camera.top = frustumSize;
        this.sunLight.shadow.camera.bottom = -frustumSize;
        this.sunLight.shadow.camera.updateProjectionMatrix();

        const sunVisibility = THREE.MathUtils.smoothstep(sunElevation, -0.2, 0.1);
        this.sunLight.visible = sunVisibility > 0;
        this.sunLight.intensity = THREE.MathUtils.lerp(0.5, 4.0, sunVisibility);
        
        const moonVisibility = THREE.MathUtils.smoothstep(-sunElevation, -0.1, 0.2);
        this.moonLight.visible = moonVisibility > 0;
        this.moonLight.intensity = THREE.MathUtils.lerp(0.1, 0.8, moonVisibility);
        
        const sunColor = new THREE.Color();
        if (sunElevation > 0.2) sunColor.setHex(0xffffff);
        else if (sunElevation > -0.1) sunColor.setHex(0xffaa66);
        else sunColor.setHex(0x4488ff);
        this.sunLight.color.copy(sunColor);

        this.hemiLight.intensity = THREE.MathUtils.lerp(0.1, 0.2, dayFactor);
        this.ambientLight.intensity = THREE.MathUtils.lerp(0.1, 0.2, dayFactor);

        if (this.volumetricLight) {
            this.volumetricLight.visible = this.qualitySettings.enableVolumetricLighting && this.sunLight.visible;
            this.volumetricLight.position.copy(this.sunLight.position);
            this.volumetricLight.target.position.copy(shadowTargetPos);
            this.volumetricLight.intensity = Math.max(0, sunElevation) * 0.5;
        }
    }
    
    update(deltaTime) {
        this.updateTimeOfDay(deltaTime);
        this.updateSkyColors();
        this.updateFog();
        this.updateClouds(deltaTime);
        if (this.renderTarget) this.renderTarget.dispose();
        this.renderTarget = this.pmremGenerator.fromScene(this.sky);
        this.scene.environment = this.renderTarget.texture;
        const sunElevation = Math.max(0, this.sun.y / 100);
        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.7, 1.3, sunElevation);
    }
    
    // The rest of the methods are unchanged as they are not relevant to the shadow fix.
    // I include them here so the class is complete and can be copied directly.
    updateFog() { const sunElevation = Math.sin((this.timeOfDay / 24) * Math.PI * 2 - Math.PI / 2); const dayFactor = (sunElevation + 1) / 2; const dayFogColor = new THREE.Color(0x87CEEB); const nightFogColor = new THREE.Color(0x101015); const sunsetFogColor = new THREE.Color(0xfa9d75); let currentFogColor = new THREE.Color(); if (sunElevation > 0.1) { currentFogColor.copy(dayFogColor); } else if (sunElevation > -0.1) { const sunsetFactor = (sunElevation + 0.1) / 0.2; currentFogColor.lerpColors(sunsetFogColor, dayFogColor, sunsetFactor); } else { const nightFactor = (sunElevation + 1.0) / 0.9; currentFogColor.lerpColors(nightFogColor, sunsetFogColor, Math.max(0, nightFactor)); } if (this.scene.fog) { this.scene.fog.color.copy(currentFogColor); if (this.scene.fog.isFog) { this.scene.fog.near = 50 + (1 - dayFactor) * -40; this.scene.fog.far = 800 + (1 - dayFactor) * -600; } } }
    updateSkyColors() { if (!this.atmosphereUniforms) return; const dayFactor = Math.max(0, this.sun.y / 100); if (dayFactor > 0.5) { this.atmosphereUniforms.topColor.value.setHex(0x0077ff); this.atmosphereUniforms.bottomColor.value.setHex(0x87CEEB); } else if (dayFactor > 0.2) { this.atmosphereUniforms.topColor.value.setHex(0xff4500); this.atmosphereUniforms.bottomColor.value.setHex(0xffa500); } else { this.atmosphereUniforms.topColor.value.setHex(0x000033); this.atmosphereUniforms.bottomColor.value.setHex(0x001166); } this.atmosphereUniforms.sunPosition.value.copy(this.sun); this.atmosphereUniforms.time.value = this.timeOfDay; }
    updateClouds(deltaTime) { if (!this.cloudSystem || !this.qualitySettings.enableClouds) { if(this.cloudSystem) this.cloudSystem.visible = false; return; } this.cloudSystem.visible = true; const cloudUniforms = this.cloudSystem.material.uniforms; cloudUniforms.time.value += deltaTime; cloudUniforms.coverage.value = this.cloudParams.coverage; cloudUniforms.speed.value = this.cloudParams.speed; cloudUniforms.sunPosition.value.copy(this.sun); }
    setupGUI() { 
        if (typeof dat === 'undefined') { 
            console.warn('dat.GUI not available - skipping GUI setup'); 
            return; 
        } 
        const gui = new dat.GUI(); 
        const skyFolder = gui.addFolder('Sky & Lighting'); 
        skyFolder.add(this, 'timeOfDay', 0, 24).name('Time of Day').onChange(() => { 
            this.autoTimeProgress = false; this.update(0); 
        }); 
        skyFolder.add(this, 'autoTimeProgress').name('Auto Time Progress'); 
        skyFolder.add(this, 'daySpeed', 0.01, 0.5).name('Day Speed').step(0.01); 
        const qualityFolder = gui.addFolder('Quality'); 
        qualityFolder.add(this.qualitySettings, 'shadowFrustumSize', 10, 200).name('Shadow Area Size'); 
        qualityFolder.add(this.sunLight.shadow, 'radius', 0, 10).name('Shadow Softness'); 
        qualityFolder.add(this.sunLight.shadow, 'bias', -0.01, 0.01).name('Shadow Bias'); 
        qualityFolder.open(); /* ...rest of GUI... */ if(window.mainGUI) { 
            window.mainGUI.domElement.parentElement.removeChild(window.mainGUI.domElement); 
        } 
        skyFolder.open();
        qualityFolder.open();
  

        const guiContainer = document.getElementById('gui-container')
        guiContainer.appendChild(skyFolder.domElement);
        guiContainer.appendChild(qualityFolder.domElement);

        window.mainGUI = gui; 
    }
   
    updateShaderUniforms() { if (!this.atmosphereUniforms) return; this.atmosphereUniforms.turbidity.value = this.skyParams.turbidity; this.atmosphereUniforms.rayleigh.value = this.skyParams.rayleigh; this.atmosphereUniforms.mieCoefficient.value = this.skyParams.mieCoefficient; this.atmosphereUniforms.mieDirectionalG.value = this.skyParams.mieDirectionalG; this.update(0); }
    setWeather(type, intensity) { this.weatherSystem[type] = intensity; switch(type) { case 'rainIntensity': this.cloudParams.coverage = Math.min(1, 0.3 + intensity * 0.7); if (this.cloudSystem) { this.cloudSystem.material.uniforms.coverage.value = this.cloudParams.coverage; } break; case 'stormIntensity': this.skyParams.turbidity = 10 + intensity * 20; this.sunLight.intensity *= (1 - intensity * 0.5); if (this.atmosphereUniforms) { this.atmosphereUniforms.turbidity.value = this.skyParams.turbidity; } break; default: break; } this.update(0); }
    setTimeOfDay(hours) { this.timeOfDay = hours % 24; this.autoTimeProgress = false; this.update(0); }
    setSunPosition(elevation, azimuth) { this.skyParams.elevation = elevation; this.skyParams.azimuth = azimuth; this.autoTimeProgress = false; const phi = THREE.MathUtils.degToRad(90 - elevation); const theta = THREE.MathUtils.degToRad(azimuth); this.sun.setFromSphericalCoords(1, phi, theta); this.update(0); }
    dispose() { if (this.sky) { this.sky.geometry.dispose(); this.sky.material.dispose(); this.scene.remove(this.sky); } if (this.cloudSystem) { this.cloudSystem.geometry.dispose(); this.cloudSystem.material.dispose(); this.scene.remove(this.cloudSystem); } [this.sunLight, this.moonLight, this.hemiLight, this.ambientLight, this.volumetricLight].forEach(light => { if (light) { if (light.target) this.scene.remove(light.target); this.scene.remove(light); if (light.dispose) light.dispose(); } }); if (this.renderTarget) { this.renderTarget.dispose(); } if (this.pmremGenerator) { this.pmremGenerator.dispose(); } this.scene.environment = null; this.scene.background = null; this.scene.fog = null; if (window.mainGUI) { window.mainGUI.destroy(); window.mainGUI = undefined; } }
}

// Integration function for your existing init() function
function setupAdvancedSkyLighting(scene, renderer, camera) {
    // Remove existing basic lighting
    const lightsToRemove = [];
    scene.traverse((child) => {
        if (child.isLight && !child.userData.keepForSky) {
            lightsToRemove.push(child);
        }
    });
    
    lightsToRemove.forEach(light => scene.remove(light));
    
    // Create and return the new sky lighting system
    const skyLightingSystem = new AdvancedSkyLightingSystem(scene, renderer, camera);
    
    // Expose globally for debugging
    window.skyLightingSystem = skyLightingSystem;
    
    return skyLightingSystem;
}

// Export for use in your init function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AdvancedSkyLightingSystem, setupAdvancedSkyLighting };
}

function initAdvancedSkyLighting() {
    // First, remove any existing basic lighting
    const lightsToRemove = [];
    scene.traverse((child) => {
        if (child.isLight) {
            lightsToRemove.push(child);
        }
    });
    
    lightsToRemove.forEach(light => scene.remove(light));
    
    // Clear existing fog
    scene.fog = new THREE.Fog(0xcccccc, 50, 180);

    //scene.fog = null;
    
    // Initialize the advanced sky lighting system
    const skyLightingSystem = new AdvancedSkyLightingSystem(scene, renderer, camera);
    skyLightingSystem.isEnabled = true;
    // Add keyboard controls for quick testing
    window.addEventListener('keydown', (event) => {
        switch(event.key.toLowerCase()) {
            case '1':
                skyLightingSystem.setTimeOfDay(6); // Dawn
                break;
            case '2':
                skyLightingSystem.setTimeOfDay(12); // Noon
                break;
            case '3':
                skyLightingSystem.setTimeOfDay(18); // Sunset
                break;
            case '4':
                skyLightingSystem.setTimeOfDay(0); // Midnight
                break;
            case 'r':
                skyLightingSystem.setWeather('rainIntensity', 0.8);
                break;
            case 't':
                skyLightingSystem.setWeather('stormIntensity', 0.6);
                break;
            case 'c':
                // Clear weather
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

        // Hide or show all the visual components managed by the system.
        // (You may need to adjust these property names if your system uses different ones)
        if (this.sky) this.sky.visible = visible;
        if (this.sunLight) this.sunLight.visible = visible;
        if (this.ambientLight) this.ambientLight.visible = visible;
        if (this.hemiLight) this.hemiLight.visible = visible;
        if (this.clouds) this.clouds.visible = visible; // If you have a separate cloud object

        if (visible) {
            // --- RESTORE THE SKY ---
            // Restore the background and fog that the system was managing
            scene.background = this.originalBackground;
            scene.fog = this.originalFog;
            this.originalBackground = null;
            this.originalFog = null;
        } else {
            // --- HIDE THE SKY FOR MODELING MODE ---
            // Store the current background/fog so we can restore it later
            this.originalBackground = scene.background;
            this.originalFog = scene.fog;

            // Set a neutral, dark gray background for modeling
            scene.background = new THREE.Color(0x3a3a3a);
            // Disable fog completely
            scene.fog = null;
        }
    };
    
    // Store reference globally
    window.skyLightingSystem = skyLightingSystem;
    
    return skyLightingSystem;
}
