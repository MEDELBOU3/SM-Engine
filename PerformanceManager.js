// PerformanceManager.js (Classic, Non-Module Version)

/**
 * PerformanceManager Class.
 * By defining this class in a file loaded via <script> tag,
 * it automatically becomes available on the global `window` object.
 * So you can use `new PerformanceManager(...)` in your main script.
 */
class PerformanceManager {
    constructor(scene, camera, renderer, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        this.options = {
            targetFPS: 58,
            minResolutionScale: 0.7,
            maxResolutionScale: 1.0,
            occlusionCheckInterval: 200, // ms
            ...options
        };

        // --- Occlusion Culling ---
        this.raycaster = new THREE.Raycaster();
        this.cullableObjects = [];
        this.occluderObjects = [];
        this.lastOcclusionCheck = 0;

        // --- Dynamic Resolution ---
        this.frameTimes = [];
        this.currentFPSSample = 60;
        this.basePixelRatio = window.devicePixelRatio;
        this.currentResolutionScale = this.options.maxResolutionScale;

        console.log("✅ PerformanceManager Initialized (Classic Mode).");
    }

    /**
     * Registers an object for performance management.
     * @param {THREE.Object3D} object The object to manage.
     * @param {boolean} isOccluder Can this object hide others?
     */
    add(object, { isOccluder = false } = {}) {
        if (!object.geometry || !object.geometry.boundingBox) {
            object.geometry.computeBoundingBox();
        }
        this.cullableObjects.push(object);
        if (isOccluder) {
            this.occluderObjects.push(object);
        }
    }

    /**
     * Helper to create a Level of Detail (LOD) object.
     * @param {Array<Object>} levels - e.g., [{ geometry, distance }, ...]
     * @param {THREE.Material} material - Shared material.
     * @returns {THREE.LOD}
     */
    createLOD(levels, material) {
        const lod = new THREE.LOD();
        levels.forEach(level => {
            const mesh = new THREE.Mesh(level.geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            lod.addLevel(mesh, level.distance);
        });
        return lod;
    }

    /**
     * Main update loop to be called in animate().
     * @param {number} deltaTime - Time since last frame.
     */
    update(deltaTime) {
        const now = performance.now();
        if (now - this.lastOcclusionCheck > this.options.occlusionCheckInterval) {
            this.updateOcclusion();
            this.lastOcclusionCheck = now;
        }
        this.updateDynamicResolution(deltaTime);
    }
    
    updateOcclusion() {
        if (this.occluderObjects.length === 0 || this.cullableObjects.length === 0) return;

        const cameraPosition = this.camera.position;

        this.cullableObjects.forEach(object => {
            if (!object.visible || this.occluderObjects.includes(object)) return;

            const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
            const objectCenter = box.getCenter(new THREE.Vector3());
            const direction = objectCenter.clone().sub(cameraPosition).normalize();
            
            this.raycaster.set(cameraPosition, direction);
            const intersects = this.raycaster.intersectObjects(this.occluderObjects, false);

            if (intersects.length > 0) {
                const intersectionDistance = intersects[0].distance;
                const objectDistance = cameraPosition.distanceTo(objectCenter);
                if (intersectionDistance < objectDistance - 1) {
                    object.userData.wasVisible = object.visible;
                    object.visible = false;
                } else {
                    object.visible = true;
                }
            } else {
                 object.visible = true;
            }
        });
    }

    updateDynamicResolution(deltaTime) {
        this.frameTimes.push(deltaTime);
        if (this.frameTimes.length > 30) this.frameTimes.shift();
        
        const averageFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.currentFPSSample = 1.0 / averageFrameTime;

        let scaleChanged = false;
        if (this.currentFPSSample < this.options.targetFPS && this.currentResolutionScale > this.options.minResolutionScale) {
            this.currentResolutionScale = Math.max(this.options.minResolutionScale, this.currentResolutionScale - 0.05);
            scaleChanged = true;
        } else if (this.currentFPSSample > this.options.targetFPS + 2 && this.currentResolutionScale < this.options.maxResolutionScale) {
            this.currentResolutionScale = Math.min(this.options.maxResolutionScale, this.currentResolutionScale + 0.02);
            scaleChanged = true;
        }

        if (scaleChanged) {
            this.renderer.setPixelRatio(this.basePixelRatio * this.currentResolutionScale);
        }
    }
}


/*function setShadowQuality(quality) {
    const sizes = {
        low: 1024,
        medium: 2048, 
        high: 4096,
        ultra: 8192
    };
    
    scene.traverse((child) => {
        if (child.isLight && child.castShadow) {
            child.shadow.mapSize.width = sizes[quality];
            child.shadow.mapSize.height = sizes[quality];
            child.shadow.needsUpdate = true;
        }
    });
}

// Function to adjust lighting intensity
function setLightingIntensity(multiplier) {
    scene.traverse((child) => {
        if (child.isLight) {
            if (child.userData.originalIntensity === undefined) {
                child.userData.originalIntensity = child.intensity;
            }
            child.intensity = child.userData.originalIntensity * multiplier;
        }
    });
}

// Function to make any object cast and receive shadows properly
function enableShadowsForObject(object) {
    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Enhance material if needed
            if (child.material && child.material.isMeshBasicMaterial) {
                const newMaterial = new THREE.MeshStandardMaterial({
                    color: child.material.color,
                    map: child.material.map,
                    transparent: child.material.transparent,
                    opacity: child.material.opacity,
                    roughness: 0.7,
                    metalness: 0.0
                });
                child.material = newMaterial;
            }
        }
    });
}*/
