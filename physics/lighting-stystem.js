function createSimpleSunLight() {
    // إنشاء ضوء الشمس الأساسي
    const sunLight = new THREE.DirectionalLight(0xfff8e1, 3.5);
    sunLight.position.set(5, 25, 5);
    
    // تفعيل الظلال وضبط إعداداتها
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.bias = -0.0002;

    // إضافة كرة بسيطة تمثل الشمس
    const sunGeometry = new THREE.SphereGeometry(5, 32, 32); // Adjust size as needed
    const sunMaterial = new THREE.MeshStandardMaterial({
        emissive: 0xffcc00, // Glowing sun effect
        color: 0xffaa00, // Sun color
        emissiveIntensity: 2, // Bright
        roughness: 0.2,
        metalness: 0.7,

    });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.copy(sunLight.position);
    // مجموعة تحتوي على الضوء والشمس
    const sunSystem = new THREE.Group();
    sunSystem.add(sunLight);
    sunSystem.add(sunMesh);

    // **دورة الليل والنهار**
    let dayTime = 0;
    function updateDayNightCycle() {
        dayTime += 0.0000001; // Slower transition
        const angle = dayTime % (Math.PI * 2);
    
        sunSystem.position.x = Math.cos(angle) * 100;
        sunSystem.position.y = Math.sin(angle) * 100;
        sunSystem.lookAt(0, 0, 0);
    
        // Adjust light intensity smoothly
        const intensity = Math.max(0, Math.sin(angle));
        sunLight.intensity = intensity * 3.5;
        
        // Adjust sun mesh glow effect
        sunMaterial.emissiveIntensity = intensity * 2;
    }

    return { sunSystem, updateDayNightCycle };
}



