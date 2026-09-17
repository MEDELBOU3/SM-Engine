/**
 * 2D3DIntegrationManager - Advanced 2D/3D Mixing System
 * Features: Lighting from 3D scene, shadow projections, camera sync, depth-based rendering
 */

class TwoD3DIntegrationManager {
    constructor(canvas2D, scene3D, camera3D) {
        this.canvas2D = canvas2D;
        this.scene = scene3D;
        this.camera = camera3D;
        this.ctx = canvas2D.getContext('2d');
        
        // Integration settings
        this.enabled = true;
        this.syncCamera = true;
        this.projectShadows = true;
        this.syncLighting = true;
        this.depthComposite = true;
        
        // Projection settings
        this.shadowSoftness = 2;
        this.shadowOpacity = 0.4;
        this.lightProbeResolution = 32;
        
        // Cached data
        this.lightProbes = [];
        this.shadowMap = null;
        this.projectionMatrix = new THREE.Matrix4();
        
        this.init();
    }
    
    init() {
        console.log("✅ 2D/3D Integration Manager Initialized");
    }
    
    // ==================== CAMERA SYNCHRONIZATION ====================
    
    syncCameraTo2D() {
        if (!this.syncCamera || !this.camera) return;
        
        // Project camera position to 2D canvas
        const viewport = new THREE.Vector4();
        this.projectionMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        
        // Update canvas transformation based on camera
        const zoomLevel = this.camera.zoom || 1;
        const panX = this.camera.position.x * 50;
        const panY = this.camera.position.y * 50;
        
        return { zoomLevel, panX, panY };
    }
    
    // ==================== LIGHTING FROM 3D SCENE ====================
    
    extractLightsFrom3D() {
        if (!this.scene || !this.syncLighting) return [];
        
        const lights = [];
        this.scene.traverse((obj) => {
            if (obj.isLight) {
                lights.push({
                    type: obj.constructor.name,
                    position: obj.position.clone(),
                    color: obj.color,
                    intensity: obj.intensity,
                    distance: obj.distance || 0,
                    angle: obj.angle || 0,
                    penumbra: obj.penumbra || 0
                });
            }
        });
        
        return lights;
    }
    
    // Update 2D rendering based on 3D lights
    applyLightingTo2DCanvas(ctx, lights) {
        if (!ctx || !lights || lights.length === 0) return;
        
        lights.forEach(light => {
            if (light.type === 'DirectionalLight') {
                this.applyDirectionalLight(ctx, light);
            } else if (light.type === 'PointLight') {
                this.applyPointLight(ctx, light);
            } else if (light.type === 'SpotLight') {
                this.applySpotLight(ctx, light);
            }
        });
    }
    
    applyDirectionalLight(ctx, light) {
        // Create directional shadow effect
        const shadowDir = this.screen2DPosition(light.position);
        const shadowLength = 50;
        
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = Math.min(0.8, light.intensity * 0.5);
        
        const gradient = ctx.createLinearGradient(
            shadowDir.x,
            shadowDir.y,
            shadowDir.x - shadowLength,
            shadowDir.y - shadowLength
        );
        gradient.addColorStop(1, `rgba(0, 0, 0, ${light.intensity})`);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        ctx.restore();
    }
    
    applyPointLight(ctx, light) {
        const lightPos = this.screen2DPosition(light.position);
        const intensity = light.intensity || 1;
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const gradient = ctx.createRadialGradient(
            lightPos.x, lightPos.y, 0,
            lightPos.x, lightPos.y, light.distance * 50
        );
        
        const color = light.color;
        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${intensity * 0.8})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${intensity * 0.4})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        ctx.restore();
    }
    
    applySpotLight(ctx, light) {
        const lightPos = this.screen2DPosition(light.position);
        const spotRadius = Math.tan(light.angle) * light.distance * 50;
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const gradient = ctx.createRadialGradient(
            lightPos.x, lightPos.y, spotRadius * 0.3,
            lightPos.x, lightPos.y, spotRadius
        );
        
        const color = light.color;
        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${light.intensity})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(lightPos.x, lightPos.y, spotRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    // ==================== SHADOW PROJECTION ====================
    
    projectShadowsFrom3DObjects(ctx) {
        if (!this.projectShadows || !this.scene) return;
        
        this.scene.traverse((obj) => {
            if (obj.isMesh && obj.castShadow) {
                this.projectObjectShadow(ctx, obj);
            }
        });
    }
    
    projectObjectShadow(ctx, obj) {
        if (!obj.geometry || !obj.geometry.boundingSphere) return;
        
        const sphere = obj.geometry.boundingSphere;
        const worldPos = new THREE.Vector3();
        obj.localToWorld(worldPos.copy(sphere.center));
        
        const screenPos = this.screen2DPosition(worldPos);
        const screenRadius = (sphere.radius * this.camera.zoom) * 50;
        
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = this.shadowOpacity;
        
        const gradient = ctx.createRadialGradient(
            screenPos.x, screenPos.y, 0,
            screenPos.x, screenPos.y, screenRadius
        );
        
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(
            screenPos.x - screenRadius,
            screenPos.y - screenRadius,
            screenRadius * 2,
            screenRadius * 2
        );
        
        ctx.restore();
    }
    
    // ==================== DEPTH-BASED RENDERING ====================
    
    renderWithDepthComposite(canvas3D, canvas2D) {
        if (!this.depthComposite) return;
        
        const ctx = this.ctx;
        const w = canvas2D.width;
        const h = canvas2D.height;
        
        // Get 2D scene image data
        const img2D = canvas2D.toDataURL();
        
        // Get 3D depth info
        const depthData = this.extractDepthFrom3D();
        
        // Composite based on depth
        ctx.drawImage(new Image(), 0, 0);
    }
    
    extractDepthFrom3D() {
        if (!this.scene || !this.camera) return null;
        
        // Use depth texture from 3D renderer if available
        // Otherwise, calculate depth from object positions
        const depthMap = new Map();
        
        this.scene.traverse((obj) => {
            if (obj.isMesh) {
                const distance = this.camera.position.distanceTo(obj.position);
                depthMap.set(obj.uuid, distance);
            }
        });
        
        return depthMap;
    }
    
    // ==================== UTILITY FUNCTIONS ====================
    
    screen2DPosition(worldPos) {
        if (!this.camera) return { x: 0, y: 0 };
        
        const vector = new THREE.Vector3();
        vector.copy(worldPos);
        vector.project(this.camera);
        
        const w = this.canvas2D.width;
        const h = this.canvas2D.height;
        
        return {
            x: (vector.x * 0.5 + 0.5) * w,
            y: (-vector.y * 0.5 + 0.5) * h
        };
    }
    
    // ==================== POST-PROCESSING ====================
    
    applyFilmGrain(ctx, intensity = 0.1) {
        const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const grain = (Math.random() - 0.5) * intensity * 255;
            data[i] += grain;
            data[i + 1] += grain;
            data[i + 2] += grain;
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    applyChromaticAberration(ctx, amount = 3) {
        const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const data = imageData.data;
        const w = ctx.canvas.width;
        
        // Simplified chromatic aberration
        const tempData = new Uint8ClampedArray(data);
        
        for (let i = 0; i < data.length; i += 4) {
            const idx = i / 4;
            const x = idx % w;
            const offsetIdx = ((idx + amount) % data.length);
            
            data[i] = tempData[offsetIdx];
            data[i + 1] = tempData[i + 1];
            data[i + 2] = tempData[(offsetIdx - amount + data.length) % data.length];
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    applyDistortion(ctx, amount = 0.05) {
        const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const data = imageData.data;
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        
        // Barrel distortion
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const px = x / w - 0.5;
                const py = y / h - 0.5;
                const r = Math.sqrt(px * px + py * py);
                
                const distortion = 1 + r * amount;
                const sx = Math.round(px * distortion * w + w / 2);
                const sy = Math.round(py * distortion * h + h / 2);
                
                if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
                    const srcIdx = (sy * w + sx) * 4;
                    const dstIdx = (y * w + x) * 4;
                    data[dstIdx] = data[srcIdx];
                    data[dstIdx + 1] = data[srcIdx + 1];
                    data[dstIdx + 2] = data[srcIdx + 2];
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
}

// Rename class without invalid name
class Advanced2D3DIntegrationManager {
    constructor(canvas2D, scene3D, camera3D) {
        this.canvas2D = canvas2D;
        this.scene = scene3D;
        this.camera = camera3D;
        this.ctx = canvas2D.getContext('2d');
        
        this.enabled = true;
        this.syncCamera = true;
        this.projectShadows = true;
        this.syncLighting = true;
        this.depthComposite = true;
        this.shadowSoftness = 2;
        this.shadowOpacity = 0.4;
        this.lightProbeResolution = 32;
        
        this.lightProbes = [];
        this.shadowMap = null;
        this.projectionMatrix = new THREE.Matrix4();
        
        this.init();
    }
    
    init() {
        console.log("✅ 2D/3D Integration Manager Initialized");
    }
    
    syncCameraTo2D() {
        if (!this.syncCamera || !this.camera) return;
        const zoomLevel = this.camera.zoom || 1;
        const panX = (this.camera.position.x || 0) * 50;
        const panY = (this.camera.position.y || 0) * 50;
        return { zoomLevel, panX, panY };
    }
    
    extractLightsFrom3D() {
        if (!this.scene) return [];
        const lights = [];
        this.scene.traverse((obj) => {
            if (obj.isLight) {
                lights.push({
                    type: obj.constructor.name,
                    position: obj.position ? obj.position.clone() : new THREE.Vector3(),
                    color: obj.color || { r: 1, g: 1, b: 1 },
                    intensity: obj.intensity || 1,
                    distance: obj.distance || 0,
                    angle: obj.angle || 0,
                    penumbra: obj.penumbra || 0
                });
            }
        });
        return lights;
    }
    
    applyLightingTo2DCanvas(ctx, lights) {
        if (!ctx || !lights || lights.length === 0) return;
        lights.forEach(light => {
            if (light.type === 'DirectionalLight') {
                this.applyDirectionalLight(ctx, light);
            } else if (light.type === 'PointLight') {
                this.applyPointLight(ctx, light);
            }
        });
    }
    
    applyDirectionalLight(ctx, light) {
        const shadowDir = this.screen2DPosition(light.position);
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = Math.min(0.3, light.intensity * 0.3);
        const gradient = ctx.createLinearGradient(shadowDir.x, shadowDir.y, shadowDir.x - 50, shadowDir.y - 50);
        gradient.addColorStop(1, `rgba(0, 0, 0, ${light.intensity})`);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    }
    
    applyPointLight(ctx, light) {
        const lightPos = this.screen2DPosition(light.position);
        const intensity = light.intensity || 1;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const gradient = ctx.createRadialGradient(
            lightPos.x, lightPos.y, 0,
            lightPos.x, lightPos.y, (light.distance || 100) * 20
        );
        const color = light.color;
        const r = Math.round((color.r || 1) * 255);
        const g = Math.round((color.g || 1) * 255);
        const b = Math.round((color.b || 1) * 255);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${intensity * 0.6})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    }
    
    screen2DPosition(worldPos) {
        if (!THREE || !this.camera) return { x: 0, y: 0 };
        const vector = new THREE.Vector3();
        vector.copy(worldPos);
        try {
            vector.project(this.camera);
        } catch (e) {
            return { x: this.canvas2D.width / 2, y: this.canvas2D.height / 2 };
        }
        return {
            x: (vector.x * 0.5 + 0.5) * this.canvas2D.width,
            y: (-vector.y * 0.5 + 0.5) * this.canvas2D.height
        };
    }
}

// Export
window.Advanced2D3DIntegrationManager = Advanced2D3DIntegrationManager;
