// SM Engine - PlayerAnimationClipRegistry
(function () {
    class PlayerAnimationClipRegistry {
        constructor(options = {}) {
            this.loader = options.loader || null;
            this.playerSystem = options.playerSystem || window.playerSystem || null;
            this.player = options.player || window.player || this.playerSystem?.player || null;
            this.aliases = new Map();
            this._ensurePromise = null;
            this._lastEmittedLoader = null;
            this._lastEmittedCount = -1;
            this._installDefaultAliases();
            this.resolveLoader();
        }
        _installDefaultAliases() {
            const groups = {
                IDLE: ['idle', 'stand', 'standing', 'breath', 'breathing'],
                WALK_FORWARD: ['walk', 'walkforward', 'forwardwalk', 'walking'],
                WALK_BACKWARD: ['walkbackward', 'backwardwalk', 'backwalk'],
                RUN_FORWARD: ['run', 'runforward', 'forwardrun', 'running', 'sprint'],
                RUN_BACKWARD: ['runbackward', 'backwardrun'],
                JUMP: ['jump', 'jumpstart', 'takeoff'],
                BIG_JUMP: ['bigjump', 'longjump'],
                FALL: ['fall', 'falling', 'air', 'inair'],
                LAND: ['land', 'landing'],
                FALL_ROLL: ['fallroll', 'roll', 'landingroll'],
                CLIMB: ['climb'],
                CLIMB_UP_WALL: ['climbupwall', 'wallclimb'],
                VAULT: ['vault'],
                CROUCH_IDLE: ['crouchidle', 'crouchedidle'],
                CROUCH_WALK: ['crouchwalk', 'crouchedwalk']
            };
            Object.entries(groups).forEach(([canonical, names]) => {
                this.aliases.set(this._normalize(canonical), canonical);
                names.forEach(name => this.aliases.set(this._normalize(name), canonical));
            });
        }
        _normalize(name) {
            return String(name || '').toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '');
        }
        resolveLoader() {
            const candidates = [
                this.loader,
                window.playerAnimationLoader,
                window.SMPlayerAnimationLoaderInstance,
                this.playerSystem?.animationLoader,
                this.playerSystem?.playerAnimationLoader,
                this.player?.animationLoader,
                this.player?.playerAnimationLoader,
                this.playerSystem?.animation?.loader,
                this.playerSystem?.animationController?.loader
            ];
            this.loader = candidates.find(candidate => candidate && candidate.clips instanceof Map) || null;
            return this.loader;
        }
        registerLoader(loader) {
            if (loader && loader.clips instanceof Map) {
                const loaderChanged = this.loader !== loader;
                this.loader = loader;
                window.playerAnimationLoader = loader;
                if (loaderChanged) this._emitChanged(true);
                return true;
            }
            return false;
        }
        addAlias(alias, key) {
            if (!alias || !key) return false;
            this.aliases.set(this._normalize(alias), String(key));
            return true;
        }
        resolveKey(name) {
            if (!name) return null;
            const loader = this.resolveLoader();
            const normalized = this._normalize(name);
            const directAlias = this.aliases.get(normalized);
            if (loader?.clips?.has(name)) return name;
            if (directAlias && loader?.clips?.has(directAlias)) return directAlias;
            if (loader?.clips instanceof Map) {
                for (const key of loader.clips.keys()) {
                    if (this._normalize(key) === normalized) return key;
                }
                for (const key of loader.clips.keys()) {
                    const nk = this._normalize(key);
                    if (nk.endsWith(normalized) || normalized.endsWith(nk)) return key;
                }
            }
            return directAlias || String(name);
        }
        get(name) {
            const loader = this.resolveLoader();
            if (!loader) return null;
            const key = this.resolveKey(name);
            if (typeof loader.get === 'function') {
                const clip = loader.get(key);
                if (clip) return clip;
            }
            return loader.clips?.get(key) || null;
        }
        has(name) {
            return !!this.get(name);
        }
        list() {
            const loader = this.resolveLoader();
            if (!loader?.clips) return [];
            return [...loader.clips.entries()].map(([key, clip]) => ({
                key,
                name: clip?.name || key,
                duration: Number(clip?.duration) || 0,
                tracks: Array.isArray(clip?.tracks) ? clip.tracks.length : 0,
                clip
            }));
        }
        getGraphNameForKey(key) {
            const map = {
                IDLE: 'Idle',
                WALK_FORWARD: 'Walk',
                RUN_FORWARD: 'Run',
                JUMP: 'Jump',
                FALL: 'Fall',
                LAND: 'Land',
                WALK_BACKWARD: 'Walk Backward',
                RUN_BACKWARD: 'Run Backward',
                BIG_JUMP: 'Big Jump',
                CLIMB: 'Climb',
                CLIMB_UP_WALL: 'Climb Up Wall',
                FALL_ROLL: 'Fall Roll',
                VAULT: 'Vault'
            };
            return map[key] || String(key || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        }
        getKeyForGraphName(name) {
            return this.resolveKey(name);
        }
        async ensureLoaded() {
            // AssetProvider refreshes when this registry emits its changed event.
            // Keep only one load in flight and do not emit again when nothing
            // changed; otherwise refresh -> ensureLoaded -> emit becomes an
            // unbounded microtask loop that freezes Electron's renderer.
            if (this._ensurePromise) return this._ensurePromise;
            this._ensurePromise = (async () => {
                const loader = this.resolveLoader();
                if (!loader) return false;
                const beforeCount = loader.clips?.size || 0;
                if (loader.loadingPromise) {
                    try { await loader.loadingPromise; } catch { }
                }
                if (!loader.clips?.size && typeof loader.loadAll === 'function') {
                    try { await loader.loadAll(); } catch (error) { console.warn('[PlayerAnimationClipRegistry] loadAll warning:', error); }
                }
                if (!loader.clips?.has('IDLE') && typeof loader.registerEmbeddedIdle === 'function') {
                    try { loader.registerEmbeddedIdle(); } catch (error) { console.warn('[PlayerAnimationClipRegistry] embedded idle warning:', error); }
                }
                const afterCount = loader.clips?.size || 0;
                if (afterCount !== beforeCount) this._emitChanged();
                return afterCount > 0;
            })();
            try {
                return await this._ensurePromise;
            } finally {
                this._ensurePromise = null;
            }
        }
        _emitChanged(force = false) {
            const count = this.loader?.clips?.size || 0;
            if (!force && this._lastEmittedLoader === this.loader && this._lastEmittedCount === count) return;
            this._lastEmittedLoader = this.loader;
            this._lastEmittedCount = count;
            window.dispatchEvent(new CustomEvent('sm:player-animation-clips-changed', { detail: { registry: this, count } }));
        }
        debug() {
            return { hasLoader: !!this.loader, loader: this.loader, clips: this.list().map(item => ({ key: item.key, name: item.name, duration: item.duration, tracks: item.tracks })), aliases: Object.fromEntries(this.aliases) };
        }
    }
    window.PlayerAnimationClipRegistry = PlayerAnimationClipRegistry;
    window.playerAnimationClipRegistry = window.playerAnimationClipRegistry || new PlayerAnimationClipRegistry();
    window.debugPlayerAnimationClips = () => window.playerAnimationClipRegistry?.debug?.();
})();
