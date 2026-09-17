/**
 * GameProjectAutoLoadBridge.js
 * STEP 7.2 — Persistent Active Game Project + Direct Load/Play
 *
 * Requires:
 *   AssetsPanel.js
 *   GameProjectAssetsBridge.js
 *   GameSceneAssetsBridge.js
 *   GameSceneLoaderBridge.js
 *   GameProjectStartupBridge.js
 *   GameProjectRuntimeBridge.js
 *   PhysicalGameProjectBridge.js
 *
 * Goals:
 *  1. Keep a Game Project persistent across editor reloads.
 *  2. Restore the last Active Game Project when SM Engine starts.
 *  3. Keep AssetsPanel at Project Assets root.
 *  4. Make both regular and physical Game Projects playable directly.
 *  5. Double-clicking a Game Project loads + starts it in the Engine.
 *  6. Dragging a Game Project to the viewport loads + starts it.
 *  7. Physical Web projects keep Web Preview as explicit fallback.
 */

(function (root) {
    "use strict";

    const STORAGE_KEY = "sm_active_game_project_id";
    const DEFAULT_PROJECT_NAME = "MyGame";

    function getAssetsPanel() {
        if (typeof AssetsPanel !== "undefined") return AssetsPanel;
        return root.AssetsPanel || null;
    }

    const GameProjectAutoLoadBridge = {

        installed: false,

        install() {
            if (this.installed) return true;

            const AP = getAssetsPanel();

            if (!AP) {
                setTimeout(() => this.install(), 100);
                return false;
            }

            if (
                typeof AP.createGameProject !== "function" ||
                typeof AP.loadGameProject !== "function"
            ) {
                console.warn(
                    "[GameProjectAutoLoadBridge] Waiting for Game Project Steps 2-6..."
                );

                setTimeout(() => this.install(), 150);
                return false;
            }

            this.installed = true;

            this._installDuplicateGuardAPI(AP);
            this._installActiveProjectAPI(AP);
            this._patchRender(AP);
            this._installViewportDrop(AP);
            this._restoreProjectOnStartup(AP);

            console.log(
                "[GameProjectAutoLoadBridge] Step 7.2 installed."
            );

            return true;
        },

        /* ============================================================
         * PROJECT DISCOVERY
         * ========================================================== */

        _getProjects(AP) {
            return Object.values(AP.folders || {})
                .filter(folder => folder?.isGameProject);
        },

        _getPhysicalProjects(AP) {
            return Object.values(AP.folders || {})
                .filter(folder => folder?.isPhysicalGameProject);
        },

        _getPlayableProjects(AP) {
            const regular = this._getProjects(AP);
            const physical = this._getPhysicalProjects(AP);

            return [
                ...regular,
                ...physical.filter(
                    physicalProject =>
                        !regular.some(
                            regularProject =>
                                regularProject.id === physicalProject.id
                        )
                )
            ];
        },

        _isPlayableProject(project) {
            return !!(
                project &&
                (
                    project.isGameProject ||
                    project.isPhysicalGameProject ||
                    project.isPlayableGameProject
                )
            );
        },

        _findProject(AP, reference) {
            if (!reference) return null;

            if (
                typeof reference === "object" &&
                this._isPlayableProject(reference)
            ) {
                return reference;
            }

            const value = String(reference)
                .trim()
                .toLowerCase();

            return this._getPlayableProjects(AP).find(folder =>
                String(folder.id || "").toLowerCase() === value ||
                String(folder.projectId || "").toLowerCase() === value ||
                String(folder.physicalGameProjectId || "").toLowerCase() === value ||
                String(folder.name || "").toLowerCase() === value
            ) || null;
        },

        /* ============================================================
         * ACTIVE PROJECT
         * ========================================================== */

        _saveActiveProjectId(project) {
            try {
                if (project?.id) {
                    localStorage.setItem(
                        STORAGE_KEY,
                        project.id
                    );
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            } catch {}
        },

        _readActiveProjectId() {
            try {
                return localStorage.getItem(STORAGE_KEY);
            } catch {
                return null;
            }
        },

        async _waitForAssetStorage(AP) {
            try {
                if (
                    AP?.assetStorageReady &&
                    typeof AP.assetStorageReady.then === "function"
                ) {
                    await AP.assetStorageReady;
                } else if (
                    typeof AP?._getPersistentAssetStorage === "function"
                ) {
                    await AP._getPersistentAssetStorage();
                }
            } catch (error) {
                console.warn(
                    "[GameProjectAutoLoadBridge] Asset storage hydration failed; continuing.",
                    error
                );
            }

            await Promise.resolve();

            return true;
        },

        _rebuildFolderChildren(AP) {
            const folders = AP.folders || {};

            for (const folder of Object.values(folders)) {
                if (!folder) continue;
                folder.children = [];
            }

            for (const folder of Object.values(folders)) {
                if (!folder?.parentId) continue;

                const parent = folders[folder.parentId];

                if (!parent) {
                    folder.parentId = null;
                    continue;
                }

                if (!parent.children.includes(folder.id)) {
                    parent.children.push(folder.id);
                }
            }
        },

        /* ============================================================
         * DUPLICATE REGULAR GAME PROJECTS
         * ========================================================== */

        _mergeDuplicateFolderTree(AP, sourceId, targetId) {
            if (
                !sourceId ||
                !targetId ||
                sourceId === targetId
            ) {
                return;
            }

            const source = AP.folders?.[sourceId];
            const target = AP.folders?.[targetId];

            if (!source || !target) return;

            for (const asset of [...(AP.assets || [])]) {

                if (!asset || asset.folderId !== sourceId) {
                    continue;
                }

                const existing = (AP.assets || []).find(candidate =>
                    candidate &&
                    candidate !== asset &&
                    candidate.folderId === targetId &&
                    String(candidate.name || "").toLowerCase() ===
                        String(asset.name || "").toLowerCase() &&
                    String(candidate.type || "") ===
                        String(asset.type || "")
                );

                if (existing) {

                    existing.tags = Array.from(
                        new Set([
                            ...(existing.tags || []),
                            ...(asset.tags || [])
                        ])
                    );

                    existing.history =
                        (existing.history?.length || 0) >=
                        (asset.history?.length || 0)
                            ? existing.history
                            : asset.history;

                    existing.references = Array.from(
                        new Set([
                            ...(existing.references || []),
                            ...(asset.references || [])
                        ])
                    );

                    AP.assets = AP.assets.filter(
                        item => item !== asset
                    );

                } else {
                    asset.folderId = targetId;
                }
            }

            const sourceChildren =
                Object.values(AP.folders || {})
                    .filter(
                        folder =>
                            folder?.parentId === sourceId
                    );

            for (const child of sourceChildren) {

                const sameName =
                    Object.values(AP.folders || {})
                        .find(candidate =>
                            candidate &&
                            candidate.id !== child.id &&
                            candidate.parentId === targetId &&
                            String(candidate.name || "").toLowerCase() ===
                                String(child.name || "").toLowerCase()
                        );

                if (sameName) {
                    this._mergeDuplicateFolderTree(
                        AP,
                        child.id,
                        sameName.id
                    );
                } else {
                    child.parentId = targetId;
                }
            }

            delete AP.folders[sourceId];
        },

        _scoreProject(
            AP,
            project,
            preferredName = DEFAULT_PROJECT_NAME
        ) {
            if (!project) return -Infinity;

            let score = 0;

            const preferred =
                String(preferredName || "").toLowerCase();

            const name =
                String(project.name || "").toLowerCase();

            if (name === preferred) score += 100;
            if (project.isBundledGameProject) score += 80;
            if (project.projectId === "smgame_mygame_starter") score += 120;
            if (AP.activeGameProjectFolderId === project.id) score += 40;

            if (
                this._readActiveProjectId() === project.id
            ) {
                score += 30;
            }

            if (project.manifestAssetId) score += 20;

            score += Object.values(AP.folders || {})
                .filter(folder =>
                    folder?.parentId === project.id
                )
                .length;

            return score;
        },

        _installDuplicateGuardAPI(AP) {

            if (
                typeof AP.dedupeGameProjects === "function"
            ) {
                return;
            }

            AP.dedupeGameProjects = function (
                options = {}
            ) {

                const bridge =
                    root.GameProjectAutoLoadBridge;

                const preferredName =
                    options.preferredName ||
                    DEFAULT_PROJECT_NAME;

                const preferredLower =
                    String(preferredName || "")
                        .trim()
                        .toLowerCase();

                // IMPORTANT:
                // Physical projects are NOT merged into the normal
                // Game Project duplicate system.
                const projects =
                    Object.values(this.folders || {})
                        .filter(folder =>
                            folder?.isGameProject &&
                            !folder?.isPhysicalGameProject
                        );

                const groups = new Map();

                for (const project of projects) {

                    const key = [
                        project.parentId || "__root__",
                        String(project.name || "")
                            .trim()
                            .toLowerCase()
                    ].join("::");

                    if (!groups.has(key)) {
                        groups.set(key, []);
                    }

                    groups.get(key).push(project);
                }

                let removed = 0;
                let preferredProject = null;

                for (const group of groups.values()) {

                    if (!group.length) continue;

                    group.sort(
                        (a, b) =>
                            bridge._scoreProject(
                                this,
                                b,
                                preferredName
                            ) -
                            bridge._scoreProject(
                                this,
                                a,
                                preferredName
                            )
                    );

                    const canonical = group[0];

                    if (
                        String(canonical.name || "")
                            .trim()
                            .toLowerCase() ===
                        preferredLower
                    ) {
                        preferredProject = canonical;
                    }

                    for (let i = 1; i < group.length; i++) {

                        const duplicate = group[i];

                        bridge._mergeDuplicateFolderTree(
                            this,
                            duplicate.id,
                            canonical.id
                        );

                        removed += 1;
                    }

                    if (
                        preferredLower === "mygame" &&
                        String(canonical.name || "")
                            .toLowerCase() === "mygame"
                    ) {
                        canonical.projectId =
                            canonical.projectId ||
                            "smgame_mygame_starter";
                    }
                }

                bridge._rebuildFolderChildren(this);

                const allProjects =
                    Object.values(this.folders || {})
                        .filter(folder =>
                            folder?.isGameProject &&
                            !folder?.isPhysicalGameProject
                        );

                if (
                    !this.folders?.[
                        this.activeGameProjectFolderId
                    ] ||
                    !this.folders?.[
                        this.activeGameProjectFolderId
                    ]?.isGameProject
                ) {

                    const replacement =
                        preferredProject ||
                        allProjects.find(project =>
                            String(project.name || "")
                                .toLowerCase() ===
                            preferredLower
                        ) ||
                        allProjects[0] ||
                        null;

                    this.activeGameProjectFolderId =
                        replacement?.id || null;

                    bridge._saveActiveProjectId(
                        replacement
                    );
                }

                if (removed > 0) {

                    if (options.save !== false) {
                        this._saveToStorage?.();
                    }

                    if (options.render !== false) {
                        this.render?.();
                        this._buildTagCloud?.();
                    }

                    console.warn(
                        `[AssetsPanel] Removed ${removed} duplicate Game Project folder(s).`
                    );
                }

                return (
                    preferredProject ||
                    allProjects.find(project =>
                        String(project.name || "")
                            .toLowerCase() ===
                        preferredLower
                    ) ||
                    null
                );
            };
        },

        /* ============================================================
         * ACTIVE PROJECT API
         * ========================================================== */

        _installActiveProjectAPI(AP) {

            AP.getActiveGameProject = function () {

                const bridge =
                    root.GameProjectAutoLoadBridge;

                if (this.activeGameProjectFolderId) {

                    const current =
                        this.folders?.[
                            this.activeGameProjectFolderId
                        ];

                    if (
                        bridge._isPlayableProject(current)
                    ) {
                        return current;
                    }
                }

                const storedId =
                    bridge._readActiveProjectId();

                if (storedId) {

                    const stored =
                        this.folders?.[storedId];

                    if (
                        bridge._isPlayableProject(stored)
                    ) {
                        this.activeGameProjectFolderId =
                            stored.id;

                        return stored;
                    }
                }

                return null;
            };

            AP.setActiveGameProject = function (
                reference,
                options = {}
            ) {

                const bridge =
                    root.GameProjectAutoLoadBridge;

                const project =
                    bridge._findProject(
                        this,
                        reference
                    );

                if (!project) {

                    console.warn(
                        "[AssetsPanel] Game Project not found:",
                        reference
                    );

                    return null;
                }

                if (
                    project.isGameProject &&
                    typeof this.initializeGameProjectStructure ===
                        "function"
                ) {
                    this.initializeGameProjectStructure(
                        project.id
                    );
                }

                this.activeGameProjectFolderId =
                    project.id;

                bridge._saveActiveProjectId(project);

                root.SMActiveGameProject = {
                    folderId: project.id,
                    projectId:
                        project.projectId ||
                        project.physicalGameProjectId ||
                        null,
                    name: project.name,
                    manifestAssetId:
                        project.manifestAssetId ||
                        null,
                    physical:
                        !!project.isPhysicalGameProject,
                    projectType:
                        project.projectType ||
                        null
                };

                if (
                    options.openProject === true
                ) {

                    this.openFolderId =
                        project.id;

                    this.currentCategory =
                        "project";

                    this.expandedFolders?.add?.(
                        project.id
                    );
                }

                this.render?.();

                try {
                    root.dispatchEvent(
                        new CustomEvent(
                            "sm-active-game-project-changed",
                            {
                                detail: {
                                    project
                                }
                            }
                        )
                    );
                } catch {}

                console.log(
                    `[AssetsPanel] Active Game Project: ${project.name}`
                );

                return project;
            };

            AP.ensureDefaultGameProject =
                function (
                    preferredName =
                        DEFAULT_PROJECT_NAME
                ) {

                    const bridge =
                        root.GameProjectAutoLoadBridge;

                    let project =
                        this.getActiveGameProject?.();

                    if (!project) {

                        project =
                            bridge._findProject(
                                this,
                                preferredName
                            ) ||
                            bridge._getProjects(this)[0] ||
                            null;
                    }

                    if (
                        !project &&
                        this.assetStorageReady &&
                        !this.assetStorageHydrated
                    ) {
                        return null;
                    }

                    if (!project) {

                        const created =
                            this.createGameProject(
                                preferredName,
                                null
                            );

                        project =
                            created?.folder ||
                            null;
                    }

                    if (!project) {
                        return null;
                    }

                    this.setActiveGameProject(
                        project,
                        {
                            openProject: false
                        }
                    );

                    return project;
                };

            AP.openActiveGameProject = function () {

                const project =
                    this.getActiveGameProject?.();

                if (!project) return null;

                this.openFolderId =
                    project.id;

                this.currentCategory =
                    "project";

                this.expandedFolders?.add(
                    project.id
                );

                this.render?.();

                return project;
            };

            AP.showGameProjectsRoot =
                function () {

                    this.openFolderId = null;
                    this.currentCategory = "project";

                    this.render?.();
                };
        },

        /* ============================================================
         * LOAD / PLAY PIPELINE
         * ========================================================== */

        async _loadProjectIntoEngine(
            AP,
            project,
            options = {}
        ) {

            if (!project) {
                return false;
            }

            const openStartup =
                options.openStartup !== false;

            const replaceScene =
                options.replaceScene !== false;

            const requireStartup =
                options.requireStartup === true;

            /* --------------------------------------------------------
             * PHYSICAL GAME PROJECT
             * ----------------------------------------------------- */

            if (
                project.isPhysicalGameProject
            ) {

                const bridge =
                    root.PhysicalGameProjectBridge;

                if (!bridge) {

                    console.error(
                        "[GameProjectAutoLoadBridge] PhysicalGameProjectBridge unavailable."
                    );

                    return false;
                }

                // Native physical project:
                // load + play in native engine.
                if (
                    project.isNativePhysicalGameProject
                ) {

                    const result =
                        await bridge.playNativeProject(
                            project,
                            options
                        );

                    return result !== false;
                }

                // Web-only physical project:
                // explicit Web Preview.
                return (
                    bridge.openWebPreview(
                        project
                    ) !== false
                );
            }

            /* --------------------------------------------------------
             * NORMAL GAME PROJECT
             * ----------------------------------------------------- */

            if (
                typeof AP.loadGameProject !==
                "function"
            ) {
                console.error(
                    "[GameProjectAutoLoadBridge] AssetsPanel.loadGameProject is unavailable."
                );

                return false;
            }

            const loaded =
                await AP.loadGameProject(
                    project,
                    {
                        openStartup,
                        replaceScene,
                        requireStartup
                    }
                );

            if (!loaded) {
                console.warn(
                    `[GameProjectAutoLoadBridge] Could not load ${project.name}.`
                );

                return false;
            }

            /*
             * The load bridge may already start the runtime.
             * We intentionally try runtime APIs only when they
             * are available, without assuming one specific bridge.
             */

            const runtimeBridge =
                root.GameProjectRuntimeBridge;

            if (
                typeof runtimeBridge?.playProject ===
                "function"
            ) {

                try {

                    await runtimeBridge.playProject(
                        project,
                        options
                    );

                } catch (error) {

                    console.warn(
                        "[GameProjectAutoLoadBridge] Runtime play bridge failed after load.",
                        error
                    );
                }

            } else if (
                typeof AP.playGameProject ===
                "function"
            ) {

                try {
                    await AP.playGameProject(
                        project,
                        options
                    );
                } catch (error) {
                    console.warn(
                        "[GameProjectAutoLoadBridge] AssetsPanel playGameProject failed.",
                        error
                    );
                }

            } else if (
                typeof AP.startGameProject ===
                "function"
            ) {

                try {
                    await AP.startGameProject(
                        project,
                        options
                    );
                } catch (error) {
                    console.warn(
                        "[GameProjectAutoLoadBridge] AssetsPanel startGameProject failed.",
                        error
                    );
                }
            }

            return true;
        },

        async openAndPlayProject(
            reference,
            options = {}
        ) {

            const AP =
                getAssetsPanel();

            if (!AP) {
                return false;
            }

            const project =
                this._findProject(
                    AP,
                    reference
                );

            if (!project) {

                console.warn(
                    "[GameProjectAutoLoadBridge] Project not found:",
                    reference
                );

                return false;
            }

            const active =
                AP.setActiveGameProject?.(
                    project,
                    {
                        openProject: false
                    }
                );

            if (!active) {
                return false;
            }

            const result =
                await this._loadProjectIntoEngine(
                    AP,
                    project,
                    {
                        openStartup:
                            options.openStartup !== false,
                        replaceScene:
                            options.replaceScene !== false,
                        requireStartup:
                            options.requireStartup === true
                    }
                );

            if (result) {

                console.log(
                    `[GameProjectAutoLoadBridge] Directly loaded and started: ${project.name}`
                );

                try {
                    root.dispatchEvent(
                        new CustomEvent(
                            "sm-game-project-direct-play",
                            {
                                detail: {
                                    project
                                }
                            }
                        )
                    );
                } catch {}
            }

            return result;
        },

        /* ============================================================
         * STARTUP RESTORE
         * ========================================================== */

        _restoreProjectOnStartup(AP) {

            setTimeout(async () => {

                await this._waitForAssetStorage(
                    AP
                );

                AP.dedupeGameProjects?.({
                    preferredName:
                        DEFAULT_PROJECT_NAME,
                    save: true,
                    render: false
                });

                let project =
                    AP.ensureDefaultGameProject?.(
                        DEFAULT_PROJECT_NAME
                    );

                if (
                    !project &&
                    AP.assetStorageReady &&
                    !AP.assetStorageHydrated
                ) {

                    await this._waitForAssetStorage(
                        AP
                    );

                    project =
                        AP.ensureDefaultGameProject?.(
                            DEFAULT_PROJECT_NAME
                        );
                }

                if (!project) {
                    return;
                }

                AP.dedupeGameProjects?.({
                    preferredName:
                        DEFAULT_PROJECT_NAME,
                    save: true,
                    render: false
                });

                AP.openFolderId = null;
                AP.currentCategory = "project";

                AP.render?.();

                console.log(
                    `[GameProjectAutoLoadBridge] Restored Active Project: ${project.name}`
                );

            }, 0);
        },

        /* ============================================================
         * RENDER PATCH
         * ========================================================== */

        _patchRender(AP) {

            if (AP.__smAutoProjectRenderV8) {
                return;
            }

            AP.__smAutoProjectRenderV8 = true;

            const original =
                AP.render;

            AP.render = function (...args) {

                const result =
                    original.apply(
                        this,
                        args
                    );

                const activeProject =
                    this.getActiveGameProject?.();

                const visibleFolders =
                    Object.values(
                        this.folders || {}
                    )
                        .filter(
                            folder =>
                                (folder.parentId || null) ===
                                (this.openFolderId || null)
                        )
                        .sort(
                            (a, b) =>
                                String(a.name || "")
                                    .localeCompare(
                                        String(b.name || "")
                                    )
                        );

                const cards =
                    Array.from(
                        this.dom?.grid?.querySelectorAll?.(
                            ".asset-item.folder-item"
                        ) || []
                    );

                cards.forEach(
                    (card, index) => {

                        const folder =
                            visibleFolders[index];

                        if (!folder) {
                            return;
                        }

                        card.dataset.folderId =
                            folder.id;

                        const isPlayable =
                            folder.isGameProject ||
                            folder.isPhysicalGameProject ||
                            folder.isPlayableGameProject;

                        if (!isPlayable) {
                            return;
                        }

                        /* ------------------------------------------------
                         * ACTIVE PROJECT VISUAL STATE
                         * --------------------------------------------- */

                        if (
                            activeProject?.id ===
                            folder.id
                        ) {

                            card.classList.add(
                                "sm-active-project-folder"
                            );

                            const meta =
                                card.querySelector(
                                    ".asset-meta"
                                );

                            if (meta) {
                                meta.textContent =
                                    "Game Project • Active";
                            }
                        }

                        /* ------------------------------------------------
                         * DIRECT DOUBLE CLICK
                         * --------------------------------------------- */

                        card.ondblclick =
                            async event => {

                                event.preventDefault();
                                event.stopPropagation();

                                card.classList.add(
                                    "sm-project-loading"
                                );

                                try {

                                    await root.GameProjectAutoLoadBridge
                                        .openAndPlayProject(
                                            folder,
                                            {
                                                openStartup:
                                                    true,
                                                replaceScene:
                                                    true,
                                                requireStartup:
                                                    false
                                            }
                                        );

                                } catch (error) {

                                    console.error(
                                        "[GameProjectAutoLoadBridge] Direct project play failed.",
                                        error
                                    );

                                } finally {

                                    card.classList.remove(
                                        "sm-project-loading"
                                    );
                                }
                            };

                        /* ------------------------------------------------
                         * DRAG GAME PROJECT TO VIEWPORT
                         * --------------------------------------------- */

                        card.draggable = true;

                        card.ondragstart =
                            event => {

                                const payload = {
                                    kind:
                                        "sm-game-project",

                                    folderId:
                                        folder.id,

                                    projectId:
                                        folder.projectId ||
                                        folder.physicalGameProjectId ||
                                        null,

                                    projectType:
                                        folder.projectType ||
                                        null,

                                    name:
                                        folder.name,

                                    physical:
                                        !!folder.isPhysicalGameProject,

                                    native:
                                        !!folder.isNativePhysicalGameProject
                                };

                                const json =
                                    JSON.stringify(
                                        payload
                                    );

                                event.dataTransfer.setData(
                                    "application/x-sm-game-project",
                                    json
                                );

                                event.dataTransfer.setData(
                                    "application/json",
                                    json
                                );

                                event.dataTransfer.effectAllowed =
                                    "copy";
                            };
                    }
                );

                return result;
            };
        },

        /* ============================================================
         * VIEWPORT
         * ========================================================== */

        _getRendererElement(AP) {
            return (
                AP.renderer?.domElement ||
                root.renderer?.domElement ||
                document.querySelector(
                    "#editor-scene canvas, canvas"
                )
            );
        },

        _installViewportDrop(AP) {

            const canvas =
                this._getRendererElement(AP);

            if (!canvas) {

                console.warn(
                    "[GameProjectAutoLoadBridge] Viewport canvas not ready; retrying..."
                );

                setTimeout(
                    () =>
                        this._installViewportDrop(
                            AP
                        ),
                    300
                );

                return;
            }

            if (
                canvas.__smGameProjectDropV8
            ) {
                return;
            }

            canvas.__smGameProjectDropV8 =
                true;

            const originalDrop =
                canvas.ondrop;

            const originalDragOver =
                canvas.ondragover;

            canvas.ondragover =
                event => {

                    let isGameProject =
                        false;

                    try {

                        isGameProject =
                            Array.from(
                                event.dataTransfer?.types || []
                            ).includes(
                                "application/x-sm-game-project"
                            );

                    } catch {}

                    if (isGameProject) {

                        event.preventDefault();

                        if (
                            event.dataTransfer
                        ) {
                            event.dataTransfer.dropEffect =
                                "copy";
                        }

                        canvas.classList.add(
                            "sm-game-project-drop-target"
                        );

                        return;
                    }

                    if (
                        typeof originalDragOver ===
                        "function"
                    ) {

                        return originalDragOver.call(
                            canvas,
                            event
                        );
                    }

                    event.preventDefault();
                };

            canvas.addEventListener(
                "dragleave",
                () => {

                    canvas.classList.remove(
                        "sm-game-project-drop-target"
                    );
                }
            );

            canvas.ondrop =
                async event => {

                    let raw = "";

                    try {

                        raw =
                            event.dataTransfer.getData(
                                "application/x-sm-game-project"
                            );

                    } catch {}

                    if (raw) {

                        event.preventDefault();
                        event.stopPropagation();

                        canvas.classList.remove(
                            "sm-game-project-drop-target"
                        );

                        let payload = null;

                        try {
                            payload =
                                JSON.parse(raw);
                        } catch {
                            payload = null;
                        }

                        if (
                            payload?.kind ===
                                "sm-game-project" &&
                            payload.folderId
                        ) {

                            try {

                                await this.openAndPlayProject(
                                    payload.folderId,
                                    {
                                        openStartup:
                                            true,
                                        replaceScene:
                                            true,
                                        requireStartup:
                                            false
                                    }
                                );

                            } catch (error) {

                                console.error(
                                    "[GameProjectAutoLoadBridge] Viewport project drop failed.",
                                    error
                                );
                            }

                            return;
                        }
                    }

                    // Existing models/materials/etc.
                    if (
                        typeof originalDrop ===
                        "function"
                    ) {

                        return originalDrop.call(
                            canvas,
                            event
                        );
                    }
                };

            console.log(
                "[GameProjectAutoLoadBridge] Direct Game Project viewport drop ready."
            );
        }
    };

    root.GameProjectAutoLoadBridge =
        GameProjectAutoLoadBridge;

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            () =>
                GameProjectAutoLoadBridge.install(),
            {
                once: true
            }
        );

    } else {

        GameProjectAutoLoadBridge.install();
    }

})(window);