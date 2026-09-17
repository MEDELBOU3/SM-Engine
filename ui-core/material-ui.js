function switchMatMode(mode) {
    document.querySelectorAll('.mat-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    document.getElementById('mat-section-basic').style.display = mode === 'basic' ? 'block' : 'none';
    document.getElementById('mat-section-advanced').style.display = mode === 'advanced' ? 'block' : 'none';
}

function updatePhysicalMat(prop, val) {
    if (!selectedObject || !selectedObject.isMesh) return;

    if (selectedObject.material.type !== 'MeshPhysicalMaterial') {
        const oldMat = selectedObject.material;
        selectedObject.material = new THREE.MeshPhysicalMaterial().copy(oldMat);
    }

    selectedObject.material[prop] = parseFloat(val);
    selectedObject.material.needsUpdate = true;
}
