function createAdvancedGridHelper(size = 100, divisions = 100) { // Adjusted default size for typical scenes
    const gridGroup = new THREE.Group();
    gridGroup.name = 'advancedGrid'; // Set name here for consistency

    // Horizontal XZ grid
    const horizontalGrid = new THREE.GridHelper(size, divisions);
    horizontalGrid.material = new THREE.LineBasicMaterial({
        color: 0x666666,
        opacity: 0.5,
        transparent: true
    });
    horizontalGrid.name = 'horizontalGrid';
    gridGroup.add(horizontalGrid);

    // Vertical grid (XY or YZ)
    const verticalGrid = new THREE.GridHelper(size, divisions * 2); // Can have more divisions if needed
    verticalGrid.material = new THREE.LineBasicMaterial({
        color: 0x888888, // Slightly lighter
        opacity: 0.7,
        transparent: true
    });
    verticalGrid.name = 'verticalGrid';
    verticalGrid.visible = false; // Hidden by default
    gridGroup.add(verticalGrid);

    // Major axes (Placeholder, implement if needed)
    const axesGroup = createMajorAxes(size); // Assuming this returns a Group
    gridGroup.add(axesGroup);

    // Measurement labels (Placeholder, implement if needed)
    const labelsGroup = createMeasurementLabels(size); // Assuming this returns a Group
    gridGroup.add(labelsGroup);

    // Current active plane tracker
    gridGroup.currentPlane = 'xz'; // Default to horizontal XZ plane

    // Method to update grid visibility and orientation
    gridGroup.updateGrid = function(plane) {
        console.log(`[updateGrid] Called with plane: ${plane}`);
        
        // Set current plane
        this.currentPlane = plane || 'xz';
        
        // Update grid visibility based on plane
        horizontalGrid.visible = (plane === 'xz' || plane === null);
        verticalGrid.visible = (plane === 'xy' || plane === 'yz');
        
        console.log(`  [updateGrid] horizontalGrid.visible: ${horizontalGrid.visible}, verticalGrid.visible: ${verticalGrid.visible}`);

        // Always reset rotation before applying a new one to avoid cumulative rotations
        verticalGrid.rotation.set(0, 0, 0);

        if (plane === 'xy') {
            // For XY plane (looking along Z axis), rotate 90 degrees around X
            verticalGrid.rotation.x = Math.PI / 2;
        } else if (plane === 'yz') {
            // For YZ plane (looking along X axis)
            // For proper orientation facing the camera, we need specific rotations
            verticalGrid.rotation.x = Math.PI / 2;
            verticalGrid.rotation.z = Math.PI / 2;
        }
    };

    // Store original camera position and orientation for detecting view changes
    let lastCameraPosition = new THREE.Vector3();
    let lastCameraDirection = new THREE.Vector3();
    
    // Dynamic visibility based on camera distance and view change
    gridGroup.onBeforeRender = function(renderer, scene, camera) {
        if (!camera || typeof camera.position.length !== 'function') return;

        const distance = camera.position.length();
        const maxVisibleDistance = size * 1.5;

        // Fade out based on distance
        const fade = THREE.MathUtils.smoothstep(distance, maxVisibleDistance * 0.5, maxVisibleDistance);

        const baseHorizontalOpacity = 0.5;
        const baseVerticalOpacity = 0.7;

        if (horizontalGrid.material && typeof horizontalGrid.material.opacity !== 'undefined') {
            horizontalGrid.material.opacity = baseHorizontalOpacity * (1 - fade);
        }
        if (verticalGrid.material && typeof verticalGrid.material.opacity !== 'undefined') {
            verticalGrid.material.opacity = baseVerticalOpacity * (1 - fade);
        }

        // Visibility of labels based on distance
        if (labelsGroup) {
            labelsGroup.visible = (distance < size * 0.75);
        }
        
        // Get current camera position and direction
        const currentCameraPosition = new THREE.Vector3().copy(camera.position);
        // Get the direction the camera is pointing (normalized)
        const currentCameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        
        // Check if the camera has moved significantly
        const positionChanged = !lastCameraPosition.equals(currentCameraPosition);
        const directionChanged = lastCameraDirection.dot(currentCameraDirection) < 0.999; // Slight change in direction
        
        // If we moved or rotated and vertical grid is visible, check if we need to revert to horizontal
        if ((positionChanged || directionChanged) && verticalGrid.visible) {
            // Calculate normalized direction vector from origin to camera
            const cameraDir = new THREE.Vector3().copy(camera.position).normalize();
            
            // Define axis direction vectors for the three standard views
            const xAxisDir = new THREE.Vector3(1, 0, 0);   // X axis (YZ plane)
            const yAxisDir = new THREE.Vector3(0, 1, 0);   // Y axis (XZ plane)
            const zAxisDir = new THREE.Vector3(0, 0, 1);   // Z axis (XY plane)
            
            // Calculate dot products to see alignment with axes
            const xDot = Math.abs(cameraDir.dot(xAxisDir));
            const yDot = Math.abs(cameraDir.dot(yAxisDir));
            const zDot = Math.abs(cameraDir.dot(zAxisDir));
            
            // Threshold for deciding when view is "aligned" with an axis
            const alignmentThreshold = 0.97; // Higher value = stricter alignment required
            
            // Check if we're aligned with the current plane's axis
            let isAligned = false;
            if (this.currentPlane === 'xy' && zDot > alignmentThreshold) {
                isAligned = true;
            } else if (this.currentPlane === 'yz' && xDot > alignmentThreshold) {
                isAligned = true;
            } else if (this.currentPlane === 'xz' && yDot > alignmentThreshold) {
                isAligned = true;
            }
            
            // If we're not aligned with the current plane's axis, revert to horizontal grid
            if (!isAligned) {
                horizontalGrid.visible = true;
                verticalGrid.visible = false;
                this.currentPlane = 'xz'; // Reset to horizontal XZ plane
                console.log("[Grid] View changed, reverting to horizontal grid only");
            }
            
            // Update last position and direction for next frame
            lastCameraPosition.copy(currentCameraPosition);
            lastCameraDirection.copy(currentCameraDirection);
        }
    };

    return gridGroup;
}
