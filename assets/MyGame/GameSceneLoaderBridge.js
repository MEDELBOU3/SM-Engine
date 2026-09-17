/**
 * GameSceneLoaderBridge.js
 * STEP 4 — Open/Load .smscene assets into the existing SM Engine viewport.
 *
 * Requires:
 *   AssetsPanel.js
 *   GameProjectAssetsBridge.js   (Step 2)
 *   GameSceneAssetsBridge.js     (Step 3)
 *
 * Main API:
 *   AssetsPanel.openGameScene("Main.smscene");
 *   AssetsPanel.reloadActiveGameScene();
 */

(function (root) {
    "use strict";

    function getAssetsPanel() {
        if (typeof AssetsPanel !== "undefined") return AssetsPanel;
        return root.AssetsPanel || null;
    }

    const PRESERVED_TYPES = new Set([
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

    const GameSceneLoaderBridge = {
        installed: false,
        activeSceneAssetId: null,

        install() {
            if (this.installed) return true;

            const AP = getAssetsPanel();
            if (!AP) {
                setTimeout(() => this.install(), 100);
                return false;
            }

            if (typeof THREE === "undefined" || typeof THREE.ObjectLoader !== "function") {
                console.error("[GameSceneLoaderBridge] THREE.ObjectLoader is required.");
                return false;
            }

            this.installed = true;

            this._installLoaderAPI(AP);
            this._patchAddToScene(AP);
            this._patchAssetContextMenu(AP);
            this._patchRender(AP);

            console.log("[GameSceneLoaderBridge] Step 4 installed.");
            return true;
        },

        _resolveSceneAsset(AP, reference) {
            if (!reference) {
                const selected = AP._findById?.(AP.selectedAssetId);
                if (selected?.type === "game-scene" || selected?.isGameScene) {
                    return selected;
                }
                return null;
            }

            if (typeof reference === "object") {
                return reference.type === "game-scene" || reference.isGameScene
                    ? reference
                    : null;
            }

            const value = String(reference).trim().toLowerCase();

            return AP.assets?.find(asset => {
                if (!asset || (asset.type !== "game-scene" && !asset.isGameScene)) {
                    return false;
                }

                return (
                    String(asset.id || "").toLowerCase() === value ||
                    String(asset.sceneId || "").toLowerCase() === value ||
                    String(asset.name || "").toLowerCase() === value ||
                    String(asset.name || "").replace(/\.smscene$/i, "").toLowerCase() === value.replace(/\.smscene$/i, "")
                );
            }) || null;
        },

        _parsePayload(asset) {
            if (!asset) return null;

            const payload = asset.definition && typeof asset.definition === "object"
                ? asset.definition
                : (() => {
                    try { return JSON.parse(asset.data || "{}"); }
                    catch { return null; }
                })();

            if (!payload || payload.format !== "SM_GAME_SCENE" || !payload.scene) {
                return null;
            }

            return payload;
        },

        _isPreservedObject(AP, object) {
            if (!object) return true;

            const userData = object.userData || {};
            const name = String(object.name || "").toLowerCase();
            const playerSystem = root.playerSystem || null;
            const playerRoot =
                playerSystem?.character?.model ||
                playerSystem?.model ||
                root.player?.model ||
                null;
            const playerCamera =
                playerSystem?.playerCamera ||
                playerSystem?.cameraController?.camera ||
                null;

            // The player and its runtime camera are engine-owned runtime
            // objects. Removing either while replacing a project scene leaves
            // SMPlayerSystem holding detached references and produces an empty
            // Game View when Play is pressed.
            if (
                object === playerRoot ||
                object === playerCamera ||
                userData.isPlayerRoot === true ||
                userData.smPersistentPlayer === true
            ) {
                return true;
            }

            if (
                userData.editorOnly === true ||
                userData.isEditorHelper === true ||
                userData.persistentEditorObject === true ||
                userData.keepOnSceneLoad === true ||
                userData.smKeepOnSceneLoad === true
            ) {
                return true;
            }

            if (PRESERVED_TYPES.has(String(object.type || ""))) return true;

            if (
                object === AP.camera ||
                object === root.camera ||
                object === root.editorCamera ||
                object === root.transformControls ||
                object === root.gridHelper ||
                object === root.axesHelper
            ) {
                return true;
            }

            if (
                name.startsWith("__editor") ||
                name.startsWith("editorhelper_") ||
                name.startsWith("transformcontrols") ||
                name === "gridhelper" ||
                name === "axeshelper"
            ) {
                return true;
            }

            return false;
        },

        _clearEditableScene(AP, targetScene) {
            root.transformControls?.detach?.();

            if (root.SelectionManager?.clearSelection) {
                try { root.SelectionManager.clearSelection(); } catch {}
            }

            if ("selectedObject" in root) root.selectedObject = null;

            const children = [...targetScene.children];

            for (const child of children) {
                if (this._isPreservedObject(AP, child)) continue;
                targetScene.remove(child);
            }
        },

        _markLoadedTree(object, asset) {
            const runtime = root.SMGameProjectRuntime || null;
            const projectId =
                asset?.projectId ||
                runtime?.activeProject?.projectId ||
                runtime?.activeManifest?.id ||
                null;

            object.traverse?.(child => {
                child.userData = child.userData || {};
                child.userData.smGameSceneObject = true;
                child.userData.smGameProjectObject = true;
                child.userData.smSourceSceneAssetId = asset?.id || null;
                child.userData.smSourceSceneId = asset?.sceneId || null;
                child.userData.smGameProjectId = projectId;
                child.userData.workspaceOnly = "GAMEPLAY_SAMPLE";
                child.userData.ignoreInHierarchy = false;
            });
        },

        _copySceneProperties(target, source) {
            target.name = source.name || target.name;

            target.background = source.background ?? null;
            target.environment = source.environment ?? null;
            target.fog = source.fog ?? null;
            target.overrideMaterial = source.overrideMaterial ?? null;

            if ("backgroundBlurriness" in source) {
                target.backgroundBlurriness = source.backgroundBlurriness;
            }
            if ("backgroundIntensity" in source) {
                target.backgroundIntensity = source.backgroundIntensity;
            }
            if ("environmentIntensity" in source) {
                target.environmentIntensity = source.environmentIntensity;
            }

            target.userData = {
                ...(target.userData || {}),
                ...(source.userData || {})
            };
        },

        _refreshEditorUI() {
            try { root.updateHierarchy?.(); } catch {}
            try { root.updateLayersUI?.(); } catch {}
            try { root.updateKeyframesUI?.(); } catch {}
            try { root.renderHierarchy?.(); } catch {}
            try { root.refreshOutliner?.(); } catch {}
        },

        _applyLoadedScene(AP, loadedScene, asset, options = {}) {
            const targetScene = AP.scene || root.scene;

            if (!targetScene?.isScene) {
                throw new Error("SM Engine target THREE.Scene was not found.");
            }

            if (options.replace !== false) {
                this._clearEditableScene(AP, targetScene);
            }

            this._copySceneProperties(targetScene, loadedScene);

            // Move loaded roots from the temporary parsed Scene into the editor Scene.
            const loadedChildren = [...loadedScene.children];

            for (const child of loadedChildren) {
                if (this._isPreservedObject(AP, child) && options.keepSerializedEditorHelpers !== true) {
                    continue;
                }

                loadedScene.remove(child);
                this._markLoadedTree(child, asset);
                targetScene.add(child);
            }

            targetScene.updateMatrixWorld?.(true);

            this.activeSceneAssetId = asset.id;

            targetScene.userData = targetScene.userData || {};
            targetScene.userData.smActiveSceneAssetId = asset.id;
            targetScene.userData.smActiveSceneId = asset.sceneId || null;
            targetScene.userData.smActiveSceneName = asset.name;

            AP.activeGameSceneAssetId = asset.id;

            this._refreshEditorUI();

            try {
                root.dispatchEvent(new CustomEvent("sm-game-scene-loaded", {
                    detail: {
                        asset,
                        scene: targetScene,
                        replace: options.replace !== false
                    }
                }));
            } catch {}

            return targetScene;
        },

        _installLoaderAPI(AP) {
            AP.openGameScene = function (reference, options = {}) {
                const bridge = root.GameSceneLoaderBridge;

                const asset = bridge._resolveSceneAsset(this, reference);

                if (!asset) {
                    console.warn("[AssetsPanel] Game Scene not found:", reference);
                    return null;
                }

                const payload = bridge._parsePayload(asset);

                if (!payload) {
                    alert(`"${asset.name}" is not a valid SM_GAME_SCENE asset.`);
                    return null;
                }

                let loadedScene;

                try {
                    const loader = new THREE.ObjectLoader();
                    loadedScene = loader.parse(payload.scene);
                } catch (error) {
                    console.error("[GameSceneLoaderBridge] ObjectLoader parse failed:", error);
                    alert(`Could not load scene "${asset.name}".\n${error.message}`);
                    return null;
                }

                if (!loadedScene?.isScene) {
                    alert(`"${asset.name}" did not deserialize to a THREE.Scene.`);
                    return null;
                }

                bridge._applyLoadedScene(this, loadedScene, asset, options);

                console.log(`[AssetsPanel] Opened Game Scene: ${asset.name}`, payload);

                return asset;
            };

            AP.reloadActiveGameScene = function () {
                const id =
                    this.activeGameSceneAssetId ||
                    root.GameSceneLoaderBridge.activeSceneAssetId;

                if (!id) {
                    console.warn("[AssetsPanel] No active Game Scene to reload.");
                    return null;
                }

                return this.openGameScene(id, { replace: true });
            };
        },

        _patchAddToScene(AP) {
            if (AP.__smGameSceneLoaderAddToSceneV4) return;
            AP.__smGameSceneLoaderAddToSceneV4 = true;

            const original = AP._addToScene;

            AP._addToScene = async function (assetId, ...args) {
                const asset = this._findById?.(assetId);

                if (asset?.type === "game-scene" || asset?.isGameScene) {
                    return this.openGameScene(asset, { replace: true });
                }

                return original?.call(this, assetId, ...args);
            };
        },

        _patchAssetContextMenu(AP) {
            if (AP.__smGameSceneLoaderContextMenuV4) return;
            AP.__smGameSceneLoaderContextMenuV4 = true;

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

                const item = document.createElement("div");
                item.className = "context-menu-item";
                item.innerHTML = `<i class="fas fa-folder-open"></i>&nbsp; Open Game Scene`;
                item.onclick = () => {
                    this.openGameScene(asset, { replace: true });
                    this.dom.contextMenu.style.display = "none";
                };

                this.dom.contextMenu.prepend(item);
                return result;
            };
        },

        _patchRender(AP) {
            if (AP.__smGameSceneLoaderRenderV4) return;
            AP.__smGameSceneLoaderRenderV4 = true;

            const original = AP.render;

            AP.render = function (...args) {
                const result = original.apply(this, args);

                const activeId =
                    this.activeGameSceneAssetId ||
                    root.GameSceneLoaderBridge.activeSceneAssetId;

                if (activeId) {
                    const item = this.dom?.grid?.querySelector?.(
                        `.asset-item[data-id="${String(activeId).replace(/"/g, '\\"')}"]`
                    );

                    if (item) {
                        item.classList.add("sm-active-game-scene");

                        const meta = item.querySelector(".asset-meta");
                        if (meta) meta.textContent = "Game Scene • Active";
                    }
                }

                return result;
            };
        }
    };

    root.GameSceneLoaderBridge = GameSceneLoaderBridge;

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => GameSceneLoaderBridge.install(),
            { once: true }
        );
    } else {
        GameSceneLoaderBridge.install();
    }
})(window);
