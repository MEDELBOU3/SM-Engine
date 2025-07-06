let shouldRenderContinuously = false;
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
