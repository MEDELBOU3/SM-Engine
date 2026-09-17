class SMPlayerAnimationController {
    constructor(model, loader, config = window.SMPlayerConfig) {
        this.model = model;
        this.loader = loader;
        this.config = config;
        this.mixer = new THREE.AnimationMixer(model);
        this.actions = new Map();
        this.currentKey = null;
        this.currentAction = null;
        this.enabled = true;
        this._buildActions();
    }
    _buildActions() {
        this.actions.clear();
        for (const [key, clip] of this.loader.clips.entries()) {
            if (!clip) continue;
            const definition =
                window.SMPlayerAnimationManifest?.[key] ||
                {};
            const action = this.mixer.clipAction(clip);
            const shouldLoop =
                key !== 'FIRE' &&
                definition.loop !== false;
            action.enabled = true;
            action.clampWhenFinished = !shouldLoop;
            action.setLoop(
                shouldLoop
                    ? THREE.LoopRepeat
                    : THREE.LoopOnce,
                shouldLoop
                    ? Infinity
                    : 1
            );
            action.setEffectiveWeight(1);
            action.setEffectiveTimeScale(
                definition.timeScale ?? 1
            );
            this.actions.set(
                key,
                action
            );
            console.log('[PlayerAnimationController] Action ready:', {
                key,
                duration: clip.duration,
                tracks: clip.tracks.length,
                loop: shouldLoop
            });
        }
    }
    has(key) {
        return this.actions.has(key);
    }
    _isLooping(key) {
        const definition = window.SMPlayerAnimationManifest?.[key] || {};
        return key !== 'FIRE' && definition.loop !== false;
    }
    play(key, {
        fade = this.config.animationFade ?? 0.18,
        restart = false,
        warp = false,
        syncPhase = true,
        timeScale = null
    } = {}) {
        if (!this.enabled) return null;
        const next = this.actions.get(key);
        if (!next) {
            console.warn(
                `[PlayerAnimationController] Missing action: ${key}`
            );
            return null;
        }
        if (
            this.currentAction === next &&
            !restart
        ) {
            return next;
        }
        const previous = this.currentAction;
        const previousKey = this.currentKey;
        const previousDuration = Number(previous?.getClip?.()?.duration || 0);
        const previousPhase = previousDuration > 0
            ? ((previous.time % previousDuration) + previousDuration) % previousDuration / previousDuration
            : 0;
        next.enabled = true;
        next.stopFading?.();
        next.stopWarping?.();
        next.setEffectiveWeight(1);
        next.setEffectiveTimeScale(
            Number(timeScale ?? window.SMPlayerAnimationManifest?.[key]?.timeScale ?? 1)
        );
        next.reset();
        if (
            syncPhase &&
            !restart &&
            previous &&
            previous !== next &&
            this._isLooping(previousKey) &&
            this._isLooping(key)
        ) {
            next.time = previousPhase * Number(next.getClip?.()?.duration || 0);
        }
        next.play();
        if (
            previous &&
            previous !== next
        ) {
            next.crossFadeFrom(
                previous,
                Math.max(0.02, Number(fade) || 0.02),
                warp === true
            );
        }
        this.currentKey = key;
        this.currentAction = next;
        console.log(
            `[PlayerAnimationController] PLAY ${key}`,
            {
                duration: next.getClip().duration,
                timeScale: next.timeScale,
                weight: next.getEffectiveWeight()
            }
        );
        return next;
    }
    playOneShot(key, {
        fade = 0.12,
        timeScale = null,
        warp = false
    } = {}) {
        return this.play(
            key,
            {
                fade,
                restart: true,
                syncPhase: false,
                timeScale,
                warp
            }
        );
    }
    stopCurrent(fade = this.config.animationFade ?? 0.18) {
        if (!this.currentAction) return;
        this.currentAction.fadeOut(fade);
        this.currentAction = null;
        this.currentKey = null;
    }
    stopAll() {
        this.mixer.stopAllAction();
        this.currentAction = null;
        this.currentKey = null;
    }
    update(delta) {
        if (!this.enabled) return;
        if (!Number.isFinite(delta) || delta <= 0) return;
        this.mixer.update(delta);
    }
    setEnabled(enabled) {
        const state = !!enabled;
        this.enabled = state;
        if (!state) {
            this.stopAll();
        }
    }
    dispose() {
        this.stopAll();
        this.mixer.uncacheRoot(
            this.model
        );
        this.actions.clear();
    }
}
window.SMPlayerAnimationController = SMPlayerAnimationController;
