/**
 * VideoEffectsManager.js
 * SM Engine — Effects backend compatible with existing renderer.
 *
 * Keeps legacy API:
 *   buildCanvasFilter(item, existing)
 * while using the new Effects Library + persistent Stack.
 */
(function (global) {
    'use strict';

    class VideoEffectsManager {
        constructor(library = null, stack = null) {
            this.library = library || global.videoEffectsLibrary || new global.VideoEffectsLibrary();
            this.stack = stack || new global.VideoEffectsStack(this.library, global.videoProject || null);
            this.registry = this.library.effects;
        }

        selectedClip() { return this.stack.selectedClip() }
        selectedItem() { return this.stack.runtimeItem() }

        ensure(item) {
            if (!item) return [];
            if (!Array.isArray(item.effects)) item.effects = [];
            return item.effects;
        }

        definition(id) { return this.library.get(id) }

        add(itemOrClip, id) {
            const selected = this.selectedClip();
            if (itemOrClip?.trackId || itemOrClip?.mediaRef || itemOrClip?.start != null) {
                return this.stack.add(id, itemOrClip);
            }
            if (selected) {
                return this.stack.add(id, selected);
            }
            if (itemOrClip) {
                const fx = this.library.createInstance(id);
                if (!fx) return null;
                this.ensure(itemOrClip).push(fx);
                global.videoEditingManager?.renderCanvas?.();
                return fx;
            }
            return null;
        }

        remove(itemOrClip, uid) {
            const selected = this.selectedClip();
            if (itemOrClip?.trackId || itemOrClip?.mediaRef || itemOrClip?.start != null) {
                return this.stack.remove(uid, itemOrClip);
            }
            if (selected) return this.stack.remove(uid, selected);
            if (itemOrClip) {
                itemOrClip.effects = this.ensure(itemOrClip).filter(fx => fx.uid !== uid);
                global.videoEditingManager?.renderCanvas?.();
                return true;
            }
            return false;
        }

        move(itemOrClip, uid, dir) {
            const selected = this.selectedClip();
            const clip = (itemOrClip?.trackId || itemOrClip?.mediaRef || itemOrClip?.start != null) ? itemOrClip : selected;
            if (clip) {
                const stack = this.stack.ensure(clip), index = stack.findIndex(fx => fx.uid === uid);
                return this.stack.move(uid, index + Number(dir || 0), clip);
            }
            return false;
        }

        buildCanvasFilter(item, existing = 'none') {
            const effects = this.ensure(item);
            const anySolo = effects.some(fx => fx.enabled !== false && fx.solo === true);
            const parts = [];

            if (existing && existing !== 'none') {
                parts.push(existing);
            }

            effects.forEach(fx => {
                if (fx.enabled === false) return;
                if (anySolo && fx.solo !== true) return;

                const filter = this.library.buildCssFilter(fx);
                if (filter) parts.push(filter);
            });

            return parts.length ? parts.join(' ') : 'none';
        }

        addToSelectedClip(effectId) {
            return this.stack.add(effectId);
        }

        selectedEffect() {
            return this.stack.selectedEffect();
        }

        renderPanel(container) {
            if (!container) return;
            container.innerHTML = `
   <div style="padding:8px;color:var(--text-secondary,#b0b0b0);font-size:8px;">
    Effects Studio is now dock-based.
    <button type="button" data-open-effects-studio style="display:block;margin-top:7px;height:23px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--bg-button,#363636);color:var(--text-primary,#fff);font-size:7px;">OPEN EFFECTS STUDIO</button>
   </div>`;
            container.querySelector('[data-open-effects-studio]')?.addEventListener('click', () => {
                global.ensureVideoEffectsDockManager?.()?.open?.();
            });
        }
    }

    global.VideoEffectsManager = VideoEffectsManager;
    global.videoEffectsManager = global.videoEffectsManager || new VideoEffectsManager();

})(window);