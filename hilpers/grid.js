function createAdvancedGridHelper(size = 800, divisions = 800) {
    const gridGroup = new THREE.Group();

    // Main grid
    const mainGridHelper = new THREE.GridHelper(size, divisions);
    mainGridHelper.material = new THREE.LineBasicMaterial({
        color: 0x555555,
        opacity: 0.6,
        transparent: true,
        linewidth: 0.5
    });

    // Secondary grid (larger squares)
    const secondaryGridHelper = new THREE.GridHelper(size, divisions / 10);
    secondaryGridHelper.material = new THREE.LineBasicMaterial({
        color: 0x444444,
        opacity: 0.8,
        transparent: true,
        linewidth: 1
    });

    // Major axes
    const axesGroup = createMajorAxes(size);
    
    // Create measurement labels
    const labelsGroup = createMeasurementLabels(size);

    // Add everything to the group
    gridGroup.add(mainGridHelper);
    gridGroup.add(secondaryGridHelper);
    gridGroup.add(axesGroup);
    gridGroup.add(labelsGroup);

    // Dynamic visibility based on camera distance
    gridGroup.onBeforeRender = function(renderer, scene, camera) {
        const distance = camera.position.length();
        const maxDistance = size / 1.5;
        
        // Fade out based on distance
        const mainFade = THREE.MathUtils.smoothstep(distance, maxDistance * 0.5, maxDistance);
        const secondaryFade = THREE.MathUtils.smoothstep(distance, maxDistance * 0.3, maxDistance * 0.8);
        
        mainGridHelper.material.opacity = 0.6 * (1 - mainFade);
        secondaryGridHelper.material.opacity = 0.8 * (1 - secondaryFade);
        
        // Scale visibility of different grid elements based on distance
        if (distance < size * 0.2) {
            mainGridHelper.visible = true;
            secondaryGridHelper.visible = true;
            labelsGroup.visible = true;
        } else if (distance < size * 0.5) {
            mainGridHelper.visible = false;
            secondaryGridHelper.visible = true;
            labelsGroup.visible = true;
        } else {
            mainGridHelper.visible = false;
            secondaryGridHelper.visible = true;
            labelsGroup.visible = false;
        }
    };

    return gridGroup;
}




function createBlenderGrid(size = 100, divisions = 100, centerColor = 0x444444, gridColor = 0x888888) {
    const gridGroup = new THREE.Group();
    gridGroup.name = "blenderGrid";

    // Create the main grid
    const gridHelper = new THREE.GridHelper(size, divisions, centerColor, gridColor);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.2;
    gridHelper.position.y = 0;
    gridGroup.add(gridHelper);

    // Create a smaller, more prominent grid at the center
    const centerGrid = new THREE.GridHelper(10, 10, 0x4444ff, 0xaaaaaa);
    centerGrid.material.transparent = true;
    centerGrid.material.opacity = 0.5;
    centerGrid.position.y = 0.001; // Slightly above the main grid to avoid z-fighting
    gridGroup.add(centerGrid);

    // Create axis lines that extend beyond the grid
    const axisLength = size / 2 + 5;
    
    // X-axis (red)
    const xAxisGeometry = new THREE.BufferGeometry();
    xAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [-axisLength, 0, 0, axisLength, 0, 0], 3
    ));
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    gridGroup.add(xAxis);
    
    // Y-axis (green)
    const yAxisGeometry = new THREE.BufferGeometry();
    yAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [0, -axisLength, 0, 0, axisLength, 0], 3
    ));
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    gridGroup.add(yAxis);
    
    // Z-axis (blue)
    const zAxisGeometry = new THREE.BufferGeometry();
    zAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [0, 0, -axisLength, 0, 0, axisLength], 3
    ));
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    gridGroup.add(zAxis);

    // Add axis labels
    const createAxisLabel = (text, position, color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.fillStyle = `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 1.0)`;
        context.font = '48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 32, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.scale.set(3, 3, 1);
        return sprite;
    };

    // Add axis labels
    const xLabel = createAxisLabel('X', new THREE.Vector3(axisLength + 2, 0, 0), new THREE.Color(0xff0000));
    const yLabel = createAxisLabel('Y', new THREE.Vector3(0, axisLength + 2, 0), new THREE.Color(0x00ff00));
    const zLabel = createAxisLabel('Z', new THREE.Vector3(0, 0, axisLength + 2), new THREE.Color(0x0000ff));
    
    gridGroup.add(xLabel);
    gridGroup.add(yLabel);
    gridGroup.add(zLabel);

    return gridGroup;
}