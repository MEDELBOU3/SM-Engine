(function (global) {
    'use strict';

    class SMAntiAliasing {
        constructor(options = {}) {
            this.mode = String(options.mode || 'auto').toLowerCase();
            this.activeMode = 'none';
            this.enabled = options.enabled !== false;
            this.pass = null;
            this.width = 1;
            this.height = 1;
            this.pixelRatio = 1;
        }

        create(width, height, pixelRatio = 1) {
            this.width = Math.max(1, width | 0);
            this.height = Math.max(1, height | 0);
            this.pixelRatio = Math.max(0.1, Number(pixelRatio) || 1);

            const physicalWidth = Math.max(1, Math.round(this.width * this.pixelRatio));
            const physicalHeight = Math.max(1, Math.round(this.height * this.pixelRatio));

            if (
                (this.mode === 'auto' || this.mode === 'smaa') &&
                typeof THREE.SMAAPass === 'function'
            ) {
                this.pass = new THREE.SMAAPass(physicalWidth, physicalHeight);
                this.activeMode = 'smaa';
                this.pass.enabled = this.enabled;
                return this.pass;
            }

            if (
                (this.mode === 'auto' || this.mode === 'fxaa' || this.mode === 'smaa') &&
                typeof THREE.ShaderPass !== 'undefined' &&
                typeof THREE.FXAAShader !== 'undefined'
            ) {
                this.pass = new THREE.ShaderPass(THREE.FXAAShader);
                this.activeMode = 'fxaa';
                this.pass.enabled = this.enabled;
                this._updateResolution();
                return this.pass;
            }

            this.activeMode = 'none';
            console.warn(`[SMAntiAliasing] Mode "${this.mode}" is unavailable.`);
            return null;
        }

        _updateResolution() {
            if (this.activeMode !== 'fxaa') return;
            const resolution = this.pass?.material?.uniforms?.resolution?.value;
            resolution?.set?.(
                1 / Math.max(1, this.width * this.pixelRatio),
                1 / Math.max(1, this.height * this.pixelRatio)
            );
        }

        setSize(width, height, pixelRatio = this.pixelRatio) {
            this.width = Math.max(1, width | 0);
            this.height = Math.max(1, height | 0);
            this.pixelRatio = Math.max(0.1, Number(pixelRatio) || 1);

            if (this.activeMode === 'smaa') {
                this.pass?.setSize?.(
                    Math.max(1, Math.round(this.width * this.pixelRatio)),
                    Math.max(1, Math.round(this.height * this.pixelRatio))
                );
            } else {
                this._updateResolution();
            }
            return this;
        }

        setEnabled(enabled) {
            this.enabled = !!enabled;
            if (this.pass) this.pass.enabled = this.enabled;
            return this;
        }

        diagnostics() {
            return {
                requestedMode: this.mode,
                activeMode: this.activeMode,
                enabled: this.enabled,
                width: this.width,
                height: this.height,
                pixelRatio: this.pixelRatio
            };
        }

        dispose() {
            this.pass?.dispose?.();
            this.pass = null;
            this.activeMode = 'none';
        }
    }

    global.SMAntiAliasing = SMAntiAliasing;
})(window);
