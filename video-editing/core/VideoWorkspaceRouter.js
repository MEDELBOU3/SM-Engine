/**
 * VideoWorkspaceRouter.js
 * SM Engine — logical workspace router for Video Editing.
 * Workspaces: edit / fusion / color / audio / deliver.
 */
(function (global) {
    'use strict';
    const DEFAULT_WORKSPACES = ['edit', 'fusion', 'color', 'audio', 'deliver'];
    class VideoWorkspaceRouter {
        constructor(project = null) {
            this.project = project || global.ensureVideoProjectState?.() || global.videoProject || null;
            this.workspaces = new Map();
            this.activeId = null;
            this.previousId = null;
            this.history = [];
            this._switching = false;
            this._bound = false;
            this._tabHandlers = [];
            this._registerBuiltins();
            this.bindUI();
        }
        registerWorkspace(id, adapter = {}) {
            const key = this._normalizeId(id);
            if (!key) throw new Error('VideoWorkspaceRouter.registerWorkspace requires an id.');
            const entry = {
                id: key,
                title: adapter.title || this._title(key),
                icon: adapter.icon || null,
                order: Number.isFinite(Number(adapter.order)) ? Number(adapter.order) : 100,
                manager: adapter.manager || null,
                managerResolver: typeof adapter.managerResolver === 'function' ? adapter.managerResolver : null,
                canActivate: typeof adapter.canActivate === 'function' ? adapter.canActivate : null,
                beforeEnter: typeof adapter.beforeEnter === 'function' ? adapter.beforeEnter : null,
                enter: typeof adapter.enter === 'function' ? adapter.enter : null,
                afterEnter: typeof adapter.afterEnter === 'function' ? adapter.afterEnter : null,
                beforeExit: typeof adapter.beforeExit === 'function' ? adapter.beforeExit : null,
                exit: typeof adapter.exit === 'function' ? adapter.exit : null,
                afterExit: typeof adapter.afterExit === 'function' ? adapter.afterExit : null,
                saveState: typeof adapter.saveState === 'function' ? adapter.saveState : null,
                restoreState: typeof adapter.restoreState === 'function' ? adapter.restoreState : null,
                hostResolver: typeof adapter.hostResolver === 'function' ? adapter.hostResolver : null,
                metadata: adapter.metadata || {}
            };
            this.workspaces.set(key, entry);
            this._emit('videoWorkspaceRegistered', { id: key, workspace: entry });
            return entry;
        }
        unregisterWorkspace(id) {
            const key = this._normalizeId(id);
            if (key === this.activeId) return false;
            const removed = this.workspaces.delete(key);
            if (removed) this._emit('videoWorkspaceUnregistered', { id: key });
            return removed;
        }
        getWorkspace(id) { return this.workspaces.get(this._normalizeId(id)) || null; }
        listWorkspaces() { return Array.from(this.workspaces.values()).sort((a, b) => a.order - b.order); }
        async switchTo(id, options = {}) {
            const targetId = this._normalizeId(id);
            const target = this.workspaces.get(targetId);
            if (!target) {
                console.warn(`[VideoWorkspaceRouter] Unknown workspace: ${targetId}`);
                return false;
            }
            if (this._switching) return false;
            if (this.activeId === targetId && options.force !== true) {
                this._syncTabUI();
                return true;
            }
            const context = this.getContext(targetId, options);
            if (target.canActivate) {
                const allowed = await target.canActivate(context);
                if (allowed === false) return false;
            }
            this._switching = true;
            const fromId = this.activeId;
            const from = fromId ? this.workspaces.get(fromId) : null;
            try {
                this._emit('videoWorkspaceBeforeChange', { from: fromId, to: targetId });
                if (fromId === 'edit' || options.captureLegacy !== false) {
                    this.project?.captureFromLegacy?.({ markDirty: false });
                }
                if (from) {
                    const fromContext = this.getContext(fromId, options);
                    if (from.saveState) {
                        const saved = await from.saveState(fromContext);
                        if (saved && this.project?.setWorkspaceState) this.project.setWorkspaceState(fromId, saved, { dirty: false });
                    }
                    await from.beforeExit?.(fromContext);
                    await this._callManagerLifecycle(from, 'exit', fromContext);
                    await from.exit?.(fromContext);
                    await from.afterExit?.(fromContext);
                }
                this.previousId = fromId;
                this.activeId = targetId;
                if (fromId && fromId !== targetId) this.history.push(fromId);
                if (this.history.length > 40) this.history.shift();
                this.project?.setWorkspace?.(targetId, { dirty: false });
                this._applyBodyState(targetId);

                if (
                    targetId !== 'edit' &&
                    global.videoEditingManager?.active
                ) {
                    document.body.classList.add(
                        'video-editing-mode'
                    );

                    document
                        .getElementById(
                            'video-editor-toolbar'
                        )
                        ?.style
                        .setProperty(
                            'display',
                            'flex',
                            'important'
                        );
                }

                const targetContext = this.getContext(targetId, options);
                await target.beforeEnter?.(targetContext);
                await this._callManagerLifecycle(target, 'enter', targetContext);
                await target.enter?.(targetContext);
                const savedState = this.project?.workspace?.perWorkspace?.[targetId] || {};
                await target.restoreState?.(targetContext, savedState);
                await target.afterEnter?.(targetContext);
                this._syncTabUI();
                this._emit('videoWorkspaceChanged', { from: fromId, to: targetId, workspace: target, project: this.project });
                return true;
            } catch (error) {
                console.error(`[VideoWorkspaceRouter] Failed switching ${fromId || 'none'} -> ${targetId}:`, error);
                this.activeId = fromId;
                this._applyBodyState(fromId || 'edit');
                this._syncTabUI();
                this._emit('videoWorkspaceError', { from: fromId, to: targetId, error });
                return false;
            } finally {
                this._switching = false;
            }
        }
        async back() {
            const id = this.history.pop() || this.previousId || 'edit';
            return this.switchTo(id);
        }
        async activateInitial(options = {}) {
            const requested = options.workspace || this.project?.workspace?.active || 'edit';
            return this.switchTo(requested, { ...options, force: true });
        }
        getContext(workspaceId = this.activeId, options = {}) {
            const workspace = this.workspaces.get(workspaceId) || null;
            const manager = this._resolveManager(workspace);
            const host = workspace?.hostResolver?.() || this._defaultHost();
            return {
                id: workspaceId,
                router: this,
                project: this.project,
                workspace,
                manager,
                host,
                videoEditingManager: global.videoEditingManager || null,
                sequencerManager: global.sequencerManager || null,
                mediaPoolManager: global.mediaPoolManager || null,
                playhead: global.sequencerManager?.state?.playhead ?? this.project?.timeline?.playhead ?? 0,
                selection: this.project?.selection || null,
                options
            };
        }
        setProject(project) {
            if (!project) return false;
            this.project = project;
            this._emit('videoWorkspaceProjectChanged', { project });
            return true;
        }
        bindUI() {
            if (this._bound) return;
            this._bound = true;
            const bind = () => {
                this._unbindTabs();
                document.querySelectorAll('[data-video-workspace]').forEach(button => {
                    const handler = event => {
                        event.preventDefault();
                        this.switchTo(button.dataset.videoWorkspace);
                    };
                    button.addEventListener('click', handler);
                    this._tabHandlers.push([button, handler]);
                });
                document.querySelectorAll('#video-mode-tabs [data-mode]').forEach(button => {
                    const mapped = this._mapExistingMode(button.dataset.mode);
                    if (!mapped) return;
                    const handler = event => {
                        event.preventDefault();
                        this.switchTo(mapped);
                    };
                    button.addEventListener('click', handler);
                    this._tabHandlers.push([button, handler]);
                });
                this._syncTabUI();
            };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
            else bind();
            global.addEventListener('sm:video-mode', event => {
                if (event?.detail?.active === true && !this.activeId) this.activateInitial();
            });
        }
        refreshBindings() {
            this._bound = false;
            this.bindUI();
        }
        _unbindTabs() {
            this._tabHandlers.forEach(([element, handler]) => element.removeEventListener('click', handler));
            this._tabHandlers.length = 0;
        }
        _syncTabUI() {
            document.querySelectorAll('[data-video-workspace]').forEach(button => {
                const active = this._normalizeId(button.dataset.videoWorkspace) === this.activeId;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            document.querySelectorAll('#video-mode-tabs [data-mode]').forEach(button => {
                const mapped = this._mapExistingMode(button.dataset.mode);
                if (!mapped) return;
                const active = mapped === this.activeId;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        }
        _applyBodyState(id) {
            const body = document.body;
            if (!body) return;
            DEFAULT_WORKSPACES.forEach(name => body.classList.remove(`video-workspace-${name}`));
            for (const name of this.workspaces.keys()) body.classList.remove(`video-workspace-${name}`);
            if (id) body.classList.add(`video-workspace-${id}`);
            body.dataset.videoWorkspace = id || '';
        }
        _registerBuiltins() {
            this.registerWorkspace('edit', {
                title: 'Edit',
                order: 10,

                /*
                 * Edit is a child workspace inside Video Editing.
                 * Never call VideoEditingManager.exit() when switching
                 * Edit -> Audio/Fusion/Color.
                 */
                enter: async context => {
                    const manager =
                        context.videoEditingManager;

                    if (!manager) return;

                    if (!manager.active) {
                        manager.enter?.();
                    } else {
                        manager.resumeWorkspace?.();
                    }

                    manager.renderCompositeAt?.(
                        context.playhead
                    );
                },

                exit: async context => {
                    context.videoEditingManager
                        ?.suspendWorkspace?.();
                },

                saveState: context => ({
                    playhead:
                        context.sequencerManager
                            ?.state
                            ?.playhead ??
                        0,

                    selectedIds:
                        context.sequencerManager
                            ?.state
                            ?.selectedIds
                            ?.slice?.() ||
                        []
                })
            });

            this.registerWorkspace('fusion', {
                title: 'Fusion',
                order: 20,
                managerResolver: () => global.videoNodeEditorManager || global.fusionVideoManager || null,
                enter: context => this._notifyMissingManagerWhenNeeded('fusion', context)
            });
            this.registerWorkspace('color', {
                title: 'Color',
                order: 30,
                managerResolver: () => global.colorGradingManager || global.videoColorManager || null,
                enter: context => this._notifyMissingManagerWhenNeeded('color', context)
            });
            this.registerWorkspace('audio', {
                title: 'Audio Studio',
                order: 40,
                managerResolver: () => global.audioStudioManager || global.videoAudioStudioManager || null,
                enter: context => this._notifyMissingManagerWhenNeeded('audio', context)
            });
            this.registerWorkspace('deliver', {
                title: 'Deliver',
                order: 50,
                managerResolver: () => global.renderQueueManager || global.veaExportEngine || global.videoExportManager || null,
                enter: context => this._notifyMissingManagerWhenNeeded('deliver', context)
            });
        }
        async _callManagerLifecycle(workspace, phase, context) {
            const manager = this._resolveManager(workspace);
            if (!manager) return;
            const methods = phase === 'enter' ? ['activate', 'enter', 'show', 'mount'] : ['deactivate', 'exit', 'hide', 'unmount'];
            for (const name of methods) {
                if (typeof manager[name] !== 'function') continue;
                await manager[name](context);
                return;
            }
        }
        _resolveManager(workspace) {
            if (!workspace) return null;
            if (workspace.managerResolver) {
                try {
                    const resolved = workspace.managerResolver();
                    if (resolved) return resolved;
                } catch (_) {}
            }
            return workspace.manager || null;
        }
        _notifyMissingManagerWhenNeeded(id, context) {
            if (context.manager) return;
            this._emit('videoWorkspaceNeedsManager', {
                id,
                context,
                message: `${this._title(id)} workspace is registered but its implementation manager is not loaded yet.`
            });
        }
        _defaultHost() {
            return document.getElementById('editor-scene') || document.getElementById('video-editing-container') || null;
        }
        _mapExistingMode(mode) {
            const key = String(mode || '').toLowerCase();
            const map = {
                edit: 'edit',
                cut: 'edit',
                media: 'edit',
                fx: 'fusion',
                fusion: 'fusion',
                color: 'color',
                audio: 'audio',
                fairlight: 'audio',
                deliver: 'deliver',
                export: 'deliver'
            };
            return map[key] || null;
        }
        _normalizeId(id) { return String(id || '').trim().toLowerCase().replace(/\s+/g, '-'); }
        _title(id) { return String(id || '').replace(/(^|-)(\w)/g, (_, sep, char) => `${sep ? ' ' : ''}${char.toUpperCase()}`); }
        _emit(name, detail) {
            try { global.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
        }
    }
    global.VideoWorkspaceRouter = VideoWorkspaceRouter;
    global.ensureVideoWorkspaceRouter = function ensureVideoWorkspaceRouter(project) {
        if (!global.videoWorkspaceRouter) global.videoWorkspaceRouter = new VideoWorkspaceRouter(project || global.videoProject || null);
        else if (project) global.videoWorkspaceRouter.setProject(project);
        return global.videoWorkspaceRouter;
    };
    global.ensureVideoWorkspaceRouter();
})(window);