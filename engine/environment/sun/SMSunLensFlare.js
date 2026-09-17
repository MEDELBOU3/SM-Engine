// engine/environment/sun/SMSunLensFlare.js
// SM Engine — Clean Cinematic Aperture Hexagons & Pure Optical Sun Flare
(function () {
    'use strict';

    const DEFAULTS = {
        enabled: true,
        strength: 1.0,
        minOpacity: 0.015,

        // Silsila dyal les Hexagons m9ada b chkel 3ilmi w n9i bzaf
        ghosts: [
            // 1. Hexagon sghir qrib l chams (soft amber)
            { factor: 0.22, size: 36, opacity: 0.30, type: 'hex',   color: 'rgba(255, 200, 100, 0.45)', border: 'rgba(255, 230, 160, 0.3)' },
            // 2. Doyra sghira na3ma (bokeh point)
            { factor: 0.35, size: 16, opacity: 0.50, type: 'circ',  color: 'rgba(255, 240, 180, 0.7)',  border: 'none' },
            // 3. Hexagon motawassit (Orange dafi)
            { factor: 0.50, size: 62, opacity: 0.45, type: 'hex',   color: 'rgba(240, 130, 45, 0.50)',  border: 'rgba(255, 180, 90, 0.35)' },
            // 4. Hexagon sghir m3a lwan cyan/green khfif (chromatic)
            { factor: 0.68, size: 28, opacity: 0.35, type: 'hex',   color: 'rgba(120, 210, 190, 0.40)', border: 'rgba(160, 240, 220, 0.3)' },
            // 5. Hexagon kbir ra2isi (Warm Golden / Amber)
            { factor: 0.88, size: 110, opacity: 0.55, type: 'hex',  color: 'rgba(245, 110, 25, 0.55)',  border: 'rgba(255, 190, 100, 0.4)' },
            // 6. Hexagon tani kbir m-chevaucher m3ah (Deep Orange)
            { factor: 1.08, size: 130, opacity: 0.60, type: 'hex',  color: 'rgba(230, 85, 15, 0.50)',   border: 'rgba(255, 150, 70, 0.35)' },
            // 7. Bokeh da2iri na3em (Deep Warm Ruby)
            { factor: 1.35, size: 145, opacity: 0.30, type: 'bokeh', color: 'rgba(190, 60, 15, 0.35)',   border: 'none' },
            // 8. Halo daira kbira out-of-focus f l-ekher
            { factor: 1.65, size: 190, opacity: 0.20, type: 'bokeh-ring', color: 'rgba(160, 45, 10, 0.25)', border: 'none' }
        ],

        // Halo ring na3ma bzaf bla khtout
        ringSize: 340,
        // Glow d-dwa l-markazi
        sunGlowSize: 220
    };

    function clamp01(v) {
        return Math.min(1, Math.max(0, Number(v) || 0));
    }

    class SMSunLensFlare {
        constructor(options = {}) {
            this.options = { ...DEFAULTS, ...options };
            this.root = null;
            this.sunGlow = null;
            this.haloRing = null;
            this.ghostElements = [];
            this.initialized = false;
            this.visible = false;
        }

        get targetContainer() {
            const canvas = window.renderer?.domElement || window.canvas;
            return canvas?.parentElement || document.body;
        }

        init() {
            if (this.initialized && this.root?.parentElement) return true;

            const parent = this.targetContainer;
            if (!parent) return false;

            this._injectStyles();
            this._build(parent);

            this.initialized = true;
            return true;
        }

        _injectStyles() {
            if (document.getElementById('sm-sun-lens-flare-styles')) return;

            const style = document.createElement('style');
            style.id = 'sm-sun-lens-flare-styles';
            style.textContent = `
                .sm-sun-lens-root {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none !important;
                    z-index: 2; /* Ta7t UI dyal engine */
                    display: none;
                    opacity: 0;
                    overflow: hidden;
                    mix-blend-mode: screen;
                    contain: strict;
                }

                .sm-lens-el {
                    position: absolute;
                    pointer-events: none;
                    transform: translate3d(-50%, -50%, 0);
                    will-change: transform, opacity;
                }

                /* 1. Soft Smooth Sun Glow (Bla khtout mcha3kin) */
                .sm-lens-glow {
                    border-radius: 50%;
                    background: radial-gradient(
                        circle,
                        rgba(255, 255, 255, 1.0) 0%,
                        rgba(255, 240, 200, 0.8) 25%,
                        rgba(255, 180, 80, 0.3) 55%,
                        transparent 75%
                    );
                    filter: blur(4px);
                }

                /* 2. Soft Elegant Halo Ring */
                .sm-lens-halo {
                    border-radius: 50%;
                    background: radial-gradient(
                        circle,
                        transparent 62%,
                        rgba(255, 220, 160, 0.12) 66%,
                        rgba(255, 245, 215, 0.45) 70%,
                        rgba(255, 180, 90, 0.15) 74%,
                        transparent 78%
                    );
                    filter: blur(1.5px);
                }

                /* 3. True Hexagonal Aperture Blade (L-Morbba3at / Les Hexagones N9iyin) */
                .sm-ghost-hex {
                    clip-path: polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%);
                    background: radial-gradient(
                        circle at 40% 40%,
                        var(--ghost-color) 0%,
                        rgba(240, 120, 30, 0.25) 50%,
                        rgba(100, 20, 0, 0.05) 85%,
                        transparent 100%
                    );
                    border: 1px solid var(--ghost-border, transparent);
                    box-shadow: inset 0 0 14px rgba(255, 220, 140, 0.25);
                    backdrop-filter: blur(0.4px);
                }

                /* 4. Soft Bokeh Discs */
                .sm-ghost-bokeh {
                    border-radius: 50%;
                    background: radial-gradient(
                        circle,
                        var(--ghost-color) 0%,
                        rgba(210, 80, 20, 0.25) 55%,
                        transparent 75%
                    );
                    filter: blur(3.5px);
                }

                /* 5. Bokeh Ring */
                .sm-ghost-bokeh-ring {
                    border-radius: 50%;
                    background: radial-gradient(
                        circle,
                        transparent 58%,
                        var(--ghost-color) 70%,
                        transparent 82%
                    );
                    filter: blur(3px);
                }

                /* 6. Soft Sparkle Dot */
                .sm-ghost-circ {
                    border-radius: 50%;
                    background: radial-gradient(
                        circle,
                        rgba(255, 255, 255, 0.9) 0%,
                        var(--ghost-color) 45%,
                        transparent 75%
                    );
                    filter: blur(0.5px);
                }
            `;
            document.head.appendChild(style);
        }

        _build(parent) {
            if (this.root) this.root.remove();

            if (parent !== document.body && getComputedStyle(parent).position === 'static') {
                parent.style.position = 'relative';
            }

            const root = document.createElement('div');
            root.id = 'sm-sun-lens-flare-overlay';
            root.className = 'sm-sun-lens-root';

            // Sun Soft Glow
            this.sunGlow = document.createElement('div');
            this.sunGlow.className = 'sm-lens-el sm-lens-glow';
            this.sunGlow.style.width = `${this.options.sunGlowSize}px`;
            this.sunGlow.style.height = `${this.options.sunGlowSize}px`;
            root.appendChild(this.sunGlow);

            // Optical Halo Ring
            this.haloRing = document.createElement('div');
            this.haloRing.className = 'sm-lens-el sm-lens-halo';
            this.haloRing.style.width = `${this.options.ringSize}px`;
            this.haloRing.style.height = `${this.options.ringSize}px`;
            root.appendChild(this.haloRing);

            // Hexagons & Bokeh
            this.ghostElements = this.options.ghosts.map(cfg => {
                const el = document.createElement('div');
                let typeClass = 'sm-ghost-hex';
                if (cfg.type === 'circ') typeClass = 'sm-ghost-circ';
                else if (cfg.type === 'bokeh') typeClass = 'sm-ghost-bokeh';
                else if (cfg.type === 'bokeh-ring') typeClass = 'sm-ghost-bokeh-ring';

                el.className = `sm-lens-el ${typeClass}`;
                el.style.width = `${cfg.size}px`;
                el.style.height = `${cfg.size}px`;
                el.style.setProperty('--ghost-color', cfg.color);
                el.style.setProperty('--ghost-border', cfg.border || 'transparent');
                root.appendChild(el);
                return { el, cfg };
            });

            parent.appendChild(root);
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
            viewportRect = null,
            scale = 1,
            visible = true
        } = {}) {
            if (!this.initialized && !this.init()) return false;

            const amount = clamp01(intensity * this.options.strength);

            if (!this.options.enabled || !visible || amount < this.options.minOpacity || !viewportRect) {
                this.hide();
                return false;
            }

            const localX = (this.targetContainer === document.body) ? x : (x - viewportRect.left);
            const localY = (this.targetContainer === document.body) ? y : (y - viewportRect.top);

            const cx = viewportRect.width * 0.5;
            const cy = viewportRect.height * 0.5;

            // Optical Vector (Axe dyal lens)
            const dx = cx - localX;
            const dy = cy - localY;
            const angleRad = Math.atan2(dy, dx);
            const angleDeg = angleRad * (180 / Math.PI);
            const distToCenter = Math.sqrt(dx * dx + dy * dy);
            const normDist = distToCenter / (Math.max(viewportRect.width, viewportRect.height) * 0.5);

            const safeScale = Math.max(0.5, Number(scale) || 1);

            // 1. Soft Sun Glow
            this.sunGlow.style.left = `${localX}px`;
            this.sunGlow.style.top = `${localY}px`;
            this.sunGlow.style.opacity = String(Math.pow(amount, 0.9) * 0.95);
            this.sunGlow.style.transform = `translate3d(-50%, -50%, 0) scale(${safeScale * (0.85 + amount * 0.45)})`;

            // 2. Halo Ring
            this.haloRing.style.left = `${localX}px`;
            this.haloRing.style.top = `${localY}px`;
            this.haloRing.style.opacity = String(Math.pow(amount, 1.1) * 0.75);
            this.haloRing.style.transform = `translate3d(-50%, -50%, 0) scale(${safeScale * (0.9 + amount * 0.3)})`;

            // 3. Hexagons (Cubes / Polygones) Positioning & Dynamic Rotation
            this.ghostElements.forEach(({ el, cfg }) => {
                const gx = localX + dx * cfg.factor;
                const gy = localY + dy * cfg.factor;

                const ghostScale = safeScale * (0.85 + amount * 0.35 + (cfg.factor * 0.08));
                // Hexagons kay-douro b nafs l-angle dyal l-camera optics
                const rot = (cfg.type === 'hex') ? (angleDeg + 30) : 0;

                el.style.left = `${gx}px`;
                el.style.top = `${gy}px`;
                el.style.opacity = String(amount * cfg.opacity * (0.7 + normDist * 0.55));
                el.style.transform = `translate3d(-50%, -50%, 0) scale(${ghostScale}) rotate(${rot}deg)`;
            });

            this.root.style.display = 'block';
            this.root.style.opacity = String(Math.min(1, amount * 1.25));
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

    window.SMSunLensFlare = SMSunLensFlare;
    window.smSunLensFlare = window.smSunLensFlare || new SMSunLensFlare();
})();