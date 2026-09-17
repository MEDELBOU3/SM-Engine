// SM Engine - PlayerAnimationActionAdapter
(function () {
    class PlayerAnimationActionAdapter {
        constructor(controller = null, options = {}) {
            this.controller = controller || null;
            this.playerSystem = options.playerSystem || window.playerSystem || null;
            this.player = options.player || window.player || this.playerSystem?.player || null;
            this.root = options.root || this._resolveRoot();
            this.mixer = options.mixer || this._resolveMixer();
            this.actions = new Map();
            this.tracks = new Map();
            this.warnedMissing = new Set();
            this.ownsMixer = false;
            if (!this.mixer && this.root && typeof THREE !== 'undefined' && THREE.AnimationMixer) {
                this.mixer = new THREE.AnimationMixer(this.root);
                this.ownsMixer = true;
            }
            this._importExistingActions();
        }
        _resolveRoot() {
            const c = this.controller;
            const p = this.player;
            const ps = this.playerSystem;
            return c?.root || c?.model || c?.character || c?.object || c?.mesh || p?.model || p?.character || p?.object || p?.mesh || ps?.model || ps?.playerModel || ps?.character || ps?.visual || null;
        }
        _resolveMixer() {
            return this.controller?.mixer || this.player?.mixer || this.playerSystem?.mixer || this.playerSystem?.animationMixer || null;
        }
        _importExistingActions() {
            const sources = [this.controller?.actions, this.player?.actions, this.playerSystem?.actions];
            sources.forEach(source => {
                if (!source) return;
                if (source instanceof Map) {
                    source.forEach((action, name) => { if (action) this.actions.set(String(name), action); });
                    return;
                }
                if (typeof source === 'object') {
                    Object.entries(source).forEach(([name, action]) => { if (action) this.actions.set(String(name), action); });
                }
            });
        }
        _normalize(name) { return String(name || '').toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, ''); }
        _findExistingAction(name) {
            if (this.actions.has(name)) return this.actions.get(name);
            const normalized = this._normalize(name);
            for (const [key, action] of this.actions) {
                if (this._normalize(key) === normalized) return action;
            }
            return null;
        }
        _collectClips() {
            const clips = [];
            const push = value => {
                if (!value) return;
                if (Array.isArray(value)) { value.forEach(push); return; }
                if (value?.isAnimationClip || value?.tracks && typeof value?.duration === 'number') { if (!clips.includes(value)) clips.push(value); }
            };
            const sources = [this.controller?.clips, this.controller?.animations, this.root?.animations, this.player?.animations, this.playerSystem?.animations, this.playerSystem?.clips];
            sources.forEach(source => {
                if (!source) return;
                if (source instanceof Map) source.forEach(push);
                else if (Array.isArray(source)) source.forEach(push);
                else if (typeof source === 'object') Object.values(source).forEach(push);
            });
            return clips;
        }
        _findClip(name) {
            const normalized = this._normalize(name);
            const clips = this._collectClips();
            let clip = clips.find(item => this._normalize(item.name) === normalized);
            if (clip) return clip;
            clip = clips.find(item => {
                const n = this._normalize(item.name);
                return n.endsWith(normalized) || normalized.endsWith(n);
            });
            return clip || null;
        }
        getAction(name) {
            if (!name) return null;
            let action = this._findExistingAction(name);
            if (action) return action;
            if (typeof this.controller?.getAction === 'function') {
                try {
                    action = this.controller.getAction(name);
                    if (action) {
                        this.actions.set(name, action);
                        return action;
                    }
                } catch { }
            }
            if (typeof this.controller?.getAnimationAction === 'function') {
                try {
                    action = this.controller.getAnimationAction(name);
                    if (action) {
                        this.actions.set(name, action);
                        return action;
                    }
                } catch { }
            }
            const clip = this._findClip(name);
            if (clip && this.mixer?.clipAction) {
                try {
                    action = this.mixer.clipAction(clip, this.root || undefined);
                    if (action) {
                        this.actions.set(name, action);
                        return action;
                    }
                } catch (error) {
                    console.warn('[PlayerAnimationActionAdapter] clipAction failed:', name, error);
                }
            }
            if (!this.warnedMissing.has(name)) {
                this.warnedMissing.add(name);
                console.warn(`[PlayerAnimationActionAdapter] Animation clip not found: ${name}`);
            }
            return null;
        }
        _prepareAction(name, playRate = 1, loop = true) {
            const action = this.getAction(name);
            if (!action) return null;
            try {
                action.enabled = true;
                if (typeof action.setEffectiveTimeScale === 'function') action.setEffectiveTimeScale(Number(playRate) || 1);
                else action.timeScale = Number(playRate) || 1;
                if (typeof THREE !== 'undefined' && typeof action.setLoop === 'function') {
                    if (loop === false && THREE.LoopOnce !== undefined) {
                        action.setLoop(THREE.LoopOnce, 1);
                        action.clampWhenFinished = true;
                    } else if (THREE.LoopRepeat !== undefined) {
                        action.setLoop(THREE.LoopRepeat, Infinity);
                        action.clampWhenFinished = false;
                    }
                }
                if (typeof action.play === 'function' && !action.isRunning?.()) action.play();
            } catch (error) {
                console.warn('[PlayerAnimationActionAdapter] prepare action warning:', name, error);
            }
            return action;
        }
        setBlendTargets(targets = [], fadeDuration = 0.08) {
            const merged = new Map();
            (targets || []).forEach(target => {
                if (!target?.clip) return;
                const key = String(target.clip);
                const previous = merged.get(key) || { clip: key, weight: 0, playRate: target.playRate ?? 1, loop: target.loop !== false };
                previous.weight += Math.max(0, Number(target.weight) || 0);
                previous.playRate = target.playRate ?? previous.playRate;
                previous.loop = target.loop !== false;
                merged.set(key, previous);
            });
            let total = 0;
            merged.forEach(target => total += target.weight);
            if (total > 0) merged.forEach(target => target.weight /= total);
            merged.forEach(target => {
                const action = this._prepareAction(target.clip, target.playRate, target.loop);
                if (!action) return;
                let track = this.tracks.get(target.clip);
                if (!track) {
                    const current = typeof action.getEffectiveWeight === 'function' ? action.getEffectiveWeight() : (Number(action.weight) || 0);
                    track = { clip: target.clip, action, weight: Number.isFinite(current) ? current : 0, targetWeight: 0, fadeDuration: 0.08, playRate: 1, loop: true };
                    this.tracks.set(target.clip, track);
                }
                track.action = action;
                track.targetWeight = target.weight;
                track.fadeDuration = Math.max(0, Number(fadeDuration) || 0);
                track.playRate = target.playRate ?? 1;
                track.loop = target.loop !== false;
            });
            this.tracks.forEach((track, clip) => {
                if (!merged.has(clip)) {
                    track.targetWeight = 0;
                    track.fadeDuration = Math.max(0, Number(fadeDuration) || 0);
                }
            });
            return this;
        }
        playSingle(clip, fadeDuration = 0.15, options = {}) {
            return this.setBlendTargets([{ clip, weight: 1, playRate: options.playRate ?? 1, loop: options.loop !== false }], fadeDuration);
        }
        blendActions(clipA, clipB, alpha = 0, options = {}) {
            const t = Math.max(0, Math.min(1, Number(alpha) || 0));
            if (!clipB || clipA === clipB) return this.playSingle(clipA, options.fadeDuration ?? 0.06, { playRate: options.playRateA ?? 1, loop: options.loopA !== false });
            return this.setBlendTargets([{ clip: clipA, weight: 1 - t, playRate: options.playRateA ?? 1, loop: options.loopA !== false }, { clip: clipB, weight: t, playRate: options.playRateB ?? 1, loop: options.loopB !== false }], options.fadeDuration ?? 0.06);
        }
        applyBlendSpace1D(a, b, alpha, options = {}) {
            if (!a) return this;
            return this.blendActions(a.clip, b?.clip || a.clip, alpha, { fadeDuration: options.fadeDuration ?? 0.05, playRateA: a.playRate ?? 1, playRateB: b?.playRate ?? a.playRate ?? 1, loopA: a.loop !== false, loopB: b?.loop !== false });
        }
        applyBlendSpace2D(targets = [], options = {}) {
            return this.setBlendTargets(
                (Array.isArray(targets) ? targets : []).map(target => ({
                    clip: target.clip,
                    weight: target.weight,
                    playRate: target.playRate ?? 1,
                    loop: target.loop !== false
                })),
                options.fadeDuration ?? 0.05
            );
        }
        update(delta) {
            const dt = Math.max(0, Math.min(0.1, Number(delta) || 0));
            this.tracks.forEach((track, clip) => {
                const duration = Math.max(0, track.fadeDuration || 0);
                const alpha = duration <= 0 ? 1 : Math.min(1, dt / duration);
                track.weight += (track.targetWeight - track.weight) * alpha;
                if (Math.abs(track.targetWeight - track.weight) < 0.0005) track.weight = track.targetWeight;
                try {
                    track.action.enabled = track.weight > 0.0001 || track.targetWeight > 0;
                    if (typeof track.action.setEffectiveWeight === 'function') track.action.setEffectiveWeight(Math.max(0, Math.min(1, track.weight)));
                    else track.action.weight = Math.max(0, Math.min(1, track.weight));
                    if (typeof track.action.setEffectiveTimeScale === 'function') track.action.setEffectiveTimeScale(track.playRate || 1);
                    if (track.weight <= 0.0001 && track.targetWeight <= 0 && typeof track.action.stop === 'function') {
                        track.action.stop();
                        this.tracks.delete(clip);
                    }
                } catch (error) {
                    console.warn('[PlayerAnimationActionAdapter] update warning:', clip, error);
                }
            });
            if (this.ownsMixer && this.mixer?.update) this.mixer.update(dt);
        }
        stopAll() {
            this.tracks.forEach(track => { try { track.action?.stop?.(); } catch { } });
            this.tracks.clear();
            if (typeof this.controller?.stopAll === 'function') {
                try { this.controller.stopAll(); } catch { }
            }
        }
        debug() {
            return { root: this.root, mixer: this.mixer, ownsMixer: this.ownsMixer, actions: [...this.actions.keys()], tracks: [...this.tracks.values()].map(t => ({ clip: t.clip, weight: t.weight, targetWeight: t.targetWeight })) };
        }
    }
    window.PlayerAnimationActionAdapter = PlayerAnimationActionAdapter;
})();
