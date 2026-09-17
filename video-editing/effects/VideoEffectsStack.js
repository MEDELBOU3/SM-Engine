/**
 * VideoEffectsStack.js
 * SM Engine — persistent clip effect stack logic.
 */
(function (global) {
    'use strict';

    class VideoEffectsStack {
        constructor(library = null, project = null) {
            this.library = library || global.videoEffectsLibrary;
            this.project = project || global.videoProject || null;
            this.selectedEffectUid = null;
            this.clipboard = null;
            this.listeners = new Set();
        }

        subscribe(cb) {
            if (typeof cb !== 'function') return () => { };
            this.listeners.add(cb);
            return () => this.listeners.delete(cb);
        }

        _emit(type, detail = {}) {
            const event = { type, detail, stack: this };
            this.listeners.forEach(cb => { try { cb(event) } catch (error) { console.error('[VideoEffectsStack]', error) } });
            try { global.dispatchEvent(new CustomEvent('videoEffectsStackChanged', { detail: event })) } catch (_) { }
        }

        selectedClip() {
            const id =
                this.project?.selection?.primaryClipId ||
                global.sequencerManager?.state?.primarySelection?.id ||
                null;

            return this.project?.getClip?.(id) ||
                this.project?.timeline?.clips?.find(clip => clip.id === id) ||
                global.sequencerManager?.state?.primarySelection ||
                null;
        }

        runtimeItem(clip = this.selectedClip()) {
            if (!clip) return null;
            const mgr = global.videoEditingManager;
            return mgr?.items?.find(item =>
                item.clipId === clip.id ||
                item.id === clip.mediaRef
            ) ||
                mgr?.compositionRuntime?.itemForClip?.(clip) ||
                null;
        }

        ensure(clip = this.selectedClip()) {
            if (!clip) return [];
            if (!Array.isArray(clip.effects)) clip.effects = [];
            return clip.effects;
        }

        syncRuntime(clip = this.selectedClip()) {
            if (!clip) return;
            const item = this.runtimeItem(clip);
            if (item) item.effects = this._clone(this.ensure(clip));
            this.project?.touch?.('effects.clipStack', { clipId: clip.id, effects: this._clone(this.ensure(clip)) });
            global.videoEditingManager?.renderCanvas?.();
            global.videoEditingManager?.renderCompositeAt?.(
                global.sequencerManager?.state?.playhead ??
                global.videoEditingManager?.currentTime ??
                0
            );
        }

        add(effectId, clip = this.selectedClip()) {
            if (!clip) return null;
            const fx = this.library?.createInstance?.(effectId);
            if (!fx) return null;
            this.ensure(clip).push(fx);
            this.selectedEffectUid = fx.uid;
            this.syncRuntime(clip);
            global.veHistory?.record?.(`Add Effect: ${fx.name}`, 'effects', () => { });
            this._emit('add', { clipId: clip.id, uid: fx.uid, effectId });
            return fx;
        }

        remove(uid, clip = this.selectedClip()) {
            if (!clip) return false;
            const stack = this.ensure(clip);
            const index = stack.findIndex(fx => fx.uid === uid);
            if (index < 0) return false;
            stack.splice(index, 1);
            if (this.selectedEffectUid === uid) {
                this.selectedEffectUid = stack[Math.max(0, index - 1)]?.uid || stack[0]?.uid || null;
            }
            this.syncRuntime(clip);
            this._emit('remove', { clipId: clip.id, uid });
            return true;
        }

        duplicate(uid, clip = this.selectedClip()) {
            if (!clip) return null;
            const stack = this.ensure(clip);
            const index = stack.findIndex(fx => fx.uid === uid);
            if (index < 0) return null;
            const copy = this._clone(stack[index]);
            copy.uid = `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            copy.name = `${copy.name || this.library?.get(copy.id)?.name || 'Effect'} Copy`;
            stack.splice(index + 1, 0, copy);
            this.selectedEffectUid = copy.uid;
            this.syncRuntime(clip);
            this._emit('duplicate', { clipId: clip.id, uid, copyUid: copy.uid });
            return copy;
        }

        move(uid, toIndex, clip = this.selectedClip()) {
            if (!clip) return false;
            const stack = this.ensure(clip);
            const from = stack.findIndex(fx => fx.uid === uid);
            if (from < 0) return false;
            const target = Math.max(0, Math.min(stack.length - 1, Number(toIndex)));
            if (from === target) return true;
            const [fx] = stack.splice(from, 1);
            stack.splice(target, 0, fx);
            this.syncRuntime(clip);
            this._emit('move', { clipId: clip.id, uid, from, to: target });
            return true;
        }

        toggle(uid, clip = this.selectedClip()) {
            const fx = this.get(uid, clip);
            if (!fx) return false;
            fx.enabled = fx.enabled === false;
            this.syncRuntime(clip);
            this._emit('toggle', { uid, enabled: fx.enabled });
            return fx.enabled;
        }

        solo(uid, clip = this.selectedClip()) {
            if (!clip) return false;
            const stack = this.ensure(clip);
            const target = stack.find(fx => fx.uid === uid);
            if (!target) return false;
            const next = !target.solo;
            stack.forEach(fx => fx.solo = false);
            target.solo = next;
            this.syncRuntime(clip);
            this._emit('solo', { uid, solo: next });
            return next;
        }

        setParam(uid, key, value, clip = this.selectedClip()) {
            const fx = this.get(uid, clip);
            if (!fx) return false;
            fx.params = fx.params || {};
            fx.params[key] = value;
            this.syncRuntime(clip);
            this._emit('param', { uid, key, value });
            return true;
        }

        setMix(uid, value, clip = this.selectedClip()) {
            const fx = this.get(uid, clip);
            if (!fx) return false;
            fx.mix = Math.max(0, Math.min(1, Number(value) || 0));
            this.syncRuntime(clip);
            this._emit('mix', { uid, mix: fx.mix });
            return true;
        }

        reset(uid, clip = this.selectedClip()) {
            const fx = this.get(uid, clip);
            const def = this.library?.get(fx?.id);
            if (!fx || !def) return false;
            Object.entries(def.params || {}).forEach(([key, param]) => {
                fx.params[key] = param.def;
            });
            fx.mix = 1;
            fx.enabled = true;
            fx.solo = false;
            this.syncRuntime(clip);
            this._emit('reset', { uid });
            return true;
        }

        select(uid) {
            this.selectedEffectUid = uid || null;
            this._emit('select', { uid: this.selectedEffectUid });
        }

        selectedEffect(clip = this.selectedClip()) {
            const stack = this.ensure(clip);
            if (!stack.length) return null;
            let fx = stack.find(item => item.uid === this.selectedEffectUid);
            if (!fx) {
                fx = stack[0];
                this.selectedEffectUid = fx.uid;
            }
            return fx;
        }

        get(uid, clip = this.selectedClip()) {
            return this.ensure(clip).find(fx => fx.uid === uid) || null;
        }

        copy(uid = this.selectedEffectUid, clip = this.selectedClip()) {
            const fx = this.get(uid, clip);
            if (!fx) return false;
            this.clipboard = this._clone(fx);
            return true;
        }

        paste(clip = this.selectedClip()) {
            if (!clip || !this.clipboard) return null;
            const fx = this._clone(this.clipboard);
            fx.uid = `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            this.ensure(clip).push(fx);
            this.selectedEffectUid = fx.uid;
            this.syncRuntime(clip);
            this._emit('paste', { clipId: clip.id, uid: fx.uid });
            return fx;
        }

        _clone(value) {
            if (global.structuredClone) { try { return global.structuredClone(value) } catch (_) { } }
            return JSON.parse(JSON.stringify(value));
        }
    }

    global.VideoEffectsStack = VideoEffectsStack;

})(window);