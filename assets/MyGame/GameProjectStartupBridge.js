/**
 * GameProjectStartupBridge.js
 * STEP 5 — Set/Open a Game Project startup scene.
 *
 * Requires Steps 2–4.
 *
 * Main API:
 *   AssetsPanel.setStartupScene("Main.smscene");
 *   AssetsPanel.getStartupSceneAsset();
 *   AssetsPanel.openStartupScene();
 */

(function (root) {
    "use strict";

    function getAssetsPanel() {
        if (typeof AssetsPanel !== "undefined") return AssetsPanel;
        return root.AssetsPanel || null;
    }

    const GameProjectStartupBridge = {
        installed: false,

        install() {
            if (this.installed) return true;

            const AP = getAssetsPanel();
            if (!AP) {
                setTimeout(() => this.install(), 100);
                return false;
            }

            if (typeof AP.openGameScene !== "function") {
                console.warn("[GameProjectStartupBridge] Step 4 is not ready.");
                setTimeout(() => this.install(), 150);
                return false;
            }

            this.installed = true;

            this._installStartupAPI(AP);
            this._patchAssetContextMenu(AP);
            this._patchFolderContextMenu(AP);
            this._patchRender(AP);

            console.log("[GameProjectStartupBridge] Step 5 installed.");
            return true;
        },

        _resolveSceneAsset(AP, reference) {
            return root.GameSceneLoaderBridge?._resolveSceneAsset?.(AP, reference) ||
                AP.assets?.find(asset =>
                    asset &&
                    (asset.type === "game-scene" || asset.isGameScene) &&
                    (
                        asset.id === reference ||
                        asset.sceneId === reference ||
                        asset.name === reference
                    )
                ) ||
                null;
        },

        _findProjectForScene(AP, sceneAsset) {
            if (!sceneAsset) return null;

            if (sceneAsset.projectId) {
                const direct = Object.values(AP.folders || {}).find(
                    folder => folder?.isGameProject && folder.projectId === sceneAsset.projectId
                );
                if (direct) return direct;
            }

            let folderId = sceneAsset.folderId;

            while (folderId) {
                const folder = AP.folders?.[folderId];
                if (!folder) break;
                if (folder.isGameProject) return folder;
                folderId = folder.parentId || null;
            }

            return null;
        },

        _resolveProject(AP, reference = null, sceneAsset = null) {
            if (reference && typeof reference === "object" && reference.isGameProject) {
                return reference;
            }

            if (reference) {
                const value = String(reference).toLowerCase();

                const project = Object.values(AP.folders || {}).find(folder =>
                    folder?.isGameProject &&
                    (
                        String(folder.id || "").toLowerCase() === value ||
                        String(folder.projectId || "").toLowerCase() === value ||
                        String(folder.name || "").toLowerCase() === value
                    )
                );

                if (project) return project;
            }

            const byScene = this._findProjectForScene(AP, sceneAsset);
            if (byScene) return byScene;

            if (root.GameSceneAssetsBridge?._findGameProjectFolder) {
                const current = root.GameSceneAssetsBridge._findGameProjectFolder(
                    AP,
                    AP.openFolderId
                );
                if (current) return current;
            }

            const projects = Object.values(AP.folders || {}).filter(
                folder => folder?.isGameProject
            );

            return projects.length === 1 ? projects[0] : null;
        },

        _findManifestAsset(AP, project) {
            if (!project) return null;

            if (root.GameProjectAssetsBridge?._findProjectManifest) {
                const result =
                    root.GameProjectAssetsBridge._findProjectManifest(AP, project);
                if (result) return result;
            }

            return AP.assets?.find(asset =>
                asset &&
                asset.folderId === project.id &&
                (
                    asset.isGameProjectManifest ||
                    asset.type === "game-project" ||
                    asset.name === "game.smproject"
                )
            ) || null;
        },

        _readManifest(asset) {
            if (!asset) return null;

            if (asset.definition && typeof asset.definition === "object") {
                return asset.definition;
            }

            try { return JSON.parse(asset.data || "{}"); }
            catch { return null; }
        },

        _writeManifest(AP, asset, manifest, message) {
            asset.definition = manifest;
            asset.data = JSON.stringify(manifest, null, 2);

            try { AP._commitAssetVersion?.(asset.id, message); } catch {}

            AP._saveToStorage?.();
            AP.render?.();
        },

        _installStartupAPI(AP) {
            AP.setStartupScene = function (
                sceneReference,
                projectReference = null
            ) {
                const bridge = root.GameProjectStartupBridge;
                const sceneAsset = bridge._resolveSceneAsset(this, sceneReference);

                if (!sceneAsset) {
                    alert("Game Scene not found.");
                    return null;
                }

                const project =
                    bridge._resolveProject(this, projectReference, sceneAsset);

                if (!project) {
                    alert("Could not determine which Game Project owns this scene.");
                    return null;
                }

                const sceneProject =
                    bridge._findProjectForScene(this, sceneAsset);

                if (sceneProject && sceneProject.id !== project.id) {
                    alert("That scene belongs to another Game Project.");
                    return null;
                }

                const manifestAsset =
                    bridge._findManifestAsset(this, project);

                if (!manifestAsset) {
                    alert("game.smproject was not found.");
                    return null;
                }

                const manifest =
                    bridge._readManifest(manifestAsset) || {};

                manifest.startupScene = sceneAsset.id;
                manifest.startupSceneId = sceneAsset.id;
                manifest.startupSceneName = sceneAsset.name;
                manifest.startupScenePath = `Maps/${sceneAsset.name}`;
                manifest.updatedAt = new Date().toISOString();

                project.startupSceneAssetId = sceneAsset.id;

                for (const asset of this.assets || []) {
                    if (
                        asset &&
                        (asset.type === "game-scene" || asset.isGameScene) &&
                        asset.projectId === project.projectId
                    ) {
                        asset.isStartupScene = asset.id === sceneAsset.id;
                    }
                }

                bridge._writeManifest(
                    this,
                    manifestAsset,
                    manifest,
                    `Startup Scene set to "${sceneAsset.name}"`
                );

                console.log(
                    `[AssetsPanel] Startup Scene: ${project.name} -> ${sceneAsset.name}`
                );

                try {
                    root.dispatchEvent(new CustomEvent("sm-game-startup-scene-changed", {
                        detail: { project, sceneAsset, manifest }
                    }));
                } catch {}

                return sceneAsset;
            };

            AP.getStartupSceneAsset = function (projectReference = null) {
                const bridge = root.GameProjectStartupBridge;
                const project = bridge._resolveProject(this, projectReference);

                if (!project) return null;

                const manifestAsset =
                    bridge._findManifestAsset(this, project);

                const manifest =
                    bridge._readManifest(manifestAsset);

                const ref =
                    manifest?.startupSceneId ||
                    manifest?.startupScene ||
                    project.startupSceneAssetId;

                if (ref) {
                    const byRef = bridge._resolveSceneAsset(this, ref);
                    if (byRef) return byRef;
                }

                if (manifest?.startupSceneName) {
                    return bridge._resolveSceneAsset(
                        this,
                        manifest.startupSceneName
                    );
                }

                return null;
            };

            AP.openStartupScene = function (
                projectReference = null,
                options = {}
            ) {
                const sceneAsset =
                    this.getStartupSceneAsset(projectReference);

                if (!sceneAsset) {
                    alert(
                        "This Game Project has no Startup Scene yet.\n" +
                        "Right-click a .smscene and choose Set as Startup Scene."
                    );
                    return null;
                }

                return this.openGameScene(sceneAsset, {
                    replace: options.replace !== false
                });
            };

            AP.clearStartupScene = function (projectReference = null) {
                const bridge = root.GameProjectStartupBridge;
                const project = bridge._resolveProject(this, projectReference);

                if (!project) return false;

                const manifestAsset =
                    bridge._findManifestAsset(this, project);

                const manifest =
                    bridge._readManifest(manifestAsset);

                if (!manifestAsset || !manifest) return false;

                manifest.startupScene = null;
                manifest.startupSceneId = null;
                manifest.startupSceneName = null;
                manifest.startupScenePath = null;
                manifest.updatedAt = new Date().toISOString();

                delete project.startupSceneAssetId;

                for (const asset of this.assets || []) {
                    if (asset?.projectId === project.projectId) {
                        asset.isStartupScene = false;
                    }
                }

                bridge._writeManifest(
                    this,
                    manifestAsset,
                    manifest,
                    "Startup Scene cleared"
                );

                return true;
            };
        },

        _patchAssetContextMenu(AP) {
            if (AP.__smStartupAssetContextV5) return;
            AP.__smStartupAssetContextV5 = true;

            const original = AP._showContextMenu;

            AP._showContextMenu = function (event, assetId) {
                const result = original?.call(this, event, assetId);
                const asset = this._findById?.(assetId);

                if (
                    !asset ||
                    (asset.type !== "game-scene" && !asset.isGameScene) ||
                    !this.dom?.contextMenu
                ) {
                    return result;
                }

                const separator = document.createElement("div");
                separator.className = "context-menu-separator";

                const item = document.createElement("div");
                item.className = "context-menu-item";
                item.innerHTML = asset.isStartupScene
                    ? `<i class="fas fa-home"></i>&nbsp; Startup Scene ✓`
                    : `<i class="fas fa-home"></i>&nbsp; Set as Startup Scene`;

                item.onclick = () => {
                    if (!asset.isStartupScene) this.setStartupScene(asset);
                    this.dom.contextMenu.style.display = "none";
                };

                this.dom.contextMenu.prepend(separator);
                this.dom.contextMenu.prepend(item);

                return result;
            };
        },

        _patchFolderContextMenu(AP) {
            if (AP.__smStartupFolderContextV5) return;
            AP.__smStartupFolderContextV5 = true;

            const original = AP._showFolderContextMenu;

            AP._showFolderContextMenu = function (event, folderId) {
                const result = original?.call(this, event, folderId);
                const folder = this.folders?.[folderId];

                if (!folder?.isGameProject || !this.dom?.contextMenu) {
                    return result;
                }

                const startup = this.getStartupSceneAsset(folder);

                const open = document.createElement("div");
                open.className = "context-menu-item";
                open.innerHTML = `<i class="fas fa-play-circle"></i>&nbsp; Open Startup Scene`;
                open.onclick = () => {
                    this.openStartupScene(folder);
                    this.dom.contextMenu.style.display = "none";
                };

                if (!startup) {
                    open.style.opacity = "0.5";
                    open.title = "No Startup Scene configured";
                }

                this.dom.contextMenu.prepend(open);
                return result;
            };
        },

        _patchRender(AP) {
            if (AP.__smStartupRenderV5) return;
            AP.__smStartupRenderV5 = true;

            const original = AP.render;

            AP.render = function (...args) {
                const result = original.apply(this, args);

                for (const asset of this.assets || []) {
                    if (!asset?.isStartupScene) continue;

                    const item = this.dom?.grid?.querySelector?.(
                        `.asset-item[data-id="${String(asset.id).replace(/"/g, '\\"')}"]`
                    );

                    if (!item) continue;

                    item.classList.add("sm-startup-scene");

                    const meta = item.querySelector(".asset-meta");
                    if (meta) {
                        meta.textContent = asset.id === this.activeGameSceneAssetId
                            ? "Startup Scene • Active"
                            : "Startup Scene";
                    }
                }

                return result;
            };
        }
    };

    root.GameProjectStartupBridge = GameProjectStartupBridge;

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => GameProjectStartupBridge.install(),
            { once: true }
        );
    } else {
        GameProjectStartupBridge.install();
    }
})(window);