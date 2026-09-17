/**
 * VideoEffectsPresetManager.js
 * SM Engine — project-local Effects presets.
 */
(function (global) {
    'use strict';
    class VideoEffectsPresetManager {
        constructor(manager = null, project = null) {
            this.manager = manager || global.videoEffectsManager;
            this.project = project || global.videoProject || null;
            this._ensureState();
        }
        _ensureState() {
            if (!this.project?.state) return;
            this.project.state.effects = this.project.state.effects || {};
            this.project.state.effects.presets = this.project.state.effects.presets || {};
        }
        list() {
            this._ensureState();
            return Object.values(this.project?.state?.effects?.presets || {}).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        }
        saveEffect(name, fx = this.manager?.stack?.selectedEffect?.()) {
            if (!fx || !name?.trim()) return null;
            this._ensureState();
            const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const preset = { id, name: name.trim(), kind: 'effect', effect: this._clone(fx), createdAt: new Date().toISOString() };
            delete preset.effect.uid;
            this.project.state.effects.presets[id] = preset;
            this.project.touch?.('effects.preset.save', { id, name: preset.name });
            return preset;
        }
        saveStack(name, clip = this.manager?.stack?.selectedClip?.()) {
            if (!clip || !name?.trim()) return null;
            this._ensureState();
            const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const preset = { id, name: name.trim(), kind: 'stack', effects: this._clone(this.manager.stack.ensure(clip)).map(fx => { delete fx.uid; return fx }), createdAt: new Date().toISOString() };
            this.project.state.effects.presets[id] = preset;
            this.project.touch?.('effects.preset.save', { id, name: preset.name });
            return preset;
        }
        apply(id, clip = this.manager?.stack?.selectedClip?.()) {
            if (!clip) return false;
            const preset = this.project?.state?.effects?.presets?.[id]; if (!preset) return false;

            if (preset.kind === 'effect') {
                const fx = this._clone(preset.effect);
                fx.uid = `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                this.manager.stack.ensure(clip).push(fx);
                this.manager.stack.selectedEffectUid = fx.uid;
            } else {
                const copies = this._clone(preset.effects || []).map(fx => ({ ...fx, uid: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }));
                this.manager.stack.ensure(clip).push(...copies);
                this.manager.stack.selectedEffectUid = copies.at(-1)?.uid || null;
            }

            this.manager.stack.syncRuntime(clip);
            return true;
        }
        remove(id) {
            this._ensureState();
            if (!this.project.state.effects.presets[id]) return false;
            delete this.project.state.effects.presets[id];
            this.project.touch?.('effects.preset.remove', { id });
            return true;
        }
        exportPreset(id) {
            const preset = this.project?.state?.effects?.presets?.[id];
            return preset ? JSON.stringify(preset, null, 2) : null;
        }
        importPreset(json) {
            let data;
            try { data = typeof json === 'string' ? JSON.parse(json) : json } catch (_) { return null }
            if (!data?.name || !['effect', 'stack'].includes(data.kind)) return null;
            this._ensureState();
            const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            data = this._clone(data); data.id = id; data.importedAt = new Date().toISOString();
            this.project.state.effects.presets[id] = data;
            this.project.touch?.('effects.preset.import', { id, name: data.name });
            return data;
        }
        _clone(v) { if (global.structuredClone) { try { return global.structuredClone(v) } catch (_) { } } return JSON.parse(JSON.stringify(v)) }
    }
    global.VideoEffectsPresetManager = VideoEffectsPresetManager;
    global.ensureVideoEffectsPresetManager = function () { if (!global.videoEffectsPresetManager) global.videoEffectsPresetManager = new VideoEffectsPresetManager(global.videoEffectsManager, global.videoProject); return global.videoEffectsPresetManager };
})(window);