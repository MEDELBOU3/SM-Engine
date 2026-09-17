// =======================================================================
// NOTE: The following is the complete code you provided, with the
// improved and refactored functions integrated directly.
// Unchanged functions are kept as they were.
// =======================================================================

// Snapping System
let snappingEnabled = true;
let snappingHandler = null;
function enableSnapping() {
    snappingEnabled = !snappingEnabled;
    const menuItem = document.getElementById("enable-snapping");

    if (snappingEnabled) {
        const gridSize = 1; // Set your grid size here
        snappingHandler = () => {
            if (selectedObject) {
                selectedObject.position.x = Math.round(selectedObject.position.x / gridSize) * gridSize;
                selectedObject.position.y = Math.round(selectedObject.position.y / gridSize) * gridSize;
                selectedObject.position.z = Math.round(selectedObject.position.z / gridSize) * gridSize;
            }
        };
        transformControls.addEventListener("change", snappingHandler);
        console.log("Snapping Enabled");
        if (menuItem) menuItem.textContent = "Disable Snapping";
    } else {
        if (snappingHandler) {
            transformControls.removeEventListener("change", snappingHandler);
            snappingHandler = null;
        }
        console.log("Snapping Disabled");
        if (menuItem) menuItem.textContent = "Enable Snapping";
    }
}
let copiedObjectClipboard = [];
// Advanced Object Manipulation
function mirrorObject(axis = "x") {
    if (!selectedObject) return;
    const clone = cloneObjectForScene(selectedObject);
    clone.scale[axis] *= -1;
    addObjectToScene(clone, clone.name, clone.parent);

    if (window.historyManager) window.historyManager.recordObjectLifecycle(clone, 'add');
}

function createArray() {
    if (!selectedObject) return;

    const countStr = prompt("Enter number of copies:", "3");
    const spacingStr = prompt("Enter spacing along the X-axis:", "2.0");

    const count = parseInt(countStr, 10);
    const spacing = parseFloat(spacingStr);

    if (isNaN(count) || isNaN(spacing) || count <= 0) return;

    for (let i = 1; i <= count; i++) {
        const clone = cloneObjectForScene(selectedObject);
        clone.position.x += spacing * i;
        addObjectToScene(clone, clone.name, clone.parent);
        if (window.historyManager) window.historyManager.recordObjectLifecycle(clone, 'add');
    }
}

// Clipboard Operations
let clipboardData = null;

function getCurrentSelectionTargets() {
    const targets = [];
    const seen = new Set();
    const tryAdd = (obj) => {
        if (!obj || !obj.isObject3D || obj === scene) return;
        if (obj.userData?.isSystemObject && !obj.userData?.selectable) return;
        if (seen.has(obj.uuid)) return;
        seen.add(obj.uuid);
        targets.push(obj);
    };

    if (typeof selectedObjects !== "undefined" && Array.isArray(selectedObjects)) {
        selectedObjects.forEach(tryAdd);
    }
    if (typeof selectedObject !== "undefined" && selectedObject) {
        tryAdd(selectedObject);
    }
    return targets;
}

function clearSelection() {
    if (window.clearSelection !== clearSelection) return window.clearSelection();
    if (typeof selectedObjects !== "undefined") selectedObjects.length = 0;
    if (typeof selectedObject !== "undefined") selectedObject = null;
    if (typeof window !== "undefined") window.selectedObject = null;
    if (typeof transformControls !== "undefined" && transformControls) {
        transformControls.detach();
    }
    if (typeof updateHierarchySelection === "function") updateHierarchySelection();
}



function cloneObjectForScene(source) {
    if (!source) return null;

    // Prefer SkeletonUtils for rigged characters when available.
    if (THREE.SkeletonUtils && typeof THREE.SkeletonUtils.clone === 'function') {
        return THREE.SkeletonUtils.clone(source);
    }

    const cloned = source.clone(true);
    const sourceNodes = [];
    const clonedNodes = [];
    source.traverse(n => sourceNodes.push(n));
    cloned.traverse(n => clonedNodes.push(n));

    for (let i = 0; i < Math.min(sourceNodes.length, clonedNodes.length); i++) {
        const src = sourceNodes[i];
        const dst = clonedNodes[i];
        if (!src || !dst) continue;

        if (src.isMesh && dst.isMesh) {
            if (src.geometry && typeof src.geometry.clone === 'function') {
                dst.geometry = src.geometry.clone();
            }
            if (Array.isArray(src.material)) {
                dst.material = src.material.map(m => (m && typeof m.clone === 'function') ? m.clone() : m);
            } else if (src.material && typeof src.material.clone === 'function') {
                dst.material = src.material.clone();
            }
        }
    }

    return cloned;
}
window.cloneObjectForScene = cloneObjectForScene;

/**
 * Initializes clipboard operations (copy, paste, duplicate, delete) and attaches keyboard shortcuts/context menu.
 */
function setupClipboardOperations() {
    if (typeof window !== "undefined") {
        window.__clipboardOpsReady = false;
    }
    try {
        function handleObjectAction(type, callback) {
            return () => {
                callback();
            }; // History now handled by specific functions
        }

        const clipboardActions = {
            copy: handleObjectAction("Copy", () => {
                if (window.TransformClipboardOps?.copySelectionToClipboard) {
                    clipboardData = window.TransformClipboardOps.copySelectionToClipboard();
                    return;
                }
                const objectsToCopy = getCurrentSelectionTargets();
                if (objectsToCopy.length === 0) {
                    console.warn("Nothing selected to copy.");
                    return;
                }
                clipboardData = objectsToCopy.map((obj) => ({
                    json: obj.toJSON(),
                    originalParentUuid: obj.parent ? obj.parent.uuid : null,
                }));
                console.log(`Copied ${clipboardData.length} object(s) to clipboard.`);
            }),

            paste: handleObjectAction("Paste", () => {
                if (window.TransformClipboardOps?.pasteClipboard) {
                    clipboardData = window.__transformClipboardData || clipboardData;
                    window.TransformClipboardOps.pasteClipboard();
                    return;
                }
                if (!clipboardData || clipboardData.length === 0) {
                    console.warn("Clipboard is empty or contains no valid data.");
                    return;
                }
                const actionName =
                    clipboardData.length > 1
                        ? "Paste Multiple Objects"
                        : `Paste "${clipboardData[0].json.object.name ||
                        clipboardData[0].json.object.type
                        }"`;

                function performRedo() {
                    const pastedObjects = [];
                    const loader = new THREE.ObjectLoader();

                    clipboardData.forEach((data) => {
                        const objJSON = JSON.parse(JSON.stringify(data.json));

                        objJSON.object.uuid = THREE.MathUtils.generateUUID();
                        if (objJSON.object.children) {
                            function assignNewUUIDsRecursive(childJson) {
                                childJson.uuid = THREE.MathUtils.generateUUID();
                                if (childJson.children)
                                    childJson.children.forEach(assignNewUUIDsRecursive);
                            }
                            objJSON.object.children.forEach(assignNewUUIDsRecursive);
                        }

                        const newObject = loader.parse(objJSON);

                        let newName = newObject.name;
                        if (newName.match(/_paste(\d+)?$/i)) {
                            newName = newName.replace(
                                /_paste(\d+)?$/i,
                                (match, p1) => `_paste${p1 ? parseInt(p1, 10) + 1 : 1}`
                            );
                        } else if (newName.match(/_copy(\d+)?$/i)) {
                            newName = newName.replace(/_copy(\d+)?$/i, "_paste");
                        } else {
                            newName = `${newName}_paste`;
                        }
                        newObject.name = newName;

                        newObject.position.x += 0.5;
                        newObject.position.y += 0.5;

                        let targetParent = selectedObject ? selectedObject.parent : scene;
                        if (!targetParent) targetParent = scene;
                        targetParent.add(newObject);

                        if (
                            typeof objects !== "undefined" &&
                            !objects.some((o) => o.uuid === newObject.uuid)
                        ) {
                            objects.push(newObject);
                        }
                        pastedObjects.push(newObject);
                    });
                    clearSelection();
                    pastedObjects.forEach((obj) => addToSelection(obj));
                    if (pastedObjects.length > 0) {
                        selectObject(pastedObjects[pastedObjects.length - 1]);
                    }
                    updateHierarchy();
                    console.log(`${pastedObjects.length} object(s) pasted (Redo).`);
                    return pastedObjects;
                }
                const initialPastes = performRedo();

                recordHistoryAction(
                    actionName,
                    initialPastes.map((obj) => obj.name || obj.type).join(", "),
                    () => {
                        // Undo action: Delete the new objects
                        initialPastes.forEach((obj) => removeObjectFromScene(obj, true));
                        updateHierarchy();
                        selectObject(null);
                        console.log(`Undo: ${actionName}`);
                    },
                    () => {
                        performRedo();
                    }
                );
                console.log(`${initialPastes.length} object(s) pasted.`);
            }),

            delete: () => {
                const targets = getCurrentSelectionTargets();
                deleteObjects(targets);
            },

            duplicate: () => {
                const targets = getCurrentSelectionTargets();
                if (window.TransformClipboardOps?.duplicateSelection) {
                    window.TransformClipboardOps.duplicateSelection(targets);
                    return;
                }
                duplicateObjects(targets);
            },
        };

        // --- Context Menu Configuration ---
        const contextMenuConfig = [
            {
                label: "Copy (Ctrl+C)",
                action: clipboardActions.copy,
                id: "context-copy",
                icon: "fa-copy"
            },
            {
                label: "Paste (Ctrl+V)",
                action: clipboardActions.paste,
                id: "context-paste",
                icon: "fa-paste"
            },
            {
                label: "Duplicate (Ctrl+D)",
                action: clipboardActions.duplicate,
                id: "context-duplicate",
                icon: "fa-clone"
            },
            {
                label: "Delete (Del)",
                action: clipboardActions.delete,
                id: "context-delete",
                icon: "fa-trash"
            },

            { type: "separator" },
            {
                label: "Select",
                icon: "fa-mouse-pointer",
                subMenu: [
                    {
                        label: "Select All by Type",
                        subMenu: [
                            {
                                label: "Meshes",
                                action: () => selectByType("Mesh"),
                                id: "select-meshes",
                                icon: "fa-cube"
                            },
                            {
                                label: "Lights",
                                action: () => selectByType("Light"),
                                id: "select-lights",
                                icon: "fa-lightbulb"
                            },
                            {
                                label: "Cameras",
                                action: () => selectByType("Camera"),
                                id: "select-cameras",
                                icon: "fa-video"
                            },
                        ],
                    },
                    {
                        label: "Select All with Same Material",
                        action: selectByMaterial,
                        id: "select-material",
                        icon: "fa-palette"
                    },
                    {
                        label: "Invert Selection",
                        action: invertSelection,
                        id: "select-invert",
                        icon: "fa-retweet"
                    },
                ],
            },
            {
                label: "Object Tools",
                icon: "fa-tools",
                subMenu: [
                    {
                        label: "Transform",
                        icon: "fa-arrows-alt",
                        subMenu: [
                            {
                                label: "Translate",
                                action: () => setTransformMode("translate"),
                                id: "context-translate",
                                icon: "fa-arrows-up-down-left-right"
                            },
                            {
                                label: "Rotation",
                                action: () => setTransformMode("rotate"),
                                id: "context-rotate",
                                icon: "fa-rotate"
                            },
                            {
                                label: "Scale",
                                action: () => setTransformMode("scale"),
                                id: "context-scale",
                                icon: "fa-expand"
                            },
                            { type: "separator" },
                            {
                                label: "Reset Transform",
                                action: resetTransform,
                                id: "reset-transform",
                                icon: "fa-undo"
                            },
                            { label: "Center Pivot", action: centerPivot, id: "center-pivot", icon: "fa-bullseye" },
                            {
                                label: "Lock/Unlock Object",
                                action: toggleLockObject,
                                id: "toggle-lock",
                                icon: "fa-lock"
                            },
                            {
                                label: "Set Origin",
                                icon: "fa-crosshairs",
                                subMenu: [
                                    {
                                        label: "Origin to Geometry Center",
                                        action: centerPivot,
                                        id: "origin-to-geom",
                                    },
                                    {
                                        label: "Origin to 3D Cursor",
                                        action: () => setOrigin("cursor"),
                                        id: "origin-to-cursor",
                                    },
                                    {
                                        label: "Origin to World Origin",
                                        action: () => setOrigin("world"),
                                        id: "origin-to-world",
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        label: "Modifiers",
                        icon: "fa-magic",
                        subMenu: [
                            {
                                label: "Mirror Object",
                                action: () => mirrorObject(),
                                id: "mirror-object",
                                icon: "fa-clone"
                            },
                            { label: "Create Array", action: createArray, id: "create-array", icon: "fa-layer-group" },
                            {
                                label: "Distribute Along Path",
                                action: distributeAlongPath,
                                id: "distribute-path",
                                icon: "fa-route"
                            },
                        ],
                    },
                    {
                        label: "Baking",
                        icon: "fa-fire",
                        subMenu: [
                            {
                                label: "Bake Transformations",
                                action: bakeTransformations,
                                id: "bake-transform",
                            },
                            {
                                label: "Bake Lightmaps",
                                action: bakeLightmaps,
                                id: "bake-lightmaps",
                            },
                            { label: "Bake Ambient Occlusion", action: bakeAO, id: "bake-ao" },
                        ],
                    },
                    { type: "separator" },
                    {
                        label: "Grouping",
                        icon: "fa-object-group",
                        subMenu: [
                            {
                                label: "Group Selected",
                                action: groupSelectedObjects,
                                id: "group-objects",
                                icon: "fa-object-group"
                            },
                            {
                                label: "Ungroup",
                                action: ungroupSelectedObject,
                                id: "ungroup-object",
                                icon: "fa-object-ungroup"
                            },
                        ],
                    },
                    {
                        label: "Instancing",
                        icon: "fa-copy",
                        subMenu: [
                            {
                                label: "Convert to Instanced Mesh",
                                action: convertToInstancedMesh,
                                id: "convert-instanced",
                            },
                        ],
                    },
                    {
                        label: "Align & Distribute",
                        icon: "fa-align-left",
                        subMenu: [
                            {
                                label: "Align Min",
                                subMenu: [
                                    {
                                        label: "X Axis",
                                        action: () => alignObjects("x", "min"),
                                        id: "align-x-min",
                                    },
                                    {
                                        label: "Y Axis",
                                        action: () => alignObjects("y", "min"),
                                        id: "align-y-min",
                                    },
                                    {
                                        label: "Z Axis",
                                        action: () => alignObjects("z", "min"),
                                        id: "align-z-min",
                                    },
                                ],
                            },
                            {
                                label: "Align Center",
                                subMenu: [
                                    {
                                        label: "X Axis",
                                        action: () => alignObjects("x", "center"),
                                        id: "align-x-center",
                                    },
                                    {
                                        label: "Y Axis",
                                        action: () => alignObjects("y", "center"),
                                        id: "align-y-center",
                                    },
                                    {
                                        label: "Z Axis",
                                        action: () => alignObjects("z", "center"),
                                        id: "align-z-center",
                                    },
                                ],
                            },
                            {
                                label: "Align Max",
                                subMenu: [
                                    {
                                        label: "X Axis",
                                        action: () => alignObjects("x", "max"),
                                        id: "align-x-max",
                                    },
                                    {
                                        label: "Y Axis",
                                        action: () => alignObjects("y", "max"),
                                        id: "align-y-max",
                                    },
                                    {
                                        label: "Z Axis",
                                        action: () => alignObjects("z", "max"),
                                        id: "align-z-max",
                                    },
                                ],
                            },
                            { type: "separator" },
                            {
                                label: "Distribute Spacing",
                                subMenu: [
                                    {
                                        label: "X Axis",
                                        action: () => distributeObjects("x"),
                                        id: "distribute-x",
                                    },
                                    {
                                        label: "Y Axis",
                                        action: () => distributeObjects("y"),
                                        id: "distribute-y",
                                    },
                                    {
                                        label: "Z Axis",
                                        action: () => distributeObjects("z"),
                                        id: "distribute-z",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                label: "Scene Tools",
                icon: "fa-globe",
                subMenu: [
                    {
                        label: "Enable Snapping",
                        action: enableSnapping,
                        id: "enable-snapping",
                        icon: "fa-magnet"
                    },
                    {
                        label: "Optimize Scene",
                        action: optimizeScene,
                        id: "optimize-scene",
                        icon: "fa-tachometer-alt"
                    },
                    { label: "Clear History", action: clearHistory, id: "clear-history", icon: "fa-trash-alt" },
                    {
                        label: "Focus Camera on Selected",
                        action: focusCamera,
                        id: "focus-camera",
                        icon: "fa-crosshairs"
                    },
                    {
                        label: "Export Selected as GLTF",
                        action: exportSelectedAsGLTF,
                        id: "export-gltf",
                        icon: "fa-file-export"
                    },
                    {
                        label: "Subdivide Geometry",
                        action: applySubdivision,
                        id: "SubdivideGeo",
                        icon: "fa-th"
                    },
                ],
            },
            {
                label: "Replace With",
                icon: "fa-shapes",
                subMenu: [
                    {
                        label: "Cube",
                        action: () => replaceWithPrimitive("box"),
                        id: "replace-cube",
                        icon: "fa-cube"
                    },
                    {
                        label: "Sphere",
                        action: () => replaceWithPrimitive("sphere"),
                        id: "replace-sphere",
                        icon: "fa-circle"
                    },
                    {
                        label: "Cylinder",
                        action: () => replaceWithPrimitive("cylinder"),
                        id: "replace-cylinder",
                        icon: "fa-database"
                    },
                ],
            },
            {
                label: "Apply Material",
                icon: "fa-paint-roller",
                subMenu: [
                    {
                        label: "Metal",
                        action: () => applyMaterialPreset("metal"),
                        id: "material-metal",
                    },
                    {
                        label: "Glass",
                        action: () => applyMaterialPreset("glass"),
                        id: "material-glass",
                    },
                    {
                        label: "Matte",
                        action: () => applyMaterialPreset("matte"),
                        id: "material-matte",
                    },
                ],
            },


            {
                label: "Camera",
                icon: "fa-video",
                subMenu: [
                    {
                        label: "Set as Active Camera",
                        icon: "fa-bullseye",
                        id: "ctx-cam-set-active",
                        action: () => {
                            let cam = null, cur = window.selectedObject;
                            while (cur) {
                                if (cur.isCamera || cur.userData?.isCamera) { cam = cur; break; }
                                if (cur.userData?.primaryCamera) { cam = cur.userData.primaryCamera; break; }
                                cur = cur?.parent;
                            }
                            if (!cam) return;
                            if (window.SMEngineRenderer) {
                                window.SMEngineRenderer.setActiveCamera(cam);
                            } else {
                                if (typeof window._enterCameraView === 'function') window._enterCameraView(cam);
                            }
                        }
                    },
                    {
                        label: "Render Image (F12)",
                        icon: "fa-camera",
                        id: "ctx-cam-render",
                        action: () => {
                            if (window.SMEngineRenderer) window.SMEngineRenderer.executeRender();
                        }
                    },
                    {
                        label: "Look Through Camera",
                        icon: "fa-eye",
                        id: "ctx-cam-look",
                        action: () => {
                            let cam = null, cur = window.selectedObject;
                            while (cur) {
                                if (cur.isCamera || cur.userData?.isCamera) { cam = cur; break; }
                                if (cur.userData?.primaryCamera) { cam = cur.userData.primaryCamera; break; }
                                cur = cur?.parent;
                            }
                            if (cam && typeof window._enterCameraView === 'function') {
                                window._enterCameraView(cam);
                            }
                        }
                    },
                    { type: "separator" },
                    {
                        label: "Exit Camera View",
                        icon: "fa-sign-out-alt",
                        id: "ctx-cam-exit",
                        action: () => {
                            if (typeof window._exitCameraView === 'function') window._exitCameraView();
                        }
                    },
                ],
            },
            {
                label: "Shading Mode",
                icon: "fa-fill-drip",
                subMenu: [
                    { label: "Wireframe", action: () => window.SMViewportShading?.setMode('wireframe'), id: "ctx-sh-wire" },
                    { label: "Solid", action: () => window.SMViewportShading?.setMode('solid'), id: "ctx-sh-solid" },
                    { label: "Material Preview", action: () => window.SMViewportShading?.setMode('lookdev'), id: "ctx-sh-mat" },
                    { label: "Rendered (Cycles)", action: () => window.SMViewportShading?.setMode('rendered'), id: "ctx-sh-render" },
                ]
            },

            {
                label: "Display & View",
                icon: "fa-eye",
                subMenu: [
                    {
                        label: "Display Mode",
                        subMenu: [
                            {
                                label: "Wireframe",
                                action: () => setDisplayMode("wireframe"),
                                id: "display-wireframe",
                                icon: "fa-border-all"
                            },
                            {
                                label: "Shaded",
                                action: () => setDisplayMode("shaded"),
                                id: "display-shaded",
                                icon: "fa-cube"
                            },
                            {
                                label: "Bounding Box",
                                action: () => setDisplayMode("bounding-box"),
                                id: "display-bbox",
                                icon: "fa-box-open"
                            },
                        ],
                    },
                    {
                        label: "View Helpers",
                        subMenu: [
                            {
                                label: "Show Grid",
                                action: () => toggleHelper("grid"),
                                id: "helper-grid",
                            },
                            {
                                label: "Show Axes",
                                action: () => toggleHelper("axes"),
                                id: "helper-axes",
                            },
                            {
                                label: "Show Lights",
                                action: () => toggleHelper("lights"),
                                id: "helper-lights",
                            },
                        ],
                    },
                    {
                        label: "Minimap Controls",
                        subMenu: [
                            { label: "Show Minimap", action: showMinimap, id: "show-minimap" },
                            { label: "Hide Minimap", action: hideMinimap, id: "hide-minimap" },
                            {
                                label: "Toggle Minimap Zoom",
                                action: toggleMinimapZoom,
                                id: "toggle-map-zoom",
                            },
                        ],
                    },
                ],
            },
        ];

        function generateMenuItemsHTML(menuItems) {
            if (!menuItems) return "";
            return menuItems
                .map((item) => {
                    if (item.type === "separator") {
                        return '<div class="context-menu-separator"></div>';
                    }
                    const hasSubMenu = item.subMenu && item.subMenu.length > 0;
                    return `
                <div class="context-menu-item" ${item.id ? `id="${item.id}"` : ""
                        } ${hasSubMenu ? 'data-submenu="true"' : ""}>
                    ${item.icon ? `<i class="fa-solid ${item.icon}" style="width: 20px; text-align: center; margin-right: 8px;"></i>` : ""}
                    <span>${item.label}</span>
                    ${hasSubMenu
                            ? '<i class="fa-solid fa-caret-right" style="margin-left: auto;"></i>'
                            : ""
                        }
                    ${hasSubMenu
                            ? `<div class="sub-menu">${generateMenuItemsHTML(
                                item.subMenu
                            )}</div>`
                            : ""
                        }
                </div>
            `;
                })
                .join("");
        }

        function attachMenuListeners(menuItems, contextMenuElement) {
            menuItems.forEach((item) => {
                if (item.subMenu) {
                    attachMenuListeners(item.subMenu, contextMenuElement);
                }
                if (item.id && item.action) {
                    const element = contextMenuElement.querySelector(`#${item.id}`);
                    if (element) {
                        element.addEventListener("click", (e) => {
                            e.stopPropagation();
                            item.action();
                            document.getElementById("context-menu").style.display = "none";
                        });
                    }
                }
            });
        }

        const contextMenu = document.getElementById("context-menu");
        if (contextMenu) {
            contextMenu.innerHTML = generateMenuItemsHTML(contextMenuConfig);
            attachMenuListeners(contextMenuConfig, contextMenu);
        }

        document.addEventListener("keydown", (e) => {
            const activeEl = document.activeElement;
            const isTyping =
                activeEl &&
                (activeEl.matches("input, textarea, [contenteditable='true']") ||
                    activeEl.isContentEditable);
            if (isTyping) return;

            if (
                (e.ctrlKey || e.metaKey) &&
                ["c", "v", "d"].includes(e.key.toLowerCase())
            ) {
                e.preventDefault();
            }
            if (
                e.key === "Delete" &&
                !document.activeElement.matches("input, textarea")
            ) {
                e.preventDefault();
            }

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case "c":
                        clipboardActions.copy();
                        break;
                    case "v":
                        clipboardActions.paste();
                        break;
                    case "d":
                        clipboardActions.duplicate();
                        break;
                }
            }
            if (
                e.key === "Delete" &&
                !document.activeElement.matches("input, textarea")
            ) {
                clipboardActions.delete();
            }
        });

        Object.assign(window, {
            copyObject: clipboardActions.copy,
            pasteObject: clipboardActions.paste,
            deleteObject: (obj = null) => {
                // Wrapper for context menu/direct calls
                const targets = obj ? [obj] : getCurrentSelectionTargets();
                deleteObjects(targets);
            },
            duplicateObject: (obj = null) => {
                // Wrapper for context menu/direct calls
                const targets = obj ? [obj] : getCurrentSelectionTargets();
                duplicateObjects(targets);
            },
            enableSnapping,
            optimizeScene,
            mirrorObject,
            createArray,
            clearHistory,
        });
        if (typeof window !== "undefined") {
            window.__clipboardOpsReady = true;
        }
    } catch (err) {
        console.error("setupClipboardOperations failed:", err);
        if (typeof window !== "undefined") {
            window.__clipboardOpsReady = false;
        }
    }
}

// During initialization
function optimizeScene() {
    // Track performance stats
    const stats = {
        originalVertexCount: 0,
        optimizedVertexCount: 0,
        mergedObjects: 0,
        lodObjects: 0,
        instancedObjects: 0,
    };

    // Object pool for efficient object reuse
    const objectPool = {
        geometries: {},
        materials: {},
        instancedMeshes: {},
    };

    // Store objects by material for intelligent merging
    const objectsByMaterial = new Map();
    const staticObjects = [];
    const dynamicObjects = [];

    // Editor-owned objects must preserve identity, material references and
    // visibility. Replacing them with LOD/instanced meshes breaks gizmos,
    // player rigs, hierarchy selection and Modeling component selection.
    function isEditorManagedObject(object) {
        let current = object;
        while (current && current !== scene) {
            const data = current.userData || {};
            if (
                current.isSkinnedMesh ||
                current.isBone ||
                current.isTransformControls ||
                data.isSystemObject ||
                data.isEditorHelper ||
                data.isTransformControlsChild ||
                data.isPlayer ||
                data.isPlayerRoot ||
                data.isPlayerVisual ||
                data.isPlayerPart ||
                data.isRuntimeCharacter ||
                data.isTerrain ||
                data.isTerrainMesh ||
                data.isWater ||
                data.workspaceGlobal ||
                data.selectable === false
            ) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    // Frustum culling optimization
    function setupFrustumCulling() {
        return function updateFrustumCulling() {
            // Three.js already performs frustum culling at draw time. Never
            // rewrite Object3D.visible here: that flag is owned by workspace,
            // hierarchy, player and editor-helper systems.
            camera?.updateMatrixWorld?.();
        };
    }

    // Setup occlusion culling
    function setupOcclusionCulling() {
        const occlusionComposer = new THREE.EffectComposer(renderer);
        const occlusionPass = new THREE.OcclusionPass(scene, camera);
        occlusionComposer.addPass(occlusionPass);

        return function updateOcclusionCulling() {
            occlusionComposer.render();
            // Objects are automatically culled by the occlusion pass
        };
    }

    // Intelligent geometry merging function
    function mergeGeometries() {
        console.log("Analyzing scene for merge opportunities...");

        // Identify static meshes that can be merged
        scene.traverse((object) => {
            if (
                !object.isMesh ||
                object.userData.preventMerge ||
                isEditorManagedObject(object)
            ) return;

            // Skip engine-managed environment/system objects (workspace visibility
            // depends on their original names, groups and tags)
            if (
                object.userData.isEnvironment ||
                object.userData.isSystemObject ||
                object.userData.workspaceOnly
            ) {
                return;
            }

            // Skip objects that need individual manipulation
            if (object.userData.interactive || object.userData.physicsBody) {
                dynamicObjects.push(object);
                return;
            }

            // Group by material for efficient merging
            const materialId = object.material.uuid;
            if (!objectsByMaterial.has(materialId)) {
                objectsByMaterial.set(materialId, []);
            }
            objectsByMaterial.get(materialId).push(object);
            staticObjects.push(object);

            // Track original vertex count
            if (object.geometry.attributes.position) {
                stats.originalVertexCount += object.geometry.attributes.position.count;
            }
        });

        // Only merge objects sharing the same material
        objectsByMaterial.forEach((objects, materialId) => {
            // Skip if there's only one object with this material
            if (objects.length <= 1) return;

            // Skip small groups where merging won't help much
            if (objects.length < 3) return;

            console.log(
                `Merging ${objects.length} objects with material ${materialId}`
            );

            const geometries = [];
            const matrices = [];

            objects.forEach((object) => {
                const clonedGeometry = object.geometry.clone();
                geometries.push(clonedGeometry);
                matrices.push(object.matrixWorld.clone());

                // Hide original but don't remove yet (in case merge fails)
                object.visible = false;
            });

            try {
                // Apply transformations to geometries before merging
                for (let i = 0; i < geometries.length; i++) {
                    geometries[i].applyMatrix4(matrices[i]);
                }

                // Merge geometries
                const mergedGeometry =
                    THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
                if (!mergedGeometry) {
                    console.warn("Failed to merge geometries, reverting to originals");
                    objects.forEach((obj) => (obj.visible = true));
                    return;
                }

                // Create merged mesh
                const mergedMesh = new THREE.Mesh(
                    mergedGeometry,
                    objects[0].material.clone()
                );
                mergedMesh.userData.merged = true;
                mergedMesh.userData.originalCount = objects.length;
                mergedMesh.castShadow = objects[0].castShadow;
                mergedMesh.receiveShadow = objects[0].receiveShadow;

                // Optimize the merged geometry
                mergedGeometry.attributes.position.needsUpdate = true;
                if (mergedGeometry.attributes.normal) {
                    mergedGeometry.attributes.normal.needsUpdate = true;
                }
                mergedGeometry.computeBoundingSphere();
                mergedGeometry.computeBoundingBox();

                // Add merged mesh to scene
                scene.add(mergedMesh);

                // Now remove original objects
                objects.forEach((obj) => {
                    if (obj.parent) obj.parent.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                });

                stats.mergedObjects += objects.length;
                stats.optimizedVertexCount += mergedGeometry.attributes.position.count;
            } catch (error) {
                console.error("Error during geometry merging:", error);
                objects.forEach((obj) => (obj.visible = true));
            }
        });

        console.log(
            `Merged ${stats.mergedObjects} objects into ${objectsByMaterial.size} groups`
        );
    }

    // Advanced LOD implementation with geometry simplification
    function implementLOD(object) {
        if (
            !object.isMesh ||
            object.userData.preventLOD ||
            isEditorManagedObject(object)
        ) return;

        // Skip already processed or merged objects
        if (object.isLOD || object.parent?.isLOD || object.userData.merged) return;

        try {
            const geometry = object.geometry;
            const vertexCount = geometry.attributes.position.count;

            // Only apply LOD for complex geometries
            if (vertexCount < 1000) return;

            console.log(`Creating LOD for object with ${vertexCount} vertices`);

            const lod = new THREE.LOD();
            lod.position.copy(object.position);
            lod.rotation.copy(object.rotation);
            lod.scale.copy(object.scale);

            // Original high quality mesh (level 0)
            object.geometry = geometry.clone(); // Clone to prevent issues
            lod.addLevel(object, 0);

            // Create medium quality level (50% reduction)
            const mediumDetail = Math.max(100, Math.floor(vertexCount * 0.5));
            const mediumGeometry = geometry.clone();

            // Use more advanced decimation for high-poly models
            let modifier;
            if (window.THREE.SimplifyModifier) {
                modifier = new THREE.SimplifyModifier();
                const mediumSimplified = modifier.modify(mediumGeometry, mediumDetail);
                const mediumMesh = new THREE.Mesh(
                    mediumSimplified,
                    object.material.clone()
                );
                mediumMesh.castShadow = object.castShadow;
                mediumMesh.receiveShadow = object.receiveShadow;
                lod.addLevel(mediumMesh, 50);
            }

            // Create low quality level (90% reduction)
            const lowDetail = Math.max(50, Math.floor(vertexCount * 0.1));
            const lowGeometry = geometry.clone();

            if (window.THREE.SimplifyModifier) {
                const lowSimplified = modifier.modify(lowGeometry, lowDetail);
                const lowMesh = new THREE.Mesh(lowSimplified, object.material.clone());
                lowMesh.castShadow = object.castShadow;
                lowMesh.receiveShadow = object.receiveShadow;
                lod.addLevel(lowMesh, 150);
            }

            // Add lowest level (billboard or very simplified)
            if (vertexCount > 10000) {
                const lowestDetail = Math.max(20, Math.floor(vertexCount * 0.01));
                const lowestGeometry = geometry.clone();

                if (window.THREE.SimplifyModifier) {
                    const lowestSimplified = modifier.modify(
                        lowestGeometry,
                        lowestDetail
                    );
                    const lowestMesh = new THREE.Mesh(
                        lowestSimplified,
                        object.material.clone()
                    );
                    lowestMesh.castShadow = false; // Disable shadows for distant objects
                    lowestMesh.receiveShadow = false;
                    lod.addLevel(lowestMesh, 300);
                }
            }

            // Replace original object with LOD in scene
            if (object.parent) {
                object.parent.add(lod);
                object.parent.remove(object);
                stats.lodObjects++;
            }
        } catch (error) {
            console.error("Error creating LOD:", error);
        }
    }

    // Material optimization
    function optimizeMaterials() {
        const materialCache = new Map();

        scene.traverse((object) => {
            if (
                !object.isMesh ||
                !object.material ||
                isEditorManagedObject(object)
            ) return;

            // Handle material arrays
            if (Array.isArray(object.material)) {
                object.material = object.material.map(processMaterial);
            } else {
                object.material = processMaterial(object.material);
            }
        });

        // Process and optimize a single material
        function processMaterial(material) {
            const materialId = material.uuid;

            // Return cached instance if available
            if (materialCache.has(materialId)) {
                return materialCache.get(materialId);
            }

            // Clone to avoid modifying original
            const optimized = material.clone();

            // Optimize textures
            if (optimized.map) {
                optimized.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                optimized.map.needsUpdate = true;
            }

            // Reduce complexity of expensive materials
            if (
                optimized.type === "MeshStandardMaterial" ||
                optimized.type === "MeshPhysicalMaterial"
            ) {
                // Consider downgrading distant or numerous objects to cheaper materials
                optimized.roughness = Math.max(0.1, optimized.roughness);
                optimized.metalness = Math.min(0.9, optimized.metalness);
            }

            // Cache and return
            materialCache.set(materialId, optimized);
            objectPool.materials[materialId] = optimized;
            return optimized;
        }
    }

    // Dynamic detail level control based on performance
    function setupAdaptiveDetail() {
        let frameTime = 0;
        let frameCount = 0;
        const targetFPS = 60;
        const minAcceptableFPS = 30;

        // Adjust detail level based on performance
        return function updateAdaptiveDetail() {
            const startTime = performance.now();

            // Measure frame time
            if (frameCount > 0) {
                frameTime = performance.now() - startTime;

                // Only adapt every 60 frames to avoid constant changes
                if (frameCount % 60 === 0) {
                    const currentFPS = 1000 / frameTime;

                    // If performance is poor, reduce detail
                    if (currentFPS < minAcceptableFPS) {
                        scene.traverse((object) => {
                            if (object.isLOD) {
                                // Adjust LOD distances to show lower detail sooner
                                for (let i = 0; i < object.levels.length; i++) {
                                    object.levels[i].distance *= 0.8;
                                }
                            }
                        });
                    }
                    // If performance is good, gradually increase detail
                    else if (currentFPS > targetFPS * 0.9) {
                        scene.traverse((object) => {
                            if (object.isLOD) {
                                // Carefully increase detail
                                for (let i = 0; i < object.levels.length; i++) {
                                    object.levels[i].distance *= 1.05;
                                }
                            }
                        });
                    }

                    // Log current performance status
                    console.log(
                        `Current FPS: ${currentFPS.toFixed(1)}, Adjusting detail...`
                    );
                }
            }

            frameCount++;
        };
    }

    // Setup worker threads for parallel processing if supported
    function setupWorkerProcessing() {
        if (!window.Worker) return null;

        let physicWorker = null;
        let geometryWorker = null;
        try {
            physicWorker = new Worker("physics-worker.js");
            geometryWorker = new Worker("geometry-worker.js");
        } catch (error) {
            console.warn(
                "[optimizeScene] Worker processing unavailable:",
                error
            );
            return null;
        }

        // Setup message handlers
        physicWorker.onmessage = function (e) {
            // Handle physics updates from worker
        };

        geometryWorker.onmessage = function (e) {
            // Handle geometry processing results
        };

        return {
            physicWorker,
            geometryWorker,

            // Method to offload physics calculations
            processPhysics: function (objects) {
                physicWorker.postMessage({ type: "update", objects });
            },

            // Method to offload heavy geometry operations
            processGeometry: function (geometry, operation) {
                geometryWorker.postMessage({ type: operation, geometry });
            },
        };
    }

    // Create instanced meshes for repeating elements
    function createInstancedMeshes() {
        const groups = new Map();

        scene.traverse((object) => {
            if (!object.isMesh || object.userData.merged || object.userData.preventInstancing) return;
            if (object.isInstancedMesh) return;
            if (isEditorManagedObject(object)) return;
            if (!object.geometry || !object.material) return;

            const key = object.geometry.uuid + "|" + (Array.isArray(object.material) ? object.material.map(m => m.uuid).join(",") : object.material.uuid);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(object);
        });

        groups.forEach((objects) => {
            if (objects.length < 2) return;

            const first = objects[0];
            if (first.userData.locked || first.parent?.userData?.locked) return;

            try {
                const count = objects.length;
                const instanced = new THREE.InstancedMesh(
                    first.geometry,
                    first.material,
                    count
                );

                objects.forEach((obj, index) => {
                    const matrix = new THREE.Matrix4();
                    obj.updateWorldMatrix(true, false);
                    matrix.copy(obj.matrixWorld);
                    instanced.setMatrixAt(index, matrix);
                });
                instanced.instanceMatrix.needsUpdate = true;
                instanced.castShadow = first.castShadow;
                instanced.receiveShadow = first.receiveShadow;
                instanced.name = first.name + "_instanced";

                const parent = first.parent || scene;
                objects.forEach((obj) => {
                    obj.userData.merged = true;
                    obj.visible = false;
                });
                parent.add(instanced);
                stats.instancedObjects += count;
                console.log(`Instanced ${count} copies of '${first.name || first.uuid}'`);
            } catch (e) {
                console.warn("createInstancedMeshes: failed for", first.name || first.uuid, e);
            }
        });
    }

    // Apply all optimization techniques
    function applyOptimizations() {
        console.log("Starting scene optimization...");

        // 1. Optimize materials first (affects everything)
        optimizeMaterials();

        // 2. Merge static geometries
        mergeGeometries();

        // 3. Apply LOD to remaining complex objects
        scene.traverse(implementLOD);

        // 4. Create instanced meshes for repeating elements
        createInstancedMeshes();

        // 5. Setup pooling systems
        const getGeometry = typeof setupGeometryPooling === 'function'
            ? setupGeometryPooling()
            : null;

        // 6. Setup performance monitoring and adaptive detail
        const updateAdaptiveDetail = setupAdaptiveDetail();

        // 7. Setup frustum and occlusion culling
        const updateFrustumCulling = setupFrustumCulling();

        // 8. Setup worker processing if available
        const workers = setupWorkerProcessing();

        // Print optimization results
        console.log("Scene optimization complete:");
        console.log(`- Original vertex count: ${stats.originalVertexCount}`);
        console.log(`- Optimized vertex count: ${stats.optimizedVertexCount}`);
        console.log(`- Objects merged: ${stats.mergedObjects}`);
        console.log(`- Objects with LOD: ${stats.lodObjects}`);
        console.log(`- Objects instanced: ${stats.instancedObjects}`);

        // Return update function for render loop
        return function updateOptimizations() {
            updateFrustumCulling();
            updateAdaptiveDetail();

            const workerManager =
                typeof workers !== "undefined"
                    ? workers
                    : window.workers || null;

            const physicsIsEnabled =
                typeof physicsEnabled !== "undefined"
                    ? !!physicsEnabled
                    : (
                        typeof window.physicsEnabled === "boolean"
                            ? window.physicsEnabled
                            : (
                                window.physicsSystem?.enabled ??
                                window.physicsManager?.enabled ??
                                true
                            )
                    );

            if (
                !workerManager ||
                !physicsIsEnabled ||
                !scene?.traverse
            ) {
                return;
            }

            const physicsObjects = [];

            scene.traverse((object) => {
                const body =
                    object?.userData?.physicsBody;

                if (!body) return;

                physicsObjects.push({
                    id: object.id,

                    position: {
                        x: object.position.x,
                        y: object.position.y,
                        z: object.position.z
                    },

                    quaternion: {
                        x: object.quaternion.x,
                        y: object.quaternion.y,
                        z: object.quaternion.z,
                        w: object.quaternion.w
                    },

                    velocity: body.velocity
                        ? {
                            x: body.velocity.x ?? 0,
                            y: body.velocity.y ?? 0,
                            z: body.velocity.z ?? 0
                        }
                        : {
                            x: 0,
                            y: 0,
                            z: 0
                        }
                });
            });

            if (
                physicsObjects.length > 0 &&
                typeof workerManager.processPhysics === "function"
            ) {
                workerManager.processPhysics(
                    physicsObjects
                );
            }
        };
    }
    // Execute optimizations and return the update function
    const updateOptimizations = applyOptimizations();

    // Add optimization update to animation loop
    const originalAnimate = animate;
    animate = function () {
        updateOptimizations();
        originalAnimate();
    };

    // Return object pool for reuse
    return objectPool;
}

function resetTransform() {
    if (!selectedObject) return;
    selectedObject.position.set(0, 0, 0);
    selectedObject.rotation.set(0, 0, 0);
    selectedObject.scale.set(1, 1, 1);
    console.log(`Reset transform on: ${selectedObject.name}`);
}

function centerPivot() {
    if (!selectedObject || !selectedObject.geometry) return;
    selectedObject.geometry.computeBoundingBox();
    const bbox = selectedObject.geometry.boundingBox;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    selectedObject.geometry.translate(-center.x, -center.y, -center.z);
    console.log(`Centered pivot for: ${selectedObject.name}`);
}

function focusCamera() {
    if (!selectedObject) return;
    const box = new THREE.Box3().setFromObject(selectedObject);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    camera.position.copy(
        center.clone().add(new THREE.Vector3(0, size * 0.5, size))
    );
    camera.lookAt(center);
    console.log(`Focused camera on: ${selectedObject.name}`);
}

function exportSelectedAsGLTF() {
    if (!selectedObject) return;
    const exporter = new THREE.GLTFExporter();
    exporter.parse(
        selectedObject,
        function (result) {
            const blob = new Blob([JSON.stringify(result)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = selectedObject.name + ".gltf";
            a.click();
            URL.revokeObjectURL(url);
        },
        { binary: false }
    );
}

// --- IMPROVED FUNCTION ---
// REASON: To support multi-selection by default, using the `selectedObjects` array
// which is already used by the grouping functions. This improves consistency.
/*function toggleLockObject() {
    // Use selectedObjects array for multi-lock/unlock capability
    const objectsToToggle = selectedObjects.length > 0 ? selectedObjects : (selectedObject ? [selectedObject] : []);

    if (objectsToToggle.length === 0) return;

    objectsToToggle.forEach(obj => {
        obj.userData.locked = !obj.userData.locked;
        if (obj.userData.locked) {
            console.log(`${obj.name} is now locked`);
        } else {
            console.log(`${obj.name} is now unlocked`);
        }
    });

    // Detach controls if the primary selected object is locked
    if (selectedObject && selectedObject.userData.locked) {
        transformControls.detach();
    } else if (selectedObject && !selectedObject.userData.locked) {
        transformControls.attach(selectedObject);
    }
}

function groupSelectedObjects() {
    if (selectedObjects.length < 2) return;
    const group = new THREE.Group();
    group.name = 'Group_' + Date.now();
    selectedObjects.forEach(obj => {
        scene.remove(obj);
        group.add(obj);
    });
    scene.add(group);
    objects.push(group);
    selectedObject = group;
    transformControls.attach(group);
    console.log('Grouped objects:', group);
    updateHierarchy();
}

function ungroupSelectedObject() {
    if (!selectedObject || !(selectedObject instanceof THREE.Group)) return;
    const children = [...selectedObject.children];
    children.forEach(child => {
        selectedObject.remove(child);
        scene.add(child);
    });
    scene.remove(selectedObject);
    const index = objects.indexOf(selectedObject);
    if (index > -1) objects.splice(index, 1);
    selectedObject = null;
    transformControls.detach();
    updateHierarchy();
    console.log('Ungrouped object');
}

function bakeTransformations() {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    selectedObject.updateMatrix();
    selectedObject.geometry.applyMatrix4(selectedObject.matrix);
    selectedObject.position.set(0, 0, 0);
    selectedObject.rotation.set(0, 0, 0);
    selectedObject.scale.set(1, 1, 1);
    selectedObject.updateMatrixWorld();
    console.log('Baked transformations');
}

function replaceWithPrimitive(type = 'box') {
    if (!selectedObject) return;
    const pos = selectedObject.position.clone();
    const name = selectedObject.name;
    const geometryMap = {
        box: new THREE.BoxGeometry(1, 1, 1),
        sphere: new THREE.SphereGeometry(0.5, 32, 32),
        cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const newMesh = new THREE.Mesh(geometryMap[type], mat);
    newMesh.position.copy(pos);
    newMesh.name = name + '_' + type;
    const index = objects.indexOf(selectedObject);
    if (index > -1) {
        scene.remove(selectedObject);
        objects.splice(index, 1, newMesh);
    }
    scene.add(newMesh);
    selectedObject = newMesh;
    transformControls.attach(newMesh);
    console.log(`Replaced with ${type}`);
    updateHierarchy();
}

function applyMaterialPreset(preset) {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    const presets = {
        metal: new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 1, roughness: 0.2 }),
        glass: new THREE.MeshPhysicalMaterial({ color: 0x99ccff, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0, transmission: 1 }),
        matte: new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0, roughness: 1 }),
    };
    selectedObject.material = presets[preset];
    console.log(`Applied material preset: ${preset}`);
}

function convertToInstancedMesh() {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    const geometry = selectedObject.geometry.clone();
    const material = selectedObject.material.clone();
    const count = 10; // example count
    const instanced = new THREE.InstancedMesh(geometry, material, count);
    for (let i = 0; i < count; i++) {
        const matrix = new THREE.Matrix4().makeTranslation(i * 2, 0, 0);
        instanced.setMatrixAt(i, matrix);
    }
    scene.remove(selectedObject);
    scene.add(instanced);
    objects.push(instanced);
    console.log('Converted to instanced mesh');
}


function setDisplayMode(mode) {
    if (!selectedObject || !selectedObject.isMesh) {
        console.warn('Please select a mesh object to change its display mode.');
        return;
    }

    // First, remove any existing bounding box helper to reset the state
    if (selectedObject.userData.bboxHelper) {
        scene.remove(selectedObject.userData.bboxHelper);
        selectedObject.userData.bboxHelper.dispose(); // Clean up geometry
        delete selectedObject.userData.bboxHelper;
    }

    // Apply the new mode
    switch (mode) {
        case 'wireframe':
            // Ensure material is an array is handled
            const materials = Array.isArray(selectedObject.material) ? selectedObject.material : [selectedObject.material];
            materials.forEach(mat => mat.wireframe = true);
            console.log(`Display mode for ${selectedObject.name} set to: Wireframe`);
            break;

        case 'shaded':
            const shadedMaterials = Array.isArray(selectedObject.material) ? selectedObject.material : [selectedObject.material];
            shadedMaterials.forEach(mat => mat.wireframe = false);
            console.log(`Display mode for ${selectedObject.name} set to: Shaded`);
            break;

        case 'bounding-box':
            // In a real scenario, you'd use THREE.Box3Helper
            const bboxHelper = { name: "BoundingBoxHelper", dispose: () => {} }; // Mock THREE.Box3Helper
            // const box = new THREE.Box3().setFromObject(selectedObject);
            // const bboxHelper = new THREE.Box3Helper(box, 0xffff00);
            selectedObject.userData.bboxHelper = bboxHelper;
            scene.add(bboxHelper);
            console.log(`Display mode for ${selectedObject.name} set to: Bounding Box`);
            break;
    }
}

function toggleHelper(helperName) {
    const helperMap = {
        grid: gridHelper,
        axes: axesHelper,
        lights: lightHelpersGroup
    };

    const helper = helperMap[helperName];
    if (helper) {
        helper.visible = !helper.visible;
        console.log(`${helper.name} visibility toggled to: ${helper.visible}`);
    } else {
        console.warn(`Helper '${helperName}' not found.`);
    }
}

function teleportTo(target) {
    if (!selectedObject) {
        console.warn('No object selected to teleport.');
        return;
    }

    switch (target) {
        case 'origin':
            selectedObject.position.set(0, 0, 0);
            console.log(`${selectedObject.name} teleported to the world origin (0,0,0).`);
            break;

        case 'selected':
            // This is interpreted as "teleport the camera to the selected object"
            // which is functionally identical to the existing `focusCamera` function.
            console.log('Teleporting camera to selected object...');
            focusCamera(); // Re-use the existing focus function
            break;

        case 'camera':
            // Teleport the object 5 units in front of the camera
            const distance = 5;
            const direction = { x: 0, y: 0, z: 0 }; // Mock Vector3
            camera.getWorldDirection(direction); // Get camera's forward vector
            
            selectedObject.position.x = camera.position.x + direction.x * distance;
            selectedObject.position.y = camera.position.y + direction.y * distance;
            selectedObject.position.z = camera.position.z + direction.z * distance;
            
            console.log(`${selectedObject.name} teleported in front of the camera.`);
            break;
    }
    // Update transform controls if they are attached
    transformControls.needsUpdate = true;
}*/

function toggleLockObject() {
    const objectsToToggle =
        selectedObjects.length > 0
            ? selectedObjects
            : selectedObject
                ? [selectedObject]
                : [];
    if (objectsToToggle.length === 0) return;

    const oldLockStates = new Map();
    objectsToToggle.forEach((obj) =>
        oldLockStates.set(obj.uuid, !!obj.userData.locked)
    );

    objectsToToggle.forEach((obj) => {
        obj.userData.locked = !obj.userData.locked;
        console.log(
            `${obj.name} is now ${obj.userData.locked ? "locked" : "unlocked"}`
        );
    });

    if (selectedObject && selectedObject.userData.locked) {
        transformControls.detach();
    } else if (selectedObject && !selectedObject.userData.locked) {
        transformControls.attach(selectedObject);
    }
    updateHierarchy();

    recordHistoryAction(
        "Toggle Lock",
        objectsToToggle.map((obj) => obj.name).join(", "),
        () => {
            // Undo
            objectsToToggle.forEach((obj) => {
                obj.userData.locked = oldLockStates.get(obj.uuid);
            });
            if (selectedObject && selectedObject.userData.locked) {
                transformControls.detach();
            } else if (selectedObject && !selectedObject.userData.locked) {
                transformControls.attach(selectedObject);
            }
            updateHierarchy();
        },
        () => {
            // Redo
            toggleLockObject(); // Simply call the action again
        }
    );
}

function groupSelectedObjects() {
    if (selectedObjects.length < 2) {
        console.warn("Select at least two objects to group.");
        return;
    }
    const group = new THREE.Group();
    group.name = "Group_" + Date.now().toString().substring(8);
    const originalParents = new Map();

    const objectsToGroup = [...selectedObjects]; // Clone for history tracking

    objectsToGroup.forEach((obj) => {
        originalParents.set(obj.uuid, {
            parent: obj.parent,
            index: obj.parent ? obj.parent.children.indexOf(obj) : -1,
        });
        if (obj.parent) obj.parent.remove(obj);
        group.add(obj);
    });
    scene.add(group);
    objects.push(group);
    selectObject(group);
    updateHierarchy();

    recordHistoryAction(
        "Group Objects",
        group.name,
        () => {
            // Undo (Ungroup)
            objectsToGroup.forEach((child) => {
                group.remove(child);
                const originalParentInfo = originalParents.get(child.uuid);
                if (originalParentInfo && originalParentInfo.parent) {
                    if (
                        originalParentInfo.index !== -1 &&
                        originalParentInfo.index <=
                        originalParentInfo.parent.children.length
                    ) {
                        originalParentInfo.parent.children.splice(
                            originalParentInfo.index,
                            0,
                            child
                        );
                        child.parent = originalParentInfo.parent;
                    } else {
                        originalParentInfo.parent.add(child);
                    }
                } else {
                    scene.add(child);
                }
            });
            removeObjectFromScene(group);
            updateHierarchy();
            objectsToGroup.forEach((obj) => addToSelection(obj));
            if (objectsToGroup.length > 0) selectObject(objectsToGroup[0]);
            else selectObject(null);
        },
        () => {
            // Redo (Group)
            objectsToGroup.forEach((obj) => {
                if (obj.parent) obj.parent.remove(obj);
                group.add(obj);
            });
            scene.add(group);
            if (
                typeof objects !== "undefined" &&
                !objects.some((o) => o.uuid === group.uuid)
            ) {
                objects.push(group);
            }
            selectObject(group);
            updateHierarchy();
        }
    );
}

function ungroupSelectedObject() {
    if (!selectedObject || !(selectedObject instanceof THREE.Group)) {
        console.warn("No group selected to ungroup.");
        return;
    }
    const group = selectedObject;
    const childrenSnapshot = [...group.children]; // Get a snapshot of children for history
    const groupParent = group.parent;

    childrenSnapshot.forEach((child) => {
        group.remove(child);
        if (groupParent) {
            groupParent.add(child);
        } else {
            scene.add(child);
        }
    });

    removeObjectFromScene(group);
    selectObject(childrenSnapshot[0] || null);
    updateHierarchy();

    recordHistoryAction(
        "Ungroup Objects",
        group.name,
        () => {
            // Undo (Regroup)
            if (groupParent) groupParent.add(group);
            else scene.add(group);
            if (
                typeof objects !== "undefined" &&
                !objects.some((o) => o.uuid === group.uuid)
            ) {
                objects.push(group);
            }
            childrenSnapshot.forEach((child) => {
                if (child.parent) child.parent.remove(child);
                group.add(child);
            });
            selectObject(group);
            updateHierarchy();
        },
        () => {
            // Redo (Ungroup)
            childrenSnapshot.forEach((child) => {
                group.remove(child);
                if (groupParent) groupParent.add(child);
                else scene.add(child);
            });
            removeObjectFromScene(group);
            selectObject(childrenSnapshot[0] || null);
            updateHierarchy();
        }
    );
}

function bakeTransformations() {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    const mesh = selectedObject;
    const originalPosition = mesh.position.clone();
    const originalRotation = mesh.rotation.clone();
    const originalScale = mesh.scale.clone();
    const originalGeometryJSON = mesh.geometry.toJSON(); // Store geometry state

    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld();
    console.log("Baked transformations");

    recordHistoryAction(
        "Bake Transformations",
        mesh.name,
        () => {
            // Undo
            mesh.geometry.dispose(); // Dispose current geometry
            mesh.geometry = new THREE.BufferGeometryLoader().parse(
                originalGeometryJSON
            ); // Recreate original geometry
            mesh.position.copy(originalPosition);
            mesh.rotation.copy(originalRotation);
            mesh.scale.copy(originalScale);
            mesh.updateMatrixWorld();
            updateHierarchy();
        },
        () => {
            // Redo
            bakeTransformations(); // Re-apply the bake
        }
    );
}

function replaceWithPrimitive(type = "box") {
    if (!selectedObject) return;

    const originalObject = selectedObject;
    const originalParent = originalObject.parent;
    const originalPosition = originalObject.position.clone();
    const originalName = originalObject.name;
    const originalUUID = originalObject.uuid;
    const originalObjectJSON = originalObject.toJSON(); // For undo

    const geometryMap = {
        box: new THREE.BoxGeometry(1, 1, 1),
        sphere: new THREE.SphereGeometry(0.5, 32, 32),
        cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const newMesh = new THREE.Mesh(geometryMap[type], mat);
    newMesh.position.copy(originalPosition);
    newMesh.name = `${originalName}_${type}`;
    newMesh.uuid = THREE.MathUtils.generateUUID();

    removeObjectFromScene(originalObject, true); // Remove original silently
    addObjectToScene(newMesh, newMesh.name, originalParent); // Add new mesh via wrapper
    selectObject(newMesh);
    console.log(`Replaced with ${type}`);
    updateHierarchy();

    recordHistoryAction(
        "Replace Object",
        `${originalName} with ${newMesh.name}`,
        () => {
            // Undo
            removeObjectFromScene(newMesh, true);
            const loader = new THREE.ObjectLoader();
            const reAddedOriginal = loader.parse(originalObjectJSON);
            addObjectToScene(reAddedOriginal, reAddedOriginal.name, originalParent);
            selectObject(reAddedOriginal);
            updateHierarchy();
        },
        () => {
            // Redo
            replaceWithPrimitive(type); // Simple re-call
        }
    );
}

function applyMaterialPreset(preset) {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    const mesh = selectedObject;
    const oldMaterial = mesh.material;
    const presets = {
        metal: new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 1,
            roughness: 0.2,
        }),
        glass: new THREE.MeshPhysicalMaterial({
            color: 0x99ccff,
            transparent: true,
            opacity: 0.3,
            roughness: 0.1,
            metalness: 0,
            transmission: 1,
        }),
        matte: new THREE.MeshStandardMaterial({
            color: 0x555555,
            metalness: 0,
            roughness: 1,
        }),
    };
    const newMaterial = presets[preset];
    if (newMaterial) {
        mesh.material = newMaterial;
        mesh.material.needsUpdate = true;
        console.log(`Applied material preset: ${preset}`);
        recordHistoryAction(
            "Apply Material",
            `${mesh.name} with ${preset}`,
            () => {
                // Undo
                mesh.material = oldMaterial;
                mesh.material.needsUpdate = true;
            },
            () => {
                // Redo
                mesh.material = newMaterial;
                mesh.material.needsUpdate = true;
            }
        );
    } else {
        console.warn(`Unknown material preset: ${preset}`);
    }
}

function convertToInstancedMesh() {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    const mesh = selectedObject;
    const geometry = mesh.geometry.clone();
    const material = mesh.material.clone();
    const originalParent = mesh.parent;
    const count = 10;
    const instanced = new THREE.InstancedMesh(geometry, material, count);
    for (let i = 0; i < count; i++) {
        const matrix = new THREE.Matrix4().makeTranslation(i * 2, 0, 0);
        instanced.setMatrixAt(i, matrix);
    }

    removeObjectFromScene(mesh);
    addObjectToScene(instanced, `${mesh.name}_instanced`, originalParent);
    selectObject(instanced);
    updateHierarchy();
    console.log("Converted to instanced mesh");

    recordHistoryAction(
        "Convert to Instanced Mesh",
        mesh.name,
        () => {
            // Undo for InstancedMesh is complex: involves re-adding individual meshes
            console.warn(
                "Undo Convert to Instanced Mesh is complex and not fully implemented."
            );
            // Example: If you track individual mesh positions, you could recreate them
            // removeObjectFromScene(instanced);
            // addObjectToScene(mesh); // Re-add original
            // updateHierarchy(); selectObject(mesh);
        },
        () => {
            // Redo: Re-add instanced mesh and remove original
            // removeObjectFromScene(mesh);
            // addObjectToScene(instanced, instanced.name, originalParent);
            // updateHierarchy(); selectObject(instanced);
            console.warn(
                "Redo Convert to Instanced Mesh is complex and not fully implemented."
            );
        }
    );
}

function setDisplayMode(mode) {
    if (!selectedObject || !selectedObject.isMesh) {
        console.warn("Please select a mesh object to change its display mode.");
        return;
    }

    const mesh = selectedObject;
    const originalWireframeState = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.wireframe)
        : mesh.material.wireframe;
    const originalBBoxHelper = mesh.userData.bboxHelper; // Store reference to old helper

    // Clear existing bbox helper
    if (mesh.userData.bboxHelper) {
        if (mesh.userData.bboxHelper.parent) {
            scene.remove(mesh.userData.bboxHelper);
        }
        if (mesh.userData.bboxHelper.geometry)
            mesh.userData.bboxHelper.geometry.dispose();
        if (mesh.userData.bboxHelper.material)
            mesh.userData.bboxHelper.material.dispose();
        delete mesh.userData.bboxHelper;
    }

    switch (mode) {
        case "wireframe":
            const materials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];
            materials.forEach((mat) => {
                mat.wireframe = true;
                mat.needsUpdate = true;
            });
            console.log(`Display mode for ${mesh.name} set to: Wireframe`);
            break;
        case "shaded":
            const shadedMaterials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];
            shadedMaterials.forEach((mat) => {
                mat.wireframe = false;
                mat.needsUpdate = true;
            });
            console.log(`Display mode for ${mesh.name} set to: Shaded`);
            break;
        case "bounding-box":
            const bboxHelper = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
            );
            bboxHelper.position.copy(mesh.position);
            bboxHelper.scale.copy(mesh.scale);
            mesh.userData.bboxHelper = bboxHelper;
            scene.add(bboxHelper);
            console.log(`Display mode for ${mesh.name} set to: Bounding Box`);
            break;
    }
    recordHistoryAction(
        "Set Display Mode",
        `${mesh.name} to ${mode}`,
        () => {
            // Undo
            if (mode === "bounding-box" && mesh.userData.bboxHelper) {
                scene.remove(mesh.userData.bboxHelper);
                if (mesh.userData.bboxHelper.geometry)
                    mesh.userData.bboxHelper.geometry.dispose();
                if (mesh.userData.bboxHelper.material)
                    mesh.userData.bboxHelper.material.dispose();
                delete mesh.userData.bboxHelper;
            }
            if (originalBBoxHelper) {
                mesh.userData.bboxHelper = originalBBoxHelper;
                scene.add(originalBBoxHelper);
            }
            const materials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];
            materials.forEach((mat, i) => {
                mat.wireframe = Array.isArray(originalWireframeState)
                    ? originalWireframeState[i]
                    : originalWireframeState;
                mat.needsUpdate = true;
            });
        },
        () => {
            // Redo
            setDisplayMode(mode);
        }
    );
}

function toggleHelper(helperName) {
    const helperMap = {
        grid: window.gridHelper, // Assuming these are globally available
        axes: window.axesHelper,
        lights: window.lightHelpersGroup,
    };

    const helper = helperMap[helperName];
    if (helper) {
        const oldVisibility = helper.visible;
        helper.visible = !helper.visible;
        console.log(`${helper.name} visibility toggled to: ${helper.visible}`);
        recordHistoryAction(
            "Toggle Helper",
            `${helperName} visibility`,
            () => {
                helper.visible = oldVisibility;
            },
            () => {
                helper.visible = !oldVisibility;
            }
        );
    } else {
        console.warn(`Helper '${helperName}' not found.`);
    }
}

function teleportTo(target) {
    if (!selectedObject) {
        console.warn("No object selected to teleport.");
        return;
    }
    const oldPosition = selectedObject.position.clone();
    const oldRotation = selectedObject.rotation.clone();

    switch (target) {
        case "origin":
            selectedObject.position.set(0, 0, 0);
            break;
        case "selected":
            focusCamera();
            return; // Handled by focusCamera for consistency
        case "camera":
            const distance = 5;
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            selectedObject.position
                .copy(camera.position)
                .add(direction.multiplyScalar(distance));
            break;
    }
    transformControls.needsUpdate = true;
    console.log(`${selectedObject.name} teleported to ${target}.`);

    recordHistoryAction(
        "Teleport Object",
        `${selectedObject.name} to ${target}`,
        () => {
            // Undo
            selectedObject.position.copy(oldPosition);
            selectedObject.rotation.copy(oldRotation);
            transformControls.needsUpdate = true;
        },
        () => {
            // Redo
            // Re-execute the teleport logic. If complex, could store target state.
            // For simple cases like 'origin', directly setting position is fine.
            if (target === "origin") selectedObject.position.set(0, 0, 0);
            else if (target === "camera") {
                const distance = 5;
                const direction = new THREE.Vector3();
                camera.getWorldDirection(direction);
                selectedObject.position
                    .copy(camera.position)
                    .add(direction.multiplyScalar(distance));
            }
            transformControls.needsUpdate = true;
        }
    );
}

let minimapCamera, minimapContainer;
let isMinimapVisible = true; // Control the rendering

function setupMinimap() {
    // 1. Create the DOM element for the minimap
    minimapContainer = document.createElement("div");
    minimapContainer.id = "minimap";
    minimapContainer.style.position = "absolute";
    minimapContainer.style.bottom = "20px";
    minimapContainer.style.right = "20px";
    minimapContainer.style.width = "200px";
    minimapContainer.style.height = "200px";
    minimapContainer.style.border = "2px solid #fff";
    minimapContainer.style.overflow = "hidden"; // Important!
    document.body.appendChild(minimapContainer);

    // Add CSS for the zoomed state
    const style = document.createElement("style");
    style.innerHTML = `
        #minimap.zoomed {
            width: 400px;
            height: 400px;
        }
    `;
    document.head.appendChild(style);

    // 2. Create an Orthographic camera for the top-down view
    const viewSize = 50; // The width/height of the area the minimap can see
    minimapCamera = new THREE.OrthographicCamera(
        -viewSize / 2,
        viewSize / 2, // left, right
        viewSize / 2,
        -viewSize / 2, // top, bottom
        1,
        1000 // near, far
    );
    minimapCamera.position.set(0, 100, 0); // Position high above the scene
    minimapCamera.lookAt(scene.position); // Look at the center
    scene.add(minimapCamera);
}

/**
 * Makes the minimap UI element visible and enables its rendering.
 */
function showMinimap() {
    if (!minimapContainer) return;
    minimapContainer.style.display = "block";
    isMinimapVisible = true;
}

/**
 * Hides the minimap UI element and disables its rendering.
 */
function hideMinimap() {
    if (!minimapContainer) return;
    minimapContainer.style.display = "none";
    isMinimapVisible = false;
}

/**
 * Toggles a "zoomed" state for the minimap by changing its CSS class.
 * The animation loop will automatically adapt the render viewport to the new size.
 */
function toggleMinimapZoom() {
    if (!minimapContainer) return;

    // Define a CSS class for the zoomed state
    // e.g., in your CSS file: #minimap.zoomed { width: 400px; height: 400px; }
    minimapContainer.classList.toggle("zoomed");

    // Optionally update the camera's view size for a "real" zoom
    if (minimapContainer.classList.contains("zoomed")) {
        minimapCamera.left = -100;
        minimapCamera.right = 100;
        minimapCamera.top = 100;
        minimapCamera.bottom = -100;
    } else {
        minimapCamera.left = -50;
        minimapCamera.right = 50;
        minimapCamera.top = 50;
        minimapCamera.bottom = -50;
    }
    minimapCamera.updateProjectionMatrix();
}

/**
 * Bakes lighting for static objects in the scene into a lightmap texture.
 * This is a simplified, synchronous, and heavy process.
 * In a real app, this should be asynchronous and show progress.
 */
async function bakeLightmaps() {
    if (!scene || !renderer) return;

    const lightmapSize = 1024; // The resolution of our lightmap
    const staticObjects = [];
    const lightsToBake = [];

    // 1. Identify static meshes and lights to bake
    scene.traverse((obj) => {
        if (obj.isMesh && obj.userData.isStatic) {
            // Assume you mark static objects
            staticObjects.push(obj);
        }
        if (obj.isLight && obj.castShadow) {
            // Bake lights that cast shadows
            lightsToBake.push(obj);
        }
    });

    if (staticObjects.length === 0) {
        alert(
            "No static objects found to bake. Mark objects with `obj.userData.isStatic = true;`"
        );
        return;
    }

    // 2. Generate UV2s for all static objects (required for lightmaps)
    staticObjects.forEach((obj) => {
        if (!obj.geometry.attributes.uv2) {
            obj.geometry.setAttribute("uv2", obj.geometry.attributes.uv.clone());
        }
    });

    // 3. Create a render target to bake into
    const lightmapTarget = new THREE.WebGLRenderTarget(
        lightmapSize,
        lightmapSize
    );
    const bakingCamera = new THREE.OrthographicCamera(
        -100,
        100,
        100,
        -100,
        1,
        1000
    ); // Adjust to fit your scene

    // 4. Create a special baking material
    const bakingMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Start with black

    // 5. Baking process (simplified: one pass per light)
    const originalMaterials = new Map();

    // Hide all objects except the static ones
    scene.traverse((obj) => {
        if (obj.isMesh && !obj.userData.isStatic) obj.visible = false;
    });

    renderer.setClearColor(0x000000);
    renderer.clear();

    for (const light of lightsToBake) {
        // Position camera to mimic the light
        bakingCamera.position.copy(light.position);
        bakingCamera.lookAt(light.target ? light.target.position : scene.position);

        // Swap material to a simple one that receives light/shadow
        staticObjects.forEach((obj) => {
            originalMaterials.set(obj.uuid, obj.material);
            obj.material = new THREE.MeshLambertMaterial();
        });

        // Render the scene from the light's perspective
        renderer.setRenderTarget(lightmapTarget);
        renderer.render(scene, bakingCamera);

        // Restore materials
        staticObjects.forEach((obj) => {
            obj.material = originalMaterials.get(obj.uuid);
        });
    }

    // Reset renderer
    renderer.setRenderTarget(null);
    renderer.setClearColor(0xcccccc); // Your original clear color
    scene.traverse((obj) => {
        obj.visible = true;
    }); // Show all objects again

    // 6. Apply the baked lightmap
    const lightmapTexture = lightmapTarget.texture;
    staticObjects.forEach((obj) => {
        if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => {
                mat.lightMap = lightmapTexture;
                mat.lightMapIntensity = 1.0;
                mat.needsUpdate = true;
            });
        } else {
            obj.material.lightMap = lightmapTexture;
            obj.material.lightMapIntensity = 1.0;
            obj.material.needsUpdate = true;
        }
    });

    alert("Lightmap baking complete!");
}

/**
 * Bakes Ambient Occlusion for the selected object using raycasting.
 * NOTE: This is extremely performance-intensive and slow.
 * @param {number} textureSize - The resolution of the AO map (e.g., 512).
 * @param {number} samples - The number of rays to cast per point. Higher is better but slower.
 */
async function bakeAO(textureSize = 512, samples = 128) {
    if (!selectedObject || !selectedObject.isMesh) {
        alert("Please select a single mesh object to bake AO for.");
        return;
    }

    const geometry = selectedObject.geometry;
    if (!geometry.attributes.uv || !geometry.index) {
        alert("Object geometry must have UVs and be indexed to bake AO.");
        return;
    }

    // --- CRITICAL NOTE ---
    // This process is extremely slow and will still make the UI unresponsive for periods.
    // For a real application, this entire logic should be moved to a Web Worker
    // to avoid freezing the main browser thread.
    alert(
        `Starting AO Bake (${samples} samples). This will take a long time and may slow down the browser. Please wait...`
    );

    // Yield to the browser to show the alert before freezing.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = document.createElement("canvas");
    canvas.width = textureSize;
    canvas.height = textureSize;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, textureSize, textureSize);
    const imageData = ctx.getImageData(0, 0, textureSize, textureSize);

    const raycaster = new THREE.Raycaster();
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const indices = geometry.index.array;

    // This is the slow part
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];

        const vA = new THREE.Vector3().fromBufferAttribute(positions, a);
        const vB = new THREE.Vector3().fromBufferAttribute(positions, b);
        const vC = new THREE.Vector3().fromBufferAttribute(positions, c);

        vA.applyMatrix4(selectedObject.matrixWorld);
        vB.applyMatrix4(selectedObject.matrixWorld);
        vC.applyMatrix4(selectedObject.matrixWorld);

        // Asynchronously process each vertex of the face
        await processVertex(a, vA);
        await processVertex(b, vB);
        await processVertex(c, vC);

        // Yield to the main thread every few faces to prevent a complete freeze
        if (i % 30 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    async function processVertex(index, vertex) {
        const normal = new THREE.Vector3()
            .fromBufferAttribute(normals, index)
            .transformDirection(selectedObject.matrixWorld);
        let occlusion = 0;

        for (let s = 0; s < samples; s++) {
            const randomDir = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 2 - 1
            ).normalize();
            if (randomDir.dot(normal) < 0) {
                randomDir.negate();
            }
            raycaster.set(
                vertex.clone().add(normal.clone().multiplyScalar(0.001)),
                randomDir
            );
            const intersections = raycaster.intersectObject(selectedObject, false);
            if (intersections.length > 0) {
                occlusion++;
            }
        }

        const occlusionFactor = 1.0 - occlusion / samples;
        const color = Math.floor(255 * occlusionFactor);
        const uv = new THREE.Vector2().fromBufferAttribute(uvs, index);
        const px = Math.floor(uv.x * textureSize);
        const py = Math.floor((1 - uv.y) * textureSize);
        const pIndex = (py * textureSize + px) * 4;
        imageData.data[pIndex] = color;
        imageData.data[pIndex + 1] = color;
        imageData.data[pIndex + 2] = color;
        imageData.data[pIndex + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    const aoTexture = new THREE.CanvasTexture(canvas);
    aoTexture.flipY = false;
    selectedObject.material.aoMap = aoTexture;
    selectedObject.material.aoMapIntensity = 1.0;

    if (!geometry.attributes.uv2) {
        geometry.setAttribute("uv2", geometry.attributes.uv.clone());
    }

    selectedObject.material.needsUpdate = true;
    alert("AO Bake complete!");
}

/**
 * Distributes clones of an object along a selected path (curve).
 * @param {number} count - The number of objects to create.
 * @param {boolean} orientToPath - Whether to orient the clones to face along the path's direction.
 */
function distributeAlongPath(count = 10, orientToPath = true) {
    if (selectedObjects.length < 2) {
        alert(
            "Please select at least two objects: one path (Line or Curve) and one mesh to distribute."
        );
        return;
    }

    let pathObject = null;
    let sourceObject = null;

    // 1. Identify the path and the source object from the selection
    selectedObjects.forEach((obj) => {
        // A path can be a Line with a geometry that has points, or a Curve object
        if (obj.isLine && obj.geometry.attributes.position.count > 1) {
            pathObject = obj;
        } else if (obj.isMesh && !sourceObject) {
            sourceObject = obj;
        }
    });

    if (!pathObject || !sourceObject) {
        alert(
            "Could not identify a valid path (Line) and a source (Mesh) from selection."
        );
        return;
    }

    // 2. Create a THREE.Curve from the Line's points
    const points = [];
    const positions = pathObject.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        points.push(new THREE.Vector3().fromBufferAttribute(positions, i));
    }
    const curve = new THREE.CatmullRomCurve3(points);

    // 3. Create a group to hold the new objects
    const group = new THREE.Group();
    group.name = `${sourceObject.name}_distributed`;

    // 4. Create and place clones along the curve
    for (let i = 0; i < count; i++) {
        const clone = sourceObject.clone();
        const t = i / (count - 1); // Progress along the curve (0.0 to 1.0)

        // Get position on the curve
        const position = curve.getPointAt(t);
        clone.position.copy(position);

        if (orientToPath) {
            // Get the tangent (direction) of the curve
            const tangent = curve.getTangentAt(t).normalize();
            // Create a point to look at slightly ahead on the path
            const lookAtPosition = position.clone().add(tangent);
            clone.lookAt(lookAtPosition);
        }

        group.add(clone);
    }

    // 5. Add the final group to the scene
    scene.add(group);
    objects.push(group); // Add to your scene's object manager
    updateHierarchy();
}

/**
 * Aligns selected objects based on the last selected object (the "active" one).
 * @param {string} axis - 'x', 'y', or 'z'.
 * @param {string} edge - 'min', 'center', or 'max'.
 */
function alignObjects(axis, edge) {
    if (selectedObjects.length < 2) {
        console.warn("Select at least two objects to align.");
        return;
    }

    // The last selected object is considered the "active" target to align to.
    const activeObject = selectedObjects[selectedObjects.length - 1];
    const activeBox = new THREE.Box3().setFromObject(activeObject);
    const targetPosition = new THREE.Vector3();
    activeBox.getCenter(targetPosition); // Start with center

    // Determine the target coordinate based on the edge
    let targetCoord;
    if (edge === "min") {
        targetCoord = activeBox.min[axis];
    } else if (edge === "max") {
        targetCoord = activeBox.max[axis];
    } else {
        // center
        targetCoord = targetPosition[axis];
    }

    // Align all other selected objects to the active one
    selectedObjects.forEach((obj) => {
        if (obj === activeObject) return; // Don't move the active object

        const objBox = new THREE.Box3().setFromObject(obj);
        const objCenter = new THREE.Vector3();
        objBox.getCenter(objCenter);
        const objSize = new THREE.Vector3();
        objBox.getSize(objSize);

        let offset = 0;
        if (edge === "min") {
            offset = objCenter[axis] - objBox.min[axis];
        } else if (edge === "max") {
            offset = objCenter[axis] - objBox.max[axis];
        }

        obj.position[axis] = targetCoord + offset;
    });

    recordHistoryAction("Align Objects"); // Assuming you have a history system
    console.log(
        `Aligned ${selectedObjects.length} objects on axis ${axis} to ${edge}.`
    );
}

/**
 * Distributes selected objects evenly between the two outermost objects.
 * @param {string} axis - 'x', 'y', or 'z'.
 */
function distributeObjects(axis) {
    if (selectedObjects.length < 3) {
        console.warn("Select at least three objects to distribute.");
        return;
    }

    // Sort objects by their position on the given axis
    const sortedObjects = [...selectedObjects].sort((a, b) => {
        const boxA = new THREE.Box3().setFromObject(a);
        const boxB = new THREE.Box3().setFromObject(b);
        return boxA.min[axis] - boxB.min[axis];
    });

    const firstObj = sortedObjects[0];
    const lastObj = sortedObjects[sortedObjects.length - 1];

    const boxFirst = new THREE.Box3().setFromObject(firstObj);
    const boxLast = new THREE.Box3().setFromObject(lastObj);

    // Calculate the total space between the start of the first and end of the last object
    const totalSpan = boxLast.max[axis] - boxFirst.min[axis];

    // Calculate the total width of all objects
    let totalObjectSize = 0;
    sortedObjects.forEach((obj) => {
        const box = new THREE.Box3().setFromObject(obj);
        totalObjectSize += box.max[axis] - box.min[axis];
    });

    // The remaining space is the total gap size
    const totalGap = totalSpan - totalObjectSize;
    const gapSize = totalGap / (sortedObjects.length - 1);

    // Reposition the objects (excluding the first and last)
    let currentPos = boxFirst.max[axis];
    for (let i = 1; i < sortedObjects.length - 1; i++) {
        const obj = sortedObjects[i];
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.max[axis] - box.min[axis];

        currentPos += gapSize; // Add the gap
        obj.position[axis] =
            currentPos +
            size / 2 -
            box.getCenter(new THREE.Vector3())[axis] +
            box.min[axis];
        currentPos += size; // Add the object's own size
    }

    recordHistoryAction("Distribute Objects");
    console.log(`Distributed ${selectedObjects.length} objects on axis ${axis}.`);
}

/**
 * Selects all objects in the scene of a specific type.
 * @param {string} type - 'Mesh', 'Light', 'Camera', etc.
 */
function selectByType(type) {
    clearSelection(); // Function to deselect everything first
    scene.traverse((obj) => {
        // The check needs to be specific (e.g., obj.isMesh)
        if (obj[`is${type}`]) {
            addToSelection(obj); // Function to add an object to selectedObjects array
        }
    });
    console.log(`Selected all objects of type: ${type}`);
    updateHierarchy(); // Refresh your hierarchy panel
}

/**
 * Selects all objects that share the same material as the currently selected object.
 */
function selectByMaterial() {
    if (!selectedObject || !selectedObject.material) {
        console.warn("Select an object with a material first.");
        return;
    }

    const targetMaterial = selectedObject.material;
    clearSelection();

    scene.traverse((obj) => {
        if (obj.isMesh && obj.material === targetMaterial) {
            addToSelection(obj);
        }
    });
    console.log(
        `Selected all objects with material: ${targetMaterial.name || "Unnamed"}`
    );
    updateHierarchy();
}

/**
 * Deselects all currently selected objects and selects all unselected ones.
 */
function invertSelection() {
    const currentlySelectedIds = new Set(selectedObjects.map((obj) => obj.uuid));
    const allObjectsInScene = [];

    // Get all selectable objects (e.g., meshes, lights, groups, but not helpers)
    scene.traverse((obj) => {
        if (obj.isMesh || obj.isLight || obj.isCamera || obj.isGroup) {
            allObjectsInScene.push(obj);
        }
    });

    clearSelection();

    allObjectsInScene.forEach((obj) => {
        if (!currentlySelectedIds.has(obj.uuid)) {
            addToSelection(obj);
        }
    });
    console.log("Inverted selection.");
    updateHierarchy();
}

/**
 * Adds an object to the current multi-selection.
 * @param {THREE.Object3D} obj The object to add.
 */
function addToSelection(obj) {
    if (!obj || selectedObjects.some((selected) => selected.uuid === obj.uuid))
        return;

    selectedObjects.push(obj);
    selectedObject = obj; // The last added becomes the active object
    //applySelectionHighlight(obj, COLORS.SELECTED, 0.4);
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
        highlightSelectionBlenderStyle(obj);
    }
    if (obj.helper) obj.helper.visible = true;

    // Attach transform controls only to the *active* object
    if (transformControls) {
        transformControls.attach(obj);
    }
    if (physicsSystem) {
        physicsSystem.setSelectedObject(obj);
    }
    // Handle bone selection as active
    if (obj.isBone && obj.parent && obj.parent.isSkinnedMesh) {
        selectedBone = obj;
        selectedObject = obj.parent; // Owner of the bone is the selected object
    } else {
        selectedBone = null;
    }
    updateHierarchySelection(); // Update hierarchy DOM visually
}

/**
 * Recursively disposes of geometries and materials within an object's hierarchy.
 * @param {THREE.Object3D} object The object whose resources should be disposed.
 */
function disposeObjectResources(object) {
    object.traverse((child) => {
        if (child.isMesh) {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((mat) => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        }
        // Dispose of any Three.js helpers (e.g., light helpers, camera helpers)
        if (child.helper) {
            // Assuming a .helper property on the object
            if (child.helper.geometry) child.helper.geometry.dispose();
            if (child.helper.material) child.helper.material.dispose();
            if (child.helper.parent) child.helper.parent.remove(child.helper); // Remove helper from its parent
            delete child.helper; // Clean up the reference
        }
    });
}

/*
function removeFromSelection(obj) {
    selectedObjects = selectedObjects.filter(selected => selected.uuid !== obj.uuid);
    // If the active object was removed, set a new one or null
    if (selectedObject && selectedObject.uuid === obj.uuid) {
        selectedObject = selectedObjects.length > 0 ? selectedObjects[selectedObjects.length - 1] : null;
    }
}*/

/**
 * Removes an object from the scene, its parent, disposes resources,
 * and updates global state (selectedObject, selectedObjects, hierarchy).
 * This is a low-level removal. History is handled by the calling function.
 * @param {THREE.Object3D} objectToRemove The object to remove.
 * @param {boolean} [silent=false] If true, does not update hierarchy or selection.
 *
function removeObjectFromScene(objectToRemove, silent = false) {
    if (!objectToRemove || objectToRemove === scene) return;

    if (transformControls.object === objectToRemove) {
        transformControls.detach();
    }
    if (window.boneVisualizer && (selectedObject === objectToRemove || selectedBone?.parent === objectToRemove)) {
        window.boneVisualizer.clear();
    }
    if (physicsSystem && physicsSystem.selectedObject === objectToRemove) {
        physicsSystem.setSelectedObject(null);
    }

    if (objectToRemove.parent) {
        objectToRemove.parent.remove(objectToRemove);
    } else {
        if (scene && scene.children.includes(objectToRemove)) {
            scene.remove(objectToRemove);
        }
    }

    if (typeof objects !== 'undefined') {
        const indexInObjectsArray = objects.indexOf(objectToRemove);
        if (indexInObjectsArray > -1) {
            objects.splice(indexInObjectsArray, 1);
        }
    }

    disposeObjectResources(objectToRemove);

    selectedObjects = selectedObjects.filter(obj => obj.uuid !== objectToRemove.uuid);
    if (selectedObject && selectedObject.uuid === objectToRemove.uuid) {
        selectedObject = null;
    }
    if (selectedBone && selectedBone.uuid === objectToRemove.uuid) {
        selectedBone = null;
    } else if (selectedBone && selectedBone.parent && selectedBone.parent.uuid === objectToRemove.uuid) {
        selectedBone = null;
    }

    if (objectToRemove.isCamera && activeCamera === objectToRemove) {
        activeCamera = null;
    }

    console.log(`Removed and disposed: ${objectToRemove.name || objectToRemove.type}`);
}*/

function removeObjectFromScene(obj, dispose = false) {
    if (!obj || obj === scene) return;

    if (typeof window.cleanupManagedSceneObject === 'function') {
        try {
            window.cleanupManagedSceneObject(obj);
        } catch (error) {
            console.warn('Managed scene cleanup failed:', error);
        }
    }

    if (obj.parent) obj.parent.remove(obj);
    if (typeof objects !== "undefined" && Array.isArray(objects)) {
        const subtree = new Set();
        obj.traverse((child) => subtree.add(child));
        for (let i = objects.length - 1; i >= 0; i -= 1) {
            if (subtree.has(objects[i])) objects.splice(i, 1);
        }
    }
    if (dispose) {
        obj.traverse((child) => {
            if (child.geometry?.dispose) child.geometry.dispose();
            if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose?.());
            else if (child.material?.dispose) child.material.dispose();
            if (child.texture?.dispose) child.texture.dispose();
        });
    }
}



function deleteObjects(objectsToDelete) {
    let objects = objectsToDelete;

    if (!objects || objects.length === 0) {
        if (typeof selectedObjects !== 'undefined' && selectedObjects.length > 0) {
            objects = selectedObjects;
        } else if (typeof selectedObject !== 'undefined' && selectedObject) {
            objects = [selectedObject];
        }
    }

    if (!objects || objects.length === 0) {
        console.warn("No objects selected for deletion.");
        return;
    }

    const normalized = objects
        .map((o) => {
            if (!o || !o.isObject3D) return null;
            if (typeof resolveSelectionTarget === "function") {
                const resolved = resolveSelectionTarget(o, { source: "unknown" });
                if (resolved && resolved.isObject3D) return resolved;
            }
            return o;
        })
        .filter(Boolean);

    const actual = normalized.filter((o) => {
        if (!o || !o.isObject3D || o === scene) return false;
        if (o.userData?.isSystemObject && !o.userData?.selectable) return false;
        return true;
    });
    if (actual.length === 0) return;

    // Create a copy of the array to avoid issues if modifying the source array while iterating
    const objectsProcess = [...actual];

    objectsProcess.forEach((o) => {
        if (window.historyManager) {
            try {
                window.historyManager.recordObjectLifecycle(o, 'delete');
            } catch (e) {
                console.warn("Could not save to history, but deleting anyway.");
            }
        }
        removeObjectFromScene(o, true); // Pass true to dispose completely
    });

    clearSelection();
    if (typeof updateHierarchy === "function") updateHierarchy();
    if (typeof updateInspector === "function") updateInspector();
    updateHierarchy();
    updateInspector();

    console.log(`Deleted ${actual.length} object(s).`);
}

window.deleteObjects = deleteObjects;

function duplicateObjects(objectsToDuplicate) {
    if (window.TransformClipboardOps?.duplicateSelection) {
        return window.TransformClipboardOps.duplicateSelection(objectsToDuplicate);
    }
    let objects = objectsToDuplicate;

    if (!objects || objects.length === 0) {
        if (typeof selectedObjects !== 'undefined' && selectedObjects.length > 0) {
            objects = selectedObjects;
        } else if (typeof selectedObject !== 'undefined' && selectedObject) {
            objects = [selectedObject];
        }
    }

    if (!objects || objects.length === 0) {
        console.warn("No objects selected for duplication.");
        return;
    }

    const loader = new THREE.ObjectLoader();
    const newObjects = [];

    objects.forEach((obj) => {
        const cloneJSON = obj.toJSON();
        const newObj = loader.parse(cloneJSON);
        newObj.uuid = THREE.MathUtils.generateUUID();
        newObj.position.x += 0.5;
        newObj.position.y += 0.5;

        // Ensure unique name
        let newName = obj.name + "_copy";
        if (typeof scene !== 'undefined') {
            // Simple check, could be more robust
            if (scene.getObjectByName(newName)) {
                newName += "_" + Math.floor(Math.random() * 1000);
            }
        }
        newObj.name = newName;

        addObjectToScene(newObj);
        newObjects.push(newObj);
    });

    clearSelection();
    newObjects.forEach((o) => addToSelection(o));
    if (newObjects.length > 0) selectObject(newObjects[newObjects.length - 1]);
    updateHierarchy();
    console.log(`ðŸ“„ Duplicated ${newObjects.length} object(s).`);
}



function isObjectSelected(obj) {
    return selectedObjects.some((selected) => selected.uuid === obj.uuid);
}
/**
 * Sets the object's pivot point to a new location without moving the object in world space.
 * @param {string} target - 'cursor' or 'world'.
 */
function setOrigin(target) {
    if (!selectedObject) return;

    // We assume you have a 'cursor3D' object in your scene representing the 3D cursor
    // If not, you can create one: const cursor3D = new THREE.Object3D(); scene.add(cursor3D);
    const targetPosition = new THREE.Vector3();
    if (target === "cursor" && window.cursor3D) {
        targetPosition.copy(window.cursor3D.position);
    } else if (target === "world") {
        targetPosition.set(0, 0, 0);
    } else {
        console.warn("Target for Set Origin not found.");
        return;
    }

    // Calculate the vector from the object's current position to the new origin
    const offset = new THREE.Vector3().subVectors(
        targetPosition,
        selectedObject.position
    );

    // Move the geometry in the opposite direction
    selectedObject.geometry.translate(offset.x, offset.y, offset.z);

    // Move the object's mesh to the new origin position
    selectedObject.position.copy(targetPosition);

    recordHistoryAction("Set Origin");
    console.log(`Set origin of ${selectedObject.name} to ${target}.`);
}

// Your existing centerPivot function is 'Origin to Geometry' and fits perfectly here.
// You've already written it as `centerPivot`.

if (typeof THREE === "undefined") {
    global.THREE = {
        Scene: class {
            constructor() {
                this.children = [];
            }
            add(obj) {
                this.children.push(obj);
            }
            remove(obj) {
                this.children = this.children.filter((c) => c !== obj);
            }
            getObjectByProperty(prop, value) {
                return this.children.find((c) => c[prop] === value);
            }
        },
        PerspectiveCamera: class {
            constructor() {
                this.position = { x: 0, y: 0, z: 0 };
                this.lookAt = () => { };
                this.getWorldDirection = (v) => v.set(0, 0, -1);
            }
        },
        AmbientLight: class {
            constructor() { }
        },
        DirectionalLight: class {
            constructor() { }
        },
        Mesh: class {
            constructor(geom, mat) {
                this.geometry = geom;
                this.material = mat;
                this.position = { x: 0, y: 0, z: 0 };
                this.rotation = { x: 0, y: 0, z: 0 };
                this.scale = { x: 1, y: 1, z: 1 };
                this.name = "Mesh";
                this.uuid = Math.random().toString(36).substring(2);
                this.parent = null;
                this.isMesh = true;
                this.visible = true;
                this.userData = {};
            }
            clone() {
                const c = new THREE.Mesh(this.geometry, this.material);
                c.position.copy(this.position);
                c.rotation.copy(this.rotation);
                c.scale.copy(this.scale);
                c.name = this.name;
                c.parent = this.parent;
                c.userData = { ...this.userData };
                return c;
            }
            toJSON() {
                return {
                    metadata: { version: 4.5, type: "Object", generator: "Three.js" },
                    object: {
                        uuid: this.uuid,
                        type: "Mesh",
                        name: this.name,
                        position: [this.position.x, this.position.y, this.position.z],
                        rotation: [
                            this.rotation.x,
                            this.rotation.y,
                            this.rotation.z,
                            "xyz",
                        ],
                        scale: [this.scale.x, this.scale.y, this.scale.z],
                        userData: this.userData,
                    },
                };
            }
        },
        BoxGeometry: class {
            constructor() {
                this.dispose = () => { };
                this.attributes = { position: { count: 8 }, uv: {}, uv2: {} };
            }
        },
        SphereGeometry: class {
            constructor() {
                this.dispose = () => { };
                this.attributes = { position: { count: 32 * 32 * 2 }, uv: {}, uv2: {} };
            }
        },
        CylinderGeometry: class {
            constructor() {
                this.dispose = () => { };
                this.attributes = { position: { count: 32 * 2 }, uv: {}, uv2: {} };
            }
        },
        MeshBasicMaterial: class {
            constructor() {
                this.dispose = () => { };
                this.wireframe = false;
                this.needsUpdate = true;
            }
        },
        MeshLambertMaterial: class {
            constructor() {
                this.dispose = () => { };
                this.wireframe = false;
                this.needsUpdate = true;
            }
        },
        MeshStandardMaterial: class {
            constructor() {
                this.dispose = () => { };
                this.wireframe = false;
                this.needsUpdate = true;
            }
        },
        MeshPhysicalMaterial: class {
            constructor() {
                this.dispose = () => { };
                this.wireframe = false;
                this.needsUpdate = true;
            }
        },
        Group: class {
            constructor() {
                this.children = [];
                this.name = "Group";
                this.uuid = Math.random().toString(36).substring(2);
                this.isGroup = true;
                this.isObject3D = true;
                this.visible = true;
                this.userData = {};
            }
            add(obj) {
                obj.parent = this;
                this.children.push(obj);
            }
            remove(obj) {
                obj.parent = null;
                this.children = this.children.filter((c) => c !== obj);
            }
            clone() {
                const c = new THREE.Group();
                c.name = this.name;
                c.children = this.children.map((ch) => ch.clone());
                c.parent = this.parent;
                c.userData = { ...this.userData };
                return c;
            }
            toJSON() {
                return {
                    metadata: { version: 4.5, type: "Object", generator: "Three.js" },
                    object: {
                        uuid: this.uuid,
                        type: "Group",
                        name: this.name,
                        children: this.children.map((c) => c.toJSON().object),
                        userData: this.userData,
                    },
                };
            }
        },
        Object3D: class {
            constructor() {
                this.uuid = Math.random().toString(36).substring(2);
                this.name = "Object3D";
                this.children = [];
                this.parent = null;
                this.position = { x: 0, y: 0, z: 0 };
                this.rotation = { x: 0, y: 0, z: 0 };
                this.scale = { x: 1, y: 1, z: 1 };
                this.isObject3D = true;
                this.visible = true;
                this.userData = {};
            }
            add(obj) {
                obj.parent = this;
                this.children.push(obj);
            }
            remove(obj) {
                obj.parent = null;
                this.children = this.children.filter((c) => c !== obj);
            }
            traverse(callback) {
                callback(this);
                this.children.forEach((c) => c.traverse(callback));
            }
            clone() {
                const c = new THREE.Object3D();
                c.name = this.name;
                c.children = this.children.map((ch) => ch.clone());
                c.parent = this.parent;
                c.userData = { ...this.userData };
                return c;
            }
            toJSON() {
                return {
                    metadata: { version: 4.5, type: "Object", generator: "Three.js" },
                    object: {
                        uuid: this.uuid,
                        type: "Object3D",
                        name: this.name,
                        children: this.children.map((c) => c.toJSON().object),
                        position: [this.position.x, this.position.y, this.position.z],
                        rotation: [
                            this.rotation.x,
                            this.rotation.y,
                            this.rotation.z,
                            "xyz",
                        ],
                        scale: [this.scale.x, this.scale.y, this.scale.z],
                        userData: this.userData,
                    },
                };
            }
        },
        ObjectLoader: class {
            parse(json) {
                const obj = new THREE.Object3D();
                obj.uuid = json.object.uuid || THREE.MathUtils.generateUUID();
                obj.name = json.object.name;
                obj.type = json.object.type;
                obj.userData = { ...json.object.userData };
                if (json.object.position) {
                    obj.position.x = json.object.position[0];
                    obj.position.y = json.object.position[1];
                    obj.position.z = json.object.position[2];
                }
                if (json.object.children) {
                    json.object.children.forEach((childJson) => {
                        const child = this.parse({ object: childJson });
                        obj.add(child);
                    });
                }
                return obj;
            }
        },
        MathUtils: {
            generateUUID: () =>
                Math.random().toString(36).substring(2) +
                Math.random().toString(36).substring(2),
        },
        Raycaster: class {
            constructor() {
                this.set = () => { };
                this.intersectObject = () => [];
            }
        },
        Vector3: class {
            constructor(x = 0, y = 0, z = 0) {
                this.x = x;
                this.y = y;
                this.z = z;
            }
            clone() {
                return new THREE.Vector3(this.x, this.y, this.z);
            }
            copy(v) {
                this.x = v.x;
                this.y = v.y;
                this.z = v.z;
                return this;
            }
            add(v) {
                this.x += v.x;
                this.y += v.y;
                this.z += v.z;
                return this;
            }
            subVectors(a, b) {
                this.x = a.x - b.x;
                this.y = a.y - b.y;
                this.z = a.z - b.z;
                return this;
            }
            multiplyScalar(s) {
                this.x *= s;
                this.y *= s;
                this.z *= s;
                return this;
            }
            normalize() {
                const len = Math.sqrt(
                    this.x * this.x + this.y * this.y + this.z * this.z
                );
                if (len > 0) {
                    this.x /= len;
                    this.y /= len;
                    this.z /= len;
                }
                return this;
            }
            fromBufferAttribute() {
                return this;
            }
            dot(v) {
                return this.x * v.x + this.y * v.y + this.z * v.z;
            }
            negate() {
                this.x *= -1;
                this.y *= -1;
                this.z *= -1;
                return this;
            }
            applyMatrix4() {
                return this;
            }
            transformDirection() {
                return this;
            }
            set(x, y, z) {
                this.x = x;
                this.y = y;
                this.z = z;
                return this;
            }
        },
        Vector2: class {
            constructor(x = 0, y = 0) {
                this.x = x;
                this.y = y;
            }
            fromBufferAttribute() {
                return this;
            }
        },
        Box3: class {
            constructor() {
                this.min = new THREE.Vector3(-1, -1, -1);
                this.max = new THREE.Vector3(1, 1, 1);
            }
            setFromObject(obj) {
                return this;
            }
            getCenter(v) {
                v.x = (this.min.x + this.max.x) / 2;
                v.y = (this.min.y + this.max.y) / 2;
                v.z = (this.min.z + this.max.z) / 2;
                return v;
            }
            getSize(v) {
                v.x = this.max.x - this.min.x;
                v.y = this.max.y - this.min.y;
                v.z = this.max.z - this.min.z;
                return v;
            }
        },
        Matrix4: class {
            constructor() { }
            makeTranslation() {
                return this;
            }
        },
        CatmullRomCurve3: class {
            constructor(points) {
                this.points = points;
            }
            getPointAt(t) {
                const i = Math.floor(t * (this.points.length - 1));
                return this.points[i] ? this.points[i].clone() : new THREE.Vector3();
            }
            getTangentAt(t) {
                return new THREE.Vector3(1, 0, 0);
            }
        },
        LOD: class {
            constructor() {
                this.levels = [];
                this.position = new THREE.Vector3();
                this.rotation = new THREE.Vector3();
                this.scale = new THREE.Vector3();
            }
            addLevel(obj, dist) {
                this.levels.push({ object: obj, distance: dist });
            }
        },
        WebGLRenderTarget: class {
            constructor() {
                this.texture = {};
            }
        },
        OrthographicCamera: class {
            constructor() {
                this.position = new THREE.Vector3();
                this.lookAt = () => { };
            }
        },
        CanvasTexture: class {
            constructor() {
                this.flipY = false;
            }
        },
        InstancedMesh: class {
            constructor() {
                this.isMesh = true;
                this.isInstancedMesh = true;
            }
            setMatrixAt() { }
        },
    };
}

if (typeof scene === "undefined") {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 5, 10);
    activeCamera = camera;
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    scene.add(new THREE.DirectionalLight(0xffffff, 0.5));
}
if (typeof window.boneVisualizer === "undefined") {
    class CustomBoneVisualizer {
        constructor(scene) {
            this.scene = scene;
            this.visuals = [];
        }
        visualizeSkeleton(object, type) {
            console.log("Visualizing skeleton for", object.name);
            this.clear();
        }
        clear() {
            console.log("Clearing bone visualization.");
        }
    }
    window.boneVisualizer = new CustomBoneVisualizer(scene);
}
if (typeof physicsSystem === "undefined") {
    physicsSystem = {
        setSelectedObject: (obj) =>
            console.log("Physics system selected object:", obj ? obj.name : "none"),
        selectedObject: null,
    };
}
if (typeof transformControls === "undefined") {
    transformControls = {
        object: null,
        attach: (obj) => {
            transformControls.object = obj;
            console.log("Transform controls attached to:", obj ? obj.name : "null");
        },
        detach: () => {
            transformControls.object = null;
            console.log("Transform controls detached.");
        },
        addEventListener: (event, handler) => {
            /* console.log('Adding event listener to transformControls'); */
        },
        removeEventListener: (event, handler) => {
            /* console.log('Removing event listener from transformControls'); */
        },
        needsUpdate: true,
    };
}
