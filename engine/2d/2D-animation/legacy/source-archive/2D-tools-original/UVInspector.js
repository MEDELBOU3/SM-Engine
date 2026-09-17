class UVInspector {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.pixelRatio = window.devicePixelRatio || 1;

        // 1. Create an offscreen "Paint Layer" (Fixed resolution like a real texture)
        this.paintCanvas = document.createElement('canvas');
        this.paintCanvas.width = 1024; // Standard texture size
        this.paintCanvas.height = 1024;
        this.pCtx = this.paintCanvas.getContext('2d');
        
        // Fill paint canvas with a base color (optional)
        this.pCtx.fillStyle = "#111111";
        this.pCtx.fillRect(0, 0, 1024, 1024);

        this.isPainting = false;
        this.setupResizing();
        this.setupPaintingEvents();
    }

    setupPaintingEvents() {
        this.canvas.addEventListener('mousedown', () => this.isPainting = true);
        window.addEventListener('mouseup', () => this.isPainting = false);
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isPainting) return;

            const rect = this.canvas.getBoundingClientRect();
            // Map mouse position (UI) to Paint Canvas (1024x1024)
            const x = (e.clientX - rect.left) * (this.paintCanvas.width / rect.width);
            const y = (e.clientY - rect.top) * (this.paintCanvas.height / rect.height);

            const color = document.getElementById('uv-paint-color')?.value || '#ffffff';
            const size = document.getElementById('uv-brush-size')?.value || 10;

            this.pCtx.fillStyle = color;
            this.pCtx.beginPath();
            this.pCtx.arc(x, y, size, 0, Math.PI * 2);
            this.pCtx.fill();

            this.draw(); // Refresh the display
        });
    }

    setupResizing() {
        const observer = new ResizeObserver(() => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width * this.pixelRatio;
            this.canvas.height = rect.width * this.pixelRatio; 
            this.draw();
        });
        observer.observe(this.canvas.parentElement);
    }

    // THE MAIN DRAW LOOP
    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Draw the Painted Texture Layer first
        ctx.drawImage(this.paintCanvas, 0, 0, w, h);

        // 2. Draw the UV Wireframe on top
        this.drawUVWires();

        // 3. Update the 3D Model in real-time
        if (window.selectedObject && window.selectedObject.material && window.selectedObject.material.map) {
            window.selectedObject.material.map.needsUpdate = true;
        }
    }

    // THE MISSING LOGIC: Draws the triangle wires
    drawUVWires() {
        const obj = window.selectedObject;
        if (!obj || !obj.geometry || !obj.geometry.attributes.uv) return;

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const uv = obj.geometry.attributes.uv;
        const index = obj.geometry.index;

        const color = document.getElementById('uv-edge-color')?.value || '#00ff00';
        const opacity = document.getElementById('uv-opacity')?.value || 0.7;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = 1;
        ctx.beginPath();

        if (index) {
            for (let i = 0; i < index.count; i += 3) {
                this._drawTriangle(ctx, uv, index.getX(i), index.getX(i + 1), index.getX(i + 2), w, h);
            }
        } else {
            for (let i = 0; i < uv.count; i += 3) {
                this._drawTriangle(ctx, uv, i, i + 1, i + 2, w, h);
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    _drawTriangle(ctx, uv, i1, i2, i3, w, h) {
        // Map UV (0 to 1) to Canvas Pixels
        ctx.moveTo(uv.getX(i1) * w, (1 - uv.getY(i1)) * h);
        ctx.lineTo(uv.getX(i2) * w, (1 - uv.getY(i2)) * h);
        ctx.lineTo(uv.getX(i3) * w, (1 - uv.getY(i3)) * h);
        ctx.lineTo(uv.getX(i1) * w, (1 - uv.getY(i1)) * h);
    }

    applyCanvasToMaterial() {
        if (!window.selectedObject) return;

        // Create a Three.js texture from our offscreen paint canvas
        const texture = new THREE.CanvasTexture(this.paintCanvas);
        texture.anisotropy = 16;
        texture.flipY = true; // Match Three.js coordinate system

        // Apply to selected mesh
        if (Array.isArray(window.selectedObject.material)) {
            window.selectedObject.material.forEach(m => m.map = texture);
        } else {
            window.selectedObject.material.map = texture;
        }
        
        window.selectedObject.material.needsUpdate = true;
        this.updateStatus("Linked to Mesh", "var(--accent-success)");
    }

    loadBackgroundImage(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Clear and draw image as base layer on the paint canvas
                    this.pCtx.drawImage(img, 0, 0, 1024, 1024);
                    this.draw();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    updateStatus(text, color) {
        const display = document.getElementById('uv-coords-display');
        if (display) {
            display.innerText = text;
            display.style.color = color;
        }
    }

    exportUV() {
        const link = document.createElement('a');
        link.download = `Texture_${window.selectedObject.name}.png`;
        link.href = this.paintCanvas.toDataURL();
        link.click();
    }
}