// Add new global variables
let materialBrushSettings = {
    size: 1.5,
    strength: 0.5,
    falloff: 0.7,
    pattern: 'uniform', // Options: uniform, noise, radial, custom
    rotation: 0,
    scale: 1.0,
    opacity: 1.0,
    blendMode: 'normal' // Options: normal, multiply, overlay, add
};
let uploadedMaterial = null;
let materialPreviewTexture = null;




function updateMaterialPreview() {
    if (!uploadedMaterial) return;
    
    const canvas = document.getElementById('materialPreview');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(uploadedMaterial, 0, 0, canvas.width, canvas.height);
    
    materialPreviewTexture = new THREE.Texture(uploadedMaterial);
    materialPreviewTexture.needsUpdate = true;
}

// Advanced Material Painting Function
function applyMaterialPaint(event) {
    if (!terrain || !terrain.userData.textureCanvas || !uploadedMaterial) {
        console.error('Terrain, texture canvas, or material not ready');
        return;
    }

    const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrain);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        const uv = intersect.uv;
        const ctx = terrain.userData.textureContext;
        const canvas = terrain.userData.textureCanvas;

        // Calculate brush position and size
        const x = uv.x * canvas.width;
        const y = (1 - uv.y) * canvas.height;
        const brushRadius = materialBrushSettings.size * 50;

        // Save state for undo
        if (!lastSavedState || Date.now() - lastSavedState > autoSaveInterval) {
            saveTerrainState();
            lastSavedState = Date.now();
        }

        // Create temporary canvas for material brush
        const brushCanvas = document.createElement('canvas');
        brushCanvas.width = brushRadius * 2;
        brushCanvas.height = brushRadius * 2;
        const brushCtx = brushCanvas.getContext('2d');

        // Apply rotation and scale
        brushCtx.save();
        brushCtx.translate(brushRadius, brushRadius);
        brushCtx.rotate(materialBrushSettings.rotation * Math.PI / 180);
        brushCtx.scale(materialBrushSettings.scale, materialBrushSettings.scale);
        brushCtx.translate(-brushRadius, -brushRadius);

        // Draw material
        const materialX = uv.x * uploadedMaterial.width - brushRadius;
        const materialY = (1 - uv.y) * uploadedMaterial.height - brushRadius;
        brushCtx.drawImage(
            uploadedMaterial,
            materialX, materialY, brushRadius * 2, brushRadius * 2,
            0, 0, brushCanvas.width, brushCanvas.height
        );

        // Apply pattern
        applyBrushPattern(brushCtx, brushCanvas, brushRadius);

        // Apply falloff
        const gradient = brushCtx.createRadialGradient(
            brushRadius, brushRadius, 0,
            brushRadius, brushRadius, brushRadius
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${materialBrushSettings.opacity * materialBrushSettings.strength})`);
        gradient.addColorStop(materialBrushSettings.falloff, `rgba(255, 255, 255, ${materialBrushSettings.opacity * materialBrushSettings.strength * 0.3})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        brushCtx.globalCompositeOperation = 'destination-in';
        brushCtx.fillStyle = gradient;
        brushCtx.beginPath();
        brushCtx.arc(brushRadius, brushRadius, brushRadius, 0, Math.PI * 2);
        brushCtx.fill();

        // Apply blend mode
        applyBlendMode(brushCtx, materialBrushSettings.blendMode);

        // Draw to terrain texture
        ctx.drawImage(
            brushCanvas,
            x - brushRadius,
            y - brushRadius
        );

        brushCtx.restore();
        terrain.material.map.needsUpdate = true;
    }
}

// Pattern Application
function applyBrushPattern(ctx, canvas, radius) {
    switch (materialBrushSettings.pattern) {
        case 'noise':
            const noiseCanvas = document.createElement('canvas');
            noiseCanvas.width = canvas.width;
            noiseCanvas.height = canvas.height;
            const noiseCtx = noiseCanvas.getContext('2d');
            const noiseData = noiseCtx.createImageData(canvas.width, canvas.height);
            for (let i = 0; i < noiseData.data.length; i += 4) {
                const value = Math.random() * 255;
                noiseData.data[i] = value;
                noiseData.data[i + 1] = value;
                noiseData.data[i + 2] = value;
                noiseData.data[i + 3] = 255;
            }
            noiseCtx.putImageData(noiseData, 0, 0);
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(noiseCanvas, 0, 0);
            break;
        case 'radial':
            const radialGradient = ctx.createRadialGradient(
                radius, radius, 0,
                radius, radius, radius
            );
            radialGradient.addColorStop(0, 'white');
            radialGradient.addColorStop(1, 'black');
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = radialGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            break;
        // Add custom pattern implementation as needed
    }
}

// Blend Mode Application
function applyBlendMode(ctx, mode) {
    switch (mode) {
        case 'multiply':
            ctx.globalCompositeOperation = 'multiply';
            break;
        case 'overlay':
            ctx.globalCompositeOperation = 'overlay';
            break;
        case 'add':
            ctx.globalCompositeOperation = 'lighter';
            break;
        default:
            ctx.globalCompositeOperation = 'source-over';
    }
}
