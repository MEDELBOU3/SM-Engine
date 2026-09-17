// AssetsPanelImportPBR.js
// File/folder ingestion, native PBR packages, thumbnails, SVG icons
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelImportPBRMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelImportPBRMixin {
    static async _addAssetFromFile(
        file,
        folderId = null
    ) {
        const type =
            this._getAssetType(file.name);

        if (!type) {
            console.warn(
                `AssetsPanel: Unsupported file type for ${file.name}. Skipping.`
            );
            return null;
        }

        // --------------------------------------------------------------
        // Conflict resolution
        // --------------------------------------------------------------
        let finalFileName = file.name;
        let shouldOverwrite = false;

        let existingAsset =
            this.assets.find(
                (asset) =>
                    !asset.isBuiltIn &&
                    asset.name ===
                    finalFileName &&
                    (asset.folderId || null) ===
                    (folderId || null)
            );

        if (existingAsset) {
            const response = prompt(
                `Asset '${file.name}' already exists in this folder.\n` +
                `Enter a NEW NAME to rename, type 'overwrite' to replace, or leave blank to skip:`,
                file.name
            );

            if (
                response === null ||
                response.trim() === ""
            ) {
                console.log(
                    `AssetsPanel: Skipped import of '${file.name}'.`
                );
                return null;
            }

            if (
                response.toLowerCase() ===
                "overwrite"
            ) {
                shouldOverwrite = true;
            } else {
                finalFileName =
                    response.trim();

                if (
                    this.assets.some(
                        (asset) =>
                            !asset.isBuiltIn &&
                            asset.name ===
                            finalFileName &&
                            (asset.folderId ||
                                null) ===
                            (folderId ||
                                null)
                    )
                ) {
                    alert(
                        `The new name '${finalFileName}' also conflicts with an existing asset. Skipping.`
                    );
                    return null;
                }
            }
        }

        if (
            shouldOverwrite &&
            existingAsset
        ) {
            this._removeAsset(
                existingAsset.id
            );
        }

        const id =
            typeof crypto !== "undefined" &&
                typeof crypto.randomUUID ===
                "function"
                ? `asset_${crypto.randomUUID()}`
                : `asset_${Date.now()}_${Math.floor(
                    Math.random() * 1000000
                )}`;

        // Electron exposes the local path for a user-selected File without
        // giving renderer code general filesystem access. It is a fallback
        // only; IndexedDB remains the primary copy of the imported binary.
        const sourcePath =
            window.electronAPI?.getPathForFile?.(file) ||
            null;

        // Persistent storage must never be allowed to freeze the uploader.
        // If IndexedDB is temporarily blocked/broken, import the asset into a
        // session Blob URL and keep the UI responsive; persistence can be retried
        // by the asset-relink path later.
        const withTimeout = (promise, timeoutMs, label) => Promise.race([
            Promise.resolve(promise).catch((error) => {
                console.warn(`[AssetsPanel] ${label} failed:`, error);
                return null;
            }),
            new Promise((resolve) => setTimeout(() => {
                console.warn(`[AssetsPanel] ${label} timed out after ${timeoutMs}ms.`);
                resolve(null);
            }, timeoutMs))
        ]);

        // Do not make the visible uploader wait for IndexedDB initialization.
        // The import gets a session Blob URL immediately; persistence is retried
        // in the background and the asset is upgraded to indexeddb-blob when it
        // succeeds. This removes the classic 88% "Saving asset..." deadlock.
        const storagePromise = Promise.resolve()
            .then(() => this._getPersistentAssetStorage?.())
            .catch((error) => {
                console.warn("[AssetsPanel] Persistent storage unavailable during import:", error);
                return null;
            });

        let fileContent = null;
        let storageKind = null;
        let storageKey = null;

        const isSmallText =
            type === "code" ||
            type === "material" ||
            type === "scene";

        if (isSmallText) {
            try {
                fileContent =
                    await file.text();
                storageKind = "text";
            } catch (error) {
                console.error(
                    `AssetsPanel: Failed to read ${file.name}.`,
                    error
                );
                return null;
            }
        } else {
            // Never encode binary user files into localStorage. Give the UI a
            // usable original-byte Blob URL immediately; persist asynchronously.
            fileContent = URL.createObjectURL(file);
            storageKind = "session-blob";
            storageKey = null;

            storagePromise.then(async (storage) => {
                if (!storage?.saveImportedFile || !storage?.createRuntimeURL) return;
                const saved = await withTimeout(
                    storage.saveImportedFile(id, file),
                    7000,
                    `Persist ${file.name}`
                );
                if (saved === null) return;

                // Upgrade the asset record after it has been inserted. The
                // session URL remains valid as a fallback for the current run.
                const liveAsset = this.assets?.find?.((candidate) => candidate.id === id);
                if (liveAsset) {
                    liveAsset.data = storage.createRuntimeURL(id, file);
                    liveAsset.storageKind = "indexeddb-blob";
                    liveAsset.storageKey = id;
                    liveAsset.sourceMimeType = String(file.type || "").toLowerCase() || null;
                    liveAsset.sourceIsBinary = true;
                    this._saveToStorage?.();
                    this.render?.();
                    window.dispatchEvent?.(new CustomEvent("sm:asset-persistence-upgraded", {
                        detail: { assetId: id, asset: liveAsset }
                    }));
                }
            }).catch((error) => {
                console.warn(`[AssetsPanel] Background persistence failed for ${file.name}:`, error);
            });
        }

        const asset = {
            id,
            name: finalFileName,
            type,
            data: fileContent,
            thumbnail: null,
            isFavorite: false,
            isBuiltIn: false,
            folderId,
            tags: [],
            history: [],
            references: [],
            storageKind,
            storageKey,
            sourceType: "local-import",
            sourcePath,
            sourceSize:
                Number(file.size || 0),
            sourceLastModified:
                Number(file.lastModified || 0),
            // Preserve the real source MIME type for 2D/image consumers,
            // especially PNG files with an alpha channel.
            sourceMimeType:
                String(file.type || "").toLowerCase() || null,
            sourceIsBinary: !isSmallText
        };

        // The grid preview is allowed to be small; the asset itself is not.
        // Persist the decoded source dimensions so every consumer can tell the
        // original sprite sheet from a 128px thumbnail after a restart.
        if (this._isTextureCompatibleAssetType?.(type)) {
            asset.sourceDimensions =
                await this._readImageSourceDimensions(
                    fileContent,
                    file.name
                );
            asset.thumbnailVersion = 2;
        }

        // --------------------------------------------------------------
        // Thumbnail / definition
        // --------------------------------------------------------------
        if (type === "material") {
            try {
                const definition =
                    JSON.parse(fileContent);

                asset.definition =
                    definition;

                asset.thumbnail =
                    await this._generateMaterialThumbnail(
                        definition
                    );

                asset.references =
                    this._detectMaterialReferences(
                        definition
                    );
            } catch (error) {
                console.warn(
                    `Invalid material JSON for ${finalFileName}`,
                    error
                );

                asset.thumbnail =
                    this._svgIcon("material");
            }
        } else if (type === "code") {
            asset.thumbnail =
                this._svgIcon("code");
        } else if (type === "prefab") {
            asset.thumbnail =
                this._svgIcon(
                    "prefab-create"
                );
        } else if (type === "model") {
            asset.thumbnail =
                await this._generateThumbnail(
                    fileContent,
                    "model",
                    file
                );
        } else {
            asset.thumbnail =
                await withTimeout(
                    this._generateThumbnail(fileContent, type, file),
                    3500,
                    `Generate thumbnail for ${file.name}`
                );
            if (!asset.thumbnail) asset.thumbnail = this._svgIcon(type || "texture");
        }

        this._autoTagAsset(asset);
        this.assets.push(asset);

        this._commitAssetVersion(
            asset.id,
            "Initial Import"
        );

        this._saveToStorage();

        window.dispatchEvent?.(new CustomEvent("sm:asset-import-complete", {
            detail: { asset, fileName: file.name, storageKind: asset.storageKind }
        }));

        if (
            typeof this.onAssetAdded ===
            "function"
        ) {
            this.onAssetAdded(asset);
        }

        this.render();
        this._buildTagCloud();

        return asset;
    }

    // ==================================================================
    // === NATIVE PBR MATERIAL PACKAGE IMPORT                         ===
    // ==================================================================
    // AssetsPanel is the single owner of material ingestion.
    // A material package is detected from texture-map naming, not from
    // preview meshes (.gltf/.glb/.fbx/.obj) shipped by asset providers.

    static _pbrTextureRole(fileName = "") {
        const name = String(fileName || "").toLowerCase();

        const patterns = [
            ["color", /(^|[_\-.])(albedo|basecolor|base_color|basecolour|diff|diffuse|color|colour|col)([_\-.]|$)/i],
            ["normalGL", /(^|[_\-.])(nor_gl|normal_gl|normalgl|nrm_gl)([_\-.]|$)/i],
            ["normalDX", /(^|[_\-.])(nor_dx|normal_dx|normaldx|nrm_dx)([_\-.]|$)/i],
            ["normal", /(^|[_\-.])(normal|nor|nrm)([_\-.]|$)/i],
            ["roughness", /(^|[_\-.])(roughness|rough|rgh)([_\-.]|$)/i],
            ["metalness", /(^|[_\-.])(metalness|metallic|metal|mtl)([_\-.]|$)/i],
            ["ao", /(^|[_\-.])(ambientocclusion|ambient_occlusion|occlusion|ao)([_\-.]|$)/i],
            ["height", /(^|[_\-.])(displacement|disp|height|heightmap)([_\-.]|$)/i],
            ["opacity", /(^|[_\-.])(opacity|alpha|transparency|trans)([_\-.]|$)/i],
            ["emissive", /(^|[_\-.])(emissive|emission|emit)([_\-.]|$)/i],
            ["orm", /(^|[_\-.])(orm|arm)([_\-.]|$)/i],
            ["rma", /(^|[_\-.])(rma)([_\-.]|$)/i],
            ["mra", /(^|[_\-.])(mra)([_\-.]|$)/i]
        ];

        for (const [role, pattern] of patterns) {
            if (pattern.test(name)) return role;
        }

        return null;
    }

    static _isPBRTextureFile(file) {
        if (!file?.name) return false;
        return /\.(png|jpe?g|webp|bmp|tiff?|exr|hdr)$/i.test(file.name);
    }

    static _looksLikePBRMaterialFolder(files = []) {
        const fileList = Array.from(files || [])
            .filter((file) => this._isPBRTextureFile(file));

        if (!fileList.length) return false;

        const roles = new Set(
            fileList
                .map((file) => this._pbrTextureRole(file.name))
                .filter(Boolean)
        );

        const hasColor = roles.has("color");
        const hasSurfaceData =
            roles.has("normalGL") ||
            roles.has("normalDX") ||
            roles.has("normal") ||
            roles.has("roughness") ||
            roles.has("metalness") ||
            roles.has("ao") ||
            roles.has("height") ||
            roles.has("orm") ||
            roles.has("rma") ||
            roles.has("mra");

        return (hasColor && hasSurfaceData) || roles.size >= 3;
    }

    static _pbrProviderFromFiles(files = []) {
        const joined = Array.from(files || [])
            .map((file) =>
                String(file.webkitRelativePath || file.name || "").toLowerCase()
            )
            .join(" ");

        if (joined.includes("polyhaven") || joined.includes("poly_haven")) {
            return "Poly Haven";
        }

        if (joined.includes("poliigon")) {
            return "Poliigon";
        }

        if (joined.includes("ambientcg")) {
            return "ambientCG";
        }

        if (joined.includes("quixel") || joined.includes("megascans")) {
            return "Quixel Megascans";
        }

        if (joined.includes("textures.com")) {
            return "Textures.com";
        }

        return "PBR Package";
    }

    static _cleanPBRMaterialName(value = "") {
        let name = String(value || "")
            .replace(/\.[^.]+$/, "")
            .replace(/(^|[_\-.])(1k|2k|4k|8k|16k)([_\-.]|$)/ig, " ")
            .replace(/(^|[_\-.])(albedo|basecolor|base_color|basecolour|diff|diffuse|color|colour|col|nor_gl|nor_dx|normal_gl|normal_dx|normal|nor|nrm|roughness|rough|rgh|metalness|metallic|metal|mtl|ambientocclusion|ambient_occlusion|occlusion|ao|displacement|disp|height|heightmap|opacity|alpha|transparency|trans|emissive|emission|emit|orm|arm|rma|mra)([_\-.]|$)/ig, " ")
            .replace(/[_\-.]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        return name || "Imported PBR Material";
    }

    static _pbrMaterialName(files = []) {
        const list = Array.from(files || []);
        const colorFile =
            list.find(
                (file) => this._pbrTextureRole(file.name) === "color"
            ) ||
            list.find((file) => this._isPBRTextureFile(file)) ||
            list[0];

        const fromColor = this._cleanPBRMaterialName(colorFile?.name || "");

        if (
            fromColor &&
            !/^(package|packages|material|materials|textures?|maps?|assets?|pbr)$/i.test(fromColor)
        ) {
            return fromColor;
        }

        const firstPath = String(
            list[0]?.webkitRelativePath || ""
        );

        const rootName = firstPath
            .split("/")
            .filter(Boolean)[0];

        const fromRoot = this._cleanPBRMaterialName(rootName);

        return fromRoot || fromColor || "Imported PBR Material";
    }

    static _pbrRootFolderName(files = [], materialName = "Material") {
        const firstPath = String(
            Array.from(files || [])[0]?.webkitRelativePath || ""
        );

        const rawRoot = firstPath
            .split("/")
            .filter(Boolean)[0];

        const cleanedRoot = this._cleanPBRMaterialName(rawRoot);

        if (
            cleanedRoot &&
            !/\.(gltf|glb|fbx|obj)$/i.test(rawRoot) &&
            !/^(package|packages|material|materials|textures?|maps?|assets?|pbr)$/i.test(cleanedRoot)
        ) {
            return cleanedRoot;
        }

        return materialName;
    }

    static _isMaterialTextureCompatibleAsset(asset) {
        if (!asset) return false;

        if (this._isTextureCompatibleAssetType(asset.type)) {
            return true;
        }

        return /\.(exr|hdr)$/i.test(String(asset.name || ""));
    }

    static async _loadMaterialTextureAsset(textureAsset, options = {}) {
        if (!textureAsset) return null;

        const source = this._getAssetSourceUrl(textureAsset);
        if (!source) return null;

        const fileName = String(textureAsset.name || "").toLowerCase();

        let loader = this.loaders?.texture || new THREE.TextureLoader();

        if (/\.exr$/i.test(fileName) && this.loaders?.exr) {
            loader = this.loaders.exr;
        } else if (/\.hdr$/i.test(fileName) && this.loaders?.hdri) {
            loader = this.loaders.hdri;
        }

        const texture = await new Promise((resolve) => {
            loader.load(
                source,
                resolve,
                undefined,
                (error) => {
                    console.warn(
                        `AssetsPanel: Failed to load material texture '${textureAsset.name}'.`,
                        error
                    );
                    resolve(null);
                }
            );
        });

        if (!texture) return null;

        const importedSettings = {
            ...(textureAsset.textureSettings || {}),
            ...(options.binding || {})
        };

        texture.wrapS = Number.isFinite(Number(importedSettings.wrapS))
            ? Number(importedSettings.wrapS)
            : THREE.RepeatWrapping;
        texture.wrapT = Number.isFinite(Number(importedSettings.wrapT))
            ? Number(importedSettings.wrapT)
            : THREE.RepeatWrapping;

        const tiling = Math.max(
            0.001,
            Number(options.tiling) || 1
        );

        if (texture.repeat?.set) {
            const repeat = Array.isArray(importedSettings.repeat)
                ? importedSettings.repeat
                : [tiling, tiling];
            texture.repeat.set(
                Number(repeat[0]) || tiling,
                Number(repeat[1]) || tiling
            );
        }

        if (texture.offset?.set && Array.isArray(importedSettings.offset)) {
            texture.offset.set(
                Number(importedSettings.offset[0]) || 0,
                Number(importedSettings.offset[1]) || 0
            );
        }

        texture.rotation = Number(importedSettings.rotation) || 0;
        if (Number.isFinite(Number(importedSettings.channel))) {
            texture.channel = Number(importedSettings.channel);
        }
        if (typeof importedSettings.flipY === "boolean") {
            texture.flipY = importedSettings.flipY;
        }

        const maxAnisotropy =
            this.renderer?.capabilities?.getMaxAnisotropy?.() || 1;

        texture.anisotropy = Math.min(
            8,
            maxAnisotropy
        );

        if ("colorSpace" in texture) {
            if (
                options.color === true &&
                THREE.SRGBColorSpace !== undefined
            ) {
                texture.colorSpace =
                    THREE.SRGBColorSpace;
            } else if (
                options.color !== true &&
                THREE.NoColorSpace !== undefined
            ) {
                texture.colorSpace =
                    THREE.NoColorSpace;
            }
        }

        texture.needsUpdate = true;

        return texture;
    }

    static async _importPBRMaterialFolder(
        files,
        baseFolderId = null,
        options = {}
    ) {
        const allFiles = Array.from(files || []);

        if (!this._looksLikePBRMaterialFolder(allFiles)) {
            throw new Error(
                "AssetsPanel: Selected folder does not look like a PBR material package."
            );
        }

        const provider =
            options.provider ||
            this._pbrProviderFromFiles(allFiles);

        const materialName =
            options.name ||
            this._pbrMaterialName(allFiles);

        const rootFolderName =
            options.folderName ||
            this._pbrRootFolderName(
                allFiles,
                materialName
            );

        const materialFolderId =
            this._ensureFolderPath(
                rootFolderName,
                baseFolderId
            );

        const texturesFolderId =
            this._ensureFolderPath(
                "textures",
                materialFolderId
            );

        // Only material maps are imported.
        // Provider preview meshes such as *.gltf/*.glb are intentionally ignored.
        const textureFiles = allFiles.filter(
            (file) =>
                this._isPBRTextureFile(file) &&
                !!this._pbrTextureRole(file.name)
        );

        const imported = [];
        const roleAssets = {};

        for (const file of textureFiles) {
            const asset = await this._addAssetFromFile(
                file,
                texturesFolderId
            );

            if (!asset) continue;

            imported.push(asset);

            const role =
                this._pbrTextureRole(file.name);

            if (role && !roleAssets[role]) {
                roleAssets[role] = asset;
            }
        }

        if (
            !roleAssets.normalGL &&
            !roleAssets.normalDX &&
            roleAssets.normal
        ) {
            roleAssets.normalGL =
                roleAssets.normal;
        }

        const definition = {
            version: 4,
            type: "MeshPhysicalMaterial",
            displayName: materialName,
            provider,
            color: "#ffffff",
            roughness: 1,
            metalness: 0,
            clearcoat: 0,
            clearcoatRoughness: 1,
            tiling: Number(options.tiling) || 1,
            normalStrength:
                Number(options.normalStrength) || 1,
            displacementScale:
                Number(options.displacementScale) || 0,
            normalConvention:
                roleAssets.normalDX ? "dx" : "gl",
            sourcePackage: {
                provider,
                importedAt: Date.now(),
                autoDetected:
                    options.autoDetected === true,
                ignoredPreviewModels:
                    allFiles
                        .filter(
                            (file) =>
                                /\.(gltf|glb|fbx|obj)$/i.test(
                                    file.name || ""
                                )
                        )
                        .map(
                            (file) =>
                                file.webkitRelativePath ||
                                file.name
                        ),
                originalFiles:
                    allFiles.map(
                        (file) =>
                            file.webkitRelativePath ||
                            file.name
                    )
            }
        };

        const assign = (slot, role) => {
            const asset = roleAssets[role];

            if (asset?.id) {
                definition[slot] = asset.id;
            }
        };

        assign("map", "color");
        assign(
            "normalMap",
            roleAssets.normalDX
                ? "normalDX"
                : "normalGL"
        );
        assign("roughnessMap", "roughness");
        assign("metalnessMap", "metalness");
        assign("aoMap", "ao");
        assign("displacementMap", "height");
        assign("opacityMap", "opacity");
        assign("emissiveMap", "emissive");
        assign("ormMap", "orm");

        if (roleAssets.rma?.id) {
            definition.packedMap =
                roleAssets.rma.id;
            definition.packedMapLayout =
                "RMA";
        }

        if (roleAssets.mra?.id) {
            definition.packedMap =
                roleAssets.mra.id;
            definition.packedMapLayout =
                "MRA";
        }

        const materialAsset =
            this.addMaterialAsset(
                `${materialName}.material.json`,
                JSON.stringify(
                    definition,
                    null,
                    2
                ),
                materialFolderId
            );

        if (!materialAsset) {
            throw new Error(
                "AssetsPanel: Could not create the PBR material asset."
            );
        }

        materialAsset.tags = [
            ...new Set([
                ...(materialAsset.tags || []),
                "material",
                "pbr",
                "paint-ready",
                String(provider)
                    .toLowerCase()
                    .replace(/\s+/g, "-")
            ])
        ];

        materialAsset.references = [
            ...new Set([
                ...(materialAsset.references || []),
                ...imported
                    .map((asset) => asset?.id)
                    .filter(Boolean)
            ])
        ];

        this._commitAssetVersion?.(
            materialAsset.id,
            `Imported PBR package (${provider})`
        );

        this._saveToStorage();
        this._syncRuntimeAssetRegistry?.();
        this.render();
        this._buildTagCloud();

        window.dispatchEvent(
            new CustomEvent(
                "sm:material-library-changed",
                {
                    detail: {
                        asset: materialAsset,
                        provider,
                        textureAssets: imported,
                        source:
                            "AssetsPanel._importPBRMaterialFolder"
                    }
                }
            )
        );

        console.log(
            `[AssetsPanel] PBR material '${materialName}' imported from ${provider}. ` +
            `${imported.length} texture maps imported; provider preview models ignored.`
        );

        return materialAsset;
    }

    static async importMaterialPackage(
        files,
        options = {}
    ) {
        const baseFolderId =
            options.folderId !== undefined
                ? options.folderId
                : this.openFolderId;

        return await this._importPBRMaterialFolder(
            files,
            baseFolderId,
            options
        );
    }

    static promptImportMaterialPackage(
        options = {}
    ) {
        return new Promise(
            (resolve, reject) => {
                const input =
                    document.createElement(
                        "input"
                    );

                input.type = "file";
                input.multiple = true;
                input.accept =
                    ".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.exr,.hdr,.gltf,.glb,.fbx,.obj";
                input.setAttribute(
                    "webkitdirectory",
                    ""
                );
                input.setAttribute(
                    "directory",
                    ""
                );
                input.style.display =
                    "none";

                document.body.appendChild(
                    input
                );

                input.addEventListener(
                    "change",
                    async () => {
                        try {
                            const files =
                                Array.from(
                                    input.files ||
                                    []
                                );

                            if (!files.length) {
                                resolve(null);
                                return;
                            }

                            const material =
                                await this.importMaterialPackage(
                                    files,
                                    options
                                );

                            resolve(material);
                        } catch (error) {
                            console.error(
                                "AssetsPanel: PBR material package import failed.",
                                error
                            );
                            reject(error);
                        } finally {
                            input.remove();
                        }
                    },
                    { once: true }
                );

                input.click();
            }
        );
    }

    static _ensureMaterialPackageImportButton() {
        if (
            document.getElementById(
                "assetsImportPBRMaterialBtn"
            )
        ) {
            return true;
        }

        this._refreshDOMCache?.();

        const host =
            this.dom?.header?.querySelector?.(
                ".assets-header-actions,.header-actions,.assets-toolbar,.toolbar"
            ) ||
            this.dom?.header;

        if (!host) return false;

        const button =
            document.createElement(
                "button"
            );

        button.id =
            "assetsImportPBRMaterialBtn";

        button.type =
            "button";

        button.className =
            "panel-btn assets-pbr-import-btn";

        button.title =
            "Import Poly Haven / Poliigon / ambientCG PBR material folder";

        button.innerHTML =
            '<i class="fas fa-layer-group"></i><span>PBR Material</span>';

        button.addEventListener(
            "click",
            () => {
                this.promptImportMaterialPackage({
                    folderId:
                        this.openFolderId ??
                        null
                }).catch(() => {});
            }
        );

        host.appendChild(button);

        return true;
    }

    static async _addAssetsFromFolderInput(files, baseFolderId) {
        const fileList = Array.from(files || []);

        if (
            this._looksLikePBRMaterialFolder(
                fileList
            )
        ) {
            console.log(
                "AssetsPanel: PBR material package detected. Importing as a material instead of importing provider preview models."
            );

            return await this._importPBRMaterialFolder(
                fileList,
                baseFolderId,
                {
                    autoDetected: true
                }
            );
        }

        // HDRI downloads are multi-file packages. Import all members into the
        // same preserved folder, then annotate the environment asset with the
        // preview and companion IDs so double-clicking the EXR/HDR can apply a
        // complete sky setup instead of treating every file as unrelated.
        const hdriGroups = this._getHDRIPackageGroups(fileList);
        if (hdriGroups.length) {
            const consumed = new Set();
            for (const group of hdriGroups) {
                for (const file of group.files) consumed.add(file);
                await this._importHDRIPackageGroup(group, baseFolderId);
            }

            const remainingFiles = fileList.filter((file) => !consumed.has(file));
            for (const file of remainingFiles) {
                if (file.webkitRelativePath) {
                    const pathSegments = file.webkitRelativePath.split("/");
                    pathSegments.pop();
                    const folderPath = pathSegments.join("/");
                    const targetFolderId = this._ensureFolderPath(folderPath, baseFolderId);
                    await this._addAssetFromFile(file, targetFolderId);
                } else {
                    await this._addAssetFromFile(file, baseFolderId);
                }
            }

            console.log(
                `AssetsPanel: Imported ${hdriGroups.length} HDRI package(s) with previews and companion metadata.`
            );
            this.render();
            this._buildTagCloud();
            return hdriGroups;
        }

        console.log(`AssetsPanel: Importing ${fileList.length} files from folder...`);
        for (const file of fileList) {
            if (file.webkitRelativePath) {
                const pathSegments = file.webkitRelativePath.split("/");
                pathSegments.pop();
                const folderPath = pathSegments.join("/");

                const targetFolderId = this._ensureFolderPath(folderPath, baseFolderId);

                await this._addAssetFromFile(file, targetFolderId);
            } else {
                await this._addAssetFromFile(file, baseFolderId);
            }
        }
        console.log("AssetsPanel: Folder import complete.");
        this.render();
        this._buildTagCloud(); // MODIFIED: Rebuild tag cloud
    }

    static _getHDRIPackageGroups(files = []) {
        return typeof window !== "undefined" && window.SMHDRIPackage?.groupFiles
            ? window.SMHDRIPackage.groupFiles(files)
            : [];
    }

    static async _importHDRIPackageGroup(group, baseFolderId = null) {
        const folderPath = String(group?.folderPath || "");
        const targetFolderId = this._ensureFolderPath(folderPath, baseFolderId);
        const imported = [];

        for (const file of Array.from(group?.files || [])) {
            const asset = await this._addAssetFromFile(file, targetFolderId);
            if (asset) imported.push(asset);
        }

        if (!imported.length) return null;

        const byName = (file) => imported.find(
            (asset) => String(asset.name || "").toLowerCase() === String(file?.name || "").toLowerCase()
        );
        const environmentAsset = byName(group.environmentFile) ||
            imported.find((asset) => asset.type === "hdri") ||
            byName(group.previewFile) ||
            imported[0];
        const previewAsset = byName(group.previewFile) ||
            imported.find((asset) => asset.type === "texture");
        if (!environmentAsset) return null;

        // An LDR equirectangular image can still act as a visible sky when a
        // package has no HDR/EXR. It is marked as hdri so the environment path
        // uses TextureLoader instead of RGBELoader for that case.
        environmentAsset.type = "hdri";
        environmentAsset.isHDRIPackage = true;
        environmentAsset.hdriPackage = {
            version: 1,
            name: group.name || environmentAsset.name,
            folderPath,
            environmentAssetId: environmentAsset.id,
            environmentKind: group.environmentFile
                ? window.SMHDRIPackage?.extension?.(group.environmentFile.name) || "hdr"
                : "ldr",
            previewAssetId: previewAsset?.id || null,
            files: imported.map((asset) => ({
                id: asset.id,
                name: asset.name,
                type: asset.type,
                role: window.SMHDRIPackage?.classify(asset) || null
            }))
        };
        environmentAsset.references = imported
            .filter((asset) => asset.id !== environmentAsset.id)
            .map((asset) => asset.id);
        environmentAsset.tags = Array.from(new Set([
            ...(environmentAsset.tags || []),
            "hdri",
            "environment",
            "hdri-package",
            ...(previewAsset ? ["tonemapped-preview"] : []),
            ...(imported.some((asset) => asset.type === "hdri-companion") ? ["source-companions"] : [])
        ]));

        if (previewAsset?.thumbnail) {
            environmentAsset.thumbnail = previewAsset.thumbnail;
        }

        this._saveToStorage();
        this.onAssetUpdate?.(environmentAsset.id, environmentAsset);
        return environmentAsset;
    }

    static _ensureFolderPath(relativePath, baseParentId = null) {
        if (!relativePath) return baseParentId;

        const segments = relativePath.split("/").filter((s) => s !== "");
        let currentParentId = baseParentId;

        for (const segment of segments) {
            let existingFolder = Object.values(this.folders).find(
                (f) =>
                    f.name === segment &&
                    (f.parentId || null) === (currentParentId || null),
            );

            if (existingFolder) {
                currentParentId = existingFolder.id;
            } else {
                const newFolderId = this.createFolder(segment, currentParentId);
                currentParentId = newFolderId;
            }
        }
        return currentParentId;
    }

    static _readImageSourceDimensions(source, name = "image", timeoutMs = 3000) {
        if (!source) return Promise.resolve(null);
        return new Promise((resolve) => {
            const image = new Image();
            let done = false;
            let retriedWithoutCors = false;
            const finish = (value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                image.onload = null;
                image.onerror = null;
                resolve(value);
            };
            const timer = setTimeout(() => {
                console.warn(`[AssetsPanel] Image dimension read timed out for ${name}.`);
                finish(null);
            }, timeoutMs);
            image.crossOrigin = "anonymous";
            image.onload = () => {
                const width = Number(image.naturalWidth || image.width || 0);
                const height = Number(image.naturalHeight || image.height || 0);
                finish(width > 0 && height > 0 ? { width, height } : null);
            };
            image.onerror = async () => {
                if (!retriedWithoutCors && typeof source === "string" && !source.startsWith("data:")) {
                    retriedWithoutCors = true;
                    image.crossOrigin = null;
                    image.src = source;
                    return;
                }
                // createImageBitmap is a useful decoder fallback for Chromium
                // paths where HTMLImageElement rejects a valid PNG/WebP blob.
                if (typeof source === "string" && typeof fetch === "function" && typeof createImageBitmap === "function") {
                    try {
                        const response = await fetch(source);
                        if (response.ok) {
                            const blob = await response.blob();
                            const bitmap = await createImageBitmap(blob);
                            const result = bitmap.width > 0 && bitmap.height > 0
                                ? { width: bitmap.width, height: bitmap.height }
                                : null;
                            bitmap.close?.();
                            finish(result);
                            return;
                        }
                    } catch { /* fall through */ }
                }
                console.warn(`[AssetsPanel] Could not read dimensions for ${name}.`);
                finish(null);
            };
            image.src = String(source);
        });
    }

    static _pickSingleImageFile() {
        return new Promise((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,image/avif";
            input.style.display = "none";
            document.body.appendChild(input);
            input.addEventListener("change", () => {
                const file = input.files?.[0] || null;
                input.remove();
                resolve(file);
            }, { once: true });
            input.click();
        });
    }

    static async relinkImageAssetFromPicker(asset) {
        if (!asset?.id) return null;
        const file = await this._pickSingleImageFile();
        if (!file) return null;

        const storage = await this._getPersistentAssetStorage?.();
        if (!storage?.saveImportedFile || !storage?.createRuntimeURL) {
            throw new Error("Persistent asset storage is unavailable.");
        }

        await storage.saveImportedFile(asset.id, file);
        asset.data = storage.createRuntimeURL(asset.id, file);
        asset.storageKind = "indexeddb-blob";
        asset.storageKey = asset.id;
        asset.sourcePath = window.electronAPI?.getPathForFile?.(file) || null;
        asset.sourceType = "relinked-local-import";
        asset.sourceSize = Number(file.size || 0);
        asset.sourceLastModified = Number(file.lastModified || Date.now());
        asset.sourceDimensions = await this._readImageSourceDimensions(asset.data, asset.name);
        asset.thumbnail = await this._generateThumbnail(asset.data, asset.type, file);
        asset.thumbnailVersion = 2;
        asset.missingStoredFile = false;
        this._saveToStorage?.();
        this.render?.();
        return asset;
    }

    /**
     * Open a sprite sheet from the original asset binary.
     *
     * Asset cards intentionally show a small thumbnail.  Older library records
     * may even have that preview in `data`, so resolving through the card was
     * unsafe for PNG sprite sheets: a 128px preview could be decoded instead of
     * the source image, or no image could be decoded at all after a restart.
     */
    /**
     * Persist the definition produced by Sprite Sheet Studio into the
     * corresponding AssetsPanel asset.
     *
     * Previously openSpriteSheetAsset() ignored the editor result, so frames,
     * slices and animations existed only inside the editor and disappeared
     * when the editor closed or the app restarted.
     */
    static _persistSpriteSheetEditorResult(asset, result) {
        if (!asset || result == null) return false;

        let spriteSheet = result;

        if (result && typeof result === "object") {
            if (result.spriteSheet && typeof result.spriteSheet === "object") {
                spriteSheet = result.spriteSheet;
            } else if (
                result.data?.spriteSheet &&
                typeof result.data.spriteSheet === "object"
            ) {
                spriteSheet = result.data.spriteSheet;
            }
        }

        if (
            !spriteSheet ||
            typeof spriteSheet !== "object" ||
            (
                !Array.isArray(spriteSheet.frames) &&
                !Array.isArray(spriteSheet.animations) &&
                !Array.isArray(spriteSheet.slices) &&
                !Array.isArray(spriteSheet.sprites)
            )
        ) {
            return false;
        }

        try {
            asset.spriteSheet = JSON.parse(JSON.stringify(spriteSheet));
        } catch {
            asset.spriteSheet = spriteSheet;
        }

        asset.isSpriteSheet = true;
        asset.spriteSheetVersion = 1;
        asset.spriteSheetUpdatedAt = Date.now();

        this._commitAssetVersion?.(asset.id, "Sprite Sheet Studio");
        this._saveToStorage?.();
        this._syncRuntimeAssetRegistry?.();
        this.onAssetUpdate?.(asset.id, asset);
        this.render?.();

        window.dispatchEvent(
            new CustomEvent("sm:sprite-sheet-saved", {
                detail: {
                    assetId: asset.id,
                    asset,
                    spriteSheet: asset.spriteSheet
                }
            })
        );

        return true;
    }

    /**
     * Normalize the original image into a browser-decodable source.
     * Some Sprite Sheet Studio versions fail on blob/object URLs even though
     * the underlying PNG is valid. Converting the persisted Blob to a data URL
     * keeps PNG RGBA/alpha intact and removes that decoder dependency.
     */
    static async _prepareSpriteEditorSource(source, timeoutMs = 8000) {
        if (!source) return null;

        const decode = (src) => new Promise((resolve) => {
            const img = new Image();
            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            };
            const timer = setTimeout(() => finish(null), timeoutMs);
            img.onload = () => finish(src);
            img.onerror = () => finish(null);
            img.decoding = 'async';
            img.src = src;
        });

        // Validate normal data/http/blob URLs first.
        const valid = await decode(source);
        if (valid) return valid;

        // If a Blob URL cannot be decoded directly by the editor/browser path,
        // fetch the bytes and convert them to a data URL without touching alpha.
        if (typeof source === 'string' && source.startsWith('blob:')) {
            try {
                const response = await fetch(source);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                return await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async () => {
                        const dataURL = reader.result;
                        resolve(await decode(dataURL) || null);
                    };
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.warn('[AssetsPanel] Could not normalize sprite source:', error);
            }
        }

        return null;
    }

    static async openSpriteSheetAsset(assetId) {
        const asset = this._findById?.(assetId);
        if (!asset) throw new Error("Image asset was not found.");

        const sources = [];
        const previewOnlyData = !!asset.thumbnail && asset.data === asset.thumbnail;
        const addSource = (value) => {
            if (!value || value === asset.thumbnail) return;
            const normalized = this._normalizeAssetSource?.(value) || value;
            if (normalized && !sources.includes(normalized)) sources.push(normalized);
        };

        // Imported assets already have a live blob URL in this session. Use it
        // immediately instead of waiting for IndexedDB before the editor can
        // paint its modal. This is the normal path for PNG/JPG imports.
        addSource(asset.url);
        addSource(asset.sourceURL);
        if (!previewOnlyData) addSource(asset.data);
        addSource(asset.sourcePath);
        addSource(this._getAssetSourceUrl?.(asset));

        // Validate live sources. A stale blob: URL can exist after a restart;
        // do not mistake its presence for a healthy original image.
        const validateSource = (src, timeoutMs = 2500) => new Promise((resolve) => {
            if (!src) return resolve(false);
            const img = new Image();
            let done = false;
            const finish = (ok) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                img.onload = null;
                img.onerror = null;
                resolve(ok);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            if (/^https?:\/\//i.test(String(src))) img.crossOrigin = 'anonymous';
            img.decoding = 'async';
            img.onload = () => finish(true);
            img.onerror = () => finish(false);
            img.src = String(src);
        });

        const validSources = [];
        for (const source of sources) {
            if (await validateSource(source)) validSources.push(source);
        }
        sources.length = 0;
        sources.push(...validSources);

        // Always allow IndexedDB recovery when the current URL is stale.
        const within = (task, timeoutMs = 2500) => Promise.race([
            Promise.resolve(task).catch(() => null),
            new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
        ]);
        const storage = await within(this._getPersistentAssetStorage?.(), 2500);
        if (storage) {
            try {
                // First recover the persisted File/Blob.  This is the canonical
                // source and remains valid after an app restart.
                addSource(await within(storage.resolveAssetData?.(asset), 1800));

                // Very old records did not retain storageKind/storageKey even
                // though their original blob still exists under the asset id.
                if (asset.id && storage.getBlob && storage.createRuntimeURL) {
                    const blob = await within(storage.getBlob(asset.storageKey || asset.id), 1800);
                    if (blob instanceof Blob) {
                        const url = storage.createRuntimeURL(asset.id, blob);
                        asset.data = url;
                        asset.storageKind = "indexeddb-blob";
                        asset.storageKey = asset.storageKey || asset.id;
                        addSource(url);
                    }
                }
            } catch (error) {
                console.warn("[AssetsPanel] Could not resolve persisted sprite source:", error);
            }
        }

        if (!sources.length) {
            // A legacy project can contain only card thumbnails. There is no
            // safe way to infer pixels or slice coordinates from that preview,
            // so ask once for the original file and persist it under the same
            // asset id. Later context-menu opens are then direct.
            const relinked = await this.relinkImageAssetFromPicker?.(asset);
            if (relinked?.id) return this.openSpriteSheetAsset(relinked.id);

            asset.missingStoredFile = true;
            this._saveToStorage?.();
            throw new Error(
                `The original image data for '${asset.name || asset.id}' is unavailable. ` +
                "The thumbnail was not opened because it would change sprite dimensions and break slices."
            );
        }

        const openEditor = window.openSpriteEditorSafely || window.openSpriteSheetEditor;
        if (typeof openEditor !== "function") {
            throw new Error("Sprite Sheet Studio is not loaded.");
        }

        // Always give Sprite Sheet Studio the ORIGINAL binary source.
        // The AssetsPanel thumbnail is UI-only and must never be used as the
        // sprite source. Prefer a validated source; for Blob URLs use a data
        // URL fallback when necessary so transparent PNG RGBA survives decode.
        const preparedSource =
            await this._prepareSpriteEditorSource(sources[0]) ||
            sources[0];

        const editorPayload = {
            id: asset.id,
            assetId: asset.id,
            name: asset.name || "spritesheet",
            source: preparedSource,
            sourceURL: preparedSource,
            sourceFallbacks: sources.slice(1),
            spriteSheet: asset.spriteSheet || null,

            // Newer editor builds call this when Save/Apply is pressed.
            onSave: (savedSpriteSheet) => {
                this._persistSpriteSheetEditorResult?.(asset, savedSpriteSheet);
            },
            onApply: (savedSpriteSheet) => {
                this._persistSpriteSheetEditorResult?.(asset, savedSpriteSheet);
            }
        };

        const editorResult = await openEditor(
            editorPayload,
            asset.name || "spritesheet"
        );

        // Older editor builds return the edited definition from open().
        // Newer builds can also mutate editorPayload.spriteSheet in place.
        this._persistSpriteSheetEditorResult?.(asset, editorResult);
        if (editorPayload.spriteSheet) {
            this._persistSpriteSheetEditorResult?.(
                asset,
                editorPayload.spriteSheet
            );
        }

        asset.missingStoredFile = false;
        this._saveToStorage?.();
        return asset;
    }

    static async refreshImageAssetPreviews() {
        const assets = (this.assets || []).filter((asset) =>
            this._isTextureCompatibleAssetType?.(asset?.type)
        );
        let changed = false;
        let missing = 0;

        for (const asset of assets) {
            const source = this._getAssetSourceUrl?.(asset);
            if (!source) {
                if (asset.missingStoredFile !== true) {
                    asset.missingStoredFile = true;
                    changed = true;
                }
                missing++;
                continue;
            }
            const dimensions = await this._readImageSourceDimensions(source, asset.name);
            if (!dimensions) continue;

            const dimensionsChanged =
                asset.sourceDimensions?.width !== dimensions.width ||
                asset.sourceDimensions?.height !== dimensions.height;
            if (dimensionsChanged || asset.thumbnailVersion !== 2) {
                asset.sourceDimensions = dimensions;
                asset.thumbnail = await this._generateThumbnail(source, asset.type, { name: asset.name });
                asset.thumbnailVersion = 2;
                changed = true;
            }
            if (asset.missingStoredFile) changed = true;
            asset.missingStoredFile = false;
        }
        return { changed, missing, checked: assets.length };
    }

    static _generateThumbnail(dataURL, type, file) {
        if (type === "texture" || type === "image" || type === "icon" || type === "hdri") {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = 128;
                    canvas.height = 128;
                    const ctx = canvas.getContext("2d");
                    // A thumbnail is visual chrome, not image data. Letterbox
                    // it so a tall/wide sprite sheet keeps its true aspect
                    // ratio in the Assets panel and is never mistaken for the
                    // original source by a downstream editor.
                    const width = img.naturalWidth || img.width || 1;
                    const height = img.naturalHeight || img.height || 1;
                    const scale = Math.min(128 / width, 128 / height);
                    const drawWidth = Math.max(1, Math.round(width * scale));
                    const drawHeight = Math.max(1, Math.round(height * scale));
                    const x = Math.round((128 - drawWidth) / 2);
                    const y = Math.round((128 - drawHeight) / 2);
                    ctx.drawImage(img, x, y, drawWidth, drawHeight);
                    resolve(canvas.toDataURL("image/png"));
                };
                img.onerror = () => resolve(this._svgIcon("texture"));
                img.src = dataURL;
            });
        }
        if (type === "video") {
            return new Promise((resolve) => {
                const video = document.createElement("video");
                video.crossOrigin = "anonymous";
                video.muted = true;
                video.playsInline = true;
                video.preload = "metadata";
                video.src = dataURL;

                const cleanup = () => {
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                };

                video.onloadeddata = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = 128;
                        canvas.height = 128;
                        const ctx = canvas.getContext("2d");
                        ctx.fillStyle = "#111";
                        ctx.fillRect(0, 0, 128, 128);
                        ctx.drawImage(video, 0, 0, 128, 128);
                        cleanup();
                        resolve(canvas.toDataURL("image/png"));
                    } catch {
                        cleanup();
                        resolve(this._svgIcon("video"));
                    }
                };
                video.onerror = () => {
                    cleanup();
                    resolve(this._svgIcon("video"));
                };
            });
        }
        if (type === "audio") {
            return Promise.resolve(this._svgIcon("audio"));
        }
        if (type === "model") {
            let renderer = null;
            try {
                renderer = new THREE.WebGLRenderer({
                    alpha: true,
                    antialias: true,
                    powerPreference: "low-power",
                });
                renderer.setSize(128, 128);
            } catch (e) {
                console.warn("Model thumbnail renderer init failed:", e);
                return Promise.resolve(this._svgIcon("model"));
            }
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
            scene.add(new THREE.AmbientLight(0xffffff, 2.0));
            scene.add(
                new THREE.DirectionalLight(0xffffff, 2.0).position.set(2, 3, 1),
            );

            return new Promise((resolve) => {
                const releaseRenderer = () => {
                    if (!renderer) return;
                    try {
                        const gl = renderer.getContext?.();
                        const lose = gl?.getExtension?.("WEBGL_lose_context");
                        lose?.loseContext?.();
                    } catch { }
                    try { renderer.dispose?.(); } catch { }
                    renderer = null;
                };

                const resolveWith = (value) => {
                    releaseRenderer();
                    resolve(value);
                };

                const ext = file.name.split(".").pop().toLowerCase();
                let loader;
                if (ext === "glb" || ext === "gltf") loader = this.loaders.gltf;
                else if (ext === "fbx") loader = this.loaders.fbx;
                else if (ext === "obj") loader = this.loaders.obj;
                else {
                    resolveWith(this._svgIcon("model"));
                    return;
                }

                loader.load(
                    dataURL,
                    (loadedObject) => {
                        let model = loadedObject.scene || loadedObject;

                        const bbox = new THREE.Box3().setFromObject(model);
                        if (bbox.isEmpty()) {
                            resolveWith(this._svgIcon("model"));
                            return;
                        }
                        const size = bbox.getSize(new THREE.Vector3());
                        const center = bbox.getCenter(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z) || 1;

                        model.position.sub(center);
                        camera.position.set(0, 0, maxDim * 1.5);
                        camera.lookAt(0, 0, 0);

                        scene.add(model);
                        renderer.render(scene, camera);
                        resolveWith(renderer.domElement.toDataURL("image/png"));
                    },
                    () => {
                        resolveWith(this._svgIcon("model"));
                    },
                    (error) => {
                        console.error("Model thumbnail generation error:", error);
                        resolveWith(this._svgIcon("model"));
                    },
                ); // Added error callbacks
            });
        }
        return Promise.resolve(this._svgIcon(type));
    }

    // _generateMaterialThumbnail: Now takes `definition` which might contain asset IDs or data URLs initially
    static _generateMaterialThumbnail(def) {
        return new Promise((resolve) => {
            let renderer = null;
            try {
                const size = 128;
                renderer = new THREE.WebGLRenderer({
                    alpha: true,
                    antialias: true,
                    powerPreference: "low-power",
                });
                renderer.setSize(size, size);
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
                camera.position.set(0, 0, 3);
                scene.add(new THREE.AmbientLight(0xffffff, 0.6));
                const d = new THREE.DirectionalLight(0xffffff, 1.0);
                d.position.set(2, 2, 2);
                scene.add(d);
                const mat = new THREE.MeshStandardMaterial({
                    color: def.color ? new THREE.Color(def.color) : 0xffffff,
                    roughness: def.roughness ?? 0.5,
                    metalness: def.metalness ?? 0.0,
                    emissive: def.emissive ? new THREE.Color(def.emissive) : 0x000000,
                    emissiveIntensity: def.emissiveIntensity ?? 1,
                });
                const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(0.8, 32, 16),
                    mat,
                );
                scene.add(sphere);
                const loader = new THREE.TextureLoader();
                const slots = [
                    ["map", "map"],
                    ["normalMap", "normalMap"],
                    ["roughnessMap", "roughnessMap"],
                    ["metalnessMap", "metalnessMap"],
                    ["emissiveMap", "emissiveMap"],
                    ["displacementMap", "displacementMap"],
                ];
                let pending = 0;

                for (const [k, srcKey] of slots) {
                    let textureSource = def[srcKey];
                    if (textureSource) {
                        // If it's an asset ID, resolve to data URL
                        if (!textureSource.startsWith("data:image")) {
                            const textureAsset = this._findById(textureSource);
                            const resolvedSource = textureAsset
                                ? this._getAssetSourceUrl(textureAsset)
                                : null;
                            if (resolvedSource) {
                                textureSource = resolvedSource;
                            } else {
                                textureSource = null; // Asset not found or no usable source
                            }
                        }
                        if (textureSource) {
                            pending++;
                            loader.load(
                                textureSource,
                                (t) => {
                                    mat[k] = t;
                                    mat.needsUpdate = true;
                                    pending--;
                                    if (pending === 0) finish();
                                },
                                undefined,
                                () => {
                                    pending--;
                                    if (pending === 0) finish();
                                },
                            );
                        }
                    }
                }
                const finish = () => {
                    renderer.render(scene, camera);
                    try {
                        const dURL = renderer.domElement.toDataURL("image/png");
                        try {
                            const gl = renderer.getContext?.();
                            const lose = gl?.getExtension?.("WEBGL_lose_context");
                            lose?.loseContext?.();
                        } catch { }
                        renderer.dispose();
                        renderer = null;
                        resolve(dURL);
                    } catch (e) {
                        try {
                            const gl = renderer.getContext?.();
                            const lose = gl?.getExtension?.("WEBGL_lose_context");
                            lose?.loseContext?.();
                        } catch { }
                        renderer.dispose();
                        renderer = null;
                        resolve(this._svgIcon("material"));
                    }
                };
                if (pending === 0) finish();
            } catch (e) {
                console.error("Error generating material thumbnail:", e);
                try {
                    if (renderer) {
                        const gl = renderer.getContext?.();
                        const lose = gl?.getExtension?.("WEBGL_lose_context");
                        lose?.loseContext?.();
                        renderer.dispose?.();
                        renderer = null;
                    }
                } catch { }
                resolve(this._svgIcon("material"));
            }
        });
    }

    // MODIFIED: Added new icons for advanced features
    static _svgIcon(type) {
        const icons = {
            logo: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"></path></svg>`,
            "upload-btn": ` <svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"></path></svg>`,
            "download-btn": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><!-- Download (Export Project) --><path d="M5 18h14v2H5v-2zM13 5v9h3l-4 4-4-4h3V5h2z"></path></svg>`,
            "refresh-btn": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>`,
            "upload-zone-icon": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15c0-1.66-1.34-3-3-3h-1.17C16.24 9.35 13.83 8 12 8s-4.24 1.35-4.83 3.83H6c-1.66 0-3 1.34-3 3v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-4z"></path></svg>`,
            "folder-icon-html": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-4z"></path></svg>`,

            "arrow-right": `<svg viewBox="0 0 24 24" class="svg-icon" width="16" height="16" fill="currentColor"><path d="M10 17l5-5-5-5v10z"></path></svg>`,
            "arrow-down": `<svg viewBox="0 0 24 24" class="svg-icon" width="16" height="16" fill="currentColor"><path d="M7 10l5 5 5-5H7z"></path></svg>`,

            "folder": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
            model: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>`,
            texture: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
            image: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5-4 4-2-2-5 5"></path></svg>`,
            icon: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.35 4.76 5.25.76-3.8 3.7.9 5.22L12 14.77 7.3 16.44l.9-5.22-3.8-3.7 5.25-.76L12 2z"></path></svg>`,
            video: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h11a2 2 0 0 1 2 2v1.38l3.55-2.37A1 1 0 0 1 22 6.84v10.32a1 1 0 0 1-1.45.83L17 15.62V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path></svg>`,
            audio: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 3.23v17.54a2 2 0 1 1-2-2V7.5L8 9V17a2 2 0 1 1-2-2V7.69l8-4.46z"></path></svg>`,
            hdri: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20A10 10 0 0 0 12 2z"></path><path d="M12 2v20"></path><path d="M2 12h20"></path><path d="M7 3h10"></path><path d="M7 21h10"></path><path d="M3 7v10"></path><path d="M21 7v10"></path></svg>`,
            "hdri-companion": `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M14 3v5h5"></path><path d="M8 13h8M8 17h6"></path></svg>`,
            material: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="8"/></svg>`,
            primitive: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,
            light: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-20C8.9 2 6 4.9 6 8c0 2.8 2.2 5.2 5 5.9V18h2v-4.1c2.8-.7 5-3.1 5-5.9 0-3.1-2.9-6-6-6z"/></svg>`,
            star: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
            breadcrumbs: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
            code: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M14.6 16.6L19.2 12 14.6 7.4 16 6l6 6-6 6-1.4-1.4zm-5.2 0L4.8 12 9.4 7.4 8 6l-6 6 6 6 1.4-1.4z"/></svg>`,
            file: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 1.5V9h4.5"/></svg>`,
            scene: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V7h14v12zm-2-7l-4.5 5.5L9.5 14 7 17h10z"/></svg>`,
            // NEW ICONS for advanced features
            "version-commit": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v2H5v-2zm-2-6h18v2H3v-2zm10-5h-2V3h2v6zm-4.7-2.7L6.3 7.7 10 11.4l5.7-5.7L17.7 7 10 14.7 4.3 9z"/></svg>`,
            "version-revert": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05 1.12-6.76 2.9l1.41 1.41c1.19-1.19 2.76-1.87 4.35-1.87 3.13 0 5.87 2.05 6.71 4.75h-1.42l2.3 2.3 2.3-2.3h-1.42C20.32 10.33 16.79 8 12.5 8zM6 14.75h1.42L5.12 17.05 2.82 14.75h1.42C5.68 18.67 9.21 21 13.5 21c2.65 0 5.05-1.12 6.76-2.9l-1.41-1.41c-1.19 1.19-2.76 1.87-4.35 1.87-3.13 0-5.87-2.05-6.71-4.75z"/></svg>`,
            history: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1V7l3-3 3 3H4c0 3.87 3.13 7 7 7s7-3.13 7-7c0-2.32-1.12-4.38-2.85-5.73l-1.42 1.42C15.93 5.82 17 7.31 17 9c0 3.31-2.69 6-6 6s-6-2.69-6-6h-2c0 4.42 3.58 8 8 8 4.42 0 8-3.58 8-8s-3.58-8-8-8zM12 7h-1v5l4 2 .71-1.41-3.29-1.6V7H12z"/></svg>`,
            "pack-export": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
            "prefab-create": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18 10h-2V7h-3V5h3V2h2v3h3v2h-3v3zm-3 7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm-4-7V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2v-4h-2v4H4V5h7v5h2z"/></svg>`,
        };
        return icons[type] || icons.primitive;
    }

    // ------------------------------------------------------------------
    // Rendering UI: Folders + Assets grid - MODIFIED: Added assetType to drag data
    // ------------------------------------------------------------------
    /*static render(searchQuery = "") {
        if (!this.dom.grid) return;
        this._renderBreadcrumbs();
        this._renderFolderSidebar();

        let assetsToRender = [];
        switch (this.currentCategory) {
            case "project":
                assetsToRender = this.assets.filter((a) =>
                    this.openFolderId ? a.folderId === this.openFolderId : !a.folderId,
                );
                break;
            case "favorites":
                assetsToRender = this.assets.filter((a) => a.isFavorite);
                break;
            case "primitives":
                assetsToRender = this._getPrimitiveAssets();
                break;
            case "lights":
                assetsToRender = this._getLightAssets();
                break;
            case "scripts":
                assetsToRender = this.assets.filter((a) => a.type === "code");
                break;
            case "prefabs":
                assetsToRender = this.assets.filter((a) => a.type === "prefab");
                break; // NEW: Prefabs category
            default:
                assetsToRender = this.assets;
                break;
        }
        if (this.currentFilter !== "all")
            assetsToRender = assetsToRender.filter(
                (a) => a.type === this.currentFilter,
            );
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            assetsToRender = assetsToRender.filter(
                (a) =>
                    (a.name || "").toLowerCase().includes(lowerQuery) ||
                    (a.tags || []).some((t) => t.toLowerCase().includes(lowerQuery)),
            );
        }

        this.dom.grid.innerHTML = "";
        for (const asset of assetsToRender) {
            const item = document.createElement("div");
            item.className = `asset-item ${asset.isFavorite ? "favorite" : ""} ${this.selectedIds.has(asset.id) ? "selected" : ""}`;
            item.dataset.id = asset.id;
            item.draggable = true;

            const thumbHtml =
                asset.thumbnail && asset.thumbnail.startsWith("data:image")
                    ? `<img src="${asset.thumbnail}" alt="${asset.name}" />`
                    : asset.thumbnail
                        ? asset.thumbnail
                        : this._svgIcon(asset.type);
            item.innerHTML = `
                <div class="asset-thumbnail">${thumbHtml}</div>
                <div class="asset-name">${asset.name}</div>
                <div class="asset-meta">${asset.type}</div>
                <div class="asset-fav-icon" title="Favorite">${this._svgIcon("star")}</div>
            `;

            item.onclick = (e) => {
                const append = e.ctrlKey || e.metaKey;
                this.selectAsset(asset.id, item, append, e);
            };
            item.ondblclick = () => {
                if (asset.type === "code" && typeof codeEditorManager !== "undefined") {
                    codeEditorManager.loadScriptFromAsset(asset);
                    document.getElementById("code-editor-panel").classList.add("open");
                    document.querySelector('.editor-tab[data-tab="js"]').click();
                } else {
                    this._addToScene(asset.id);
                }
            };
            item.ondragstart = (e) => {
                // MODIFIED: Add asset type for drag-drop to UI
                e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({ assetId: asset.id, assetType: asset.type }),
                );
                e.dataTransfer.effectAllowed = "copy";
            };
            item.oncontextmenu = (e) => {
                e.preventDefault();
                this._showContextMenu(e, asset.id);
            };

            this.dom.grid.appendChild(item);
        }

        if (assetsToRender.length === 0)
            this.dom.grid.innerHTML = '<div class="no-assets">No assets found.</div>';
    }*/

}
for(const key of Reflect.ownKeys(SMAssetsPanelImportPBRMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelImportPBRMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelImportPBR");
})(window);
