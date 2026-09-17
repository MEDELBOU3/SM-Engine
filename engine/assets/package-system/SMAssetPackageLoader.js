(function (global) {
    "use strict";

    if (global.SMAssetPackageLoader && global.SMAssetPackages) {
        return;
    }

    const registry = new Map();
    const active = new Map();
    const objectURLs = new Set();

    // Packages attach simulation work to this shared loop. Always establish
    // it before a Drive package executes, so a package never needs a second
    // requestAnimationFrame loop for movement or animation.
    global.engineFrameCallbacks = Array.isArray(global.engineFrameCallbacks)
        ? global.engineFrameCallbacks
        : [];

    const SMAssetPackages = {
        registerPackage(id, descriptor) {
            const key = String(id || "").trim();
            if (!key) throw new Error("SMAssetPackages.registerPackage(): missing package id.");
            if (!descriptor || typeof descriptor !== "object") {
                throw new Error(`SMAssetPackages.registerPackage("${key}"): descriptor must be an object.`);
            }
            registry.set(key, descriptor);
            global.dispatchEvent?.(
                new CustomEvent("sm-package-registered", {
                    detail: { id: key, descriptor }
                })
            );
            return descriptor;
        },

        unregisterPackage(id) {
            registry.delete(String(id || ""));
        },

        get(id) {
            return registry.get(String(id || "")) || null;
        },

        has(id) {
            return registry.has(String(id || ""));
        },

        list() {
            return Array.from(registry.entries()).map(([id, descriptor]) => ({
                id,
                descriptor
            }));
        }
    };

    class SMAssetPackageLoader {
        static get panel() {
            return global.AssetsPanel || null;
        }

        static async loadFromAsset(packageAsset, options = {}) {
            if (!packageAsset) {
                throw new Error("SMAssetPackageLoader: package asset is missing.");
            }

            const manifest = await this.fetchJSONAsset(packageAsset);

            this.validateManifest(manifest);

            const packageId = manifest.id;
            const entryPath = manifest.entry;

            if (active.has(packageId)) {
                await this.unload(packageId);
            }

            const context = this.createContext(packageAsset, manifest, options);

            await this.validateDependencies(context);

            const entryAsset = this.resolvePackageAsset(
                packageAsset,
                entryPath
            );

            if (!entryAsset) {
                throw new Error(
                    `[SM Package] Entry "${entryPath}" was not found inside package "${manifest.name || packageId}".`
                );
            }

            const entryCode = await this.fetchTextAsset(entryAsset);
            this.executePackageCode(
                entryCode,
                entryAsset.name || entryPath,
                packageId
            );

            const descriptor = await this.waitForRegistration(
                packageId,
                3000
            );

            let instance = null;

            if (typeof descriptor.activate === "function") {
                instance = await descriptor.activate(context);
            } else if (typeof descriptor.load === "function") {
                instance = await descriptor.load(context);
            } else {
                throw new Error(
                    `[SM Package] "${packageId}" registered, but exposes neither activate() nor load().`
                );
            }

            active.set(packageId, {
                packageAsset,
                manifest,
                descriptor,
                instance,
                context,
                loadedAt: Date.now(),
                gameplayRuntime: null
            });

            const record = active.get(packageId);

            /*
             * A Drive package can create a visible gameplay world, but that
             * alone does not put SMPlayerSystem into runtime-control mode.
             * The normal toolbar Play action performs that transition.  Do it
             * here for packages that explicitly declare themselves gameplay
             * samples, so the package's default Engine Player responds to
             * W/A/S/D immediately after it is loaded.
             */
            try {
                record.gameplayRuntime = await this.activateGameplayRuntime(
                    record
                );
            } catch (error) {
                // The package itself is already active. A host compatibility
                // failure must not turn a successfully loaded Drive package
                // into an unusable/stuck record.
                console.error(
                    "[SM Package] Gameplay runtime activation failed.",
                    error
                );
                record.gameplayRuntime = {
                    active: false,
                    error: error?.message || String(error)
                };
            }

            global.dispatchEvent?.(
                new CustomEvent("sm-package-loaded", {
                    detail: {
                        id: packageId,
                        manifest,
                        packageAsset,
                        instance
                    }
                })
            );

            console.log(
                `%c📦 SM Package loaded: ${manifest.name || packageId}`,
                "color:#8bd5ff;font-weight:700"
            );

            return instance;
        }

        static async unload(packageId) {
            const key = String(packageId || "");
            const record = active.get(key);
            if (!record) return false;

            try {
                await this.deactivateGameplayRuntime(record);

                if (typeof record.descriptor.deactivate === "function") {
                    await record.descriptor.deactivate(record.context, record.instance);
                }

                if (typeof record.descriptor.dispose === "function") {
                    await record.descriptor.dispose(record.context, record.instance);
                } else {
                    record.instance?.dispose?.();
                }
            } finally {
                active.delete(key);
                global.dispatchEvent?.(
                    new CustomEvent("sm-package-unloaded", {
                        detail: { id: key }
                    })
                );
            }

            return true;
        }

        static getActivePackages() {
            return Array.from(active.entries()).map(([id, record]) => ({
                id,
                manifest: record.manifest,
                loadedAt: record.loadedAt,
                gameplayRuntime: record.gameplayRuntime
                    ? {
                        active: record.gameplayRuntime.active === true,
                        error: record.gameplayRuntime.error || null,
                        startedPlayMode:
                            record.gameplayRuntime.playStartedByPackage === true
                    }
                    : null
            }));
        }

        static isGameplayPackage(manifest) {
            const type = String(manifest?.type || "").toLowerCase();
            const capabilities = new Set(
                (Array.isArray(manifest?.capabilities)
                    ? manifest.capabilities
                    : []
                ).map(value => String(value).toLowerCase())
            );

            return (
                type === "gameplay-sample" ||
                capabilities.has("gameplay-mode") ||
                capabilities.has("third-person-player")
            );
        }

        static async waitForPlayerSystem(timeoutMs = 5000) {
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                const player = global.playerSystem || null;

                if (player?.ready) {
                    return player;
                }

                if (player?.init && !player.loading) {
                    try {
                        await player.init();
                    } catch (error) {
                        console.warn(
                            "[SM Package] Gameplay player initialization failed.",
                            error
                        );
                        return null;
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 50));
            }

            return global.playerSystem?.ready
                ? global.playerSystem
                : null;
        }

        static async activateGameplayRuntime(record) {
            if (!this.isGameplayPackage(record?.manifest)) {
                return null;
            }

            const player = await this.waitForPlayerSystem();

            if (!player) {
                console.warn(
                    `[SM Package] "${record.manifest.name || record.manifest.id}" loaded without SMPlayerSystem; ` +
                    "the package can render, but Engine Player input is unavailable."
                );

                return {
                    active: false,
                    reason: "SMPlayerSystem is unavailable."
                };
            }

            const state = {
                active: false,
                player,
                previousWorkspace: player.workspaceMode || null,
                previousEnabled: player.enabled === true,
                previousRuntimeControl: player.runtimeControlActive === true,
                previousPaused: player.simulationPaused === true,
                playStartedByPackage: false,
                fallbackControl: false
            };

            // SMPlayerSystem only permits keyboard locomotion in a gameplay
            // workspace. Preserve the editor's selected workspace; this is a
            // runtime override that is restored when the package unloads.
            player.setWorkspaceMode?.("GAMEPLAY_SAMPLE");
            player.setEnabled?.(true);
            player.setSimulationPaused?.(false);

            const orchestrator = global.PlayOrchestrator || null;

            if (
                orchestrator?.mode === "edit" &&
                typeof orchestrator.startPlayMode === "function"
            ) {
                const started = await orchestrator.startPlayMode();
                state.playStartedByPackage = started === true;
            }

            if (!state.playStartedByPackage) {
                // This fallback keeps packages usable in stripped-down embeds
                // that do not load GamePlayOrchestrator.
                player.setRuntimeControlActive?.(true);
                player.possessCamera?.();
                state.fallbackControl = true;
            }

            state.active = player.input?.enabled === true &&
                player.movement?.enabled === true;

            global.dispatchEvent?.(
                new CustomEvent("sm:gameplay-package-runtime-ready", {
                    detail: {
                        id: record.manifest.id,
                        manifest: record.manifest,
                        player,
                        active: state.active,
                        startedPlayMode: state.playStartedByPackage
                    }
                })
            );

            if (!state.active) {
                console.warn(
                    `[SM Package] "${record.manifest.name || record.manifest.id}" loaded, but Engine Player input is still inactive.`
                );
            } else {
                console.info(
                    `[SM Package] Engine Player controls ready for "${record.manifest.name || record.manifest.id}" (W/A/S/D).`
                );
            }

            return state;
        }

        static async deactivateGameplayRuntime(record) {
            const state = record?.gameplayRuntime;

            if (!state?.player) {
                return false;
            }

            const orchestrator = global.PlayOrchestrator || null;

            if (
                state.playStartedByPackage &&
                typeof orchestrator?.stopPlayMode === "function"
            ) {
                await orchestrator.stopPlayMode();
            } else if (state.fallbackControl) {
                state.player.releaseCamera?.();
            }

            state.player.setWorkspaceMode?.(
                state.previousWorkspace || "FILM"
            );
            state.player.setEnabled?.(state.previousEnabled);
            state.player.setSimulationPaused?.(state.previousPaused);
            state.player.setRuntimeControlActive?.(
                state.previousRuntimeControl
            );

            global.dispatchEvent?.(
                new CustomEvent("sm:gameplay-package-runtime-stopped", {
                    detail: {
                        id: record.manifest.id,
                        manifest: record.manifest,
                        player: state.player
                    }
                })
            );

            return true;
        }

        static validateManifest(manifest) {
            if (!manifest || typeof manifest !== "object") {
                throw new Error("[SM Package] Manifest is not a JSON object.");
            }

            if (manifest.schema !== "sm-engine/package@1") {
                throw new Error(
                    `[SM Package] Unsupported schema "${manifest.schema || "missing"}". Expected "sm-engine/package@1".`
                );
            }

            if (!manifest.id || !manifest.entry) {
                throw new Error("[SM Package] Manifest must contain id and entry.");
            }
        }

        static createContext(packageAsset, manifest, options = {}) {
            const panel = this.panel;

            return {
                packageAsset,
                manifest,
                packageRootFolderId: packageAsset.folderId || null,

                scene:
                    options.scene ||
                    panel?.scene ||
                    global.scene ||
                    null,

                renderer:
                    options.renderer ||
                    panel?.renderer ||
                    global.renderer ||
                    null,

                camera:
                    options.camera ||
                    panel?.camera ||
                    global.camera ||
                    null,

                raycaster:
                    options.raycaster ||
                    panel?.raycaster ||
                    global.raycaster ||
                    null,

                AssetsPanel: panel,
                THREE: global.THREE,

                resolveAsset: (pathOrName, resolveOptions = {}) =>
                    this.resolveAsset(packageAsset, pathOrName, resolveOptions),

                resolveAssetByName: (names, resolveOptions = {}) =>
                    this.resolveAssetByName(packageAsset, names, resolveOptions),

                getAssetURL: (asset) =>
                    this.getAssetURL(asset),

                fetchText: (asset) =>
                    this.fetchTextAsset(asset),

                fetchJSON: (asset) =>
                    this.fetchJSONAsset(asset),

                loadPackageAsset: (relativePath) => {
                    const asset = this.resolvePackageAsset(packageAsset, relativePath);
                    if (!asset) {
                        throw new Error(`[SM Package] Missing package asset "${relativePath}".`);
                    }
                    return asset;
                },

                unloadSelf: () =>
                    this.unload(manifest.id)
            };
        }

        static async validateDependencies(context) {
            const dependencies = Array.isArray(context.manifest.dependencies)
                ? context.manifest.dependencies
                : [];

            const missing = [];

            for (const dependency of dependencies) {
                if (!dependency || dependency.required === false) continue;
                if (dependency.kind !== "asset") continue;

                const names = [
                    dependency.path,
                    dependency.name,
                    ...(Array.isArray(dependency.aliases) ? dependency.aliases : [])
                ].filter(Boolean);

                const asset = this.resolveAssetByName(
                    context.packageAsset,
                    names,
                    {
                        packageFirst: true,
                        global: dependency.searchGlobal !== false
                    }
                );

                if (!asset) {
                    missing.push(dependency.name || dependency.path || "Unnamed dependency");
                }
            }

            if (missing.length) {
                throw new Error(
                    `[SM Package] Missing required asset(s): ${missing.join(", ")}. ` +
                    `Add them to the package folder or sync them anywhere in AssetsPanel.`
                );
            }
        }

        static resolveAsset(packageAsset, pathOrName, options = {}) {
            if (!pathOrName) return null;

            const exact = this.resolvePackageAsset(packageAsset, pathOrName);
            if (exact) return exact;

            if (options.global === false) return null;

            return this.resolveAssetByName(
                packageAsset,
                [pathOrName],
                {
                    packageFirst: false,
                    global: true
                }
            );
        }

        static resolveAssetByName(packageAsset, names, options = {}) {
            const panel = this.panel;
            if (!panel) return null;

            const wanted = (Array.isArray(names) ? names : [names])
                .filter(Boolean)
                .map(value => String(value).trim().toLowerCase());

            if (!wanted.length) return null;

            if (options.packageFirst !== false) {
                for (const value of wanted) {
                    const packageAssetMatch = this.resolvePackageAsset(packageAsset, value);
                    if (packageAssetMatch) return packageAssetMatch;
                }

                const subtree = this.collectPackageFolderIds(packageAsset.folderId);
                const local = panel.assets?.find(asset =>
                    subtree.has(asset.folderId) &&
                    wanted.includes(String(asset.name || "").toLowerCase())
                );
                if (local) return local;
            }

            if (options.global === false) return null;

            return panel.assets?.find(asset =>
                wanted.includes(String(asset.name || "").toLowerCase())
            ) || null;
        }

        static resolvePackageAsset(packageAsset, relativePath) {
            const panel = this.panel;
            if (!panel || !packageAsset?.folderId || !relativePath) return null;

            const normalized = String(relativePath)
                .replace(/\\/g, "/")
                .replace(/^\.?\//, "")
                .trim();

            if (!normalized) return null;

            const parts = normalized.split("/").filter(Boolean);

            if (parts.length === 1) {
                return panel.assets?.find(asset =>
                    asset.folderId === packageAsset.folderId &&
                    String(asset.name || "").toLowerCase() === parts[0].toLowerCase()
                ) || null;
            }

            let folderId = packageAsset.folderId;

            for (const segment of parts.slice(0, -1)) {
                const next = Object.values(panel.folders || {}).find(folder =>
                    folder?.parentId === folderId &&
                    String(folder?.name || "").toLowerCase() === segment.toLowerCase()
                );

                if (!next) return null;
                folderId = next.id;
            }

            const filename = parts[parts.length - 1].toLowerCase();

            return panel.assets?.find(asset =>
                asset.folderId === folderId &&
                String(asset.name || "").toLowerCase() === filename
            ) || null;
        }

        static collectPackageFolderIds(rootFolderId) {
            const panel = this.panel;
            const result = new Set();
            if (!panel || !rootFolderId) return result;

            const visit = (id) => {
                if (!id || result.has(id)) return;
                result.add(id);

                for (const folder of Object.values(panel.folders || {})) {
                    if (folder?.parentId === id) {
                        visit(folder.id);
                    }
                }
            };

            visit(rootFolderId);
            return result;
        }

        static getAssetURL(asset) {
            if (!asset) return null;

            const candidates = [
                asset.url,
                asset.data,
                asset.sourceURL,
                asset.downloadURL
            ];

            for (const candidate of candidates) {
                if (typeof candidate === "string" && /^(https?:|blob:|data:)/i.test(candidate)) {
                    return candidate;
                }
            }

            const binary =
                asset.data instanceof Blob
                    ? asset.data
                    : asset.file instanceof Blob
                    ? asset.file
                    : null;

            if (binary) {
                const url = URL.createObjectURL(binary);
                objectURLs.add(url);
                return url;
            }

            return null;
        }

        static async fetchTextAsset(asset) {
            if (!asset) throw new Error("[SM Package] Cannot fetch missing asset.");

            if (
                typeof asset.data === "string" &&
                !/^(https?:|blob:|data:)/i.test(asset.data) &&
                asset.remote !== true
            ) {
                return asset.data;
            }

            const url = this.getAssetURL(asset);

            if (!url) {
                throw new Error(
                    `[SM Package] Asset "${asset.name || asset.id}" has no readable URL/data.`
                );
            }

            const headers = {};

            /**
             * Google Drive link-shared files can require a resource key.
             *
             * AssetsPanelPackageBridge stores:
             *   asset.driveFileId
             *   asset.driveResourceKey
             *
             * Google expects:
             *   X-Goog-Drive-Resource-Keys: FILE_ID/RESOURCE_KEY
             */
            if (
                asset.sourceType === "google-drive" &&
                asset.driveFileId &&
                asset.driveResourceKey
            ) {
                headers["X-Goog-Drive-Resource-Keys"] =
                    `${asset.driveFileId}/${asset.driveResourceKey}`;
            }

            const response = await fetch(
                url,
                {
                    cache: "no-store",
                    headers
                }
            );

            if (!response.ok) {
                let details = "";

                try {
                    const payload = await response.clone().json();

                    details =
                        payload?.error?.message ||
                        payload?.error?.errors?.[0]?.reason ||
                        JSON.stringify(payload);
                } catch (_) {
                    try {
                        details = await response.text();
                    } catch (_) {}
                }

                const resourceKeyHint =
                    asset.sourceType === "google-drive" &&
                    !asset.driveResourceKey
                        ? " Drive resourceKey is missing; re-sync Google Drive after installing the updated package bridge."
                        : "";

                throw new Error(
                    `[SM Package] Fetch failed for "${asset.name || asset.id}": ` +
                    `HTTP ${response.status}` +
                    `${details ? ` — ${details}` : ""}.` +
                    resourceKeyHint
                );
            }

            return await response.text();
        }

        static async fetchJSONAsset(asset) {
            const text = await this.fetchTextAsset(asset);
            try {
                return JSON.parse(text.replace(/^\uFEFF/, ""));
            } catch (error) {
                throw new Error(
                    `[SM Package] Invalid JSON in "${asset?.name || asset?.id}": ${error.message}`
                );
            }
        }

        static executePackageCode(code, filename, packageId) {
            const sourceName = String(filename || `${packageId}.js`).replace(/\s+/g, "_");

            try {
                const fn = new Function(
                    "window",
                    "document",
                    "THREE",
                    "SMAssetPackages",
                    "SMAssetPackageLoader",
                    `${code}\n//# sourceURL=sm-package://${packageId}/${sourceName}`
                );

                fn(
                    global,
                    document,
                    global.THREE,
                    SMAssetPackages,
                    SMAssetPackageLoader
                );
            } catch (error) {
                throw new Error(
                    `[SM Package] Failed to execute "${filename}": ${error.message}`
                );
            }
        }

        static waitForRegistration(packageId, timeoutMs = 3000) {
            if (registry.has(packageId)) {
                return Promise.resolve(registry.get(packageId));
            }

            return new Promise((resolve, reject) => {
                const started = performance.now();

                const tick = () => {
                    if (registry.has(packageId)) {
                        resolve(registry.get(packageId));
                        return;
                    }

                    if (performance.now() - started >= timeoutMs) {
                        reject(
                            new Error(
                                `[SM Package] Entry script did not register "${packageId}" within ${timeoutMs}ms.`
                            )
                        );
                        return;
                    }

                    setTimeout(tick, 25);
                };

                tick();
            });
        }
    }

    global.SMAssetPackages = SMAssetPackages;
    global.SMAssetPackageLoader = SMAssetPackageLoader;
})(window);
