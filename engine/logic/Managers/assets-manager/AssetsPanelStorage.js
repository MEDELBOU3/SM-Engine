// ============================================================================
// AssetsPanelStorage.js - SM Engine Full Persistent Storage Layer
// Fixes: 88% hang on large GLB assets, IndexedDB transaction deadlock,
//        safe Blob handling, and quota-safe localStorage fallback.
// ============================================================================
(function (global) {
    "use strict";

    const AssetsPanel = global.AssetsPanel;
    if (!AssetsPanel) {
        throw new Error("[SMAssetsPanelStorageMixin] AssetsPanelCore must load first.");
    }

    // ========================================================================
    // 1. Built-in Robust IndexedDB Storage Manager (Handles 500MB+ Assets Safely)
    // ========================================================================
    class BuiltInAssetStorageManager {
        constructor() {
            this.dbName = "SMEngine_AssetDB";
            this.dbVersion = 2;
            this.db = null;
            this.saveTimer = null;
        }

        async init() {
            if (this.db) return this.db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains("assets")) {
                        db.createObjectStore("assets", { keyPath: "id" });
                    }
                    if (!db.objectStoreNames.contains("blobs")) {
                        db.createObjectStore("blobs", { keyPath: "id" });
                    }
                    if (!db.objectStoreNames.contains("folders")) {
                        db.createObjectStore("folders", { keyPath: "id" });
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };

                request.onerror = (event) => {
                    console.error("[StorageManager] IndexedDB open error:", event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async requestPersistentStorage() {
            if (navigator.storage && navigator.storage.persist) {
                return await navigator.storage.persist();
            }
            return false;
        }

        async estimate() {
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                return {
                    usageMB: (est.usage || 0) / (1024 * 1024),
                    quotaMB: (est.quota || 0) / (1024 * 1024)
                };
            }
            return { usageMB: 0, quotaMB: 0 };
        }

        // Clean an asset object to avoid DataCloneError in IndexedDB
        _sanitizeAsset(asset) {
            const clean = { ...asset };
            // Remove Three.js objects or circular structures
            delete clean.scene;
            delete clean.mesh;
            delete clean.object3d;
            delete clean.gltf;
            delete clean.textureObj;
            delete clean.materialObj;
            delete clean.dom;
            return clean;
        }

        async saveAsset(asset) {
            await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = this.db.transaction(["assets", "blobs"], "readwrite");
                    const assetStore = tx.objectStore("assets");
                    const blobStore = tx.objectStore("blobs");

                    let cleanAsset = this._sanitizeAsset(asset);

                    // If asset.data is Blob, ArrayBuffer, or File, store it safely in "blobs"
                    if (asset.data instanceof Blob || asset.data instanceof File) {
                        blobStore.put({ id: asset.id, blob: asset.data });
                        cleanAsset.data = null; // Don't duplicate in metadata
                        cleanAsset.hasBlob = true;
                    } else if (asset.data instanceof ArrayBuffer) {
                        const blob = new Blob([asset.data], { type: "application/octet-stream" });
                        blobStore.put({ id: asset.id, blob: blob });
                        cleanAsset.data = null;
                        cleanAsset.hasBlob = true;
                    }

                    assetStore.put(cleanAsset);

                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (err) => {
                        console.error("[StorageManager] Save transaction error:", err);
                        reject(err);
                    };
                    tx.onabort = (err) => {
                        console.error("[StorageManager] Save transaction aborted:", err);
                        reject(err);
                    };
                } catch (err) {
                    console.error("[StorageManager] Exception during saveAsset:", err);
                    reject(err);
                }
            });
        }

        async getAssetBlob(assetId) {
            await this.init();
            return new Promise((resolve) => {
                const tx = this.db.transaction(["blobs"], "readonly");
                const store = tx.objectStore("blobs");
                const req = store.get(assetId);
                req.onsuccess = () => resolve(req.result?.blob || null);
                req.onerror = () => resolve(null);
            });
        }

        async loadLibrary() {
            await this.init();
            return new Promise((resolve) => {
                const tx = this.db.transaction(["assets", "folders"], "readonly");
                const assetStore = tx.objectStore("assets");
                const folderStore = tx.objectStore("folders");

                const reqAssets = assetStore.getAll();
                const reqFolders = folderStore.getAll();

                tx.oncomplete = () => {
                    const foldersObj = {};
                    (reqFolders.result || []).forEach(f => {
                        foldersObj[f.id] = f;
                    });
                    resolve({
                        assets: reqAssets.result || [],
                        folders: foldersObj
                    });
                };

                tx.onerror = () => {
                    resolve({ assets: [], folders: {} });
                };
            });
        }

        async saveLibrary(assets, folders) {
            await this.init();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(["assets", "folders"], "readwrite");
                const assetStore = tx.objectStore("assets");
                const folderStore = tx.objectStore("folders");

                assetStore.clear();
                folderStore.clear();

                (assets || []).forEach((asset) => {
                    if (!asset.isBuiltIn) {
                        assetStore.put(this._sanitizeAsset(asset));
                    }
                });

                if (folders) {
                    Object.values(folders).forEach((folder) => {
                        folderStore.put(folder);
                    });
                }

                tx.oncomplete = () => resolve(true);
                tx.onerror = (e) => reject(e);
            });
        }

        scheduleSaveLibrary(assets, folders, delay = 250) {
            clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => {
                this.saveLibrary(assets, folders).catch(err => {
                    console.warn("[StorageManager] scheduleSaveLibrary error:", err);
                });
            }, delay);
        }

        async mountProjectDirectory(options) {
            if (!window.showDirectoryPicker) {
                console.warn("File System Access API is not supported in this browser.");
                return null;
            }
            return await window.showDirectoryPicker(options);
        }

        async getProjectDirectoryHandle() {
            return null;
        }

        async exportLibraryToProjectDirectory(assets, folders, options = {}) {
            let handle = await this.mountProjectDirectory({ mode: "readwrite" });
            if (!handle) return { written: 0, skipped: 0, directoryName: "" };

            let written = 0;
            for (const asset of assets) {
                if (asset.isBuiltIn) continue;
                try {
                    let blob = null;
                    if (asset.data instanceof Blob) {
                        blob = asset.data;
                    } else if (asset.hasBlob) {
                        blob = await this.getAssetBlob(asset.id);
                    }
                    if (blob) {
                        const fileHandle = await handle.getFileHandle(asset.name, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        written++;
                    }
                } catch (e) {
                    console.warn(`[StorageManager] Failed to write asset ${asset.name}:`, e);
                }
            }
            return { written, skipped: 0, directoryName: handle.name };
        }
    }

    // ========================================================================
    // 2. SMAssetsPanelStorageMixin Implementation
    // ========================================================================
    class SMAssetsPanelStorageMixin {
        static _initializePersistentAssetStorage() {
            if (this.assetStorageReady) {
                return this.assetStorageReady;
            }

            // If an external AssetStorageManager is defined, use it; otherwise use the built-in one
            if (typeof window.AssetStorageManager === "function") {
                this.assetStorage = new window.AssetStorageManager();
            } else {
                this.assetStorage = new BuiltInAssetStorageManager();
            }

            this.assetStorageReady = (async () => {
                await this.assetStorage.init();

                const persistent = await this.assetStorage
                    .requestPersistentStorage()
                    .catch(() => false);

                const stored = await this.assetStorage.loadLibrary();

                const currentBuiltIns = this.assets.filter((a) => a?.isBuiltIn);
                const currentUserAssets = this.assets.filter((a) => a && !a.isBuiltIn);

                if (stored.assets && stored.assets.length) {
                    this.assets = [...stored.assets, ...currentBuiltIns];
                    if (stored.folders && Object.keys(stored.folders).length) {
                        this.folders = { ...stored.folders, ...this.folders };
                    }
                } else if (currentUserAssets.length) {
                    await this.assetStorage.saveLibrary(this.assets, this.folders);
                    const migrated = await this.assetStorage.loadLibrary();
                    this.assets = [...migrated.assets, ...currentBuiltIns];
                    if (migrated.folders && Object.keys(migrated.folders).length) {
                        this.folders = { ...migrated.folders, ...this.folders };
                    }
                }

                this._ensureBuiltins?.();
                this._repairGameplayFolderTree?.();
                this._ensureProjectManifestAssets?.();
                this.ensureScriptsFolder?.();
                this._syncRuntimeAssetRegistry?.();

                this.assetStorageHydrated = true;

                const imageRefresh = await this.refreshImageAssetPreviews?.();
                if (imageRefresh?.changed) this._saveToStorage();

                this._saveLocalStorageMetadataFallback();
                this.render();
                this._buildTagCloud?.();
                this._ensurePersistenceButton();

                const estimate = await this.assetStorage.estimate().catch(() => null);

                console.log("[AssetsPanel] Persistent library ready.", {
                    persistent,
                    assets: this.assets.filter((a) => !a.isBuiltIn).length,
                    usageMB: estimate?.usageMB?.toFixed?.(1) || 0,
                    quotaMB: estimate?.quotaMB?.toFixed?.(1) || 0
                });

                return this.assetStorage;
            })().catch((error) => {
                console.error("AssetsPanel: Failed to initialize persistent storage.", error);
                this.assetStorage = null;
                return null;
            });

            return this.assetStorageReady;
        }

        static async _getPersistentAssetStorage() {
            if (!this.assetStorageReady) {
                this._initializePersistentAssetStorage();
            }
            return await this.assetStorageReady;
        }

        // Keep local storage light and safe from QuotaExceeded crashes
        static _safeLocalStorageAssetRecord(asset) {
            return {
                id: asset.id,
                name: asset.name,
                type: asset.type,
                // Only allow small thumbnails to prevent 5MB localStorage crash
                thumbnail: (typeof asset.thumbnail === "string" && asset.thumbnail.length <= 48 * 1024)
                    ? asset.thumbnail
                    : null,
                isFavorite: !!asset.isFavorite,
                isBuiltIn: false,
                folderId: asset.folderId || null,
                tags: Array.isArray(asset.tags) ? [...asset.tags] : [],
                history: Array.isArray(asset.history) ? asset.history.slice(-5) : [],
                references: Array.isArray(asset.references) ? [...asset.references] : [],
                sourceType: asset.sourceType || null,
                data: null // Never store binary GLB/Texture data inside localStorage
            };
        }

        static _saveLocalStorageMetadataFallback() {
            try {
                const version = this.lastStorageVersion || 4;
                const payload = {
                    version: version,
                    storageMode: "indexeddb",
                    assets: (this.assets || [])
                        .filter((a) => !a.isBuiltIn)
                        .map((a) => this._safeLocalStorageAssetRecord(a)),
                    folders: this.folders || {}
                };

                localStorage.setItem(`assetsPanel_data_v${version}`, JSON.stringify(payload));
            } catch (error) {
                console.warn("AssetsPanel: localStorage fallback quota exceeded or unavailable.", error);
            }
        }

        static async getPersistenceStatus() {
            const storage = await this._getPersistentAssetStorage();
            const estimate = await storage?.estimate?.();
            const projectFolder = await storage?.getProjectDirectoryHandle?.().catch(() => null);

            return {
                backend: storage ? "indexeddb" : "localStorage-fallback",
                hydrated: !!this.assetStorageHydrated,
                userAssets: (this.assets || []).filter((a) => !a.isBuiltIn).length,
                folders: Object.keys(this.folders || {}).length,
                usageMB: estimate?.usageMB || 0,
                quotaMB: estimate?.quotaMB || 0,
                projectFolder: projectFolder?.name || null
            };
        }

        static async mountProjectAssetsFolder() {
            const storage = await this._getPersistentAssetStorage();
            if (!storage) {
                alert("Persistent storage is not available.");
                return null;
            }
            try {
                const handle = await storage.mountProjectDirectory({ forcePicker: true });
                this._ensurePersistenceButton();
                return handle;
            } catch (error) {
                if (error?.name !== "AbortError") {
                    console.error("AssetsPanel: Could not mount project Assets folder.", error);
                }
                return null;
            }
        }

        static async saveAssetsToDeviceFolder({ forcePicker = false, folderId = null } = {}) {
            const storage = await this._getPersistentAssetStorage();
            if (!storage) {
                alert("Persistent storage is not available.");
                return false;
            }

            let assetsToExport = this.assets;
            if (folderId) {
                const treeIds = new Set();
                const collectTree = (id) => {
                    treeIds.add(id);
                    Object.values(this.folders || {})
                        .filter((f) => f.parentId === id)
                        .forEach((f) => collectTree(f.id));
                };
                collectTree(folderId);
                assetsToExport = this.assets.filter((a) => a && treeIds.has(a.folderId));
            }

            try {
                const result = await storage.exportLibraryToProjectDirectory(
                    assetsToExport,
                    this.folders,
                    { forcePicker }
                );

                this._showSaveToast(`✅ Saved ${result.written} file(s) to "${result.directoryName}"`);
                return result;
            } catch (error) {
                if (error?.name !== "AbortError") {
                    console.error("AssetsPanel: Failed to save to device folder.", error);
                    this._showSaveToast("❌ Could not save to device folder.", true);
                }
                return false;
            }
        }

        static async saveFolderToDevice(folderId) {
            if (!folderId || !this.folders?.[folderId]) return;
            await this.saveAssetsToDeviceFolder({ forcePicker: true, folderId });
        }

        static _showSaveToast(message, isError = false) {
            const panel = this.dom?.panel || document.getElementById("assetsPanel");
            if (!panel) return;

            let toast = document.getElementById("smAssetsSaveToast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "smAssetsSaveToast";
                toast.style.cssText = [
                    "position:absolute", "bottom:14px", "left:50%",
                    "transform:translateX(-50%)", "z-index:99999",
                    "padding:8px 18px", "border-radius:6px",
                    "font-size:13px", "font-family:sans-serif",
                    "box-shadow:0 4px 16px rgba(0,0,0,.5)",
                    "pointer-events:none", "transition:opacity .3s",
                    "white-space:nowrap", "max-width:90%"
                ].join(";");
                panel.style.position = "relative";
                panel.appendChild(toast);
            }

            toast.textContent = message;
            toast.style.background = isError ? "#8a2424" : "#1e6b37";
            toast.style.color = "#fff";
            toast.style.opacity = "1";

            clearTimeout(toast._hideTimer);
            toast._hideTimer = setTimeout(() => {
                toast.style.opacity = "0";
            }, 3500);
        }

        static _ensurePersistenceButton() {
            if (document.getElementById("cbSaveLibraryDeviceBtn")) return;

            const host =
                this.dom?.panel?.querySelector(".cb-primary-actions") ||
                this.dom?.panel?.querySelector(".cb-toolbar-actions");

            if (!host) return;

            const button = document.createElement("button");
            button.id = "cbSaveLibraryDeviceBtn";
            button.className = "cb-action-btn";
            button.title = "Save a user-visible copy to device folder";
            button.innerHTML = '<i class="fas fa-folder-arrow-down"></i><span>Save Library</span>';
            button.addEventListener("click", () => this.saveAssetsToDeviceFolder());
            host.appendChild(button);
        }

        // Asynchronously save asset to avoid deadlock in UI during import queue
        static async saveSingleAsset(asset) {
            const storage = await this._getPersistentAssetStorage();
            if (storage && typeof storage.saveAsset === "function") {
                await storage.saveAsset(asset);
            }
            this._saveLocalStorageMetadataFallback();
            this._syncRuntimeAssetRegistry?.();
            if (typeof this.onAssetsChanged === "function") {
                this.onAssetsChanged(this.assets, this.folders);
            }
        }

        static _saveToStorage() {
            this._saveLocalStorageMetadataFallback();
            this._getPersistentAssetStorage()
                .then((storage) => {
                    if (!storage) return;
                    storage.scheduleSaveLibrary(this.assets, this.folders, 200);
                })
                .catch((error) => {
                    console.error("AssetsPanel: Failed to queue persistent save.", error);
                });

            this._syncRuntimeAssetRegistry?.();

            if (typeof this.onAssetsChanged === "function") {
                this.onAssetsChanged(this.assets, this.folders);
            }
        }

        static _loadFromStorage() {
            try {
                const version = this.lastStorageVersion || 4;
                const raw = localStorage.getItem(`assetsPanel_data_v${version}`);
                if (!raw) return this._migrateLegacy();

                const data = JSON.parse(raw);
                if (data.assets) {
                    this.assets = data.assets.filter((a) => !a.isBuiltIn);
                }
                if (data.folders) this.folders = data.folders;
            } catch (e) {
                console.error("AssetsPanel: Failed to load from localStorage fallback", e);
                this._migrateLegacy();
            }
        }

        static _migrateLegacy() {
            if (this.assets && this.assets.length > 0) return;
            const v3Raw = localStorage.getItem("assetsPanel_data_v3");
            if (v3Raw) {
                try {
                    const data = JSON.parse(v3Raw);
                    if (data.assets) {
                        this.assets = data.assets.map((a) => ({
                            ...a,
                            history: a.history || [],
                            references: a.references || []
                        }));
                    }
                    if (data.folders) this.folders = data.folders;
                    this._saveToStorage();
                    localStorage.removeItem("assetsPanel_data_v3");
                } catch (e) {
                    console.warn("AssetsPanel: Legacy migration failed", e);
                }
            }
        }
    }

    // Attach all methods cleanly to global AssetsPanel
    for (const key of Reflect.ownKeys(SMAssetsPanelStorageMixin)) {
        if (key === "length" || key === "name" || key === "prototype") continue;
        const descriptor = Object.getOwnPropertyDescriptor(SMAssetsPanelStorageMixin, key);
        if (!descriptor) continue;
        Object.defineProperty(AssetsPanel, key, descriptor);
    }

    global.__SMAssetsPanelLoadedModules = global.__SMAssetsPanelLoadedModules || [];
    global.__SMAssetsPanelLoadedModules.push("AssetsPanelStorage");

})(window);