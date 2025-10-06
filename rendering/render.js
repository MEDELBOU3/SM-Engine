
let shouldRenderContinuously = false;
let cleanRenderMode = false;

// === Rendering Function ===
function rendering() {
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);
    if (controls) controls.update();

    if (cleanRenderMode) hideAllHelpers();

    renderer.render(scene, camera);

    if (shouldRenderContinuously) {
        requestAnimationFrame(rendering);
    }
}

// === Helper Management ===
function hideAllHelpers() {
    scene.traverse(obj => {
        if (obj.isHelper || obj.name.includes("Helper") || obj.name.includes("Grid") || obj.name === "axesHelper") {
            obj.visible = false;
        }
        if (obj.userData?.isDebug) obj.visible = false;
    });
}

function restoreHelpers() {
    scene.traverse(obj => {
        if (obj.isHelper || obj.name.includes("Helper") || obj.name.includes("Grid") || obj.name === "axesHelper") {
            obj.visible = true;
        }
        if (obj.userData?.isDebug) obj.visible = true;
    });
}

// === Render Modes ===
function startCleanRender() {
    cleanRenderMode = true;

    // Max Quality Settings
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(window.devicePixelRatio);

    if (controls) controls.enabled = false;
    if (transformControls) {
        transformControls.detach();
        transformControls.visible = false;
        transformControls.enabled = false;
    }

    if (scene.fog) {
        scene.userData.originalFog = scene.fog;
        scene.fog = null;
    }

    hideAllHelpers();
    rendering();
    console.log("✅ Clean Render Mode activated");
}

function stopCleanRender() {
    cleanRenderMode = false;

    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    if (controls) controls.enabled = true;
    if (transformControls) {
        transformControls.visible = true;
        transformControls.enabled = true;
    }

    restoreHelpers();

    if (scene.userData.originalFog) {
        scene.fog = scene.userData.originalFog;
        delete scene.userData.originalFog;
    }

    rendering();
    console.log("🔄 Editor Mode restored");
}

// === Export High Resolution Image ===
function exportRenderImage(highRes = false) {
    const oldPixelRatio = renderer.getPixelRatio();
    if (highRes) {
        renderer.setPixelRatio(window.devicePixelRatio * 2);
        renderer.render(scene, camera);
    }

    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = highRes ? 'rendered_scene_HD.png' : 'rendered_scene.png';
    a.click();

    if (highRes) renderer.setPixelRatio(oldPixelRatio);
}

// === Wireframe Toggle ===
function toggleWireframe() {
    scene.traverse(obj => {
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => mat.wireframe = !mat.wireframe);
            } else {
                obj.material.wireframe = !obj.material.wireframe;
            }
        }
    });
    renderer.render(scene, camera);
    console.log("🔄 Wireframe toggled");
}

// === 360° Turntable Render ===
function renderTurntable(frames = 36) {
    const step = (Math.PI * 2) / frames;
    let frame = 0;

    function rotateAndRender() {
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
        camera.lookAt(scene.position);
        renderer.render(scene, camera);

        const dataURL = renderer.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = frame_`${frame}.png`;
        a.click();

        frame++;
        if (frame < frames) requestAnimationFrame(rotateAndRender);
    }

    rotateAndRender();
}

// === UI Listeners ===
const renderingBTN = document.getElementById("renderingBTN");
const renderingMenu = document.getElementById("renderingMenu");

renderingBTN.addEventListener('click', (event) => {
    event.stopPropagation();
    renderingMenu.style.display =
        renderingMenu.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", (event) => {
    if (!renderingBTN.contains(event.target) && !renderingMenu.contains(event.target)) {
        renderingMenu.style.display = "none";
    }
});

document.getElementById('startStopRender').addEventListener('click', () => {
    shouldRenderContinuously = !shouldRenderContinuously;
    console.log(shouldRenderContinuously ? "🟢 Rendering started." : "🔴 Rendering stopped.");
    if (shouldRenderContinuously) rendering();
});

document.getElementById('toggleCleanRender').addEventListener('click', () => {
    if (!cleanRenderMode) startCleanRender();
    else stopCleanRender();
});

document.getElementById('exportImage').addEventListener('click', () => exportRenderImage(false));
document.getElementById('exportImageHD').addEventListener('click', () => exportRenderImage(true));
document.getElementById('toggleWireframe').addEventListener('click', toggleWireframe);
document.getElementById('turntableRender').addEventListener('click', () => renderTurntable(36));
/*let shouldRenderContinuously = false;
let cleanRenderMode = false;

function rendering() {
    const delta = clock.getDelta();

    // 🔄 تحديث الأنيميشن
    if (mixer) mixer.update(delta);

    // 🔄 تحديث أدوات التحكّم بالكاميرا
    if (controls) controls.update();

    // 🚫 تعطيل أو إزالة TransformControls إذا كانت غير مفعّلة
    if (transformControls && (!transformControls.enabled || transformControls.visible === false)) {
        scene.remove(transformControls);
    }

    // 🚫 إخفاء المحاور إن لم تكن مطلوبة
    const hideHelpers = true;
    if (hideHelpers) {
        scene.traverse(obj => {
            if (obj.isHelper || obj.name === 'axesHelper' || obj.name === 'vertexHelpers') {
                obj.visible = false;
            }
        });
    }

    // 🧹 إزالة أو إخفاء أي أدوات Debug
    scene.traverse(obj => {
        if (obj.userData && obj.userData.isDebug) {
            obj.visible = false;
        }
    });

    // 🔁 الرندر
    renderer.render(scene, camera);

    // 🔁 إعادة التشغيل فقط لو في وضع loop
    if (shouldRenderContinuously) {
        requestAnimationFrame(rendering);
    }

    cleanTransformTools();

}

function cleanTransformTools() {
    if (transformControls && (!transformControls.object || !transformControls.enabled)) {
        transformControls.detach();
        scene.remove(transformControls);
    }
}

function prepareForFinalRender() {
    if (controls) controls.enabled = false;
    if (transformControls) transformControls.visible = false;

    scene.traverse(obj => {
        if (obj.isHelper || obj.name.includes("Helper") || obj.name.includes("Grid")) {
            obj.visible = false;
        }
    });

    console.log("🎬 Scene ready for clean render.");
}

function startCleanRender() {
    cleanRenderMode = true;

    if (controls) controls.enabled = false;
    if (transformControls) {
        transformControls.detach();
        transformControls.visible = false;
        transformControls.enabled = false;
    }

    // إخفاء الأدوات المساعدة
    scene.traverse(obj => {
        if (obj.isHelper || obj.name.includes("Helper") || obj.name === "advancedGrid") {
            obj.visible = false;
        }
    });

    // إيقاف تأثير الضباب (اختياري)
    if (scene.fog) {
        scene.userData.originalFog = scene.fog;
        scene.fog = null;
    }

    // الرندر الآن نظيف
    rendering(); // أو animate() حسب الحالة
    console.log("✅ Clean Render Mode activated");
}

function stopCleanRender() {
    cleanRenderMode = false;

    if (controls) controls.enabled = true;
    if (transformControls) {
        transformControls.visible = true;
        transformControls.enabled = true;
    }

    // إظهار الأدوات المساعدة
    scene.traverse(obj => {
        if (obj.isHelper || obj.name.includes("Helper") || obj.name === "advancedGrid") {
            obj.visible = true;
        }
    });

    // استرجاع الضباب (fog)
    if (scene.userData.originalFog) {
        scene.fog = scene.userData.originalFog;
        delete scene.userData.originalFog;
    }

    rendering(); // أو animate()
    console.log("🔄 Editor Mode restored");
}


//listener for rendering button
document.getElementById('renderingBTN').addEventListener('click', () => {
    if (shouldRenderContinuously) {
        shouldRenderContinuously = false;
        console.log("🔴 Rendering stopped.");
    } else {
        shouldRenderContinuously = true;
        console.log("🟢 Rendering started.");
        rendering();
    }
});

document.getElementById('toggleCleanRender').addEventListener('click', () => {
    if (!cleanRenderMode) {
        startCleanRender();
    } else {
        stopCleanRender();
    }
});

const renderingBTN = document.getElementById("renderingBTN");
    const renderingMenu = document.getElementById("renderingMenu");

    // Toggle dropdown on click
    renderingBTN.addEventListener("click", () => {
        renderingMenu.style.display = renderingMenu.style.display === "block" ? "none" : "block";
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", function(event) {
        if (!renderingBTN.contains(event.target) && !renderingMenu.contains(event.target)) {
            renderingMenu.style.display = "none";
        }
    });

function exportRenderImage() {
    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'rendered_scene.png';
    a.click();
}
*/
