/*class ExplosionManager {
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
}*/

// --- ExplosionParticle Class (REQUIRED BY ExplosionManager) ---
// This class manages the state and updates of a single particle
// It directly manipulates the attributes of the main particle system's geometry.
class ExplosionParticle {
    constructor(index, manager) {
        this.index = index;
        this.manager = manager;
        this.isActive = false;

        // References to the buffer attributes for direct updates
        this.positions = manager.particleSystem.geometry.attributes.position;
        this.colors = manager.particleSystem.geometry.attributes.color;
        this.sizes = manager.particleSystem.geometry.attributes.particleSize;
        this.opacities = manager.particleSystem.geometry.attributes.particleOpacity;

        // Particle-specific properties
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.color = new THREE.Color();
        this.life = 0;
        this.initialLife = 0;
        this.isSmoke = false; // true for smoke, false for fire
    }

    spawn(origin, isSmoke = false) {
        const p = this.manager.params;

        this.position.copy(origin);
        this.isSmoke = isSmoke;
        this.isActive = true;

        // Random initial direction and speed
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * Math.PI;
        const x = Math.sin(radius) * Math.cos(angle);
        const y = Math.sin(radius) * Math.sin(angle);
        const z = Math.cos(radius);
        
        const speed = (isSmoke ? p.smokeRiseSpeed : p.fireSpeed) * p.explosionPower * (1.0 + (Math.random() - 0.5) * (isSmoke ? 0.3 : p.fireSpeedVariation));
        this.velocity.set(x, y, z).normalize().multiplyScalar(speed);

        if (isSmoke) {
            this.velocity.y += Math.random() * p.smokeRiseSpeed; // Smoke tends to rise
            this.initialLife = p.smokeLifetime * (0.8 + Math.random() * 0.4);
            this.life = this.initialLife;
            this.color.setHSL(p.smokeHue / 360, 0.2, (1.0 - p.smokeDarkness) * 0.7); // Darker smoke
            this.size = (Math.random() * 0.5 + 0.5) * p.fireballSize * 0.5; // Smoke starts smaller
        } else {
            this.initialLife = p.fireLifetime * (0.8 + Math.random() * 0.4);
            this.life = this.initialLife;

            // Fire color based on temperature
            const temp = p.baseTemperature + (Math.random() - 0.5) * p.tempVariation;
            const coreHue = p.fireCoreHue / 360;
            const edgeHue = p.fireEdgeHue / 360;
            const hue = coreHue + (edgeHue - coreHue) * Math.min(1, Math.max(0, (temp - 4000) / 4000)); // Blend hue
            this.color.setHSL(hue, 1.0, 0.5); // Saturated fire colors
            this.size = (Math.random() * 0.8 + 0.2) * p.fireballSize; // Fire starts larger
        }

        // Initialize attributes in the buffer geometry
        this.positions.setXYZ(this.index, this.position.x, this.position.y, this.position.z);
        this.colors.setXYZ(this.index, this.color.r, this.color.g, this.color.b);
        this.sizes.setX(this.index, this.size);
        this.opacities.setX(this.index, 1.0); // Start fully opaque
    }

    update(deltaTime) {
        if (!this.isActive) return;

        this.life -= deltaTime;
        const p = this.manager.params;

        if (this.life <= 0) {
            this.isActive = false;
            this.positions.setXYZ(this.index, 0, 0, 0); // Hide particle by moving it to origin
            this.opacities.setX(this.index, 0); // Make it fully transparent
            return;
        }

        const lifeRatio = this.life / this.initialLife;

        // Apply physics
        if (this.isSmoke) {
            this.velocity.y += (p.smokeRiseSpeed - p.gravity) * deltaTime; // Smoke rises more, affected by gravity
        } else {
            this.velocity.y -= p.gravity * deltaTime;
        }
        
        // Apply air resistance (friction)
        this.velocity.multiplyScalar(1 - p.airResistance * deltaTime);

        this.position.addScaledVector(this.velocity, deltaTime);

        // Update attributes in the buffer geometry
        this.positions.setXYZ(this.index, this.position.x, this.position.y, this.position.z);

        // Update color, size, and opacity over lifetime
        if (this.isSmoke) {
            // Smoke expands and fades, potentially swirling
            const currentSize = this.size * (1 + (1 - lifeRatio) * p.smokeExpandRate);
            this.sizes.setX(this.index, currentSize);
            this.opacities.setX(this.index, Math.max(0, lifeRatio * p.smokeOpacity));
            
            // Add some swirling/turbulence
            this.velocity.x += (Math.sin(this.life * 5) * 0.1 - this.velocity.x * 0.1) * p.smokeSwirlAmount * deltaTime;
            this.velocity.z += (Math.cos(this.life * 5) * 0.1 - this.velocity.z * 0.1) * p.smokeSwirlAmount * deltaTime;

        } else {
            // Fire fades, shrinks/expands
            const currentSize = this.size * (lifeRatio * 0.5 + 0.5); // Shrink slightly
            this.sizes.setX(this.index, currentSize);
            this.opacities.setX(this.index, Math.max(0, lifeRatio * (0.5 + p.emberGlow * 0.5))); // Ember glow keeps some opacity
            
            // Fire color shift
            const coreHue = p.fireCoreHue / 360;
            const edgeHue = p.fireEdgeHue / 360;
            const hue = THREE.MathUtils.lerp(edgeHue, coreHue, lifeRatio); // Shift from edge to core color
            this.color.setHSL(hue, 1.0, lifeRatio * 0.5 + 0.2); // Fade to darker
            this.colors.setXYZ(this.index, this.color.r, this.color.g, this.color.b);
            
            // Add turbulence to fire
            this.velocity.x += (Math.random() - 0.5) * p.fireTurbulence * deltaTime;
            this.velocity.z += (Math.random() - 0.5) * p.fireTurbulence * deltaTime;
        }
    }
}

// --- ExplosionManager Class ---
class ExplosionManager {
    constructor(scene, camera, clock) {
        this.scene = scene;
        this.camera = camera;
        this.clock = clock;

        this.particleSystem = null;
        this.particlePool = [];
        this.activeParticles = 0;
        this.debrisGroup = null;
        this.activeFlashes = []; // To manage point light flashes

        // Camera shake state
        this.shakeIntensity = 0;
        this.SHAKE_DECAY = 5.0; // How fast shake intensity reduces
        this.originalCameraPos = new THREE.Vector3(); // Stores camera's position BEFORE a shake impulse
        this.currentShakeOffset = new THREE.Vector3(); // Stores the current shake offset applied
        // Flag to prevent continuous saving if OrbitControls updates
        this._isCameraShaking = false; 

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
        // We save the camera's initial position here, but it might be overridden
        // by controls later. The `update` loop will manage dynamic saving.
        this.originalCameraPos.copy(this.camera.position); 

        this._initParticleSystem();
        this.debrisGroup = new THREE.Group();
        this.debrisGroup.name = "Explosion Debris Group";
        // IMPORTANT: Add a flag to prevent your editor systems from processing this
        this.debrisGroup.userData.ignoreInTimeline = true;
        this.debrisGroup.userData.isHelper = true; // Another common flag for editor ignore
        this.scene.add(this.debrisGroup);

        // Setup the UI event listeners
        this._setupEventListeners();
        this._updateAllUI(); // Populate UI with initial parameter values
    }

    // The main update loop, called from your editor's animate() function
    update(deltaTime) {
        const scaledDelta = deltaTime * this.params.timeScale;
        if (scaledDelta <= 0) return;

        // --- Update Particles ---
        let currentActiveCount = 0;
        for (let i = 0; i < this.particlePool.length; i++) { // Use pool length, not maxParticles
            const p = this.particlePool[i];
            if (p && p.isActive) {
                p.update(scaledDelta);
                currentActiveCount++;
            }
        }
        this.activeParticles = currentActiveCount;

        // Only update geometry attributes if there are active particles, to save CPU/GPU
        if (this.activeParticles > 0) {
            this.particleSystem.geometry.attributes.position.needsUpdate = true;
            this.particleSystem.geometry.attributes.color.needsUpdate = true;
            this.particleSystem.geometry.attributes.particleSize.needsUpdate = true;
            this.particleSystem.geometry.attributes.particleOpacity.needsUpdate = true;
        }

        // --- Update Debris ---
        for (let i = this.debrisGroup.children.length - 1; i >= 0; i--) {
            const debris = this.debrisGroup.children[i];
            if (!debris.isMesh) continue; // Skip non-mesh children if any

            debris.life -= scaledDelta;
            if (debris.life <= 0) {
                // Properly dispose and remove debris when its life ends
                this.debrisGroup.remove(debris);
                if (debris.geometry) debris.geometry.dispose();
                if (debris.material) debris.material.dispose();
                continue; // Move to next item after removing
            }

            debris.velocity.y -= this.params.gravity * scaledDelta;
            // Apply air resistance
            debris.velocity.multiplyScalar(1 - this.params.airResistance * scaledDelta);

            debris.position.addScaledVector(debris.velocity, scaledDelta);
            debris.rotation.x += debris.angularVelocity.x * scaledDelta;
            debris.rotation.y += debris.angularVelocity.y * scaledDelta;
            debris.rotation.z += debris.angularVelocity.z * scaledDelta; // Added Z rotation
            
            // Hide/remove debris if it falls below ground (e.g., y < 0)
            // Or if it moves too far from origin to save performance
        }

        // --- Update Camera Shake ---
        if (this.shakeIntensity > 0.01) {
            if (!this._isCameraShaking) {
                // Save current camera position when shake starts
                this.originalCameraPos.copy(this.camera.position);
                this._isCameraShaking = true;
            }

            // Reduce previous shake offset
            this.camera.position.sub(this.currentShakeOffset);

            const shakeOffset = new THREE.Vector3(
                (Math.random() - 0.5) * this.shakeIntensity * 0.2,
                (Math.random() - 0.5) * this.shakeIntensity * 0.2,
                (Math.random() - 0.5) * this.shakeIntensity * 0.2
            );
            this.camera.position.add(shakeOffset);
            this.currentShakeOffset.copy(shakeOffset); // Store current offset

            this.shakeIntensity -= this.SHAKE_DECAY * scaledDelta;
        } else if (this._isCameraShaking) {
            // Shake has ended, restore camera to original position before shake
            this.camera.position.sub(this.currentShakeOffset); // Remove last offset
            // NOTE: If OrbitControls are active, they will overwrite this immediately.
            // A more robust solution involves applying shake as an *offset* to OrbitControls' target.
            // For simple direct camera control, this restoration is needed.
            this._isCameraShaking = false;
            this.currentShakeOffset.set(0,0,0);
        }

        // --- Update Stats UI ---
        const statsEl = document.getElementById('particle-count-display');
        if (statsEl) statsEl.textContent = this.activeParticles;
    }

    // Triggers a new explosion
    triggerExplosion(x = 0, y = 5, z = 0) {
        // Reset active particles to prepare for new spawns
        // We reuse particles from the pool, so no need to iterate and set isActive = false
        // The spawn logic will simply overwrite inactive particles or re-activate them.
        this.activeParticles = 0; 
        
        // Clear existing debris immediately for the new explosion
        this._clearDebris();

        const origin = new THREE.Vector3(x, y, z);
        this._createFlash(origin);
        this.shakeIntensity = this.params.explosionPower * 5.0; // Apply camera shake

        let particleSpawnIndex = 0; // Index for current particle to spawn in the pool

        const spawnParticle = (isSmoke) => {
            // Find the next available (inactive) particle, or overwrite an old one
            // We ensure we don't exceed the allocated buffer size (this.particlePool.length)
            if (particleSpawnIndex >= this.particlePool.length) return; 

            // If we've already exceeded the maxParticles for *this explosion*, stop spawning
            // This allows the buffer to be larger than the number of particles for any single explosion
            if (this.activeParticles >= this.params.maxParticles) return;

            const particle = this.particlePool[particleSpawnIndex];
            particle.spawn(origin, isSmoke);
            this.activeParticles++; // Increment count of *currently active* particles
            particleSpawnIndex++;
        };

        // Calculate distribution of fire, smoke, and debris
        const totalParticlesToSpawn = Math.min(this.params.maxParticles, this.particlePool.length); // Don't exceed buffer size
        const debrisRatio = this.params.debrisAmount / 100; // Assuming debrisAmount is a percentage (0-100)
        const effectiveParticleCount = totalParticlesToSpawn * (1 - debrisRatio);

        const smokeRatio = this.params.smokeAmount; // smokeAmount is 0-1
        const fireRatio = 1 - smokeRatio;

        const fireCount = Math.floor(effectiveParticleCount * fireRatio);
        const smokeCount = Math.floor(effectiveParticleCount * smokeRatio);
        const debrisCount = Math.floor(totalParticlesToSpawn * debrisRatio);

        // Spawn fire particles
        for (let i = 0; i < fireCount; i++) {
            spawnParticle(false);
        }

        // Spawn smoke particles
        for (let i = 0; i < smokeCount; i++) {
            spawnParticle(true);
        }

        this._createDebris(origin, debrisCount);

        console.log(`Explosion triggered at [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]`);
        console.log(`Spawned ${fireCount} fire, ${smokeCount} smoke, ${debrisCount} debris pieces.`);
    }

    // Clears all active explosion effects (particles, debris, flashes, camera shake)
    clear() {
        // 1. Clear all particles
        if (this.particleSystem && this.particleSystem.geometry) {
            const positions = this.particleSystem.geometry.attributes.position;
            const sizes = this.particleSystem.geometry.attributes.particleSize;
            const opacities = this.particleSystem.geometry.attributes.particleOpacity;

            // Deactivate all particles in the pool and reset their buffer attributes
            for (let i = 0; i < this.particlePool.length; i++) {
                this.particlePool[i].isActive = false;
                positions.setXYZ(i, 0, 0, 0);
                sizes.setX(i, 0);
                opacities.setX(i, 0);
            }

            // Mark attributes for update
            positions.needsUpdate = true;
            sizes.needsUpdate = true;
            opacities.needsUpdate = true;
        }

        // 2. Clear all debris (reusing _clearDebris)
        this._clearDebris();

        // 3. Clear all active flashes
        while (this.activeFlashes.length > 0) {
            const flash = this.activeFlashes.pop(); // Remove from end for efficiency
            this.scene.remove(flash);
            // No need to dispose PointLight, it's a lightweight object
        }

        // 4. Reset camera shake and restore position
        if (this._isCameraShaking || this.shakeIntensity > 0.01) {
            this.camera.position.sub(this.currentShakeOffset); // Remove any residual shake
            this.currentShakeOffset.set(0,0,0);
        }
        this.shakeIntensity = 0;
        this._isCameraShaking = false;
        // Optionally, if you want to explicitly reset to a known original position
        // this.camera.position.copy(this.originalCameraPos); 
        // Be careful with this if OrbitControls are active, they will fight it.

        // 5. Reset active particles counter
        this.activeParticles = 0;
        console.log("All explosion effects cleared");
    }

    // --- Private Helper Methods ---

    // Initializes the main Points particle system
    _initParticleSystem() {
        // Allocate buffer for max possible particles based on current params.maxParticles
        const MAX_BUFFER_PARTICLES = this.params.maxParticles * 2; // Allow some headroom or dynamic resizing if needed

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_BUFFER_PARTICLES * 3), 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAX_BUFFER_PARTICLES * 3), 3));
        geometry.setAttribute('particleSize', new THREE.Float32BufferAttribute(new Float32Array(MAX_BUFFER_PARTICLES), 1));
        geometry.setAttribute('particleOpacity', new THREE.Float32BufferAttribute(new Float32Array(MAX_BUFFER_PARTICLES), 1));

        const texture = this._createParticleTexture();
        const material = new THREE.PointsMaterial({
            map: texture, 
            size: 1.0, // Base size, will be scaled by particleSize attribute
            blending: THREE.AdditiveBlending, // Default blending for fire effects
            depthWrite: false, // Prevents depth issues with transparent particles
            transparent: true, 
            vertexColors: true, // Use colors from geometry attributes
            opacity: 1.0, // Overall material opacity (individual particle opacity is handled by attribute)
        });

        // Custom shader modifications to use our attributes
        material.onBeforeCompile = shader => {
            shader.vertexShader = `
                attribute float particleSize;
                attribute float particleOpacity;
                varying float vOpacity;
                ${shader.vertexShader}
            `;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vOpacity = particleOpacity; // Pass particleOpacity to fragment shader
                `
            );
            // Scale gl_PointSize by our custom particleSize attribute
            shader.vertexShader = shader.vertexShader.replace(
                'gl_PointSize = size;', 
                'gl_PointSize = size * particleSize;'
            );

            shader.fragmentShader = `
                varying float vOpacity; // Receive particleOpacity from vertex shader
                ${shader.fragmentShader}
            `;
            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 outgoingLight = vec4( 0.0, 0.0, 0.0, 1.0 );',
                `
                // Combine texture, vertex color, and particleOpacity
                vec4 textureColor = texture2D( map, vUv );
                outgoingLight = vec4( diffuseColor.rgb * textureColor.rgb, diffuseColor.a * textureColor.a * vOpacity );
                `
            );
        };

        this.particleSystem = new THREE.Points(geometry, material);
        this.particleSystem.name = "Explosion Particle System";
        // IMPORTANT: Add flags for editor systems to ignore
        this.particleSystem.userData.ignoreInTimeline = true;
        this.particleSystem.userData.isHelper = true;
        this.particleSystem.frustumCulled = false; // Always render if visible, or manage based on scene bbox
        this.scene.add(this.particleSystem);

        // Populate the particle pool
        this.particlePool = [];
        for (let i = 0; i < MAX_BUFFER_PARTICLES; i++) {
            this.particlePool.push(new ExplosionParticle(i, this));
        }

        console.log(`Particle system initialized with a pool of ${MAX_BUFFER_PARTICLES} particles.`);
    }
    
    // Creates small debris pieces
    _createDebris(origin, count) {
        if (count === 0) return;

        const debrisMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x444444, 
            roughness: 0.8, 
            metalness: 0.1 
        });

        for (let i = 0; i < count; i++) {
            const size = Math.random() * 0.5 + 0.1;
            const debris = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), debrisMaterial);
            debris.position.copy(origin);
            debris.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * this.params.fireSpeed * 0.5,
                Math.random() * this.params.fireSpeed * 0.7,
                (Math.random() - 0.5) * this.params.fireSpeed * 0.5
            );
            debris.angularVelocity = new THREE.Vector3(
                (Math.random() - 0.5) * 5, 
                (Math.random() - 0.5) * 5, 
                (Math.random() - 0.5) * 5
            );
            debris.life = 3 + Math.random() * 2; // Debris lasts longer
            debris.name = `Debris_${i}`;
            debris.userData.ignoreInTimeline = true; // Mark to be ignored by timeline
            this.debrisGroup.add(debris);
        }
    }
    
    // Creates a temporary light flash at the explosion origin
    _createFlash(origin) {
        const flash = new THREE.PointLight(0xfff0e1, 1000, 100, 1); // Color, intensity, distance, decay
        flash.position.copy(origin);
        flash.userData.ignoreInTimeline = true;
        flash.userData.isExplosionFlash = true; // Custom flag
        this.scene.add(flash);
        
        // Store reference to manage its removal
        this.activeFlashes.push(flash);
        
        const animateFlash = () => {
            if (!flash.parent) return; // Flash might have been removed by clear()

            flash.intensity *= 0.85; // Quickly fade out
            flash.distance *= 1.02;  // Expand slightly

            if (flash.intensity > 1) { // Continue animating as long as it's bright enough
                requestAnimationFrame(animateFlash);
            } else {
                this.scene.remove(flash);
                // Remove from active flashes array
                this.activeFlashes = this.activeFlashes.filter(f => f !== flash);
            }
        };
        animateFlash();
    }
    
    // Creates a simple radial gradient texture for particles
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
    
    // Helper to clear all debris without affecting other parts of the scene
    _clearDebris() {
        // Clear all debris by iterating backwards (safe for removal)
        for (let i = this.debrisGroup.children.length - 1; i >= 0; i--) {
            const debris = this.debrisGroup.children[i];
            this.debrisGroup.remove(debris);
            if (debris.geometry) debris.geometry.dispose();
            if (debris.material) debris.material.dispose();
        }
    }

    // All UI logic is self-contained
    _setupEventListeners() {
        const bind = (id, param, isFloat = true, scale = 1, callback) => {
            const el = document.getElementById(id);
            if (!el) return; // Return if UI element not found

            const valEl = document.getElementById(id + '-value');
            el.addEventListener('input', e => {
                let value;
                if (isFloat) {
                    value = parseFloat(e.target.value) * scale;
                } else {
                    value = parseInt(e.target.value) * scale;
                }
                this.params[param] = value;
                if (valEl) {
                    // Adjust precision based on parameter
                    let displayValue = parseFloat(e.target.value);
                    if (param === 'airResistance' || param === 'timeScale') valEl.textContent = displayValue.toFixed(3);
                    else if (param === 'gravity' || param === 'explosionPower' || param === 'fireballSize') valEl.textContent = displayValue.toFixed(1);
                    else if (param.includes('Hue')) valEl.textContent = displayValue.toFixed(0);
                    else if (param.includes('Amount')) valEl.textContent = displayValue.toFixed(0);
                    else valEl.textContent = displayValue.toFixed(2);
                }
                if (callback) callback();
            });
        };

        // Bind the main trigger button
        const explosionBtn = document.getElementById('explosion-btn');
        if (explosionBtn) {
            explosionBtn.addEventListener('click', () => {
                this.triggerExplosion(
                   (Math.random() - 0.5) * 30, // Random X
                   Math.random() * 10 + 2,     // Random Y (above ground)
                   (Math.random() - 0.5) * 30  // Random Z
                );
            });
        }
        
        // Bind the clear button
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
            // Special handling for percentage sliders
            if (key === 'smokeAmount' || key === 'debrisAmount') scale = 0.01; 
            // Check if parameter is inherently integer or float
            const isFloat = (this.params[key] % 1 !== 0) || key.includes('Amount') || key.includes('Speed') || key.includes('Resistance') || key.includes('Turbulence') || key.includes('Lifetime');
            bind(elId, key, isFloat, scale);
        });
        
        // Bind color parameters with a special callback for color previews
        const colorCallback = this._updateColorPreviews.bind(this);
        bind('fire-core-hue', 'fireCoreHue', false, 1, colorCallback);
        bind('fire-edge-hue', 'fireEdgeHue', false, 1, colorCallback);
        bind('smoke-hue', 'smokeHue', false, 1, colorCallback);
        bind('smoke-darkness', 'smokeDarkness', true, 1, colorCallback); // Darkness affects smoke color preview

        // Bind preset buttons
        document.getElementById('preset-default')?.addEventListener('click', () => this._setPreset('default'));
        document.getElementById('preset-fireball')?.addEventListener('click', () => this._setPreset('fireball'));
        document.getElementById('preset-nuclear')?.addEventListener('click', () => this._setPreset('nuclear'));
        document.getElementById('preset-dust')?.addEventListener('click', () => this._setPreset('dust'));
    }

    // Updates all UI elements to reflect current parameter values
    _updateAllUI() {
        for (const key in this.params) {
            const el = document.getElementById(key.replace(/([A-Z])/g, '-$1').toLowerCase());
            if (el) {
                let val = this.params[key];
                // Convert back to percentage for UI sliders
                if (key === 'smokeAmount' || key === 'debrisAmount') val *= 100;
                el.value = val;
                el.dispatchEvent(new Event('input')); // Trigger input event to update value displays and callbacks
            }
        }
        this._updateColorPreviews();
    }

    // Updates the visual color previews in the UI
    _updateColorPreviews() {
        const corePreview = document.getElementById('fire-core-hue-preview');
        const edgePreview = document.getElementById('fire-edge-hue-preview');
        const smokePreview = document.getElementById('smoke-hue-preview');

        // Fire colors (fully saturated, varying lightness)
        if (corePreview) corePreview.style.backgroundColor = `hsl(${this.params.fireCoreHue}, 100%, 50%)`;
        if (edgePreview) edgePreview.style.backgroundColor = `hsl(${this.params.fireEdgeHue}, 100%, 50%)`;
        
        // Smoke color (desaturated, lightness based on darkness param)
        if (smokePreview) {
            const smokeLightness = (1 - this.params.smokeDarkness) * 40 + 30; // Scale from 30% to 70% lightness
            smokePreview.style.backgroundColor = `hsl(${this.params.smokeHue}, 20%, ${smokeLightness}%)`;
        }
    }
    
    // Applies a predefined set of parameters
    _setPreset(name) {
        const presets = {
            default: { maxParticles: 5000, explosionPower: 1.0, fireballSize: 1.0, baseTemperature: 5500, tempVariation: 1000, fireCoreHue: 16, fireEdgeHue: 60, fireSpeed: 15.0, fireSpeedVariation: 0.5, fireTurbulence: 0.5, fireLifetime: 1.0, smokeAmount: 0.5, smokeDarkness: 0.3, smokeHue: 0, smokeOpacity: 0.5, smokeRiseSpeed: 1.0, smokeExpandRate: 2.0, smokeSwirlAmount: 0.5, smokeLifetime: 3.0, gravity: 9.8, airResistance: 0.02, shockwave: 0.5, debrisAmount: 0, emberGlow: 0.5, timeScale: 1.0 },
            fireball: { maxParticles: 8000, explosionPower: 1.5, fireballSize: 1.2, baseTemperature: 6500, tempVariation: 1500, fireCoreHue: 15, fireEdgeHue: 60, fireSpeed: 20.0, fireSpeedVariation: 0.6, fireTurbulence: 0.7, fireLifetime: 1.2, smokeAmount: 0.3, smokeDarkness: 0.3, smokeHue: 0, smokeOpacity: 0.4, smokeRiseSpeed: 1.2, smokeExpandRate: 2.5, smokeSwirlAmount: 0.6, smokeLifetime: 2.5, gravity: 9.8, airResistance: 0.03, shockwave: 0.7, debrisAmount: 5, emberGlow: 0.6, timeScale: 1.0 },
            nuclear: { maxParticles: 15000, explosionPower: 2.5, fireballSize: 1.8, baseTemperature: 10000, tempVariation: 3000, fireCoreHue: 10, fireEdgeHue: 50, fireSpeed: 25.0, fireSpeedVariation: 0.8, fireTurbulence: 1.2, fireLifetime: 1.5, smokeAmount: 0.7, smokeDarkness: 0.4, smokeHue: 0, smokeOpacity: 0.5, smokeRiseSpeed: 1.5, smokeExpandRate: 3.0, smokeSwirlAmount: 0.8, smokeLifetime: 5.0, gravity: 5.0, airResistance: 0.05, shockwave: 1.0, debrisAmount: 10, emberGlow: 0.8, timeScale: 0.8 },
            dust: { maxParticles: 6000, explosionPower: 0.8, fireballSize: 0.7, baseTemperature: 4000, tempVariation: 800, fireCoreHue: 25, fireEdgeHue: 45, fireSpeed: 10.0, fireSpeedVariation: 0.3, fireTurbulence: 0.3, fireLifetime: 0.8, smokeAmount: 0.8, smokeDarkness: 0.5, smokeHue: 30, smokeOpacity: 0.6, smokeRiseSpeed: 0.8, smokeExpandRate: 1.8, smokeSwirlAmount: 0.4, smokeLifetime: 4.0, gravity: 12.0, airResistance: 0.04, shockwave: 0.3, debrisAmount: 20, emberGlow: 0.3, timeScale: 1.2 }
        };
        Object.assign(this.params, presets[name]);
        this._updateAllUI(); // Update UI to reflect new preset values
        // Trigger a new explosion with the preset parameters
        this.triggerExplosion(0, 5, 0); 
    }
}

window.switchExplosionTab = (tabName, event) => {
    const uiContainer = document.getElementById('explosion-ui');
    uiContainer.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
    uiContainer.querySelectorAll('.tab-button').forEach(b => b.style.background = '#333');
    uiContainer.querySelector(`#${tabName}-tab`).style.display = 'block';
    if (event) event.target.style.background = '#ff6b35';
}
