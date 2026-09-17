(() => {
    const STYLE_ID = "mode-context-menu-styles";
    const MENU_ID = "mode-context-menu";

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${MENU_ID} {
                position: fixed;
                display: none;
                min-width: 320px;
                max-width: 420px;
                max-height: min(78vh, 760px);
                overflow: auto;
                padding: 10px;
                border-radius: 14px;
                border: 1px solid rgba(110, 145, 190, 0.28);
                background:
                    linear-gradient(180deg, rgba(34, 39, 48, 0.98), rgba(20, 23, 29, 0.98));
                box-shadow:
                    0 20px 48px rgba(0, 0, 0, 0.45),
                    inset 0 1px 0 rgba(255, 255, 255, 0.04);
                backdrop-filter: blur(14px);
                z-index: 15000;
                color: #e7edf6;
                font-family: "Segoe UI", Tahoma, sans-serif;
            }

            #${MENU_ID}::-webkit-scrollbar {
                width: 10px;
            }

            #${MENU_ID}::-webkit-scrollbar-thumb {
                background: rgba(117, 147, 191, 0.35);
                border-radius: 999px;
            }

            #${MENU_ID} .mcm-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
                padding: 8px 8px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                margin-bottom: 10px;
            }

            #${MENU_ID} .mcm-title {
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: #8dc1ff;
            }

            #${MENU_ID} .mcm-subtitle {
                margin-top: 4px;
                font-size: 12px;
                color: rgba(233, 241, 255, 0.72);
            }

            #${MENU_ID} .mcm-badge {
                flex-shrink: 0;
                padding: 6px 10px;
                border-radius: 999px;
                background: rgba(27, 126, 219, 0.18);
                color: #8dc1ff;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.03em;
            }

            #${MENU_ID} .mcm-section {
                padding: 6px 2px 2px;
            }

            #${MENU_ID} .mcm-section + .mcm-section {
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                margin-top: 8px;
                padding-top: 12px;
            }

            #${MENU_ID} .mcm-section-title {
                padding: 0 6px 8px;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: rgba(190, 206, 231, 0.7);
            }

            #${MENU_ID} .mcm-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
            }

            #${MENU_ID} .mcm-grid.mcm-grid-3 {
                grid-template-columns: repeat(3, minmax(0, 1fr));
            }

            #${MENU_ID} .mcm-item {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                min-height: 42px;
                padding: 10px 12px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.02);
                color: inherit;
                cursor: pointer;
                transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
                text-align: left;
            }

            #${MENU_ID} .mcm-item:hover {
                background: rgba(82, 139, 214, 0.14);
                border-color: rgba(112, 171, 248, 0.4);
                transform: translateY(-1px);
            }

            #${MENU_ID} .mcm-item.is-active {
                background: rgba(0, 119, 255, 0.18);
                border-color: rgba(122, 181, 255, 0.58);
            }

            #${MENU_ID} .mcm-item.is-danger {
                color: #ffc1c1;
                border-color: rgba(255, 94, 94, 0.22);
            }

            #${MENU_ID} .mcm-item.is-danger:hover {
                background: rgba(120, 22, 22, 0.22);
                border-color: rgba(255, 94, 94, 0.45);
            }

            #${MENU_ID} .mcm-item:disabled,
            #${MENU_ID} .mcm-item.is-disabled {
                opacity: 0.42;
                cursor: default;
                transform: none;
                background: rgba(255, 255, 255, 0.02);
            }

            #${MENU_ID} .mcm-icon {
                width: 20px;
                text-align: center;
                font-size: 14px;
                color: #9bc6ff;
                flex-shrink: 0;
            }

            #${MENU_ID} .mcm-copy {
                min-width: 0;
                flex: 1;
            }

            #${MENU_ID} .mcm-label {
                font-size: 13px;
                font-weight: 600;
                color: #edf3fd;
            }

            #${MENU_ID} .mcm-desc {
                margin-top: 2px;
                font-size: 11px;
                color: rgba(215, 226, 242, 0.62);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            #${MENU_ID} .mcm-shortcut {
                flex-shrink: 0;
                margin-left: auto;
                font-size: 11px;
                color: rgba(193, 210, 236, 0.58);
            }

            #${MENU_ID} .mcm-footer {
                margin-top: 10px;
                padding: 10px 8px 4px;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                font-size: 11px;
                line-height: 1.45;
                color: rgba(205, 218, 240, 0.72);
            }
        `;
        document.head.appendChild(style);
    }

    class ModeContextMenu {
        constructor() {
            injectStyles();
            this.root = this.ensureRoot();
            this.boundHide = this.hide.bind(this);
            document.addEventListener("click", this.boundHide);
            window.addEventListener("resize", this.boundHide);
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") this.hide();
            });
        }

        ensureRoot() {
            let root = document.getElementById(MENU_ID);
            if (root) return root;
            root = document.createElement("div");
            root.id = MENU_ID;
            root.addEventListener("click", (event) => event.stopPropagation());
            document.body.appendChild(root);
            return root;
        }

        hide() {
            if (this.root) this.root.style.display = "none";
        }

        show(x, y, spec) {
            if (!this.root || !spec) return;
            this.root.innerHTML = "";
            this.root.appendChild(this.renderHeader(spec));
            (spec.sections || []).forEach((section) => {
                this.root.appendChild(this.renderSection(section));
            });
            if (spec.footer) {
                const footer = document.createElement("div");
                footer.className = "mcm-footer";
                footer.textContent = spec.footer;
                this.root.appendChild(footer);
            }

            this.root.style.display = "block";
            this.root.style.left = "0px";
            this.root.style.top = "0px";

            const rect = this.root.getBoundingClientRect();
            const clampedX = Math.max(12, Math.min(x, window.innerWidth - rect.width - 12));
            const clampedY = Math.max(12, Math.min(y, window.innerHeight - rect.height - 12));

            this.root.style.left = `${clampedX}px`;
            this.root.style.top = `${clampedY}px`;
        }

        renderHeader(spec) {
            const header = document.createElement("div");
            header.className = "mcm-header";
            header.innerHTML = `
                <div>
                    <div class="mcm-title">${spec.title || "Mode Menu"}</div>
                    <div class="mcm-subtitle">${spec.subtitle || ""}</div>
                </div>
                <div class="mcm-badge">${spec.badge || "Active"}</div>
            `;
            return header;
        }

        renderSection(section) {
            const wrapper = document.createElement("div");
            wrapper.className = "mcm-section";

            if (section.title) {
                const title = document.createElement("div");
                title.className = "mcm-section-title";
                title.textContent = section.title;
                wrapper.appendChild(title);
            }

            const grid = document.createElement("div");
            grid.className = `mcm-grid ${section.columns === 3 ? "mcm-grid-3" : ""}`.trim();

            (section.items || []).forEach((item) => {
                if (item.hidden) return;
                grid.appendChild(this.renderItem(item));
            });

            wrapper.appendChild(grid);
            return wrapper;
        }

        renderItem(item) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = [
                "mcm-item",
                item.active ? "is-active" : "",
                item.danger ? "is-danger" : "",
                item.disabled ? "is-disabled" : ""
            ].filter(Boolean).join(" ");

            if (item.disabled) {
                button.disabled = true;
            } else {
                button.addEventListener("click", (event) => {
                    event.stopPropagation();
                    try {
                        item.action?.();
                    } finally {
                        if (item.keepOpen !== true) this.hide();
                    }
                });
            }

            button.innerHTML = `
                <span class="mcm-icon">${item.icon || "•"}</span>
                <span class="mcm-copy">
                    <span class="mcm-label">${item.label}</span>
                    ${item.description ? `<span class="mcm-desc">${item.description}</span>` : ""}
                </span>
                ${item.shortcut ? `<span class="mcm-shortcut">${item.shortcut}</span>` : ""}
            `;
            return button;
        }
    }

    function withSystem(callback) {
        const system = window.UnifiedModelingSystem;
        if (!system) return;
        callback(system);
    }

    function getModelingSelectionCounts(system) {
        if (!system?.editableMesh) {
            return { vertices: 0, edges: 0, faces: 0 };
        }
        return {
            vertices: system.editableMesh.selectedVertices.size,
            edges: system.editableMesh.selectedEdges.size,
            faces: system.editableMesh.selectedFaces.size,
        };
    }

    function getSculptingBrushItems(system) {
        const brushes = [
            ["grab", "✥", "Grab"],
            ["clay", "◔", "Clay"],
            ["inflate", "⬢", "Inflate"],
            ["smooth", "≈", "Smooth"],
            ["flatten", "▭", "Flatten"],
            ["pinch", "◂▸", "Pinch"],
            ["crease", "⚡", "Crease"],
            ["layer", "☷", "Layer"],
            ["draw", "✎", "Draw"],
            ["mask", "◼", "Mask"]
        ];

        return brushes.map(([brush, icon, label]) => ({
            icon,
            label,
            active: system?.brushMode === brush,
            action: () => {
                if (!system) return;
                system.setBrushMode(brush);
                if (window.sculptingManager?.updateBrushDisplay) {
                    window.sculptingManager.updateBrushDisplay(brush);
                } else if (window.updateSculptingStatus) {
                    window.updateSculptingStatus();
                }
            }
        }));
    }

    const menu = new ModeContextMenu();

    window.hideModeContextMenu = () => menu.hide();

    window.showModelingContextMenu = (x, y) => {
        const system = window.UnifiedModelingSystem;
        if (!system?.isEditMode) return;

        const meshName = system.activeMesh?.name || "Editable Mesh";
        const counts = getModelingSelectionCounts(system);
        const selectionCount = system.selectMode === "vertex"
            ? counts.vertices
            : system.selectMode === "edge"
                ? counts.edges
                : counts.faces;

        const hasFaceSelection = counts.faces > 0;
        const hasEdgeSelection = counts.edges > 0;
        const hasVertexSelection = counts.vertices > 0;
        const hasAnySelection = hasFaceSelection || hasEdgeSelection || hasVertexSelection;

        const currentTool = system.activePolygonTool
            ? `Tool: ${system.getPolygonToolLabel?.(system.activePolygonTool) || system.activePolygonTool}`
            : system.activeArchitectureTool
                ? `Arch: ${system.activeArchitectureTool}`
                : `${system.selectMode[0].toUpperCase()}${system.selectMode.slice(1)} Select`;

        menu.show(x, y, {
            title: "Modeling Menu",
            subtitle: `${meshName} • ${selectionCount} selected`,
            badge: currentTool,
            sections: [
                {
                    title: "Selection",
                    columns: 3,
                    items: [
                        {
                            icon: "•",
                            label: "Vertex",
                            active: system.selectMode === "vertex",
                            action: () => window.setSelectionMode?.("vertex")
                        },
                        {
                            icon: "╱",
                            label: "Edge",
                            active: system.selectMode === "edge",
                            action: () => window.setSelectionMode?.("edge")
                        },
                        {
                            icon: "▣",
                            label: "Face",
                            active: system.selectMode === "face",
                            action: () => window.setSelectionMode?.("face")
                        }
                    ]
                },
                {
                    title: "Polygon Tools",
                    items: [
                        {
                            icon: "⬒",
                            label: "Extrude",
                            shortcut: "E",
                            disabled: !hasFaceSelection,
                            description: "Push selected faces outward.",
                            action: () => window.extrudeSelection?.()
                        },
                        {
                            icon: "⌁",
                            label: "Bevel",
                            shortcut: "Ctrl+B",
                            active: system.activePolygonTool === "bevel",
                            disabled: !(hasEdgeSelection || hasFaceSelection),
                            description: "Chamfer selected edges or faces.",
                            action: () => window.activatePolygonTool?.("bevel")
                        },
                        {
                            icon: "⊞",
                            label: "Loop Cut",
                            shortcut: "Ctrl+R",
                            active: system.activePolygonTool === "loopcut",
                            disabled: !system.editableMesh?.edges?.length,
                            description: "Insert a new edge ring with preview.",
                            action: () => window.activatePolygonTool?.("loopcut")
                        },
                        {
                            icon: "▢",
                            label: "Inset",
                            active: system.activePolygonTool === "inset",
                            disabled: !hasFaceSelection,
                            description: "Create an inset region from faces.",
                            action: () => window.activatePolygonTool?.("inset")
                        },
                        {
                            icon: "⋈",
                            label: "Bridge",
                            active: system.activePolygonTool === "bridge",
                            disabled: !hasEdgeSelection,
                            description: "Bridge selected open edges.",
                            action: () => window.activatePolygonTool?.("bridge")
                        },
                        {
                            icon: "▦",
                            label: "Subdivide",
                            description: "Add more geometry to the selection.",
                            action: () => window.applySubdivision?.()
                        },
                        {
                            icon: "⇢",
                            label: "Merge",
                            disabled: !hasAnySelection,
                            description: "Merge selected components.",
                            action: () => window.mergeActiveGeometry?.()
                        },
                        {
                            icon: "✕",
                            label: "Delete Selection",
                            danger: true,
                            disabled: !hasAnySelection,
                            description: "Delete selected vertices, edges, or faces.",
                            action: () => withSystem((activeSystem) => activeSystem.deleteSelection())
                        }
                    ]
                },
                {
                    title: "Architecture",
                    items: [
                        { icon: "▥", label: "Wall", active: system.activeArchitectureTool === "wall", action: () => window.toggleArchTool?.("wall") },
                        { icon: "▣", label: "Room", active: system.activeArchitectureTool === "room", action: () => window.toggleArchTool?.("room") },
                        { icon: "🚪", label: "Door", active: system.activeArchitectureTool === "door", action: () => window.toggleArchTool?.("door") },
                        { icon: "🪟", label: "Window", active: system.activeArchitectureTool === "window", action: () => window.toggleArchTool?.("window") },
                        { icon: "▤", label: "Column", active: system.activeArchitectureTool === "column", action: () => window.toggleArchTool?.("column") },
                        { icon: "≣", label: "Stairs", active: system.activeArchitectureTool === "stairs", action: () => window.toggleArchTool?.("stairs") },
                        { icon: "△", label: "Terrain", active: system.activeArchitectureTool === "terrain", action: () => window.toggleArchTool?.("terrain") }
                    ]
                },
                {
                    title: "Session",
                    items: [
                        {
                            icon: "↶",
                            label: "Undo",
                            shortcut: "Ctrl+Z",
                            description: "Undo the last modeling action.",
                            action: () => window.historyManager?.undo?.()
                        },
                        {
                            icon: "↷",
                            label: "Redo",
                            shortcut: "Ctrl+Y",
                            description: "Redo the last undone action.",
                            action: () => window.historyManager?.redo?.()
                        },
                        {
                            icon: "⨯",
                            label: "Exit Modeling",
                            danger: true,
                            description: "Leave edit mode for this mesh.",
                            action: () => window.toggleModelingMode?.(false)
                        }
                    ]
                }
            ],
            footer: system.architectureMessage || "Right-click gives you fast access to the current modeling workflow."
        });
    };

    window.showSculptingContextMenu = (x, y) => {
        const system = window.sculptingSystem;
        const selectedMesh = window.selectedObject?.isMesh ? window.selectedObject : null;
        const meshName = system?.currentMesh?.name || selectedMesh?.name || "No mesh selected";
        const isActive = !!system?.isActive;

        menu.show(x, y, {
            title: "Sculpting Menu",
            subtitle: `${meshName} • ${isActive ? "brush workflow active" : "ready to activate"}`,
            badge: isActive ? ((system.brushMode || "brush").toUpperCase()) : "Inactive",
            sections: [
                {
                    title: "Session",
                    items: [
                        {
                            icon: "▶",
                            label: "Activate Sculpting",
                            disabled: !selectedMesh,
                            description: "Start sculpting on the selected mesh.",
                            action: () => {
                                if (!selectedMesh || !window.sculptingSystem) return;
                                window.sculptingSystem.activateSculpting(selectedMesh);
                                window.updateSculptingStatus?.();
                            }
                        },
                        {
                            icon: "■",
                            label: "Deactivate",
                            danger: true,
                            disabled: !isActive,
                            description: "Leave sculpt mode and restore normal selection.",
                            action: () => {
                                window.sculptingSystem?.deactivateSculpting?.();
                                window.updateSculptingStatus?.();
                            }
                        },
                        {
                            icon: "↶",
                            label: "Undo",
                            shortcut: "Ctrl+Z",
                            disabled: !window.historyManager,
                            action: () => window.historyManager?.undo?.()
                        },
                        {
                            icon: "↷",
                            label: "Redo",
                            shortcut: "Ctrl+Y",
                            disabled: !window.historyManager,
                            action: () => window.historyManager?.redo?.()
                        }
                    ]
                },
                {
                    title: "Brushes",
                    columns: 2,
                    items: getSculptingBrushItems(system).map((item) => ({
                        ...item,
                        disabled: !isActive
                    }))
                },
                {
                    title: "Effects",
                    items: [
                        {
                            icon: "≈",
                            label: "Global Smooth",
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.applyGlobalSmooth?.(3, 0.6)
                        },
                        {
                            icon: "⚡",
                            label: "Hardness Contrast",
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.applyHardnessContrast?.()
                        },
                        {
                            icon: "◫",
                            label: "Angle Preserve",
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.applyAnglePreservingSmooth?.(2, 0.5)
                        },
                        {
                            icon: "◼",
                            label: "Clear Mask",
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.clearMask?.()
                        },
                        {
                            icon: "⬇",
                            label: "Extract Mask",
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.extractMaskedGeometry?.(0.02)
                        },
                        {
                            icon: "↺",
                            label: "Reset Sculpt",
                            danger: true,
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.resetToOriginal?.()
                        }
                    ]
                },
                {
                    title: "Symmetry",
                    columns: 3,
                    items: [
                        {
                            icon: system?.symmetryEnabled ? "✓" : "○",
                            label: system?.symmetryEnabled ? "Disable" : "Enable",
                            disabled: !isActive,
                            action: () => {
                                if (!window.sculptingSystem) return;
                                window.sculptingSystem.setSymmetry(!window.sculptingSystem.symmetryEnabled);
                                window.updateSculptingStatus?.();
                            }
                        },
                        {
                            icon: "X",
                            label: "Axis X",
                            active: system?.symmetryAxis === "x",
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.setSymmetryAxis?.("x")
                        },
                        {
                            icon: "Y",
                            label: "Axis Y",
                            active: system?.symmetryAxis === "y",
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.setSymmetryAxis?.("y")
                        },
                        {
                            icon: "Z",
                            label: "Axis Z",
                            active: system?.symmetryAxis === "z",
                            disabled: !isActive,
                            action: () => window.sculptingSystem?.setSymmetryAxis?.("z")
                        }
                    ]
                }
            ],
            footer: isActive
                ? `Brush Size ${Number(system.brushSize || 0).toFixed(2)} • Strength ${Number(system.brushStrength || 0).toFixed(2)} • Falloff ${Number(system.brushFalloff || 0).toFixed(2)}`
                : "Select a mesh first, then activate sculpting to unlock brush tools."
        });
    };
})();
