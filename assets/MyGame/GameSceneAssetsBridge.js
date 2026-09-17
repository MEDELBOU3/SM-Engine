/**
 * GameSceneAssetsBridge.js
 * STEP 3 — Save the current SM Engine scene as a .smscene asset.
 *
 * Requires:
 *   1) AssetsPanel.js
 *   2) GameProjectAssetsBridge.js (STEP 2)
 *   3) GameSceneAssetsBridge.js (this file)
 *
 * This step ONLY saves scenes.
 * Loading/opening .smscene comes in STEP 4.
 */

(function (root) {
    "use strict";

    function getAssetsPanel() {
        if (typeof AssetsPanel !== "undefined") return AssetsPanel;
        return root.AssetsPanel || null;
    }

    const GameSceneAssetsBridge = {
        installed: false,
        format: "SM_GAME_SCENE",
        version: 1,

        install() {
            if (this.installed) return true;

            const AP = getAssetsPanel();
            if (!AP) {
                setTimeout(() => this.install(), 100);
                return false;
            }

            // Step 2 dependency.
            if (typeof AP.initializeGameProjectStructure !== "function") {
                console.warn(
                    "[GameSceneAssetsBridge] STEP 2 is not ready. " +
                    "Load GameProjectAssetsBridge.js before this file."
                );
                setTimeout(() => this.install(), 150);
                return false;
            }

            this.installed = true;

            this._installSceneAPI(AP);
            this._patchFolderContextMenu(AP);
            this._patchAddToScene(AP);
            this._patchRender(AP);

            try { AP.render?.(); } catch {}

            console.log("[GameSceneAssetsBridge] Step 3 installed.");
            return true;
        },

        _makeId(prefix) {
            if (root.crypto?.randomUUID) {
                return `${prefix}_${root.crypto.randomUUID()}`;
            }

            return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
        },

        _sanitizeSceneName(name) {
            let clean = String(name || "")
                .replace(/[\\/:*?"<>|]/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            clean = clean.replace(/\.smscene$/i, "").trim();
            return clean;
        },

        _findGameProjectFolder(AP, startFolderId = null) {
            let cursorId = startFolderId || AP.openFolderId || null;

            // If currently at root, use the only Game Project when unambiguous.
            if (!cursorId) {
                const projects = Object.values(AP.folders || {})
                    .filter(folder => folder?.isGameProject);

                return projects.length === 1 ? projects[0] : null;
            }

            while (cursorId) {
                const folder = AP.folders?.[cursorId];
                if (!folder) break;

                if (folder.isGameProject) return folder;
                cursorId = folder.parentId || null;
            }

            return null;
        },

        _findMapsFolder(AP, projectFolder) {
            if (!projectFolder) return null;

            // Preferred metadata created by Step 2.
            const storedId =
                projectFolder.gameContentFolders?.Maps ||
                projectFolder.gameContentFolders?.maps;

            if (storedId && AP.folders?.[storedId]) {
                return AP.folders[storedId];
            }

            // Repair/initialize structure if needed.
            AP.initializeGameProjectStructure?.(projectFolder.id);

            const repairedId =
                projectFolder.gameContentFolders?.Maps ||
                projectFolder.gameContentFolders?.maps;

            if (repairedId && AP.folders?.[repairedId]) {
                return AP.folders[repairedId];
            }

            // Last fallback.
            return Object.values(AP.folders || {}).find(folder =>
                folder &&
                folder.name === "Maps" &&
                (folder.parentId || null) === projectFolder.id
            ) || null;
        },

        _sceneThumbnail() {
            return `
                <svg viewBox="0 0 128 128" width="100%" height="100%" aria-hidden="true">
                    <rect x="15" y="17" width="98" height="94" fill="#353535"/>
                    <path d="M24 92L48 62L64 76L80 54L104 92Z" fill="#5f5f5f"/>
                    <circle cx="88" cy="40" r="9" fill="#777"/>
                    <rect x="24" y="98" width="80" height="4" fill="#777"/>
                    <text x="64" y="119" text-anchor="middle"
                          font-family="Arial,sans-serif"
                          font-size="9" fill="#d0d0d0">SM SCENE</text>
                </svg>
            `;
        },

        _isEditorOnlySerializedObject(objectData) {
            if (!objectData || typeof objectData !== "object") return false;

            const type = String(objectData.type || "");
            const name = String(objectData.name || "").toLowerCase();
            const userData = objectData.userData || {};

            if (
                userData.editorOnly === true ||
                userData.excludeFromGame === true ||
                userData.ignoreSceneSave === true ||
                userData.isEditorHelper === true
            ) {
                return true;
            }

            const editorTypes = new Set([
                "GridHelper",
                "PolarGridHelper",
                "AxesHelper",
                "ArrowHelper",
                "BoxHelper",
                "Box3Helper",
                "CameraHelper",
                "DirectionalLightHelper",
                "HemisphereLightHelper",
                "PointLightHelper",
                "SpotLightHelper",
                "PlaneHelper",
                "SkeletonHelper",
                "TransformControls"
            ]);

            if (editorTypes.has(type)) return true;

            if (
                name === "__editor" ||
                name.startsWith("__editor_") ||
                name.startsWith("editorhelper_") ||
                name.startsWith("transformcontrols")
            ) {
                return true;
            }

            return false;
        },

        _pruneEditorObjects(objectData) {
            if (!objectData || typeof objectData !== "object") return objectData;

            if (Array.isArray(objectData.children)) {
                objectData.children = objectData.children
                    .filter(child => !this._isEditorOnlySerializedObject(child))
                    .map(child => this._pruneEditorObjects(child));
            }

            return objectData;
        },

        _serializeCurrentScene(AP, sceneName, projectFolder) {
            const scene = AP.scene || root.scene;

            if (!scene?.isScene || typeof scene.toJSON !== "function") {
                throw new Error(
                    "No valid THREE.Scene is available in AssetsPanel."
                );
            }

            let threeScene;

            try {
                threeScene = scene.toJSON();
            } catch (error) {
                console.error(
                    "[GameSceneAssetsBridge] THREE.Scene.toJSON() failed:",
                    error
                );

                throw new Error(
                    "The current scene contains data that cannot be serialized. " +
                    "Check custom userData/components for circular references."
                );
            }

            // Remove common editor helpers from the object hierarchy.
            if (threeScene?.object) {
                threeScene.object = this._pruneEditorObjects(threeScene.object);
            }

            const objectCount = (() => {
                let count = 0;

                const walk = object => {
                    if (!object) return;
                    count++;
                    (object.children || []).forEach(walk);
                };

                walk(threeScene?.object);
                return Math.max(0, count - 1); // Do not count Scene root.
            })();

            return {
                format: this.format,
                version: this.version,

                id: this._makeId("smscene"),
                name: sceneName,

                projectId: projectFolder.projectId || null,

                savedAt: new Date().toISOString(),

                metadata: {
                    objectCount,
                    source: "SM Engine Editor",
                    serializer: "THREE.Scene.toJSON"
                },

                // The actual Three.js world.
                scene: threeScene
            };
        },

        _installSceneAPI(AP) {
            /**
             * Save current editor scene inside a specific Game Project Maps folder.
             *
             * @param {string|null} projectFolderId
             * @param {string|null} sceneName
             * @param {object} options
             */
            AP.saveCurrentSceneToGameProject = function (
                projectFolderId = null,
                sceneName = null,
                options = {}
            ) {
                const bridge = root.GameSceneAssetsBridge;

                const projectFolder =
                    bridge._findGameProjectFolder(this, projectFolderId);

                if (!projectFolder) {
                    alert(
                        "Open a Game Project first, or create one before saving a Game Scene."
                    );
                    return null;
                }

                const mapsFolder =
                    bridge._findMapsFolder(this, projectFolder);

                if (!mapsFolder) {
                    alert(
                        'The Game Project does not have a "Maps" folder. ' +
                        "Run Step 2 structure initialization first."
                    );
                    return null;
                }

                let finalName = sceneName;

                if (!finalName) {
                    finalName = prompt(
                        "Scene name:",
                        options.defaultName || "Main"
                    );
                }

                finalName =
                    bridge._sanitizeSceneName(finalName);

                if (!finalName) return null;

                const assetName = `${finalName}.smscene`;

                let payload;

                try {
                    payload =
                        bridge._serializeCurrentScene(
                            this,
                            finalName,
                            projectFolder
                        );
                } catch (error) {
                    console.error(
                        "[GameSceneAssetsBridge] Save failed:",
                        error
                    );

                    alert(`Scene save failed:\n${error.message}`);
                    return null;
                }

                // Search only inside this project's Maps folder.
                let asset = this.assets.find(entry =>
                    entry &&
                    entry.type === "game-scene" &&
                    entry.name.toLowerCase() === assetName.toLowerCase() &&
                    entry.folderId === mapsFolder.id
                );

                const isUpdate = !!asset;

                if (asset) {
                    // Keep the same scene asset id across saves.
                    const previousPayload = (() => {
                        try {
                            return JSON.parse(asset.data || "{}");
                        } catch {
                            return {};
                        }
                    })();

                    payload.id =
                        previousPayload.id ||
                        asset.sceneId ||
                        payload.id;

                    asset.data =
                        JSON.stringify(payload, null, 2);

                    asset.definition = payload;
                    asset.sceneId = payload.id;
                    asset.projectId =
                        projectFolder.projectId || null;
                    asset.updatedAt = payload.savedAt;

                    asset.references =
                        Array.isArray(asset.references)
                            ? asset.references
                            : [];
                } else {
                    asset = {
                        id: bridge._makeId("sceneasset"),
                        name: assetName,
                        type: "game-scene",

                        data: JSON.stringify(payload, null, 2),
                        definition: payload,

                        thumbnail: bridge._sceneThumbnail(),

                        isFavorite: false,
                        isBuiltIn: false,

                        folderId: mapsFolder.id,

                        tags: [
                            "game-scene",
                            "scene",
                            "map"
                        ],

                        history: [],
                        references: [],

                        isGameScene: true,
                        sceneId: payload.id,
                        projectId:
                            projectFolder.projectId || null,

                        createdAt: payload.savedAt,
                        updatedAt: payload.savedAt
                    };

                    this.assets.push(asset);
                }

                try {
                    this._commitAssetVersion?.(
                        asset.id,
                        isUpdate
                            ? `Saved scene "${finalName}"`
                            : `Created scene "${finalName}"`
                    );
                } catch {}

                this._saveToStorage?.();

                if (!isUpdate && typeof this.onAssetAdded === "function") {
                    this.onAssetAdded(asset);
                }

                if (isUpdate && typeof this.onAssetUpdate === "function") {
                    this.onAssetUpdate(asset.id, asset);
                }

                // Show the user the result immediately.
                if (options.openMapsFolder !== false) {
                    this.openFolderId = mapsFolder.id;
                    this.currentCategory = "project";
                    this.expandedFolders?.add(projectFolder.id);
                    this.expandedFolders?.add(mapsFolder.id);
                }

                this.render?.();
                this._buildTagCloud?.();
                this._syncRuntimeAssetRegistry?.();

                console.log(
                    `[AssetsPanel] ${isUpdate ? "Updated" : "Saved"} Game Scene: ${assetName}`,
                    payload
                );

                return asset;
            };

            /**
             * Convenience API:
             * works when user is anywhere inside MyGame.
             */
            AP.saveCurrentSceneAsMap = function (sceneName = null) {
                return this.saveCurrentSceneToGameProject(
                    null,
                    sceneName,
                    { openMapsFolder: true }
                );
            };
        },

        _patchFolderContextMenu(AP) {
            if (AP.__smGameSceneFolderMenuPatchedV3) return;
            AP.__smGameSceneFolderMenuPatchedV3 = true;

            const original = AP._showFolderContextMenu;

            AP._showFolderContextMenu = function (event, folderId) {
                const folder = this.folders?.[folderId];

                // Let Step 2 / AssetsPanel build its normal menu first.
                const result = original?.call(this, event, folderId);

                if (!folder || !this.dom?.contextMenu) return result;

                const projectFolder =
                    root.GameSceneAssetsBridge._findGameProjectFolder(
                        this,
                        folderId
                    );

                const isGameProject = folder.isGameProject === true;

                const isMapsFolder =
                    folder.gameContentType === "maps" ||
                    (
                        folder.name === "Maps" &&
                        projectFolder &&
                        folder.parentId === projectFolder.id
                    );

                if (!isGameProject && !isMapsFolder) return result;

                const item = document.createElement("div");
                item.className = "context-menu-item sm-save-game-scene-menu";
                item.innerHTML = `
                    <i class="fas fa-map"></i>
                    <span>Save Current Scene as Map...</span>
                `;

                item.onclick = () => {
                    this.saveCurrentSceneToGameProject(
                        projectFolder?.id || folderId
                    );

                    this.dom.contextMenu.style.display = "none";
                };

                // Put it near the top.
                const firstSeparator =
                    this.dom.contextMenu.querySelector(
                        ".context-menu-separator"
                    );

                if (firstSeparator) {
                    this.dom.contextMenu.insertBefore(
                        item,
                        firstSeparator
                    );
                } else {
                    this.dom.contextMenu.prepend(item);
                }

                return result;
            };
        },

        _patchAddToScene(AP) {
            if (AP.__smGameSceneAddToScenePatchedV3) return;
            AP.__smGameSceneAddToScenePatchedV3 = true;

            const original = AP._addToScene;

            AP._addToScene = async function (assetId, ...args) {
                const asset = this._findById?.(assetId);

                if (
                    asset?.type === "game-scene" ||
                    asset?.isGameScene
                ) {
                    console.info(
                        `[GameSceneAssetsBridge] ${asset.name} is saved correctly. ` +
                        "Scene loading/opening will be implemented in STEP 4.",
                        asset.definition || asset.data
                    );

                    return asset;
                }

                return original?.call(this, assetId, ...args);
            };
        },

        _patchRender(AP) {
            if (AP.__smGameSceneRenderPatchedV3) return;
            AP.__smGameSceneRenderPatchedV3 = true;

            const original = AP.render;

            AP.render = function (...args) {
                const result = original.apply(this, args);

                try {
                    const items =
                        this.dom?.grid?.querySelectorAll?.(
                            '.asset-item[data-type="game-scene"]'
                        ) || [];

                    items.forEach(item => {
                        item.classList.add("game-scene-asset");

                        const meta =
                            item.querySelector(".asset-meta");

                        if (meta) meta.textContent = "Game Scene";
                    });
                } catch {}

                return result;
            };
        }
    };

    root.GameSceneAssetsBridge =
        GameSceneAssetsBridge;

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => GameSceneAssetsBridge.install(),
            { once: true }
        );
    } else {
        GameSceneAssetsBridge.install();
    }
})(window);