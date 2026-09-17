/**
 * engine/logic/Managers/ThreeJSNativeProjectBridge.js
 * SM Engine - Native compatibility bridge for physical Three.js projects.
 *
 * Goal:
 *  - Run a legacy Three.js game inside the SM Engine process WITHOUT iframe.
 *  - SM Engine keeps ownership of the real Scene, WebGLRenderer and frame loop.
 *  - Legacy project code receives compatibility facades for THREE.Scene,
 *    THREE.WebGLRenderer, loaders, requestAnimationFrame and DOM access.
 *  - Objects added by the project are parented under one selectable project root.
 *
 * IMPORTANT:
 *  - This is a compatibility bridge, not a second renderer.
 *  - It never creates a WebGLRenderer.
 *  - It never starts its own requestAnimationFrame loop.
 *
 * Load AFTER AssetManager.js and PhysicalGameProjectBridge.js.
 */
(function (root) {
    "use strict";

    const NATIVE_TAG = "sm-native-project";

    function normalizePath(value = "") {
        const raw = String(value || "").replace(/\\/g, "/").trim();
        const protocolMatch = raw.match(/^([a-z]+:)?\/\//i);
        if (protocolMatch) return raw;

        const parts = [];
        for (const part of raw.replace(/^\/+/, "").split("/")) {
            if (!part || part === ".") continue;
            if (part === "..") parts.pop();
            else parts.push(part);
        }
        return parts.join("/");
    }

    function ensureTrailingSlash(value = "") {
        const clean = String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
        return clean ? `${clean}/` : "";
    }

    function joinURL(rootURL, relativePath = "") {
        const rootPart = ensureTrailingSlash(rootURL);
        const path = normalizePath(relativePath);
        return rootPart + path;
    }

    function isAbsoluteURL(value = "") {
        return /^(?:[a-z]+:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value);
    }

    function getAP() {
        return root.AssetsPanel || (typeof AssetsPanel !== "undefined" ? AssetsPanel : null);
    }

    function getPhysicalBridge() {
        return root.PhysicalGameProjectBridge || null;
    }

    function makeNullElement() {
        const classList = {
            add() {}, remove() {}, toggle() { return false; }, contains() { return false; },
            replace() { return false; }, forEach() {}
        };

        const target = {
            style: Object.create(null),
            dataset: Object.create(null),
            classList,
            children: [],
            childNodes: [],
            value: "",
            textContent: "",
            innerText: "",
            innerHTML: "",
            hidden: false,
            disabled: false,
            checked: false,
            appendChild(node) { return node; },
            removeChild(node) { return node; },
            replaceChildren() {},
            remove() {},
            focus() {},
            blur() {},
            click() {},
            play() { return Promise.resolve(); },
            pause() {},
            load() {},
            addEventListener() {},
            removeEventListener() {},
            setAttribute() {},
            removeAttribute() {},
            getAttribute() { return null; },
            querySelector() { return makeNullElement(); },
            querySelectorAll() { return []; },
            closest() { return null; },
            matches() { return false; },
            getContext() { return null; },
            getBoundingClientRect() {
                return { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, x: 0, y: 0 };
            }
        };

        return new Proxy(target, {
            get(obj, prop) {
                if (prop in obj) return obj[prop];
                if (typeof prop === "symbol") return obj[prop];
                return undefined;
            },
            set(obj, prop, value) {
                obj[prop] = value;
                return true;
            }
        });
    }

    function getActiveScene() {
        const AP = getAP();
        const candidates = [
            root.SMViewportSystem?.getActivePanel?.()?.scene,
            root.SMSceneSystem?.getActiveScene?.(),
            root.SMSceneManager?.getActiveScene?.(),
            AP?.scene,
            root.scene,
            root.editor?.scene
        ];

        return candidates.find(scene => scene?.isScene || scene?.isObject3D) || null;
    }

    function getActiveRenderer() {
        const AP = getAP();
        const candidates = [
            root.SMViewportSystem?.getActivePanel?.()?.renderer,
            root.SMRenderer?.renderer,
            root.SMRendererSystem?.renderer,
            AP?.renderer,
            root.renderer,
            root.editor?.renderer
        ];

        return candidates.find(renderer => renderer?.domElement && typeof renderer.render === "function") || null;
    }

    function getEditorCamera() {
        const AP = getAP();
        const candidates = [
            root.getActiveViewportCamera?.(),
            root.SMViewportSystem?.getActivePanel?.()?.camera,
            root.SMViewportSystem?.getActiveCamera?.(),
            AP?.camera,
            root.camera,
            root.editor?.camera
        ];

        return candidates.find(camera => camera?.isCamera) || null;
    }

    function markProjectObject(object, projectId) {
        if (!object?.isObject3D) return;
        object.userData ||= {};
        object.userData.smNativeProjectId = projectId;
        object.userData[NATIVE_TAG] = true;
    }

    const ThreeJSNativeProjectBridge = {
        installed: true,
        runtimes: new Map(),

        isLoaded(projectId) {
            return !!this.runtimes.get(String(projectId || ""))?.loaded;
        },

        _resolveProject(reference = null) {
            const physical = getPhysicalBridge();
            return physical?._resolveProject?.(reference) || null;
        },

        _resolveRecord(project) {
            return getPhysicalBridge()?.getProjectRecord?.(project) || null;
        },

        _resolveAssetURL(runtime, source = "") {
            const raw = String(source || "").trim();
            if (!raw) return raw;
            if (isAbsoluteURL(raw) || raw.startsWith("#")) return raw;
            // Keep absolute same-origin API/navigation paths untouched.
            if (raw.startsWith("/")) return raw;

            const AP = getAP();
            const projectId = runtime.projectId;
            const rootUrl = runtime.config.rootUrl || runtime.project.physicalRoot || "";
            const sourceRoot = normalizePath(runtime.manifest.sourceRoot || runtime.config.sourceRoot || "game-project");

            const cleanRaw = raw.replace(/\\/g, "/").replace(/^\.\//, "");
            const normalized = normalizePath(cleanRaw);

            const assets = (AP?.assets || []).filter(
                asset => asset?.physicalGameProjectId === projectId
            );

            const exact = assets.find(asset => normalizePath(asset.sourcePath) === normalized);
            if (exact?.sourceURL || exact?.data) return exact.sourceURL || exact.data;

            const sourceRootCandidate = normalizePath(`${sourceRoot}/${normalized}`);
            const rooted = assets.find(asset => normalizePath(asset.sourcePath) === sourceRootCandidate);
            if (rooted?.sourceURL || rooted?.data) return rooted.sourceURL || rooted.data;

            // Legacy Sunset Forest paths normally use ./assets/... relative to game-project/index.html.
            if (/^(?:\.\.\/)*assets\//i.test(cleanRaw)) {
                const stripped = cleanRaw.replace(/^(?:\.\.\/)+/, "");
                const candidate = normalizePath(`${sourceRoot}/${stripped}`);
                const matched = assets.find(asset => normalizePath(asset.sourcePath) === candidate);
                if (matched?.sourceURL || matched?.data) return matched.sourceURL || matched.data;
                return joinURL(rootUrl, candidate);
            }

            // If a path uniquely ends with the requested suffix, prefer the physical mirror.
            const suffix = `/${normalized}`.toLowerCase();
            const bySuffix = assets.filter(asset =>
                `/${normalizePath(asset.sourcePath)}`.toLowerCase().endsWith(suffix)
            );
            if (bySuffix.length === 1) return bySuffix[0].sourceURL || bySuffix[0].data;

            return joinURL(rootUrl, normalized);
        },

        _createLoaderFacade(runtime, OriginalLoader) {
            if (typeof OriginalLoader !== "function") return OriginalLoader;
            const bridge = this;

            function LoaderFacade(...args) {
                const loader = new OriginalLoader(...args);
                return new Proxy(loader, {
                    get(target, prop) {
                        if (prop === "load" && typeof target.load === "function") {
                            return function (url, ...rest) {
                                return target.load.call(target, bridge._resolveAssetURL(runtime, url), ...rest);
                            };
                        }
                        if (prop === "loadAsync" && typeof target.loadAsync === "function") {
                            return function (url, ...rest) {
                                return target.loadAsync.call(target, bridge._resolveAssetURL(runtime, url), ...rest);
                            };
                        }
                        const value = Reflect.get(target, prop, target);
                        return typeof value === "function" ? value.bind(target) : value;
                    },
                    set(target, prop, value) {
                        return Reflect.set(target, prop, value, target);
                    }
                });
            }

            LoaderFacade.prototype = OriginalLoader.prototype;
            try { Object.setPrototypeOf(LoaderFacade, OriginalLoader); } catch {}
            return LoaderFacade;
        },

        _createSceneFacade(runtime) {
            const engineScene = runtime.scene;
            const projectRoot = runtime.projectRoot;

            const localMethods = new Set([
                "add", "remove", "clear", "traverse", "traverseVisible",
                "getObjectByName", "getObjectById", "getObjectByProperty",
                "getObjectsByProperty", "updateMatrixWorld", "updateWorldMatrix"
            ]);

            const facadeTarget = {
                isScene: true,
                isObject3D: true,
                type: "Scene",
                name: runtime.project.name,
                uuid: projectRoot.uuid,
                id: projectRoot.id,

                add: (...objects) => {
                    for (const object of objects) {
                        if (!object?.isObject3D) continue;
                        markProjectObject(object, runtime.projectId);
                        projectRoot.add(object);
                    }
                    runtime.importedObjectCount += objects.filter(object => object?.isObject3D).length;
                    runtime.requestHierarchyRefresh();
                    return runtime.sceneFacade;
                },

                remove: (...objects) => {
                    projectRoot.remove(...objects);
                    runtime.requestHierarchyRefresh();
                    return runtime.sceneFacade;
                },

                clear: () => {
                    while (projectRoot.children.length) projectRoot.remove(projectRoot.children[0]);
                    runtime.requestHierarchyRefresh();
                    return runtime.sceneFacade;
                },

                traverse: callback => projectRoot.traverse(callback),
                traverseVisible: callback => projectRoot.traverseVisible(callback),
                getObjectByName: (...args) => projectRoot.getObjectByName(...args),
                getObjectById: (...args) => projectRoot.getObjectById(...args),
                getObjectByProperty: (...args) => projectRoot.getObjectByProperty(...args),
                getObjectsByProperty: (...args) => projectRoot.getObjectsByProperty?.(...args) || [],
                updateMatrixWorld: (...args) => projectRoot.updateMatrixWorld(...args),
                updateWorldMatrix: (...args) => projectRoot.updateWorldMatrix(...args)
            };

            const facade = new Proxy(facadeTarget, {
                get(target, prop) {
                    if (prop === "children") return projectRoot.children;
                    if (prop === "parent") return engineScene.parent;
                    if (prop === "background" || prop === "environment" || prop === "fog" || prop === "overrideMaterial") {
                        return engineScene[prop];
                    }
                    if (prop in target) return target[prop];
                    if (localMethods.has(prop) && typeof projectRoot[prop] === "function") {
                        return projectRoot[prop].bind(projectRoot);
                    }
                    const value = engineScene[prop];
                    return typeof value === "function" ? value.bind(engineScene) : value;
                },
                set(target, prop, value) {
                    if (prop === "background" || prop === "environment" || prop === "fog" || prop === "overrideMaterial") {
                        engineScene[prop] = value;
                        runtime.sceneMutations.add(prop);
                        return true;
                    }
                    if (prop in target) {
                        target[prop] = value;
                        return true;
                    }
                    try {
                        projectRoot[prop] = value;
                        return true;
                    } catch {
                        return true;
                    }
                }
            });

            runtime.sceneFacade = facade;
            return facade;
        },

        _createRendererFacade(runtime) {
            const renderer = runtime.renderer;
            const bridge = this;
            const blockedMethods = new Set([
                "render", "setSize", "setPixelRatio", "dispose", "forceContextLoss",
                "setAnimationLoop"
            ]);
            const blockedProperties = new Set([
                "toneMapping", "toneMappingExposure", "outputColorSpace", "outputEncoding",
                "physicallyCorrectLights", "useLegacyLights", "autoClear"
            ]);

            const facade = new Proxy(renderer, {
                get(target, prop) {
                    if (prop === "render") {
                        return function (_scene, camera) {
                            if (camera?.isCamera) runtime.gameCamera = camera;
                            runtime.suppressedRenderCalls++;
                        };
                    }
                    if (prop === "setAnimationLoop") {
                        return function (callback) {
                            runtime.animationCallback = typeof callback === "function" ? callback : null;
                        };
                    }
                    if (prop === "setSize" || prop === "setPixelRatio") {
                        return function (...args) {
                            runtime.requestedRendererCalls.push({ method: String(prop), args });
                            return facade;
                        };
                    }
                    if (prop === "dispose" || prop === "forceContextLoss") {
                        return function () {};
                    }
                    const value = Reflect.get(target, prop, target);
                    return typeof value === "function" && !blockedMethods.has(prop)
                        ? value.bind(target)
                        : value;
                },
                set(target, prop, value) {
                    if (blockedProperties.has(prop)) {
                        runtime.requestedRendererSettings[String(prop)] = value;
                        return true;
                    }
                    try {
                        return Reflect.set(target, prop, value, target);
                    } catch {
                        return true;
                    }
                }
            });

            runtime.rendererFacade = facade;
            runtime.resolveAssetURL = source => bridge._resolveAssetURL(runtime, source);
            return facade;
        },

        _createThreeFacade(runtime) {
            const THREE = root.THREE;
            const bridge = this;
            const trackedLoaderNames = new Set([
                "GLTFLoader", "FBXLoader", "OBJLoader", "TextureLoader", "AudioLoader",
                "FileLoader", "ImageLoader", "CubeTextureLoader", "RGBELoader"
            ]);

            const SceneFacadeCtor = function SceneFacadeCtor() {
                return runtime.sceneFacade;
            };

            const RendererFacadeCtor = function RendererFacadeCtor() {
                return runtime.rendererFacade;
            };

            const PerspectiveCameraCtor = function PerspectiveCameraCtor(...args) {
                const camera = new THREE.PerspectiveCamera(...args);
                runtime.cameras.add(camera);
                if (!runtime.gameCamera) runtime.gameCamera = camera;
                return camera;
            };
            PerspectiveCameraCtor.prototype = THREE.PerspectiveCamera?.prototype;

            const OrthographicCameraCtor = function OrthographicCameraCtor(...args) {
                const camera = new THREE.OrthographicCamera(...args);
                runtime.cameras.add(camera);
                if (!runtime.gameCamera) runtime.gameCamera = camera;
                return camera;
            };
            OrthographicCameraCtor.prototype = THREE.OrthographicCamera?.prototype;

            return new Proxy(THREE, {
                get(target, prop) {
                    if (prop === "Scene") return SceneFacadeCtor;
                    if (prop === "WebGLRenderer" || prop === "WebGL1Renderer") return RendererFacadeCtor;
                    if (prop === "PerspectiveCamera" && THREE.PerspectiveCamera) return PerspectiveCameraCtor;
                    if (prop === "OrthographicCamera" && THREE.OrthographicCamera) return OrthographicCameraCtor;
                    if (trackedLoaderNames.has(prop) && typeof target[prop] === "function") {
                        if (!runtime.loaderFacades[prop]) {
                            runtime.loaderFacades[prop] = bridge._createLoaderFacade(runtime, target[prop]);
                        }
                        return runtime.loaderFacades[prop];
                    }
                    return Reflect.get(target, prop, target);
                }
            });
        },

        _createDocumentFacade(runtime) {
            const realDocument = document;
            const nullElement = makeNullElement();

            const bodyProxy = new Proxy(realDocument.body || nullElement, {
                get(target, prop) {
                    if (prop === "appendChild" || prop === "prepend" || prop === "insertBefore") {
                        return function (node) {
                            if (node === runtime.renderer?.domElement) return node;
                            if (runtime.suppressDOM) {
                                runtime.suppressedDOMNodes.push(node);
                                return node;
                            }
                            return target[prop]?.call(target, node) || node;
                        };
                    }
                    const value = target[prop];
                    return typeof value === "function" ? value.bind(target) : value;
                },
                set(target, prop, value) {
                    try { target[prop] = value; } catch {}
                    return true;
                }
            });

            return new Proxy(realDocument, {
                get(target, prop) {
                    if (prop === "body") return bodyProxy;
                    if (prop === "getElementById") {
                        return id => target.getElementById(id) || nullElement;
                    }
                    if (prop === "querySelector") {
                        return selector => target.querySelector(selector) || nullElement;
                    }
                    if (prop === "querySelectorAll") {
                        return selector => target.querySelectorAll(selector) || [];
                    }
                    const value = target[prop];
                    return typeof value === "function" ? value.bind(target) : value;
                }
            });
        },

        _createWindowFacade(runtime) {
            const local = Object.create(null);
            const bridge = this;

            return new Proxy(root, {
                get(target, prop) {
                    if (prop === "THREE") return runtime.threeFacade;
                    if (prop === "scene") return runtime.sceneFacade;
                    if (prop === "renderer") return runtime.rendererFacade;
                    if (prop === "camera") return runtime.gameCamera || runtime.editorCamera;
                    if (prop === "document") return runtime.documentFacade;
                    if (prop === "requestAnimationFrame") return runtime.requestAnimationFrame;
                    if (prop === "cancelAnimationFrame") return runtime.cancelAnimationFrame;
                    if (prop === "setTimeout") return runtime.setTimeout;
                    if (prop === "clearTimeout") return runtime.clearTimeout;
                    if (prop === "setInterval") return runtime.setInterval;
                    if (prop === "clearInterval") return runtime.clearInterval;
                    if (prop === "fetch") return runtime.fetchFacade;
                    if (prop === "Audio") return runtime.AudioFacade;
                    if (prop in local) return local[prop];
                    const value = target[prop];
                    return typeof value === "function" ? value.bind(target) : value;
                },
                set(_target, prop, value) {
                    // Imported globals stay inside the project sandbox instead of
                    // polluting the SM Engine window namespace.
                    local[prop] = value;
                    return true;
                },
                has(target, prop) {
                    return prop in local || prop in target;
                }
            });
        },

        _createRuntime(project, record, options = {}) {
            const scene = getActiveScene();
            const renderer = getActiveRenderer();
            const editorCamera = getEditorCamera();

            if (!root.THREE) throw new Error("THREE is not available in SM Engine.");
            if (!scene) throw new Error("SM Engine active scene was not found.");
            if (!renderer) throw new Error("SM Engine renderer was not found.");

            const manifest = record?.manifest || {};
            const config = record?.config || {};
            const projectRoot = new root.THREE.Group();
            projectRoot.name = project.name || manifest.name || project.projectId;
            markProjectObject(projectRoot, project.projectId);
            projectRoot.userData.smNativeProjectRoot = true;
            projectRoot.userData.smProjectType = project.projectType || manifest.projectType || "threejs-native";

            const runtime = {
                projectId: project.projectId,
                project,
                record,
                manifest,
                config,
                options,
                scene,
                renderer,
                editorCamera,
                gameCamera: null,
                projectRoot,
                sceneFacade: null,
                rendererFacade: null,
                threeFacade: null,
                documentFacade: null,
                windowFacade: null,
                loaderFacades: Object.create(null),

                loaded: false,
                playing: false,
                bootstrapped: false,
                disposed: false,
                loading: false,

                animationCallback: null,
                lastFrameCallback: null,
                lastFrameTime: performance.now(),
                frameHandleCounter: 1,
                cancelledFrameHandles: new Set(),

                timers: new Set(),
                intervals: new Set(),
                eventBindings: [],
                loopDisposers: [],

                sceneMutations: new Set(),
                previousSceneState: {
                    background: scene.background,
                    environment: scene.environment,
                    fog: scene.fog,
                    overrideMaterial: scene.overrideMaterial
                },

                requestedRendererSettings: Object.create(null),
                requestedRendererCalls: [],
                suppressedRenderCalls: 0,
                suppressedDOMNodes: [],
                suppressDOM:
                    options.suppressDOM !== undefined
                        ? !!options.suppressDOM
                        : manifest.nativeRuntime?.suppressImportedDOMInEditor !== false,
                importedObjectCount: 0,
                errors: [],
                warnings: [],
                sourceMode: null,
                sourceURL: null,
                sourceLength: 0,
                cameras: new Set(),
                startedAt: performance.now(),
                hierarchyRefreshPending: false,
                loopHook: null,

                requestHierarchyRefresh: () => {
                    if (runtime.hierarchyRefreshPending) return;
                    runtime.hierarchyRefreshPending = true;
                    queueMicrotask(() => {
                        runtime.hierarchyRefreshPending = false;
                        try { root.updateHierarchy?.(); } catch {}
                        try { root.updateLayersUI?.(); } catch {}
                        try {
                            root.dispatchEvent?.(
                                new CustomEvent("sm-native-project-scene-changed", {
                                    detail: { projectId: runtime.projectId, root: runtime.projectRoot }
                                })
                            );
                        } catch {}
                    });
                }
            };

            runtime.AudioFacade = function AudioFacade(source) {
                const AudioCtor = root.Audio;
                if (typeof AudioCtor !== "function") return makeNullElement();
                const audio = new AudioCtor();
                if (source) audio.src = ThreeJSNativeProjectBridge._resolveAssetURL(runtime, source);
                return audio;
            };
            try { runtime.AudioFacade.prototype = root.Audio?.prototype; } catch {}

            runtime.fetchFacade = (input, init) => {
                if (typeof input === "string") {
                    input = this._resolveAssetURL(runtime, input);
                }
                return root.fetch(input, init);
            };

            runtime.requestAnimationFrame = callback => {
                const id = runtime.frameHandleCounter++;
                runtime.lastFrameCallback = typeof callback === "function" ? callback : null;
                runtime.animationCallback = runtime.lastFrameCallback;
                return id;
            };

            runtime.cancelAnimationFrame = id => {
                runtime.cancelledFrameHandles.add(id);
                if (runtime.animationCallback && id != null) {
                    runtime.animationCallback = null;
                }
            };

            runtime.setTimeout = (callback, delay, ...args) => {
                const id = root.setTimeout(() => {
                    runtime.timers.delete(id);
                    if (!runtime.disposed) callback?.(...args);
                }, delay);
                runtime.timers.add(id);
                return id;
            };
            runtime.clearTimeout = id => {
                runtime.timers.delete(id);
                root.clearTimeout(id);
            };

            // Intervals are disabled while loading/editing to prevent legacy gameplay
            // systems from running outside SM Play mode. They can be enabled later by
            // native adapters if a project genuinely needs them.
            runtime.setInterval = (callback, delay, ...args) => {
                const id = root.setInterval(() => {
                    if (runtime.playing && !runtime.disposed) callback?.(...args);
                }, delay);
                runtime.intervals.add(id);
                return id;
            };
            runtime.clearInterval = id => {
                runtime.intervals.delete(id);
                root.clearInterval(id);
            };

            runtime.sceneFacade = this._createSceneFacade(runtime);
            runtime.rendererFacade = this._createRendererFacade(runtime);
            runtime.threeFacade = this._createThreeFacade(runtime);
            runtime.documentFacade = this._createDocumentFacade(runtime);
            runtime.windowFacade = this._createWindowFacade(runtime);

            return runtime;
        },

        _registerProjectRoot(runtime) {
            const scene = runtime.scene;
            const projectRoot = runtime.projectRoot;

            if (typeof root.addObjectToScene === "function") {
                root.addObjectToScene(projectRoot, projectRoot.name);
            } else {
                scene.add(projectRoot);
                runtime.requestHierarchyRefresh();
            }

            if (projectRoot.parent !== scene) {
                scene.add(projectRoot);
                runtime.requestHierarchyRefresh();
            }
        },

        async _fetchText(url) {
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Source request failed: ${response.status} ${response.statusText} (${url})`);
            }
            return await response.text();
        },

        async _getBootstrapSource(runtime) {
            const nativeRuntime = runtime.manifest.nativeRuntime || {};
            const rootUrl = runtime.config.rootUrl || runtime.project.physicalRoot || "";
            const preferSections = nativeRuntime.preferSections === true;
            const sections = Array.isArray(nativeRuntime.sections)
                ? nativeRuntime.sections.map(normalizePath).filter(Boolean)
                : [];
            const main = normalizePath(nativeRuntime.main || runtime.project.nativeEntryPoint || "");

            if (preferSections && sections.length) {
                const chunks = [];
                for (const section of sections) {
                    const url = joinURL(rootUrl, section);
                    chunks.push(`\n/* ===== ${section} ===== */\n${await this._fetchText(url)}\n`);
                }
                return {
                    mode: "sections",
                    url: sections.map(section => joinURL(rootUrl, section)).join(" | "),
                    source: chunks.join("\n")
                };
            }

            if (main) {
                const url = joinURL(rootUrl, main);
                try {
                    return { mode: "main", url, source: await this._fetchText(url) };
                } catch (error) {
                    if (!sections.length) throw error;
                    runtime.warnings.push(`main bootstrap failed; falling back to sections: ${error.message}`);
                }
            }

            if (sections.length) {
                const chunks = [];
                for (const section of sections) {
                    const url = joinURL(rootUrl, section);
                    chunks.push(`\n/* ===== ${section} ===== */\n${await this._fetchText(url)}\n`);
                }
                return {
                    mode: "sections",
                    url: sections.map(section => joinURL(rootUrl, section)).join(" | "),
                    source: chunks.join("\n")
                };
            }

            throw new Error("Manifest nativeRuntime has no main or sections entry.");
        },

        _compileSource(runtime, sourceInfo) {
            const footer = `
                ;return {
                    scene: (typeof scene !== "undefined" ? scene : undefined),
                    renderer: (typeof renderer !== "undefined" ? renderer : undefined),
                    camera: (typeof camera !== "undefined" ? camera : undefined),
                    animate: (typeof animate === "function" ? animate : undefined),
                    update: (typeof update === "function" ? update : undefined),
                    gameLoop: (typeof gameLoop === "function" ? gameLoop : undefined)
                };
            `;

            let source = String(sourceInfo.source || "")
                // Source maps from the external project are meaningless in the engine sandbox.
                .replace(/^\s*\/\/# sourceMappingURL=.*$/gm, "");

            // Classic physical projects should not use ESM syntax in this compatibility path.
            // Fail early with a useful error instead of an opaque Function parser error.
            if (/^\s*(?:import\s|export\s)/m.test(source)) {
                throw new Error(
                    "Native compatibility bootstrap contains ESM import/export syntax. " +
                    "Provide a classic-script nativeRuntime.main or a dedicated adapter module."
                );
            }

            runtime.sourceMode = sourceInfo.mode;
            runtime.sourceURL = sourceInfo.url;
            runtime.sourceLength = source.length;

            return new Function(
                "THREE",
                "window",
                "document",
                "requestAnimationFrame",
                "cancelAnimationFrame",
                "setTimeout",
                "clearTimeout",
                "setInterval",
                "clearInterval",
                "performance",
                "console",
                "fetch",
                "Audio",
                `"use strict";\n${source}\n${footer}`
            );
        },

        async _bootstrap(runtime) {
            const sourceInfo = await this._getBootstrapSource(runtime);
            const execute = this._compileSource(runtime, sourceInfo);

            let exported;
            try {
                exported = execute(
                    runtime.threeFacade,
                    runtime.windowFacade,
                    runtime.documentFacade,
                    runtime.requestAnimationFrame,
                    runtime.cancelAnimationFrame,
                    runtime.setTimeout,
                    runtime.clearTimeout,
                    runtime.setInterval,
                    runtime.clearInterval,
                    performance,
                    console,
                    runtime.fetchFacade,
                    runtime.AudioFacade
                );
            } catch (error) {
                runtime.errors.push({ phase: "bootstrap", message: error?.message || String(error), stack: error?.stack || "" });
                throw error;
            }

            if (exported?.camera?.isCamera) runtime.gameCamera = exported.camera;
            if (runtime.gameCamera?.isCamera && !runtime.gameCamera.parent) {
                markProjectObject(runtime.gameCamera, runtime.projectId);
                runtime.projectRoot.add(runtime.gameCamera);
            }
            if (!runtime.animationCallback) {
                runtime.animationCallback =
                    (typeof exported?.animate === "function" && exported.animate) ||
                    (typeof exported?.gameLoop === "function" && exported.gameLoop) ||
                    (typeof exported?.update === "function" && exported.update) ||
                    null;
            }

            runtime.bootstrapped = true;
            runtime.requestHierarchyRefresh();
            return exported;
        },

        async loadProject(reference = null, options = {}) {
            const project = this._resolveProject(reference);
            if (!project) {
                console.warn("[ThreeJSNativeProjectBridge] Project not found.");
                return false;
            }

            const existing = this.runtimes.get(project.projectId);
            if (existing?.loaded && !options.forceReload) {
                existing.requestHierarchyRefresh();
                return existing.projectRoot;
            }

            if (existing) await this.unloadProject(project.projectId);

            const record = this._resolveRecord(project);
            if (!record?.manifest) {
                console.error("[ThreeJSNativeProjectBridge] Physical manifest record not found.");
                return false;
            }

            const type = String(record.manifest.projectType || project.projectType || "").toLowerCase();
            if (type !== "threejs-native") {
                console.warn(`[ThreeJSNativeProjectBridge] Unsupported native project type '${type}'.`);
                return false;
            }

            let runtime;
            try {
                runtime = this._createRuntime(project, record, options);
                runtime.loading = true;
                this.runtimes.set(project.projectId, runtime);
                this._registerProjectRoot(runtime);

                await this._bootstrap(runtime);

                runtime.loading = false;
                runtime.loaded = true;
                runtime.requestHierarchyRefresh();

                try {
                    root.dispatchEvent(
                        new CustomEvent("sm-native-project-loaded", {
                            detail: {
                                projectId: runtime.projectId,
                                project: runtime.project,
                                root: runtime.projectRoot,
                                runtime
                            }
                        })
                    );
                } catch {}

                console.log(
                    `[ThreeJSNativeProjectBridge] Loaded '${project.name}' natively. ` +
                    `Scene owner: SM Engine; Renderer owner: SM Engine; RAF owner: SM Engine.`
                );

                return runtime.projectRoot;
            } catch (error) {
                console.error(`[ThreeJSNativeProjectBridge] Native load failed for '${project.name}'.`, error);
                if (runtime) {
                    runtime.loading = false;
                    runtime.errors.push({ phase: "load", message: error?.message || String(error), stack: error?.stack || "" });
                }
                return false;
            }
        },

        _tickRuntime(runtime, time = performance.now(), dt = null) {
            if (!runtime?.playing || runtime.disposed) return;

            const deltaSeconds = Number.isFinite(dt)
                ? dt
                : Math.max(0, Math.min(0.25, (time - runtime.lastFrameTime) / 1000));
            runtime.lastFrameTime = time;

            const callback = runtime.animationCallback || runtime.lastFrameCallback;
            if (typeof callback !== "function") return;

            try {
                // Legacy RAF callbacks expect timestamp. A dedicated adapter may also
                // inspect window.SM_NATIVE_DELTA if needed.
                runtime.windowFacade.SM_NATIVE_DELTA = deltaSeconds;
                callback(time);
            } catch (error) {
                runtime.errors.push({ phase: "update", message: error?.message || String(error), stack: error?.stack || "" });
                console.error(`[ThreeJSNativeProjectBridge] Runtime update failed (${runtime.projectId}).`, error);
                runtime.playing = false;
            }
        },

        _installEngineLoopHook(runtime) {
            if (runtime.loopDisposers.length) return true;

            const tick = (...args) => {
                let dt = null;
                let time = performance.now();

                for (const arg of args) {
                    if (typeof arg === "number") {
                        if (arg > 1000) time = arg;
                        else if (dt == null) dt = arg;
                    } else if (arg?.detail) {
                        if (Number.isFinite(arg.detail.deltaTime)) dt = arg.detail.deltaTime;
                        else if (Number.isFinite(arg.detail.dt)) dt = arg.detail.dt;
                        if (Number.isFinite(arg.detail.time)) time = arg.detail.time;
                    }
                }

                this._tickRuntime(runtime, time, dt);
            };

            const registrations = [
                [root.SMRuntimeLoop, "addSystem"],
                [root.SMRuntimeLoop, "register"],
                [root.SMGameRuntime, "registerUpdate"],
                [root.SMRuntime, "addUpdateCallback"]
            ];

            for (const [owner, method] of registrations) {
                if (typeof owner?.[method] !== "function") continue;
                try {
                    const handle = owner[method](tick, {
                        id: `native-project:${runtime.projectId}`,
                        priority: 0
                    });
                    runtime.loopHook = `${owner?.constructor?.name || "runtime"}.${method}`;
                    if (typeof handle === "function") runtime.loopDisposers.push(handle);
                    else if (handle?.dispose) runtime.loopDisposers.push(() => handle.dispose());
                    else if (handle?.remove) runtime.loopDisposers.push(() => handle.remove());
                    return true;
                } catch (error) {
                    runtime.warnings.push(`Loop hook ${method} failed: ${error.message}`);
                }
            }

            // Non-owning event fallback. This still does NOT start a RAF loop.
            const eventNames = ["sm-runtime-update", "sm-engine-update", "sm-frame"];
            for (const eventName of eventNames) {
                root.addEventListener(eventName, tick);
                runtime.loopDisposers.push(() => root.removeEventListener(eventName, tick));
            }
            runtime.loopHook = `events:${eventNames.join(",")}`;
            return true;
        },

        async playProject(reference = null) {
            const project = this._resolveProject(reference);
            if (!project) return false;

            let runtime = this.runtimes.get(project.projectId);
            if (!runtime?.loaded) {
                const rootObject = await this.loadProject(project);
                if (!rootObject) return false;
                runtime = this.runtimes.get(project.projectId);
            }

            if (!runtime.animationCallback && !runtime.lastFrameCallback) {
                runtime.warnings.push(
                    "No legacy animation/update callback was captured. Native scene is loaded, but gameplay has no update callback yet."
                );
                console.warn(
                    `[ThreeJSNativeProjectBridge] '${project.name}' loaded natively, but no update callback was captured.`
                );
            }

            this._installEngineLoopHook(runtime);
            runtime.playing = true;
            runtime.lastFrameTime = performance.now();

            try {
                root.dispatchEvent(
                    new CustomEvent("sm-native-project-play", {
                        detail: { projectId: runtime.projectId, runtime }
                    })
                );
            } catch {}

            return true;
        },

        async stopProject(reference = null) {
            const project = reference ? this._resolveProject(reference) : null;
            const targets = project
                ? [this.runtimes.get(project.projectId)].filter(Boolean)
                : [...this.runtimes.values()];

            let stopped = false;
            for (const runtime of targets) {
                if (!runtime) continue;
                runtime.playing = false;
                runtime.lastFrameTime = performance.now();
                stopped = true;

                try {
                    root.dispatchEvent(
                        new CustomEvent("sm-native-project-stop", {
                            detail: { projectId: runtime.projectId, runtime }
                        })
                    );
                } catch {}
            }
            return stopped;
        },

        async unloadProject(reference = null) {
            const projectId = typeof reference === "string"
                ? reference
                : this._resolveProject(reference)?.projectId;
            if (!projectId) return false;

            const runtime = this.runtimes.get(projectId);
            if (!runtime) return false;

            runtime.playing = false;
            runtime.disposed = true;

            for (const disposer of runtime.loopDisposers.splice(0)) {
                try { disposer?.(); } catch {}
            }
            for (const id of runtime.timers) {
                try { root.clearTimeout(id); } catch {}
            }
            for (const id of runtime.intervals) {
                try { root.clearInterval(id); } catch {}
            }
            runtime.timers.clear();
            runtime.intervals.clear();

            if (runtime.projectRoot?.parent) {
                runtime.projectRoot.parent.remove(runtime.projectRoot);
            }

            for (const prop of runtime.sceneMutations) {
                try { runtime.scene[prop] = runtime.previousSceneState[prop]; } catch {}
            }

            this.runtimes.delete(projectId);
            try { root.updateHierarchy?.(); } catch {}

            return true;
        },

        resolveAsset(reference, relativePath) {
            const project = this._resolveProject(reference);
            const runtime = project ? this.runtimes.get(project.projectId) : null;
            if (runtime) return this._resolveAssetURL(runtime, relativePath);

            const record = project ? this._resolveRecord(project) : null;
            if (!project || !record) return null;

            const temporary = {
                projectId: project.projectId,
                project,
                config: record.config,
                manifest: record.manifest
            };
            return this._resolveAssetURL(temporary, relativePath);
        },

        debug(reference = null) {
            const project = this._resolveProject(reference);
            const runtime = project ? this.runtimes.get(project.projectId) : null;
            if (!project) return null;

            let meshes = 0;
            let lights = 0;
            let cameras = 0;
            let objects = 0;

            runtime?.projectRoot?.traverse?.(object => {
                objects++;
                if (object.isMesh) meshes++;
                if (object.isLight) lights++;
                if (object.isCamera) cameras++;
            });

            const info = {
                projectId: project.projectId,
                projectType: project.projectType,
                nativeLoaded: !!runtime?.loaded,
                playing: !!runtime?.playing,
                iframeUsed: false,
                projectRoot: runtime?.projectRoot?.name || null,
                sceneOwner: runtime ? "SM Engine" : null,
                rendererOwner: runtime ? "SM Engine" : null,
                animationLoopOwner: runtime ? "SM Engine" : null,
                loopHook: runtime?.loopHook || null,
                sourceMode: runtime?.sourceMode || null,
                sourceURL: runtime?.sourceURL || null,
                sourceLength: runtime?.sourceLength || 0,
                objectsImported: objects,
                meshes,
                lights,
                cameras,
                capturedGameCamera: runtime?.gameCamera?.name || runtime?.gameCamera?.uuid || null,
                suppressedRenderCalls: runtime?.suppressedRenderCalls || 0,
                suppressedDOMNodes: runtime?.suppressedDOMNodes?.length || 0,
                requestedRendererSettings: runtime?.requestedRendererSettings || {},
                errors: runtime?.errors || [],
                warnings: runtime?.warnings || []
            };

            console.log("[ThreeJSNativeProjectBridge.debug]", info);
            return info;
        }
    };

    root.ThreeJSNativeProjectBridge = ThreeJSNativeProjectBridge;
    console.log("[ThreeJSNativeProjectBridge] Ready.");
})(window);
