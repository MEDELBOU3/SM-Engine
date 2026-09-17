/**
 * GPS Mini Map System
 * Provides a 2D overhead map showing player position, orientation, and obstacles
 */

class GPSMiniMap {
    constructor(scene, player, camera, parentElement) {
        this.scene = scene;
        this.player = player;
        this.camera = camera;

        // Map configuration
        this.config = {
            size: 200,              // Canvas size in pixels
            worldRadius: 50,        // How many meters to show
            updateInterval: 100,    // Update every 100ms
            backgroundColor: '#001a33',
            gridColor: 'rgba(0, 120, 255, 0.15)',
            playerColor: '#00ff00',
            obstacleColor: '#ff6600',
            terrainColor: '#003366',
            poiColor: '#ffff00',
            compassColor: 'rgba(255, 255, 255, 0.6)',
            zoom: 1.0,
            rotation: 0             // 0 = North-up, 1 = Player-up
        };

        // Tracked objects
        this.obstacles = [];
        this.pointsOfInterest = [];
        this.terrainFeatures = [];
        this.parentElement = parentElement;

        // State
        this.isVisible = true;
        this.lastUpdate = 0;
        this.isRotating = false; // For player-up mode

        this.init();
    }

    init() {
        this.createUI();
        this.createCanvas();
        this.scanScene();
        this.setupEventListeners();
        this.startUpdating();

        console.log('✅ GPS Mini Map initialized');
    }

    createUI() {
        // Main container
        this.container = document.createElement('div');
        this.container.id = 'gps-minimap-container';
        this.container.style.cssText = `
           position: relative;
           width: 100%;
           height: 100%;
           overflow: hidden;
           border-radius: 8px;
           box-shadow: 0 0 10px rgba(0, 120, 255, 0.5);
           background: rgba(0, 26, 51, 0.9);
           border: 2px solid rgba(0, 120, 255, 0.5);
           border-radius: 8px;
        `;


        // Coordinates display
        this.coordsDisplay = document.createElement('div');
        this.coordsDisplay.style.cssText = `
            position: absolute;
            top: 5px;
            left: 5px;
            color: #00ff00;
            font-size: 10px;
            text-shadow: 0 0 3px #000;
            pointer-events: none;
            z-index: 2;
        `;
        this.container.appendChild(this.coordsDisplay);

        // Controls panel
        this.createControlsPanel();

        this.parentElement.appendChild(this.container);
    }

    createControlsPanel() {
        const controls = document.createElement('div');
        controls.style.cssText = `
            position: relative;
            bottom: 5px;
            left: 5px;
            right: 5px;
            display: flex;
            gap: 3px;
            z-index: 2;
        `;

        // Zoom buttons
        const zoomIn = this.createButton('+', () => this.adjustZoom(0.2));
        const zoomOut = this.createButton('-', () => this.adjustZoom(-0.2));

        // Rotation mode toggle
        const rotateBtn = this.createButton('↻', () => this.toggleRotation());
        rotateBtn.id = 'gps-rotate-btn';

        // Toggle visibility
        const toggleBtn = this.createButton('◧', () => this.toggleVisibility());

        controls.appendChild(zoomOut);
        controls.appendChild(zoomIn);
        controls.appendChild(rotateBtn);
        controls.appendChild(toggleBtn);

        this.container.appendChild(controls);
    }

    createButton(text, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            flex: 1;
            padding: 3px;
            background: rgba(0, 120, 255, 0.3);
            border: 1px solid rgba(0, 120, 255, 0.5);
            color: white;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        `;
        btn.onmouseover = () => btn.style.background = 'rgba(0, 120, 255, 0.6)';
        btn.onmouseout = () => btn.style.background = 'rgba(0, 120, 255, 0.3)';
        btn.onclick = onClick;
        return btn;
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        
        // --- CORRECTED CSS ---
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1; /* Places the canvas above the container's background */
        `;

        // The resize logic is fine, we just need to set the initial width/height
        const resize = () => {
            const rect = this.container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.canvas.width = rect.width;
                this.canvas.height = rect.height;
                this.config.size = Math.min(rect.width, rect.height); // Use the smaller dimension for scaling
                this.draw(); // Redraw after resizing
            }
        };

        // We need to wait for the element to be in the DOM to get its size
        // A simple timeout works for this initialization phase
        setTimeout(resize, 0); 
        window.addEventListener('resize', resize);

        this.ctx = this.canvas.getContext('2d');
        // Place canvas inside the container. It will now be layered correctly.
        this.container.appendChild(this.canvas);
    }


    scanScene() {
        // Find all obstacles and terrain
        this.obstacles = [];
        this.terrainFeatures = [];

        this.scene.traverse((obj) => {
            // Skip helpers and non-meshes
            if (!obj.isMesh || obj.userData.ignoreInMinimap) return;

            // Categorize objects
            if (obj.name.includes('Obstacle') || obj.name.includes('Wall') ||
                obj.name.includes('Box') || obj.name.includes('Platform')) {
                this.obstacles.push({
                    object: obj,
                    type: 'obstacle',
                    color: this.config.obstacleColor
                });
            } else if (obj.name === 'UnrealEngineFloor') {
                // Don't add floor to obstacles, but we know it exists
            } else if (obj.geometry && obj.position.y < 5) {
                // Other ground-level objects
                this.terrainFeatures.push({
                    object: obj,
                    type: 'terrain',
                    color: this.config.terrainColor
                });
            }
        });

        console.log(`📍 GPS scanned: ${this.obstacles.length} obstacles, ${this.terrainFeatures.length} terrain features`);
    }

    addPointOfInterest(position, label, color = this.config.poiColor) {
        this.pointsOfInterest.push({
            position: position.clone(),
            label,
            color
        });
    }

    removePointOfInterest(label) {
        this.pointsOfInterest = this.pointsOfInterest.filter(poi => poi.label !== label);
    }

    worldToMap(worldPos) {
        const playerPos = this.player.model ? this.player.model.position : new THREE.Vector3();

        // Relative position to player
        let dx = worldPos.x - playerPos.x;
        let dz = worldPos.z - playerPos.z;

        // Apply rotation if in player-up mode
        if (this.isRotating && this.player.model) {
            const angle = -this.player.model.rotation.y;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rotX = dx * cos - dz * sin;
            const rotZ = dx * sin + dz * cos;
            dx = rotX;
            dz = rotZ;
        }

        // Scale to map size
        const scale = (this.config.size / 2) / (this.config.worldRadius / this.config.zoom);
        const centerX = this.config.size / 2;
        const centerY = this.config.size / 2;

        return {
            x: centerX + dx * scale,
            y: centerY + dz * scale
        };
    }

    draw() {
        const ctx = this.ctx;
        const size = this.config.size;

        // Clear canvas
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(0, 0, size, size);

        // Draw grid
        this.drawGrid();

        // Draw compass
        this.drawCompass();

        // Draw terrain features
        this.drawTerrainFeatures();

        // Draw obstacles
        this.drawObstacles();

        // Draw points of interest
        this.drawPointsOfInterest();

        // Draw player (always centered)
        this.drawPlayer();

        // Update coordinates display
        this.updateCoordinates();
    }

    drawGrid() {
        const ctx = this.ctx;
        const center = this.config.size / 2;
        const gridSpacing = (this.config.size / 2) / (this.config.worldRadius / this.config.zoom) * 10; // 10m grid

        ctx.strokeStyle = this.config.gridColor;
        ctx.lineWidth = 1;

        // Vertical lines
        for (let x = center % gridSpacing; x < this.config.size; x += gridSpacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.config.size);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = center % gridSpacing; y < this.config.size; y += gridSpacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.config.size, y);
            ctx.stroke();
        }

        // Center crosshair
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center - 10, center);
        ctx.lineTo(center + 10, center);
        ctx.moveTo(center, center - 10);
        ctx.lineTo(center, center + 10);
        ctx.stroke();
    }

    drawCompass() {
        const ctx = this.ctx;
        const center = this.config.size / 2;
        const radius = 15;

        // North indicator
        ctx.save();
        ctx.translate(center, 25);

        if (this.isRotating && this.player.model) {
            ctx.rotate(this.player.model.rotation.y);
        }

        ctx.fillStyle = this.config.compassColor;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', 0, -radius);

        // Arrow
        ctx.strokeStyle = this.config.compassColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -radius + 5);
        ctx.lineTo(-3, -radius + 10);
        ctx.lineTo(3, -radius + 10);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawTerrainFeatures() {
        const ctx = this.ctx;

        this.terrainFeatures.forEach(feature => {
            const obj = feature.object;
            const mapPos = this.worldToMap(obj.position);

            // Simple dot for terrain
            ctx.fillStyle = feature.color;
            ctx.beginPath();
            ctx.arc(mapPos.x, mapPos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawObstacles() {
        const ctx = this.ctx;

        this.obstacles.forEach(obstacle => {
            const obj = obstacle.object;
            const mapPos = this.worldToMap(obj.position);

            // Check if within visible range
            const distFromCenter = Math.sqrt(
                Math.pow(mapPos.x - this.config.size / 2, 2) +
                Math.pow(mapPos.y - this.config.size / 2, 2)
            );

            if (distFromCenter > this.config.size / 2) return;

            // Get object size
            const box = new THREE.Box3().setFromObject(obj);
            const size = box.getSize(new THREE.Vector3());
            const scale = (this.config.size / 2) / (this.config.worldRadius / this.config.zoom);

            const width = Math.max(3, size.x * scale);
            const height = Math.max(3, size.z * scale);

            ctx.save();
            ctx.translate(mapPos.x, mapPos.y);

            if (this.isRotating && this.player.model) {
                ctx.rotate(-this.player.model.rotation.y + obj.rotation.y);
            } else {
                ctx.rotate(obj.rotation.y);
            }

            // Draw obstacle
            ctx.fillStyle = obstacle.color;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.fillRect(-width / 2, -height / 2, width, height);
            ctx.strokeRect(-width / 2, -height / 2, width, height);

            ctx.restore();
        });
    }

    drawPointsOfInterest() {
        const ctx = this.ctx;

        this.pointsOfInterest.forEach(poi => {
            const mapPos = this.worldToMap(poi.position);

            // Draw marker
            ctx.fillStyle = poi.color;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(mapPos.x, mapPos.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Draw label
            ctx.fillStyle = 'white';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(poi.label, mapPos.x, mapPos.y - 10);
        });
    }

    drawPlayer() {
        const ctx = this.ctx;
        const center = this.config.size / 2;

        // Player dot
        ctx.fillStyle = this.config.playerColor;
        ctx.beginPath();
        ctx.arc(center, center, 4, 0, Math.PI * 2);
        ctx.fill();

        // Direction arrow
        ctx.save();
        ctx.translate(center, center);

        // Only rotate if NOT in player-up mode (since map already rotates)
        if (!this.isRotating && this.player.model) {
            ctx.rotate(this.player.model.rotation.y);
        }

        ctx.strokeStyle = this.config.playerColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-4, 4);
        ctx.lineTo(4, 4);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = this.config.playerColor;
        ctx.fill();

        ctx.restore();

        // Glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.config.playerColor;
        ctx.beginPath();
        ctx.arc(center, center, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    updateCoordinates() {
        if (!this.player.model) return;

        const pos = this.player.model.position;
        const rotation = (this.player.model.rotation.y * 180 / Math.PI + 360) % 360;

        this.coordsDisplay.innerHTML = `
            X: ${pos.x.toFixed(1)}m<br>
            Z: ${pos.z.toFixed(1)}m<br>
            °: ${rotation.toFixed(0)}°
        `;
    }

    adjustZoom(delta) {
        this.config.zoom = Math.max(0.5, Math.min(3.0, this.config.zoom + delta));
        this.draw();
    }

    toggleRotation() {
        this.isRotating = !this.isRotating;
        const btn = document.getElementById('gps-rotate-btn');
        if (btn) {
            btn.style.background = this.isRotating ?
                'rgba(0, 255, 0, 0.5)' :
                'rgba(0, 120, 255, 0.3)';
        }
    }

    toggleVisibility() {
        this.isVisible = !this.isVisible;
        this.container.classList.toggle('hidden', !this.isVisible);
    }


    setupEventListeners() {
        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.key === 'm' || e.key === 'M') {
                this.toggleVisibility();
            }
        });
    }

    startUpdating() {
        const update = () => {
            const now = Date.now();
            if (now - this.lastUpdate >= this.config.updateInterval && this.isVisible) {
                this.draw();
                this.lastUpdate = now;
            }
            requestAnimationFrame(update);
        };
        update();
    }

    // Public methods for external control
    setZoom(zoom) {
        this.config.zoom = Math.max(0.5, Math.min(3.0, zoom));
    }

    setWorldRadius(radius) {
        this.config.worldRadius = radius;
    }

    rescan() {
        this.scanScene();
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

// Export for use in your main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GPSMiniMap;
}
if (typeof window !== 'undefined') {
    window.GPSMiniMap = GPSMiniMap;
}

/**
 * Add a waypoint marker on the map
 */
function addWaypoint(x, y, z, label) {
    if (window.gpsMiniMap) {
        window.gpsMiniMap.addPointOfInterest(
            new THREE.Vector3(x, y, z),
            label,
            '#ff00ff'
        );
    }
}

/**
 * Remove a waypoint by label
 */
function removeWaypoint(label) {
    if (window.gpsMiniMap) {
        window.gpsMiniMap.removePointOfInterest(label);
    }
}

/**
 * Update map when scene changes (call this after adding/removing obstacles)
 */
function updateMiniMap() {
    if (window.gpsMiniMap) {
        window.gpsMiniMap.rescan();
    }
}

/**
 * Console commands for debugging
 */
window.gpsCommands = {
    show: () => window.gpsMiniMap?.toggleVisibility(),
    zoom: (level) => window.gpsMiniMap?.setZoom(level),
    radius: (meters) => window.gpsMiniMap?.setWorldRadius(meters),
    rotate: () => window.gpsMiniMap?.toggleRotation(),
    addPOI: (x, z, label) => addWaypoint(x, 0, z, label),
    refresh: () => updateMiniMap()
};


