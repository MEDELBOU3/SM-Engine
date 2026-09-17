// AssetsPanelUIEventsLayout.js
// DOM events, panel/pane resize, layout persistence
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelUIEventsLayoutMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelUIEventsLayoutMixin {
    static _setupEventListeners() {
        this._setupPaneResizers();
        this._refreshDOMCache();
        this._bindCurrentImportInputs();

        // Upload zone drag for files (and basic folder detection)
        if (this.dom.uploadZone) {
            this.dom.uploadZone.ondragover = (e) => {
                e.preventDefault();
                this.dom.uploadZone.classList.add("dragover");
            };
            this.dom.uploadZone.ondragleave = () =>
                this.dom.uploadZone.classList.remove("dragover");
            this.dom.uploadZone.ondrop = async (e) => {
                e.preventDefault();
                this.dom.uploadZone.classList.remove("dragover");

                const droppedItems = Array.from(e.dataTransfer.items || []);
                const files = Array.from(e.dataTransfer.files || []);

                const hasDirectory = droppedItems.some(
                    (item) =>
                        item.webkitGetAsEntry && item.webkitGetAsEntry().isDirectory,
                );

                if (hasDirectory) {
                    alert(
                        "Folder drop is not supported for drag-and-drop directly into the dropzone. Please use the 'Browse Folder' button to import directories.",
                    );
                    this.hideUploadZone();
                    return;
                }

                for (const file of files) {
                    if (file.webkitRelativePath) {
                        const pathSegments = file.webkitRelativePath.split("/");
                        pathSegments.pop();
                        const folderPath = pathSegments.join("/");
                        const targetFolderId = this._ensureFolderPath(
                            folderPath,
                            this.openFolderId,
                        );
                        await this._addAssetFromFile(file, targetFolderId);
                    } else {
                        await this._addAssetFromFile(file, this.openFolderId);
                    }
                }
                this.hideUploadZone();
            };
        }

        // Single/multi file input (static in HTML)
        if (this.dom.uploadInput) {
            this.dom.uploadInput.onchange = async (e) => {
                const files = Array.from(e.target.files);
                for (const file of files) {
                    await this._addAssetFromFile(file, this.openFolderId);
                }
                this.hideUploadZone();
                e.target.value = ""; // Clear input value
            };
        }

        // Folder input (static in HTML)
        if (this.dom.uploadFolderInput) {
            this.dom.uploadFolderInput.onchange = async (e) => {
                await this._addAssetsFromFolderInput(
                    Array.from(e.target.files),
                    this.openFolderId,
                );
                this.hideUploadZone();
                e.target.value = ""; // Clear input value
            };
        }

        // Native Assets grid context menu. Folder/asset cards stop propagation,
        // so this handler only handles empty grid space.
        if (this.dom.grid) {
            this.dom.grid.oncontextmenu = (e) => {
                if (e.target.closest(".asset-item")) return;
                e.preventDefault();
                e.stopPropagation();
                this._showEmptyGridContextMenu(e);
            };
        }

        // Renderer drag/drop -> add to scene or apply material/texture - MODIFIED: Passes event to _addToScene
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.ondragover = (e) => e.preventDefault();
            this.renderer.domElement.ondrop = (e) => {
                e.preventDefault();
                try {
                    const data = JSON.parse(e.dataTransfer.getData("application/json"));
                    if (data && data.assetId) this._addToScene(data.assetId, e); // Pass event for drop target checking
                } catch (err) {
                    /* ignore invalid drops */
                }
            };
        }

        // Whole-panel height resizing is handled by _setupPanelHeightResize().
        // The old mouse-only header handler was removed because the professional
        // UI can rebuild the header and leave a stale DOM reference.

        // Global click: close Assets context menu ONLY when clicking outside
        // any context-menu surface. The old unconditional hide killed submenu
        // interactions on every click.
        document.addEventListener("click", (e) => {
            const insideAnyContextMenu =
                !!e.target.closest(
                    "#contextMenu, #__sm_ctx_root, .context-menu, .sm-context-menu, [data-sm-context-menu='true']"
                );

            if (!insideAnyContextMenu) {
                this._hideNativeContextMenu?.();
            }

            if (
                this.dom.panel &&
                !this.dom.panel.contains(e.target) &&
                !insideAnyContextMenu
            ) {
                if (
                    this.renderer &&
                    this.renderer.domElement &&
                    this.renderer.domElement.contains(e.target)
                ) {
                    // Do nothing, assume user is interacting with the 3D scene
                } else {
                    this.selectAsset(null, null, false, null); // Deselect all assets
                }
            }
        });

        document.querySelectorAll(".view-mode-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                // Remove active from all buttons
                document
                    .querySelectorAll(".view-mode-btn")
                    .forEach((b) => b.classList.remove("active"));
                // Add active to clicked one
                btn.classList.add("active");

                const mode = btn.dataset.mode;
                const gridEl = document.getElementById("assetsGrid");

                if (mode === "list") {
                    gridEl.classList.add("list-view");
                } else {
                    gridEl.classList.remove("list-view");
                }

                // Optional: re-render to better adapt item content in list mode
                AssetsPanel.render();
            });
        });

        // Keyboard shortcuts - MODIFIED: Added multi-tagging shortcut
        document.addEventListener("keydown", (e) => {
            const isPanelActive =
                this.dom.panel.contains(document.activeElement) ||
                this.dom.panel.classList.contains("visible");

            if (isPanelActive) {
                if (e.key === "Delete") {
                    if (this.selectedIds.size) {
                        e.preventDefault();
                        this.deleteAsset();
                    }
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
                    e.preventDefault();
                    this._selectAllInView();
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
                    if (this.selectedIds.size) {
                        const names = Array.from(this.selectedIds)
                            .map((id) => (this._findById(id) || {}).name)
                            .filter(Boolean)
                            .join("\n");
                        navigator.clipboard.writeText(names).catch(() => { });
                    }
                }
                // NEW: Multi-tagging shortcut (Ctrl+T)
                if (
                    (e.ctrlKey || e.metaKey) &&
                    e.key.toLowerCase() === "t" &&
                    this.selectedIds.size > 1
                ) {
                    e.preventDefault();
                    this._promptMultiTag();
                }
            }
        });

        document.addEventListener('click', e => {
            const modal = document.getElementById('dependencyGraphModal');
            if (!modal) return;

            if (e.target === modal || e.target.classList.contains('modal-close-btn')) {
                modal.style.display = 'none';
                // Optional: destroy network instance if you want to clean up memory
                // if (window.currentGraphNetwork) window.currentGraphNetwork.destroy();
            }
        });

        // Folder sidebar dblclick -> open (unchanged)
        if (this.dom.categoriesContainer) {
            this.dom.categoriesContainer.addEventListener("dblclick", (e) => {
                const node = e.target.closest(".category-item");
                if (!node) return;
                const id = node.dataset.folderId;
                if (id === "") {
                    this.openFolderId = null;
                    this.currentCategory = "project";
                } else if (id) {
                    this.openFolderId = id;
                    this.currentCategory = "project";
                }
                document
                    .querySelectorAll(".category-item.active")
                    .forEach((c) => c.classList.remove("active"));
                node.classList.add("active");
                this.render();
            });
        }

        // Thumbnail size slider (unchanged)
        if (this.dom.thumbnailSizeSlider) {
            this.dom.thumbnailSizeSlider.value = this.currentThumbnailSize;
            this.dom.thumbnailSizeSlider.oninput = (e) =>
                this.setThumbnailSize(e.target.value);
        }

        // NEW: Tag Cloud click handler
        if (this.dom.tagCloudContainer) {
            this.dom.tagCloudContainer.addEventListener("click", (e) => {
                const tagBtn = e.target.closest(".tag-cloud-tag");
                if (tagBtn) {
                    const tag = tagBtn.dataset.tag;
                    this.dom.searchBox.value = tag; // Put tag in search box
                    this.render(tag.toLowerCase()); // Filter by tag
                }
            });
        }
    }

    // ------------------------------------------------------------------
    // Whole Content Browser height resize
    // ------------------------------------------------------------------
    static _getPanelHeightBounds() {
        const minHeight = Math.max(
            180,
            Number(this.panelMinHeight) || 220,
        );

        const viewportHeight = Math.max(
            minHeight,
            window.innerHeight ||
            document.documentElement.clientHeight ||
            800,
        );

        const maxHeight = Math.max(
            minHeight,
            Math.floor(
                viewportHeight *
                (Number(this.panelMaxViewportRatio) || 0.86),
            ),
        );

        return {
            minHeight,
            maxHeight,
        };
    }

    static _clampPanelHeight(value) {
        const { minHeight, maxHeight } =
            this._getPanelHeightBounds();

        const numeric = Number(value);

        if (!Number.isFinite(numeric)) {
            return minHeight;
        }

        return Math.min(
            maxHeight,
            Math.max(minHeight, numeric),
        );
    }

    static _ensurePanelHeightResizer() {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        if (!panel) return null;

        let handle =
            panel.querySelector(
                ":scope > .assets-panel-height-resizer",
            );

        if (!handle) {
            handle = document.createElement("div");
            handle.className =
                "assets-panel-height-resizer";
            handle.setAttribute("role", "separator");
            handle.setAttribute(
                "aria-orientation",
                "horizontal",
            );
            handle.setAttribute(
                "aria-label",
                "Resize Content Browser height",
            );
            handle.tabIndex = -1;

            // Inline fallback makes resize work even if an older AssetsPanel CSS
            // is still loaded or another stylesheet overrides the panel shell.
            Object.assign(handle.style, {
                position: "absolute",
                top: "0",
                left: "0",
                right: "0",
                height: "8px",
                zIndex: "60",
                cursor: "ns-resize",
                touchAction: "none",
                userSelect: "none",
                background: "transparent",
            });

            panel.prepend(handle);
        }

        this.dom.heightResizer = handle;
        return handle;
    }

    static _publishPanelHeightResize(height) {
        document.documentElement.style.setProperty(
            "--assets-panel-height",
            `${Math.round(height)}px`,
        );

        cancelAnimationFrame(
            this.panelResizeRAF || 0,
        );

        this.panelResizeRAF =
            requestAnimationFrame(() => {
                this.panelResizeRAF = 0;

                window.dispatchEvent(
                    new CustomEvent(
                        "sm-assets-panel-resized",
                        {
                            detail: {
                                panel: this.dom.panel,
                                height:
                                    Math.round(height),
                            },
                        },
                    ),
                );
            });
    }

    static _setPanelHeight(
        height,
        {
            persist = false,
            important = true,
        } = {},
    ) {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        if (!panel) return 0;

        const nextHeight =
            this._clampPanelHeight(height);

        panel.style.setProperty(
            "height",
            `${nextHeight}px`,
            important ? "important" : "",
        );

        // Remove any browser-native vertical resize rule if another stylesheet
        // adds it. The SM Engine resize system owns the height.
        panel.style.resize = "none";

        if (persist) {
            try {
                localStorage.setItem(
                    this.panelHeightKey,
                    String(Math.round(nextHeight)),
                );
            } catch (_) { }
        }

        this._publishPanelHeightResize(
            nextHeight,
        );

        return nextHeight;
    }

    static _restorePanelHeight() {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        if (!panel) return false;

        let stored = NaN;

        try {
            stored = parseFloat(
                localStorage.getItem(
                    this.panelHeightKey,
                ) || "",
            );
        } catch (_) { }

        if (
            Number.isFinite(stored) &&
            stored > 0
        ) {
            this._setPanelHeight(stored, {
                persist: false,
                important: true,
            });
            return true;
        }

        return false;
    }

    static resetPanelHeight() {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        if (!panel) return;

        try {
            localStorage.removeItem(
                this.panelHeightKey,
            );
        } catch (_) { }

        panel.style.removeProperty("height");
        panel.style.removeProperty("resize");

        // Publish the computed CSS default when the panel is visible.
        requestAnimationFrame(() => {
            const height =
                panel.getBoundingClientRect()
                    .height;

            if (height > 0) {
                this._publishPanelHeightResize(
                    height,
                );
            }
        });
    }

    static _setupPanelHeightResize() {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        const header = this.dom.header;
        const handle =
            this._ensurePanelHeightResizer();

        if (!panel || !handle) return;

        const beginResize = (
            event,
            source = "handle",
        ) => {
            if (
                event.button !== undefined &&
                event.button !== 0
            ) {
                return;
            }

            // Header dragging is useful, but controls/search/buttons must remain
            // clickable. The dedicated top handle has no such exclusions.
            if (
                source === "header" &&
                event.target.closest(
                    [
                        "button",
                        "input",
                        "select",
                        "textarea",
                        "label",
                        "a",
                        ".assets-panel-controls",
                        ".cb-toolbar-right",
                        ".view-mode-toggle",
                    ].join(","),
                )
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const startHeight =
                panel.getBoundingClientRect()
                    .height;

            if (startHeight <= 0) return;

            this.panelResizeState = {
                pointerId:
                    event.pointerId ?? null,
                startY: event.clientY,
                startHeight,
                source,
            };

            document.body.classList.add(
                "assets-panel-height-resizing",
            );

            document.body.style.userSelect =
                "none";
            document.body.style.cursor =
                "ns-resize";

            handle.classList.add(
                "is-active",
            );

            if (
                event.pointerId !== undefined &&
                typeof handle.setPointerCapture ===
                "function" &&
                source === "handle"
            ) {
                try {
                    handle.setPointerCapture(
                        event.pointerId,
                    );
                } catch (_) { }
            }

            const onMove = (moveEvent) => {
                if (!this.panelResizeState) {
                    return;
                }

                // Panel is docked to bottom:
                // moving the pointer upward increases its height.
                const deltaY =
                    this.panelResizeState.startY -
                    moveEvent.clientY;

                this._setPanelHeight(
                    this.panelResizeState
                        .startHeight + deltaY,
                    {
                        persist: false,
                        important: true,
                    },
                );
            };

            const onEnd = () => {
                if (!this.panelResizeState) {
                    return;
                }

                const finalHeight =
                    panel.getBoundingClientRect()
                        .height;

                this._setPanelHeight(
                    finalHeight,
                    {
                        persist: true,
                        important: true,
                    },
                );

                this.panelResizeState = null;

                handle.classList.remove(
                    "is-active",
                );

                document.body.classList.remove(
                    "assets-panel-height-resizing",
                );

                document.body.style.userSelect =
                    "";
                document.body.style.cursor =
                    "";

                window.removeEventListener(
                    "pointermove",
                    onMove,
                    true,
                );
                window.removeEventListener(
                    "pointerup",
                    onEnd,
                    true,
                );
                window.removeEventListener(
                    "pointercancel",
                    onEnd,
                    true,
                );
            };

            window.addEventListener(
                "pointermove",
                onMove,
                true,
            );
            window.addEventListener(
                "pointerup",
                onEnd,
                true,
            );
            window.addEventListener(
                "pointercancel",
                onEnd,
                true,
            );
        };

        if (
            handle.dataset
                .panelHeightResizeBound !==
            "true"
        ) {
            handle.addEventListener(
                "pointerdown",
                (event) =>
                    beginResize(
                        event,
                        "handle",
                    ),
            );

            handle.addEventListener(
                "dblclick",
                (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.resetPanelHeight();
                },
            );

            handle.addEventListener(
                "pointerenter",
                () => {
                    handle.style.background =
                        "rgba(130, 163, 203, 0.24)";
                },
            );

            handle.addEventListener(
                "pointerleave",
                () => {
                    if (
                        !this.panelResizeState
                    ) {
                        handle.style.background =
                            "transparent";
                    }
                },
            );

            handle.dataset.panelHeightResizeBound =
                "true";
        }

        if (
            header &&
            header.dataset
                .panelHeightResizeBound !==
            "true"
        ) {
            header.addEventListener(
                "pointerdown",
                (event) =>
                    beginResize(
                        event,
                        "header",
                    ),
            );

            header.dataset.panelHeightResizeBound =
                "true";
        }

        if (
            document.documentElement.dataset
                .assetsPanelWindowResizeBound !==
            "true"
        ) {
            window.addEventListener(
                "resize",
                () => {
                    const activePanel =
                        document.getElementById(
                            "assetsPanel",
                        );

                    if (!activePanel) return;

                    const inlineHeight =
                        parseFloat(
                            activePanel.style.height ||
                            "",
                        );

                    if (
                        Number.isFinite(
                            inlineHeight,
                        )
                    ) {
                        this._setPanelHeight(
                            inlineHeight,
                            {
                                persist: true,
                                important: true,
                            },
                        );
                    }
                },
                {
                    passive: true,
                },
            );

            document.documentElement.dataset.assetsPanelWindowResizeBound =
                "true";
        }
    }

    static _ensurePaneResizers() {
        if (!this.dom.content || !this.dom.categoriesContainer || !this.dom.gridPane) return;

        let leftResizer = this.dom.content.querySelector(".assets-pane-resizer-left");
        if (!leftResizer) {
            leftResizer = document.createElement("div");
            leftResizer.className = "assets-pane-resizer assets-pane-resizer-left";
            leftResizer.setAttribute("role", "separator");
            leftResizer.setAttribute("aria-orientation", "vertical");
            leftResizer.setAttribute("aria-label", "Resize asset sources panel");
            this.dom.categoriesContainer.insertAdjacentElement("afterend", leftResizer);
        }

        if (this.dom.propertiesPanel) {
            let rightResizer = this.dom.content.querySelector(".assets-pane-resizer-right");
            if (!rightResizer) {
                rightResizer = document.createElement("div");
                rightResizer.className = "assets-pane-resizer assets-pane-resizer-right";
                rightResizer.setAttribute("role", "separator");
                rightResizer.setAttribute("aria-orientation", "vertical");
                rightResizer.setAttribute("aria-label", "Resize asset details panel");
                this.dom.propertiesPanel.insertAdjacentElement("beforebegin", rightResizer);
            }
        }
    }

    static _restorePaneLayout() {
        const applyWidth = (key, element) => {
            if (!element) return;
            const stored = parseFloat(localStorage.getItem(key) || "");
            if (Number.isFinite(stored) && stored > 0) {
                element.style.flex = `0 0 ${stored}px`;
            }
        };

        applyWidth(this.paneLayoutKeys.sidebar, this.dom.categoriesContainer);
        applyWidth(this.paneLayoutKeys.properties, this.dom.propertiesPanel);
    }

    static _setupPaneResizers() {
        const bindHandle = (selector, pane, side) => {
            const handle = this.dom.content?.querySelector(selector);
            if (!handle || !pane || handle.dataset.resizeBound === "true") return;

            handle.addEventListener("pointerdown", (event) => {
                if (event.button !== 0 || !this.dom.content) return;

                const contentRect = this.dom.content.getBoundingClientRect();
                const currentPaneRect = pane.getBoundingClientRect();
                const sidebarWidth = this.dom.categoriesContainer?.getBoundingClientRect().width || 0;
                const propertiesWidth = this.dom.propertiesPanel?.getBoundingClientRect().width || 0;
                const handleCount = this.dom.content.querySelectorAll(".assets-pane-resizer").length;
                const handleAllowance = handleCount * 12;
                const gridMinWidth = 360;
                const minWidth = side === "left" ? 180 : 220;
                const otherPaneWidth = side === "left" ? propertiesWidth : sidebarWidth;
                const maxWidth = Math.max(minWidth, contentRect.width - otherPaneWidth - gridMinWidth - handleAllowance);

                this.paneResizeState = {
                    handle,
                    pane,
                    side,
                    startX: event.clientX,
                    startWidth: currentPaneRect.width,
                    minWidth,
                    maxWidth,
                };

                handle.classList.add("is-active");
                document.body.classList.add("assets-pane-resizing");
                if (typeof handle.setPointerCapture === "function") {
                    handle.setPointerCapture(event.pointerId);
                }

                const onMove = (moveEvent) => {
                    if (!this.paneResizeState) return;
                    const deltaX = moveEvent.clientX - this.paneResizeState.startX;
                    const direction = this.paneResizeState.side === "left" ? 1 : -1;
                    const nextWidth = Math.min(
                        Math.max(this.paneResizeState.startWidth + deltaX * direction, this.paneResizeState.minWidth),
                        this.paneResizeState.maxWidth,
                    );
                    this.paneResizeState.pane.style.flex = `0 0 ${nextWidth}px`;
                };

                const onEnd = () => {
                    if (!this.paneResizeState) return;
                    const { pane: activePane, side: activeSide, handle: activeHandle } = this.paneResizeState;
                    const storageKey = activeSide === "left" ? this.paneLayoutKeys.sidebar : this.paneLayoutKeys.properties;
                    localStorage.setItem(storageKey, `${Math.round(activePane.getBoundingClientRect().width)}`);
                    activeHandle.classList.remove("is-active");
                    document.body.classList.remove("assets-pane-resizing");
                    this.paneResizeState = null;
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onEnd);
                    window.removeEventListener("pointercancel", onEnd);
                };

                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onEnd);
                window.addEventListener("pointercancel", onEnd);
            });

            handle.addEventListener("dblclick", () => {
                pane.style.flex = "";
                const storageKey = side === "left" ? this.paneLayoutKeys.sidebar : this.paneLayoutKeys.properties;
                localStorage.removeItem(storageKey);
            });

            handle.dataset.resizeBound = "true";
        };

        bindHandle(".assets-pane-resizer-left", this.dom.categoriesContainer, "left");
        bindHandle(".assets-pane-resizer-right", this.dom.propertiesPanel, "right");
    }

    // ------------------------------------------------------------------
    // Asset ingestion and thumbnails - MODIFIED: For history, references, auto-tagging
    // ------------------------------------------------------------------
}
for(const key of Reflect.ownKeys(SMAssetsPanelUIEventsLayoutMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelUIEventsLayoutMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelUIEventsLayout");
})(window);
