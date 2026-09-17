// engine/environment/sun/SMSunGlare.js
// SM Engine — UE5 Cinematic Sun Glare, Blinding Corona & Sun Shafts
(function () {
    'use strict';

    const DEFAULTS = {
        enabled: true,
        strength: 1.0,
        minOpacity: 0.01,
        coreSize: 180,
        coronaSize: 650,
        shaftSize: 1100
    };

    function clamp01(v) {
        return Math.min(1, Math.max(0, Number(v) || 0));
    }

    class SMSunGlare {
        constructor(options = {}) {
            this.options = { ...DEFAULTS, ...options };
            this.root = null;
            this.core = null;
            this.corona = null;
            this.shafts = null;
            this.initialized = false;
            this.visible = false;
        }

        init() {
            if (this.initialized) return true;
            if (!document.body) return false;

            this._injectStyles();
            this._build();

            this.initialized = true;
            return true;
        }

        _injectStyles() {
            if (document.getElementById('sm-sun-glare-styles')) return;

            const style = document.createElement('style');
            style.id = 'sm-sun-glare-styles';
            style.textContent = `
                .sm-sun-glare-root {
                    position: fixed;
                    inset: 0;
                    width: 100vw;
                    height: 100vh;
                    pointer-events: none;
                    z-index: 3;
                    display: none;
                    opacity: 0;
                    overflow: hidden;
                    mix-blend-mode: screen;
                    contain: strict;
                    will-change: opacity;
                }

                .sm-glare-el {
                    position: absolute;
                    border-radius: 50%;
                    transform: translate3d(-50%, -50%, 0);
                    pointer-events: none;
                    will-change: transform, opacity;
                }

                /* 1. Blinding Ultra-Bright Core */
                .sm-glare-core {
                    background: radial-gradient(
                        circle,
                        rgba(255, 255, 255, 1.0) 0%,
                        rgba(255, 245, 220, 0.95) 22%,
                        rgba(255, 210, 130, 0.5) 45%,
                        rgba(255, 160, 60, 0.15) 70%,
                        transparent 100%
                    );
                    filter: blur(2px);
                }

                /* 2. Soft Warm Atmospheric Corona */
                .sm-glare-corona {
                    background: radial-gradient(
                        circle,
                        rgba(255, 225, 170, 0.6) 0%,
                        rgba(255, 180, 90, 0.3) 30%,
                        rgba(255, 120, 40, 0.1) 60%,
                        transparent 80%
                    );
                    filter: blur(12px);
                }

                /* 3. Radial God Rays (Sun Shafts) */
                .sm-glare-shafts {
                    background: conic-gradient(
                        from 0deg,
                        rgba(255, 240, 200, 0.18) 0deg, transparent 15deg,
                        rgba(255, 230, 180, 0.25) 30deg, transparent 48deg,
                        rgba(255, 240, 200, 0.15) 70deg, transparent 85deg,
                        rgba(255, 220, 160, 0.28) 110deg, transparent 130deg,
                        rgba(255, 240, 200, 0.18) 160deg, transparent 185deg,
                        rgba(255, 230, 180, 0.25) 210deg, transparent 235deg,
                        rgba(255, 220, 160, 0.22) 270deg, transparent 295deg,
                        rgba(255, 240, 200, 0.28) 330deg, transparent 350deg,
                        rgba(255, 240, 200, 0.18) 360deg
                    );
                    mask-image: radial-gradient(circle, rgba(0,0,0,1) 10%, rgba(0,0,0,0.5) 45%, transparent 75%);
                    -webkit-mask-image: radial-gradient(circle, rgba(0,0,0,1) 10%, rgba(0,0,0,0.5) 45%, transparent 75%);
                    filter: blur(5px);
                }
            `;
            document.head.appendChild(style);
        }

        _build() {
            const root = document.createElement('div');
            root.id = 'sm-sun-glare-overlay';
            root.className = 'sm-sun-glare-root';

            // Corona
            this.corona = document.createElement('div');
            this.corona.className = 'sm-glare-el sm-glare-corona';
            this.corona.style.width = `${this.options.coronaSize}px`;
            this.corona.style.height = `${this.options.coronaSize}px`;
            root.appendChild(this.corona);

            // Sun Shafts / Rays
            this.shafts = document.createElement('div');
            this.shafts.className = 'sm-glare-el sm-glare-shafts';
            this.shafts.style.width = `${this.options.shaftSize}px`;
            this.shafts.style.height = `${this.options.shaftSize}px`;
            root.appendChild(this.shafts);

            // Blinding Core
            this.core = document.createElement('div');
            this.core.className = 'sm-glare-el sm-glare-core';
            this.core.style.width = `${this.options.coreSize}px`;
            this.core.style.height = `${this.options.coreSize}px`;
            root.appendChild(this.core);

            document.body.appendChild(root);
            this.root = root;
        }

        setEnabled(enabled) {
            this.options.enabled = !!enabled;
            if (!enabled) this.hide();
            return this.options.enabled;
        }

        setStrength(v) {
            this.options.strength = Math.max(0, Number(v) || 0);
            return this.options.strength;
        }

        update({
            x = 0,
            y = 0,
            intensity = 0,
            color = null,
            scale = 1,
            visible = true
        } = {}) {
            if (!this.initialized && !this.init()) return false;

            const amount = clamp01(intensity * this.options.strength);

            if (!this.options.enabled || !visible || amount < this.options.minOpacity) {
                this.hide();
                return false;
            }

            const safeScale = Math.max(0.5, Number(scale) || 1);

            // 1. Core Update
            this.core.style.left = `${x}px`;
            this.core.style.top = `${y}px`;
            this.core.style.opacity = String(Math.pow(amount, 0.8) * 0.95);
            this.core.style.transform = `translate3d(-50%, -50%, 0) scale(${safeScale * (0.8 + amount * 0.6)})`;

            // 2. Corona Update
            this.corona.style.left = `${x}px`;
            this.corona.style.top = `${y}px`;
            this.corona.style.opacity = String(Math.pow(amount, 1.1) * 0.85);
            this.corona.style.transform = `translate3d(-50%, -50%, 0) scale(${safeScale * (0.9 + amount * 0.8)})`;

            // 3. Volumetric Sun Shafts / God Rays
            this.shafts.style.left = `${x}px`;
            this.shafts.style.top = `${y}px`;
            this.shafts.style.opacity = String(Math.pow(amount, 1.3) * 0.75);
            this.shafts.style.transform = `translate3d(-50%, -50%, 0) scale(${safeScale * (0.95 + amount * 0.5)}) rotate(${performance.now() * 0.003}deg)`;

            this.root.style.display = 'block';
            this.root.style.opacity = String(Math.min(1, amount * 1.3));
            this.visible = true;

            return true;
        }

        hide() {
            if (!this.root) return;
            this.root.style.opacity = '0';
            this.root.style.display = 'none';
            this.visible = false;
        }

        dispose() {
            this.root?.remove?.();
            this.root = null;
            this.initialized = false;
            this.visible = false;
        }
    }

    window.SMSunGlare = SMSunGlare;
    window.smSunGlare = window.smSunGlare || new SMSunGlare();
})();