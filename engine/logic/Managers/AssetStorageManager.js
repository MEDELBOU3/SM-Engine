// ============================================================================
// engine/assets/Managers/AssetStorageManager.js
// SM Engine - Persistent Asset Library Storage
//
// PRIMARY STORAGE:
//   IndexedDB -> metadata + binary Blobs
//
// SMALL FALLBACK:
//   localStorage -> handled by AssetsPanel for UI/library metadata only
//
// OPTIONAL USER-VISIBLE BACKUP:
//   File System Access API -> user-selected project Assets directory
//
// Why:
//   localStorage is not suitable for GLB/FBX/OBJ/textures/HDR files because
//   it has a small quota and stores strings only. IndexedDB can persist Blobs.
// ============================================================================
(function () {
    class AssetStorageManager {
        constructor(options = {}) {
            this.options = {
                dbName: "SMEngineAssetLibrary",
                dbVersion: 1,
                metaStore: "assetMeta",
                blobStore: "assetBlobs",
                libraryStore: "library",
                settingsStore: "settings",
                persistentStorage: true,
                ...options
            };

            this.db = null;
            this.ready = false;
            this.objectURLs = new Map();
            this._saveTimer = null;
            this._saveInFlight = Promise.resolve();
            this._projectDirectoryHandle = null;
        }

        async init() {
            if (this.ready && this.db) return this;

            this.db = await this._openDB();
            this.ready = true;

            if (this.options.persistentStorage) {
                this.requestPersistentStorage().catch(() => { });
            }

            this._projectDirectoryHandle =
                await this._getSetting("projectDirectoryHandle").catch(() => null);

            return this;
        }

        _openDB() {
            return new Promise((resolve, reject) => {
                if (!window.indexedDB) {
                    reject(new Error("IndexedDB is not available."));
                    return;
                }

                const request = indexedDB.open(
                    this.options.dbName,
                    this.options.dbVersion
                );

                request.onupgradeneeded = () => {
                    const db = request.result;

                    if (!db.objectStoreNames.contains(this.options.metaStore)) {
                        db.createObjectStore(this.options.metaStore, {
                            keyPath: "id"
                        });
                    }

                    if (!db.objectStoreNames.contains(this.options.blobStore)) {
                        db.createObjectStore(this.options.blobStore, {
                            keyPath: "id"
                        });
                    }

                    if (!db.objectStoreNames.contains(this.options.libraryStore)) {
                        db.createObjectStore(this.options.libraryStore, {
                            keyPath: "key"
                        });
                    }

                    if (!db.objectStoreNames.contains(this.options.settingsStore)) {
                        db.createObjectStore(this.options.settingsStore, {
                            keyPath: "key"
                        });
                    }
                };

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                request.onblocked = () => {
                    console.warn(
                        "[AssetStorageManager] IndexedDB upgrade is blocked by another tab."
                    );
                };
            });
        }

        _transaction(storeNames, mode = "readonly") {
            if (!this.db) {
                throw new Error("AssetStorageManager is not initialized.");
            }

            return this.db.transaction(storeNames, mode);
        }

        _requestToPromise(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        _transactionDone(transaction) {
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () =>
                    reject(transaction.error || new Error("IndexedDB transaction aborted."));
            });
        }

        async requestPersistentStorage() {
            if (!navigator.storage?.persist) return false;

            try {
                const alreadyPersistent =
                    await navigator.storage.persisted?.();

                if (alreadyPersistent) return true;

                return await navigator.storage.persist();
            } catch (error) {
                console.warn(
                    "[AssetStorageManager] Persistent-storage request failed:",
                    error
                );
                return false;
            }
        }

        async estimate() {
            if (!navigator.storage?.estimate) return null;

            const estimate = await navigator.storage.estimate();

            return {
                usage: Number(estimate.usage || 0),
                quota: Number(estimate.quota || 0),
                usageMB: Number(estimate.usage || 0) / 1024 / 1024,
                quotaMB: Number(estimate.quota || 0) / 1024 / 1024
            };
        }

        async saveImportedFile(assetId, file) {
            await this.init();

            if (!assetId || !file) return false;

            const blob =
                file instanceof Blob
                    ? file
                    : new Blob([file]);

            const transaction = this._transaction(
                [this.options.blobStore],
                "readwrite"
            );

            transaction
                .objectStore(this.options.blobStore)
                .put({
                    id: assetId,
                    blob,
                    name: file.name || "",
                    type: file.type || "",
                    size: Number(file.size || blob.size || 0),
                    lastModified: Number(file.lastModified || 0)
                });

            await this._transactionDone(transaction);
            return true;
        }

        async saveBlob(assetId, blob, metadata = {}) {
            await this.init();

            if (!assetId || !(blob instanceof Blob)) return false;

            const transaction = this._transaction(
                [this.options.blobStore],
                "readwrite"
            );

            transaction
                .objectStore(this.options.blobStore)
                .put({
                    id: assetId,
                    blob,
                    name: metadata.name || "",
                    type: metadata.type || blob.type || "",
                    size: Number(blob.size || 0),
                    lastModified: Number(metadata.lastModified || 0)
                });

            await this._transactionDone(transaction);
            return true;
        }

        async getBlob(assetId) {
            await this.init();

            const transaction = this._transaction(
                [this.options.blobStore],
                "readonly"
            );

            const result = await this._requestToPromise(
                transaction
                    .objectStore(this.options.blobStore)
                    .get(assetId)
            );

            return result?.blob || null;
        }

        async hasBlob(assetId) {
            return !!(await this.getBlob(assetId));
        }

        _revokeObjectURL(assetId) {
            const current = this.objectURLs.get(assetId);

            if (current) {
                try {
                    URL.revokeObjectURL(current);
                } catch (_) { }

                this.objectURLs.delete(assetId);
            }
        }

        createRuntimeURL(assetId, blob) {
            if (!assetId || !(blob instanceof Blob)) return null;

            this._revokeObjectURL(assetId);

            const url = URL.createObjectURL(blob);
            this.objectURLs.set(assetId, url);

            return url;
        }

        async resolveAssetData(asset) {
            if (!asset) return null;

            if (
                asset.storageKind === "indexeddb-blob" ||
                asset.storageKey
            ) {
                const blob = await this.getBlob(
                    asset.storageKey || asset.id
                );

                if (!blob) return asset.data || null;

                const runtimeURL =
                    this.createRuntimeURL(asset.id, blob);

                asset.data = runtimeURL;
                asset.storageKind = "indexeddb-blob";
                asset.storageKey = asset.storageKey || asset.id;

                return runtimeURL;
            }

            return asset.data || null;
        }

        _isRemoteURL(value = "") {
            return /^https?:\/\//i.test(String(value || ""));
        }

        _isBlobURL(value = "") {
            return /^blob:/i.test(String(value || ""));
        }

        _isDataURL(value = "") {
            return /^data:/i.test(String(value || ""));
        }

        _isTextAsset(asset) {
            return ["code", "material", "scene"].includes(
                String(asset?.type || "").toLowerCase()
            );
        }

        _cloneJSONSafe(value, fallback = null) {
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (_) {
                return fallback;
            }
        }

        async _dataURLToBlob(dataURL) {
            const response = await fetch(dataURL);
            return await response.blob();
        }

        async _blobURLToBlob(blobURL) {
            const response = await fetch(blobURL);
            return await response.blob();
        }

        async _serializeAsset(asset) {
            const data = asset?.data;
            let storageKind =
                asset.storageKind ||
                null;

            let sourceData = null;

            if (this._isTextAsset(asset)) {
                sourceData =
                    typeof data === "string"
                        ? data
                        : "";
                storageKind = "text";
            } else if (
                asset?.sourceType === "google-drive" ||
                this._isRemoteURL(data)
            ) {
                sourceData =
                    typeof data === "string"
                        ? data
                        : "";
                storageKind = "remote";
            } else if (
                storageKind === "indexeddb-blob" ||
                asset?.storageKey
            ) {
                storageKind = "indexeddb-blob";
            } else if (
                typeof data === "string" &&
                this._isDataURL(data)
            ) {
                // Legacy migration: move the large data URL out of localStorage
                // and into the Blob store.
                try {
                    const blob = await this._dataURLToBlob(data);
                    await this.saveBlob(asset.id, blob, {
                        name: asset.name
                    });

                    storageKind = "indexeddb-blob";
                    asset.storageKind = storageKind;
                    asset.storageKey = asset.id;
                    asset.data =
                        this.createRuntimeURL(asset.id, blob);
                } catch (error) {
                    console.warn(
                        `[AssetStorageManager] Could not migrate data URL for ${asset.name}.`,
                        error
                    );

                    sourceData = data;
                    storageKind = "legacy-inline";
                }
            } else if (
                typeof data === "string" &&
                this._isBlobURL(data)
            ) {
                // A runtime object URL imported before the storage manager was
                // ready. Persist it now.
                try {
                    const blob = await this._blobURLToBlob(data);
                    await this.saveBlob(asset.id, blob, {
                        name: asset.name
                    });

                    storageKind = "indexeddb-blob";
                    asset.storageKind = storageKind;
                    asset.storageKey = asset.id;
                } catch (error) {
                    console.warn(
                        `[AssetStorageManager] Could not persist blob URL for ${asset.name}.`,
                        error
                    );
                }
            } else if (typeof data === "string") {
                sourceData = data;
                storageKind = storageKind || "source";
            }

            return {
                id: asset.id,
                name: asset.name,
                type: asset.type,
                sourceData,
                storageKind,
                storageKey:
                    storageKind === "indexeddb-blob"
                        ? (asset.storageKey || asset.id)
                        : null,
                thumbnail: asset.thumbnail || null,
                thumbnailVersion: Number(asset.thumbnailVersion || 0),
                isFavorite: !!asset.isFavorite,
                isBuiltIn: false,
                folderId: asset.folderId || null,
                tags: Array.isArray(asset.tags)
                    ? [...asset.tags]
                    : [],
                definition:
                    this._cloneJSONSafe(asset.definition, null),
                history:
                    this._cloneJSONSafe(asset.history, []),
                references: Array.isArray(asset.references)
                    ? [...asset.references]
                    : [],
                isHDRIPackage: asset.isHDRIPackage === true,
                hdriPackage: this._cloneJSONSafe(asset.hdriPackage, null),
                isSpriteSheet: asset.isSpriteSheet === true,
                spriteSheet: this._cloneJSONSafe(asset.spriteSheet, null),
                sourceType: asset.sourceType || null,
                sourcePath: asset.sourcePath || null,
                sourceDimensions: this._cloneJSONSafe(asset.sourceDimensions, null),
                driveFileId: asset.driveFileId || null,
                driveMimeType: asset.driveMimeType || null,
                sourceRelativePath:
                    asset.sourceRelativePath || null,
                sourceModifiedTime:
                    asset.sourceModifiedTime || null,
                sourceLastModified:
                    Number(asset.sourceLastModified || 0),
                sourceSize:
                    Number(asset.sourceSize || 0),
                remote: asset.remote === true
            };
        }

        async saveLibrary(assets = [], folders = {}) {
            await this.init();

            const userAssets = (assets || []).filter(
                asset =>
                    asset &&
                    asset.id &&
                    !asset.isBuiltIn
            );

            const serialized = [];

            // Serialize assets first
            for (const asset of userAssets) {
                serialized.push(
                    await this._serializeAsset(asset)
                );
            }

            // --------------------------------------------------
            // IMPORTANT:
            // Get existing keys BEFORE opening the write transaction.
            // --------------------------------------------------
            const readTransaction = this._transaction(
                [this.options.metaStore],
                "readonly"
            );

            const metaStoreRead =
                readTransaction.objectStore(this.options.metaStore);

            const existingKeys =
                await this._requestToPromise(
                    metaStoreRead.getAllKeys()
                );

            // --------------------------------------------------
            // Now create a fresh readwrite transaction.
            // --------------------------------------------------
            const transaction = this._transaction(
                [
                    this.options.metaStore,
                    this.options.libraryStore
                ],
                "readwrite"
            );

            const metaStore =
                transaction.objectStore(this.options.metaStore);

            const keepIds = new Set(
                serialized.map(record => record.id)
            );

            // Delete removed assets
            for (const key of existingKeys || []) {
                if (!keepIds.has(key)) {
                    metaStore.delete(key);
                }
            }

            // Save metadata
            for (const record of serialized) {
                metaStore.put(record);
            }

            // Save folders
            transaction
                .objectStore(this.options.libraryStore)
                .put({
                    key: "folders",
                    value: this._cloneJSONSafe(
                        folders,
                        {}
                    ),
                    savedAt: Date.now()
                });

            await this._transactionDone(transaction);

            // Cleanup orphaned blobs
            await this._removeOrphanedBlobs(keepIds);

            return {
                assetCount: serialized.length,
                folderCount: Object.keys(folders || {}).length
            };
        }

        scheduleSaveLibrary(
            assets = [],
            folders = {},
            delay = 250
        ) {
            clearTimeout(this._saveTimer);

            this._saveTimer = setTimeout(() => {
                this._saveInFlight =
                    this._saveInFlight
                        .catch(() => { })
                        .then(() =>
                            this.saveLibrary(
                                assets,
                                folders
                            )
                        )
                        .catch((error) => {
                            console.error(
                                "[AssetStorageManager] Save failed:",
                                error
                            );
                        });
            }, delay);

            return this._saveInFlight;
        }

        async flush() {
            clearTimeout(this._saveTimer);
            return this._saveInFlight;
        }

        async _removeOrphanedBlobs(keepIds) {
            const transaction = this._transaction(
                [this.options.blobStore],
                "readwrite"
            );

            const store =
                transaction.objectStore(this.options.blobStore);

            const keys =
                await this._requestToPromise(store.getAllKeys());

            for (const key of keys || []) {
                if (!keepIds.has(key)) {
                    store.delete(key);
                    this._revokeObjectURL(key);
                }
            }

            await this._transactionDone(transaction);
        }

        async loadLibrary() {
            await this.init();

            const metaTransaction = this._transaction(
                [
                    this.options.metaStore,
                    this.options.libraryStore
                ],
                "readonly"
            );

            const metaStore =
                metaTransaction.objectStore(this.options.metaStore);

            const records =
                await this._requestToPromise(metaStore.getAll());

            const folderRecord =
                await this._requestToPromise(
                    metaTransaction
                        .objectStore(this.options.libraryStore)
                        .get("folders")
                );

            const assets = [];

            for (const record of records || []) {
                const asset = {
                    id: record.id,
                    name: record.name,
                    type: record.type,
                    data: record.sourceData || null,
                    thumbnail: record.thumbnail || null,
                    thumbnailVersion: Number(record.thumbnailVersion || 0),
                    isFavorite: !!record.isFavorite,
                    isBuiltIn: false,
                    folderId: record.folderId || null,
                    tags: Array.isArray(record.tags)
                        ? [...record.tags]
                        : [],
                    definition:
                        record.definition || undefined,
                    history: Array.isArray(record.history)
                        ? record.history
                        : [],
                    references: Array.isArray(record.references)
                        ? record.references
                        : [],
                    isHDRIPackage: record.isHDRIPackage === true,
                    hdriPackage: record.hdriPackage || null,
                    isSpriteSheet: record.isSpriteSheet === true,
                    spriteSheet: record.spriteSheet || null,
                    sourceType: record.sourceType || null,
                    sourcePath: record.sourcePath || null,
                    sourceDimensions: record.sourceDimensions || null,
                    driveFileId: record.driveFileId || null,
                    driveMimeType: record.driveMimeType || null,
                    sourceRelativePath:
                        record.sourceRelativePath || null,
                    sourceModifiedTime:
                        record.sourceModifiedTime || null,
                    sourceLastModified:
                        Number(record.sourceLastModified || 0),
                    sourceSize:
                        Number(record.sourceSize || 0),
                    remote: record.remote === true,
                    storageKind: record.storageKind || null,
                    storageKey: record.storageKey || null
                };

                if (
                    record.storageKind === "indexeddb-blob"
                ) {
                    const blob = await this.getBlob(
                        record.storageKey || record.id
                    );

                    if (blob) {
                        asset.data =
                            this.createRuntimeURL(
                                record.id,
                                blob
                            );
                        asset.storageKey =
                            record.storageKey || record.id;
                    } else {
                        asset.missingStoredFile = true;
                    }
                }

                assets.push(asset);
            }

            return {
                assets,
                folders:
                    folderRecord?.value || {},
                savedAt:
                    folderRecord?.savedAt || 0
            };
        }

        async deleteAsset(assetId) {
            await this.init();

            this._revokeObjectURL(assetId);

            const transaction = this._transaction(
                [
                    this.options.metaStore,
                    this.options.blobStore
                ],
                "readwrite"
            );

            transaction
                .objectStore(this.options.metaStore)
                .delete(assetId);

            transaction
                .objectStore(this.options.blobStore)
                .delete(assetId);

            await this._transactionDone(transaction);
            return true;
        }

        async clearLibrary() {
            await this.init();

            for (const id of this.objectURLs.keys()) {
                this._revokeObjectURL(id);
            }

            const transaction = this._transaction(
                [
                    this.options.metaStore,
                    this.options.blobStore,
                    this.options.libraryStore
                ],
                "readwrite"
            );

            transaction.objectStore(this.options.metaStore).clear();
            transaction.objectStore(this.options.blobStore).clear();
            transaction.objectStore(this.options.libraryStore).clear();

            await this._transactionDone(transaction);
        }

        async _putSetting(key, value) {
            await this.init();

            const transaction = this._transaction(
                [this.options.settingsStore],
                "readwrite"
            );

            transaction
                .objectStore(this.options.settingsStore)
                .put({
                    key,
                    value
                });

            await this._transactionDone(transaction);
        }

        async _getSetting(key) {
            await this.init();

            const transaction = this._transaction(
                [this.options.settingsStore],
                "readonly"
            );

            const result =
                await this._requestToPromise(
                    transaction
                        .objectStore(this.options.settingsStore)
                        .get(key)
                );

            return result?.value ?? null;
        }

        async _verifyDirectoryPermission(
            handle,
            request = false
        ) {
            if (!handle) return false;

            try {
                if (
                    typeof handle.queryPermission !== "function"
                ) {
                    return true;
                }

                const options = {
                    mode: "readwrite"
                };

                const current =
                    await handle.queryPermission(options);

                if (current === "granted") {
                    return true;
                }

                if (
                    request &&
                    typeof handle.requestPermission ===
                    "function"
                ) {
                    const next =
                        await handle.requestPermission(
                            options
                        );

                    return next === "granted";
                }
            } catch (error) {
                console.warn(
                    "[AssetStorageManager] Directory permission check failed:",
                    error
                );
            }

            return false;
        }

        async mountProjectDirectory({
            forcePicker = false
        } = {}) {
            await this.init();

            if (
                typeof window.showDirectoryPicker !==
                "function"
            ) {
                throw new Error(
                    "File System Access API is not supported in this browser."
                );
            }

            let handle =
                !forcePicker
                    ? this._projectDirectoryHandle
                    : null;

            if (
                handle &&
                !(await this._verifyDirectoryPermission(
                    handle,
                    true
                ))
            ) {
                handle = null;
            }

            if (!handle) {
                handle =
                    await window.showDirectoryPicker({
                        id: "sm-engine-project-assets",
                        mode: "readwrite"
                    });
            }

            if (
                !(await this._verifyDirectoryPermission(
                    handle,
                    true
                ))
            ) {
                throw new Error(
                    "Write permission was not granted for the project Assets folder."
                );
            }

            this._projectDirectoryHandle = handle;

            try {
                await this._putSetting(
                    "projectDirectoryHandle",
                    handle
                );
            } catch (error) {
                // Some browsers may not clone a handle into IDB.
                console.warn(
                    "[AssetStorageManager] Could not persist directory handle:",
                    error
                );
            }

            return handle;
        }

        async getProjectDirectoryHandle({
            requestPermission = false
        } = {}) {
            await this.init();

            const handle =
                this._projectDirectoryHandle;

            if (!handle) return null;

            const allowed =
                await this._verifyDirectoryPermission(
                    handle,
                    requestPermission
                );

            return allowed ? handle : null;
        }

        _folderPathForAsset(
            asset,
            folders = {}
        ) {
            const parts = [];
            let folderId = asset?.folderId || null;
            const visited = new Set();

            while (
                folderId &&
                folders[folderId] &&
                !visited.has(folderId)
            ) {
                visited.add(folderId);

                const folder = folders[folderId];

                if (
                    folder?.name &&
                    folder.sourceType !== "google-drive"
                ) {
                    parts.unshift(folder.name);
                } else if (folder?.name) {
                    parts.unshift(folder.name);
                }

                folderId = folder.parentId || null;
            }

            return parts;
        }

        async _ensureSubdirectory(
            rootHandle,
            parts
        ) {
            let current = rootHandle;

            for (const part of parts || []) {
                current =
                    await current.getDirectoryHandle(
                        part,
                        {
                            create: true
                        }
                    );
            }

            return current;
        }

        async _assetToBlob(asset) {
            if (!asset) return null;

            if (
                asset.storageKind === "indexeddb-blob" ||
                asset.storageKey
            ) {
                const blob =
                    await this.getBlob(
                        asset.storageKey || asset.id
                    );

                if (blob) return blob;
            }

            if (
                typeof asset.data === "string" &&
                (
                    this._isRemoteURL(asset.data) ||
                    this._isBlobURL(asset.data) ||
                    this._isDataURL(asset.data)
                )
            ) {
                try {
                    const response =
                        await fetch(asset.data);

                    if (response.ok) {
                        return await response.blob();
                    }
                } catch (error) {
                    console.warn(
                        `[AssetStorageManager] Could not fetch ${asset.name} for device export.`,
                        error
                    );
                }
            }

            if (
                typeof asset.data === "string"
            ) {
                const mime =
                    asset.type === "code"
                        ? "text/javascript"
                        : asset.type === "material"
                            ? "application/json"
                            : "text/plain";

                return new Blob(
                    [asset.data],
                    {
                        type: mime
                    }
                );
            }

            return null;
        }

        async exportLibraryToProjectDirectory(
            assets,
            folders,
            options = {}
        ) {
            if (typeof window.showDirectoryPicker !== "function") {
                return await this.exportLibraryAsZip(
                    assets,
                    folders,
                    options.zipName || "Project-Assets.zip"
                );
            }

            const root =
                await this.mountProjectDirectory({
                    forcePicker:
                        options.forcePicker === true
                });

            const userAssets =
                (assets || []).filter(
                    (asset) =>
                        asset &&
                        !asset.isBuiltIn &&
                        asset.name
                );

            let written = 0;
            let skipped = 0;

            for (const asset of userAssets) {
                const blob =
                    await this._assetToBlob(asset);

                if (!blob) {
                    skipped++;
                    continue;
                }

                const path =
                    this._folderPathForAsset(
                        asset,
                        folders
                    );

                const directory =
                    await this._ensureSubdirectory(
                        root,
                        path
                    );

                const fileHandle =
                    await directory.getFileHandle(
                        asset.name,
                        {
                            create: true
                        }
                    );

                const writable =
                    await fileHandle.createWritable();

                await writable.write(blob);
                await writable.close();

                written++;
            }

            return {
                written,
                skipped,
                directoryName:
                    root.name || "Assets"
            };
        }

        async exportLibraryAsZip(assets, folders, zipName = "Project-Assets.zip") {
            if (typeof window.JSZip !== "function") {
                throw new Error("File System Access API is not supported in this browser, and JSZip is not available.");
            }

            const zip = new window.JSZip();
            const userAssets = (assets || []).filter(
                (asset) => asset && !asset.isBuiltIn && asset.name
            );

            let written = 0;
            let skipped = 0;

            for (const asset of userAssets) {
                const blob = await this._assetToBlob(asset);
                if (!blob) {
                    skipped++;
                    continue;
                }

                const parts = this._folderPathForAsset(asset, folders);
                let currentZip = zip;
                for (const part of parts) {
                    currentZip = currentZip.folder(part);
                }
                currentZip.file(asset.name, blob);
                written++;
            }

            const zipBlob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);

            return {
                written,
                skipped,
                directoryName: zipName,
                isZip: true
            };
        }

        destroy() {
            clearTimeout(this._saveTimer);

            for (const id of Array.from(
                this.objectURLs.keys()
            )) {
                this._revokeObjectURL(id);
            }

            try {
                this.db?.close?.();
            } catch (_) { }

            this.db = null;
            this.ready = false;
        }
    }

    window.AssetStorageManager = AssetStorageManager;
})();
