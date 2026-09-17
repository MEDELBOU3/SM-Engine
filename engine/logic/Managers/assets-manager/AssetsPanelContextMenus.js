// AssetsPanelContextMenus.js
// Native context menu, move/copy/delete/export helpers
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelContextMenusMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelContextMenusMixin {
    static _ctxEnsureStyles() {
        if (document.getElementById("assets-native-context-v2-styles")) return;

        const style = document.createElement("style");
        style.id = "assets-native-context-v2-styles";
        style.textContent = `
            #contextMenu.assets-native-context-v2 {
                position: fixed !important;
                display: none;
                min-width: 190px;
                max-width: 250px;
                padding: 4px 0;
                margin: 0;
                overflow: visible !important;
                z-index: 100100 !important;
                background: var(--panel-bg, #333333);
                border: 1px solid var(--border-color, #4d4d4d81);
                border-radius: 3px;
                box-shadow: var(--panel-shadow-pro, 0 10px 22px rgba(0,0,0,.26));
                color: var(--text-primary, #ffffff);
                font-family: var(--ui-font, "Segoe UI", Arial, sans-serif);
                font-size: 11px;
                user-select: none;
            }

            #contextMenu.assets-native-context-v2 .apctx-search {
                padding: 4px 6px 5px;
                border-bottom: 1px solid var(--border-color, #4d4d4d81);
                background: var(--header-bg, #3c3c3c);
            }

            #contextMenu.assets-native-context-v2 .apctx-search input {
                width: 100%;
                box-sizing: border-box;
                height: 24px;
                padding: 0 7px;
                border: 1px solid var(--input-border, #565656);
                border-radius: 2px;
                outline: none;
                background: var(--input-bg, #333333);
                color: var(--text-primary, #ffffff);
                font: inherit;
            }

            #contextMenu.assets-native-context-v2 .apctx-search input::placeholder {
                color: var(--text-muted, #8e8e96);
            }

            #contextMenu.assets-native-context-v2 .apctx-search input:focus {
                border-color: var(--input-focus-border, #555555);
            }

            #contextMenu.assets-native-context-v2 .apctx-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                min-height: 26px;
                padding: 3px 8px;
                color: var(--text-secondary, #b0b0b0);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: .055em;
                text-transform: uppercase;
            }

            #contextMenu.assets-native-context-v2 .apctx-header-title {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #contextMenu.assets-native-context-v2 .apctx-badge {
                flex: 0 0 auto;
                padding: 1px 4px;
                border-radius: 2px;
                background: var(--accent-blue-dark, #474747);
                color: var(--text-primary, #ffffff);
                font-size: 8px;
                letter-spacing: .025em;
            }

            #contextMenu.assets-native-context-v2 .apctx-item {
                position: relative;
                display: grid;
                grid-template-columns: 16px minmax(0,1fr) auto auto;
                align-items: center;
                gap: 6px;
                min-height: 28px;
                padding: 0 8px;
                box-sizing: border-box;
                color: var(--text-primary, #ffffff);
                cursor: default;
                overflow: visible !important;
                white-space: nowrap;
            }

            #contextMenu.assets-native-context-v2 .apctx-item:hover,
            #contextMenu.assets-native-context-v2 .apctx-item.submenu-open {
                background: var(--hover-bg, #474747);
            }

            #contextMenu.assets-native-context-v2 .apctx-item.is-disabled {
                opacity: .42;
                pointer-events: none;
            }

            #contextMenu.assets-native-context-v2 .apctx-item.is-danger {
                color: var(--text-primary, #ffffff);
            }

            #contextMenu.assets-native-context-v2 .apctx-icon {
                width: 14px;
                height: 14px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: var(--text-secondary, #b0b0b0);
            }

            #contextMenu.assets-native-context-v2 .apctx-icon svg,
            #contextMenu.assets-native-context-v2 .apctx-caret svg {
                width: 13px;
                height: 13px;
                display: block;
            }

            #contextMenu.assets-native-context-v2 .apctx-label {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            #contextMenu.assets-native-context-v2 .apctx-shortcut {
                color: var(--text-muted, #8e8e96);
                font-size: 9px;
                padding-left: 8px;
            }

            #contextMenu.assets-native-context-v2 .apctx-caret {
                width: 12px;
                height: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: var(--text-muted, #8e8e96);
            }

            #contextMenu.assets-native-context-v2 .apctx-separator {
                height: 1px;
                margin: 4px 0;
                background: var(--border-color, #4d4d4d81);
            }

            #contextMenu.assets-native-context-v2 .apctx-submenu {
                position: absolute;
                left: calc(100% + 4px);
                top: -4px;
                display: none;
                min-width: 205px;
                max-width: 280px;
                padding: 4px 0;
                overflow: visible !important;
                z-index: 100110 !important;
                background: var(--panel-bg, #333333);
                border: 1px solid var(--border-color, #4d4d4d81);
                border-radius: 3px;
                box-shadow: var(--panel-shadow-pro, 0 10px 22px rgba(0,0,0,.26));
            }

            #contextMenu.assets-native-context-v2 .apctx-item.submenu-open > .apctx-submenu {
                display: block !important;
            }
        `;

        document.head.appendChild(style);
    }

    static _ctxSvg(name = "dot") {
        const common =
            `viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
            `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;

        const icons = {
            dot: `<svg ${common}><circle cx="12" cy="12" r="2.5"/></svg>`,
            folder: `<svg ${common}><path d="M3 7.5h7l2 2h9v9.5H3z"/><path d="M3 7.5V5h6l2 2.5"/></svg>`,
            open: `<svg ${common}><path d="M3 8h7l2 2h9l-2 9H5z"/><path d="M3 8V5h6l2 3"/></svg>`,
            game: `<svg ${common}><path d="M7.5 8h9a4.5 4.5 0 0 1 4.1 6.3l-1 2.3a2 2 0 0 1-3.1.8L14.8 16H9.2l-1.7 1.4a2 2 0 0 1-3.1-.8l-1-2.3A4.5 4.5 0 0 1 7.5 8z"/><path d="M8 11v4M6 13h4"/><circle cx="16.5" cy="12" r=".6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="14" r=".6" fill="currentColor" stroke="none"/></svg>`,
            plus: `<svg ${common}><path d="M12 5v14M5 12h14"/></svg>`,
            import: `<svg ${common}><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M5 19h14"/></svg>`,
            organize: `<svg ${common}><path d="M4 6h6M14 6h6"/><circle cx="12" cy="6" r="2"/><path d="M4 12h10M18 12h2"/><circle cx="16" cy="12" r="2"/><path d="M4 18h2M10 18h10"/><circle cx="8" cy="18" r="2"/></svg>`,
            move: `<svg ${common}><path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>`,
            rename: `<svg ${common}><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m13 7 4 4"/></svg>`,
            copy: `<svg ${common}><rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-10A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17H8"/></svg>`,
            id: `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5.5 16c.8-1.6 4.2-1.6 5 0M13 10h5M13 14h5"/></svg>`,
            chevron: `<svg ${common}><path d="m9 6 6 6-6 6"/></svg>`,
            trash: `<svg ${common}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></svg>`,
            refresh: `<svg ${common}><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 2M18 16a7 7 0 0 1-11.9 2L4 16"/></svg>`,
            play: `<svg ${common}><path d="m8 5 11 7-11 7z"/></svg>`,
            expand: `<svg ${common}><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>`,
            collapse: `<svg ${common}><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/></svg>`,
            favorite: `<svg ${common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`,
            export: `<svg ${common}><path d="M12 21V9"/><path d="m8 13 4-4 4 4"/><path d="M5 5h14"/></svg>`,
            version: `<svg ${common}><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>`,
            project: `<svg ${common}><path d="M4 5h6l2 2h8v12H4z"/></svg>`
        };

        return icons[name] || icons.dot;
    }

    static _ctxCloseSubmenus(menu = this.dom.contextMenu, except = null) {
        if (!menu) return;

        menu.querySelectorAll(".apctx-item.submenu-open").forEach((item) => {
            if (
                except &&
                (
                    item === except ||
                    item.contains(except) ||
                    except.contains(item)
                )
            ) {
                return;
            }

            item.classList.remove("submenu-open");
            item.setAttribute("aria-expanded", "false");
        });
    }

    static _ctxPositionSubmenu(item, submenu) {
        if (!item || !submenu) return;

        submenu.style.left = "calc(100% + 4px)";
        submenu.style.right = "auto";
        submenu.style.top = "-4px";
        submenu.style.bottom = "auto";

        requestAnimationFrame(() => {
            if (!item.classList.contains("submenu-open")) return;

            const vw = window.innerWidth || document.documentElement.clientWidth;
            const vh = window.innerHeight || document.documentElement.clientHeight;

            let rect = submenu.getBoundingClientRect();

            if (rect.right > vw - 6) {
                submenu.style.left = "auto";
                submenu.style.right = "calc(100% + 4px)";
                rect = submenu.getBoundingClientRect();
            }

            if (rect.bottom > vh - 6) {
                submenu.style.top = "auto";
                submenu.style.bottom = "-4px";
            }
        });
    }

    static _ctxBuildItems(container, items = [], rootMenu) {
        for (const item of items) {
            if (!item || item.hidden) continue;

            if (item.separator) {
                const separator = document.createElement("div");
                separator.className = "apctx-separator";
                container.appendChild(separator);
                continue;
            }

            const row = document.createElement("div");
            row.className = "apctx-item";
            row.tabIndex = item.disabled ? -1 : 0;

            if (item.disabled) row.classList.add("is-disabled");
            if (item.danger) row.classList.add("is-danger");

            const children =
                Array.isArray(item.children)
                    ? item.children.filter(Boolean)
                    : [];

            if (children.length) {
                row.classList.add("has-submenu");
                row.setAttribute("aria-haspopup", "menu");
                row.setAttribute("aria-expanded", "false");
            }

            row.innerHTML = `
                <span class="apctx-icon">${this._ctxSvg(item.icon || "dot")}</span>
                <span class="apctx-label"></span>
                ${item.shortcut ? `<span class="apctx-shortcut"></span>` : ""}
                ${children.length ? `<span class="apctx-caret">${this._ctxSvg("chevron")}</span>` : ""}
            `;

            row.querySelector(".apctx-label").textContent = item.label || "";

            const shortcut = row.querySelector(".apctx-shortcut");
            if (shortcut) shortcut.textContent = item.shortcut || "";

            if (children.length) {
                const submenu = document.createElement("div");
                submenu.className = "apctx-submenu";
                this._ctxBuildItems(submenu, children, rootMenu);
                row.appendChild(submenu);

                const toggle = (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (item.disabled) return;

                    const willOpen = !row.classList.contains("submenu-open");
                    this._ctxCloseSubmenus(rootMenu, row);

                    row.classList.toggle("submenu-open", willOpen);
                    row.setAttribute("aria-expanded", willOpen ? "true" : "false");

                    if (!willOpen) {
                        row.querySelectorAll(".submenu-open").forEach((child) => {
                            child.classList.remove("submenu-open");
                            child.setAttribute("aria-expanded", "false");
                        });
                        return;
                    }

                    this._ctxPositionSubmenu(row, submenu);
                };

                // Click works for mouse and synthesized touch clicks.
                row.addEventListener("click", toggle);
                row.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") toggle(event);
                });
            } else if (!item.disabled && typeof item.action === "function") {
                row.addEventListener("click", async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    this._hideNativeContextMenu();

                    try {
                        await item.action();
                    } catch (error) {
                        console.error("[AssetsPanel] Context action failed:", item.label, error);
                    }
                });
            }

            container.appendChild(row);
        }
    }

    static _openNativeContextMenu(event, config = {}) {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        this._ctxEnsureStyles();
        this._refreshDOMCache?.();

        const menu = this.dom.contextMenu || document.getElementById("contextMenu");
        if (!menu) return null;

        // Close any viewport/hierarchy/etc menu first.
        window.SMContextMenu?.closeAll?.();

        menu.className = "context-menu assets-native-context-v2";
        menu.dataset.smContextMenu = "true";
        menu.dataset.contextOwner = config.owner || "assets-panel";
        menu.innerHTML = "";

        if (config.search !== false) {
            const search = document.createElement("div");
            search.className = "apctx-search";
            search.innerHTML = `<input type="text" placeholder="Search actions..." spellcheck="false">`;
            menu.appendChild(search);

            const input = search.querySelector("input");
            input.addEventListener("input", () => {
                const q = input.value.trim().toLowerCase();

                menu.querySelectorAll(".apctx-item").forEach((row) => {
                    const text = row.querySelector(":scope > .apctx-label")?.textContent?.toLowerCase() || "";
                    row.style.display = !q || text.includes(q) ? "" : "none";
                });

                menu.querySelectorAll(".apctx-header, .apctx-separator").forEach((el) => {
                    el.style.display = q ? "none" : "";
                });

                this._ctxCloseSubmenus(menu);
            });
        }

        if (config.title) {
            const header = document.createElement("div");
            header.className = "apctx-header";

            const title = document.createElement("span");
            title.className = "apctx-header-title";
            title.textContent = config.title;

            header.appendChild(title);

            if (config.badge) {
                const badge = document.createElement("span");
                badge.className = "apctx-badge";
                badge.textContent = config.badge;
                header.appendChild(badge);
            }

            menu.appendChild(header);
        }

        this._ctxBuildItems(menu, config.items || [], menu);

        if (window.SMContextMenu?.showExisting) {
            window.SMContextMenu.showExisting(
                event,
                menu,
                config.owner || "assets-panel"
            );
        } else {
            menu.style.display = "block";
            menu.style.visibility = "hidden";
            menu.style.position = "fixed";
            menu.style.left = `${event.clientX}px`;
            menu.style.top = `${event.clientY}px`;

            requestAnimationFrame(() => {
                const rect = menu.getBoundingClientRect();
                const margin = 6;
                let x = event.clientX;
                let y = event.clientY;

                if (x + rect.width > window.innerWidth - margin) {
                    x = window.innerWidth - rect.width - margin;
                }

                if (y + rect.height > window.innerHeight - margin) {
                    y = window.innerHeight - rect.height - margin;
                }

                menu.style.left = `${Math.max(margin, x)}px`;
                menu.style.top = `${Math.max(margin, y)}px`;
                menu.style.visibility = "visible";
            });
        }

        return menu;
    }

    static _hideNativeContextMenu() {
        const menu = this.dom.contextMenu || document.getElementById("contextMenu");
        if (menu) {
            menu.style.display = "none";
            menu.classList.remove("sm-context-menu-open");
            this._ctxCloseSubmenus(menu);
        }

        if (window.SMContextMenu?.activeMenu === menu) {
            window.SMContextMenu.activeMenu = null;
            window.SMContextMenu.activeOwner = null;
        }
    }

    static _ctxFolderPath(folderId) {
        if (!folderId) return "Project Assets";

        const parts = [];
        const seen = new Set();
        let current = this.folders?.[folderId];

        while (current && !seen.has(current.id)) {
            seen.add(current.id);
            parts.unshift(current.name || current.id);
            current = current.parentId ? this.folders?.[current.parentId] : null;
        }

        return `Project Assets/${parts.join("/")}`;
    }

    static _ctxCopyText(value) {
        const text = String(value ?? "");

        if (navigator.clipboard?.writeText) {
            return navigator.clipboard.writeText(text).catch(() => this._ctxLegacyCopy(text));
        }

        return this._ctxLegacyCopy(text);
    }

    static _ctxLegacyCopy(text) {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();

        try {
            document.execCommand("copy");
        } catch { }

        area.remove();
        return true;
    }

    static _ctxIsReadOnlyFolder(folder) {
        if (!folder) return true;

        return !!(
            folder.isBuiltIn ||
            folder.sourceType === "google-drive" ||
            folder.isGoogleDriveFolder ||
            folder.isPhysicalGameProject ||
            folder.isPhysicalGameContentFolder ||
            folder.sourceType === "physical-game-project"
        );
    }

    static _ctxCanDeleteFolder(folder) {
        if (!folder) return false;

        // Engine / built-in folders
        if (folder.isBuiltIn) return false;

        // Remote Drive folders
        if (
            folder.sourceType === "google-drive" ||
            folder.isGoogleDriveFolder
        ) {
            return false;
        }

        // Physical folders are mirrors of assets/... on disk.
        // AssetsPanel cannot truly delete them from Windows filesystem.
        if (
            folder.isPhysicalGameProject ||
            folder.isPhysicalGameContentFolder ||
            folder.sourceType === "physical-game-project"
        ) {
            return false;
        }

        // Normal user-created AssetsPanel folders
        return true;
    }

    static _ctxIsProtectedAsset(asset) {
        return !!(
            !asset ||
            asset.isBuiltIn ||
            asset.sourceType === "physical-game-project" ||
            asset.sourceType === "google-drive"
        );
    }

    static _ctxOwningGameProject(folderId) {
        let currentId = folderId || null;

        while (currentId) {
            const folder = this.folders?.[currentId];
            if (!folder) break;
            if (folder.isGameProject) return folder;
            currentId = folder.parentId || null;
        }

        return null;
    }

    static _ctxOwningPhysicalProject(folderId) {
        let currentId = folderId || null;

        while (currentId) {
            const folder = this.folders?.[currentId];
            if (!folder) break;
            if (folder.isPhysicalGameProject) return folder;
            currentId = folder.parentId || null;
        }

        return null;
    }

    static _ctxCollectFolderTree(folderId) {
        if (!folderId) return [];

        if (typeof this._collectFolderTree === "function") {
            try {
                return this._collectFolderTree(folderId) || [];
            } catch { }
        }

        const ids = [];
        const walk = (id) => {
            if (!this.folders?.[id]) return;
            ids.push(id);

            Object.values(this.folders || {})
                .filter((folder) => folder?.parentId === id)
                .forEach((folder) => walk(folder.id));
        };

        walk(folderId);
        return ids;
    }

    static _ctxMoveFolder(folderId, targetFolderId = null) {
        const folder = this.folders?.[folderId];
        if (!folder || this._ctxIsProtectedFolder(folder)) return false;

        if (folderId === targetFolderId) return false;

        const descendants = new Set(this._ctxCollectFolderTree(folderId));

        if (targetFolderId && descendants.has(targetFolderId)) {
            alert("A folder cannot be moved inside itself or one of its descendants.");
            return false;
        }

        const oldParent = folder.parentId || null;

        if (oldParent && this.folders?.[oldParent]) {
            this.folders[oldParent].children =
                (this.folders[oldParent].children || []).filter((id) => id !== folderId);
        }

        folder.parentId = targetFolderId || null;

        if (targetFolderId && this.folders?.[targetFolderId]) {
            const target = this.folders[targetFolderId];
            if (!Array.isArray(target.children)) target.children = [];
            if (!target.children.includes(folderId)) target.children.push(folderId);
        }

        this._saveToStorage?.();
        this.onFolderChanged?.(this.folders);
        this.render?.();
        return true;
    }

    static _ctxFolderMoveTargets(folderId) {
        const excluded = new Set(this._ctxCollectFolderTree(folderId));

        const build = (parentId = null) =>
            Object.values(this.folders || {})
                .filter((folder) =>
                    (folder.parentId || null) === (parentId || null) &&
                    !excluded.has(folder.id) &&
                    !this._ctxIsProtectedFolder(folder)
                )
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((folder) => ({
                    label: folder.name,
                    icon: "folder",
                    action: () => this._ctxMoveFolder(folderId, folder.id),
                    children: build(folder.id)
                }));

        return [
            {
                label: "Project Assets (Root)",
                icon: "project",
                action: () => this._ctxMoveFolder(folderId, null)
            },
            { separator: true },
            ...build(null)
        ];
    }

    static _ctxAssetMoveTargets(assetId) {
        const build = (parentId = null) =>
            Object.values(this.folders || {})
                .filter((folder) =>
                    (folder.parentId || null) === (parentId || null) &&
                    !this._ctxIsProtectedFolder(folder)
                )
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((folder) => ({
                    label: folder.name,
                    icon: "folder",
                    action: () => this.moveAssetToFolder?.(assetId, folder.id),
                    children: build(folder.id)
                }));

        return [
            {
                label: "Project Assets (Root)",
                icon: "project",
                action: () => this.moveAssetToFolder?.(assetId, null)
            },
            { separator: true },
            ...build(null)
        ];
    }

    // Compact asset context menu — native AssetsPanel implementation.
    static _showContextMenu(event, assetId) {
        this.contextAssetId = assetId;

        const asset = this._findById(assetId);
        if (!asset || asset.isBuiltIn) return;

        const readOnly = this._ctxIsProtectedAsset(asset);

        const physical =
            asset.physicalGameProjectId
                ? Object.values(this.folders || {}).find((folder) =>
                    folder?.isPhysicalGameProject &&
                    (
                        folder.projectId === asset.physicalGameProjectId ||
                        folder.physicalGameProjectId === asset.physicalGameProjectId
                    )
                )
                : null;

        const openAction = {
            label:
                asset.isGameEntryPoint
                    ? "Play Game Project"
                    : asset.isGameScene || asset.type === "game-scene"
                        ? "Open Game Scene"
                        : asset.isGameProjectManifest || asset.type === "game-project"
                            ? "Load Game Project"
                            : "Add / Open Asset",
            icon:
                asset.isGameEntryPoint
                    ? "play"
                    : asset.isGameProjectManifest || asset.type === "game-project"
                        ? "game"
                        : "open",
            action: () => {
                if (asset.isGameEntryPoint && physical) {
                    return window.PhysicalGameProjectBridge?.playProject?.(physical);
                }

                if (
                    (asset.isGameScene || asset.type === "game-scene") &&
                    typeof this.openGameScene === "function"
                ) {
                    return this.openGameScene(asset);
                }

                return this._addToScene?.(asset.id);
            }
        };

        const selectedCount = this.selectedIds?.size || 0;

        const items = [
            openAction,
            { separator: true },
            {
                label: "Asset Actions",
                icon: "organize",
                children: [
                    {
                        label: "Rename",
                        icon: "rename",
                        shortcut: "F2",
                        disabled: readOnly,
                        action: () => this.renameAsset?.()
                    },
                    {
                        label: asset.isFavorite ? "Remove from Favorites" : "Add to Favorites",
                        icon: "favorite",
                        action: () => this.toggleFavorite?.()
                    },
                    {
                        label: "Export Asset",
                        icon: "export",
                        action: () => this._exportSingleAsset?.(asset.id)
                    }
                ]
            },
            {
                label: "Organize",
                icon: "organize",
                children: [
                    {
                        label: "Move to Folder",
                        icon: "move",
                        disabled: readOnly,
                        children: this._ctxAssetMoveTargets(asset.id)
                    },
                    {
                        label: "Create Prefab from Selection",
                        icon: "project",
                        action: () => this._createPrefab?.()
                    }
                ]
            },
            {
                label: "Copy",
                icon: "copy",
                children: [
                    {
                        label: "Copy Asset Name",
                        icon: "copy",
                        action: () => this._ctxCopyText(asset.name)
                    },
                    {
                        label: "Copy Source Path / URL",
                        icon: "copy",
                        disabled: !(asset.sourcePath || asset.sourceURL || typeof asset.data === "string"),
                        action: () =>
                            this._ctxCopyText(
                                asset.sourcePath ||
                                asset.sourceURL ||
                                (typeof asset.data === "string" ? asset.data : "")
                            )
                    },
                    {
                        label: "Copy Asset ID",
                        icon: "id",
                        action: () => this._ctxCopyText(asset.id)
                    }
                ]
            },
            {
                label: "Version Control",
                icon: "version",
                children: [
                    {
                        label: "Commit Version",
                        icon: "version",
                        disabled: readOnly,
                        action: () =>
                            this._commitAssetVersion?.(
                                asset.id,
                                prompt("Commit message:") || "Manual Commit"
                            )
                    },
                    {
                        label: "Revert to Previous",
                        icon: "version",
                        disabled: readOnly || !asset.history?.length,
                        action: () => this._revertAsset?.(asset.id)
                    },
                    {
                        label: "Show History",
                        icon: "version",
                        disabled: !asset.history?.length,
                        action: () => this._showAssetHistory?.(asset.id)
                    }
                ]
            },
            ...(selectedCount > 1
                ? [{
                    label: `Selection (${selectedCount})`,
                    icon: "organize",
                    children: [
                        {
                            label: `Add Tags to ${selectedCount} Assets`,
                            icon: "organize",
                            action: () => this._promptMultiTag?.()
                        },
                        {
                            label: `Move ${selectedCount} Assets…`,
                            icon: "move",
                            action: () => this._showMoveSelectedAssetsMenu?.()
                        }
                    ]
                }]
                : []),
            {
                label: "Project",
                icon: "project",
                children: [
                    {
                        label: "Pack All Project Assets",
                        icon: "project",
                        action: () => this._packSceneAssets?.()
                    },
                    {
                        label: "Refresh Assets",
                        icon: "refresh",
                        action: () => this.refreshAssets?.()
                    }
                ]
            },
            { separator: true },
            {
                label: "Delete",
                icon: "trash",
                shortcut: "Delete",
                danger: true,
                disabled: readOnly,
                action: () => this.deleteAsset?.()
            }
        ];

        return this._openNativeContextMenu(event, {
            owner: "assets-grid",
            title: asset.name,
            badge: String(asset.type || "ASSET").toUpperCase(),
            items
        });
    }

    // Compact folder context menu — native AssetsPanel implementation.
    static _showFolderContextMenu(event, folderId) {
        const folder = this.folders?.[folderId];
        if (!folder) return;

        const readOnly = this._ctxIsReadOnlyFolder(folder);
        const canDelete = this._ctxCanDeleteFolder(folder);
        const project = this._ctxOwningGameProject(folderId);
        const physical = this._ctxOwningPhysicalProject(folderId);
        const path = this._ctxFolderPath(folderId);

        const items = [
            {
                label: "Open",
                icon: "open",
                children: [
                    {
                        label: "Open Folder",
                        icon: "open",
                        shortcut: "Enter",
                        action: () => this.openFolder?.(folderId)
                    },
                    {
                        label: "Open in Content Grid",
                        icon: "folder",
                        action: () => {
                            this.openFolderId = folderId;
                            this.currentCategory = "project";
                            this.render?.();
                        }
                    }
                ]
            }
        ];

        const gameActions = [];

        if (physical) {
            gameActions.push(
                {
                    label: "Play Game Project",
                    icon: "play",
                    action: () =>
                        window.PhysicalGameProjectBridge?.playProject?.(physical)
                },
                {
                    label: "Refresh Project Files",
                    icon: "refresh",
                    action: () =>
                        window.PhysicalGameProjectBridge?.refreshProject?.(physical)
                }
            );
        }

        if (folder.isGameProject) {
            gameActions.push(
                {
                    label: "Load Game Project",
                    icon: "game",
                    disabled: typeof this.loadGameProject !== "function",
                    action: () =>
                        this.loadGameProject?.(
                            folder,
                            {
                                openStartup: true,
                                replaceScene: true,
                                requireStartup: false
                            }
                        )
                },
                {
                    label: "Set as Active Game Project",
                    icon: "game",
                    disabled: typeof this.setActiveGameProject !== "function",
                    action: () =>
                        this.setActiveGameProject?.(
                            folder,
                            { openProject: false }
                        )
                }
            );

            if (typeof this.openStartupScene === "function") {
                gameActions.push({
                    label: "Open Startup Scene",
                    icon: "open",
                    action: () => this.openStartupScene?.(folder)
                });
            }
        }

        if (gameActions.length) {
            items.push({
                label: "Game Project",
                icon: "game",
                children: gameActions
            });
        }

        const createImportChildren = [
            {
                label: "New Subfolder",
                icon: "plus",
                disabled: readOnly,
                action: () => {
                    const name = prompt("New subfolder name:", "New Folder");
                    if (name) this.createFolder?.(name, folderId);
                }
            },
            {
                label: "New Game Project Here…",
                icon: "game",
                disabled:
                    readOnly ||
                    !!project ||
                    typeof this.createGameProject !== "function",
                action: () => this.createGameProject?.(null, folderId)
            },
            {
                label: "Import Asset(s) Here…",
                icon: "import",
                disabled: readOnly,
                action: () => {
                    this.openFolderId = folderId;
                    this.currentCategory = "project";
                    this._refreshDOMCache?.();

                    if (this.dom?.uploadInput) this.dom.uploadInput.click();
                    else this.showUploadZone?.();
                }
            },
            {
                label: "Import Folder Here…",
                icon: "folder",
                disabled: readOnly,
                action: () => {
                    this.openFolderId = folderId;
                    this.currentCategory = "project";
                    this._refreshDOMCache?.();

                    if (this.dom?.uploadFolderInput) this.dom.uploadFolderInput.click();
                    else this.showUploadZone?.();
                }
            }
        ];

        if (project && typeof this.saveCurrentSceneToGameProject === "function") {
            createImportChildren.push(
                { separator: true },
                {
                    label: "Save Current Scene as Map…",
                    icon: "project",
                    action: () => this.saveCurrentSceneToGameProject?.(project.id)
                }
            );
        }

        items.push(
            {
                label: "Create & Import",
                icon: "plus",
                children: createImportChildren
            },
            {
                label: "Organize",
                icon: "organize",
                children: [
                    {
                        label: "Move Folder To",
                        icon: "move",
                        disabled: readOnly,
                        children: this._ctxFolderMoveTargets(folderId)
                    },
                    {
                        label: "Rename Folder",
                        icon: "rename",
                        shortcut: "F2",
                        disabled: readOnly,
                        action: () => this.renameFolder?.(folderId)
                    },
                    { separator: true },
                    {
                        label: "Expand All Descendants",
                        icon: "expand",
                        action: () => {
                            this._ctxCollectFolderTree(folderId)
                                .forEach((id) => this.expandedFolders?.add?.(id));
                            this._renderFolderSidebar?.();
                        }
                    },
                    {
                        label: "Collapse Descendants",
                        icon: "collapse",
                        action: () => {
                            this._ctxCollectFolderTree(folderId)
                                .forEach((id) => this.expandedFolders?.delete?.(id));
                            this._renderFolderSidebar?.();
                        }
                    }
                ]
            },
            {
                label: "Copy",
                icon: "copy",
                children: [
                    {
                        label: "Copy Folder Path",
                        icon: "copy",
                        action: () => this._ctxCopyText(path)
                    },
                    {
                        label: "Copy Folder ID",
                        icon: "id",
                        action: () => this._ctxCopyText(folder.id)
                    }
                ]
            },
            { separator: true },
            {
                label: "Save Folder to Device…",
                icon: "export",
                disabled: readOnly || typeof this.saveFolderToDevice !== "function",
                action: () => this.saveFolderToDevice?.(folderId)
            },
            {
                label: "Delete",
                icon: "trash",
                danger: true,
                disabled: readOnly,
                children: [
                    {
                        label: "Delete Folder (Move Contents to Parent)",
                        icon: "trash",
                        disabled: readOnly,
                        action: () => {
                            if (
                                confirm(
                                    `Delete "${folder.name}" and move its contents to the parent folder?`
                                )
                            ) {
                                this.deleteFolder?.(
                                    folderId,
                                    { deleteContents: false }
                                );
                            }
                        }
                    },
                    {
                        label: "Delete Folder & Contents",
                        icon: "trash",
                        danger: true,
                        disabled: readOnly,
                        action: () => {
                            if (
                                confirm(
                                    `Delete "${folder.name}" and ALL contents? This cannot be undone.`
                                )
                            ) {
                                this.deleteFolder?.(
                                    folderId,
                                    { deleteContents: true }
                                );
                            }
                        }
                    }
                ]
            }
        );

        return this._openNativeContextMenu(event, {
            owner: "assets-explorer",
            title: folder.name,
            badge:
                folder.isGameProject || folder.isPhysicalGameProject
                    ? "GAME PROJECT"
                    : "FOLDER",
            items
        });
    }

    static _showMoveAssetMenu(assetId) {
        const folderNames = [{ id: null, name: "Root" }].concat(
            Object.values(this.folders).map((f) => ({ id: f.id, name: f.name })),
        );
        const sel = prompt(
            "Move asset to folder:\n" +
            folderNames.map((f, i) => `${i}: ${f.name}`).join("\n"),
            "0",
        );
        const idx = parseInt(sel);
        if (isNaN(idx)) return;
        const target = folderNames[idx];
        this.moveAssetToFolder(assetId, target.id);
    }

    // ------------------------------------------------------------------
    // Helpers - MODIFIED: _removeAsset cleans up references
    // ------------------------------------------------------------------
    static _findById(id) {
        return this.assets.find((a) => a.id === id);
    }
    static _removeAsset(id) {
        const idx = this.assets.findIndex((a) => a.id === id);
        if (idx >= 0) {
            const [rem] = this.assets.splice(idx, 1);

            this.assetStorage
                ?.deleteAsset?.(rem.id)
                ?.catch?.((error) => {
                    console.warn(
                        `AssetsPanel: Could not delete persisted data for ${rem.name}.`,
                        error
                    );
                });

            if (typeof this.onAssetRemoved === "function")
                this.onAssetRemoved(rem.id);
            // NEW: Clean up references pointing to this deleted asset
            this.assets.forEach((a) => {
                if (a.references) {
                    a.references = a.references.filter((refId) => refId !== id);
                }
                // Also clean up history entries that might contain a thumbnail or data from this asset
                // (More robust would be to store original data URLs in history to reconstruct thumbnails)
                if (a.history) {
                    a.history.forEach((h) => {
                        // If a history entry's name was based on this deleted asset, adjust message
                        if (h.message && h.message.includes(rem.name)) {
                            h.message = h.message.replace(
                                new RegExp(rem.name, "g"),
                                "[Deleted Asset]",
                            );
                        }
                    });
                }
                // If a material definition was pointing to this texture asset, clear that slot
                if (a.type === "material" && a.definition) {
                    const textureSlots = [
                        "map",
                        "normalMap",
                        "roughnessMap",
                        "metalnessMap",
                        "emissiveMap",
                        "displacementMap",
                    ];
                    textureSlots.forEach((slot) => {
                        if (a.definition[slot] === id) {
                            delete a.definition[slot];
                        }
                    });
                }
            });
        }
    }

    static _collectFolderTree(folderId) {
        const out = [];
        const rec = (fid) => {
            out.push(fid);
            const f = this.folders[fid];
            if (!f) return;
            for (const c of f.children || []) rec(c);
        };
        rec(folderId);
        return out;
    }

    static _selectAllInView() {
        const nodes = this.dom.grid.querySelectorAll(".asset-item");
        this.selectedIds.clear();
        for (const n of nodes) this.selectedIds.add(n.dataset.id);
        this.render();
    }

    static _exportSingleAsset(assetId) {
        const asset = this._findById(assetId);
        if (!asset) return;
        if (asset.type === "material" && asset.definition) {
            // When exporting material, convert asset IDs back to data URLs for portability
            const exportDef = { ...asset.definition };
            const textureSlots = [
                "map",
                "normalMap",
                "roughnessMap",
                "metalnessMap",
                "emissiveMap",
                "displacementMap",
            ];
            for (const slot of textureSlots) {
                const textureAssetId = exportDef[slot];
                const textureAsset = textureAssetId
                    ? this._findById(textureAssetId)
                    : null;
                if (textureAsset && textureAsset.data) {
                    exportDef[slot] = textureAsset.data; // Use data URL for export
                }
            }

            const blob = new Blob([JSON.stringify(exportDef, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = (asset.name || "material") + ".material.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return;
        }
        if (asset.type === "code" && asset.data) {
            const blob = new Blob([asset.data], { type: "text/javascript" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = (asset.name || "script") + ".js";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return;
        }
        const blob = new Blob([asset.data], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = asset.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

}
for(const key of Reflect.ownKeys(SMAssetsPanelContextMenusMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelContextMenusMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelContextMenus");
})(window);
