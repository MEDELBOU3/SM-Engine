import { Router } from "./ui/Router.js";
import { UIManager } from "./ui/UIManager.js";

import { Sidebar } from "./ui/components/Sidebar.js";
import { TopBar } from "./ui/components/TopBar.js";

import { HomeView } from "./ui/views/HomeView.js";
import { ProjectsView } from "./ui/views/ProjectsView.js";
import { EngineVersionsView } from "./ui/views/EngineVersionsView.js";
import { TemplatesView } from "./ui/views/TemplatesView.js";
import { PluginsView } from "./ui/views/PluginsView.js";
import { DiagnosticsView } from "./ui/views/DiagnosticsView.js";
import { AnalyticsView } from "./ui/views/AnalyticsView.js";
import { SettingsView } from "./ui/views/SettingsView.js";

import { MarketplaceView } from "./ui/views/MarketplaceView.js";
import { LibraryView } from "./ui/views/LibraryView.js";

import { MarketplaceManager } from "./managers/MarketplaceManager.js";
import { AssetLibraryManager } from "./managers/AssetLibraryManager.js";
import { LoginView } from "./ui/views/LoginView.js";
import { RegisterView } from "./ui/views/RegisterView.js";
import { UserProfileView } from "./ui/views/UserProfileView.js";
import { AccountSettingsView } from "./ui/views/AccountSettingsView.js";

import { authService } from "./firebase/authService.js";
import { presenceService } from "./firebase/presenceService.js";

import { NewProjectModal } from "./ui/modals/NewProjectModal.js";


class LauncherApp {
    constructor() {
        this.router =
            new Router();

        this.ui =
            new UIManager();

        this.newProjectModal =
            new NewProjectModal(
                this
            );

        this.marketplaceManager =
            new MarketplaceManager(
                this
            );

        this.assetLibraryManager =
            new AssetLibraryManager(
                this
            );

        this.state = {
            activeRoute:
                "home",

            engine: {
                name:
                    "SM Engine",

                version:
                    "1.0.1",

                channel:
                    "Development",

                status:
                    "Ready",

                gpuMode:
                    "Automatic"
            },

            projects: [],

            engines: [
                {
                    id: "dev",
                    version: "1.0.1",
                    channel: "Development",
                    path:
                        "C:\\Users\\PC\\Downloads\\SM-engine-web-software",
                    current: true
                }
            ],

            templates: [
                {
                    id: "empty",
                    name: "Empty Project",
                    category: "General",
                    description:
                        "Minimal scene with a clean project structure."
                },

                {
                    id: "fps",
                    name: "First Person",
                    category: "Game",
                    description:
                        "Starter project prepared for first-person gameplay."
                },

                {
                    id: "third-person",
                    name: "Third Person",
                    category: "Game",
                    description:
                        "Character, camera and movement starter layout."
                },

                {
                    id: "film",
                    name: "Film / Cinematic",
                    category: "Film",
                    description:
                        "Cinematic-oriented project and sequencing workflow."
                }
            ],

            plugins: [
                {
                    id: "core",
                    name: "SM Core Tools",
                    version: "1.0.0",
                    status: "Enabled",
                    builtIn: true
                },

                {
                    id: "terrain",
                    name: "Terrain Tools",
                    version: "1.0.0",
                    status: "Enabled",
                    builtIn: true
                },

                {
                    id: "anime2d",
                    name: "Anime 2D Tools",
                    version: "0.9.0",
                    status: "Enabled",
                    builtIn: true
                }
            ],

            user: authService.getCurrentUser() || null
        };
    }


    async init() {
        this.registerRoutes();
        this.bindGlobalEvents();
        this.setupDownloadListeners();

        await this.loadBackendState();
        await this.reloadEngineVersions();
        await this.assetLibraryManager.load();

        // React to login / logout in real time
        authService.onAuthStateChanged(user => {
            this.state.user = user;
            this.mountShell();
        });

        this.mountShell();

        this.router.start(
            "engines"
        );
    }

    setupDownloadListeners() {
        if (!window.launcherAPI) return;

        window.launcherAPI.onDownloadProgress?.((data) => {
            const engine = this.state.engines.find(e => e.version === data.version);
            if (engine) {
                engine.status = 'Downloading';
                engine.downloadProgress = data.percentage;
                engine.downloadSpeed = data.speedFormatted;
                engine.downloadTransferred = data.transferredFormatted;
                engine.downloadTotal = data.totalFormatted;
            }

            this.mountShell(true); // update sidebar download pulse
            this.router.refresh();
        });

        window.launcherAPI.onEngineInstalled?.((data) => {
            this.notify(
                "Installation Complete",
                `SM Engine v${data.version} is ready to launch!`
            );
            this.reloadEngineVersions();
        });
    }

    async loadBackendState() {
        if (
            !window.launcherAPI
                ?.getState
        ) {
            return;
        }

        try {
            const data =
                await window
                    .launcherAPI
                    .getState();

            if (
                data?.engine
                    ?.packageJson
                    ?.version
            ) {
                this.state.engine.version =
                    data.engine
                        .packageJson
                        .version;
            }

            if (
                data?.settings
                    ?.gpuMode
            ) {
                this.state.engine.gpuMode =
                    data.settings
                        .gpuMode;
            }

            if (
                Array.isArray(
                    data?.projects
                )
            ) {
                this.state.projects =
                    data.projects;
            }
        } catch (error) {
            console.warn(
                "[Launcher] Could not load backend state:",
                error
            );
        }
    }

    async reloadEngineVersions() {
        if (!window.launcherAPI?.listEngineVersions) return;

        try {
            const result = await window.launcherAPI.listEngineVersions();
            if (result?.ok && Array.isArray(result.versions)) {
                this.state.engines = result.versions;
                const current = result.versions.find(e => e.current);
                if (current) {
                    this.state.engine.version = current.version;
                    this.state.engine.status = current.status;
                }
            }
        } catch (err) {
            console.warn("[Launcher] Could not reload engine versions:", err);
        }
        this.mountShell();
        this.router.refresh();
    }


    async reloadProjects() {
        if (
            !window.launcherAPI
                ?.listProjects
        ) {
            return;
        }

        const result =
            await window
                .launcherAPI
                .listProjects();

        if (
            result?.ok &&
            Array.isArray(
                result.projects
            )
        ) {
            this.state.projects =
                result.projects;
        }

        this.router.refresh();
    }


    registerRoutes() {
        this.router
            .register(
                "home",
                () =>
                    new HomeView(
                        this
                    )
            )
            .register(
                "marketplace",
                () =>
                    new MarketplaceView(
                        this
                    )
            )
            .register(
                "library",
                () =>
                    new LibraryView(
                        this
                    )
            )
            .register(
                "projects",
                () =>
                    new ProjectsView(
                        this
                    )
            )
            .register(
                "engines",
                () =>
                    new EngineVersionsView(
                        this
                    )
            )
            .register(
                "templates",
                () =>
                    new TemplatesView(
                        this
                    )
            )
            .register(
                "plugins",
                () =>
                    new PluginsView(
                        this
                    )
            )
            .register(
                "diagnostics",
                () =>
                    new DiagnosticsView(
                        this
                    )
            )
            .register(
                "analytics",
                () =>
                    new AnalyticsView(
                        this
                    )
            )
            .register(
                "settings",
                () =>
                    new SettingsView(
                        this
                    )
            )
            .register(
                "login",
                () =>
                    new LoginView(
                        this
                    )
            )
            .register(
                "register",
                () =>
                    new RegisterView(
                        this
                    )
            )
            .register(
                "profile",
                () =>
                    new UserProfileView(
                        this
                    )
            )
            .register(
                "account-settings",
                () =>
                    new AccountSettingsView(
                        this
                    )
            );


        this.router.onChange(
            (
                route,
                view
            ) => {
                this.state.activeRoute =
                    route;

                this.renderView(
                    view
                );

                this.mountShell();
            }
        );
    }


    mountShell() {
        const isDownloading = this.state.engines.some(e => e.status === 'Downloading');

        Sidebar.render(
            document.getElementById(
                "sidebar"
            ),
            {
                activeRoute:
                    this.state
                        .activeRoute,

                version:
                    this.state
                        .engine
                        .version,

                isDownloading,

                user:
                    this.state.user
            }
        );

        Sidebar.bind(
            document.getElementById("sidebar"),
            this
        );


        TopBar.render(
            document.getElementById(
                "topbar"
            ),
            {
                route:
                    this.state
                        .activeRoute,

                engine:
                    this.state
                        .engine,

                engines:
                    this.state
                        .engines
            }
        );
    }


    renderView(view) {
        const root =
            document.getElementById(
                "view-root"
            );

        if (
            !root ||
            !view
        ) {
            return;
        }

        root.innerHTML =
            view.render();

        view.bind?.();
    }


    bindGlobalEvents() {
        document.addEventListener(
            "click",
            event => {
                // Close any open engine dropdown menus if clicked outside
                if (!event.target.closest('[data-action="toggle-engine-menu"]')) {
                    document.querySelectorAll('.sm-epic-menu-dropdown').forEach(m => m.classList.add('sm-hidden'));
                }

                const routeButton =
                    event.target.closest(
                        "[data-route]"
                    );

                if (routeButton) {
                    this.router.go(
                        routeButton
                            .dataset
                            .route
                    );

                    return;
                }


                const actionButton =
                    event.target.closest(
                        "[data-action]"
                    );

                if (!actionButton) {
                    return;
                }

                this.handleAction(
                    actionButton
                        .dataset
                        .action,

                    actionButton
                );
            }
        );

        document.addEventListener("input", event => {
            if (event.target.dataset.action === "search-projects") {
                const currentView = this.router.currentView;
                if (currentView && typeof currentView.searchQuery !== "undefined") {
                    currentView.searchQuery = event.target.value;
                    this.router.refresh();
                }
            }
        });
    }


    async handleAction(
        action,
        element
    ) {
        switch (action) {
            case "launch-engine":
                await this.launchEngine({
                    enginePath: element.dataset.path || undefined
                });
                break;

            case "install-engine":
                await this.installEngine(
                    element.dataset.version,
                    element.dataset.url
                );
                break;

            case "cancel-download":
                await this.cancelDownload(
                    element.dataset.version
                );
                break;

            case "uninstall-engine":
                await this.uninstallEngine(
                    element.dataset.version
                );
                break;

            case "set-default-engine":
                await this.setDefaultEngine(
                    element.dataset.path
                );
                break;

            case "open-engine-dir":
                if (element.dataset.path) {
                    window.launcherAPI?.openPath(element.dataset.path);
                }
                break;

            case "add-engine-version":
                await this.addCustomEngine();
                break;

            case "open-url":
                if (element.dataset.url) {
                    window.launcherAPI?.openPath(element.dataset.url);
                }
                break;

            case "toggle-engine-menu": {
                const version = element.dataset.version || '';
                const menu = document.getElementById(`engine-menu-${version.replace(/\./g, '-')}`);
                if (menu) {
                    menu.classList.toggle('sm-hidden');
                }
                break;
            }

            case "launch-project":
                await this.launchProject(
                    element.dataset
                        .projectId
                );
                break;


            case "launch-safe":
                await this.launchEngine({
                    safeMode: true
                });
                break;


            case "new-project":
                this.newProjectModal
                    .open();
                break;


            case "create-template-project":
                this.newProjectModal
                    .open({
                        template:
                            element.dataset
                                .templateId
                    });
                break;


            case "open-project":
                await this.addExistingProject();
                break;


            case "remove-project":
                await this.removeProject(
                    element.dataset
                        .projectId
                );
                break;


            case "refresh":
                await this.loadBackendState();
                await this.reloadEngineVersions();
                await this.reloadProjects();

                this.notify(
                    "Launcher refreshed",
                    "Project and engine versions updated."
                );
                break;


            case "check-updates":
                await this.reloadEngineVersions();
                this.notify(
                    "Update check",
                    "Checked GitHub for the latest SM Engine releases."
                );
                break;


            case "copy-diagnostics":
                this.copyDiagnostics();
                break;


            case "toggle-plugin":
                this.togglePlugin(
                    element.dataset
                        .pluginId
                );
                break;
        }
    }


    async launchEngine(
        options = {}
    ) {
        if (
            !window.launcherAPI
                ?.launchEngine
        ) {
            this.notify(
                "Launch unavailable",
                "Launcher backend is not connected."
            );

            return;
        }

        try {
            const targetEngine = options.enginePath
                ? this.state.engines.find(e => e.path === options.enginePath)
                : (this.state.engines.find(e => e.current) || this.state.engines[0]);

            const result =
                await window
                    .launcherAPI
                    .launchEngine({
                        gpuMode:
                            this.state
                                .engine
                                .gpuMode,

                        enginePath: targetEngine?.path || undefined,
                        ...options
                    });

            if (
                result?.ok ===
                false
            ) {
                throw new Error(
                    result.error ||
                    "Engine could not start."
                );
            }

            this.notify(
                "SM Engine",
                "Launch request sent."
            );
        } catch (error) {
            this.notify(
                "Launch failed",
                error?.message ||
                String(error)
            );
        }
    }

    async installEngine(version, downloadUrl) {
        if (!window.launcherAPI?.installEngineVersion) return;

        try {
            const engine = this.state.engines.find(e => e.version === version);
            if (engine) {
                engine.status = 'Downloading';
                engine.downloadProgress = 1;
            }
            this.mountShell();
            this.router.refresh();

            this.notify(
                "Downloading Engine",
                `Starting download for SM Engine v${version}...`
            );

            const result = await window.launcherAPI.installEngineVersion(version, downloadUrl);
            if (!result?.ok) {
                throw new Error(result.error || "Installation failed.");
            }

            this.notify(
                "Engine Installed",
                `SM Engine v${version} was installed successfully!`
            );
            await this.reloadEngineVersions();
        } catch (err) {
            this.notify(
                "Installation Failed",
                err.message || String(err)
            );
            await this.reloadEngineVersions();
        }
    }

    async cancelDownload(version) {
        if (!window.launcherAPI?.cancelEngineDownload) return;
        await window.launcherAPI.cancelEngineDownload(version);
        this.notify("Download Cancelled", `SM Engine v${version} download was stopped.`);
        await this.reloadEngineVersions();
    }

    async uninstallEngine(version) {
        if (!window.launcherAPI?.uninstallEngineVersion) return;
        const confirm = window.confirm(`Are you sure you want to uninstall SM Engine v${version}?`);
        if (!confirm) return;

        const result = await window.launcherAPI.uninstallEngineVersion(version);
        if (result?.ok) {
            this.notify("Uninstalled", `SM Engine v${version} has been removed.`);
            await this.reloadEngineVersions();
        } else {
            this.notify("Uninstall Failed", result?.error || "Could not uninstall engine.");
        }
    }

    async setDefaultEngine(targetPath) {
        if (!window.launcherAPI?.setActiveEngine) return;
        const result = await window.launcherAPI.setActiveEngine(targetPath);
        if (result?.ok) {
            this.notify("Default Engine Updated", "Selected build is now default for new projects.");
            await this.reloadEngineVersions();
        }
    }

    async addCustomEngine() {
        if (!window.launcherAPI?.addCustomEngine) return;
        const result = await window.launcherAPI.addCustomEngine();
        if (result?.ok && result.engine) {
            this.notify("Custom Engine Added", `Linked ${result.engine.name}`);
            await this.reloadEngineVersions();
        } else if (result?.error) {
            this.notify("Error", result.error);
        }
    }


    async launchProject(
        projectId
    ) {
        if (
            !window.launcherAPI
                ?.launchProject
        ) {
            return;
        }

        const result =
            await window
                .launcherAPI
                .launchProject({
                    projectId,

                    gpuMode:
                        this.state
                            .engine
                            .gpuMode
                });

        if (!result?.ok) {
            this.notify(
                "Project launch failed",
                result?.error ||
                "Could not open project."
            );

            return;
        }

        await this.reloadProjects();

        this.notify(
            "Project launched",
            "SM Engine is opening the selected project."
        );
    }


    async addExistingProject() {
        const result =
            await window
                .launcherAPI
                ?.addExistingProject?.();

        if (!result) {
            return;
        }

        if (
            result.canceled
        ) {
            return;
        }

        if (!result.ok) {
            this.notify(
                "Invalid project",
                result.error ||
                "Could not add project."
            );

            return;
        }

        await this.reloadProjects();

        this.router.go(
            "projects"
        );

        this.notify(
            "Project added",
            result.project.name
        );
    }


    async removeProject(
        projectId
    ) {
        const result =
            await window
                .launcherAPI
                ?.removeProject?.(
                    projectId
                );

        if (!result?.ok) {
            this.notify(
                "Remove failed",
                "Project could not be removed from the launcher."
            );

            return;
        }

        await this.reloadProjects();

        this.notify(
            "Project removed",
            "The project files were not deleted."
        );
    }


    copyDiagnostics() {
        const text = [
            "SM Engine Launcher Diagnostics",
            `Engine: ${this.state.engine.version}`,
            `Channel: ${this.state.engine.channel}`,
            `GPU Mode: ${this.state.engine.gpuMode}`,
            `Projects: ${this.state.projects.length}`,
            `Platform: ${navigator.platform}`,
            `User Agent: ${navigator.userAgent}`
        ].join("\n");

        navigator.clipboard
            ?.writeText(
                text
            )
            .then(
                () =>
                    this.notify(
                        "Diagnostics copied",
                        "Diagnostic summary copied."
                    )
            );
    }


    togglePlugin(
        pluginId
    ) {
        const plugin =
            this.state.plugins
                .find(
                    item =>
                        item.id ===
                        pluginId
                );

        if (!plugin) {
            return;
        }

        plugin.status =
            plugin.status ===
            "Enabled"
                ? "Disabled"
                : "Enabled";

        this.router.refresh();
    }


    notify(
        title,
        message
    ) {
        this.ui.toast(
            title,
            message
        );
    }
}


window.addEventListener(
    "DOMContentLoaded",
    () => {
        window.SMLauncherApp =
            new LauncherApp();

        window.SMLauncherApp
            .init();
    }
);