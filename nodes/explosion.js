// --- ExplosionManager.js ---

class ExplosionManager {
    // The manager receives essential components from your editor
    constructor(scene, camera, clock) {
        this.scene = scene;
        this.camera = camera;
        this.clock = clock;

        this.particleSystem = null;
        this.particlePool = [];
        this.activeParticles = 0;
        this.debrisGroup = null;

        // Camera shake state
        this.shakeIntensity = 0;
        this.SHAKE_DECAY = 5.0;
        this.originalCameraPos = new THREE.Vector3(); // To avoid conflicts with OrbitControls

        // Default parameters for the explosion
        this.params = {
            maxParticles: 5000, explosionPower: 1.0, fireballSize: 1.0, baseTemperature: 5500,
            tempVariation: 1000, fireCoreHue: 16, fireEdgeHue: 60, fireSpeed: 15.0,
            fireSpeedVariation: 0.5, fireTurbulence: 0.5, fireLifetime: 1.0, smokeAmount: 0.5,
            smokeDarkness: 0.3, smokeHue: 0, smokeOpacity: 0.5, smokeRiseSpeed: 1.0,
            smokeExpandRate: 2.0, smokeSwirlAmount: 0.5, smokeLifetime: 3.0, gravity: 9.8,
            airResistance: 0.02, shockwave: 0.5, debrisAmount: 0, emberGlow: 0.5, timeScale: 1.0,
        };
    }

    // This method sets up the particle system and adds it to the scene
    init() {
        this._initParticleSystem();
        this.debrisGroup = new THREE.Group();
        // IMPORTANT: Add a flag to prevent your editor systems from processing this
        this.debrisGroup.userData.ignoreInTimeline = true;
        this.debrisGroup.userData.isHelper = true; // Another common flag
        this.scene.add(this.debrisGroup);

        // Setup the UI event listeners
        this._setupEventListeners();
        this._updateAllUI();
    }

    // The main update loop, called from your editor's animate() function
    update(deltaTime) {
        const scaledDelta = deltaTime * this.params.timeScale;
        if (scaledDelta <= 0) return;

        // --- Update Particles ---
        let currentActiveCount = 0;
        for (let i = 0; i < this.params.maxParticles; i++) {
            const p = this.particlePool[i];
            if (p && p.isActive) {
                p.update(scaledDelta);
                currentActiveCount++;
            }
        }
        this.activeParticles = currentActiveCount;

        if (this.activeParticles > 0) {
            this.particleSystem.geometry.attributes.position.needsUpdate = true;
            this.particleSystem.geometry.attributes.color.needsUpdate = true;
            this.particleSystem.geometry.attributes.particleSize.needsUpdate = true;
            this.particleSystem.geometry.attributes.particleOpacity.needsUpdate = true;
        }

        // --- Update Debris ---
        this.debrisGroup.children.forEach(debris => {
            if (!debris.isMesh) return;
            debris.life -= scaledDelta;
            if (debris.life <= 0) {
                debris.visible = false;
            }
            debris.velocity.y -= this.params.gravity * scaledDelta;
            debris.position.addScaledVector(debris.velocity, scaledDelta);
            debris.rotation.x += debris.angularVelocity.x * scaledDelta;
            debris.rotation.y += debris.angularVelocity.y * scaledDelta;
            if (debris.position.y < 0) debris.visible = false;
        });

        // --- Update Camera Shake (non-intrusively) ---
        if (this.shakeIntensity > 0.01) {
            const shake = new THREE.Vector3(
                (Math.random() - 0.5) * this.shakeIntensity * 0.2,
                (Math.random() - 0.5) * this.shakeIntensity * 0.2,
                (Math.random() - 0.5) * this.shakeIntensity * 0.2
            );
            this.camera.position.add(shake);
            this.shakeIntensity -= this.SHAKE_DECAY * scaledDelta;
        }

        // --- Update Stats UI ---
        const statsEl = document.getElementById('particle-count-display');
        if (statsEl) statsEl.textContent = this.activeParticles;
    }

    // Triggers a new explosion
    triggerExplosion(x = 0, y = 5, z = 0) {
    // Don't reset particles here - let them be overwritten by new spawns
    // this.activeParticles = 0;
    // this.particlePool.forEach(p => p.isActive = false);

    // Clear debris is still needed
    while (this.debrisGroup.children.length > 0) {
        const debris = this.debrisGroup.children[0];
        this.debrisGroup.remove(debris);
        if (debris.geometry) debris.geometry.dispose();
        if (debris.material) debris.material.dispose();
    }

    const origin = new THREE.Vector3(x, y, z);
    this._createFlash(origin);
    this.shakeIntensity = this.params.explosionPower * 5.0;

    let nextParticleIndex = 0;
    const spawnParticle = (isSmoke) => {
        if (nextParticleIndex >= this.params.maxParticles) return;
        this.particlePool[nextParticleIndex].spawn(origin, isSmoke);
        nextParticleIndex++;
    };

    const debrisRatio = this.params.debrisAmount / 100;
    const smokeRatio = this.params.smokeAmount * (1 - debrisRatio);
    const fireRatio = 1 - smokeRatio - debrisRatio;

    const fireCount = Math.floor(this.params.maxParticles * fireRatio);
    const smokeCount = Math.floor(this.params.maxParticles * smokeRatio);
    const debrisCount = Math.floor(this.params.maxParticles * debrisRatio);

    // Reset active particles counter to 0 before spawning new ones
    this.activeParticles = 0;

    this.particleSystem.material.blending = THREE.AdditiveBlending;
    for (let i = 0; i < fireCount; i++) spawnParticle(false);

    this.particleSystem.material.blending = THREE.NormalBlending;
    for (let i = 0; i < smokeCount; i++) spawnParticle(true);

    this._createDebris(origin, debrisCount);
}
    /*triggerExplosion(x = 0, y = 5, z = 0) {
        this.activeParticles = 0;
        this.particlePool.forEach(p => p.isActive = false);
    
        while (this.debrisGroup.children.length > 0) {
            this.debrisGroup.remove(this.debrisGroup.children[0]);
        }

        const origin = new THREE.Vector3(x, y, z);
        this._createFlash(origin);
        this.shakeIntensity = this.params.explosionPower * 5.0;

        let nextParticleIndex = 0;
        const spawnParticle = (isSmoke) => {
            if (nextParticleIndex >= this.params.maxParticles) return;
            this.particlePool[nextParticleIndex].spawn(origin, isSmoke);
            nextParticleIndex++;
        };

        const debrisRatio = this.params.debrisAmount / 100;
        const smokeRatio = this.params.smokeAmount * (1 - debrisRatio);
        const fireRatio = 1 - smokeRatio - debrisRatio;

        const fireCount = Math.floor(this.params.maxParticles * fireRatio);
        const smokeCount = Math.floor(this.params.maxParticles * smokeRatio);
        const debrisCount = Math.floor(this.params.maxParticles * debrisRatio);

        this.particleSystem.material.blending = THREE.AdditiveBlending;
        for (let i = 0; i < fireCount; i++) spawnParticle(false);

        this.particleSystem.material.blending = THREE.NormalBlending;
        for (let i = 0; i < smokeCount; i++) spawnParticle(true);

        this._createDebris(origin, debrisCount);
    }*/
    

    // Inside the ExplosionManager class in ExplosionManager.js
    clear() {
    // 1. Clear all particles
    if (this.particleSystem && this.particleSystem.geometry) {
        const positions = this.particleSystem.geometry.attributes.position;
        const sizes = this.particleSystem.geometry.attributes.particleSize;
        const opacities = this.particleSystem.geometry.attributes.particleOpacity;

        // Reset all particles
        for (let i = 0; i < this.particlePool.length; i++) {
            this.particlePool[i].isActive = false;
            positions.setXYZ(i, 0, 0, 0);
            sizes.setX(i, 0);
            opacities.setX(i, 0);
        }

        positions.needsUpdate = true;
        sizes.needsUpdate = true;
        opacities.needsUpdate = true;
    }

    // 2. Clear all debris
    while (this.debrisGroup.children.length > 0) {
        const debris = this.debrisGroup.children[0];
        this.debrisGroup.remove(debris);
        // Optional: dispose of geometry and material if needed
        if (debris.geometry) debris.geometry.dispose();
        if (debris.material) debris.material.dispose();
    }

    // 3. Reset camera shake
    this.shakeIntensity = 0;
    if (this.originalCameraPos.length() > 0) {
        this.camera.position.copy(this.originalCameraPos);
    }

    // 4. Reset active particles counter
    this.activeParticles = 0;

    // Add this to the clear() method
if (this.activeFlashes) {
    this.activeFlashes.forEach(flash => {
        this.scene.remove(flash);
        // Dispose if needed
    });
    this.activeFlashes = [];
}
    
    console.log("All explosion effects cleared");
}

    // --- Private Helper Methods ---

    _initParticleSystem() {
        const MAX_PARTICLES = 30000; // Hard cap for buffer allocation
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
        geometry.setAttribute('particleSize', new THREE.Float32BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
        geometry.setAttribute('particleOpacity', new THREE.Float32BufferAttribute(new Float32Array(MAX_PARTICLES), 1));

        const texture = this._createParticleTexture();
        const material = new THREE.PointsMaterial({
            map: texture, size: 1.0, blending: THREE.AdditiveBlending,
            depthWrite: false, transparent: true, vertexColors: true
        });

        material.onBeforeCompile = shader => {
            shader.vertexShader = 'attribute float particleSize;\n' + 'attribute float particleOpacity;\n' + 'varying float vOpacity;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOpacity = particleOpacity;');
            shader.vertexShader = shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * particleSize;');
            shader.fragmentShader = 'varying float vOpacity;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('vec4 outgoingLight = vec4( 0.0, 0.0, 0.0, 1.0 );', 'vec4 outgoingLight = vec4( 0.0, 0.0, 0.0, vOpacity );');
        };

        this.particleSystem = new THREE.Points(geometry, material);
        // IMPORTANT: Add flags to prevent your editor systems from processing this
        this.particleSystem.userData.ignoreInTimeline = true;
        this.particleSystem.userData.isHelper = true; // Use whatever flag works best for your setup
        this.particleSystem.frustumCulled = false;
        this.scene.add(this.particleSystem);

        this.particlePool = [];
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.particlePool.push(new ExplosionParticle(i, this));
        }
    }
    
    _createDebris(origin, count) {
        const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
        for (let i = 0; i < count; i++) {
            const size = Math.random() * 0.5 + 0.1;
            const debris = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), debrisMaterial);
            debris.position.copy(origin);
            debris.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * this.params.fireSpeed * 0.5,
                Math.random() * this.params.fireSpeed * 0.7,
                (Math.random() - 0.5) * this.params.fireSpeed * 0.5
            );
            debris.angularVelocity = new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
            debris.life = 3 + Math.random() * 2;
            this.debrisGroup.add(debris);
        }
    }
    
    /*_createFlash(origin) {
        const flash = new THREE.PointLight(0xfff0e1, 1000, 100, 1);
        flash.position.copy(origin);
        // IMPORTANT: Add a flag
        flash.userData.ignoreInTimeline = true;
        this.scene.add(flash);
        const animateFlash = () => {
            flash.intensity *= 0.85;
            if (flash.intensity > 1) {
                requestAnimationFrame(animateFlash);
            } else {
                this.scene.remove(flash);
            }
        };
        animateFlash();
    }*/

        _createFlash(origin) {
    const flash = new THREE.PointLight(0xfff0e1, 1000, 100, 1);
    flash.position.copy(origin);
    flash.userData.ignoreInTimeline = true;
    flash.userData.isExplosionFlash = true; // Add marker
    this.scene.add(flash);
    
    // Store reference
    if (!this.activeFlashes) this.activeFlashes = [];
    this.activeFlashes.push(flash);
    
    const animateFlash = () => {
        flash.intensity *= 0.85;
        if (flash.intensity > 1) {
            requestAnimationFrame(animateFlash);
        } else {
            this.scene.remove(flash);
            // Remove from active flashes array
            this.activeFlashes = this.activeFlashes.filter(f => f !== flash);
        }
    };
    animateFlash();
}
    
    _createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(canvas);
    }
    
    // All UI logic is self-contained
    _setupEventListeners() {
        const bind = (id, param, isFloat = true, scale = 1, callback) => {
            const el = document.getElementById(id);
            if (!el) return;
            const valEl = document.getElementById(id + '-value');
            el.addEventListener('input', e => {
                this.params[param] = isFloat ? parseFloat(e.target.value) * scale : parseInt(e.target.value) * scale;
                if (valEl) valEl.textContent = parseFloat(e.target.value).toFixed(param === 'airResistance' ? 3 : param === 'gravity' ? 1 : 2);
                if (callback) callback();
            });
        };

        /*document.getElementById('explosion-btn').addEventListener('click', () => {
            this.triggerExplosion((Math.random() - 0.5) * 30, Math.random() * 10 + 2, (Math.random() - 0.5) * 30);
        });*/

        // In _setupEventListeners()
        document.getElementById('explosion-btn').addEventListener('click', () => {
            this.triggerExplosion(
               (Math.random() - 0.5) * 30, 
               Math.random() * 10 + 2, 
               (Math.random() - 0.5) * 30
            );
        });
        
        // --- ADD THIS EVENT LISTENER ---
        const clearBtn = document.getElementById('clear-explosion-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clear();
            });
        }

        // Bind all parameters
        Object.keys(this.params).forEach(key => {
            const elId = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            let scale = 1;
            if (key === 'smokeAmount' || key === 'debrisAmount') scale = 0.01;
            let isFloat = !Number.isInteger(this.params[key]) || key.includes('Amount');
            bind(elId, key, isFloat, scale);
        });
        
        const colorCallback = this._updateColorPreviews.bind(this);
        bind('core-color', 'fireCoreHue', false, 1, colorCallback);
        bind('edge-color', 'fireEdgeHue', false, 1, colorCallback);
        bind('smoke-hue', 'smokeHue', false, 1, colorCallback);
        
        document.getElementById('preset-default').addEventListener('click', () => this._setPreset('default'));
        document.getElementById('preset-fireball').addEventListener('click', () => this._setPreset('fireball'));
        document.getElementById('preset-nuclear').addEventListener('click', () => this._setPreset('nuclear'));
        document.getElementById('preset-dust').addEventListener('click', () => this._setPreset('dust'));
    }

    _updateAllUI() {
        for (const key in this.params) {
            const el = document.getElementById(key.replace(/([A-Z])/g, '-$1').toLowerCase());
            if (el) {
                let val = this.params[key];
                if (key === 'smokeAmount' || key === 'debrisAmount') val *= 100;
                el.value = val;
                el.dispatchEvent(new Event('input'));
            }
        }
        this._updateColorPreviews();
    }

    _updateColorPreviews() {
        const corePreview = document.getElementById('core-color-preview');
        const edgePreview = document.getElementById('edge-color-preview');
        const smokePreview = document.getElementById('smoke-hue-preview');
        if (corePreview) corePreview.style.backgroundColor = `hsl(${this.params.fireCoreHue}, 100%, 50%)`;
        if (edgePreview) edgePreview.style.backgroundColor = `hsl(${this.params.fireEdgeHue}, 100%, 50%)`;
        if (smokePreview) {
            const smokeLightness = (1 - this.params.smokeDarkness) * 70;
            smokePreview.style.backgroundColor = `hsl(${this.params.smokeHue}, 20%, ${smokeLightness}%)`;
        }
    }
    
    _setPreset(name) {
        const presets = {
            default: { maxParticles: 5000, explosionPower: 1.0, fireballSize: 1.0, baseTemperature: 5500, tempVariation: 1000, fireCoreHue: 16, fireEdgeHue: 60, fireSpeed: 15.0, fireSpeedVariation: 0.5, fireTurbulence: 0.5, fireLifetime: 1.0, smokeAmount: 0.5, smokeDarkness: 0.3, smokeHue: 0, smokeOpacity: 0.5, smokeRiseSpeed: 1.0, smokeExpandRate: 2.0, smokeSwirlAmount: 0.5, smokeLifetime: 3.0, gravity: 9.8, airResistance: 0.02, shockwave: 0.5, debrisAmount: 0, emberGlow: 0.5, timeScale: 1.0 },
            fireball: { maxParticles: 8000, explosionPower: 1.5, fireballSize: 1.2, baseTemperature: 6500, tempVariation: 1500, fireCoreHue: 15, fireEdgeHue: 60, fireSpeed: 20.0, fireSpeedVariation: 0.6, fireTurbulence: 0.7, fireLifetime: 1.2, smokeAmount: 0.3, smokeDarkness: 0.3, smokeHue: 0, smokeOpacity: 0.4, smokeRiseSpeed: 1.2, smokeExpandRate: 2.5, smokeSwirlAmount: 0.6, smokeLifetime: 2.5, gravity: 9.8, airResistance: 0.03, shockwave: 0.7, debrisAmount: 5, emberGlow: 0.6, timeScale: 1.0 },
            nuclear: { maxParticles: 15000, explosionPower: 2.5, fireballSize: 1.8, baseTemperature: 10000, tempVariation: 3000, fireCoreHue: 10, fireEdgeHue: 50, fireSpeed: 25.0, fireSpeedVariation: 0.8, fireTurbulence: 1.2, fireLifetime: 1.5, smokeAmount: 0.7, smokeDarkness: 0.4, smokeHue: 0, smokeOpacity: 0.5, smokeRiseSpeed: 1.5, smokeExpandRate: 3.0, smokeSwirlAmount: 0.8, smokeLifetime: 5.0, gravity: 5.0, airResistance: 0.05, shockwave: 1.0, debrisAmount: 10, emberGlow: 0.8, timeScale: 0.8 },
            dust: { maxParticles: 6000, explosionPower: 0.8, fireballSize: 0.7, baseTemperature: 4000, tempVariation: 800, fireCoreHue: 25, fireEdgeHue: 45, fireSpeed: 10.0, fireSpeedVariation: 0.3, fireTurbulence: 0.3, fireLifetime: 0.8, smokeAmount: 0.8, smokeDarkness: 0.5, smokeHue: 30, smokeOpacity: 0.6, smokeRiseSpeed: 0.8, smokeExpandRate: 1.8, smokeSwirlAmount: 0.4, smokeLifetime: 4.0, gravity: 12.0, airResistance: 0.04, shockwave: 0.3, debrisAmount: 20, emberGlow: 0.3, timeScale: 1.2 }
        };
        Object.assign(this.params, presets[name]);
        this._updateAllUI();
        this.triggerExplosion(0, 5, 0);
    }
}

// This is the individual particle class, kept separate for clarity.
// It needs a reference to its manager to access clock and params.
class ExplosionParticle {
    constructor(index, manager) {
        this.index = index;
        this.manager = manager; // Reference to the manager
        this.isActive = false;
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.color = new THREE.Color();
        this.startColor = new THREE.Color();
        this.endColor = new THREE.Color();
    }

    spawn(origin, isSmoke) {
        const params = this.manager.params;
        this.isActive = true;
        this.isSmoke = isSmoke;
        this.position.copy(origin);
        this.life = 1.0;

        if (isSmoke) {
            const speed = params.fireSpeed * 0.3 * (Math.random() * 0.5 + 0.75);
            this.velocity.set((Math.random() - 0.5) * speed * 0.5, Math.random() * params.smokeRiseSpeed * 3 + 1, (Math.random() - 0.5) * speed * 0.5);
            this.maxLife = params.smokeLifetime * (Math.random() * 0.4 + 0.8);
            this.decay = 1 / this.maxLife;
            this.size = (Math.random() * 4 + 2) * params.fireballSize;
            this.opacity = params.smokeOpacity * (Math.random() * 0.5 + 0.5);
            this.swirlOffset = Math.random() * Math.PI * 2;
            const hue = params.smokeHue / 360 + (Math.random() - 0.5) * 0.02;
            this.startColor.setHSL(hue, Math.random() * 0.1, params.smokeDarkness * (Math.random() * 0.4 + 0.8));
            this.endColor.copy(this.startColor).multiplyScalar(0.5);
        } else {
            const spherical = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(2 * Math.random() - 1), Math.random() * Math.PI * 2);
            const speed = params.fireSpeed * (1 + (Math.random() - 0.5) * params.fireSpeedVariation) * params.explosionPower;
            this.velocity.copy(spherical).multiplyScalar(speed * (1 + Math.random() * params.shockwave));
            this.maxLife = params.fireLifetime * (Math.random() * 0.4 + 0.8);
            this.decay = 1 / this.maxLife;
            this.size = (Math.random() * 2.5 + 1.0) * params.fireballSize;
            this.opacity = 1.0;
            const temp = params.baseTemperature + (Math.random() - 0.5) * params.tempVariation;
            const lifeFactor = Math.random();
            const hueMix = params.fireCoreHue/360 + (params.fireEdgeHue/360 - params.fireCoreHue/360) * lifeFactor;
            const tempColor = this._temperatureToColor(temp);
            const hueColor = new THREE.Color().setHSL(hueMix, 1.0, 0.5);
            this.startColor.lerpColors(tempColor, hueColor, 0.7);
            this.endColor.set(0, 0, 0);
            if (Math.random() < params.emberGlow) this.endColor.set(0.8, 0.3, 0);
        }
    }

    update(dt) {
        if (!this.isActive) return;
        const params = this.manager.params;

        this.life -= this.decay * dt;
        if (this.life <= 0) { this.isActive = false; return; }

        if (this.isSmoke) {
            this.velocity.x += Math.cos(this.swirlOffset + this.manager.clock.elapsedTime * 2) * params.smokeSwirlAmount * dt;
            this.velocity.z += Math.sin(this.swirlOffset + this.manager.clock.elapsedTime * 2) * params.smokeSwirlAmount * dt;
        } else {
            this.velocity.x += (Math.random() - 0.5) * params.fireTurbulence * dt;
            this.velocity.y += (Math.random() - 0.5) * params.fireTurbulence * dt;
        }
        this.velocity.y -= params.gravity * dt;
        this.velocity.multiplyScalar(1.0 - params.airResistance * dt);
        this.position.addScaledVector(this.velocity, dt);

        if (this.position.y < 0) {
            this.position.y = 0; this.velocity.y *= -0.3; this.velocity.x *= 0.8;
        }

        const lifeT = 1.0 - this.life;
        this.color.lerpColors(this.startColor, this.endColor, lifeT * lifeT);
        let currentSize = this.size;
        let currentOpacity = this.opacity;
        if (this.isSmoke) {
            currentSize *= (1 + lifeT * (params.smokeExpandRate - 1));
            currentOpacity *= (1 - lifeT);
        } else {
            currentOpacity = Math.sin(this.life * Math.PI);
        }

        this.manager.particleSystem.geometry.attributes.position.setXYZ(this.index, this.position.x, this.position.y, this.position.z);
        this.manager.particleSystem.geometry.attributes.color.setXYZ(this.index, this.color.r, this.color.g, this.color.b);
        this.manager.particleSystem.geometry.attributes.particleSize.setX(this.index, currentSize);
        this.manager.particleSystem.geometry.attributes.particleOpacity.setX(this.index, currentOpacity);
    }
    
    _temperatureToColor(temp) {
        temp /= 100; let r, g, b;
        if (temp <= 66) { r = 255; g = 99.47 * Math.log(temp) - 161.11; } else { r = 329.7 * Math.pow(temp - 60, -0.133); }
        if (temp <= 66) { if (temp <= 19) { b = 0; } else { b = 138.52 * Math.log(temp - 10) - 305.04; } } else { b = 255; }
        if (temp >= 66) { g = 288.12 * Math.pow(temp - 60, -0.0755); }
        return new THREE.Color(Math.max(0, Math.min(255, r)) / 255, Math.max(0, Math.min(255, g)) / 255, Math.max(0, Math.min(255, b)) / 255);
    }
}



window.switchExplosionTab = (tabName, event) => {
    const uiContainer = document.getElementById('explosion-ui');
    uiContainer.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
    uiContainer.querySelectorAll('.tab-button').forEach(b => b.style.background = '#333');
    uiContainer.querySelector(`#${tabName}-tab`).style.display = 'block';
    if (event) event.target.style.background = '#ff6b35';
}