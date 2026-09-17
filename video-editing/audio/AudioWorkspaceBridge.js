/**
 * AudioWorkspaceBridge.js
 * SM Engine — Audio UI routing bridge.
 *
 * TOP Audio button -> right Audio Inspector + docked Audio Studio.
 * It no longer replaces the whole Video Editing workspace.
 */
(function (global) {
    'use strict';

    class AudioWorkspaceBridge {
        constructor() {
            this.bound = false;
            this._click = this._click.bind(this);
            this.bind();
        }

        bind() {
            if (this.bound) return;
            this.bound = true;

            document.addEventListener(
                'click',
                this._click,
                true
            );
        }

        _click(event) {
            const button =
                event.target.closest?.(
                    '#video-mode-tabs [data-mode]'
                );

            if (!button) return;

            const mode = String(
                button.dataset.mode || ''
            ).toLowerCase();

            if (mode !== 'audio') {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            global.videoInspectorSidebar
                ?.openPanel?.(
                    'audio',
                    {
                        force: true
                    }
                );

            global.ensureAudioStudioDockManager?.()
                ?.open?.({
                    tab: 'waveform'
                });
        }
    }

    global.AudioWorkspaceBridge =
        AudioWorkspaceBridge;

    if (!global.audioWorkspaceBridge) {
        global.audioWorkspaceBridge =
            new AudioWorkspaceBridge();
    }

    global.openVideoAudioStudio =
        function openVideoAudioStudio() {
            global.videoInspectorSidebar
                ?.openPanel?.(
                    'audio',
                    {
                        force: true
                    }
                );

            return global.ensureAudioStudioDockManager?.()
                ?.open?.({
                    tab: 'waveform'
                });
        };

    global.closeVideoAudioStudio =
        function closeVideoAudioStudio() {
            return global.audioStudioDockManager
                ?.close?.();
        };

})(window);