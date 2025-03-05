
    document.addEventListener("DOMContentLoaded", function () {
        const previewContainer = document.getElementById("cameraPreview");
        const expandButton = document.getElementById("expandPreview");
        const minimizeButton = document.getElementById("minimizePreview");
        
        let isDragging = false;
        let offsetX, offsetY;
    
        // Ensure we only create one renderer
        const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        previewRenderer.setSize(previewContainer.clientWidth, previewContainer.clientHeight);
        previewRenderer.setPixelRatio(window.devicePixelRatio);
        previewContainer.appendChild(previewRenderer.domElement);
    
        function updatePreviewSize() {
            const rect = previewContainer.getBoundingClientRect();
            previewRenderer.setSize(rect.width, rect.height);
            if (activeCamera) {
                activeCamera.aspect = rect.width / rect.height;
                activeCamera.updateProjectionMatrix();
            }
        }
    
        // Toggle Expand Mode
        expandButton.addEventListener("click", () => {
            previewContainer.classList.toggle("expanded");
            if (previewContainer.classList.contains("expanded")) {
                previewContainer.style.width = "100%";
                previewContainer.style.height = "100%";
            } else {
                previewContainer.style.width = "23%";
                previewContainer.style.height = "25%";
            }
            updatePreviewSize();
        });
    
        // Toggle Minimize Mode
        minimizeButton.addEventListener("click", () => {
            previewContainer.classList.toggle("minimized");
            if (previewContainer.classList.contains("minimized")) {
                previewContainer.style.width = "50px";
                previewContainer.style.height = "50px";
            } else {
                previewContainer.style.width = "23%";
                previewContainer.style.height = "25%";
            }
        });
    
        // Dragging Functionality
        previewContainer.addEventListener("mousedown", (e) => {
            isDragging = true;
            offsetX = e.clientX - previewContainer.offsetLeft;
            offsetY = e.clientY - previewContainer.offsetTop;
            previewContainer.style.cursor = "grabbing";
        });
    
        document.addEventListener("mousemove", (e) => {
            if (isDragging) {
                let newX = e.clientX - offsetX;
                let newY = e.clientY - offsetY;
    
                // Prevent dragging outside the viewport
                const maxX = window.innerWidth - previewContainer.offsetWidth;
                const maxY = window.innerHeight - previewContainer.offsetHeight;
                previewContainer.style.left = Math.max(0, Math.min(newX, maxX)) + "px";
                previewContainer.style.top = Math.max(0, Math.min(newY, maxY)) + "px";
            }
        });
    
        document.addEventListener("mouseup", () => {
            isDragging = false;
            previewContainer.style.cursor = "grab";
        });
    
        // Resize observer for dynamic adjustments
        new ResizeObserver(updatePreviewSize).observe(previewContainer);
    });
    

    function updateHistoryPanel() {
        const historyPanel = document.getElementById('history-items');
        historyPanel.innerHTML = ''; // Clear old history
    
        history.forEach((action, index) => {
            const historyItem = document.createElement('div');
            historyItem.classList.add('history-item');
            historyItem.textContent = `${index + 1}. ${action.type || 'Action'}`;
    
            // Click to undo/redo
            historyItem.addEventListener('click', () => {
                currentHistoryIndex = index;
                applyHistoryAction(action);
            });
    
            historyPanel.appendChild(historyItem);
        });
    }
    
   

    let buildings = [];
    
    // 🌟 وظيفة لإنشاء مبنى باستخدام القيم المدخلة
    function createBuilding() {
        const width = parseFloat(document.getElementById('building-width').value);
        const height = parseFloat(document.getElementById('building-height').value);
        const depth = parseFloat(document.getElementById('building-depth').value);
    
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            metalness: 0.3,
            roughness: 0.7
        });
    
        const building = new THREE.Mesh(geometry, material);
        building.position.set(0, height / 2, 0);
        building.castShadow = true;
        building.receiveShadow = true;
    
        scene.add(building);
        addObjectToScene(building, 'building');
        buildings.push(building);
    }
    
    // 🌟 وظيفة لإضافة زخرفة على المبنى المحدد
    function addDecoration() {
        if (!selectedObject) {
            alert("يرجى تحديد مبنى أولاً!");
            return;
        }
    
        const decorationGeometry = new THREE.TorusGeometry(1, 0.2, 16, 100);
        const decorationMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
        const decoration = new THREE.Mesh(decorationGeometry, decorationMaterial);
    
        decoration.position.copy(selectedObject.position);
        decoration.position.y += selectedObject.geometry.parameters.height / 2 + 1;
    
        scene.add(decoration);
        addObjectToScene(decoration, 'decoration');
    }
    
